import { Router } from 'express';
import {
  createReport,
  listReports,
  getReportById,
  updateReportStatus,
  getPriorityQueue,
} from '../controllers/reports.controller';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// POST /reports -> requireAuth, then createReport
router.post('/', requireAuth, createReport);

// GET /reports -> requireAuth, then listReports
router.get('/', requireAuth, listReports);

// GET /reports/priority-queue -> requireAuth AND requireAdmin (municipal staff only)
// IMPORTANT: This route MUST be registered BEFORE GET /:id.
// Express evaluates routes sequentially in definition order. If GET /:id were declared first,
// requests to /reports/priority-queue would be captured by /:id with req.params.id = "priority-queue",
// causing a 404 UUID validation error instead of reaching the priority queue handler.
router.get('/priority-queue', requireAuth, requireAdmin, getPriorityQueue);

// GET /reports/:id -> requireAuth, then getReportById
router.get('/:id', requireAuth, getReportById);

// PATCH /reports/:id/status -> requireAuth AND requireAdmin, then updateReportStatus
router.patch('/:id/status', requireAuth, requireAdmin, updateReportStatus);

export default router;
