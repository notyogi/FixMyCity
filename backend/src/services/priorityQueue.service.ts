import { Prisma, Report, ReportCluster, ReportStatus, Severity, IssueType } from '@prisma/client';
import prisma from '../utils/prisma';
import { PriorityQueueQuery } from '../validation/report.validation';
import { recomputeAllPriorityScores } from './priority.service';
import { SEVERITY_VALUES } from '../config/priority.config';

export interface QueueItemRepresentativeReport {
  id: string;
  image_url: string;
  notes: string | null;
  created_at: Date;
}

export interface QueueItem {
  cluster_id: string;
  priority_score: number;
  confirmation_count: number;
  report_count: number;
  max_severity: Severity;
  issue_type: IssueType;
  status: ReportStatus;
  near_sensitive_location: boolean;
  centroid: {
    lat: number;
    lng: number;
  };
  days_open: number;
  oldest_report_created_at: Date;
  representative_report: QueueItemRepresentativeReport;
}

export interface PriorityQueueMeta {
  unclustered_active_reports: number;
  scores_refreshed_at: string;
}

export interface PriorityQueueResult {
  data: QueueItem[];
  page: number;
  limit: number;
  total: number;
  meta: PriorityQueueMeta;
}

export type ReportClusterWithReports = ReportCluster & {
  reports: Report[];
};

// Severity progression used for min_severity filtering (LOW < MEDIUM < HIGH < CRITICAL)
const SEVERITY_HIERARCHY: Severity[] = [
  Severity.LOW,
  Severity.MEDIUM,
  Severity.HIGH,
  Severity.CRITICAL,
];

export function getSeveritiesAtOrAbove(minSeverity: Severity): Severity[] {
  const index = SEVERITY_HIERARCHY.indexOf(minSeverity);
  if (index === -1) return SEVERITY_HIERARCHY;
  return SEVERITY_HIERARCHY.slice(index);
}

// Active report status progression: SUBMITTED < UNDER_REVIEW < SCHEDULED
const STATUS_PRECEDENCE: Record<ReportStatus, number> = {
  [ReportStatus.REJECTED]: 0,
  [ReportStatus.SUBMITTED]: 1,
  [ReportStatus.UNDER_REVIEW]: 2,
  [ReportStatus.SCHEDULED]: 3,
  [ReportStatus.FIXED]: 4,
};

/**
 * Builds a QueueItem from a cluster and its loaded reports in memory.
 */
