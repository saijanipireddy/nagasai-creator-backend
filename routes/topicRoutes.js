import express from 'express';
import { protect } from '../middleware/auth.js';
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
router.get('/:id', getTopicById);
router.post('/', protect, createTopic);
router.put('/reorder', protect, reorderTopics);
router.put('/:id', protect, updateTopic);
router.delete('/:id', protect, deleteTopic);

export default router;
