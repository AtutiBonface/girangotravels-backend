import type { NextFunction, Response } from 'express';
import type { RequestWithValidated } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { Review } = require('../models');
const HttpError = require('../utils/httpError');
const { logAuditEvent } = require('../services/auditService');

const createReviewSchema = z.object({
  body: z.object({
    customerName: z.string().min(2),
    customerEmail: z.string().email().optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(5),
  }),
  params: z.object({}),
  query: z.object({}),
});

const listReviewsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const updateReviewStatusSchema = z.object({
  body: z.object({
    status: z.enum(['approved', 'rejected']),
  }),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

type CreateReviewInput = ZodInfer<typeof createReviewSchema>;
type ListReviewsInput = ZodInfer<typeof listReviewsSchema>;
type UpdateReviewStatusInput = ZodInfer<typeof updateReviewStatusSchema>;

async function createReview(
  req: RequestWithValidated<CreateReviewInput['body'], CreateReviewInput['params'], CreateReviewInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const review = await Review.create({
      ...req.validated.body,
      status: 'pending',
      approvedAt: null,
    });

    await logAuditEvent(
      {
        action: 'review.created',
        entityType: 'review',
        entityId: review.id,
        actor: null,
        details: {
          customerName: review.customerName,
          customerEmail: review.customerEmail,
          rating: review.rating,
          comment: review.comment,
          status: review.status,
        },
      },
      req
    );

    return res.status(201).json({
      message: 'Review submitted and pending approval',
      review,
    });
  } catch (error) {
    return next(error);
  }
}

async function listApprovedReviews(req: RequestWithValidated, res: Response, next: NextFunction) {
  try {
    const reviews = await Review.findAll({
      where: { status: 'approved' },
      order: [['approvedAt', 'DESC'], ['createdAt', 'DESC']],
    });

    return res.json({ reviews });
  } catch (error) {
    return next(error);
  }
}

async function listAllReviews(
  req: RequestWithValidated<ListReviewsInput['body'], ListReviewsInput['params'], ListReviewsInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { status, page, limit } = req.validated.query;
    const where = status ? { status } : {};
    const usePagination = page !== undefined || limit !== undefined;
    const effectivePage = page ?? 1;
    const effectiveLimit = limit ?? 20;

    if (usePagination) {
      const { rows, count } = await Review.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: effectiveLimit,
        offset: (effectivePage - 1) * effectiveLimit,
      });

      return res.json({
        reviews: rows,
        meta: {
          page: effectivePage,
          limit: effectiveLimit,
          total: count,
          totalPages: Math.ceil(count / effectiveLimit),
        },
      });
    }

    const reviews = await Review.findAll({ where, order: [['createdAt', 'DESC']] });
    return res.json({
      reviews,
      meta: {
        page: 1,
        limit: reviews.length || 1,
        total: reviews.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateReviewStatus(
  req: RequestWithValidated<
    UpdateReviewStatusInput['body'],
    UpdateReviewStatusInput['params'],
    UpdateReviewStatusInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const { status } = req.validated.body;

    const review = await Review.findByPk(id);
    if (!review) {
      throw new HttpError(404, 'Review not found');
    }

    const before = {
      status: review.status,
      approvedAt: review.approvedAt,
    };

    await review.update({
      status,
      approvedAt: status === 'approved' ? new Date() : null,
    });

    await logAuditEvent(
      {
        action: 'review.status_updated',
        entityType: 'review',
        entityId: review.id,
        actor: req.user,
        details: {
          before,
          after: {
            status: review.status,
            approvedAt: review.approvedAt,
          },
        },
      },
      req
    );

    return res.json({ message: 'Review status updated', review });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createReviewSchema,
  listReviewsSchema,
  updateReviewStatusSchema,
  createReview,
  listApprovedReviews,
  listAllReviews,
  updateReviewStatus,
};
