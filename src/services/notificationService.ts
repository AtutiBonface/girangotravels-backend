const axios = require('axios');
const nodemailer = require('nodemailer');
const {
  pingAfricaBaseUrl,
  pingAfricaApiKey,
  pingAfricaSenderId,
  pingAfricaWhatsappInstanceName,
  adminAlertPhone,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPassword,
  sendgridApiKey,
  appUrl,
} = require('../config/env');

let emailTransporter: any = null;
let resolvedWhatsappInstanceName: string | null = null;

function getEmailTransporter() {
  if (!emailTransporter && smtpHost && smtpUser && smtpPassword) {
    const port = Number(smtpPort) || 587;

    emailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }
  return emailTransporter;
}

function hasSendgridConfig() {
  return Boolean(sendgridApiKey);
}

function getFromEmail() {
  if (smtpUser?.trim()) {
    return smtpUser.trim();
  }
  return 'no-reply@girangotravels.com';
}

function normalizeRecipientList(values?: string[]) {
  return (values || []).map((item) => item.trim()).filter(Boolean);
}

interface EmailSendContent {
  html?: string;
  text?: string;
}

interface EmailSendResult {
  sent: boolean;
  recipients: string[];
  reason: 'sent' | 'no-recipients' | 'missing-content' | 'provider-not-configured' | 'send-failed';
  provider?: 'sendgrid' | 'smtp';
  fallbackUsed?: boolean;
  error?: string;
}

async function sendViaSendGrid(params: {
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
}) {
  const { to, subject, html, text, cc, bcc } = params;
  const personalizations: any = {
    to: to.map((email) => ({ email })),
  };

  if (cc?.length) {
    personalizations.cc = cc.map((email) => ({ email }));
  }

  if (bcc?.length) {
    personalizations.bcc = bcc.map((email) => ({ email }));
  }

  const content = [] as Array<{ type: string; value: string }>;
  if (text?.trim()) {
    content.push({ type: 'text/plain', value: text });
  }
  if (html?.trim()) {
    content.push({ type: 'text/html', value: html });
  }

  await axios.post(
    'https://api.sendgrid.com/v3/mail/send',
    {
      personalizations: [personalizations],
      from: {
        email: getFromEmail(),
        name: 'Girango tour & travel safaris',
      },
      subject,
      content,
    },
    {
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
}

async function sendViaSmtp(params: {
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
}) {
  const { to, subject, html, text, cc, bcc } = params;
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('SMTP transporter is not configured');
  }

  await transporter.sendMail({
    from: `"Girango Travels" <${getFromEmail()}>`,
    to: to.join(','),
    cc: cc?.join(','),
    bcc: bcc?.join(','),
    subject,
    html,
    text,
  });
}

interface NewBookingNotificationPayload {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  reservationCode: string;
  tourTitle: string;
  tourImageUrl?: string;
  totalAmount?: string | number;
  currency?: string;
  travelDate?: string;
  travelers?: number;
}

interface PaymentSuccessNotificationPayload {
  customerEmail?: string | null;
  customerPhone?: string | null;
  tourTitle: string;
  tourImageUrl?: string;
  amount: number | string;
  currency: string;
}

interface BookingStatusChangedNotificationPayload {
  customerName: string;
  customerEmail?: string | null;
  reservationCode: string;
  tourTitle: string;
  tourImageUrl?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'resolved';
  travelDate?: string;
}

interface PaymentPendingNotificationPayload {
  customerName: string;
  customerPhone?: string | null;
  reservationCode: string;
  tourTitle: string;
  tourImageUrl?: string;
  totalAmount: string | number;
  currency: string;
  daysSinceBooking: number;
}

function canSendNotifications() {
  return Boolean(pingAfricaApiKey);
}

function getPingAfricaApiBase() {
  const configured = (pingAfricaBaseUrl || 'https://bulk.ping.africa/api').trim();
  return configured.endsWith('/') ? configured.slice(0, -1) : configured;
}

function normalizeWhatsappNumber(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return digits;
}

function normalizeAppUrl() {
  const raw = (appUrl || '').trim();
  const base = raw || 'http://localhost:3000';
  return base.replace(/\/+$/, '');
}

function getLogoUrl() {
  return `${normalizeAppUrl()}/logo.png`;
}

const emailDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const whatsappDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDisplayDate(value?: string | Date | null) {
  if (!value) return 'N/A';

  const rawValue = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!rawValue) return 'N/A';

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
    ? new Date(`${rawValue}T00:00:00`)
    : new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return rawValue;
  }

  return emailDateFormatter.format(parsedDate);
}

