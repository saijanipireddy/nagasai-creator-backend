import bcrypt from 'bcryptjs';
import supabase from '../config/db.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../middleware/auth.js';
import { setAuthCookies, clearAuthCookies, generateCsrfToken, REFRESH_TOKEN_MAX_AGE } from '../middleware/cookies.js';
import { handleError } from '../middleware/errorHandler.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ */
/*  Helper: create tokens, store refresh token, set cookies           */
/* ------------------------------------------------------------------ */
const issueTokens = async (res, admin) => {
  const accessToken = generateAccessToken(admin.id, 'admin');
  const { token: rawRefresh, hash: refreshHash } = generateRefreshToken();
  const csrfToken = generateCsrfToken();

  // Store hashed refresh token in DB
  await supabase.from('refresh_tokens').insert({
    user_id: admin.id,
    user_type: 'admin',
    token_hash: refreshHash,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE).toISOString(),
  });

  setAuthCookies(res, accessToken, rawRefresh, csrfToken);

  return {
    _id: admin.id,
    name: admin.name,
    email: admin.email,
  };
};

// @desc    Register admin
// @route   POST /api/auth/register
// @access  Protected by registration key
export const registerAdmin = async (req, res) => {
  try {
    // Require admin registration key
    const regKey = req.headers['x-admin-registration-key'];
    if (!regKey || regKey !== process.env.ADMIN_REGISTRATION_KEY) {
      return res.status(403).json({ message: 'Forbidden: invalid registration key' });
    }

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

    // Check if admin exists
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin
    const { data: admin, error } = await supabase
      .from('admins')
      .insert({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
      })
      .select('id, name, email')
      .single();

    if (error) throw error;

    const userData = await issueTokens(res, admin);
    res.status(201).json(userData);
  } catch (error) {
    handleError(res, error, 'authController:register');
  }
};

// @desc    Login admin
// @route   POST /api/auth/login
// @access  Public
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    const { data: admin, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !admin) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const userData = await issueTokens(res, admin);
    res.json(userData);
  } catch (error) {
    handleError(res, error, 'authController:login');
  }
};

// @desc    Refresh access token using refresh token cookie
// @route   POST /api/auth/refresh
// @access  Cookie-based
export const refreshToken = async (req, res) => {
  const rawToken = req.cookies?.refresh_token;

  if (!rawToken) {
    clearAuthCookies(res);
    return res.status(401).json({ message: 'No refresh token provided' });
  }

  try {
    const tokenHash = hashToken(rawToken);

    // Look up the refresh token in DB
    const { data: stored, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('user_type', 'admin')
      .is('revoked_at', null)
      .single();

    if (error || !stored || new Date(stored.expires_at) < new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Verify the admin still exists
    const { data: admin } = await supabase
      .from('admins')
      .select('id, name, email')
      .eq('id', stored.user_id)
      .single();

    if (!admin) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'User not found' });
    }

    // Rotate: revoke old token
    await supabase
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', stored.id);

    // Issue fresh tokens
    const userData = await issueTokens(res, admin);
    res.json(userData);
  } catch (error) {
    clearAuthCookies(res);
    handleError(res, error, 'authController:refresh');
  }
};

// @desc    Logout admin — revoke all refresh tokens & clear cookies
// @route   POST /api/auth/logout
// @access  Cookie-based
export const logoutAdmin = async (req, res) => {
  try {
    const rawToken = req.cookies?.refresh_token;

    if (rawToken) {
      const tokenHash = hashToken(rawToken);

      // Revoke this specific refresh token
      await supabase
        .from('refresh_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', tokenHash)
        .eq('user_type', 'admin');
    }

    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  }
};

// @desc    Get admin profile
// @route   GET /api/auth/profile
// @access  Private
export const getAdminProfile = async (req, res) => {
  try {
    res.json({
      _id: req.admin.id,
      name: req.admin.name,
      email: req.admin.email,
    });
  } catch (error) {
    handleError(res, error, 'authController:profile');
  }
};
