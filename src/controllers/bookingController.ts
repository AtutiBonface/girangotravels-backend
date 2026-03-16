import type { NextFunction, Response } from 'express';
import type { AuthenticatedValidatedRequest, RequestWithUser } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { customAlphabet } = require('nanoid');
const { Booking, Tour, Payment, User } = require('../models');
const HttpError = require('../utils/httpError');
const { notifyNewBooking } = require('../services/notificationService');
const { logAuditEvent } = require('../services/auditService');

const reservationCodeGenerator = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ123456789', 8);

const createBookingSchema = z.object({
  body: z.object({
    tourId: z.string().uuid(),
    travelDate: z.string().date(),
    travelers: z.number().int().positive(),
    specialRequests: z.string().optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const bookingIdSchema = z.object({
  body: z.object({}),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const updateBookingStatusSchema = z.object({
  body: z
    .object({
      status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
      paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, 'Provide status or paymentStatus'),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

type CreateBookingInput = ZodInfer<typeof createBookingSchema>;
type BookingIdInput = ZodInfer<typeof bookingIdSchema>;
type UpdateBookingStatusInput = ZodInfer<typeof updateBookingStatusSchema>;

async function createBooking(
  req: AuthenticatedValidatedRequest<CreateBookingInput['body'], CreateBookingInput['params'], CreateBookingInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { tourId, travelDate, travelers, specialRequests } = req.validated.body;

    const tour = await Tour.findOne({ where: { id: tourId, isActive: true } });
    if (!tour) {
      throw new HttpError(404, 'Tour not found');
    }

    const totalAmount = Number(tour.price) * travelers;

    const booking = await Booking.create({
      userId: req.user.id,
      tourId,
      travelDate,
      travelers,
      specialRequests,
      reservationCode: `GT-${reservationCodeGenerator()}`,
      totalAmount,
      currency: tour.currency,
      status: 'pending',
      paymentStatus: 'unpaid',
    });

    await notifyNewBooking({
      customerName: req.user.fullName,
      customerPhone: req.user.phoneNumber,
      reservationCode: booking.reservationCode,
      tourTitle: tour.title,
    });

    await logAuditEvent(
      {
        action: 'booking.created',
        entityType: 'booking',
        entityId: booking.id,
        actor: req.user,
        details: {
          reservationCode: booking.reservationCode,
          tourId,
          tourTitle: tour.title,
          travelDate,
          travelers,
          totalAmount: booking.totalAmount,
          currency: booking.currency,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
        },
      },
      req
    );

    return res.status(201).json({
      message: 'Booking created',
      booking,
    });
  } catch (error) {
    return next(error);
  }
}

async function listMyBookings(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    const bookings = await Booking.findAll({
      where: { userId: req.user.id },
      include: [
        { model: Tour },
        { model: Payment, required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
}

async function listAllBookings(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.status) {
      where.status = req.query.status;
    }

    const bookings = await Booking.findAll({
      where,
      include: [{ model: Tour }, { model: User, attributes: ['id', 'fullName', 'email', 'phoneNumber'] }],
      order: [['createdAt', 'DESC']],
    });

    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
}

async function getBookingById(
  req: AuthenticatedValidatedRequest<BookingIdInput['body'], BookingIdInput['params'], BookingIdInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const booking = await Booking.findByPk(id, {
      include: [{ model: Tour }, { model: Payment, required: false }],
    });

    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }

    const isOwner = booking.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw new HttpError(403, 'Forbidden');
    }

    return res.json({ booking });
  } catch (error) {
    return next(error);
  }
}

async function updateBookingStatus(
  req: AuthenticatedValidatedRequest<
    UpdateBookingStatusInput['body'],
    UpdateBookingStatusInput['params'],
    UpdateBookingStatusInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const booking = await Booking.findByPk(id);

    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }

    const before = {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    };

    await booking.update(req.validated.body);

    await logAuditEvent(
      {
        action: 'booking.updated',
        entityType: 'booking',
        entityId: booking.id,
        actor: req.user,
        details: {
          reservationCode: booking.reservationCode,
          changes: req.validated.body,
          before,
          after: {
            status: booking.status,
            paymentStatus: booking.paymentStatus,
          },
        },
      },
      req
    );

    return res.json({ message: 'Booking updated', booking });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createBookingSchema,
  bookingIdSchema,
  updateBookingStatusSchema,
  createBooking,
  listMyBookings,
  listAllBookings,
  getBookingById,
  updateBookingStatus,
};
