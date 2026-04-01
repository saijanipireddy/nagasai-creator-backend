import express from 'express';
import { protect, requireTopicAccess } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createTopicSchema, updateTopicSchema, reorderTopicsSchema } from '../schemas/topic.js';
import {
  getTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  reorderTopics
} from '../controllers/topicController.js';

const router = express.Router();

// Admin: list all topics
router.get('/', protect, getTopics);
router.post('/', protect, validate(createTopicSchema), createTopic);

// Specific paths BEFORE /:id
router.put('/reorder', protect, validate(reorderTopicsSchema), reorderTopics);

// Protected: topic detail requires enrollment (admin or enrolled student)
router.get('/:id', requireTopicAccess, getTopicById);

// Admin only
router.put('/:id', protect, validate(updateTopicSchema), updateTopic);
router.delete('/:id', protect, deleteTopic);

export default router;
