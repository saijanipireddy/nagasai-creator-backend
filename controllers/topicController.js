import supabase from '../config/db.js';

// Default empty coding practice object
const emptyCodingPractice = { language: 'javascript', title: '', description: '', referenceImage: '', imageLinks: [], starterCode: '', expectedOutput: '', hints: [], testScript: '', testCases: [] };

// Helper: map topic from Supabase to API format
const mapTopic = (t, practice = [], codingPractice = null) => ({
  _id: t.id,
  courseId: t.course_id,
  title: t.title,
  order: t.sort_order,
  videoUrl: t.video_url,
  pdfUrl: t.pdf_url,
  isPublished: t.is_published,
  practice,
  codingPractice: codingPractice || emptyCodingPractice,
  createdAt: t.created_at,
  updatedAt: t.updated_at
});

// @desc    Get all topics
// @route   GET /api/topics
// @access  Public
export const getTopics = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { data: topics, error } = await supabase
      .from('topics')
      .select('*')
      .order('sort_order')
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const { count } = await supabase
      .from('topics')
      .select('*', { count: 'exact', head: true });

    const mapped = topics.map(t => mapTopic(t));

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

// @desc    Get single topic
// @route   GET /api/topics/:id
// @access  Public
export const getTopicById = async (req, res) => {
  try {
    const { data: topic, error } = await supabase
      .from('topics')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    // Fetch related data
    const [practiceRes, codingRes] = await Promise.all([
      supabase.from('practice_questions').select('*').eq('topic_id', topic.id).order('sort_order'),
      supabase.from('coding_practices').select('*').eq('topic_id', topic.id).maybeSingle()
    ]);

    const practice = (practiceRes.data || []).map(pq => ({
      question: pq.question,
      options: pq.options,
      answer: pq.answer
    }));

    const cp = codingRes.data;
    const codingPractice = cp ? {
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
    } : null;

    res.json(mapTopic(topic, practice, codingPractice));
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

    // Get next order if not provided
    let topicOrder = order;
    if (topicOrder === undefined) {
      const { data: existing } = await supabase
        .from('topics')
        .select('sort_order')
        .eq('course_id', courseId)
        .order('sort_order', { ascending: false })
        .limit(1);
      topicOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 1;
    }

    // Insert topic
    const { data: topic, error } = await supabase
      .from('topics')
      .insert({
        course_id: courseId,
        title,
        sort_order: topicOrder,
        video_url: videoUrl || '',
        pdf_url: pdfUrl || '',
        is_published: isPublished || false
      })
      .select()
      .single();

    if (error) throw error;

    // Insert practice questions
    if (practice && practice.length > 0) {
      const questions = practice.map((q, idx) => ({
        topic_id: topic.id,
        question: q.question,
        options: q.options,
        answer: q.answer,
        sort_order: idx
      }));
      await supabase.from('practice_questions').insert(questions);
    }

    // Insert coding practice
    if (codingPractice?.title) {
      await supabase.from('coding_practices').insert({
        topic_id: topic.id,
        language: codingPractice.language || 'javascript',
        title: codingPractice.title,
        description: codingPractice.description || '',
        reference_image: codingPractice.referenceImage || '',
        image_links: codingPractice.imageLinks || [],
        starter_code: codingPractice.starterCode || '',
        expected_output: codingPractice.expectedOutput || '',
        hints: codingPractice.hints || [],
        test_script: codingPractice.testScript || '',
        test_cases: codingPractice.testCases || [],
      });
    }

    res.status(201).json(mapTopic(topic, practice || [], codingPractice));
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

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (order !== undefined) updates.sort_order = order;
    if (videoUrl !== undefined) updates.video_url = videoUrl;
    if (pdfUrl !== undefined) updates.pdf_url = pdfUrl;
    if (isPublished !== undefined) updates.is_published = isPublished;

    const { data: topic, error } = await supabase
      .from('topics')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    // Replace practice questions
    if (practice !== undefined) {
      await supabase.from('practice_questions').delete().eq('topic_id', req.params.id);
      if (practice.length > 0) {
        const questions = practice.map((q, idx) => ({
          topic_id: req.params.id,
          question: q.question,
          options: q.options,
          answer: q.answer,
          sort_order: idx
        }));
        await supabase.from('practice_questions').insert(questions);
      }
    }

    // Replace coding practice
    if (codingPractice !== undefined) {
      await supabase.from('coding_practices').delete().eq('topic_id', req.params.id);
      if (codingPractice?.title) {
        await supabase.from('coding_practices').insert({
          topic_id: req.params.id,
          language: codingPractice.language || 'javascript',
          title: codingPractice.title,
          description: codingPractice.description || '',
          reference_image: codingPractice.referenceImage || '',
          image_links: codingPractice.imageLinks || [],
          starter_code: codingPractice.starterCode || '',
          expected_output: codingPractice.expectedOutput || '',
          hints: codingPractice.hints || [],
          test_script: codingPractice.testScript || '',
          test_cases: codingPractice.testCases || [],
        });
      }
    }

    res.json(mapTopic(topic, practice, codingPractice));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete topic
// @route   DELETE /api/topics/:id
// @access  Private/Admin
export const deleteTopic = async (req, res) => {
  try {
    // Practice questions and coding practices cascade delete via FK
    const { error } = await supabase
      .from('topics')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Topic removed' });
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

    for (const { id, order } of topics) {
      await supabase
        .from('topics')
        .update({ sort_order: order })
        .eq('id', id);
    }

    res.json({ message: 'Topics reordered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
