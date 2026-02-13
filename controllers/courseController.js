import supabase from '../config/db.js';

// @desc    Get all courses
// @route   GET /api/courses
// @access  Public
export const getCourses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Get courses with topic counts from view
    const { data: courses, error } = await supabase
      .from('courses_with_topic_count')
      .select('*')
      .order('sort_order')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get total count
    const { count } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true });

    // Map to match old API format
    const mapped = courses.map(c => ({
      _id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      color: c.color,
      order: c.sort_order,
      isPublished: c.is_published,
      totalTopics: c.total_topics || 0,
      completedTopics: 0,
      progress: 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    res.json({
      courses: mapped,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
        totalCourses: count || 0,
        hasMore: offset + courses.length < (count || 0)
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
    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Get topic count
    const { count } = await supabase
      .from('topics')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id);

    res.json({
      _id: course.id,
      name: course.name,
      description: course.description,
      icon: course.icon,
      color: course.color,
      order: course.sort_order,
      isPublished: course.is_published,
      totalTopics: count || 0,
      completedTopics: 0,
      progress: 0,
      createdAt: course.created_at,
      updatedAt: course.updated_at
    });
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

    const { data: course, error } = await supabase
      .from('courses')
      .insert({
        name,
        description: description || '',
        icon: icon || 'FaBook',
        color: color || '#e94560',
        sort_order: order || 0,
        is_published: isPublished || false
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      _id: course.id,
      name: course.name,
      description: course.description,
      icon: course.icon,
      color: course.color,
      order: course.sort_order,
      isPublished: course.is_published,
      createdAt: course.created_at,
      updatedAt: course.updated_at
    });
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

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;
    if (color !== undefined) updates.color = color;
    if (order !== undefined) updates.sort_order = order;
    if (isPublished !== undefined) updates.is_published = isPublished;

    const { data: course, error } = await supabase
      .from('courses')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({
      _id: course.id,
      name: course.name,
      description: course.description,
      icon: course.icon,
      color: course.color,
      order: course.sort_order,
      isPublished: course.is_published,
      createdAt: course.created_at,
      updatedAt: course.updated_at
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private/Admin
export const deleteCourse = async (req, res) => {
  try {
    // Topics are cascade deleted via FK constraint
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Course and its topics removed' });
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
    const offset = (page - 1) * limit;

    const { data: topics, error } = await supabase
      .from('topics')
      .select('*')
      .eq('course_id', req.params.id)
      .order('sort_order')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get practice questions and coding practices for these topics
    const topicIds = topics.map(t => t.id);

    let practiceData = [];
    let codingData = [];

    if (topicIds.length > 0) {
      const [pRes, cRes] = await Promise.all([
        supabase.from('practice_questions').select('*').in('topic_id', topicIds).order('sort_order'),
        supabase.from('coding_practices').select('*').in('topic_id', topicIds)
      ]);
      practiceData = pRes.data || [];
      codingData = cRes.data || [];
    }

    // Group by topic
    const practiceByTopic = {};
    practiceData.forEach(pq => {
      if (!practiceByTopic[pq.topic_id]) practiceByTopic[pq.topic_id] = [];
      practiceByTopic[pq.topic_id].push({
        question: pq.question,
        options: pq.options,
        answer: pq.answer
      });
    });

    const codingByTopic = {};
    codingData.forEach(cp => {
      codingByTopic[cp.topic_id] = {
        language: cp.language,
        title: cp.title,
        description: cp.description,
        referenceImage: cp.reference_image,
        imageLinks: cp.image_links,
        starterCode: cp.starter_code,
        expectedOutput: cp.expected_output,
        hints: cp.hints,
        testScript: cp.test_script || '',
        testCases: cp.test_cases || [],
      };
    });

    // Map to old format
    const mapped = topics.map(t => ({
      _id: t.id,
      courseId: t.course_id,
      title: t.title,
      order: t.sort_order,
      videoUrl: t.video_url,
      pdfUrl: t.pdf_url,
      isPublished: t.is_published,
      practice: practiceByTopic[t.id] || [],
      codingPractice: codingByTopic[t.id] || { language: 'javascript', title: '', description: '', referenceImage: '', imageLinks: [], starterCode: '', expectedOutput: '', hints: [], testScript: '', testCases: [] },
      createdAt: t.created_at,
      updatedAt: t.updated_at
    }));

    const { count } = await supabase
      .from('topics')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', req.params.id);

    res.json({
      topics: mapped,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil((count || 0) / limit),
        totalTopics: count || 0,
        hasMore: offset + topics.length < (count || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get course topics summary (lightweight — sidebar only)
// @route   GET /api/courses/:id/topics-summary
// @access  Public
export const getCourseTopicsSummary = async (req, res) => {
  try {
    const { data: topics, error } = await supabase
      .from('topics')
      .select('id, title, sort_order, video_url, pdf_url, is_published')
      .eq('course_id', req.params.id)
      .order('sort_order');

    if (error) throw error;

    const topicIds = topics.map(t => t.id);

    let practiceCountMap = {};
    let codingTitleMap = {};

    if (topicIds.length > 0) {
      // Get practice question counts per topic
      const { data: practiceCounts, error: pcErr } = await supabase
        .rpc('count_practice_by_topic', { topic_ids: topicIds })
        .select('*');

      // Fallback: if RPC doesn't exist, do a lightweight count
      if (pcErr) {
        const { data: pqData } = await supabase
          .from('practice_questions')
          .select('topic_id')
          .in('topic_id', topicIds);
        (pqData || []).forEach(pq => {
          practiceCountMap[pq.topic_id] = (practiceCountMap[pq.topic_id] || 0) + 1;
        });
      } else {
        (practiceCounts || []).forEach(row => {
          practiceCountMap[row.topic_id] = row.count;
        });
      }

      // Get coding practice titles per topic
      const { data: codingData } = await supabase
        .from('coding_practices')
        .select('topic_id, title')
        .in('topic_id', topicIds);
      (codingData || []).forEach(cp => {
        codingTitleMap[cp.topic_id] = cp.title;
      });
    }

    const mapped = topics.map(t => ({
      _id: t.id,
      title: t.title,
      order: t.sort_order,
      videoUrl: t.video_url,
      pdfUrl: t.pdf_url,
      isPublished: t.is_published,
      practiceCount: practiceCountMap[t.id] || 0,
      codingPracticeTitle: codingTitleMap[t.id] || '',
    }));

    res.json({ topics: mapped });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/courses/stats
// @access  Private/Admin
export const getStats = async (req, res) => {
  try {
    const [coursesRes, topicsRes, publishedRes] = await Promise.all([
      supabase.from('courses').select('*', { count: 'exact', head: true }),
      supabase.from('topics').select('*', { count: 'exact', head: true }),
      supabase.from('courses').select('*', { count: 'exact', head: true }).eq('is_published', true)
    ]);

    const totalCourses = coursesRes.count || 0;
    const totalTopics = topicsRes.count || 0;
    const publishedCourses = publishedRes.count || 0;

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

    for (let i = 0; i < courses.length; i++) {
      const courseId = courses[i]._id || courses[i].id;
      await supabase
        .from('courses')
        .update({ sort_order: i })
        .eq('id', courseId);
    }

    res.json({ message: 'Courses reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
