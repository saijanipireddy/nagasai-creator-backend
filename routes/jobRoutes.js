import express from 'express';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createJobSchema, updateJobSchema } from '../schemas/job.js';
import {
  getJobs,
  getAllJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob,
} from '../controllers/jobController.js';

const router = express.Router();

// Public routes
router.get('/', getJobs);
router.get('/all', protect, getAllJobs);
router.get('/:id', getJobById);

// Admin routes
router.post('/', protect, validate(createJobSchema), createJob);
router.put('/:id', protect, validate(updateJobSchema), updateJob);
router.delete('/:id', protect, deleteJob);

export default router;
