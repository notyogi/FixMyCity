import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

/**
 * Middleware that validates the Supabase JWT access token in the Authorization header.
 * Attaches the authenticated user details (including UUID id) to req.user.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing or malformed authorization header',
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        error: 'Missing or malformed authorization header',
      });
      return;
    }

    const {
      data,
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({
        error: 'Invalid or expired token',
      });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      name: (data.user.user_metadata?.full_name || data.user.user_metadata?.name) as string | undefined,
    };

    next();
  } catch (err) {
    console.error('Authentication middleware error:', err);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

/**
 * Middleware that checks whether the authenticated user is an administrator.
 * Must be executed AFTER requireAuth.
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !req.user.id) {
    res.status(401).json({
      error: 'Unauthorized: Authentication required before admin verification',
    });
    return;
  }

  const adminUserIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!adminUserIds.includes(req.user.id)) {
    res.status(403).json({
      error: 'Admin access required',
    });
    return;
  }

  next();
};

// Backward-compatible alias
export const authenticateUser = requireAuth;
