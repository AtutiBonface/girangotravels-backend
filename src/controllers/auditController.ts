import type { NextFunction, Response } from 'express';
import type { RequestWithValidated } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');

const listAuditLogsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().min(2).optional(),
    entityType: z.string().min(2).optional(),
    actorUserId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
});

type ListAuditLogsInput = ZodInfer<typeof listAuditLogsSchema>;

async function listAuditLogs(
  req: RequestWithValidated<ListAuditLogsInput['body'], ListAuditLogsInput['params'], ListAuditLogsInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { page, limit, action, entityType, actorUserId, from, to } = req.validated.query;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (actorUserId) where.actorUserId = actorUserId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { [Op.gte]: new Date(from) } : {}),
        ...(to ? { [Op.lte]: new Date(to) } : {}),
      };
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'actor',
          required: false,
          attributes: ['id', 'fullName', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      logs: rows,
      meta: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAuditLogsSchema,
  listAuditLogs,
};
