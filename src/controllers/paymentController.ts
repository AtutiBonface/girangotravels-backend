import type { NextFunction, Response } from 'express';
import type { AuthenticatedValidatedRequest } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { Booking, Payment, Tour, User } = require('../models');
const HttpError = require('../utils/httpError');
const { paystackSecretKey, paystackCallbackUrl } = require('../config/env');
const { notifyPaymentSuccess } = require('../services/notificationService');
const { logAuditEvent } = require('../services/auditService');

const createPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid(),
    provider: z.enum(['mpesa', 'visa', 'mastercard', 'paystack']),
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

const initializePaystackPaymentSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid(),
    customerEmail: z.string().email(),
    amount: z.number().positive().optional(),
    currency: z.string().min(3).max(3).optional(),
    metadata: z.record(z.any()).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const verifyPaystackPaymentSchema = z.object({
  body: z.object({ customerEmail: z.string().email() }),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const paymentStatusSchema = z.object({
  body: z.object({}),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ customerEmail: z.string().email() }),
});

type CreatePaymentInput = ZodInfer<typeof createPaymentSchema>;
type UpdatePaymentStatusInput = ZodInfer<typeof updatePaymentStatusSchema>;
type BookingPaymentsInput = ZodInfer<typeof bookingPaymentsSchema>;
type InitializePaystackPaymentInput = ZodInfer<typeof initializePaystackPaymentSchema>;
type VerifyPaystackPaymentInput = ZodInfer<typeof verifyPaystackPaymentSchema>;
type PaymentStatusInput = ZodInfer<typeof paymentStatusSchema>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toNumber(value: string | number) {
  return Number(value);
}

function mapPaystackStatus(status: string): 'initiated' | 'successful' | 'failed' {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'success') return 'successful';
  if (['failed', 'abandoned', 'reversed'].includes(normalized)) return 'failed';
  return 'initiated';
}

function ensurePaystackConfigured() {
  if (!paystackSecretKey) {
    throw new HttpError(500, 'Paystack is not configured. Set PAYSTACK_SECRET_KEY.');
  }
}

async function verifyPaystackTransaction(reference: string) {
  ensurePaystackConfigured();

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${paystackSecretKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new HttpError(502, 'Failed to verify Paystack transaction');
  }

  const payload = await response.json();
  if (!payload?.status || !payload?.data) {
    throw new HttpError(502, 'Unexpected Paystack verification response');
  }

  return payload.data as {
    status: string;
    gateway_response?: string;
    paid_at?: string;
    channel?: string;
    authorization?: Record<string, unknown>;
    customer?: Record<string, unknown>;
    amount?: number;
    currency?: string;
    reference?: string;
    metadata?: Record<string, unknown>;
  };
}

async function synchronizePaymentWithPaystack(payment: any) {
  if (payment.provider !== 'paystack' || !payment.transactionRef) {
    return payment;
  }

  const beforeStatus = payment.status;
  const verification = await verifyPaystackTransaction(payment.transactionRef);
  const nextStatus = mapPaystackStatus(verification.status);
  const mergedMetadata = {
    ...(payment.metadata || {}),
    paystack: {
      verifiedAt: new Date().toISOString(),
      status: verification.status,
      gatewayResponse: verification.gateway_response,
      paidAt: verification.paid_at,
      channel: verification.channel,
      authorization: verification.authorization,
      customer: verification.customer,
      amount: verification.amount,
      currency: verification.currency,
      reference: verification.reference,
      metadata: verification.metadata,
    },
  };

  await payment.update({
    status: nextStatus,
    metadata: mergedMetadata,
  });

  await recalculateBookingPaymentStatus(payment.bookingId);

  if (beforeStatus !== 'successful' && nextStatus === 'successful') {
    const paymentWithBooking = await Payment.findByPk(payment.id, {
      include: [
        {
          model: Booking,
          include: [{ model: Tour }, { model: User }],
        },
      ],
    });

    if (paymentWithBooking?.Booking?.User && paymentWithBooking?.Booking?.Tour) {
      await notifyPaymentSuccess({
        customerPhone: paymentWithBooking.Booking.User.phoneNumber,
        tourTitle: paymentWithBooking.Booking.Tour.title,
        amount: paymentWithBooking.amount,
        currency: paymentWithBooking.currency,
      });
    }
  }

  return payment;
}

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

