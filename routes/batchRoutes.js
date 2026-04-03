import express from 'express';
import { protect, studentProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createBatchSchema,
  updateBatchSchema,
  assignCoursesSchema,
  enrollStudentsSchema,
  updateEnrollmentSchema,
  onboardStudentSchema,
} from '../schemas/batch.js';
import {
  getBatches,
  getBatchById,
  createBatch,
  updateBatch,
  deleteBatch,
  assignCourses,
  removeCourse,
  enrollStudents,
  updateEnrollment,
  removeStudent,
  getAllStudents,
  onboardStudent,
  getMyEnrolledCourses,
  checkCourseAccess,
  getBatchProgress,
  getStudentProgress,
} from '../controllers/batchController.js';

const router = express.Router();

// ---- Student-facing (MUST be before /:id to avoid matching "student" as id) ----
router.get('/student/my-courses', studentProtect, getMyEnrolledCourses);
router.get('/student/check-access/:courseId', studentProtect, checkCourseAccess);

// ---- Admin: specific paths before /:id ----
router.get('/', protect, getBatches);
router.get('/students/all', protect, getAllStudents);
router.post('/students/onboard', protect, validate(onboardStudentSchema), onboardStudent);
router.post('/', protect, validate(createBatchSchema), createBatch);

// ---- Admin: dynamic /:id routes ----
router.get('/:id', protect, getBatchById);
router.get('/:id/progress', protect, getBatchProgress);
router.get('/:id/students/:studentId/progress', protect, getStudentProgress);
router.put('/:id', protect, validate(updateBatchSchema), updateBatch);
router.delete('/:id', protect, deleteBatch);

// ---- Batch ↔ Course ----
router.post('/:id/courses', protect, validate(assignCoursesSchema), assignCourses);
router.delete('/:id/courses/:courseId', protect, removeCourse);

// ---- Batch ↔ Student enrollment ----
router.post('/:id/students', protect, validate(enrollStudentsSchema), enrollStudents);
router.put('/:id/students/:studentId', protect, validate(updateEnrollmentSchema), updateEnrollment);
router.delete('/:id/students/:studentId', protect, removeStudent);

export default router;