export function buildQueueItem(cluster: ReportClusterWithReports): QueueItem {
  const reports = cluster.reports;

  // If reports array is empty (fallback safeguard)
  if (!reports || reports.length === 0) {
    return {
      cluster_id: cluster.id,
      priority_score: cluster.priority_score,
      confirmation_count: cluster.confirmation_count,
      report_count: 0,
      max_severity: Severity.LOW,
      issue_type: IssueType.OTHER,
      status: ReportStatus.SUBMITTED,
      near_sensitive_location: false,
      centroid: {
        lat: cluster.centroid_lat,
        lng: cluster.centroid_lng,
      },
      days_open: 0,
      oldest_report_created_at: cluster.created_at,
      representative_report: {
        id: '',
        image_url: '',
        notes: null,
        created_at: cluster.created_at,
      },
    };
  }

  // 1. Max Severity among reports
  let maxSeverity: Severity = Severity.LOW;
  let maxSeverityVal = 0;
  for (const report of reports) {
    const val = SEVERITY_VALUES[report.severity] ?? 0;
    if (val > maxSeverityVal) {
      maxSeverityVal = val;
      maxSeverity = report.severity;
    }
  }

  // 2. Issue Type: most common among its reports
  const countMap = new Map<IssueType, number>();
  for (const report of reports) {
    countMap.set(report.issue_type, (countMap.get(report.issue_type) || 0) + 1);
  }
  let mostCommonIssueType: IssueType = reports[0].issue_type;
  let highestCount = 0;
  for (const [type, count] of countMap.entries()) {
    if (count > highestCount) {
      highestCount = count;
      mostCommonIssueType = type;
    }
  }

  // 3. Status: most advanced status among active reports (order: SUBMITTED < UNDER_REVIEW < SCHEDULED)
  const activeReports = reports.filter(
    (r) => r.status !== ReportStatus.FIXED && r.status !== ReportStatus.REJECTED
  );
  const statusPool = activeReports.length > 0 ? activeReports : reports;

  let mostAdvancedStatus = statusPool[0].status;
  let highestStatusRank = STATUS_PRECEDENCE[mostAdvancedStatus] ?? 0;
  for (const report of statusPool) {
    const rank = STATUS_PRECEDENCE[report.status] ?? 0;
    if (rank > highestStatusRank) {
      highestStatusRank = rank;
      mostAdvancedStatus = report.status;
    }
  }

  // 4. Near sensitive location: true if ANY active report has it
  const nearSensitiveLocation = statusPool.some((r) => r.near_sensitive_location);

  // 5. Oldest report created_at & uncapped days_open (display data)
  const oldestReportCreatedAt = statusPool.reduce(
    (earliest, r) => (r.created_at < earliest ? r.created_at : earliest),
    statusPool[0].created_at
  );
  const nowMs = Date.now();
  const diffMs = nowMs - oldestReportCreatedAt.getTime();
  const daysOpen = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

  // 6. Representative report: highest-severity report, ties broken by earliest created_at
  const sortedReports = [...statusPool].sort((a, b) => {
    const sevA = SEVERITY_VALUES[a.severity] ?? 0;
    const sevB = SEVERITY_VALUES[b.severity] ?? 0;
    if (sevB !== sevA) {
      return sevB - sevA; // highest severity first
    }
    return a.created_at.getTime() - b.created_at.getTime(); // earliest created_at first
  });
  const rep = sortedReports[0];

  return {
    cluster_id: cluster.id,
    priority_score: cluster.priority_score,
    confirmation_count: cluster.confirmation_count,
    report_count: reports.length,
    max_severity: maxSeverity,
    issue_type: mostCommonIssueType,
    status: mostAdvancedStatus,
    near_sensitive_location: nearSensitiveLocation,
    centroid: {
      lat: cluster.centroid_lat,
      lng: cluster.centroid_lng,
    },
    days_open: daysOpen,
    oldest_report_created_at: oldestReportCreatedAt,
    representative_report: {
      id: rep.id,
      image_url: rep.image_url,
      notes: rep.notes,
      created_at: rep.created_at,
    },
  };
}

// ============================================================================
// TASK 3: SCORE FRESHNESS & CONCURRENCY GUARD
// ============================================================================

let lastRecomputeAt: Date | null = null;
let inProgressRecompute: Promise<void> | null = null;

export function getLastRecomputeAt(): Date | null {
  return lastRecomputeAt;
}

export function setLastRecomputeAt(date: Date | null): void {
  lastRecomputeAt = date;
}

