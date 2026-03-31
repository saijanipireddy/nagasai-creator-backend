import express from 'express';
import { protect } from '../middleware/auth.js';
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

router.get('/', getTopics);
router.post('/', protect, validate(createTopicSchema), createTopic);

// Specific paths BEFORE /:id
router.put('/reorder', protect, validate(reorderTopicsSchema), reorderTopics);

// Dynamic /:id routes
router.get('/:id', getTopicById);
router.put('/:id', protect, validate(updateTopicSchema), updateTopic);
router.delete('/:id', protect, deleteTopic);

export default router;
