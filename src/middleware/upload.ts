import type { Request } from 'express';
import multer from 'multer';

const fs = require('node:fs');
const path = require('node:path');
const env = require('../config/env');

const UPLOAD_DIR = env.uploadDir || path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension);
    const safeName = sanitizeFilename(baseName).slice(0, 50) || 'upload';
    
    // Get tour name from form data if provided
    const tourName = (req.body?.tourName as string) || '';
    const tourPrefix = tourName ? sanitizeFilename(tourName).slice(0, 30) : 'tour';
    
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${tourPrefix}-${safeName}-${unique}${extension.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }

    cb(new Error('Only image uploads are supported'));
  },
});

module.exports = {
  upload,
  uploadDirectory: UPLOAD_DIR,
};
