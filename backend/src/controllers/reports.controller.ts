import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import {
  createReportSchema,
  updateStatusSchema,
  listReportsQuerySchema,
  priorityQueueQuerySchema,
} from '../validation/report.validation';
import { ReportStatus, Severity, IssueType, Prisma, ReputationReason, ReputationEvent } from '@prisma/client';
import { ImageHashService } from '../services/imageHash.service';
import {
  ClusteringService,
  ClusteringException,
  ClusterAssignmentResult,
} from '../services/clustering.service';
import { recomputeClusterPriority } from '../services/priority.service';
import { PriorityQueueService } from '../services/priorityQueue.service';
import { ReputationService, ReputationEventInput } from '../services/reputation.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApplyReputationFn = (
  tx: Prisma.TransactionClient,
  events: ReputationEventInput[]
) => Promise<ReputationEvent[]>;

export function buildStatusChangeReputationEvents(
  changedReports: Array<{ id: string; user_id: string }>,
  targetStatus: ReportStatus,
  spam?: boolean
): ReputationEventInput[] {
  if (changedReports.length === 0) {
    return [];
  }

  if (targetStatus === ReportStatus.FIXED) {
    return changedReports.map((r) => ({
      userId: r.user_id,
      reportId: r.id,
      reason: ReputationReason.REPORT_FIXED,
    }));
  }

  if (targetStatus === ReportStatus.REJECTED) {
    // Default to spam=true when omitted so existing clients preserve spam penalty behavior
    const isSpam = spam !== undefined ? spam : true;
    if (!isSpam) {
      return [];
    }

    return changedReports.map((r) => ({
      userId: r.user_id,
      reportId: r.id,
      reason: ReputationReason.REPORT_REJECTED_SPAM,
    }));
  }

  return [];
}

/**
 * TRANSACTION DESIGN CHOICE (Two Sequential Short Transactions):
 * In PostgreSQL, if a SQL statement inside `prisma.$transaction` throws (even when caught
 * in JS), Postgres puts that transaction in an aborted state (`25P02`) and prevents committing
 * the surrounding status update unless explicit SAVEPOINTs are managed.
 *
 * To guarantee that:
 *   1) All reputation_events inserts + user reputation_score increments commit or roll back atomically together, AND
 *   2) A failure in reputation processing NEVER rolls back or blocks the report status change,
 * we commit the status update atomically in Transaction 1 (using `updateManyAndReturn` with row locks so
 * already-closed reports and losing concurrent requests are never double-counted), and then immediately
 * run `applyReputationEvents` in Transaction 2 wrapped in try/catch. Any missed events on failure remain
 * idempotently recoverable via backfill or retry thanks to unique `dedupe_key`.
 */
export async function performSingleReportStatusUpdate(params: {
  reportId: string;
  targetStatus: ReportStatus;
  spam?: boolean;
  applyReputationFn?: ApplyReputationFn;
}): Promise<{
  changedReports: Array<{ id: string; user_id: string }>;
  reputationChanges: number;
}> {
  const {
    reportId,
    targetStatus,
    spam,
    applyReputationFn = ReputationService.applyReputationEvents,
  } = params;

  const changedReports = await prisma.$transaction(async (tx) => {
    return tx.report.updateManyAndReturn({
      where: {
        id: reportId,
        status: {
          notIn: [ReportStatus.FIXED, ReportStatus.REJECTED],
          not: targetStatus,
        },
      },
      data: { status: targetStatus },
      select: { id: true, user_id: true },
    });
  });

  const reputationEvents = buildStatusChangeReputationEvents(changedReports, targetStatus, spam);
  let reputationChanges = 0;

  if (reputationEvents.length > 0) {
    try {
      const applied = await prisma.$transaction((tx) =>
        applyReputationFn(tx, reputationEvents)
      );
      reputationChanges = new Set(
        applied.filter((e) => e.delta !== 0).map((e) => e.user_id)
      ).size;
    } catch (repError) {
      console.error(
        `[updateReportStatus] Reputation update failed for report ${reportId} (status update was committed):`,
        repError instanceof Error ? repError.message : repError
      );
    }
  }

  return { changedReports, reputationChanges };
}

