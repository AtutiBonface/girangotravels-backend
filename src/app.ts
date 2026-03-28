import type { Application, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('node:path');

const authRoutes = require('./routes/authRoutes');
const tourRoutes = require('./routes/tourRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const contactRoutes = require('./routes/contactRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const auditRoutes = require('./routes/auditRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationConfigRoutes = require('./routes/notificationConfigRoutes');
const env = require('./config/env');

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app: Application = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in whitelist
      const isAllowed = env.corsOrigins.includes(origin);
      if (isAllowed || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}. Allowed: ${env.corsOrigins.join(', ')}`);
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(env.uploadDir || path.join(process.cwd(), 'uploads')));

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/notification-config', notificationConfigRoutes);

app.use(notFoundHandler);
app.use(errorHandler);


module.exports = app;
