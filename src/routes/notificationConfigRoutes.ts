import type { Router } from 'express';

const express = require('express') as typeof import('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  getNotificationConfig,
  updateNotificationConfig,
  getAllNotificationConfigs,
  updateNotificationConfigSchema,
} = require('../controllers/notificationConfigController');

const router: Router = express.Router();

// Get all notification configs
router.get('/', requireAuth, requireRole('admin'), getAllNotificationConfigs);

// Get specific notification config
router.get('/:type', requireAuth, requireRole('admin'), getNotificationConfig);

// Update notification config
router.put('/', requireAuth, requireRole('admin'), validate(updateNotificationConfigSchema), updateNotificationConfig);

module.exports = router;
