import bcrypt from 'bcryptjs';
import supabase from '../config/db.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../middleware/auth.js';
import { setAuthCookies, clearAuthCookies, generateCsrfToken, REFRESH_TOKEN_MAX_AGE } from '../middleware/cookies.js';
import { handleError } from '../middleware/errorHandler.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ */
/*  Helper: create tokens, store refresh token, set cookies           */
/* ------------------------------------------------------------------ */
const issueTokens = async (res, student) => {
  const accessToken = generateAccessToken(student.id, 'student');
  const { token: rawRefresh, hash: refreshHash } = generateRefreshToken();
  const csrfToken = generateCsrfToken();

  await supabase.from('refresh_tokens').insert({
    user_id: student.id,
    user_type: 'student',
    token_hash: refreshHash,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE).toISOString(),
  });

  // Set HttpOnly cookies (works when same-origin / cookies not blocked)
  setAuthCookies(res, accessToken, rawRefresh, csrfToken);

  // ALSO return tokens in body (works cross-origin even when cookies are blocked)
  return {
    _id: student.id,
    name: student.name,
    email: student.email,
    accessToken,
    refreshToken: rawRefresh,
  };
};

// @desc    Register student
// @route   POST /api/student-auth/register
// @access  Public
export const registerStudent = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check if student exists
    const { data: existing } = await supabase
      .from('students')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ message: 'Student already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create student
    const { data: student, error } = await supabase
      .from('students')
      .insert({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
      })
      .select('id, name, email')
      .single();

    if (error) throw error;

    const userData = await issueTokens(res, student);
    res.status(201).json(userData);
  } catch (error) {
    handleError(res, error, 'studentAuthController:register');
  }
};

// @desc    Login student
// @route   POST /api/student-auth/login
// @access  Public
export const loginStudent = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !student) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, student.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const userData = await issueTokens(res, student);
    res.json(userData);
  } catch (error) {
    handleError(res, error, 'studentAuthController:login');
  }
};

// @desc    Refresh access token using refresh token cookie
// @route   POST /api/student-auth/refresh
// @access  Cookie-based
export const refreshTokenStudent = async (req, res) => {
  // Accept refresh token from cookie (primary) or Authorization header (cross-origin fallback)
  let rawToken = req.cookies?.refresh_token;
  if (!rawToken) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.split(' ')[1];
    }
  }

  if (!rawToken) {
    clearAuthCookies(res);
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  try {
    const tokenHash = hashToken(rawToken);

    const { data: stored, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('user_type', 'student')
      .is('revoked_at', null)
      .single();

    if (error || !stored || new Date(stored.expires_at) < new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const { data: student } = await supabase
      .from('students')
      .select('id, name, email')
      .eq('id', stored.user_id)
      .single();

    if (!student) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'User not found' });
    }

    // Rotate: revoke old token
    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', stored.id);

    const userData = await issueTokens(res, student);
    res.json(userData);
  } catch (error) {
    clearAuthCookies(res);
    handleError(res, error, 'studentAuthController:refresh');
  }
};

// @desc    Logout student — revoke refresh token & clear cookies
// @route   POST /api/student-auth/logout
// @access  Cookie-based
export const logoutStudent = async (req, res) => {
  try {
    const rawToken = req.cookies?.refresh_token;

    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      await supabase
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', tokenHash)
        .eq('user_type', 'student');
    }

    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  }
};

// @desc    Get student profile
// @route   GET /api/student-auth/profile
// @access  Private
export const getStudentProfile = async (req, res) => {
  try {
    res.json({
      _id: req.student.id,
      name: req.student.name,
      email: req.student.email,
    });
  } catch (error) {
    handleError(res, error, 'studentAuthController:profile');
  }
};
