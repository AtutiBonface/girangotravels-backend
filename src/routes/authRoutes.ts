import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
	registerSchema,
	loginSchema,
	createStaffSchema,
	changePasswordSchema,
	register,
	login,
	me,
	createStaffMember,
	changePassword,
} = require('../controllers/authController');

const router: Router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/me', requireAuth, me);
router.post('/admin/staff', requireAuth, requireRole('admin'), validate(createStaffSchema), createStaffMember);
router.patch('/me/password', requireAuth, validate(changePasswordSchema), changePassword);

module.exports = router;
