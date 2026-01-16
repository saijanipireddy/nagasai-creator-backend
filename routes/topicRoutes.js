import express from 'express';
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
router.post('/', createTopic);
router.put('/reorder', reorderTopics);
router.put('/:id', updateTopic);
router.delete('/:id', deleteTopic);

export default router;
