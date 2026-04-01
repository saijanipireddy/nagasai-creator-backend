import express from 'express';
import { protect, requireCourseAccess } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createCourseSchema, updateCourseSchema, reorderCoursesSchema } from '../schemas/course.js';
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseTopics,
  getCourseTopicsSummary,
  getStats,
  reorderCourses
} from '../controllers/courseController.js';

const router = express.Router();

// Public: course listing (name, icon, description — no sensitive content)
router.get('/', getCourses);
router.get('/stats', protect, getStats);
router.put('/reorder', protect, validate(reorderCoursesSchema), reorderCourses);

// Public: single course metadata (no content)
router.get('/:id', getCourseById);

// Protected: topic content requires enrollment (admin or enrolled student)
router.get('/:id/topics-summary', requireCourseAccess, getCourseTopicsSummary);
router.get('/:id/topics', requireCourseAccess, getCourseTopics);

// Admin only
router.post('/', protect, validate(createCourseSchema), createCourse);
router.put('/:id', protect, validate(updateCourseSchema), updateCourse);
router.delete('/:id', protect, deleteCourse);

export default router;
