// Sentry error tracking for backend
// Setup: npm install @sentry/node && set SENTRY_DSN in .env
//
// Usage in index.js:
//   import { initSentry, sentryErrorHandler } from './config/sentry.js';
//   initSentry();  // call early, before routes
//   app.use(sentryErrorHandler);  // call after routes, before error handler

let Sentry = null;

export const initSentry = async () => {
  if (!process.env.SENTRY_DSN) return;
  try {
    Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  } catch {
    // @sentry/node not installed — skip silently
  }
};

export const sentryErrorHandler = (err, req, res, next) => {
  if (Sentry) {
    Sentry.captureException(err);
  }
  next(err);
};

export const captureException = (err) => {
  if (Sentry) Sentry.captureException(err);
};
