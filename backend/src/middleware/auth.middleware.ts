import { Request, Response, NextFunction } from 'express';

/**
 * Middleware stub for validating Supabase JWT access tokens on protected routes.
 * In production, this will parse the Bearer token from the Authorization header
 * and verify it with the Supabase client / JWT secret.
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: Bearer token is empty',
    });
    return;
  }

  // Stub implementation: Token verification will be attached here
  // req.user = decodedUser;
  next();
};
