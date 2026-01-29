import Course from '../models/Course.js';
import Topic from '../models/Topic.js';

// @desc    Get all courses
// @route   GET /api/courses
// @access  Public
export const getCourses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Use MongoDB aggregation to get courses with topic counts in ONE query
    const coursesWithStats = await Course.aggregate([
      // Sort by order first
      { $sort: { order: 1 } },
      // Pagination
      { $skip: skip },
      { $limit: limit },
      // Lookup topics and count them
      {
        $lookup: {
          from: 'topics',
          localField: '_id',
          foreignField: 'courseId',
          as: 'topicsList'
        }
      },
      // Add computed fields
      {
        $addFields: {
          totalTopics: { $size: '$topicsList' },
          completedTopics: 0,
          progress: 0
        }
      },
      // Remove the full topics array to keep response light
      {
        $project: {
          topicsList: 0
        }
      }
    ]).allowDiskUse(true);

    // Get total count for pagination info
    const totalCourses = await Course.countDocuments();

    res.json({
      courses: coursesWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCourses / limit),
        totalCourses,
        hasMore: skip + coursesWithStats.length < totalCourses
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Public
export const getCourseById = async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const courseId = new mongoose.default.Types.ObjectId(req.params.id);

    // Use aggregation to get course with topic count in single query
    const result = await Course.aggregate([
      { $match: { _id: courseId } },
      {
        $lookup: {
          from: 'topics',
          localField: '_id',
          foreignField: 'courseId',
          as: 'topicsList'
        }
      },
      {
        $addFields: {
          totalTopics: { $size: '$topicsList' },
          completedTopics: 0,
          progress: 0
        }
      },
      {
        $project: {
          topicsList: 0
        }
      }
    ]);

    if (result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(404).json({ message: 'Course not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create course
// @route   POST /api/courses
// @access  Private/Admin
export const createCourse = async (req, res) => {
  try {
    const { name, description, icon, color, order, isPublished } = req.body;

    const course = await Course.create({
      name,
      description,
      icon,
      color,
      order,
      isPublished
    });

    res.status(201).json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private/Admin
export const updateCourse = async (req, res) => {
  try {
    const { name, description, icon, color, order, isPublished } = req.body;

    const course = await Course.findById(req.params.id);

    if (course) {
      course.name = name || course.name;
      course.description = description || course.description;
      course.icon = icon || course.icon;
      course.color = color || course.color;
      course.order = order !== undefined ? order : course.order;
      course.isPublished = isPublished !== undefined ? isPublished : course.isPublished;

      const updatedCourse = await course.save();
      res.json(updatedCourse);
    } else {
      res.status(404).json({ message: 'Course not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private/Admin
export const deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (course) {
      // Delete all topics associated with this course
      await Topic.deleteMany({ courseId: course._id });
      await Course.deleteOne({ _id: course._id });
      res.json({ message: 'Course and its topics removed' });
    } else {
      res.status(404).json({ message: 'Course not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get course topics
// @route   GET /api/courses/:id/topics
// @access  Public
export const getCourseTopics = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    const minimal = req.query.minimal === 'true';

    let query = Topic.find({ courseId: req.params.id })
      .sort({ order: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // If minimal flag is set, only return essential fields (for list views)
    if (minimal) {
      query = query.select('title order isPublished videoUrl pdfUrl');
    }

    const topics = await query;
    const totalTopics = await Topic.countDocuments({ courseId: req.params.id });

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

// @desc    Get dashboard stats
// @route   GET /api/stats
// @access  Private/Admin
export const getStats = async (req, res) => {
  try {
    // Use Promise.all for parallel execution
    const [totalCourses, totalTopics, publishedCourses] = await Promise.all([
      Course.countDocuments(),
      Topic.countDocuments(),
      Course.countDocuments({ isPublished: true })
    ]);

    res.json({
      totalCourses,
      totalTopics,
      publishedCourses,
      draftCourses: totalCourses - publishedCourses
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reorder courses
// @route   PUT /api/courses/reorder
// @access  Private/Admin
export const reorderCourses = async (req, res) => {
  try {
    const { courses } = req.body;

    if (!courses || !Array.isArray(courses)) {
      return res.status(400).json({ message: 'Courses array is required' });
    }

    // Use bulkWrite for atomic batch update (single DB operation)
    const bulkOps = courses.map((course, index) => ({
      updateOne: {
        filter: { _id: course._id },
        update: { $set: { order: index } }
      }
    }));

    await Course.bulkWrite(bulkOps, { ordered: false });

    res.json({ message: 'Courses reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
