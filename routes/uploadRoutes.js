import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'node:os';
import fs from 'node:fs/promises';
import supabase from '../config/db.js';
import logger from '../config/logger.js';
import { protect } from '../middleware/auth.js';
import { handleError } from '../middleware/errorHandler.js';

const router = express.Router();

// Use disk storage instead of memory to avoid OOM with concurrent uploads.
// Files are written to a temp dir, streamed to Supabase, then cleaned up.
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

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
      logger.error({ err: error }, 'Failed to create bucket');
    }
  }
};
ensureBucket();

// @desc    Upload file to Supabase Storage
// @route   POST /api/upload
// @access  Private (Admin)
router.post('/', protect, upload.single('file'), async (req, res) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Read from temp file (disk-based, not RAM)
    const fileBuffer = await fs.readFile(tempPath);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(req.file.filename, fileBuffer, {
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
      filename: req.file.filename,
      path: urlData.publicUrl
    });
  } catch (error) {
    handleError(res, error, 'uploadRoutes');
  } finally {
    // Clean up temp file
    if (tempPath) fs.unlink(tempPath).catch(() => {});
  }
});

export default router;
