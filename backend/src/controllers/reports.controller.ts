import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import {
  createReportSchema,
  updateStatusSchema,
  listReportsQuerySchema,
} from '../validation/report.validation';
import { ReportStatus } from '@prisma/client';

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

    const report = await prisma.report.create({
      data: {
        user_id: userId,
        image_url: validation.data.image_url,
        lat: validation.data.lat,
        lng: validation.data.lng,
        issue_type: validation.data.issue_type,
        severity: validation.data.severity,
        status: ReportStatus.SUBMITTED,
      },
    });

    res.status(201).json(report);
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

    const { status, issue_type, page, limit } = validation.data;
    const skip = (page - 1) * limit;

    const where: {
      status?: typeof status;
      issue_type?: typeof issue_type;
    } = {};

    if (status) where.status = status;
    if (issue_type) where.issue_type = issue_type;

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

    res.status(200).json(updatedReport);
  } catch (error) {
    console.error('Error in updateReportStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Backward-compatible alias
export const getAllReports = listReports;