export async function performClusterStatusUpdate(params: {
  clusterId: string;
  targetStatus: ReportStatus;
  spam?: boolean;
  applyReputationFn?: ApplyReputationFn;
}): Promise<{
  changedReports: Array<{ id: string; user_id: string }>;
  reputationChanges: number;
}> {
  const {
    clusterId,
    targetStatus,
    spam,
    applyReputationFn = ReputationService.applyReputationEvents,
  } = params;

  // Transaction 1: Atomically transition only active (non-closed) reports in the cluster
  const changedReports = await prisma.$transaction(async (tx) => {
    return tx.report.updateManyAndReturn({
      where: {
        cluster_id: clusterId,
        status: {
          notIn: [ReportStatus.FIXED, ReportStatus.REJECTED],
        },
      },
      data: {
        status: targetStatus,
      },
      select: {
        id: true,
        user_id: true,
      },
    });
  });

  // Transaction 2: Apply reputation events atomically inside a short transaction right after commit.
  // Wrapped so a reputation error is logged and never fails or rolls back the committed status update.
  const reputationEvents = buildStatusChangeReputationEvents(changedReports, targetStatus, spam);
  let reputationChanges = 0;

  if (reputationEvents.length > 0) {
    try {
      const applied = await prisma.$transaction((tx) =>
        applyReputationFn(tx, reputationEvents)
      );
      reputationChanges = new Set(
        applied.filter((e) => e.delta !== 0).map((e) => e.user_id)
      ).size;
    } catch (repError) {
      console.error(
        `[updateClusterStatus] Reputation update failed for cluster ${clusterId} (status update was committed):`,
        repError instanceof Error ? repError.message : repError
      );
    }
  }

  return { changedReports, reputationChanges };
}

/**
 * 1. createReport(req, res)
 * Validates request body, creates report row with authenticated user ID, defaults status to SUBMITTED.
 */
