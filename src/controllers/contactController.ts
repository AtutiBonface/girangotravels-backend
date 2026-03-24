import type { NextFunction, Response } from 'express';
import type { RequestWithValidated } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { ContactMessage } = require('../models');
const HttpError = require('../utils/httpError');
const { sendAdminReplyNotification, notifyContactSubmitted } = require('../services/notificationService');
const { logAuditEvent } = require('../services/auditService');

const createContactSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(6).optional(),
    message: z.string().min(5),
  }),
  params: z.object({}),
  query: z.object({}),
});

const updateContactStatusSchema = z.object({
  body: z.object({
    status: z.enum(['new', 'contacted', 'resolved']),
  }),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const replyContactSchema = z.object({
  body: z.object({
    replyMessage: z.string().min(5),
  }),
  params: z.object({ id: z.string().uuid() }),
  query: z.object({}),
});

const listContactsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

type CreateContactInput = ZodInfer<typeof createContactSchema>;
type UpdateContactStatusInput = ZodInfer<typeof updateContactStatusSchema>;
type ReplyContactInput = ZodInfer<typeof replyContactSchema>;
type ListContactsInput = ZodInfer<typeof listContactsSchema>;

async function createContactMessage(
  req: RequestWithValidated<CreateContactInput['body'], CreateContactInput['params'], CreateContactInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const contact = await ContactMessage.create(req.validated.body);

  await notifyContactSubmitted(contact);

    await logAuditEvent(
      {
        action: 'contact.created',
        entityType: 'contact',
        entityId: contact.id,
        actor: null,
        details: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          message: contact.message,
          status: contact.status,
        },
      },
      req
    );

    return res.status(201).json({ message: 'Message received', contact });
  } catch (error) {
    return next(error);
  }
}

async function listContactMessages(
  req: RequestWithValidated<ListContactsInput['body'], ListContactsInput['params'], ListContactsInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { page, limit } = req.validated.query;
    const usePagination = page !== undefined || limit !== undefined;
    const effectivePage = page ?? 1;
    const effectiveLimit = limit ?? 20;

    if (usePagination) {
      const { rows, count } = await ContactMessage.findAndCountAll({
        order: [['createdAt', 'DESC']],
        limit: effectiveLimit,
        offset: (effectivePage - 1) * effectiveLimit,
      });

      return res.json({
        contacts: rows,
        meta: {
          page: effectivePage,
          limit: effectiveLimit,
          total: count,
          totalPages: Math.ceil(count / effectiveLimit),
        },
      });
    }

    const contacts = await ContactMessage.findAll({
      order: [['createdAt', 'DESC']],
    });

    return res.json({
      contacts,
      meta: {
        page: 1,
        limit: contacts.length || 1,
        total: contacts.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateContactStatus(
  req: RequestWithValidated<
    UpdateContactStatusInput['body'],
    UpdateContactStatusInput['params'],
    UpdateContactStatusInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const contact = await ContactMessage.findByPk(id);

    if (!contact) {
      throw new HttpError(404, 'Contact message not found');
    }

    const beforeStatus = contact.status;
    await contact.update(req.validated.body);

    await logAuditEvent(
      {
        action: 'contact.status_updated',
        entityType: 'contact',
        entityId: contact.id,
        actor: req.user,
        details: {
          before: { status: beforeStatus },
          after: { status: contact.status },
        },
      },
      req
    );

    return res.json({ message: 'Contact status updated', contact });
  } catch (error) {
    return next(error);
  }
}

async function replyContact(
  req: RequestWithValidated<
    ReplyContactInput['body'],
    ReplyContactInput['params'],
    ReplyContactInput['query']
  >,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.validated.params;
    const { replyMessage } = req.validated.body;
    const contact = await ContactMessage.findByPk(id);

    if (!contact) {
      throw new HttpError(404, 'Contact message not found');
    }

    const before = {
      status: contact.status,
      adminReply: contact.adminReply,
      repliedAt: contact.repliedAt,
    };

    await contact.update({
      adminReply: replyMessage,
      repliedAt: new Date(),
      status: 'contacted',
    });

    await logAuditEvent(
      {
        action: 'contact.replied',
        entityType: 'contact',
        entityId: contact.id,
        actor: req.user,
        details: {
          before,
          after: {
            status: contact.status,
            adminReply: contact.adminReply,
            repliedAt: contact.repliedAt,
          },
          replyMessage,
        },
      },
      req
    );

    // best-effort SMS/WhatsApp notification
    try {
      await sendAdminReplyNotification({
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        replyMessage,
      });
    } catch (_notifyError) {
      // ignore notification failures
    }

    return res.json({ message: 'Reply sent', contact });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createContactSchema,
  updateContactStatusSchema,
  replyContactSchema,
  listContactsSchema,
  createContactMessage,
  listContactMessages,
  updateContactStatus,
  replyContact,
};
