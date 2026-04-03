import bcrypt from 'bcryptjs';
import supabase from '../config/db.js';
import { handleError } from '../middleware/errorHandler.js';

// Sentinel date used when admin manually locks a topic via toggle.
// Must match the value checked in admin + student frontends.
export const MANUAL_LOCK_DATE = '2099-12-31';

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

// ============================================
// Batch ↔ Topic Schedule (per-batch topic unlock)
// ============================================

// @desc    Get topic schedule for a batch + course
// @route   GET /api/batches/:id/schedule/:courseId
// @access  Private/Admin
export const getSchedule = async (req, res) => {
  try {
    const batchId = req.params.id;
    const courseId = req.params.courseId;

    // Get topics for this course (ordered)
    const { data: topics, error: tErr } = await supabase
      .from('topics')
      .select('id, title, sort_order')
      .eq('course_id', courseId)
      .order('sort_order');

    if (tErr) throw tErr;

    // Get existing schedule entries for this batch + these topics
    const topicIds = (topics || []).map((t) => t.id);
    let scheduleMap = {};

    if (topicIds.length > 0) {
      const { data: schedules, error: sErr } = await supabase
        .from('batch_topic_schedule')
        .select('*')
        .eq('batch_id', batchId)
        .in('topic_id', topicIds);

      if (sErr) throw sErr;

      for (const s of schedules || []) {
        scheduleMap[s.topic_id] = {
          _id: s.id,
          unlockDate: s.unlock_date,
          isUnlocked: s.is_unlocked,
        };
      }
    }

    const today = new Date().toISOString().split('T')[0];

    const result = (topics || []).map((t) => {
      const sched = scheduleMap[t.id] || null;
      // A topic is accessible if: no schedule exists (unrestricted) OR
      // manually unlocked OR unlock_date <= today
      const isAccessible = !sched || sched.isUnlocked || sched.unlockDate <= today;

      return {
        _id: t.id,
        title: t.title,
        sortOrder: t.sort_order,
        schedule: sched,
        isAccessible,
      };
    });

    res.json({ topics: result });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Auto-schedule topics for a batch + course (1 topic/day starting from startDate)
// @route   POST /api/batches/:id/schedule/auto
// @access  Private/Admin
export const autoSchedule = async (req, res) => {
  try {
    const batchId = req.params.id;
    const { courseId, startDate, topicsPerDay = 1 } = req.body;

    // Get topics for this course (ordered)
    const { data: topics, error: tErr } = await supabase
      .from('topics')
      .select('id, sort_order')
      .eq('course_id', courseId)
      .order('sort_order');

    if (tErr) throw tErr;
    if (!topics || topics.length === 0) {
      return res.status(404).json({ message: 'No topics found for this course' });
    }

    // Verify this course is assigned to the batch
    const { data: bcCheck } = await supabase
      .from('batch_courses')
      .select('id')
      .eq('batch_id', batchId)
      .eq('course_id', courseId)
      .limit(1);

    if (!bcCheck || bcCheck.length === 0) {
      return res.status(400).json({ message: 'This course is not assigned to this batch' });
    }

    // Build schedule rows: topicsPerDay topics share the same date
    const rows = [];
    const start = new Date(startDate + 'T00:00:00');

    topics.forEach((topic, index) => {
      const dayOffset = Math.floor(index / topicsPerDay);
      const date = new Date(start);
      date.setDate(date.getDate() + dayOffset);

      rows.push({
        batch_id: batchId,
        topic_id: topic.id,
        unlock_date: date.toISOString().split('T')[0],
        is_unlocked: false,
      });
    });

    // Upsert: if schedule already exists for batch+topic, update it
    const { error: uErr } = await supabase
      .from('batch_topic_schedule')
      .upsert(rows, { onConflict: 'batch_id,topic_id' });

    if (uErr) throw uErr;

    res.json({
      message: `Scheduled ${topics.length} topics starting ${startDate}`,
      count: topics.length,
    });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Bulk set schedule (admin picks individual dates per topic)
// @route   POST /api/batches/:id/schedule/bulk
// @access  Private/Admin
export const bulkSchedule = async (req, res) => {
  try {
    const batchId = req.params.id;
    const { courseId, schedule } = req.body;

    // Verify course is assigned to batch
    const { data: bcCheck } = await supabase
      .from('batch_courses')
      .select('id')
      .eq('batch_id', batchId)
      .eq('course_id', courseId)
      .limit(1);

    if (!bcCheck || bcCheck.length === 0) {
      return res.status(400).json({ message: 'This course is not assigned to this batch' });
    }

    const rows = schedule.map((s) => ({
      batch_id: batchId,
      topic_id: s.topicId,
      unlock_date: s.unlockDate,
      is_unlocked: false,
    }));

    const { error } = await supabase
      .from('batch_topic_schedule')
      .upsert(rows, { onConflict: 'batch_id,topic_id' });

    if (error) throw error;

    res.json({ message: `Scheduled ${schedule.length} topics`, count: schedule.length });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Manually toggle unlock for a single topic in a batch
// @route   PUT /api/batches/:id/schedule/toggle
// @access  Private/Admin
export const toggleTopicUnlock = async (req, res) => {
  try {
    const batchId = req.params.id;
    const { topicId, unlock } = req.body;

    // Check if schedule entry exists
    const { data: existing } = await supabase
      .from('batch_topic_schedule')
      .select('id, unlock_date')
      .eq('batch_id', batchId)
      .eq('topic_id', topicId)
      .maybeSingle();

    if (existing) {
      const updates = { is_unlocked: unlock };
      // When LOCKING: set unlock_date to far future so the date check doesn't bypass the lock
      // When UNLOCKING: keep the existing date (is_unlocked=true overrides date anyway)
      if (!unlock) {
        updates.unlock_date = MANUAL_LOCK_DATE;
      }
      const { error } = await supabase
        .from('batch_topic_schedule')
        .update(updates)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      // No schedule entry exists — create one
      const { error } = await supabase
        .from('batch_topic_schedule')
        .insert({
          batch_id: batchId,
          topic_id: topicId,
          // Lock: far future date so it's actually locked
          // Unlock: today's date + is_unlocked=true
          unlock_date: unlock ? new Date().toISOString().split('T')[0] : MANUAL_LOCK_DATE,
          is_unlocked: unlock,
        });
      if (error) throw error;
    }

    res.json({ message: unlock ? 'Topic unlocked' : 'Topic locked', topicId, unlock });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Remove all schedule entries for a batch + course (makes all topics unrestricted)
// @route   DELETE /api/batches/:id/schedule/:courseId
// @access  Private/Admin
export const clearSchedule = async (req, res) => {
  try {
    const batchId = req.params.id;
    const courseId = req.params.courseId;

    // Get topic IDs for this course
    const { data: topics } = await supabase
      .from('topics')
      .select('id')
      .eq('course_id', courseId);

    const topicIds = (topics || []).map((t) => t.id);

    if (topicIds.length > 0) {
      const { error } = await supabase
        .from('batch_topic_schedule')
        .delete()
        .eq('batch_id', batchId)
        .in('topic_id', topicIds);

      if (error) throw error;
    }

    res.json({ message: 'Schedule cleared, all topics are now unrestricted' });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Get topic schedule for student (which topics are unlocked for them)
// @route   GET /api/batches/student/schedule/:courseId
// @access  Private/Student
export const getStudentSchedule = async (req, res) => {
  try {
    const studentId = req.student.id;
    const courseId = req.params.courseId;

    // Get student's active batch enrollments
    const { data: enrollments } = await supabase
      .from('student_batches')
      .select('batch_id')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .in('payment_status', ['paid', 'free']);

    if (!enrollments || enrollments.length === 0) {
      return res.json({ schedule: {} });
    }

    const batchIds = enrollments.map((e) => e.batch_id);

    // Get topics for this course
    const { data: topics } = await supabase
      .from('topics')
      .select('id')
      .eq('course_id', courseId);

    const topicIds = (topics || []).map((t) => t.id);

    if (topicIds.length === 0) {
      return res.json({ schedule: {} });
    }

    // Get schedule entries for student's batches + these topics
    const { data: schedules, error: sErr } = await supabase
      .from('batch_topic_schedule')
      .select('topic_id, unlock_date, is_unlocked')
      .in('batch_id', batchIds)
      .in('topic_id', topicIds);

    if (sErr) throw sErr;

    const today = new Date().toISOString().split('T')[0];

    // Build per-topic result: topic is accessible if ANY of student's batches has it unlocked
    // If no schedule entry exists for a topic, it's unrestricted (accessible)
    const scheduledTopics = new Set();
    const topicStatus = {};

    for (const s of schedules || []) {
      scheduledTopics.add(s.topic_id);
      const accessible = s.is_unlocked || s.unlock_date <= today;

      // If already accessible from another batch, keep it accessible
      if (!topicStatus[s.topic_id] || accessible) {
        topicStatus[s.topic_id] = {
          unlockDate: s.unlock_date,
          isUnlocked: s.is_unlocked,
          isAccessible: accessible,
        };
      }
    }

    // Build final schedule map: unscheduled topics are not included (frontend treats missing = accessible)
    res.json({ schedule: topicStatus });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// ============================================
// Student Progress (Admin)
// ============================================

// @desc    Get student progress overview for a batch
// @route   GET /api/batches/:id/progress
// @access  Private/Admin
export const getBatchProgress = async (req, res) => {
  try {
    const batchId = req.params.id;

    // Get enrolled students
    const { data: enrollments, error: enrErr } = await supabase
      .from('student_batches')
      .select('student_id, is_active, payment_status')
      .eq('batch_id', batchId);
    if (enrErr) throw enrErr;
    if (!enrollments || enrollments.length === 0) {
      return res.json({ students: [], courses: [] });
    }

    const studentIds = enrollments.map(e => e.student_id);

    // Get batch courses
    const { data: batchCourses } = await supabase
      .from('batch_courses')
      .select('course_id')
      .eq('batch_id', batchId);
    const courseIds = (batchCourses || []).map(bc => bc.course_id);

    // Parallel fetch: students, courses, topics, completions, practice scores, coding submissions
    const [studentsRes, coursesRes, topicsRes, completionsRes, practiceRes, codingRes] = await Promise.all([
      supabase.from('students').select('id, name, email').in('id', studentIds),
      courseIds.length > 0
        ? supabase.from('courses').select('id, name').in('id', courseIds)
        : { data: [], error: null },
      courseIds.length > 0
        ? supabase.from('topics').select('id, course_id, name').in('course_id', courseIds)
        : { data: [], error: null },
      supabase.from('topic_completions').select('student_id, topic_id, item_type').in('student_id', studentIds),
      supabase.from('practice_scores').select('student_id, topic_id, percentage').in('student_id', studentIds),
      supabase.from('coding_submissions').select('student_id, topic_id, passed').in('student_id', studentIds),
    ]);

    if (studentsRes.error) throw studentsRes.error;

    const topics = topicsRes.data || [];
    const topicsByCourse = {};
    for (const t of topics) {
      if (!topicsByCourse[t.course_id]) topicsByCourse[t.course_id] = [];
      topicsByCourse[t.course_id].push(t.id);
    }

    // Build per-student completion map
    const completionsByStudent = {};
    for (const c of completionsRes.data || []) {
      if (!completionsByStudent[c.student_id]) completionsByStudent[c.student_id] = new Set();
      completionsByStudent[c.student_id].add(c.topic_id);
    }

    // Build per-student practice scores
    const practiceByStudent = {};
    for (const p of practiceRes.data || []) {
      if (!practiceByStudent[p.student_id]) practiceByStudent[p.student_id] = { total: 0, count: 0 };
      practiceByStudent[p.student_id].total += parseFloat(p.percentage);
      practiceByStudent[p.student_id].count++;
    }

    // Build per-student coding stats
    const codingByStudent = {};
    for (const c of codingRes.data || []) {
      if (!codingByStudent[c.student_id]) codingByStudent[c.student_id] = { total: 0, passed: 0 };
      codingByStudent[c.student_id].total++;
      if (c.passed) codingByStudent[c.student_id].passed++;
    }

    // Build enrollment status map
    const enrollmentMap = {};
    for (const e of enrollments) {
      enrollmentMap[e.student_id] = { isActive: e.is_active, paymentStatus: e.payment_status };
    }

    const totalTopics = topics.length;

    const students = (studentsRes.data || []).map(s => {
      const completed = completionsByStudent[s.id]?.size || 0;
      const practice = practiceByStudent[s.id];
      const coding = codingByStudent[s.id];
      const enrollment = enrollmentMap[s.id] || {};

      return {
        _id: s.id,
        name: s.name,
        email: s.email,
        isActive: enrollment.isActive,
        paymentStatus: enrollment.paymentStatus,
        topicsCompleted: completed,
        totalTopics,
        progress: totalTopics > 0 ? Math.round((completed / totalTopics) * 100) : 0,
        avgQuizScore: practice ? Math.round(practice.total / practice.count) : 0,
        quizzesTaken: practice?.count || 0,
        codingPassed: coding?.passed || 0,
        codingTotal: coding?.total || 0,
      };
    });

    // Sort by progress descending
    students.sort((a, b) => b.progress - a.progress);

    const courses = (coursesRes.data || []).map(c => ({
      _id: c.id,
      name: c.name,
      topicCount: (topicsByCourse[c.id] || []).length,
    }));

    res.json({ students, courses, totalTopics });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};

// @desc    Get detailed progress for a single student in a batch
// @route   GET /api/batches/:id/students/:studentId/progress
// @access  Private/Admin
export const getStudentProgress = async (req, res) => {
  try {
    const { id: batchId, studentId } = req.params;

    // Verify student is enrolled
    const { data: enrollment } = await supabase
      .from('student_batches')
      .select('id')
      .eq('batch_id', batchId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!enrollment) {
      return res.status(404).json({ message: 'Student not enrolled in this batch' });
    }

    // Get batch courses
    const { data: batchCourses } = await supabase
      .from('batch_courses')
      .select('course_id')
      .eq('batch_id', batchId);
    const courseIds = (batchCourses || []).map(bc => bc.course_id);

    // Fetch everything in parallel
    const [studentRes, coursesRes, topicsRes, completionsRes, practiceRes, codingRes, attemptsRes] = await Promise.all([
      supabase.from('students').select('id, name, email').eq('id', studentId).single(),
      courseIds.length > 0
        ? supabase.from('courses').select('id, name, icon, color').in('id', courseIds).order('sort_order')
        : { data: [], error: null },
      courseIds.length > 0
        ? supabase.from('topics').select('id, course_id, name, sort_order').in('course_id', courseIds).order('sort_order')
        : { data: [], error: null },
      supabase.from('topic_completions').select('topic_id, item_type, completed_at').eq('student_id', studentId),
      supabase.from('practice_scores').select('topic_id, score, total, percentage, updated_at').eq('student_id', studentId),
      supabase.from('coding_submissions').select('topic_id, passed, language, updated_at').eq('student_id', studentId),
      supabase.from('practice_attempts').select('topic_id, attempt_number, score, total, percentage, passed, created_at').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
    ]);

    if (studentRes.error) throw studentRes.error;

    // Build maps
    const completionMap = {};
    for (const c of completionsRes.data || []) {
      if (!completionMap[c.topic_id]) completionMap[c.topic_id] = [];
      completionMap[c.topic_id].push({ type: c.item_type, completedAt: c.completed_at });
    }

    const practiceMap = {};
    for (const p of practiceRes.data || []) {
      practiceMap[p.topic_id] = { score: p.score, total: p.total, percentage: parseFloat(p.percentage), updatedAt: p.updated_at };
    }

    const codingMap = {};
    for (const c of codingRes.data || []) {
      codingMap[c.topic_id] = { passed: c.passed, language: c.language, updatedAt: c.updated_at };
    }

    // Build course → topics with progress
    const courses = (coursesRes.data || []).map(course => {
      const courseTopics = (topicsRes.data || [])
        .filter(t => t.course_id === course.id)
        .map(topic => ({
          _id: topic.id,
          name: topic.name,
          completions: completionMap[topic.id] || [],
          practiceScore: practiceMap[topic.id] || null,
          codingSubmission: codingMap[topic.id] || null,
        }));

      const completedTopics = courseTopics.filter(t => t.completions.length > 0).length;

      return {
        _id: course.id,
        name: course.name,
        icon: course.icon,
        color: course.color,
        topics: courseTopics,
        completedTopics,
        totalTopics: courseTopics.length,
        progress: courseTopics.length > 0 ? Math.round((completedTopics / courseTopics.length) * 100) : 0,
      };
    });

    const recentAttempts = (attemptsRes.data || []).map(a => ({
      topicId: a.topic_id,
      attemptNumber: a.attempt_number,
      score: a.score,
      total: a.total,
      percentage: parseFloat(a.percentage),
      passed: a.passed,
      createdAt: a.created_at,
    }));

    res.json({
      student: {
        _id: studentRes.data.id,
        name: studentRes.data.name,
        email: studentRes.data.email,
      },
      courses,
      recentAttempts,
    });
  } catch (error) {
    handleError(res, error, 'batchController');
  }
};