function getPriorityRefreshMinutes(): number {
  const envVal = process.env.PRIORITY_REFRESH_MINUTES;
  if (envVal !== undefined && envVal.trim() !== '') {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 15;
}

/**
 * Ensures priority scores are up-to-date before serving queries.
 *
 * Stored scores go stale because days_open changes daily.
 * If scores have not been refreshed in the last PRIORITY_REFRESH_MINUTES (default 15),
 * recomputeAllPriorityScores() is executed.
 *
 * Concurrency guard: Simultaneous incoming requests share the same in-flight Promise
 * rather than triggering duplicate batch updates.
 *
 * NOTE: For larger production datasets, score recomputation should be offloaded to a
 * scheduled background worker or cron job (e.g. nightly or hourly) instead of executing
 * on-demand within the API request lifecycle.
 */
async function ensureScoresFresh(): Promise<void> {
  const refreshMinutes = getPriorityRefreshMinutes();
  const refreshIntervalMs = refreshMinutes * 60 * 1000;
  const now = Date.now();

  const isStale = !lastRecomputeAt || (now - lastRecomputeAt.getTime() >= refreshIntervalMs);

  if (!isStale) {
    return;
  }

  // If a recompute is already in flight, reuse the same promise to prevent duplicate workload
  if (inProgressRecompute) {
    try {
      await inProgressRecompute;
    } catch {
      // Caught inside the promise creation handler
    }
    return;
  }

  inProgressRecompute = (async () => {
    try {
      await recomputeAllPriorityScores();
      lastRecomputeAt = new Date();
    } catch (err) {
      // If recomputation fails, log the error and continue serving existing scores
      console.error(
        '[PriorityQueue] Background score recomputation failed, serving existing scores:',
        err instanceof Error ? err.message : err
      );
    } finally {
      inProgressRecompute = null;
    }
  })();

  await inProgressRecompute;
}

// ============================================================================
// TASK 2: QUEUE SERVICE
// ============================================================================

export class PriorityQueueService {
  /**
   * Fetches clusters ranked by priority_score with stable tie-breaking,
   * comprehensive filtering, pagination, and active report metadata.
   */
  static async getPriorityQueue(
    filters: Partial<PriorityQueueQuery> = {}
  ): Promise<PriorityQueueResult> {
    // 1. Ensure score freshness before reading
    await ensureScoresFresh();

    const {
      status,
      issue_type,
      min_severity,
      near_sensitive_location,
      include_closed = false,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;

    // 2. Build Prisma where clause on ReportCluster
    const andConditions: Prisma.ReportClusterWhereInput[] = [];

    // When include_closed is false, exclude clusters where every report is FIXED or REJECTED
    if (!include_closed) {
      andConditions.push({
        reports: {
          some: {
            status: { notIn: [ReportStatus.FIXED, ReportStatus.REJECTED] },
          },
        },
      });
    }

    // Filter by status of the cluster's active reports
    if (status) {
      if (!include_closed && (status === ReportStatus.FIXED || status === ReportStatus.REJECTED)) {
        // If include_closed is false, closed statuses (FIXED/REJECTED) cannot match active reports
        andConditions.push({
          reports: {
            some: {
              status: { in: [] }, // impossible match produces empty set
            },
          },
        });
      } else {
        andConditions.push({
          reports: {
            some: {
              status,
            },
          },
        });
      }
    }

    // Filter by issue_type
    if (issue_type) {
      andConditions.push({
        reports: {
          some: {
            issue_type,
            ...(include_closed ? {} : { status: { notIn: [ReportStatus.FIXED, ReportStatus.REJECTED] } }),
          },
        },
      });
    }

    // Filter by min_severity
    if (min_severity) {
      const allowedSeverities = getSeveritiesAtOrAbove(min_severity);
      andConditions.push({
        reports: {
          some: {
            severity: { in: allowedSeverities },
            ...(include_closed ? {} : { status: { notIn: [ReportStatus.FIXED, ReportStatus.REJECTED] } }),
          },
        },
      });
    }

    // Filter by near_sensitive_location
    if (near_sensitive_location !== undefined) {
      if (near_sensitive_location === true) {
        andConditions.push({
          reports: {
            some: {
              near_sensitive_location: true,
              ...(include_closed ? {} : { status: { notIn: [ReportStatus.FIXED, ReportStatus.REJECTED] } }),
            },
          },
        });
      } else {
        andConditions.push({
          reports: {
            none: {
              near_sensitive_location: true,
              ...(include_closed ? {} : { status: { notIn: [ReportStatus.FIXED, ReportStatus.REJECTED] } }),
            },
          },
        });
      }
    }

    const where: Prisma.ReportClusterWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    // 3. Fetch clusters and their active reports in a single query to eliminate N+1 overhead
    const [clusters, total, unclusteredCount] = await Promise.all([
      prisma.reportCluster.findMany({
        where,
        orderBy: [
          { priority_score: 'desc' },
          { created_at: 'asc' },
          { id: 'asc' },
        ],
        skip,
        take: limit,
        include: {
          reports: {
            where: include_closed
              ? undefined
              : {
                  status: {
                    notIn: [ReportStatus.FIXED, ReportStatus.REJECTED],
                  },
                },
            orderBy: { created_at: 'asc' },
          },
        },
      }),
      prisma.reportCluster.count({ where }),
      prisma.report.count({
        where: {
          cluster_id: null,
          status: {
            notIn: [ReportStatus.FIXED, ReportStatus.REJECTED],
          },
        },
      }),
    ]);

    // 4. Transform clusters into QueueItems in memory
    const data: QueueItem[] = clusters.map((cluster) =>
      buildQueueItem(cluster as ReportClusterWithReports)
    );

    return {
      data,
      page,
      limit,
      total,
      meta: {
        unclustered_active_reports: unclusteredCount,
        scores_refreshed_at: lastRecomputeAt ? lastRecomputeAt.toISOString() : 'never',
      },
    };
  }
}
