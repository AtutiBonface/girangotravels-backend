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
  customerPhone?: string | null;
  reservationCode: string;
  tourTitle: string;
  totalAmount?: string | number;
  currency?: string;
  travelDate?: string;
  travelers?: number;
}

interface PaymentSuccessNotificationPayload {
  customerPhone?: string | null;
  tourTitle: string;
  amount: number | string;
  currency: string;
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
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('Email service not configured (SMTP). Skipping email notification.');
    return;
  }

  try {
    const recipients = Array.isArray(to) ? to : [to];
    await transporter.sendMail({
      from: `"Girango Travels" <${smtpUser}>`,
      to: recipients.join(','),
      cc: cc?.join(','),
      bcc: bcc?.join(','),
      subject,
      html,
    });
    console.log(`✓ Email sent: ${subject} to ${recipients.join(',')}`);
  } catch (error) {
    console.error('Failed to send email:', error instanceof Error ? error.message : error);
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
  customerPhone,
  reservationCode,
  tourTitle,
  totalAmount,
  currency,
  travelDate,
  travelers,
}: NewBookingNotificationPayload) {
  // Customer notifications
  const customerSmsMessage = `Hello ${customerName}, your booking for ${tourTitle} (${reservationCode}) has been received. We'll confirm shortly.`;
  
  // Get admin notification config
  const config = await getNotificationConfig('booking');
  
  // Admin email notification
  if (config && config.enableEmail) {
    const bookingUrl = `${appUrl}/dashboard/bookings`;
    const adminEmailHtml = `
      <h2>New Booking Received</h2>
      <p><strong>Reservation Code:</strong> ${reservationCode}</p>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Customer Phone:</strong> ${customerPhone || 'N/A'}</p>
      <p><strong>Tour:</strong> ${tourTitle}</p>
      <p><strong>Travel Date:</strong> ${travelDate || 'N/A'}</p>
      <p><strong>Number of Travelers:</strong> ${travelers || 'N/A'}</p>
      <p><strong>Total Amount:</strong> ${totalAmount} ${currency}</p>
      <p><strong>Status:</strong> Pending Confirmation</p>
      <p><a href="${bookingUrl}" style="background-color: #d4af37; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Booking</a></p>
    `;
    
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

  // Customer SMS/WhatsApp (always send to customer when they provide phone)
  try {
    await Promise.allSettled([sendWhatsapp(customerPhone, customerSmsMessage)]);
  } catch (error) {
    console.error('Failed to send customer notification:', error);
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
    const bookingUrl = `${appUrl}/dashboard/bookings`;
    const adminEmailHtml = `
      <h2>Payment Pending for Booking</h2>
      <p><strong>Reservation Code:</strong> ${reservationCode}</p>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Customer Phone:</strong> ${customerPhone || 'N/A'}</p>
      <p><strong>Tour:</strong> ${tourTitle}</p>
      <p><strong>Outstanding Amount:</strong> ${totalAmount} ${currency}</p>
      <p><strong>Days Since Booking:</strong> ${daysSinceBooking}</p>
      <p style="color: #d32f2f;"><strong>Action Required:</strong> Follow up with customer for payment confirmation</p>
      <p><a href="${bookingUrl}" style="background-color: #d4af37; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Booking</a></p>
    `;
    
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
  customerPhone,
  tourTitle,
  amount,
  currency,
}: PaymentSuccessNotificationPayload) {
  const message = `Your payment of ${amount} ${currency} for ${tourTitle} has been received successfully. Thank you!`;

  try {
    await Promise.allSettled([sendWhatsapp(customerPhone, message)]);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown notification error';
    console.error('Notification error:', errMessage);
  }
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
    const contactUrl = `${appUrl}/dashboard/contacts`;
    const adminEmailHtml = `
      <h2>New Contact Message</h2>
      <p><strong>Name:</strong> ${contact.name}</p>
      <p><strong>Email:</strong> ${contact.email}</p>
      <p><strong>Phone:</strong> ${contact.phone || 'Not provided'}</p>
      <p><strong>Message:</strong></p>
      <p>${contact.message.replace(/\n/g, '<br>')}</p>
      <p><a href="${contactUrl}" style="background-color: #d4af37; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View in Dashboard</a></p>
    `;
    
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
  notifyPaymentSuccess,
  notifyPaymentPending,
  sendAdminReplyNotification,
  notifyContactSubmitted,
  getNotificationConfig,
};
