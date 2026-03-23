import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createPaymentSchema,
  bookingPaymentsSchema,
  updatePaymentStatusSchema,
  initializePaystackPaymentSchema,
  verifyPaystackPaymentSchema,
  paymentStatusSchema,
  createPayment,
  initializePaystackPayment,
  getPaymentsByBooking,
  updatePaymentStatus,
  verifyPaystackPayment,
  getPaymentStatus,
} = require('../controllers/paymentController');


const router: Router = express.Router();

router.post('/paystack/initialize', validate(initializePaystackPaymentSchema), initializePaystackPayment);
router.post('/:id/verify', validate(verifyPaystackPaymentSchema), verifyPaystackPayment);
router.get('/:id/status', validate(paymentStatusSchema), getPaymentStatus);
router.post('/', requireAuth, validate(createPaymentSchema), createPayment);
router.get('/booking/:bookingId', requireAuth, validate(bookingPaymentsSchema), getPaymentsByBooking);
router.patch('/:id/status', requireAuth, requireRole('admin'), validate(updatePaymentStatusSchema), updatePaymentStatus);

module.exports = router;
