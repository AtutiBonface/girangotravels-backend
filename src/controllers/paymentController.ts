import type { NextFunction, Response } from 'express';
import type { AuthenticatedValidatedRequest } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { Booking, Payment, Tour, User } = require('../models');
const HttpError = require('../utils/httpError');
const { notifyPaymentSuccess } = require('../services/notificationService');
const { logAuditEvent } = require('../services/auditService');

const createPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid(),
    provider: z.enum(['mpesa', 'visa', 'mastercard']),
    amount: z.number().positive(),
    currency: z.string().min(3).max(3).default('KES'),
    transactionRef: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const updatePaymentStatusSchema = z.object({
  body: z.object({
    status: z.enum(['initiated', 'successful', 'failed']),
    transactionRef: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const bookingPaymentsSchema = z.object({
  body: z.object({}),
  params: z.object({ bookingId: z.string().uuid() }),
  query: z.object({}),
});

type CreatePaymentInput = ZodInfer<typeof createPaymentSchema>;
type UpdatePaymentStatusInput = ZodInfer<typeof updatePaymentStatusSchema>;
type BookingPaymentsInput = ZodInfer<typeof bookingPaymentsSchema>;

async function recalculateBookingPaymentStatus(bookingId: string) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) return;

  const successfulPayments = await Payment.findAll({ where: { bookingId, status: 'successful' } });
  const paidAmount = successfulPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const bookingTotal = Number(booking.totalAmount);

  let paymentStatus = 'unpaid';
  if (paidAmount > 0 && paidAmount < bookingTotal) {
    paymentStatus = 'partial';
  } else if (paidAmount >= bookingTotal) {
    paymentStatus = 'paid';
  }

  await booking.update({ paymentStatus });
}

async function createPayment(
  req: AuthenticatedValidatedRequest<CreatePaymentInput['body'], CreatePaymentInput['params'], CreatePaymentInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { bookingId, provider, amount, currency, transactionRef, metadata } = req.validated.body;

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }

    const isOwner = booking.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new HttpError(403, 'Forbidden');
    }

    const payment = await Payment.create({
      bookingId,
      provider,
      amount,
      currency,
      transactionRef,
      metadata: metadata || {},
      status: 'initiated',
    });

    await logAuditEvent(
      {
        action: 'payment.created',
        entityType: 'payment',
        entityId: payment.id,
        actor: req.user,
        details: {
          bookingId: payment.bookingId,
          provider: payment.provider,
          amount: payment.amount,
          currency: payment.currency,
          transactionRef: payment.transactionRef,
          status: payment.status,
        },
      },
      req
    );

    return res.status(201).json({
      message: 'Payment created',
      payment,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPaymentsByBooking(
  req: AuthenticatedValidatedRequest<
    BookingPaymentsInput['body'],
    BookingPaymentsInput['params'],
    BookingPaymentsInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { bookingId } = req.validated.params;
    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }

    const isOwner = booking.userId === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new HttpError(403, 'Forbidden');
    }

    const payments = await Payment.findAll({
      where: { bookingId },
      order: [['createdAt', 'DESC']],
    });

    return res.json({ payments });
  } catch (error) {
    return next(error);
  }
}

async function updatePaymentStatus(
  req: AuthenticatedValidatedRequest<
    UpdatePaymentStatusInput['body'],
    UpdatePaymentStatusInput['params'],
    UpdatePaymentStatusInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const { status, transactionRef, metadata } = req.validated.body;

    const payment = await Payment.findByPk(id, {
      include: [
        {
          model: Booking,
          include: [{ model: Tour }, { model: User }],
        },
      ],
    });

    if (!payment) {
      throw new HttpError(404, 'Payment not found');
    }

    const before = {
      status: payment.status,
      transactionRef: payment.transactionRef,
      metadata: payment.metadata,
    };

    await payment.update({
      status,
      transactionRef: transactionRef || payment.transactionRef,
      metadata: metadata ? { ...payment.metadata, ...metadata } : payment.metadata,
    });

    await recalculateBookingPaymentStatus(payment.bookingId);

    if (status === 'successful') {
      await notifyPaymentSuccess({
        customerPhone: payment.Booking.User.phoneNumber,
        tourTitle: payment.Booking.Tour.title,
        amount: payment.amount,
        currency: payment.currency,
      });
    }

    await logAuditEvent(
      {
        action: 'payment.updated',
        entityType: 'payment',
        entityId: payment.id,
        actor: req.user,
        details: {
          bookingId: payment.bookingId,
          before,
          after: {
            status: payment.status,
            transactionRef: payment.transactionRef,
            metadata: payment.metadata,
          },
        },
      },
      req
    );

    return res.json({ message: 'Payment updated', payment });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createPaymentSchema,
  bookingPaymentsSchema,
  updatePaymentStatusSchema,
  createPayment,
  getPaymentsByBooking,
  updatePaymentStatus,
};
