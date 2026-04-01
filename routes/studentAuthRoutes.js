import express from 'express';
import { registerStudent, loginStudent, getStudentProfile, refreshTokenStudent, logoutStudent } from '../controllers/studentAuthController.js';
import { studentProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.js';

const router = express.Router();

router.post('/register', validate(registerSchema), registerStudent);
router.post('/login', validate(loginSchema), loginStudent);
router.post('/refresh', refreshTokenStudent);
router.post('/logout', logoutStudent);
router.get('/profile', studentProtect, getStudentProfile);

export default router;
