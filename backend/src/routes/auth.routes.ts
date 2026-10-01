import { Router, Request, Response } from 'express';

const router = Router();

/**
 * @route   GET /api/auth/me
 * @desc    Get currently authenticated user info (stub)
 * @access  Protected
 */
router.get('/me', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'auth/me stub',
    user: (req as any).user || null,
  });
});

export default router;
