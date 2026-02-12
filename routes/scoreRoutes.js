import express from 'express';
import { studentProtect } from '../middleware/auth.js';
import {
  submitPracticeScore,
  submitCodingScore,
  submitCodingChallenge,
  getCodingSubmission,
  submitPracticeAttempt,
  getPracticeAttempts,
  getPracticeAttemptDetail,
  getMyProgress,
  getLeaderboard,
  markComplete,
  getCompletions,
} from '../controllers/scoreController.js';

const router = express.Router();

router.use(studentProtect);

router.post('/practice', submitPracticeScore);
router.post('/practice-attempt', submitPracticeAttempt);
router.get('/practice-attempts/:topicId', getPracticeAttempts);
router.get('/practice-attempt/:attemptId', getPracticeAttemptDetail);
router.post('/coding', submitCodingScore);
router.post('/coding-submit', submitCodingChallenge);
router.get('/coding-submission/:topicId', getCodingSubmission);
router.post('/complete', markComplete);
router.get('/completions', getCompletions);
router.get('/my-progress', getMyProgress);
router.get('/leaderboard', getLeaderboard);

export default router;
