import express from 'express';
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseTopics,
  getStats,
  reorderCourses
} from '../controllers/courseController.js';

const router = express.Router();

router.get('/', getCourses);
router.get('/stats', getStats);
router.put('/reorder', reorderCourses);
router.get('/:id', getCourseById);
router.get('/:id/topics', getCourseTopics);
router.post('/', createCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);

export default router;
