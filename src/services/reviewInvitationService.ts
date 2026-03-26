const crypto = require('node:crypto');

const { appUrl } = require('../config/env');
const { ReviewInvitation, Review } = require('../models');

const DEFAULT_EXPIRY_DAYS = 30;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function resolveAppUrl() {
  const base = (appUrl || 'http://localhost:3000').trim() || 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

async function hasReviewedTour(customerEmail: string, tourId: string, excludeInvitationId?: string) {
  const where: Record<string, unknown> = {
    customerEmail: normalizeEmail(customerEmail),
    tourId,
    submittedReviewId: { [require('sequelize').Op.ne]: null },
  };

  if (excludeInvitationId) {
    where.id = { [require('sequelize').Op.ne]: excludeInvitationId };
  }

  const existing = await ReviewInvitation.findOne({ where, order: [['usedAt', 'DESC']] });
  return existing;
}

async function issueReviewInvitation(input: {
  bookingId: string;
  tourId: string;
  customerEmail: string;
  customerName: string;
  reservationCode: string;
}) {
  const { bookingId, tourId, customerEmail, customerName, reservationCode } = input;
  const normalizedEmail = normalizeEmail(customerEmail);

  const alreadyReviewed = await hasReviewedTour(normalizedEmail, tourId);
  if (alreadyReviewed) {
    return {
      created: false,
      skippedReason: 'already-reviewed',
      reviewUrl: null,
      invitation: null,
    };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await ReviewInvitation.create({
    tokenHash,
    bookingId,
    tourId,
    customerEmail: normalizedEmail,
    customerName,
    expiresAt,
    sentAt: new Date(),
    usedAt: null,
    submittedReviewId: null,
  });

  const reviewUrl = `${resolveAppUrl()}/review/${token}`;

  console.log(`[review-link] Reservation ${reservationCode}: ${reviewUrl}`);

  return {
    created: true,
    skippedReason: null,
    reviewUrl,
    invitation,
  };
}

async function getInvitationByToken(token: string) {
  const invitation = await ReviewInvitation.findOne({
    where: { tokenHash: hashToken(token) },
  });

  return invitation;
}

async function validateReviewInvitationToken(token: string) {
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    return { valid: false, reason: 'invalid-token', invitation: null, review: null };
  }

  const now = new Date();
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < now.getTime()) {
    return { valid: false, reason: 'expired-token', invitation, review: null };
  }

  if (invitation.submittedReviewId) {
    const review = await Review.findByPk(invitation.submittedReviewId);
    return {
      valid: true,
      reason: 'already-reviewed',
      invitation,
      review,
    };
  }

  const duplicate = await hasReviewedTour(invitation.customerEmail, invitation.tourId, invitation.id);
  if (duplicate?.submittedReviewId) {
    const review = await Review.findByPk(duplicate.submittedReviewId);
    return {
      valid: true,
      reason: 'already-reviewed',
      invitation,
      review,
    };
  }

  return { valid: true, reason: 'ok', invitation, review: null };
}

async function submitInvitationReview(token: string, payload: { rating: number; comment: string }) {
  const validation = await validateReviewInvitationToken(token);

  if (!validation.valid || !validation.invitation) {
    return validation;
  }

  if (validation.reason === 'already-reviewed') {
    return validation;
  }

  const invitation = validation.invitation;

  const review = await Review.create({
    customerName: invitation.customerName,
    customerEmail: invitation.customerEmail,
    rating: payload.rating,
    comment: payload.comment,
    status: 'pending',
    approvedAt: null,
  });

  await invitation.update({
    usedAt: new Date(),
    submittedReviewId: review.id,
  });

  return {
    valid: true,
    reason: 'submitted',
    invitation,
    review,
  };
}

module.exports = {
  issueReviewInvitation,
  validateReviewInvitationToken,
  submitInvitationReview,
};
