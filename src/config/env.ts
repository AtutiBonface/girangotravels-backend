const dotenv = require('dotenv');

dotenv.config();

interface EnvConfig {
  env: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  paystackSecretKey: string;
  paystackCallbackUrl: string;
  pingAfricaBaseUrl: string;
  pingAfricaApiKey: string;
  pingAfricaSenderId: string;
  adminAlertPhone: string;
}

const defaultLocalDatabaseUrl =
  'postgres://robert_girangotravels:Robert123@localhost:5432/robert_girangotravels';

const resolvedEnv = process.env.NODE_ENV || 'development';
const resolvedDatabaseUrl = process.env.DATABASE_URL || defaultLocalDatabaseUrl;

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
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || '',
  pingAfricaBaseUrl: process.env.PING_AFRICA_BASE_URL || '',
  pingAfricaApiKey: process.env.PING_AFRICA_API_KEY || '',
  pingAfricaSenderId: process.env.PING_AFRICA_SENDER_ID || '',
  adminAlertPhone: process.env.ADMIN_ALERT_PHONE || '',
};

module.exports = envConfig;
