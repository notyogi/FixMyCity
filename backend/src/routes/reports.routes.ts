import { Router } from 'express';
import {
  createReport,
  listReports,
  getReportById,
  updateReportStatus,
  getPriorityQueue,
  getClusterById,
  updateClusterStatus,
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

// GET /reports/clusters/:id -> requireAuth AND requireAdmin
// PATCH /reports/clusters/:id/status -> requireAuth AND requireAdmin
// IMPORTANT: These cluster endpoints MUST be registered BEFORE GET /:id and PATCH /:id/status.
// Express matches route patterns in order of registration. If /:id were declared first,
// requests to /reports/clusters/:id would match /:id with req.params.id = "clusters",
// failing UUID regex validation (404) rather than reaching the cluster handlers.
router.get('/clusters/:id', requireAuth, requireAdmin, getClusterById);
router.patch('/clusters/:id/status', requireAuth, requireAdmin, updateClusterStatus);

// GET /reports/:id -> requireAuth, then getReportById
router.get('/:id', requireAuth, getReportById);

// PATCH /reports/:id/status -> requireAuth AND requireAdmin, then updateReportStatus
router.patch('/:id/status', requireAuth, requireAdmin, updateReportStatus);

export default router;
