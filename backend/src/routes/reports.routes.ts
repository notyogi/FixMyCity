import { Router } from 'express';
import {
  createReport,
  listReports,
  getReportById,
  updateReportStatus,
} from '../controllers/reports.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// POST /reports -> requireAuth, then createReport
router.post('/', requireAuth, createReport);

// GET /reports -> requireAuth, then listReports
router.get('/', requireAuth, listReports);

// GET /reports/:id -> requireAuth, then getReportById
router.get('/:id', requireAuth, getReportById);

// PATCH /reports/:id/status -> requireAuth AND requireAdmin, then updateReportStatus
router.patch('/:id/status', requireAuth, requireAdmin, updateReportStatus);

export default router;