export const createReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = createReportSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues,
      });
      return;
    }

    if (!req.user || !req.user.id) {
      res.status(401).json({
        error: 'Unauthorized: User identity not found',
      });
      return;
    }

    const userId = req.user.id;

    // Ensure user row exists in public.users to satisfy foreign key constraint
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: req.user.email || `${userId}@fixmycity.local`,
        name: req.user.name || null,
      },
    });

    // Compute perceptual hash (pHash) server-side for future duplicate detection.
    // Intentional design choice: Availability over completeness. If remote image fetching
    // or pHash computation encounters an error or timeout, log the failure but proceed
    // with creating the Report row with image_hash set to null so that a hashing hiccup
    // never blocks a citizen from successfully submitting a civic damage report.
    let imageHash: string | null = null;
    try {
      imageHash = await ImageHashService.computePerceptualHash(validation.data.image_url);
    } catch (hashError) {
      console.error(
        `[createReport] Failed to compute image pHash for ${validation.data.image_url}:`,
        hashError instanceof Error ? hashError.message : hashError
      );
    }

    const report = await prisma.report.create({
      data: {
        user_id: userId,
        image_url: validation.data.image_url,
        image_hash: imageHash,
        lat: validation.data.lat,
        lng: validation.data.lng,
        issue_type: validation.data.issue_type,
        severity: validation.data.severity,
        notes: validation.data.notes || null,
        near_sensitive_location: validation.data.near_sensitive_location,
        status: ReportStatus.SUBMITTED,
      },
    });

    // Duplicate detection and cluster assignment:
    // Evaluates the newly created report against nearby open reports using PostGIS ST_DWithin
    // and perceptual hash Hamming distance. Atomically merges into an existing cluster or
    // provisions a new cluster.
    // Availability over completeness: If clustering fails, log the error but still return HTTP 201
    // with the created report so that a citizen's submission is never rejected.
    let clusterResult: ClusterAssignmentResult | null = null;
    let clusterErrorNote: string | null = null;

    try {
      clusterResult = await ClusteringService.evaluateAndAssignCluster(report);
    } catch (clusteringError) {
      console.error(
        `[createReport] Clustering evaluation failed for report ${report.id}:`,
        clusteringError instanceof ClusteringException
          ? clusteringError.message
          : clusteringError
      );
      clusterErrorNote = 'Clustering evaluation could not be completed';
    }

    res.status(201).json({
      ...report,
      cluster_id: clusterResult ? clusterResult.clusterId : report.cluster_id,
      clusterResult: clusterResult
        ? {
            action: clusterResult.action,
            clusterId: clusterResult.clusterId,
            confirmationCount: clusterResult.confirmationCount,
            ...(clusterResult.action === 'merged'
              ? {
                  matchedReportId: clusterResult.matchedReportId,
                  hammingDistance: clusterResult.hammingDistance,
                  distanceMeters: Number(clusterResult.distanceMeters.toFixed(2)),
                }
              : {}),
          }
        : {
            status: 'unassigned',
            note: clusterErrorNote,
          },
    });
  } catch (error) {
    console.error('Error in createReport:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 2. listReports(req, res)
 * Validates query params, filters by optional status and issue_type, paginates with page/limit,
 * orders by created_at desc, and includes user id & name.
 */
export const listReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = listReportsQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: validation.error.issues,
      });
      return;
    }

    const { status, issue_type, user_id, page, limit } = validation.data;
    const skip = (page - 1) * limit;

    const where: {
      status?: typeof status;
      issue_type?: typeof issue_type;
      user_id?: string;
    } = {};

    if (status) where.status = status;
    if (issue_type) where.issue_type = issue_type;
    if (user_id) where.user_id = user_id;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.report.count({ where }),
    ]);

    res.status(200).json({
      data: reports,
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error('Error in listReports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 3. getReportById(req, res)
 * Fetches a single report by id including user (id, name) and cluster if assigned.
 */
export const getReportById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id || !UUID_REGEX.test(id)) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        cluster: true,
      },
    });

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.status(200).json(report);
  } catch (error) {
    console.error('Error in getReportById:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 4. updateReportStatus(req, res)
 * Validates request body, verifies existence, and updates report status.
 */
export const updateReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id || !UUID_REGEX.test(id)) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const validation = updateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues,
      });
      return;
    }

    const existingReport = await prisma.report.findUnique({
      where: { id },
    });

    if (!existingReport) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const { reputationChanges } = await performSingleReportStatusUpdate({
      reportId: id,
      targetStatus: validation.data.status,
      spam: validation.data.spam,
    });

    const updatedReport = await prisma.report.findUnique({
      where: { id },
    });

    if (!updatedReport) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    // Recompute cluster priority score if the report is assigned to a cluster
    // Availability over completeness: Non-blocking error handling
    if (updatedReport.cluster_id) {
      try {
        await recomputeClusterPriority(updatedReport.cluster_id);
      } catch (priorityError) {
        console.error(
          `[updateReportStatus] Failed to recompute priority score for cluster ${updatedReport.cluster_id}:`,
          priorityError instanceof Error ? priorityError.message : priorityError
        );
      }
    }

    res.status(200).json({
      ...updatedReport,
      reputation_changes: reputationChanges,
    });
  } catch (error) {
    console.error('Error in updateReportStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Backward-compatible alias
export const getAllReports = listReports;

/**
 * 5. getPriorityQueue(req, res)
 * Validates query parameters, retrieves ranked report clusters with freshness checks,
 * and returns the priority queue for municipal dashboard operators.
 */
export const getPriorityQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = priorityQueueQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: validation.error.issues,
      });
      return;
    }

    const result = await PriorityQueueService.getPriorityQueue(validation.data);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getPriorityQueue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const STATUS_PRECEDENCE: Record<ReportStatus, number> = {
  [ReportStatus.SUBMITTED]: 1,
  [ReportStatus.UNDER_REVIEW]: 2,
  [ReportStatus.SCHEDULED]: 3,
  [ReportStatus.FIXED]: 4,
  [ReportStatus.REJECTED]: 5,
};

const SEVERITY_PRECEDENCE: Record<Severity, number> = {
  [Severity.LOW]: 1,
  [Severity.MEDIUM]: 2,
  [Severity.HIGH]: 3,
  [Severity.CRITICAL]: 4,
};

