import express from 'express';
import { registerAdmin, loginAdmin, getAdminProfile } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.js';

const router = express.Router();

router.post('/register', validate(registerSchema), registerAdmin);
router.post('/login', validate(loginSchema), loginAdmin);
router.get('/profile', protect, getAdminProfile);

export default router;
