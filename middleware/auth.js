import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import supabase from '../config/db.js';

/* ------------------------------------------------------------------ */
/*  USER CACHE (30s TTL, 5000 cap)                                    */
/* ------------------------------------------------------------------ */
const userCache = new Map();
const CACHE_TTL = 30_000;
const CACHE_MAX = 5000;

const getCached = (key) => {
  const entry = userCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    userCache.delete(key);
    return null;
  }
  return entry.data;
};

const setCache = (key, data) => {
  if (userCache.size >= CACHE_MAX) {
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
  userCache.set(key, { data, ts: Date.now() });
};

/* ------------------------------------------------------------------ */
/*  HELPERS: read token from cookie (primary) or header (fallback)    */
/* ------------------------------------------------------------------ */
const extractToken = (req) => {
  // Primary: HttpOnly cookie
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }
  // Fallback: Authorization header (for tools like Postman during development)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return null;
};

/* ------------------------------------------------------------------ */
/*  ADMIN PROTECT                                                     */
/* ------------------------------------------------------------------ */
export const protect = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized, admin access required' });
    }

    const cacheKey = `admin:${decoded.id}`;
    let admin = getCached(cacheKey);

    if (!admin) {
      const { data, error } = await supabase
        .from('admins')
        .select('id, name, email')
        .eq('id', decoded.id)
        .single();

      if (error || !data) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }
      admin = data;
      setCache(cacheKey, admin);
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/* ------------------------------------------------------------------ */
/*  STUDENT PROTECT                                                   */
/* ------------------------------------------------------------------ */
export const studentProtect = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.role || decoded.role !== 'student') {
      return res.status(401).json({ message: 'Not authorized, student access required' });
    }

    const cacheKey = `student:${decoded.id}`;
    let student = getCached(cacheKey);

    if (!student) {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, email')
        .eq('id', decoded.id)
        .single();

      if (error || !data) {
        return res.status(401).json({ message: 'Not authorized, student not found' });
      }
      student = data;
      setCache(cacheKey, student);
    }

    req.student = student;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/* ------------------------------------------------------------------ */
/*  REQUIRE COURSE ACCESS (admin or enrolled student)                 */
/* ------------------------------------------------------------------ */
export const requireCourseAccess = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Authentication required to access course content' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Admins always have full access
    if (decoded.role === 'admin') {
      req.admin = { id: decoded.id };
      return next();
    }

    // Students need enrollment check
    if (decoded.role === 'student') {
      req.student = { id: decoded.id };

      const courseId = req.params.id || req.params.courseId;
      if (!courseId) return next();

      // Check active enrollment with paid/free status
      const { data: enrollments } = await supabase
        .from('student_batches')
        .select('batch_id')
        .eq('student_id', decoded.id)
        .eq('is_active', true)
        .in('payment_status', ['paid', 'free']);

      if (!enrollments || enrollments.length === 0) {
        return res.status(403).json({ message: 'Access denied, enrollment required' });
      }

      const batchIds = enrollments.map((e) => e.batch_id);

      const { data: match } = await supabase
        .from('batch_courses')
        .select('id')
        .in('batch_id', batchIds)
        .eq('course_id', courseId)
        .limit(1);

      if (!match || match.length === 0) {
        return res.status(403).json({ message: 'Access denied, not enrolled in this course' });
      }

      return next();
    }

    return res.status(401).json({ message: 'Invalid token role' });
  } catch {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/* ------------------------------------------------------------------ */
/*  REQUIRE TOPIC ACCESS (looks up course from topic, then checks)    */
/* ------------------------------------------------------------------ */
export const requireTopicAccess = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Authentication required to access topic content' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === 'admin') {
      req.admin = { id: decoded.id };
      return next();
    }

    if (decoded.role === 'student') {
      req.student = { id: decoded.id };

      const topicId = req.params.id;
      if (!topicId) return next();

      // Look up the course this topic belongs to
      const { data: topic } = await supabase
        .from('topics')
        .select('course_id')
        .eq('id', topicId)
        .single();

      if (!topic) {
        return res.status(404).json({ message: 'Topic not found' });
      }

      // Check enrollment in that course
      const { data: enrollments } = await supabase
        .from('student_batches')
        .select('batch_id')
        .eq('student_id', decoded.id)
        .eq('is_active', true)
        .in('payment_status', ['paid', 'free']);

      if (!enrollments || enrollments.length === 0) {
        return res.status(403).json({ message: 'Access denied, enrollment required' });
      }

      const batchIds = enrollments.map((e) => e.batch_id);
      const { data: match } = await supabase
        .from('batch_courses')
        .select('id')
        .in('batch_id', batchIds)
        .eq('course_id', topic.course_id)
        .limit(1);

      if (!match || match.length === 0) {
        return res.status(403).json({ message: 'Access denied, not enrolled in this course' });
      }

      // Check topic schedule: is this topic unlocked for the student's batch?
      const { data: schedules } = await supabase
        .from('batch_topic_schedule')
        .select('unlock_date, is_unlocked')
        .in('batch_id', batchIds)
        .eq('topic_id', topicId);

      // If no schedule entries exist, topic is unrestricted (accessible)
      if (schedules && schedules.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        // Topic is accessible if ANY batch has it unlocked
        const accessible = schedules.some((s) => s.is_unlocked || s.unlock_date <= today);
        if (!accessible) {
          // Find the earliest unlock date to show in the error message
          const earliest = schedules
            .map((s) => s.unlock_date)
            .sort()[0];
          return res.status(403).json({
            message: `This topic is not yet available. It unlocks on ${earliest}`,
            unlockDate: earliest,
            locked: true,
          });
        }
      }

      return next();
    }

    return res.status(401).json({ message: 'Invalid token role' });
  } catch {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/* ------------------------------------------------------------------ */
/*  TOKEN GENERATION                                                  */
/* ------------------------------------------------------------------ */

/** Short-lived access token (15 minutes) */
export const generateAccessToken = (id, role = 'student') => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

/** Refresh token: returns { token, hash } — store hash in DB, send raw token to client */
export const generateRefreshToken = () => {
  const token = randomUUID() + '-' + randomUUID();
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
};

/** Hash a raw refresh token for DB lookup */
export const hashToken = (token) => {
  return createHash('sha256').update(token).digest('hex');
};

// Keep backwards compat export (used by some controllers)
export const generateToken = generateAccessToken;
