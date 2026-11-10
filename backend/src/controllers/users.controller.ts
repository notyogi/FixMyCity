import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ReputationService } from '../services/reputation.service';

const uuidSchema = z.string().uuid('Invalid user ID format: expected a valid UUID');

/**
 * GET /api/v1/users/me/reputation
 * Protected by requireAuth. Returns current score, tier level, and last 20 reputation events
 * for the currently authenticated user.
 */
export const getMyReputation = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'Unauthorized: User identity not found' });
      return;
    }

    const reputation = await ReputationService.getReputationForUser(req.user.id);
    res.status(200).json(reputation);
  } catch (error) {
    console.error('Error in getMyReputation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/v1/users/:id/reputation
 * Admin-only endpoint (requireAuth + requireAdmin).
 * Validates `:id` as a UUID, verifies the user exists, and returns their reputation summary.
 */
export const getUserReputationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const validation = uuidSchema.safeParse(rawId);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.issues,
      });
      return;
    }

    const userId = validation.data;
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const reputation = await ReputationService.getReputationForUser(userId);
    res.status(200).json(reputation);
  } catch (error) {
    console.error('Error in getUserReputationById:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

