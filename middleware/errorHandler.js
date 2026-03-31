import logger from '../config/logger.js';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Wraps controller error handling to avoid leaking DB details in production.
 * Usage: catch (error) { handleError(res, error, 'createCourse'); }
 */
export const handleError = (res, error, context = 'unknown') => {
  logger.error({ err: error, context }, `Controller error in ${context}`);

  // Don't leak internal details in production
  const message = isProduction
    ? 'An unexpected error occurred. Please try again.'
    : error.message;

  res.status(500).json({ message });
};
