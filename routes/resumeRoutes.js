import express from 'express';
import { studentProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generateResumeSchema } from '../schemas/resume.js';
import { generateResume } from '../controllers/resumeController.js';

const router = express.Router();

router.post('/generate', studentProtect, validate(generateResumeSchema), generateResume);

export default router;
