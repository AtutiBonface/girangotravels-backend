import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createPaymentSchema,
  bookingPaymentsSchema,
  updatePaymentStatusSchema,
  createPayment,
  getPaymentsByBooking,
  updatePaymentStatus,
} = require('../controllers/paymentController');

const router: Router = express.Router();

router.post('/', requireAuth, validate(createPaymentSchema), createPayment);
router.get('/booking/:bookingId', requireAuth, validate(bookingPaymentsSchema), getPaymentsByBooking);
router.patch('/:id/status', requireAuth, requireRole('admin'), validate(updatePaymentStatusSchema), updatePaymentStatus);

module.exports = router;
