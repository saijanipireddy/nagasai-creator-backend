import express from 'express';
import { registerStudent, loginStudent, getStudentProfile } from '../controllers/studentAuthController.js';
import { studentProtect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', registerStudent);
router.post('/login', loginStudent);
router.get('/profile', studentProtect, getStudentProfile);

export default router;
