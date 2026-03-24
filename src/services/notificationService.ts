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
  appUrl,
} = require('../config/env');

let emailTransporter: any = null;
let resolvedWhatsappInstanceName: string | null = null;

function getEmailTransporter() {
  if (!emailTransporter && smtpHost && smtpUser && smtpPassword) {
    emailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort || 587,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }
  return emailTransporter;
}

interface NewBookingNotificationPayload {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  reservationCode: string;
  tourTitle: string;
  totalAmount?: string | number;
  currency?: string;
  travelDate?: string;
  travelers?: number;
}

interface PaymentSuccessNotificationPayload {
  customerEmail?: string | null;
  customerPhone?: string | null;
  tourTitle: string;
  amount: number | string;
  currency: string;
}

interface BookingStatusChangedNotificationPayload {
  customerName: string;
  customerEmail?: string | null;
  reservationCode: string;
  tourTitle: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'resolved';
  travelDate?: string;
}

interface PaymentPendingNotificationPayload {
  customerName: string;
  customerPhone?: string | null;
  reservationCode: string;
  tourTitle: string;
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

function renderEmailTemplate(options: {
  preheader?: string;
  heading: string;
  intro?: string;
  contentHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}) {
  const {
    preheader,
    heading,
    intro,
    contentHtml,
    ctaLabel,
    ctaUrl,
    footerNote,
  } = options;

  const logoUrl = getLogoUrl();
  const showCta = Boolean(ctaLabel && ctaUrl);

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${heading}</title>
        <style>
          body { margin: 0; padding: 0; background: #f9f6ef; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
          .wrapper { width: 100%; background: #f9f6ef; padding: 28px 12px; }
          .card { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #efe8d8; border-radius: 16px; overflow: hidden; }
          .header { padding: 22px 24px; background: linear-gradient(135deg, #0f766e 0%, #d4af37 100%); }
          .brand { display: flex; align-items: center; gap: 12px; color: #ffffff; }
          .brand img { width: 44px; height: 44px; border-radius: 9999px; background: #fff; object-fit: contain; }
          .brand h1 { margin: 0; font-size: 18px; line-height: 1.2; font-weight: 700; }
          .content { padding: 24px; }
          .content h2 { margin: 0 0 10px; font-size: 20px; line-height: 1.3; color: #0f172a; }
          .content p { margin: 0 0 12px; line-height: 1.6; color: #475569; }
          .panel { margin: 16px 0; padding: 14px 16px; border-radius: 12px; border: 1px solid #efe8d8; background: #fcfaf4; }
          .panel p { margin: 0 0 8px; }
          .panel p:last-child { margin-bottom: 0; }
          .cta-wrap { margin-top: 18px; }
          .cta { display: inline-block; text-decoration: none; background: #d4af37; color: #ffffff !important; padding: 11px 16px; border-radius: 10px; font-weight: 700; }
          .footer { padding: 16px 24px 22px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
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
            <div class="content">
              <h2>${heading}</h2>
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
  html: string,
  cc?: string[],
  bcc?: string[]
) {
  const recipients = (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.warn(`No recipient emails configured for "${subject}". Skipping email notification.`);
    return { sent: false, recipients, reason: 'no-recipients' };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('Email service not configured (SMTP). Skipping email notification.');
    return { sent: false, recipients, reason: 'smtp-not-configured' };
  }

  try {
    await transporter.sendMail({
      from: `"Girango Travels" <${smtpUser}>`,
      to: recipients.join(','),
      cc: cc?.join(','),
      bcc: bcc?.join(','),
      subject,
      html,
    });
    console.log(`✓ Email sent: ${subject} to ${recipients.join(',')}`);
    return { sent: true, recipients, reason: 'sent' };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to send email:', errMessage);
    return { sent: false, recipients, reason: 'send-failed', error: errMessage };
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
  totalAmount,
  currency,
  travelDate,
  travelers,
}: NewBookingNotificationPayload) {
  const bookingUrl = `${normalizeAppUrl()}/dashboard/bookings`;
  const customerEmailHtml = renderEmailTemplate({
    preheader: `Booking received: ${reservationCode}`,
    heading: 'Booking Received',
    intro: `Hello ${customerName}, your booking has been received successfully.`,
    contentHtml: `
      <p><strong>Reservation Code:</strong> ${reservationCode}</p>
      <p><strong>Tour:</strong> ${tourTitle}</p>
      <p><strong>Travel Date:</strong> ${travelDate || 'N/A'}</p>
      <p><strong>Number of Travelers:</strong> ${travelers || 'N/A'}</p>
      <p><strong>Total Amount:</strong> ${totalAmount} ${currency}</p>
      <p>Our team will review and follow up with you shortly.</p>
    `,
  });
  
  // Get admin notification config
  const config = await getNotificationConfig('booking');
  
  // Admin email notification
  if (config && config.enableEmail) {
    const adminEmailHtml = renderEmailTemplate({
      preheader: `New booking ${reservationCode}`,
      heading: 'New Booking Received',
      intro: 'A new booking has been submitted and needs review.',
      contentHtml: `
        <p><strong>Reservation Code:</strong> ${reservationCode}</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Customer Phone:</strong> ${customerPhone || 'N/A'}</p>
        <p><strong>Tour:</strong> ${tourTitle}</p>
        <p><strong>Travel Date:</strong> ${travelDate || 'N/A'}</p>
        <p><strong>Number of Travelers:</strong> ${travelers || 'N/A'}</p>
        <p><strong>Total Amount:</strong> ${totalAmount} ${currency}</p>
        <p><strong>Status:</strong> Pending Confirmation</p>
      `,
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
    const adminSmsMessage = `New booking: ${reservationCode}. Customer: ${customerName}. Tour: ${tourTitle}. Amount: ${totalAmount} ${currency}. View in dashboard.`;
    
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
      intro: 'A booking has not been fully paid and may require follow-up.',
      contentHtml: `
        <p><strong>Reservation Code:</strong> ${reservationCode}</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Customer Phone:</strong> ${customerPhone || 'N/A'}</p>
        <p><strong>Tour:</strong> ${tourTitle}</p>
        <p><strong>Outstanding Amount:</strong> ${totalAmount} ${currency}</p>
        <p><strong>Days Since Booking:</strong> ${daysSinceBooking}</p>
        <p><strong>Action Required:</strong> Follow up with customer for payment confirmation.</p>
      `,
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
    const adminSmsMessage = `Payment pending: ${reservationCode}. Customer: ${customerName}. Amount: ${totalAmount} ${currency}. Days since booking: ${daysSinceBooking}.`;
    
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
    intro: 'Thank you! Your payment has been received.',
    contentHtml: `
      <p><strong>Tour:</strong> ${tourTitle}</p>
      <p><strong>Amount:</strong> ${amount} ${currency}</p>
      <p>Your reservation is now secured and our team will keep you updated.</p>
    `,
  });

  await sendEmail(customerEmail, 'Payment Successful', customerEmailHtml);
}

async function notifyBookingStatusChanged({
  customerName,
  customerEmail,
  reservationCode,
  tourTitle,
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
      intro: 'Great news! Your booking has been confirmed.',
    },
    cancelled: {
      heading: 'Booking Cancelled',
      intro: 'Your booking has been cancelled. If this is unexpected, please contact us immediately.',
    },
    completed: {
      heading: 'Booking Completed',
      intro: 'Your trip has been marked as completed. Thank you for choosing Girango Travels.',
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
      <p><strong>Reservation Code:</strong> ${reservationCode}</p>
      <p><strong>Tour:</strong> ${tourTitle}</p>
      <p><strong>Travel Date:</strong> ${travelDate || 'N/A'}</p>
      <p><strong>Current Status:</strong> ${status}</p>
    `,
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

async function sendAdminReplyNotification({ name, phone, email, replyMessage }: AdminReplyNotificationPayload) {
  const smsmessage = `Hello ${name}, the Girango Travels team has replied to your enquiry: "${replyMessage}"`;

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
    const adminEmailHtml = `
      <h2>Admin Reply Sent to Contact</h2>
      <p><strong>Customer:</strong> ${name}</p>
      <p><strong>Customer Email:</strong> ${email}</p>
      <p><strong>Reply Message:</strong></p>
      <p>${replyMessage.replace(/\n/g, '<br>')}</p>
    `;
    
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
      intro: 'A new message has arrived from the contact form.',
      contentHtml: `
        <p><strong>Name:</strong> ${contact.name}</p>
        <p><strong>Email:</strong> ${contact.email}</p>
        <p><strong>Phone:</strong> ${contact.phone || 'Not provided'}</p>
        <p><strong>Message:</strong></p>
        <p>${contact.message.replace(/\n/g, '<br>')}</p>
      `,
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
    const adminSmsMessage = `New contact: ${contact.name}. Email: ${contact.email}. Message: ${contact.message.substring(0, 80)}...`;
    
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
  getNotificationConfig,
};
