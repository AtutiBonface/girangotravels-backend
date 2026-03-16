const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];

interface EnvConfig {
  env: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  pingAfricaBaseUrl: string;
  pingAfricaApiKey: string;
  pingAfricaSenderId: string;
  adminAlertPhone: string;
}

for (const variable of requiredEnv) {
  if (!process.env[variable]) {
    throw new Error(`Missing required environment variable: ${variable}`);
  }
}

const envConfig: EnvConfig = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL as string,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  pingAfricaBaseUrl: process.env.PING_AFRICA_BASE_URL || '',
  pingAfricaApiKey: process.env.PING_AFRICA_API_KEY || '',
  pingAfricaSenderId: process.env.PING_AFRICA_SENDER_ID || '',
  adminAlertPhone: process.env.ADMIN_ALERT_PHONE || '',
};

module.exports = envConfig;
