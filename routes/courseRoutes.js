import express from 'express';
import { protect } from '../middleware/auth.js';
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

router.get('/', getCourses);
router.get('/stats', protect, getStats);
router.put('/reorder', protect, validate(reorderCoursesSchema), reorderCourses);
router.get('/:id', getCourseById);
router.get('/:id/topics-summary', getCourseTopicsSummary);
router.get('/:id/topics', getCourseTopics);
router.post('/', protect, validate(createCourseSchema), createCourse);
router.put('/:id', protect, validate(updateCourseSchema), updateCourse);
router.delete('/:id', protect, deleteCourse);

export default router;
