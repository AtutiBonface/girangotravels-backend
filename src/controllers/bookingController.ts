import type { NextFunction, Response } from 'express';
import type { AuthenticatedValidatedRequest, RequestWithUser, RequestWithValidated } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { customAlphabet } = require('nanoid');
const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
const { Booking, Tour, Payment, User } = require('../models');
const HttpError = require('../utils/httpError');
const {
  notifyBookingStatusChanged,
  notifyNewBooking,
  notifyPaymentPending,
  notifyReviewInvitation,
} = require('../services/notificationService');
const { logAuditEvent } = require('../services/auditService');
const { issueReviewInvitation } = require('../services/reviewInvitationService');

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

const createPublicBookingSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    phoneNumber: z.string().min(6).optional(),
    country: z.string().min(2).optional(),
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
      status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'resolved']).optional(),
      paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, 'Provide status or paymentStatus'),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const listBookingsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'resolved']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

type CreateBookingInput = ZodInfer<typeof createBookingSchema>;
type CreatePublicBookingInput = ZodInfer<typeof createPublicBookingSchema>;
type BookingIdInput = ZodInfer<typeof bookingIdSchema>;
type UpdateBookingStatusInput = ZodInfer<typeof updateBookingStatusSchema>;
type ListBookingsInput = ZodInfer<typeof listBookingsSchema>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function runDeferred(label: string, task: () => Promise<void>) {
  void task().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${label} failed:`, message);
  });
}

async function ensureCustomerUser(input: {
  fullName: string;
  email: string;
  phoneNumber?: string;
  country?: string;
}) {
  const email = normalizeEmail(input.email);
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return existing;
  }

  const randomPasswordHash = await bcrypt.hash(`gt-public-${Date.now()}-${Math.random()}`, 10);
  return User.create({
    fullName: input.fullName,
    email,
    phoneNumber: input.phoneNumber,
    country: input.country,
    passwordHash: randomPasswordHash,
    role: 'customer',
  });
}

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

    runDeferred('notifyNewBooking', async () => {
      await notifyNewBooking({
        customerName: req.user.fullName,
        customerEmail: req.user.email,
        customerPhone: req.user.phoneNumber,
        reservationCode: booking.reservationCode,
        tourTitle: tour.title,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        travelDate: booking.travelDate,
        travelers: booking.travelers,
      });
    });

    if (booking.paymentStatus !== 'paid') {
      runDeferred('notifyPaymentPending', async () => {
        await notifyPaymentPending({
          customerName: req.user.fullName,
          customerPhone: req.user.phoneNumber,
          reservationCode: booking.reservationCode,
          tourTitle: tour.title,
          totalAmount: booking.totalAmount,
          currency: booking.currency,
          daysSinceBooking: 0,
        });
      });
    }

    runDeferred('logAuditEvent', async () => {
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
    });

    return res.status(201).json({
      message: 'Booking created',
      booking,
    });
  } catch (error) {
    return next(error);
  }
}

async function createPublicBooking(
  req: RequestWithValidated<
    CreatePublicBookingInput['body'],
    CreatePublicBookingInput['params'],
    CreatePublicBookingInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { fullName, email, phoneNumber, country, tourId, travelDate, travelers, specialRequests } = req.validated.body;

    const tour = await Tour.findOne({ where: { id: tourId, isActive: true } });
    if (!tour) {
      throw new HttpError(404, 'Tour not found');
    }

    const customer = await ensureCustomerUser({ fullName, email, phoneNumber, country });
    const totalAmount = Number(tour.price) * travelers;

    const booking = await Booking.create({
      userId: customer.id,
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

    runDeferred('notifyNewBooking', async () => {
      await notifyNewBooking({
        customerName: customer.fullName,
        customerEmail: customer.email,
        customerPhone: customer.phoneNumber,
        reservationCode: booking.reservationCode,
        tourTitle: tour.title,
        totalAmount: booking.totalAmount,
        currency: booking.currency,
        travelDate: booking.travelDate,
        travelers: booking.travelers,
      });
    });

    if (booking.paymentStatus !== 'paid') {
      runDeferred('notifyPaymentPending', async () => {
        await notifyPaymentPending({
          customerName: customer.fullName,
          customerPhone: customer.phoneNumber,
          reservationCode: booking.reservationCode,
          tourTitle: tour.title,
          totalAmount: booking.totalAmount,
          currency: booking.currency,
          daysSinceBooking: 0,
        });
      });
    }

    runDeferred('logAuditEvent', async () => {
      await logAuditEvent(
        {
          action: 'booking.created',
          entityType: 'booking',
          entityId: booking.id,
          actor: null,
          details: {
            source: 'public-site',
            reservationCode: booking.reservationCode,
            customerEmail: customer.email,
            customerName: customer.fullName,
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
    });

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

async function listAllBookings(
  req: AuthenticatedValidatedRequest<ListBookingsInput['body'], ListBookingsInput['params'], ListBookingsInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const where: Record<string, unknown> = {};
    const { status, page, limit } = req.validated.query;

    if (status) {
      where.status = status;
    }

    const include = [
      { model: Tour },
      { model: User, attributes: ['id', 'fullName', 'email', 'phoneNumber', 'country'] },
      { model: Payment, required: false },
    ];

    const usePagination = page !== undefined || limit !== undefined;
    const effectivePage = page ?? 1;
    const effectiveLimit = limit ?? 20;

    if (usePagination) {
      const { rows, count } = await Booking.findAndCountAll({
        where,
        include,
        order: [['createdAt', 'DESC']],
        limit: effectiveLimit,
        offset: (effectivePage - 1) * effectiveLimit,
      });

      return res.json({
        bookings: rows,
        meta: {
          page: effectivePage,
          limit: effectiveLimit,
          total: count,
          totalPages: Math.ceil(count / effectiveLimit),
        },
      });
    }

    const bookings = await Booking.findAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      bookings,
      meta: {
        page: 1,
        limit: bookings.length || 1,
        total: bookings.length,
        totalPages: 1,
      },
    });
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
    const booking = await Booking.findByPk(id, {
      include: [{ model: Tour }, { model: User }],
    });

    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }

    const before = {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
    };

    await booking.update(req.validated.body);

    let customerEmailNotification: {
      attempted: boolean;
      sent: boolean;
      reason: string;
      error?: string;
      recipient?: string;
      status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    } | null = null;
    let reviewInvitationNotification: {
      created: boolean;
      skippedReason: string | null;
      reviewUrl: string | null;
      email?: {
        attempted: boolean;
        sent: boolean;
        reason: string;
      };
    } | null = null;

    const requestedStatus = req.validated.body.status;
    if (requestedStatus && requestedStatus !== before.status) {
      customerEmailNotification = await notifyBookingStatusChanged({
        customerName: booking.User?.fullName ?? 'Customer',
        customerEmail: booking.User?.email,
        reservationCode: booking.reservationCode,
        tourTitle: booking.Tour?.title ?? 'Your Tour',
        status: requestedStatus,
        travelDate: booking.travelDate,
      });

      if (requestedStatus === 'completed' && booking.User?.email && booking.Tour?.id) {
        const invitationResult = await issueReviewInvitation({
          bookingId: booking.id,
          tourId: booking.Tour.id,
          customerEmail: booking.User.email,
          customerName: booking.User.fullName ?? 'Customer',
          reservationCode: booking.reservationCode,
        });

        reviewInvitationNotification = {
          created: invitationResult.created,
          skippedReason: invitationResult.skippedReason,
          reviewUrl: invitationResult.reviewUrl,
        };

        if (invitationResult.created && invitationResult.reviewUrl) {
          const emailResult = await notifyReviewInvitation({
            customerName: booking.User.fullName ?? 'Customer',
            customerEmail: booking.User.email,
            reservationCode: booking.reservationCode,
            tourTitle: booking.Tour?.title ?? 'Your Tour',
            reviewUrl: invitationResult.reviewUrl,
          });

          reviewInvitationNotification.email = {
            attempted: emailResult.attempted,
            sent: emailResult.sent,
            reason: emailResult.reason,
          };
        }
      }
    }

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

    return res.json({
      message: 'Booking updated',
      booking,
      customerEmailNotification,
      reviewInvitationNotification,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createBookingSchema,
  createPublicBookingSchema,
  listBookingsSchema,
  bookingIdSchema,
  updateBookingStatusSchema,
  createBooking,
  createPublicBooking,
  listMyBookings,
  listAllBookings,
  getBookingById,
  updateBookingStatus,
};
