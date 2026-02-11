import express from 'express';
import { studentProtect } from '../middleware/auth.js';
import {
  submitPracticeScore,
  submitCodingScore,
  submitCodingChallenge,
  getMyProgress,
  getLeaderboard,
  markComplete,
  getCompletions,
} from '../controllers/scoreController.js';

const router = express.Router();

router.use(studentProtect);

router.post('/practice', submitPracticeScore);
router.post('/coding', submitCodingScore);
router.post('/coding-submit', submitCodingChallenge);
router.post('/complete', markComplete);
router.get('/completions', getCompletions);
router.get('/my-progress', getMyProgress);
router.get('/leaderboard', getLeaderboard);

export default router;
