import express from 'express';
import multer from 'multer';
import path from 'path';
import supabase from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Use memory storage — file stays in RAM, then uploads to Supabase Storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Ensure the storage bucket exists
const BUCKET = 'uploads';
const ensureBucket = async () => {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif']
    });
    if (error && process.env.NODE_ENV !== 'production') {
      console.error('Failed to create bucket:', error.message);
    }
  }
};
ensureBucket();

// @desc    Upload file to Supabase Storage
// @route   POST /api/upload
// @access  Private (Admin)
router.post('/', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(uniqueName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      return res.status(500).json({ message: 'Failed to upload file to cloud storage' });
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(data.path);

    res.json({
      message: 'File uploaded successfully',
      filename: uniqueName,
      path: urlData.publicUrl
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
