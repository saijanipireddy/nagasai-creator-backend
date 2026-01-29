import Topic from '../models/Topic.js';

// @desc    Get all topics
// @route   GET /api/topics
// @access  Public
export const getTopics = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const minimal = req.query.minimal === 'true';

    // Use aggregation for efficient join with course names
    const pipeline = [
      { $sort: { order: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'courses',
          localField: 'courseId',
          foreignField: '_id',
          as: 'course',
          pipeline: [
            { $project: { name: 1 } }
          ]
        }
      },
      {
        $addFields: {
          courseId: {
            $cond: {
              if: { $gt: [{ $size: '$course' }, 0] },
              then: {
                _id: '$courseId',
                name: { $arrayElemAt: ['$course.name', 0] }
              },
              else: '$courseId'
            }
          }
        }
      },
      { $project: { course: 0 } }
    ];

    // If minimal, only project essential fields
    if (minimal) {
      pipeline.push({
        $project: {
          title: 1,
          order: 1,
          isPublished: 1,
          courseId: 1,
          videoUrl: 1,
          pdfUrl: 1
        }
      });
    }

    const topics = await Topic.aggregate(pipeline).allowDiskUse(true);
    const totalTopics = await Topic.countDocuments();

    res.json({
      topics,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTopics / limit),
        totalTopics,
        hasMore: skip + topics.length < totalTopics
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single topic
// @route   GET /api/topics/:id
// @access  Public
export const getTopicById = async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id)
      .populate('courseId', 'name color')
      .lean();

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

    // Get the next order number if not provided using aggregation
    let topicOrder = order;
    if (topicOrder === undefined) {
      const result = await Topic.aggregate([
        { $match: { courseId: new (await import('mongoose')).default.Types.ObjectId(courseId) } },
        { $group: { _id: null, maxOrder: { $max: '$order' } } }
      ]);
      topicOrder = result.length > 0 && result[0].maxOrder !== null ? result[0].maxOrder + 1 : 1;
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
    const result = await Topic.deleteOne({ _id: req.params.id });

    if (result.deletedCount > 0) {
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
    const { topics } = req.body;

    if (!topics || !Array.isArray(topics)) {
      return res.status(400).json({ message: 'Topics array is required' });
    }

    // Use bulkWrite for atomic batch update (single DB operation)
    const bulkOps = topics.map(({ id, order }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order } }
      }
    }));

    await Topic.bulkWrite(bulkOps, { ordered: false });

    res.json({ message: 'Topics reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
