import logger from '../config/logger.js';

// Simple in-memory concurrency limiter for code execution
const MAX_CONCURRENT = parseInt(process.env.PISTON_MAX_CONCURRENT) || 20;
const QUEUE_MAX_WAIT = parseInt(process.env.PISTON_QUEUE_TIMEOUT) || 30000; // 30s max wait

let running = 0;
const queue = [];

export const getQueueStats = () => ({
  running,
  waiting: queue.length,
  maxConcurrent: MAX_CONCURRENT,
});

export const withExecutionLimit = (fn) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      // Remove from queue if still waiting
      const idx = queue.indexOf(execute);
      if (idx !== -1) queue.splice(idx, 1);
      reject(new Error('Code execution queue timeout — server is busy, please try again'));
    }, QUEUE_MAX_WAIT);

    const execute = async () => {
      running++;
      clearTimeout(timeoutId);
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        running--;
        // Process next in queue
        if (queue.length > 0) {
          const next = queue.shift();
          next();
        }
      }
    };

    if (running < MAX_CONCURRENT) {
      execute();
    } else {
      queue.push(execute);
      if (queue.length % 10 === 0) {
        logger.warn({ queueLength: queue.length, running }, 'Code execution queue growing');
      }
    }
  });
};
