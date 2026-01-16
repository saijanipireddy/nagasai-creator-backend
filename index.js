import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import topicRoutes from './routes/topicRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';

/* -------------------- ENV -------------------- */
dotenv.config();

/* -------------------- DB -------------------- */
connectDB();

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
        origin.includes('onrender.com')
      ) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------- LOGGING -------------------- */
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

/* -------------------- STATIC FILES -------------------- */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* -------------------- ROUTES -------------------- */
app.get('/', (req, res) => {
  res.send('Nagasai Creator Backend is live 🚀');
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    environment: process.env.NODE_ENV,
    message: 'Naga Sai LMS API running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/upload', uploadRoutes);

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
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
