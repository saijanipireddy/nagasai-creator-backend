import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'node:os';
import { protect, studentProtect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { grantAccessSchema, sendMessageSchema } from '../schemas/interviewSchemas.js';
import {
  grantAccess,
  revokeAccess,
  listAllAccess,
  listAllInterviews,
  getInterviewReport,
  getMyAccess,
  startInterview,
  sendMessage,
  sendVoice,
  getInterview,
  saveProctoring,
  completeInterview,
} from '../controllers/interviewController.js';

const router = Router();

/* ---- Multer for voice uploads ---- */
const voiceStorage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const uniqueName = `voice-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || '.webm'}`;
    cb(null, uniqueName);
  },
});

const voiceUpload = multer({
  storage: voiceStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB (Whisper limit)
  fileFilter: (req, file, cb) => {
    const allowed = [
      'audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg',
      'audio/mp4', 'audio/x-m4a', 'video/webm', 'audio/flac',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'), false);
    }
  },
});

/* ---- Admin routes ---- */
router.post('/access', protect, validate(grantAccessSchema), grantAccess);
router.delete('/access/:id', protect, revokeAccess);
router.get('/access', protect, listAllAccess);
router.get('/all', protect, listAllInterviews);
router.get('/report/:id', protect, getInterviewReport);

/* ---- Student routes ---- */
router.get('/my-access', studentProtect, getMyAccess);
router.post('/start/:accessId', studentProtect, startInterview);
router.post('/message/:interviewId', studentProtect, validate(sendMessageSchema), sendMessage);
router.post('/voice/:interviewId', studentProtect, voiceUpload.single('audio'), sendVoice);
router.post('/proctoring/:interviewId', studentProtect, saveProctoring);
router.post('/complete/:interviewId', studentProtect, completeInterview);
router.get('/:interviewId', studentProtect, getInterview);

export default router;
