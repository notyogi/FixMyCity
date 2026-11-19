import { IssueType, NotificationType, Prisma, ReportStatus } from '@prisma/client';
import prisma from '../utils/prisma';
import {
  getReadableIssueLabel,
  STATUS_NOTIFICATION_TEMPLATES,
} from '../config/notificationTemplates';

export interface ReportStatusChangeItem {
  reportId: string;
  clusterId?: string | null;
  reporterId: string;
  issueType: IssueType;
  oldStatus: ReportStatus | null;
  newStatus: ReportStatus;
  createdAt?: Date;
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

export class NotificationNotFoundError extends Error {
  statusCode: number = 404;
  constructor(message = 'Notification not found or already read') {
    super(message);
    this.name = 'NotificationNotFoundError';
  }
}

export class NotificationService {
  /**
   * createStatusNotifications(changes, adminUserId)
   * Groups by reporter so a citizen with multiple reports in the same cluster receives
   * exactly ONE notification per cluster per status change, linked to their earliest report.
   *
   * Availability over completeness: wrapped in try/catch, logs failures, never throws to caller.
   * Idempotent: protected by dedupe_key `${userId}:${clusterId ?? reportId}:${newStatus}` and skipDuplicates.
   */
  static async createStatusNotifications(
    changes: ReportStatusChangeItem[],
    adminUserId?: string
  ): Promise<number> {
    try {
      if (!changes || changes.length === 0) {
        return 0;
      }

      // 1. Filter out no-op changes (oldStatus === newStatus)
      // 2. Filter out reports reported by the acting admin
      const validChanges = changes.filter((change) => {
        if (change.oldStatus === change.newStatus) {
          return false;
        }
        if (adminUserId && change.reporterId === adminUserId) {
          return false;
        }
        return Boolean(STATUS_NOTIFICATION_TEMPLATES[change.newStatus]);
      });

      if (validChanges.length === 0) {
        return 0;
      }

      // 3. Group by reporter
      const byReporter = new Map<string, ReportStatusChangeItem[]>();
      for (const item of validChanges) {
        const reporterId = item.reporterId;
        if (!byReporter.has(reporterId)) {
          byReporter.set(reporterId, []);
        }
        byReporter.get(reporterId)!.push(item);
      }

      const notificationsToCreate: Prisma.NotificationCreateManyInput[] = [];

      for (const [userId, userItems] of byReporter.entries()) {
        // Group by cluster (or reportId if not clustered)
        const byCluster = new Map<string, ReportStatusChangeItem[]>();
        for (const item of userItems) {
          const groupKey = item.clusterId || item.reportId;
          if (!byCluster.has(groupKey)) {
            byCluster.set(groupKey, []);
          }
          byCluster.get(groupKey)!.push(item);
        }

        for (const [groupKey, clusterItems] of byCluster.entries()) {
          // Sort to find the earliest report
          clusterItems.sort((a, b) => {
            const timeA = a.createdAt ? a.createdAt.getTime() : 0;
            const timeB = b.createdAt ? b.createdAt.getTime() : 0;
            if (timeA !== timeB) {
              return timeA - timeB;
            }
            return a.reportId.localeCompare(b.reportId);
          });

          const earliest = clusterItems[0];
          const template = STATUS_NOTIFICATION_TEMPLATES[earliest.newStatus];
          if (!template) {
            continue;
          }

          const readableIssue = getReadableIssueLabel(earliest.issueType);
          const dedupeKey = `${userId}:${earliest.clusterId ?? earliest.reportId}:${earliest.newStatus}`;

          notificationsToCreate.push({
            user_id: userId,
            report_id: earliest.reportId,
            cluster_id: earliest.clusterId || null,
            type: NotificationType.STATUS_CHANGED,
            title: template.title,
            body: template.body(readableIssue),
            old_status: earliest.oldStatus,
            new_status: earliest.newStatus,
            dedupe_key: dedupeKey,
          });
        }
      }

      if (notificationsToCreate.length === 0) {
        return 0;
      }

      const result = await prisma.notification.createMany({
        data: notificationsToCreate,
        skipDuplicates: true,
      });

      return result.count;
    } catch (error) {
      console.error(
        '[NotificationService.createStatusNotifications] Failed to create notifications (non-blocking):',
        error instanceof Error ? error.message : error
      );
      return 0;
    }
  }

  /**
   * listForUser(userId, options)
   * Returns paginated notifications newest first with total and unread_count.
   */
  static async listForUser(
    userId: string,
    options: ListNotificationsOptions = {}
  ): Promise<{
    data: any[];
    page: number;
    limit: number;
    total: number;
    unread_count: number;
  }> {
    const rawPage = options.page ?? 1;
    const page = Math.max(1, rawPage);
    const rawLimit = options.limit ?? 20;
    const limit = Math.min(50, Math.max(1, rawLimit));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      user_id: userId,
      ...(options.unreadOnly ? { read_at: null } : {}),
    };

    const [data, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { user_id: userId, read_at: null },
      }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      unread_count: unreadCount,
    };
  }

  /**
   * unreadCount(userId)
   * Lightweight count of unread notifications for polling/badge counts.
   */
  static async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        user_id: userId,
        read_at: null,
      },
    });
  }

  /**
   * markRead(userId, notificationId)
   * Marks a single notification as read if it belongs to the user and is unread.
   * Throws 404 otherwise.
   */
  static async markRead(userId: string, notificationId: string) {
    const updateResult = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        user_id: userId,
        read_at: null,
      },
      data: {
        read_at: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new NotificationNotFoundError();
    }

    return prisma.notification.findFirst({
      where: {
        id: notificationId,
        user_id: userId,
      },
    });
  }

  /**
   * markAllRead(userId)
   * Marks all unread notifications for a citizen as read.
   */
  static async markAllRead(userId: string): Promise<{ updated_count: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        user_id: userId,
        read_at: null,
      },
      data: {
        read_at: new Date(),
      },
    });

    return { updated_count: result.count };
  }
}
