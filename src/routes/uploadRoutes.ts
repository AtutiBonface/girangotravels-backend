import type { Request, Response, Router } from 'express';

const express = require('express') as typeof import('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router: Router = express.Router();

router.post('/', requireAuth, requireRole('admin'), upload.array('files', 10), (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) || [];

  const uploaded = files.map((file) => ({
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: `/uploads/${file.filename}`,
  }));

  return res.status(201).json({
    message: 'Files uploaded',
    files: uploaded,
  });
});

module.exports = router;
