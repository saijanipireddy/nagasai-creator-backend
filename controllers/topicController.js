import Topic from '../models/Topic.js';

// @desc    Get all topics
// @route   GET /api/topics
// @access  Public
export const getTopics = async (req, res) => {
  try {
    const topics = await Topic.find({}).populate('courseId', 'name').sort({ order: 1 });
    res.json(topics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single topic
// @route   GET /api/topics/:id
// @access  Public
export const getTopicById = async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id).populate('courseId', 'name color');

    if (topic) {
      res.json(topic);
    } else {
      res.status(404).json({ message: 'Topic not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create topic
// @route   POST /api/topics
// @access  Private/Admin
export const createTopic = async (req, res) => {
  try {
    const { courseId, title, order, videoUrl, pdfUrl, practice, codingPractice, isPublished } = req.body;

    // Get the next order number if not provided
    let topicOrder = order;
    if (topicOrder === undefined) {
      const lastTopic = await Topic.findOne({ courseId }).sort({ order: -1 });
      topicOrder = lastTopic ? lastTopic.order + 1 : 1;
    }

    const topic = await Topic.create({
      courseId,
      title,
      order: topicOrder,
      videoUrl,
      pdfUrl,
      practice,
      codingPractice,
      isPublished
    });

    res.status(201).json(topic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update topic
// @route   PUT /api/topics/:id
// @access  Private/Admin
export const updateTopic = async (req, res) => {
  try {
    const { title, order, videoUrl, pdfUrl, practice, codingPractice, isPublished } = req.body;

    const topic = await Topic.findById(req.params.id);

    if (topic) {
      topic.title = title || topic.title;
      topic.order = order !== undefined ? order : topic.order;
      topic.videoUrl = videoUrl !== undefined ? videoUrl : topic.videoUrl;
      topic.pdfUrl = pdfUrl !== undefined ? pdfUrl : topic.pdfUrl;
      topic.practice = practice !== undefined ? practice : topic.practice;
      topic.codingPractice = codingPractice !== undefined ? codingPractice : topic.codingPractice;
      topic.isPublished = isPublished !== undefined ? isPublished : topic.isPublished;

      const updatedTopic = await topic.save();
      res.json(updatedTopic);
    } else {
      res.status(404).json({ message: 'Topic not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete topic
// @route   DELETE /api/topics/:id
// @access  Private/Admin
export const deleteTopic = async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id);

    if (topic) {
      await Topic.deleteOne({ _id: topic._id });
      res.json({ message: 'Topic removed' });
    } else {
      res.status(404).json({ message: 'Topic not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reorder topics
// @route   PUT /api/topics/reorder
// @access  Private/Admin
export const reorderTopics = async (req, res) => {
  try {
    const { topics } = req.body; // Array of { id, order }

    const updatePromises = topics.map(({ id, order }) =>
      Topic.findByIdAndUpdate(id, { order }, { new: true })
    );

    await Promise.all(updatePromises);
    res.json({ message: 'Topics reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
