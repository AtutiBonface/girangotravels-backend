import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createContactSchema,
  updateContactStatusSchema,
  replyContactSchema,
  createContactMessage,
  listContactMessages,
  updateContactStatus,
  replyContact,
} = require('../controllers/contactController');

const router: Router = express.Router();

router.post('/', validate(createContactSchema), createContactMessage);
router.get('/', requireAuth, requireRole('admin'), listContactMessages);
router.patch('/:id/status', requireAuth, requireRole('admin'), validate(updateContactStatusSchema), updateContactStatus);
router.post('/:id/reply', requireAuth, requireRole('admin'), validate(replyContactSchema), replyContact);

module.exports = router;
