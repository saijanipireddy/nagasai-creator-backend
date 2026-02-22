import express from 'express';
import { protect } from '../middleware/auth.js';
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
router.put('/reorder', protect, reorderCourses);
router.get('/:id', getCourseById);
router.get('/:id/topics-summary', getCourseTopicsSummary);
router.get('/:id/topics', getCourseTopics);
router.post('/', protect, createCourse);
router.put('/:id', protect, updateCourse);
router.delete('/:id', protect, deleteCourse);

export default router;
