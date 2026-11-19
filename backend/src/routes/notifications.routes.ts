import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../controllers/notifications.controller';

const router = Router();

// All notification routes require an authenticated citizen and are scoped to req.user.id
router.use(requireAuth);

// GET /api/v1/notifications
router.get('/', getNotifications);

// CRITICAL ROUTE PRECEDENCE:
// Specific path '/unread-count' MUST be registered BEFORE any parameterized '/:id' route
// to prevent Express from matching 'unread-count' as a notification UUID parameter.
router.get('/unread-count', getUnreadNotificationCount);

// POST /api/v1/notifications/read-all
router.post('/read-all', markAllNotificationsAsRead);

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', markNotificationAsRead);

export default router;