// Phase 1 status transition rules:
// - Forward moves: SUBMITTED -> UNDER_REVIEW -> SCHEDULED -> FIXED
// - Rejection: REJECTED is allowed from any non-closed state (SUBMITTED, UNDER_REVIEW, SCHEDULED)
// - Re-opening: NOT allowed. If the cluster is already closed (FIXED or REJECTED), status cannot change.
export const ALLOWED_CLUSTER_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  [ReportStatus.SUBMITTED]: [
    ReportStatus.UNDER_REVIEW,
    ReportStatus.SCHEDULED,
    ReportStatus.FIXED,
    ReportStatus.REJECTED,
  ],
  [ReportStatus.UNDER_REVIEW]: [
    ReportStatus.SCHEDULED,
    ReportStatus.FIXED,
    ReportStatus.REJECTED,
  ],
  [ReportStatus.SCHEDULED]: [
    ReportStatus.FIXED,
    ReportStatus.REJECTED,
  ],
  [ReportStatus.FIXED]: [],
  [ReportStatus.REJECTED]: [],
};

type ClusterDetailPrismaPayload = Prisma.ReportClusterGetPayload<{
  include: {
    reports: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
    confirmations: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
  };
}>;

export function buildClusterDetail(cluster: ClusterDetailPrismaPayload) {
  const reports = cluster.reports || [];
  const confirmations = cluster.confirmations || [];

  // 1. Map reports with reporter info (no email returned for privacy)
  const mappedReports = reports.map((r) => ({
    id: r.id,
    image_url: r.image_url,
    notes: r.notes,
    lat: r.lat,
    lng: r.lng,
    issue_type: r.issue_type,
    severity: r.severity,
    status: r.status,
    near_sensitive_location: r.near_sensitive_location,
    created_at: r.created_at,
    reporter: {
      id: r.user.id,
      name: r.user.name,
    },
  }));

  // 2. Map confirmations
  const mappedConfirmations = confirmations.map((c) => ({
    id: c.id,
    created_at: c.created_at,
    user: {
      id: c.user.id,
      name: c.user.name,
    },
  }));

  // 3. Max Severity
  let maxSeverity: Severity = Severity.LOW;
  let maxSeverityRank = 0;
  for (const r of reports) {
    const rank = SEVERITY_PRECEDENCE[r.severity] ?? 0;
    if (rank > maxSeverityRank) {
      maxSeverityRank = rank;
      maxSeverity = r.severity;
    }
  }

  // 4. Current Status: most advanced status among active reports (order: SUBMITTED < UNDER_REVIEW < SCHEDULED)
  const activeReports = reports.filter(
    (r) => r.status !== ReportStatus.FIXED && r.status !== ReportStatus.REJECTED
  );
  let currentStatus: ReportStatus;
  if (activeReports.length > 0) {
    let mostAdvanced = activeReports[0].status;
    let highestRank = STATUS_PRECEDENCE[mostAdvanced] ?? 0;
    for (const r of activeReports) {
      const rank = STATUS_PRECEDENCE[r.status] ?? 0;
      if (rank > highestRank) {
        highestRank = rank;
        mostAdvanced = r.status;
      }
    }
    currentStatus = mostAdvanced;
  } else if (reports.length > 0) {
    // If all reports are closed, pick the first/most advanced closed status
    currentStatus = reports[0].status;
  } else {
    currentStatus = ReportStatus.SUBMITTED;
  }

  // 5. Days Open: from earliest report created_at to now
  let daysOpen = 0;
  if (reports.length > 0) {
    const oldestCreatedAt = reports.reduce(
      (earliest, r) => (r.created_at < earliest ? r.created_at : earliest),
      reports[0].created_at
    );
    const diffMs = Date.now() - oldestCreatedAt.getTime();
    daysOpen = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
  }

  // 6. Issue Type: most common among its reports
  let issueType: IssueType = IssueType.OTHER;
  if (reports.length > 0) {
    const countMap = new Map<IssueType, number>();
    for (const r of reports) {
      countMap.set(r.issue_type, (countMap.get(r.issue_type) || 0) + 1);
    }
    let highest = 0;
    for (const [t, count] of countMap.entries()) {
      if (count > highest) {
        highest = count;
        issueType = t;
      }
    }
  }

  // 7. Near Sensitive Location: true if any active report has it
  const nearSensitiveLocation = activeReports.length > 0
    ? activeReports.some((r) => r.near_sensitive_location)
    : reports.some((r) => r.near_sensitive_location);

  return {
    id: cluster.id,
    centroid_lat: cluster.centroid_lat,
    centroid_lng: cluster.centroid_lng,
    confirmation_count: cluster.confirmation_count,
    priority_score: cluster.priority_score,
    created_at: cluster.created_at,
    updated_at: cluster.updated_at,
    issue_type: issueType,
    max_severity: maxSeverity,
    current_status: currentStatus,
    days_open: daysOpen,
    near_sensitive_location: nearSensitiveLocation,
    report_count: reports.length,
    reports: mappedReports,
    confirmations: mappedConfirmations,
  };
}

