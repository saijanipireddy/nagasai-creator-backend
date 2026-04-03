import express from 'express';
import { protect, studentProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createAnnouncementSchema, updateAnnouncementSchema } from '../schemas/announcement.js';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getStudentAnnouncements,
  markAnnouncementRead,
} from '../controllers/announcementController.js';

const router = express.Router();

// Student routes (must be before /:id)
router.get('/student', studentProtect, getStudentAnnouncements);
router.post('/:id/read', studentProtect, markAnnouncementRead);

// Admin routes
router.get('/', protect, getAnnouncements);
router.post('/', protect, validate(createAnnouncementSchema), createAnnouncement);
router.put('/:id', protect, validate(updateAnnouncementSchema), updateAnnouncement);
router.delete('/:id', protect, deleteAnnouncement);

export default router;
