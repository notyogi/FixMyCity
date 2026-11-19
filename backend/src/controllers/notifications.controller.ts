import { Request, Response } from 'express';
import { NotificationService, NotificationNotFoundError } from '../services/notification.service';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from '../validation/notification.validation';

/**
 * 1. getNotifications(req, res)
 * GET /api/v1/notifications?unread_only=true&page=1&limit=20
 * Returns { data, page, limit, total, unread_count } scoped to req.user.id
 */
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: User identity not found' });
      return;
    }

    const validation = listNotificationsQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: validation.error.issues,
      });
      return;
    }

    const result = await NotificationService.listForUser(userId, {
      unreadOnly: validation.data.unread_only,
      page: validation.data.page,
      limit: validation.data.limit,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getNotifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 2. getUnreadNotificationCount(req, res)
 * GET /api/v1/notifications/unread-count
 * Returns { unread_count } scoped to req.user.id
 */
export const getUnreadNotificationCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: User identity not found' });
      return;
    }

    const count = await NotificationService.unreadCount(userId);
    res.status(200).json({ unread_count: count });
  } catch (error) {
    console.error('Error in getUnreadNotificationCount:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 3. markNotificationAsRead(req, res)
 * PATCH /api/v1/notifications/:id/read
 * Marks single notification as read if it belongs to req.user.id and is unread; 404 otherwise.
 */
export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: User identity not found' });
      return;
    }

    const paramValidation = notificationIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      res.status(400).json({
        error: 'Invalid notification ID',
        details: paramValidation.error.issues,
      });
      return;
    }

    try {
      const updated = await NotificationService.markRead(userId, paramValidation.data.id);
      res.status(200).json({
        success: true,
        notification: updated,
      });
    } catch (err) {
      if (err instanceof NotificationNotFoundError || (err as any)?.statusCode === 404) {
        res.status(404).json({ error: 'Notification not found or already read' });
        return;
      }
      throw err;
    }
  } catch (error) {
    console.error('Error in markNotificationAsRead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 4. markAllNotificationsAsRead(req, res)
 * POST /api/v1/notifications/read-all
 * Marks all unread notifications for req.user.id as read.
 */
export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: User identity not found' });
      return;
    }

    const result = await NotificationService.markAllRead(userId);
    res.status(200).json({ updated_count: result.updated_count });
  } catch (error) {
    console.error('Error in markAllNotificationsAsRead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
