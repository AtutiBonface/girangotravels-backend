import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
	createReviewSchema,
	listReviewsSchema,
	updateReviewStatusSchema,
	reviewInviteTokenSchema,
	submitReviewInviteSchema,
	createReview,
	listApprovedReviews,
	listAllReviews,
	updateReviewStatus,
	getReviewInviteByToken,
	submitReviewByInvite,
} = require('../controllers/reviewController');

const router: Router = express.Router();

router.get('/', listApprovedReviews);
router.post('/', validate(createReviewSchema), createReview);
router.get('/invite/:token', validate(reviewInviteTokenSchema), getReviewInviteByToken);
router.post('/invite/:token', validate(submitReviewInviteSchema), submitReviewByInvite);
router.get('/admin', requireAuth, requireRole('admin'), validate(listReviewsSchema), listAllReviews);
router.patch('/:id/status', requireAuth, requireRole('admin'), validate(updateReviewStatusSchema), updateReviewStatus);

module.exports = router;