async function initializePaystackPayment(
  req: AuthenticatedValidatedRequest<
    InitializePaystackPaymentInput['body'],
    InitializePaystackPaymentInput['params'],
    InitializePaystackPaymentInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    ensurePaystackConfigured();

    const { bookingId, customerEmail, amount, currency, metadata } = req.validated.body;
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: User }],
    });

    if (!booking) {
      throw new HttpError(404, 'Booking not found');
    }

    const bookingEmail = normalizeEmail(booking.User.email);
    if (bookingEmail !== normalizeEmail(customerEmail)) {
      throw new HttpError(403, 'Customer email does not match booking owner');
    }

    const successfulPayments = await Payment.findAll({ where: { bookingId, status: 'successful' } });
    const alreadyPaid = successfulPayments.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const bookingTotal = toNumber(booking.totalAmount);
    const outstanding = Math.max(bookingTotal - alreadyPaid, 0);

    const amountToCharge = amount ?? outstanding;
    if (amountToCharge <= 0) {
      throw new HttpError(400, 'Booking is already fully paid');
    }

    if (amountToCharge > outstanding) {
      throw new HttpError(400, 'Amount exceeds outstanding balance');
    }

    const normalizedCurrency = (currency || booking.currency || 'KES').toUpperCase();
    const reference = `GTPSK-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payment = await Payment.create({
      bookingId,
      provider: 'paystack',
      amount: amountToCharge,
      currency: normalizedCurrency,
      transactionRef: reference,
      metadata: metadata || {},
      status: 'initiated',
    });

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: booking.User.email,
        amount: Math.round(amountToCharge * 100),
        reference,
        currency: normalizedCurrency,
        callback_url: paystackCallbackUrl || undefined,
        metadata: {
          bookingId,
          paymentId: payment.id,
          reservationCode: booking.reservationCode,
          ...(metadata || {}),
        },
      }),
    });

    if (!paystackResponse.ok) {
      throw new HttpError(502, 'Failed to initialize Paystack transaction');
    }

    const initializedPayload = await paystackResponse.json();
    const data = initializedPayload?.data;
    if (!data?.access_code || !data?.reference) {
      throw new HttpError(502, 'Invalid Paystack initialize response');
    }

    await payment.update({
      metadata: {
        ...(payment.metadata || {}),
        paystack: {
          initializedAt: new Date().toISOString(),
          accessCode: data.access_code,
          authorizationUrl: data.authorization_url,
          reference: data.reference,
        },
      },
      transactionRef: data.reference,
    });

    return res.status(201).json({
      message: 'Paystack payment initialized',
      payment,
      paystack: {
        accessCode: data.access_code,
        reference: data.reference,
      },
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

async function verifyPaystackPayment(
  req: AuthenticatedValidatedRequest<
    VerifyPaystackPaymentInput['body'],
    VerifyPaystackPaymentInput['params'],
    VerifyPaystackPaymentInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const { customerEmail } = req.validated.body;

    const payment = await Payment.findByPk(id, {
      include: [{ model: Booking, include: [{ model: User }] }],
    });

    if (!payment) {
      throw new HttpError(404, 'Payment not found');
    }

    const bookingEmail = normalizeEmail(payment.Booking.User.email);
    if (bookingEmail !== normalizeEmail(customerEmail)) {
      throw new HttpError(403, 'Forbidden');
    }

    await synchronizePaymentWithPaystack(payment);

    return res.json({ payment });
  } catch (error) {
    return next(error);
  }
}

async function getPaymentStatus(
  req: AuthenticatedValidatedRequest<PaymentStatusInput['body'], PaymentStatusInput['params'], PaymentStatusInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const { customerEmail } = req.validated.query;

    const payment = await Payment.findByPk(id, {
      include: [{ model: Booking, include: [{ model: User }] }],
    });

    if (!payment) {
      throw new HttpError(404, 'Payment not found');
    }

    const bookingEmail = normalizeEmail(payment.Booking.User.email);
    if (bookingEmail !== normalizeEmail(customerEmail)) {
      throw new HttpError(403, 'Forbidden');
    }

    if (payment.provider === 'paystack' && payment.status === 'initiated' && payment.transactionRef) {
      await synchronizePaymentWithPaystack(payment);
    }

    return res.json({ payment });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
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
};
