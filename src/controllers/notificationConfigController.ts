import type { NextFunction, Response } from 'express';
import type { RequestWithUser } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const { z } = require('zod') as typeof import('zod');
const { NotificationConfig } = require('../models');
const HttpError = require('../utils/httpError');

const updateNotificationConfigSchema = z.object({
  body: z.object({
    notificationType: z.enum(['booking', 'contact', 'payment']),
    recipientEmails: z.array(z.string().email()).default([]),
    ccEmails: z.array(z.string().email()).default([]),
    bccEmails: z.array(z.string().email()).default([]),
    recipientPhones: z.array(z.string().regex(/^\+?[1-9]\d{1,14}$/)).default([]),
    enableEmail: z.boolean().default(true),
    enableSMS: z.boolean().default(false),
    enableWhatsapp: z.boolean().default(false),
  }),
  params: z.object({}),
  query: z.object({}),
});

type UpdateNotificationConfigInput = ZodInfer<typeof updateNotificationConfigSchema>;

async function getNotificationConfig(
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) {
  try {
    const type = Array.isArray(req.params.type) ? req.params.type[0] : req.params.type;

    if (!['booking', 'contact', 'payment'].includes(type)) {
      throw new HttpError(400, 'Invalid notification type');
    }

    let config = await NotificationConfig.findOne({
      where: { notificationType: type },
    });

    if (!config) {
      // Create default config if it doesn't exist
      config = await NotificationConfig.create({
        notificationType: type,
        recipientEmails: [],
        ccEmails: [],
        bccEmails: [],
        recipientPhones: [],
        enableEmail: true,
        enableSMS: false,
        enableWhatsapp: false,
      });
    }

    return res.json({ config });
  } catch (error) {
    return next(error);
  }
}

async function updateNotificationConfig(
  req: RequestWithUser & {
    validated?: {
      body: UpdateNotificationConfigInput['body'];
      params: UpdateNotificationConfigInput['params'];
      query: UpdateNotificationConfigInput['query'];
    };
  },
  res: Response,
  next: NextFunction
) {
  try {
    const { notificationType, recipientEmails, ccEmails, bccEmails, recipientPhones, enableEmail, enableSMS, enableWhatsapp } =
      req.validated?.body || req.body;

    const [config, created] = await NotificationConfig.findOrCreate({
      where: { notificationType },
      defaults: {
        notificationType,
        recipientEmails,
        ccEmails,
        bccEmails,
        recipientPhones,
        enableEmail,
        enableSMS,
        enableWhatsapp,
      },
    });

    if (!created) {
      await config.update({
        recipientEmails,
        ccEmails,
        bccEmails,
        recipientPhones,
        enableEmail,
        enableSMS,
        enableWhatsapp,
      });
    }

    return res.json({
      message: 'Notification configuration updated successfully',
      config,
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllNotificationConfigs(
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) {
  try {
    const configs = await NotificationConfig.findAll();

    // Ensure all notification types have configs
    const existingTypes = new Set(configs.map((c: any) => c.notificationType));
    const types = ['booking', 'contact', 'payment'];

    for (const type of types) {
      if (!existingTypes.has(type)) {
        await NotificationConfig.create({
          notificationType: type,
          recipientEmails: [],
          ccEmails: [],
          bccEmails: [],
          recipientPhones: [],
          enableEmail: true,
          enableSMS: false,
          enableWhatsapp: false,
        });
      }
    }

    const allConfigs = await NotificationConfig.findAll();
    return res.json({ configs: allConfigs });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getNotificationConfig,
  updateNotificationConfig,
  getAllNotificationConfigs,
  updateNotificationConfigSchema,
};
