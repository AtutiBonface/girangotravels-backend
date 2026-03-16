const axios = require('axios');
const {
  pingAfricaBaseUrl,
  pingAfricaApiKey,
  pingAfricaSenderId,
  adminAlertPhone,
} = require('../config/env');

interface NewBookingNotificationPayload {
  customerName: string;
  customerPhone?: string | null;
  reservationCode: string;
  tourTitle: string;
}

interface PaymentSuccessNotificationPayload {
  customerPhone?: string | null;
  tourTitle: string;
  amount: number | string;
  currency: string;
}

function canSendNotifications() {
  return Boolean(pingAfricaBaseUrl && pingAfricaApiKey && pingAfricaSenderId);
}

async function sendSms(phone: string | null | undefined, message: string) {
  if (!canSendNotifications() || !phone) return;

  await axios.post(
    `${pingAfricaBaseUrl}/sms/send`,
    {
      to: phone,
      message,
      senderId: pingAfricaSenderId,
    },
    {
      headers: {
        Authorization: `Bearer ${pingAfricaApiKey}`,
      },
      timeout: 15000,
    }
  );
}

async function sendWhatsapp(phone: string | null | undefined, message: string) {
  if (!canSendNotifications() || !phone) return;

  await axios.post(
    `${pingAfricaBaseUrl}/whatsapp/send`,
    {
      to: phone,
      message,
    },
    {
      headers: {
        Authorization: `Bearer ${pingAfricaApiKey}`,
      },
      timeout: 15000,
    }
  );
}

async function notifyNewBooking({
  customerName,
  customerPhone,
  reservationCode,
  tourTitle,
}: NewBookingNotificationPayload) {
  const customerMessage = `Hello ${customerName}, your booking for ${tourTitle} has been received. Reservation ID: ${reservationCode}.`;
  const adminMessage = `New booking received: ${reservationCode} for ${tourTitle}.`;

  try {
    await Promise.allSettled([
      sendSms(customerPhone, customerMessage),
      sendWhatsapp(customerPhone, customerMessage),
      sendSms(adminAlertPhone, adminMessage),
    ]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown notification error';
    console.error('Notification error:', message);
  }
}

async function notifyPaymentSuccess({
  customerPhone,
  tourTitle,
  amount,
  currency,
}: PaymentSuccessNotificationPayload) {
  const message = `Your payment of ${amount} ${currency} for ${tourTitle} has been received successfully.`;

  try {
    await Promise.allSettled([sendSms(customerPhone, message), sendWhatsapp(customerPhone, message)]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown notification error';
    console.error('Notification error:', message);
  }
}

interface AdminReplyNotificationPayload {
  name: string;
  phone?: string | null;
  replyMessage: string;
}

async function sendAdminReplyNotification({ name, phone, replyMessage }: AdminReplyNotificationPayload) {
  const message = `Hello ${name}, the Girango Travels team has replied to your enquiry: "${replyMessage}"`;

  try {
    await Promise.allSettled([sendSms(phone, message), sendWhatsapp(phone, message)]);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown notification error';
    console.error('Reply notification error:', errMessage);
  }
}

module.exports = {
  notifyNewBooking,
  notifyPaymentSuccess,
  sendAdminReplyNotification,
};
