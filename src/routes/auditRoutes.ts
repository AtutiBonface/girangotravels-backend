import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listAuditLogsSchema, listAuditLogs } = require('../controllers/auditController');

const router: Router = express.Router();

router.get('/', requireAuth, requireRole('admin'), validate(listAuditLogsSchema), listAuditLogs);

module.exports = router;
