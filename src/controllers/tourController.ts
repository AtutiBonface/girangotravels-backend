import type { NextFunction, Response } from 'express';
import type { RequestWithUser, RequestWithValidated } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { Tour, Booking } = require('../models');
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
    images: z.array(z.string()).default([]),
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
      images: z.array(z.string()).optional(),
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

const listToursSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    includeInactive: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

const listTopDestinationsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(10).optional(),
  }),
});

type CreateTourInput = ZodInfer<typeof createTourSchema>;
type UpdateTourInput = ZodInfer<typeof updateTourSchema>;
type IdInput = ZodInfer<typeof idSchema>;
type ListToursInput = ZodInfer<typeof listToursSchema>;
type ListTopDestinationsInput = ZodInfer<typeof listTopDestinationsSchema>;

function toSlug(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

async function listTopDestinations(
  req: RequestWithValidated<
    ListTopDestinationsInput['body'],
    ListTopDestinationsInput['params'],
    ListTopDestinationsInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const requestedLimit = req.validated.query.limit ?? 3;
    const effectiveLimit = Math.min(requestedLimit, 3);

    const tours = await Tour.findAll({
      where: { isActive: true },
      include: [{ model: Booking, attributes: ['id'], required: false }],
      order: [['createdAt', 'ASC']],
    });

    const grouped = new Map<string, {
      key: string;
      name: string;
      image: string;
      tagline: string;
      tourCount: number;
      bookingCount: number;
      firstSeenIndex: number;
      featuredTourSlug: string;
      featuredTourBookingCount: number;
    }>();

    tours.forEach((tour: any, index: number) => {
      const destinationName = String(tour.destination || '').trim();
      if (!destinationName) return;

      const key = destinationName.toLowerCase();
      const image = Array.isArray(tour.images) && tour.images[0] ? String(tour.images[0]) : '';
      const tagline = String(tour.description || '').slice(0, 140);
      const bookingCount = Array.isArray(tour.Bookings) ? tour.Bookings.length : 0;
      const featuredTourSlug = toSlug(String(tour.title || destinationName));

      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, {
          key,
          name: destinationName,
          image,
          tagline,
          tourCount: 1,
          bookingCount,
          firstSeenIndex: index,
          featuredTourSlug,
          featuredTourBookingCount: bookingCount,
        });
        return;
      }

      const nextFeaturedTourSlug =
        bookingCount > current.featuredTourBookingCount ? featuredTourSlug : current.featuredTourSlug;
      const nextFeaturedTourBookingCount = Math.max(current.featuredTourBookingCount, bookingCount);

      grouped.set(key, {
        ...current,
        image: current.image || image,
        tourCount: current.tourCount + 1,
        bookingCount: current.bookingCount + bookingCount,
        featuredTourSlug: nextFeaturedTourSlug,
        featuredTourBookingCount: nextFeaturedTourBookingCount,
      });
    });

    const destinations = [...grouped.values()];

    const allCountsZero = destinations.every((item) => item.tourCount === 0 && item.bookingCount === 0);

    const ranked = allCountsZero
      ? destinations.sort((a, b) => a.firstSeenIndex - b.firstSeenIndex)
      : destinations.sort((a, b) => {
          if (b.bookingCount !== a.bookingCount) return b.bookingCount - a.bookingCount;
          if (b.tourCount !== a.tourCount) return b.tourCount - a.tourCount;
          return a.firstSeenIndex - b.firstSeenIndex;
        });

    return res.json({
      destinations: ranked.slice(0, effectiveLimit).map((item) => ({
        id: item.key,
        name: item.name,
        country: 'Kenya',
        image: item.image,
        tagline: item.tagline,
        tourCount: item.tourCount,
        bookingCount: item.bookingCount,
        tourSlug: item.featuredTourSlug,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function listTours(
  req: RequestWithValidated<ListToursInput['body'], ListToursInput['params'], ListToursInput['query']> & RequestWithUser,
  res: Response,
  next: NextFunction
) {
  try {
    const { includeInactive: includeInactiveQuery, page, limit } = req.validated.query;
    const includeInactive = includeInactiveQuery === 'true' && req.user?.role === 'admin';
    const where = includeInactive ? {} : { isActive: true };

    const usePagination = page !== undefined || limit !== undefined;
    const effectivePage = page ?? 1;
    const effectiveLimit = limit ?? 20;

    if (usePagination) {
      const { rows, count } = await Tour.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: effectiveLimit,
        offset: (effectivePage - 1) * effectiveLimit,
      });

      return res.json({
        tours: rows,
        meta: {
          page: effectivePage,
          limit: effectiveLimit,
          total: count,
          totalPages: Math.ceil(count / effectiveLimit),
        },
      });
    }

    const tours = await Tour.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      tours,
      meta: {
        page: 1,
        limit: tours.length || 1,
        total: tours.length,
        totalPages: 1,
      },
    });
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
  listToursSchema,
  listTopDestinationsSchema,
  listTours,
  listTopDestinations,
  getTourById,
  createTour,
  updateTour,
};
