import { Router } from 'express';
import {
  getAllReports,
  getReportById,
  createReport,
  getUserReports,
  updateReportStatus,
} from '../controllers/reports.controller';

const router = Router();

router.get('/', getAllReports);
router.post('/', createReport);
router.get('/:id', getReportById);
router.patch('/:id/status', updateReportStatus);
router.get('/user/:userId', getUserReports);

export default router;
