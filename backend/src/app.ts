import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import healthRoutes from './routes/health.routes';
import reportsRoutes from './routes/reports.routes';
import authRoutes from './routes/auth.routes';
import { requireAuth } from './middleware/auth.middleware';

const app: Application = express();

// Security and utility middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Route Mounts (v1)
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/auth', authRoutes);

// Protected test endpoint to verify Supabase JWT authentication
app.get('/api/v1/protected-test', requireAuth, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Protected route accessed successfully',
    user: req.user,
  });
});

// Backward-compatible unversioned fallbacks
app.use('/api/health', healthRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/auth', authRoutes);
app.get('/api/protected-test', requireAuth, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Protected route accessed successfully',
    user: req.user,
  });
});

// Catch-all 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
