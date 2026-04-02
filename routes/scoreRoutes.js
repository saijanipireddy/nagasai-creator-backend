import express from 'express';
import { studentProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { codingScoreSchema, codingSubmitSchema, practiceAttemptSchema } from '../schemas/score.js';
import { practiceScoreSchema, markCompleteSchema } from '../schemas/batch.js';
import {
  submitPracticeScore,
  submitCodingScore,
  submitCodingChallenge,
  getCodingSubmission,
  runCode,
  submitPracticeAttempt,
  getPracticeAttempts,
  getPracticeAttemptDetail,
  getMyProgress,
  getLeaderboard,
  getDashboardWidget,
  markComplete,
  getCompletions,
} from '../controllers/scoreController.js';

const router = express.Router();

router.use(studentProtect);

router.post('/practice', validate(practiceScoreSchema), submitPracticeScore);
router.post('/practice-attempt', validate(practiceAttemptSchema), submitPracticeAttempt);
router.get('/practice-attempts/:topicId', getPracticeAttempts);
router.get('/practice-attempt/:attemptId', getPracticeAttemptDetail);
router.post('/coding', validate(codingScoreSchema), submitCodingScore);
router.post('/coding-submit', validate(codingSubmitSchema), submitCodingChallenge);
router.get('/coding-submission/:topicId', getCodingSubmission);
router.post('/run-code', runCode);
router.post('/complete', validate(markCompleteSchema), markComplete);
router.get('/completions', getCompletions);
router.get('/my-progress', getMyProgress);
router.get('/dashboard-widget', getDashboardWidget);
router.get('/leaderboard', getLeaderboard);

export default router;
