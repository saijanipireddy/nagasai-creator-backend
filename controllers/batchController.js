import bcrypt from 'bcryptjs';
import supabase from '../config/db.js';
import { handleError } from '../middleware/errorHandler.js';

// ---------- helpers ----------
const mapBatch = (b) => ({
  _id: b.id,
  name: b.name,
  description: b.description,
  isActive: b.is_active,
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

// @desc    Get all batches
// @route   GET /api/batches
// @access  Private/Admin
export const getBatches = async (req, res) => {
  try {
    const { data: batches, error } = await supabase
      .from('batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get counts for each batch
    const batchIds = batches.map((b) => b.id);

    let courseCountMap = {};
    let studentCountMap = {};

    if (batchIds.length > 0) {
      const [bcRes, sbRes] = await Promise.all([
        supabase.from('batch_courses').select('batch_id').in('batch_id', batchIds),
        supabase.from('student_batches').select('batch_id').in('batch_id', batchIds),
      ]);

      (bcRes.data || []).forEach((r) => {
        courseCountMap[r.batch_id] = (courseCountMap[r.batch_id] || 0) + 1;
      });
      (sbRes.data || []).forEach((r) => {
        studentCountMap[r.batch_id] = (studentCountMap[r.batch_id] || 0) + 1;
      });
    }

    const mapped = batches.map((b) => ({
      ...mapBatch(b),
      courseCount: courseCountMap[b.id] || 0,
      studentCount: studentCountMap[b.id] || 0,
    }));

    res.json({ batches: mapped });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Get single batch with courses and students
// @route   GET /api/batches/:id
// @access  Private/Admin
export const getBatchById = async (req, res) => {
  try {
    const { data: batch, error } = await supabase
      .from('batches')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    // Get assigned courses
    const { data: batchCourses } = await supabase
      .from('batch_courses')
      .select('course_id')
      .eq('batch_id', batch.id);

    const courseIds = (batchCourses || []).map((bc) => bc.course_id);

    let courses = [];
    if (courseIds.length > 0) {
      const { data } = await supabase
        .from('courses')
        .select('id, name, icon, color, is_published')
        .in('id', courseIds);
      courses = (data || []).map((c) => ({
        _id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        isPublished: c.is_published,
      }));
    }

    // Get enrolled students
    const { data: enrollments } = await supabase
      .from('student_batches')
      .select('id, student_id, payment_status, is_active, enrolled_at')
      .eq('batch_id', batch.id)
      .order('enrolled_at', { ascending: false });

    const studentIds = (enrollments || []).map((e) => e.student_id);

    let studentMap = {};
    if (studentIds.length > 0) {
      const { data } = await supabase
        .from('students')
        .select('id, name, email')
        .in('id', studentIds);
      (data || []).forEach((s) => {
        studentMap[s.id] = s;
      });
    }

    const students = (enrollments || []).map((e) => ({
      enrollmentId: e.id,
      _id: e.student_id,
      name: studentMap[e.student_id]?.name || 'Unknown',
      email: studentMap[e.student_id]?.email || '',
      paymentStatus: e.payment_status,
      isActive: e.is_active,
      enrolledAt: e.enrolled_at,
    }));

    res.json({
      ...mapBatch(batch),
      courses,
      students,
    });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Create batch
// @route   POST /api/batches
// @access  Private/Admin
export const createBatch = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Batch name is required' });
    }

    const { data: batch, error } = await supabase
      .from('batches')
      .insert({
        name,
        description: description || '',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(mapBatch(batch));
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Update batch
// @route   PUT /api/batches/:id
// @access  Private/Admin
export const updateBatch = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: batch, error } = await supabase
      .from('batches')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    res.json(mapBatch(batch));
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Delete batch
// @route   DELETE /api/batches/:id
// @access  Private/Admin
export const deleteBatch = async (req, res) => {
  try {
    const { error } = await supabase
      .from('batches')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Batch deleted successfully' });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// ============================================
// Batch ↔ Course assignment
// ============================================

// @desc    Assign courses to a batch
// @route   POST /api/batches/:id/courses
// @access  Private/Admin
export const assignCourses = async (req, res) => {
  try {
    const { courseIds } = req.body;
    const batchId = req.params.id;

    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ message: 'courseIds array is required' });
    }

    const rows = courseIds.map((courseId) => ({
      batch_id: batchId,
      course_id: courseId,
    }));

    const { error } = await supabase
      .from('batch_courses')
      .upsert(rows, { onConflict: 'batch_id,course_id', ignoreDuplicates: true });

    if (error) throw error;
    res.json({ message: 'Courses assigned successfully' });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Remove a course from a batch
// @route   DELETE /api/batches/:id/courses/:courseId
// @access  Private/Admin
export const removeCourse = async (req, res) => {
  try {
    const { error } = await supabase
      .from('batch_courses')
      .delete()
      .eq('batch_id', req.params.id)
      .eq('course_id', req.params.courseId);

    if (error) throw error;
    res.json({ message: 'Course removed from batch' });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// ============================================
// Batch ↔ Student enrollment
// ============================================

// @desc    Enroll students in a batch
// @route   POST /api/batches/:id/students
// @access  Private/Admin
export const enrollStudents = async (req, res) => {
  try {
    const { studentIds, paymentStatus = 'paid' } = req.body;
    const batchId = req.params.id;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds array is required' });
    }

    const rows = studentIds.map((studentId) => ({
      student_id: studentId,
      batch_id: batchId,
      payment_status: paymentStatus,
      is_active: true,
    }));

    const { error } = await supabase
      .from('student_batches')
      .upsert(rows, { onConflict: 'student_id,batch_id' });

    if (error) throw error;
    res.json({ message: 'Students enrolled successfully' });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Update a student's enrollment (toggle active, change payment status)
// @route   PUT /api/batches/:id/students/:studentId
// @access  Private/Admin
export const updateEnrollment = async (req, res) => {
  try {
    const { isActive, paymentStatus } = req.body;

    const updates = {};
    if (isActive !== undefined) updates.is_active = isActive;
    if (paymentStatus !== undefined) updates.payment_status = paymentStatus;

    const { data, error } = await supabase
      .from('student_batches')
      .update(updates)
      .eq('batch_id', req.params.id)
      .eq('student_id', req.params.studentId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Enrollment not found' });

    res.json({
      enrollmentId: data.id,
      studentId: data.student_id,
      batchId: data.batch_id,
      paymentStatus: data.payment_status,
      isActive: data.is_active,
    });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Remove a student from a batch
// @route   DELETE /api/batches/:id/students/:studentId
// @access  Private/Admin
export const removeStudent = async (req, res) => {
  try {
    const { error } = await supabase
      .from('student_batches')
      .delete()
      .eq('batch_id', req.params.id)
      .eq('student_id', req.params.studentId);

    if (error) throw error;
    res.json({ message: 'Student removed from batch' });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// ============================================
// Onboard student (admin creates student account)
// ============================================

// @desc    Onboard a new student (admin creates account)
// @route   POST /api/batches/students/onboard
// @access  Private/Admin
export const onboardStudent = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check if student already exists
    const { data: existing } = await supabase
      .from('students')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ message: 'A student with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create student
    const insertData = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
    };
    if (phone) insertData.phone = phone;

    const { data: student, error } = await supabase
      .from('students')
      .insert(insertData)
      .select('id, name, email, phone, created_at')
      .single();

    if (error) throw error;

    res.status(201).json({
      _id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      createdAt: student.created_at,
    });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// ============================================
// All students list (for enrollment picker)
// ============================================

// @desc    Get all students (for admin to pick from)
// @route   GET /api/batches/students/all
// @access  Private/Admin
export const getAllStudents = async (req, res) => {
  try {
    const { data: students, error } = await supabase
      .from('students')
      .select('id, name, email, created_at')
      .order('name');

    if (error) throw error;

    res.json({
      students: (students || []).map((s) => ({
        _id: s.id,
        name: s.name,
        email: s.email,
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// ============================================
// Student-facing: get my enrolled courses
// ============================================

// @desc    Get courses the authenticated student has access to
// @route   GET /api/student/my-courses
// @access  Private/Student
export const getMyEnrolledCourses = async (req, res) => {
  try {
    const studentId = req.student.id;

    // Get active enrollments for this student (paid OR free)
    const { data: enrollments, error: enrErr } = await supabase
      .from('student_batches')
      .select('batch_id')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .in('payment_status', ['paid', 'free']);

    if (enrErr) throw enrErr;

    if (!enrollments || enrollments.length === 0) {
      return res.json({ courses: [], batches: [] });
    }

    const batchIds = enrollments.map((e) => e.batch_id);

    // Get batch details + course IDs in parallel
    const [batchRes, bcRes] = await Promise.all([
      supabase.from('batches').select('id, name').in('id', batchIds).eq('is_active', true),
      supabase.from('batch_courses').select('course_id').in('batch_id', batchIds),
    ]);

    if (batchRes.error) throw batchRes.error;
    if (bcRes.error) throw bcRes.error;

    const batches = (batchRes.data || []).map((b) => ({ _id: b.id, name: b.name }));
    const courseIds = [...new Set((bcRes.data || []).map((bc) => bc.course_id))];

    if (courseIds.length === 0) {
      return res.json({ courses: [], batches });
    }

    // Get courses + topic completions in parallel
    const [coursesRes, topicsRes, completionsRes] = await Promise.all([
      supabase
        .from('courses_with_topic_count')
        .select('*')
        .in('id', courseIds)
        .eq('is_published', true)
        .order('sort_order'),
      supabase
        .from('topics')
        .select('id, course_id')
        .in('course_id', courseIds),
      supabase
        .from('topic_completions')
        .select('topic_id, item_type')
        .eq('student_id', studentId),
    ]);

    if (coursesRes.error) throw coursesRes.error;
    if (topicsRes.error) throw topicsRes.error;
    if (completionsRes.error) throw completionsRes.error;

    // Build completion map: { topicId: Set(['video', 'ppt', ...]) }
    const completionMap = {};
    for (const row of completionsRes.data || []) {
      if (!completionMap[row.topic_id]) completionMap[row.topic_id] = new Set();
      completionMap[row.topic_id].add(row.item_type);
    }

    // Build course → topicIds map
    const courseTopicsMap = {};
    for (const t of topicsRes.data || []) {
      if (!courseTopicsMap[t.course_id]) courseTopicsMap[t.course_id] = [];
      courseTopicsMap[t.course_id].push(t.id);
    }

    const mapped = (coursesRes.data || []).map((c) => {
      const topicIds = courseTopicsMap[c.id] || [];
      const totalTopics = topicIds.length;
      // A topic is "completed" if it has at least one completion entry
      const completedTopics = topicIds.filter((tid) => completionMap[tid] && completionMap[tid].size > 0).length;
      const progress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

      return {
        _id: c.id,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        order: c.sort_order,
        isPublished: c.is_published,
        totalTopics,
        completedTopics,
        progress,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });

    res.json({ courses: mapped, batches });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Check if student has access to a specific course
// @route   GET /api/student/check-access/:courseId
// @access  Private/Student
export const checkCourseAccess = async (req, res) => {
  try {
    const studentId = req.student.id;
    const courseId = req.params.courseId;

    const { data: enrollments } = await supabase
      .from('student_batches')
      .select('batch_id')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .in('payment_status', ['paid', 'free']);

    if (!enrollments || enrollments.length === 0) {
      return res.json({ hasAccess: false });
    }

    const batchIds = enrollments.map((e) => e.batch_id);

    const { data: match } = await supabase
      .from('batch_courses')
      .select('id')
      .in('batch_id', batchIds)
      .eq('course_id', courseId)
      .limit(1);

    res.json({ hasAccess: (match && match.length > 0) });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};
