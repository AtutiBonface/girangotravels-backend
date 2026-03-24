const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config();

interface EnvConfig {
  env: string;
  port: number;
  databaseUrl: string;
  uploadDir: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  paystackSecretKey: string;
  paystackCallbackUrl: string;
  paystackCurrency: string;
  paystackCurrencyFallbacks: string[];
  pingAfricaBaseUrl: string;
  pingAfricaApiKey: string;
  pingAfricaSenderId: string;
  pingAfricaWhatsappInstanceName: string;
  adminAlertPhone: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  appUrl: string;
}

function parseCurrencyList(rawValue: string | undefined) {
  if (!rawValue) return [] as string[];

  const unique = new Set<string>();
  for (const part of rawValue.split(',')) {
    const currency = part.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency)) {
      unique.add(currency);
    }
  }

  return [...unique];
}

const defaultLocalDatabaseUrl =
  'postgres://robert_girangotravels:Robert123@localhost:5432/robert_girangotravels';

const resolvedEnv = process.env.NODE_ENV || 'development';
const resolvedDatabaseUrl = process.env.DATABASE_URL || defaultLocalDatabaseUrl;
const rawUploadDir = (process.env.UPLOAD_DIR || 'uploads').trim();
const resolvedUploadDir = path.isAbsolute(rawUploadDir)
  ? rawUploadDir
  : path.resolve(process.cwd(), rawUploadDir);

if (resolvedEnv === 'production' && !process.env.DATABASE_URL) {
  throw new Error('Missing required environment variable in production: DATABASE_URL');
}

if (!process.env.JWT_SECRET) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

const envConfig: EnvConfig = {
  env: resolvedEnv,
  port: Number(process.env.PORT || 5000),
  databaseUrl: resolvedDatabaseUrl,
  uploadDir: resolvedUploadDir,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || '',
  paystackCurrency: (process.env.PAYSTACK_CURRENCY || '').trim().toUpperCase(),
  paystackCurrencyFallbacks: parseCurrencyList(process.env.PAYSTACK_CURRENCY_FALLBACKS),
  pingAfricaBaseUrl: process.env.PING_AFRICA_BASE_URL || '',
  pingAfricaApiKey: process.env.PING_AFRICA_API_KEY || '',
  pingAfricaSenderId: process.env.PING_AFRICA_SENDER_ID || '',
  pingAfricaWhatsappInstanceName: process.env.PING_AFRICA_WHATSAPP_INSTANCE_NAME || '',
  adminAlertPhone: process.env.ADMIN_ALERT_PHONE || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
};

module.exports = envConfig;
