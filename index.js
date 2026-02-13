import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import studentAuthRoutes from './routes/studentAuthRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import scoreRoutes from './routes/scoreRoutes.js';

/* -------------------- APP -------------------- */
const app = express();

/* -------------------- __dirname -------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------- MIDDLEWARE -------------------- */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (
        origin.includes('localhost') ||
        origin.includes('onrender.com') ||
        origin.includes('vercel.app')
      ) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

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
  if (req.method === 'GET' && req.path.startsWith('/uploads')) {
    res.set('Cache-Control', 'public, max-age=86400');
  } else if (req.method === 'GET') {
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

/* -------------------- LOGGING -------------------- */
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

/* -------------------- STATIC FILES (backward compat for old local uploads) -------------------- */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* -------------------- ROUTES -------------------- */
app.get('/', (req, res) => {
  res.send('Nagasai Creator Backend is live');
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    environment: process.env.NODE_ENV,
    message: 'Naga Sai LMS API running (Supabase)',
  });
});

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
  console.error(err.stack);

  res.status(500).json({
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

/* -------------------- SERVER -------------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
