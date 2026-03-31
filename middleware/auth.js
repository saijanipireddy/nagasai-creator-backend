import jwt from 'jsonwebtoken';
import supabase from '../config/db.js';

/* -------------------- USER CACHE (30s TTL, 5000 cap) -------------------- */
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
    // Evict oldest entry
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
  userCache.set(key, { data, ts: Date.now() });
};

/* -------------------- ADMIN PROTECT -------------------- */
export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject if role is missing or not 'admin'
    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized, admin access required' });
    }

    // Check cache first
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

/* -------------------- STUDENT PROTECT -------------------- */
export const studentProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject if role is missing or not 'student'
    if (!decoded.role || decoded.role !== 'student') {
      return res.status(401).json({ message: 'Not authorized, student access required' });
    }

    // Check cache first
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

/* -------------------- TOKEN GENERATION -------------------- */
export const generateToken = (id, role = 'student') => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};
