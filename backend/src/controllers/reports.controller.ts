import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import {
  createReportSchema,
  updateStatusSchema,
  listReportsQuerySchema,
} from '../validation/report.validation';
import { ReportStatus } from '@prisma/client';
import { ImageHashService } from '../services/imageHash.service';
import {
  ClusteringService,
  ClusteringException,
  ClusterAssignmentResult,
} from '../services/clustering.service';
import { recomputeClusterPriority } from '../services/priority.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        status: validation.data.status,
      },
    });

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

    res.status(200).json(updatedReport);
  } catch (error) {
    console.error('Error in updateReportStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Backward-compatible alias
export const getAllReports = listReports;
