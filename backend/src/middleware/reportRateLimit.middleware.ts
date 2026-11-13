import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';

export interface ReportRateLimitConfig {
  defaultLimit: number;
  flaggedLimit: number;
}

export function getReportLimitConfig(): ReportRateLimitConfig {
  const defaultLimit = process.env.REPORT_LIMIT_PER_HOUR
    ? parseInt(process.env.REPORT_LIMIT_PER_HOUR, 10) || 10
    : 10;
  const flaggedLimit = process.env.REPORT_LIMIT_FLAGGED_PER_HOUR
    ? parseInt(process.env.REPORT_LIMIT_FLAGGED_PER_HOUR, 10) || 3
    : 3;
  return { defaultLimit, flaggedLimit };
}

export function isUserAdmin(userId: string): boolean {
  const adminUserIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return adminUserIds.includes(userId);
}

export interface UserRateLimitStatus {
  limit: number;
  used: number;
  remaining: number;
  reset_at: string | null;
  retry_after_seconds: number;
}

/**
 * Calculates current 1-hour rolling rate limit status for a given user.
 */
export async function calculateUserRateLimitStatus(userId: string): Promise<UserRateLimitStatus> {
  const { defaultLimit, flaggedLimit } = getReportLimitConfig();

  // 1. Read reputation_score with a lightweight single-column projection
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reputation_score: true },
  });

  const isFlagged = user?.reputation_score !== undefined && user.reputation_score < 0;
  const limit = isFlagged ? flaggedLimit : defaultLimit;

  // 2. Count reports created in rolling 1-hour window backed by @@index([user_id, created_at])
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [used, oldestInWindow] = await Promise.all([
    prisma.report.count({
      where: {
        user_id: userId,
        created_at: { gte: oneHourAgo },
      },
    }),
    prisma.report.findFirst({
      where: {
        user_id: userId,
        created_at: { gte: oneHourAgo },
      },
      orderBy: { created_at: 'asc' },
      select: { created_at: true },
    }),
  ]);

  let resetAt: string | null = null;
  let retryAfterSeconds = 0;

  if (oldestInWindow) {
    const expiresMs = oldestInWindow.created_at.getTime() + 60 * 60 * 1000;
    resetAt = new Date(expiresMs).toISOString();
    retryAfterSeconds = Math.max(1, Math.ceil((expiresMs - now.getTime()) / 1000));
  } else {
    retryAfterSeconds = 3600;
  }

  const remaining = Math.max(0, limit - used);

  return {
    limit,
    used,
    remaining,
    reset_at: resetAt,
    retry_after_seconds: retryAfterSeconds,
  };
}

/**
 * ROUTE ORDERING & ARCHITECTURAL NOTE:
 * This middleware MUST run AFTER requireAuth (so req.user.id is guaranteed populated)
 * and BEFORE the createReport controller on POST /reports.
 *
 * Route chain: router.post('/', requireAuth, reportRateLimit, createReport);
 *
 * DESIGN CHOICES:
 * 1. Database-backed: Counts actual reports in the database (created_at >= now - 1 hour)
 *    rather than using an in-memory counter. This ensures accuracy across server restarts,
 *    Render free-tier sleeping/spinning down, and horizontal scaling across multiple instances.
 * 2. Fail OPEN: If database queries fail or timeout, the error is logged and next() is called.
 *    In civic incident reporting, citizen availability and reporting accessibility take precedence
 *    over strict rate-limit enforcement. A database hiccup should never block citizens from reporting.
 * 3. Known Concurrency Boundary Limitation:
 *    The count-then-insert check is not strictly atomic. Two requests arriving simultaneously
 *    at the exact limit boundary could both pass the count check and exceed the quota by one.
 *    For Phase 1 anti-spam operations, this trade-off avoids heavy table-level locking or distributed
 *    locks while adequately stopping automated floods and spam bots.
 */
export const reportRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    // If not authenticated, requireAuth should have already rejected, but fail safe
    res.status(401).json({ error: 'Unauthorized: User identity not found' });
    return;
  }

  // Admins are exempt from reporting rate limits
  if (isUserAdmin(userId)) {
    return next();
  }

  try {
    const status = await calculateUserRateLimitStatus(userId);

    if (status.used >= status.limit) {
      // Log warning with user id so operators can spot potential abuse
      console.warn(
        `[reportRateLimit] User ${userId} rate limited. Attempted report with ${status.used}/${status.limit} in rolling hour. Retry-After: ${status.retry_after_seconds}s`
      );

      res.setHeader('Retry-After', String(status.retry_after_seconds));
      res.setHeader('RateLimit-Limit', String(status.limit));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(status.retry_after_seconds));

      res.status(429).json({
        error: 'Report limit reached',
        limit: status.limit,
        window: '1 hour',
        retry_after_seconds: status.retry_after_seconds,
        code: 'RATE_LIMITED',
      });
      return;
    }

    // Set standard rate limit headers on successful request
    // Remaining reflects the consumption of this incoming report
    const remainingAfterThis = Math.max(0, status.limit - status.used - 1);
    res.setHeader('RateLimit-Limit', String(status.limit));
    res.setHeader('RateLimit-Remaining', String(remainingAfterThis));
    res.setHeader('RateLimit-Reset', String(status.retry_after_seconds));

    next();
  } catch (error) {
    // Fail OPEN: Database query failure should never block citizen reports
    console.error(
      `[reportRateLimit] Failed to evaluate rate limit for user ${userId} (failing open):`,
      error instanceof Error ? error.message : error
    );
    next();
  }
};
