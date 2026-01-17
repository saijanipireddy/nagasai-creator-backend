import Course from '../models/Course.js';
import Topic from '../models/Topic.js';

// @desc    Get all courses
// @route   GET /api/courses
// @access  Public
export const getCourses = async (req, res) => {
  try {
    // Use MongoDB aggregation to get courses with topic counts in ONE query
    // This fixes the N+1 query problem - previously we ran 1 + N queries
    const coursesWithStats = await Course.aggregate([
      // Sort by order first
      { $sort: { order: 1 } },
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
          completedTopics: 0, // Will be updated when user progress is implemented
          progress: 0
        }
      },
      // Remove the full topics array to keep response light
      {
        $project: {
          topicsList: 0
        }
      }
    ]);

    res.json(coursesWithStats);
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
    const topics = await Topic.find({ courseId: req.params.id }).sort({ order: 1 });
    res.json(topics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/stats
// @access  Private/Admin
export const getStats = async (req, res) => {
  try {
    const totalCourses = await Course.countDocuments();
    const totalTopics = await Topic.countDocuments();
    const publishedCourses = await Course.countDocuments({ isPublished: true });

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

    // Update each course's order
    const updatePromises = courses.map((course, index) =>
      Course.findByIdAndUpdate(course._id, { order: index }, { new: true })
    );

    await Promise.all(updatePromises);

    res.json({ message: 'Courses reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