/**
 * 6. getClusterById(req, res)
 * Admin-only endpoint returning complete cluster details, all associated reports (with reporter names),
 * and confirmation records.
 */
export const getClusterById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id || !UUID_REGEX.test(id)) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const cluster = await prisma.reportCluster.findUnique({
      where: { id },
      include: {
        reports: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        confirmations: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const detail = buildClusterDetail(cluster);
    res.status(200).json(detail);
  } catch (error) {
    console.error('Error in getClusterById:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 7. updateClusterStatus(req, res)
 * Admin-only endpoint updating the status of all active reports in a cluster.
 * Enforces Phase 1 transition rules (forward progression or rejection, no re-opening).
 * Recomputes cluster priority score after commit.
 */
export const updateClusterStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id || !UUID_REGEX.test(id)) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const validation = updateStatusSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues,
      });
      return;
    }

    const targetStatus = validation.data.status;

    // Fetch existing cluster with its reports to validate current state
    const existingCluster = await prisma.reportCluster.findUnique({
      where: { id },
      include: {
        reports: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        confirmations: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!existingCluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const currentDetail = buildClusterDetail(existingCluster);
    const currentStatus = currentDetail.current_status;

    // Check if cluster is already in the requested status
    if (currentStatus === targetStatus) {
      res.status(409).json({
        error: `Cluster is already in ${currentStatus} status.`,
      });
      return;
    }

    // Phase 1 rule: Closed clusters (FIXED or REJECTED) cannot be re-opened or modified
    if (currentStatus === ReportStatus.FIXED || currentStatus === ReportStatus.REJECTED) {
      res.status(409).json({
        error: `Cannot update a closed cluster (${currentStatus}). Re-opening is not permitted in Phase 1.`,
      });
      return;
    }

    // Phase 1 rule: Validate allowed transition (forward progression or rejection)
    const allowedNext = ALLOWED_CLUSTER_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(targetStatus)) {
      res.status(409).json({
        error: `Invalid status transition from ${currentStatus} to ${targetStatus}. Only forward progression (${allowedNext.join(', ')}) is permitted.`,
      });
      return;
    }

    // Atomically transition all non-closed reports in the cluster and apply reputation events
    const { changedReports, reputationChanges } = await performClusterStatusUpdate({
      clusterId: id,
      targetStatus,
      spam: validation.data.spam,
    });

    // Recompute cluster priority score after transaction commit (non-blocking error handling)
    try {
      await recomputeClusterPriority(id);
    } catch (priorityError) {
      console.error(
        `[updateClusterStatus] Failed to recompute priority score for cluster ${id}:`,
        priorityError instanceof Error ? priorityError.message : priorityError
      );
    }

    // Retrieve refreshed cluster
    const refreshedCluster = await prisma.reportCluster.findUnique({
      where: { id },
      include: {
        reports: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        confirmations: {
          orderBy: { created_at: 'asc' },
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!refreshedCluster) {
      res.status(404).json({ error: 'Cluster not found after update' });
      return;
    }

    const refreshedDetail = buildClusterDetail(refreshedCluster);

    res.status(200).json({
      ...refreshedDetail,
      updated_reports_count: changedReports.length,
      reputation_changes: reputationChanges,
    });
  } catch (error) {
    console.error('Error in updateClusterStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

