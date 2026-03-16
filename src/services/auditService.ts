import type { Request } from 'express';

const { AuditLog } = require('../models');

interface ActorInput {
  id?: string;
  fullName?: string;
  email?: string;
  role?: 'customer' | 'admin';
}

interface AuditEventInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  actor?: ActorInput | null;
  details?: Record<string, unknown>;
}

function safeDetails(details?: Record<string, unknown>) {
  if (!details) return {};
  try {
    return JSON.parse(JSON.stringify(details));
  } catch {
    return { note: 'details could not be serialized safely' };
  }
}

function extractRequestMeta(req?: Request) {
  const userAgentHeader = req?.headers?.['user-agent'];
  return {
    ipAddress: req?.ip ?? null,
    userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : null,
  };
}

async function logAuditEvent(event: AuditEventInput, req?: Request) {
  try {
    const requestMeta = extractRequestMeta(req);
    await AuditLog.create({
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      actorUserId: event.actor?.id ?? null,
      actorName: event.actor?.fullName ?? null,
      actorEmail: event.actor?.email ?? null,
      actorRole: event.actor?.role ?? null,
      ...requestMeta,
      details: safeDetails(event.details),
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

module.exports = {
  logAuditEvent,
};
