import type { NextFunction, Response } from 'express';
import type { RequestWithUser, RequestWithValidated } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { Tour } = require('../models');
const HttpError = require('../utils/httpError');
const { logAuditEvent } = require('../services/auditService');

const createTourSchema = z.object({
  body: z.object({
    title: z.string().min(2),
    destination: z.string().min(2),
    duration: z.string().min(2),
    price: z.number().positive(),
    currency: z.string().min(3).max(3).default('USD'),
    description: z.string().min(10),
    includedServices: z.array(z.string()).default([]),
    excludedServices: z.array(z.string()).default([]),
    images: z.array(z.string().url()).default([]),
    isActive: z.boolean().optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const updateTourSchema = z.object({
  body: z
    .object({
      title: z.string().min(2).optional(),
      destination: z.string().min(2).optional(),
      duration: z.string().min(2).optional(),
      price: z.number().positive().optional(),
      currency: z.string().min(3).max(3).optional(),
      description: z.string().min(10).optional(),
      includedServices: z.array(z.string()).optional(),
      excludedServices: z.array(z.string()).optional(),
      images: z.array(z.string().url()).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, 'Provide at least one field to update'),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const idSchema = z.object({
  body: z.object({}),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

type CreateTourInput = ZodInfer<typeof createTourSchema>;
type UpdateTourInput = ZodInfer<typeof updateTourSchema>;
type IdInput = ZodInfer<typeof idSchema>;

async function listTours(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'admin';
    const where = includeInactive ? {} : { isActive: true };

    const tours = await Tour.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    return res.json({ tours });
  } catch (error) {
    return next(error);
  }
}

async function getTourById(
  req: RequestWithValidated<IdInput['body'], IdInput['params'], IdInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const tour = await Tour.findByPk(id);

    if (!tour) {
      throw new HttpError(404, 'Tour not found');
    }

    return res.json({ tour });
  } catch (error) {
    return next(error);
  }
}

async function createTour(
  req: RequestWithValidated<CreateTourInput['body'], CreateTourInput['params'], CreateTourInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const tour = await Tour.create(req.validated.body);

    await logAuditEvent(
      {
        action: 'tour.created',
        entityType: 'tour',
        entityId: tour.id,
        actor: req.user,
        details: {
          title: tour.title,
          destination: tour.destination,
          duration: tour.duration,
          price: tour.price,
          currency: tour.currency,
          isActive: tour.isActive,
        },
      },
      req
    );

    return res.status(201).json({ message: 'Tour created', tour });
  } catch (error) {
    return next(error);
  }
}

async function updateTour(
  req: RequestWithValidated<UpdateTourInput['body'], UpdateTourInput['params'], UpdateTourInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const tour = await Tour.findByPk(id);

    if (!tour) {
      throw new HttpError(404, 'Tour not found');
    }

    const before = {
      title: tour.title,
      destination: tour.destination,
      duration: tour.duration,
      price: tour.price,
      currency: tour.currency,
      description: tour.description,
      includedServices: tour.includedServices,
      excludedServices: tour.excludedServices,
      images: tour.images,
      isActive: tour.isActive,
    };

    await tour.update(req.validated.body);

    await logAuditEvent(
      {
        action: 'tour.updated',
        entityType: 'tour',
        entityId: tour.id,
        actor: req.user,
        details: {
          changes: req.validated.body,
          before,
          after: {
            title: tour.title,
            destination: tour.destination,
            duration: tour.duration,
            price: tour.price,
            currency: tour.currency,
            description: tour.description,
            includedServices: tour.includedServices,
            excludedServices: tour.excludedServices,
            images: tour.images,
            isActive: tour.isActive,
          },
        },
      },
      req
    );

    return res.json({ message: 'Tour updated', tour });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createTourSchema,
  updateTourSchema,
  idSchema,
  listTours,
  getTourById,
  createTour,
  updateTour,
};
