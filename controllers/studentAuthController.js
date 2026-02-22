import bcrypt from 'bcryptjs';
import supabase from '../config/db.js';
import { generateToken } from '../middleware/auth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
    const hashedPassword = await bcrypt.hash(password, 8);

    // Create student
    const { data: student, error } = await supabase
      .from('students')
      .insert({
        name,
        email: email.toLowerCase(),
        password: hashedPassword
      })
      .select('id, name, email')
      .single();

    if (error) throw error;

    res.status(201).json({
      _id: student.id,
      name: student.name,
      email: student.email,
      token: generateToken(student.id)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    if (isMatch) {
      res.json({
        _id: student.id,
        name: student.name,
        email: student.email,
        token: generateToken(student.id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      email: req.student.email
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