function formatStatusLabel(status: string) {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function formatEventDateTime(value?: Date | string) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return whatsappDateTimeFormatter.format(new Date());
  }
  return whatsappDateTimeFormatter.format(parsed);
}

function buildWhatsappMessage(options: {
  title: string;
  points: string[];
  quickLinks?: Array<{ label: string; url: string }>;
  eventTime?: Date | string;
}) {
  const { title, points, quickLinks, eventTime } = options;
  const lines = [`*${title}*`, ''];

  points.forEach((point, index) => {
    lines.push(`${index + 1}. ${point}`);
  });

  if (quickLinks && quickLinks.length > 0) {
    lines.push('', '*Quick shortcuts:*');
    quickLinks.forEach((link, index) => {
      lines.push(`${index + 1}. ${link.label}: ${link.url}`);
    });
  }

  lines.push('', `_Event time: ${formatEventDateTime(eventTime)}_`);
  return lines.join('\n');
}

function renderEmailTemplate(options: {
  preheader?: string;
  heading: string;
  intro?: string;
  contentHtml: string;
  heroImageUrl?: string;
  heroKicker?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}) {
  const {
    preheader,
    heading,
    intro,
    contentHtml,
    heroImageUrl,
    heroKicker,
    ctaLabel,
    ctaUrl,
    footerNote,
  } = options;

  const logoUrl = getLogoUrl();
  const showCta = Boolean(ctaLabel && ctaUrl);
  const hasHeroImage = Boolean(heroImageUrl?.trim());
  const resolvedHeroKicker = heroKicker || 'Girango Travels';
  const heroStyle = hasHeroImage
    ? `background-image: linear-gradient(90deg, rgba(30,61,46,0.92) 0%, rgba(30,61,46,0.56) 52%, rgba(30,61,46,0.30) 100%), url('${heroImageUrl}'); background-size: cover; background-position: center;`
    : 'background: #1e3d2e;';

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${heading}</title>
        <style>
          body { margin: 0; padding: 0; background: #F5EFE6; color: #1a1100; font-family: Arial, Helvetica, sans-serif; }
          .wrapper { width: 100%; background: #F5EFE6; padding: 30px 12px; }
          .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 26px rgba(30, 31, 24, 0.10); }
          .header { padding: 18px 24px; background: #ffffff; border-bottom: 1px solid #EFE6D9; }
          .brand { display: flex; align-items: center; gap: 12px; color: #1e3d2e; }
          .brand img { width: 44px; height: 44px; border-radius: 9999px; background: #ffffff; object-fit: contain; }
          .brand h1 { margin: 0; font-size: 18px; line-height: 1.2; font-weight: 700; letter-spacing: 0.2px; }
          .hero { padding: 26px 24px 28px; color: #ffffff; ${heroStyle} }
          .hero-kicker { margin: 0 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: #F6E8BF; font-weight: 700; }
          .hero h2 { margin: 0; font-size: 28px; line-height: 1.2; color: #ffffff; }
          .content { padding: 24px; }
          .content p { margin: 0 0 12px; line-height: 1.7; color: #6B5E4A; font-size: 15px; }
          .content strong { color: #2D1F0A; }
          .panel { margin: 18px -24px 0; padding: 20px 24px; border-radius: 0; border: none; background: #1e3d2e; }
          .panel p { margin: 0 0 12px; color: #E8EFEA; }
          .panel p:last-child { margin-bottom: 0; }
          .panel strong { color: #F6E8BF; }
          .status-pill { display: inline-block; padding: 4px 10px; border-radius: 9999px; background: #EAF3ED; color: #1e3d2e; border: 1px solid #CFE1D5; font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
          .cta-wrap { margin-top: 18px; }
          .cta { display: inline-block; text-decoration: none; background: #C8962E; color: #ffffff !important; padding: 12px 20px; border-radius: 9999px; font-size: 14px; font-weight: 700; letter-spacing: 0.2px; }
          .footer { padding: 16px 24px 22px; font-size: 12px; line-height: 1.5; color: #6B5E4A; border-top: 1px solid #E5DDD0; background: #ffffff; }
          .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; }
        </style>
      </head>
      <body>
        <div class="preheader">${preheader || heading}</div>
        <div class="wrapper">
          <div class="card">
            <div class="header">
              <div class="brand">
                <img src="${logoUrl}" alt="Girango Travels" />
                <h1>Girango Travels</h1>
              </div>
            </div>
            <div class="hero">
              <p class="hero-kicker">${resolvedHeroKicker}</p>
              <h2>${heading}</h2>
            </div>
            <div class="content">
              ${intro ? `<p>${intro}</p>` : ''}
              <div class="panel">
                ${contentHtml}
              </div>
              ${showCta ? `<div class="cta-wrap"><a class="cta" href="${ctaUrl}">${ctaLabel}</a></div>` : ''}
            </div>
            <div class="footer">
              ${footerNote || 'This email was sent by Girango Travels. If you need help, reply to this message.'}
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function resolveWhatsappInstanceName() {
  if (resolvedWhatsappInstanceName) {
    return resolvedWhatsappInstanceName;
  }

  if (pingAfricaWhatsappInstanceName) {
    resolvedWhatsappInstanceName = pingAfricaWhatsappInstanceName;
    return resolvedWhatsappInstanceName;
  }

  const base = getPingAfricaApiBase();
  const response = await axios.get(`${base}/whatsapp/instances`, {
    headers: {
      Authorization: `Bearer ${pingAfricaApiKey}`,
    },
    timeout: 15000,
  });

  const instances = Array.isArray(response.data?.data) ? response.data.data : [];
  const openInstance = instances.find((item: any) => item?.connectionStatus === 'open');
  if (!openInstance?.name) {
    throw new Error('No open Ping Africa WhatsApp instance found. Connect one in dashboard first.');
  }

  resolvedWhatsappInstanceName = openInstance.name;
  return resolvedWhatsappInstanceName;
}

async function getNotificationConfig(notificationType: 'booking' | 'contact' | 'payment') {
  try {
    const { NotificationConfig } = require('../models');
    return await NotificationConfig.findOne({ where: { notificationType } });
  } catch (error) {
    console.error('Failed to fetch notification config:', error);
    return null;
  }
}

async function sendEmail(
  to: string | string[],
  subject: string,
  content: string | EmailSendContent,
  cc?: string[],
  bcc?: string[]
) : Promise<EmailSendResult> {
  const recipients = (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`No recipient emails configured for "${subject}". Skipping email notification.`);
    return { sent: false, recipients, reason: 'no-recipients' };
  }

  const normalizedCc = normalizeRecipientList(cc);
  const normalizedBcc = normalizeRecipientList(bcc);

  const normalizedContent = typeof content === 'string' ? { html: content } : content;
  const html = normalizedContent?.html?.trim();
  const text = normalizedContent?.text?.trim();

  if (!html && !text) {
    console.warn(`Missing email content for "${subject}". Skipping email notification.`);
    return { sent: false, recipients, reason: 'missing-content' };
  }

  if (hasSendgridConfig()) {
    try {
      await sendViaSendGrid({
        to: recipients,
        subject,
        html,
        text,
        cc: normalizedCc,
        bcc: normalizedBcc,
      });
      console.log(`✓ Email sent via SendGrid: ${subject} to ${recipients.join(',')}`);
      return { sent: true, recipients, reason: 'sent', provider: 'sendgrid', fallbackUsed: false };
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error(`SendGrid failed for "${subject}". Falling back to SMTP:`, errMessage);
    }
  } else {
    console.warn('SendGrid not configured. Falling back to SMTP.');
  }

  try {
    await sendViaSmtp({
      to: recipients,
      subject,
      html,
      text,
      cc: normalizedCc,
      bcc: normalizedBcc,
    });
    console.log(`✓ Email sent via SMTP fallback: ${subject} to ${recipients.join(',')}`);
    return { sent: true, recipients, reason: 'sent', provider: 'smtp', fallbackUsed: true };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to send email via fallback SMTP:', errMessage);
    return {
      sent: false,
      recipients,
      reason: hasSendgridConfig() || getEmailTransporter() ? 'send-failed' : 'provider-not-configured',
      provider: 'smtp',
      fallbackUsed: hasSendgridConfig(),
      error: errMessage,
    };
  }
}

async function sendSms(phone: string | null | undefined, message: string) {
  void phone;
  void message;
  return;
}

async function sendWhatsapp(phone: string | null | undefined, message: string) {
  if (!canSendNotifications()) return;

  const number = normalizeWhatsappNumber(phone);
  if (!number) return;

  try {
    const base = getPingAfricaApiBase();
    const instanceName = await resolveWhatsappInstanceName();

    await axios.post(
      `${base}/whatsapp/messages/text`,
      {
        instanceName,
        number,
        text: message,
      },
      {
        headers: {
          Authorization: `Bearer ${pingAfricaApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    console.log(`✓ WhatsApp sent to ${number}`);
  } catch (error) {
    console.error('Failed to send WhatsApp:', error instanceof Error ? error.message : error);
  }
}

async function notifyNewBooking({
  customerName,
  customerEmail,
  customerPhone,
  reservationCode,
  tourTitle,
  tourImageUrl,
  totalAmount,
  currency,
  travelDate,
  travelers,
}: NewBookingNotificationPayload) {
  const bookingUrl = `${normalizeAppUrl()}/dashboard/bookings`;
  const customerEmailHtml = renderEmailTemplate({
    preheader: `Booking received: ${reservationCode}`,
    heading: 'Booking Received',
    intro: `Hello ${customerName}, thanks for choosing Girango Travels — your adventure is now in motion.`,
    contentHtml: `
      <p>We have safely received your booking for <strong>${tourTitle}</strong> with reservation code <strong>${reservationCode}</strong>.</p>
      <p>Your planned travel date is <strong>${formatDisplayDate(travelDate)}</strong> for <strong>${travelers || 'N/A'}</strong> traveler(s), and the current package total is <strong>${totalAmount} ${currency}</strong>.</p>
      <p>Our travel consultant is now reviewing the details and will contact you shortly with the next simple steps.</p>
    `,
    heroImageUrl: tourImageUrl,
    heroKicker: 'Booking Update',
  });
  
  // Get admin notification config
  const config = await getNotificationConfig('booking');
  
  // Admin email notification
  if (config && config.enableEmail) {
    const adminEmailHtml = renderEmailTemplate({
      preheader: `New booking ${reservationCode}`,
      heading: 'New Booking Received',
      intro: 'A customer has submitted a new booking and is waiting for confirmation.',
      contentHtml: `
        <p><strong>${customerName}</strong> has requested <strong>${tourTitle}</strong> under reservation code <strong>${reservationCode}</strong>.</p>
        <p>The guest intends to travel on <strong>${formatDisplayDate(travelDate)}</strong>, for <strong>${travelers || 'N/A'}</strong> traveler(s), with a quoted total of <strong>${totalAmount} ${currency}</strong>.</p>
        <p>Contact number on file is <strong>${customerPhone || 'N/A'}</strong>, and the booking is currently <span class="status-pill">Pending</span>.</p>
      `,
      heroImageUrl: tourImageUrl,
      heroKicker: 'Admin Alert',
      ctaLabel: 'Open Booking in Dashboard',
      ctaUrl: bookingUrl,
    });
    
    await sendEmail(
      config.recipientEmails,
      `New Booking: ${reservationCode}`,
      adminEmailHtml,
      config.ccEmails,
      config.bccEmails
    );
  }

  // Admin SMS/WhatsApp notifications
  if (config && config.enableWhatsapp && config.recipientPhones.length > 0) {
    const adminSmsMessage = buildWhatsappMessage({
      title: 'New Booking Request Received',
      points: [
        `Reservation ${reservationCode} was submitted by ${customerName}.`,
        `Tour selected: ${tourTitle}.`,
        `Travel date: ${formatDisplayDate(travelDate)} for ${travelers || 'N/A'} traveler(s).`,
        `Quoted amount: ${totalAmount} ${currency}.`,
      ],
      quickLinks: [
        { label: 'Open bookings dashboard', url: bookingUrl },
      ],
    });
    
    for (const phone of config.recipientPhones) {
      if (config.enableWhatsapp) {
        await sendWhatsapp(phone, adminSmsMessage);
      }
    }
  }

  if (customerEmail) {
    await sendEmail(customerEmail, `Booking Received: ${reservationCode}`, customerEmailHtml);
  }
}

async function notifyPaymentPending({
  customerName,
  customerPhone,
  reservationCode,
  tourTitle,
  tourImageUrl,
  totalAmount,
  currency,
  daysSinceBooking,
}: PaymentPendingNotificationPayload) {
  // Get payment pending config
  const config = await getNotificationConfig('payment');
  
  if (!config) return;

  // Admin email notification
  if (config.enableEmail) {
    const bookingUrl = `${normalizeAppUrl()}/dashboard/bookings`;
    const adminEmailHtml = renderEmailTemplate({
      preheader: `Payment pending ${reservationCode}`,
      heading: 'Payment Pending for Booking',
      intro: 'A booking needs payment follow-up from the team.',
      contentHtml: `
        <p>Reservation <strong>${reservationCode}</strong> for <strong>${tourTitle}</strong> is still awaiting full payment.</p>
        <p>The customer is <strong>${customerName}</strong> (${customerPhone || 'N/A'}), with an outstanding amount of <strong>${totalAmount} ${currency}</strong> after <strong>${daysSinceBooking}</strong> day(s) since booking.</p>
        <p>Please follow up with the guest to confirm payment and keep the booking moving smoothly.</p>
      `,
      heroImageUrl: tourImageUrl,
      heroKicker: 'Payment Alert',
      ctaLabel: 'View Booking',
      ctaUrl: bookingUrl,
    });
    
    await sendEmail(
      config.recipientEmails,
      `Payment Pending: ${reservationCode}`,
      adminEmailHtml,
      config.ccEmails,
      config.bccEmails
    );
  }

  // Admin SMS/WhatsApp notifications
  if (config.enableWhatsapp && config.recipientPhones.length > 0) {
    const bookingUrl = `${normalizeAppUrl()}/dashboard/bookings`;
    const adminSmsMessage = buildWhatsappMessage({
      title: 'Payment Follow-up Needed',
      points: [
        `Reservation ${reservationCode} is still pending payment.`,
        `Customer: ${customerName} (${customerPhone || 'N/A'}).`,
        `Outstanding amount: ${totalAmount} ${currency}.`,
        `Days since booking: ${daysSinceBooking}.`,
      ],
      quickLinks: [
        { label: 'Open booking for follow-up', url: bookingUrl },
      ],
    });
    
    for (const phone of config.recipientPhones) {
      if (config.enableWhatsapp) {
        await sendWhatsapp(phone, adminSmsMessage);
      }
    }
  }
}

async function notifyPaymentSuccess({
  customerEmail,
  customerPhone,
  tourTitle,
  tourImageUrl,
  amount,
  currency,
}: PaymentSuccessNotificationPayload) {
  void customerPhone;

  if (!customerEmail) {
    return;
  }

  const customerEmailHtml = renderEmailTemplate({
    preheader: `Payment received for ${tourTitle}`,
    heading: 'Payment Received Successfully',
    intro: 'Great choice — your payment has been received and your trip is now secured.',
    contentHtml: `
      <p>We have successfully received <strong>${amount} ${currency}</strong> for your <strong>${tourTitle}</strong> booking.</p>
      <p>Your reservation is protected, and our team will keep sharing the important trip details as your departure date approaches.</p>
    `,
    heroImageUrl: tourImageUrl,
    heroKicker: 'Payment Confirmation',
  });

  await sendEmail(customerEmail, 'Payment Successful', customerEmailHtml);
}

async function notifyBookingStatusChanged({
  customerName,
  customerEmail,
  reservationCode,
  tourTitle,
  tourImageUrl,
  status,
  travelDate,
}: BookingStatusChangedNotificationPayload) {
  if (status === 'resolved') {
    return {
      attempted: false,
      sent: false,
      reason: 'resolved-no-notification',
      status,
    };
  }

  if (!customerEmail?.trim()) {
    return {
      attempted: false,
      sent: false,
      reason: 'missing-customer-email',
      status,
    };
  }

  const statusCopy: Record<BookingStatusChangedNotificationPayload['status'], { heading: string; intro: string }> = {
    pending: {
      heading: 'Booking Status Updated: Pending',
      intro: 'Your booking is currently pending review by our team.',
    },
    confirmed: {
      heading: 'Booking Confirmed',
      intro: 'Excellent news  your safari is officially confirmed and we are excited to host you.',
    },
    cancelled: {
      heading: 'Booking Cancelled',
      intro: 'Your booking has been cancelled. If this was not intentional, our team can assist you right away.',
    },
    completed: {
      heading: 'Booking Completed',
      intro: 'Congratulations on completing your trip with us — we hope it was unforgettable from start to finish.',
    },
    resolved: {
      heading: 'Booking Resolved',
      intro: 'Your booking was resolved by our support team.',
    },
  };

  const template = statusCopy[status];
  const customerEmailHtml = renderEmailTemplate({
    preheader: `${reservationCode} is now ${status}`,
    heading: template.heading,
    intro: `Hello ${customerName}, ${template.intro}`,
    contentHtml: `
      <p>Your booking <strong>${reservationCode}</strong> for <strong>${tourTitle}</strong> is now <span class="status-pill">${formatStatusLabel(status)}</span>.</p>
      <p>Your travel date remains <strong>${formatDisplayDate(travelDate)}</strong>, and our team is on standby to guide you through any next step you need.</p>
    `,
    heroImageUrl: tourImageUrl,
    heroKicker: 'Booking Status',
  });

  const result = await sendEmail(
    customerEmail,
    `Booking ${status.charAt(0).toUpperCase()}${status.slice(1)}: ${reservationCode}`,
    customerEmailHtml
  );

  return {
    attempted: true,
    sent: result.sent,
    reason: result.reason,
    error: result.error,
    recipient: customerEmail,
    status,
  };
}

interface AdminReplyNotificationPayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  replyMessage: string;
}

interface ReviewInvitationNotificationPayload {
  customerName: string;
  customerEmail?: string | null;
  reservationCode: string;
  tourTitle: string;
  tourImageUrl?: string;
  reviewUrl: string;
}

async function notifyReviewInvitation({
  customerName,
  customerEmail,
  reservationCode,
  tourTitle,
  tourImageUrl,
  reviewUrl,
}: ReviewInvitationNotificationPayload) {
  if (!customerEmail?.trim()) {
    return {
      attempted: false,
      sent: false,
      reason: 'missing-customer-email',
    };
  }

  const customerEmailHtml = renderEmailTemplate({
    preheader: `Share your experience for ${reservationCode}`,
    heading: 'How was your trip?',
    intro: `Hello ${customerName}, thank you for traveling with Girango Travels.`,
    contentHtml: `
      <p>We would love to hear how your <strong>${tourTitle}</strong> experience went under booking <strong>${reservationCode}</strong>.</p>
      <p>Your feedback helps future travelers book with confidence and helps us keep improving every journey we create.</p>
      <p>This review link is personal to your completed trip and only takes a minute to complete.</p>
    `,
    heroImageUrl: tourImageUrl,
    heroKicker: 'Share Your Experience',
    ctaLabel: 'Leave a Review',
    ctaUrl: reviewUrl,
  });

  const result = await sendEmail(customerEmail, `Please review your trip: ${reservationCode}`, customerEmailHtml);

  return {
    attempted: true,
    sent: result.sent,
    reason: result.reason,
    error: result.error,
    recipient: customerEmail,
  };
}

async function sendAdminReplyNotification({ name, phone, email, replyMessage }: AdminReplyNotificationPayload) {
  const contactUrl = `${normalizeAppUrl()}/contact`;
  const smsmessage = buildWhatsappMessage({
    title: `Hello ${name}, your Girango Travels update`,
    points: [
      'Our support team has replied to your enquiry.',
      `Response: "${replyMessage}"`,
      'If you need anything else, reply to this message and we will assist quickly.',
    ],
    quickLinks: [
      { label: 'Contact us', url: contactUrl },
      { label: 'Browse tours', url: `${normalizeAppUrl()}/tours` },
    ],
  });

  // Send to customer via SMS/WhatsApp if phone available
  if (phone) {
    try {
      await Promise.allSettled([sendWhatsapp(phone, smsmessage)]);
    } catch (error) {
      console.error('Failed to send customer reply notification:', error);
    }
  }

  // Get contact notification config for admin notifications
  const config = await getNotificationConfig('contact');
  if (config && config.enableEmail && email) {
    const adminEmailHtml = renderEmailTemplate({
      preheader: `Reply sent to ${name}`,
      heading: 'Reply Delivered to Customer',
      intro: `Your team message has been sent successfully to ${name}.`,
      contentHtml: `
        <p>The customer <strong>${name}</strong> (${email}) has now received your response.</p>
        <p>Your message was:</p>
        <p>${replyMessage.replace(/\n/g, '<br>')}</p>
      `,
      heroKicker: 'Contact Support',
    });
    
    await sendEmail(
      config.recipientEmails,
      `Reply Sent to ${name}`,
      adminEmailHtml,
      config.ccEmails,
      config.bccEmails
    );
  }
}

async function notifyContactSubmitted(contact: any) {
  // Get contact notification config
  const config = await getNotificationConfig('contact');
  
  if (!config) return;

  // Admin email notification
  if (config.enableEmail) {
    const contactUrl = `${normalizeAppUrl()}/dashboard/contacts`;
    const adminEmailHtml = renderEmailTemplate({
      preheader: `New contact from ${contact.name}`,
      heading: 'New Contact Message',
      intro: 'A new customer enquiry has arrived from your website.',
      contentHtml: `
        <p><strong>${contact.name}</strong> has reached out and is waiting for your response.</p>
        <p>You can reach them at <strong>${contact.email}</strong>${contact.phone ? ` or <strong>${contact.phone}</strong>` : ''}.</p>
        <p>Message received:</p>
        <p>${contact.message.replace(/\n/g, '<br>')}</p>
      `,
      heroKicker: 'Customer Enquiry',
      ctaLabel: 'Open Contact in Dashboard',
      ctaUrl: contactUrl,
    });
    
    await sendEmail(
      config.recipientEmails,
      `New Contact: ${contact.name}`,
      adminEmailHtml,
      config.ccEmails,
      config.bccEmails
    );
  }

  // Admin SMS/WhatsApp notifications
  if (config.enableWhatsapp && config.recipientPhones.length > 0) {
    const contactUrl = `${normalizeAppUrl()}/dashboard/contacts`;
    const adminSmsMessage = buildWhatsappMessage({
      title: 'New Website Enquiry',
      points: [
        `${contact.name} sent a new contact request.`,
        `Email: ${contact.email}${contact.phone ? ` | Phone: ${contact.phone}` : ''}.`,
        `Message preview: ${contact.message.substring(0, 120)}${contact.message.length > 120 ? '...' : ''}`,
      ],
      quickLinks: [
        { label: 'Open contacts dashboard', url: contactUrl },
      ],
    });
    
    for (const phone of config.recipientPhones) {
      if (config.enableWhatsapp) {
        await sendWhatsapp(phone, adminSmsMessage);
      }
    }
  }
}

module.exports = {
  notifyNewBooking,
  notifyBookingStatusChanged,
  notifyPaymentSuccess,
  notifyPaymentPending,
  sendAdminReplyNotification,
  notifyContactSubmitted,
  notifyReviewInvitation,
  getNotificationConfig,
};
