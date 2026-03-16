import type { Router } from 'express';

const express = require('express') as typeof import('express');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createBookingSchema,
  listBookingsSchema,
  bookingIdSchema,
  updateBookingStatusSchema,
  createBooking,
  listMyBookings,
  listAllBookings,
  getBookingById,
  updateBookingStatus,
} = require('../controllers/bookingController');

const router: Router = express.Router();

router.post('/', requireAuth, validate(createBookingSchema), createBooking);
router.get('/mine', requireAuth, listMyBookings);
router.get('/', requireAuth, requireRole('admin'), validate(listBookingsSchema), listAllBookings);
router.get('/:id', requireAuth, validate(bookingIdSchema), getBookingById);
router.patch('/:id/status', requireAuth, requireRole('admin'), validate(updateBookingStatusSchema), updateBookingStatus);

module.exports = router;
