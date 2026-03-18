import 'dotenv/config';
import cluster from 'node:cluster';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';

import logger from './config/logger.js';
import authRoutes from './routes/authRoutes.js';
import studentAuthRoutes from './routes/studentAuthRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import scoreRoutes from './routes/scoreRoutes.js';

/* -------------------- ENV VALIDATION -------------------- */
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    logger.fatal(`Missing required env var: ${key}`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  logger.fatal('JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

/* -------------------- CLUSTER MODE -------------------- */
const WORKERS = parseInt(process.env.WEB_CONCURRENCY) || Math.min(os.cpus().length, 4);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && cluster.isPrimary && WORKERS > 1) {
  logger.info(`Primary ${process.pid} forking ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker) => {
    logger.warn(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  startServer();
}

function startServer() {
  const app = express();

  /* -------------------- TRUST PROXY -------------------- */
  app.set('trust proxy', 1);

  /* -------------------- CORS — exact origin allowlist -------------------- */
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. server-to-server, curl)
        if (!origin) return callback(null, true);

        // In dev, allow localhost
        if (!isProduction && origin.includes('localhost')) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(helmet());

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  /* -------------------- COMPRESSION -------------------- */
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  /* -------------------- CACHE HEADERS -------------------- */
  app.use((req, res, next) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', 'no-store');
    }
    next();
  });

  /* -------------------- REQUEST TIMEOUT -------------------- */
  app.use((req, res, next) => {
    req.setTimeout(30000);
    res.setTimeout(30000);
    next();
  });

  /* -------------------- STRUCTURED LOGGING (pino-http) -------------------- */
  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      autoLogging: isProduction,
    })
  );

  /* -------------------- RATE LIMITING -------------------- */
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts, please try again later.' }
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' }
  });

  const codingSubmitLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many code submissions, please wait before trying again.' }
  });

  /* -------------------- ROUTES -------------------- */
  app.get('/', (req, res) => {
    res.send('Nagasai Creator Backend is live');
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      environment: process.env.NODE_ENV,
      message: 'Naga Sai LMS API running (Supabase)',
      pid: process.pid,
    });
  });

  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/student-auth/login', authLimiter);
  app.use('/api/student-auth/register', authLimiter);

  // Coding submit rate limit (before general API limiter)
  app.use('/api/scores/coding-submit', codingSubmitLimiter);

  app.use('/api', apiLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/student-auth', studentAuthRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/topics', topicRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/scores', scoreRoutes);

  /* -------------------- 404 -------------------- */
  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  /* -------------------- ERROR HANDLER -------------------- */
  app.use((err, req, res, next) => {
    logger.error({ err, reqId: req.id }, 'Unhandled error');

    res.status(500).json({
      message: isProduction ? 'Internal Server Error' : err.message,
      stack: isProduction ? undefined : err.stack,
    });
  });

  /* -------------------- SERVER -------------------- */
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    logger.info(`Worker ${process.pid} running on port ${PORT}`);
  });

  /* -------------------- GRACEFUL SHUTDOWN -------------------- */
  const shutdown = (signal) => {
    logger.info(`${signal} received by ${process.pid}. Shutting down...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
