import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import healthRoutes from './routes/health.routes';
import reportsRoutes from './routes/reports.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import { requireAuth } from './middleware/auth.middleware';

const app: Application = express();

// Render runs behind a reverse proxy that adds exactly one proxy hop. Setting "trust proxy" to 1
// instructs Express to trust the first hop (X-Forwarded-For header appended by Render's load balancer)
// so req.ip accurately reflects the client's public IP address.
// NOTE ON TRUST PROXY CONFIGURATION:
// - A value of 0 (or unset) causes Express to ignore X-Forwarded-For entirely and use the proxy's IP.
//   This would lump all incoming users into a single shared IP bucket, quickly triggering rate limits
//   for all users simultaneously.
// - A value too high (or boolean true) blindly trusts all upstream hops, allowing untrusted clients to
//   spoof their IP by forging arbitrary client IPs in their request's X-Forwarded-For header.
app.set('trust proxy', 1);

// Security and utility middleware
app.use(helmet());

// CORS configuration:
// If CORS_ORIGINS is provided (comma-separated origins), restrict access to those origins.
// In local development, if CORS_ORIGINS is unset, remain permissive (allow all origins).
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (!configuredOrigins || configuredOrigins.length === 0) {
        return callback(null, true);
      }
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Coarse global per-IP rate limiter as a safety net against abuse that never authenticates
// (such as login brute-force attacks, scanner crawlers, and scrapers).
// NOTE ON IN-MEMORY STORE:
// Uses express-rate-limit's default in-memory store. Rate limit counters reset whenever the server
// restarts (e.g. Render free-tier cold restarts or redeployments) and counters are per-instance (not
// shared across horizontal server processes). For Render's free tier and general API safety-net
// protection without adding external Redis infrastructure, this approach is fully acceptable.
const ipWindowMinutes = process.env.RATE_LIMIT_IP_WINDOW_MINUTES
  ? parseInt(process.env.RATE_LIMIT_IP_WINDOW_MINUTES, 10) || 15
  : 15;
const ipMaxRequests = process.env.RATE_LIMIT_IP_MAX
  ? parseInt(process.env.RATE_LIMIT_IP_MAX, 10) || 300
  : 300;

export function isHealthRoute(req: { method?: string; path?: string }): boolean {
  const p = req.path || '';
  return (
    req.method === 'GET' &&
    (p === '/health' ||
      p === '/api/v1/health' ||
      p === '/api/health' ||
      p === '/health/' ||
      p === '/api/v1/health/' ||
      p === '/api/health/')
  );
}

export const globalIpLimiter = rateLimit({
  windowMs: ipWindowMinutes * 60 * 1000,
  limit: ipMaxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req: Request) => isHealthRoute(req),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'IP_RATE_LIMITED',
  },
});

app.use(globalIpLimiter);

// API Route Mounts (v1)
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);

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
app.use('/api/users', usersRoutes);
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
