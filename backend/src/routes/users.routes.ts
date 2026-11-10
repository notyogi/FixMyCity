import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { getMyReputation, getUserReputationById } from '../controllers/users.controller';

const router = Router();

// IMPORTANT: Register /me/reputation BEFORE /:id/reputation so "me" is not matched as an `:id` parameter.
router.get('/me/reputation', requireAuth, getMyReputation);
router.get('/:id/reputation', requireAuth, requireAdmin, getUserReputationById);

export default router;

