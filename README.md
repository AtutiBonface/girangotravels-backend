# Girango Travels Express Backend

Express + PostgreSQL backend for authentication, tours, bookings, payments, contact messages, and moderated customer reviews.

## Features

- JWT authentication (`register`, `login`, `me`) with role support (`customer`, `admin`)
- Tour package APIs
- Booking APIs with reservation code generation
- Payment record APIs (M-Pesa, Visa, Mastercard providers)
- Contact message APIs
- Database-backed customer reviews with admin approval workflow
- Optional Ping Africa notification integration (booking and payment events)

## Stack

- Express.js
- Sequelize ORM + PostgreSQL
- Zod validation
- JWT + bcrypt

## Setup

1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Update `.env` with your PostgreSQL URL and JWT secret.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start in development:
   ```bash
   npm run dev
   ```
5. Build TypeScript:
   ```bash
   npm run build
   ```
6. Start production build:
   ```bash
   npm start
   ```

The API will start on `http://localhost:5000` by default.

## API Base

`/api`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)

### Tours
- `GET /api/tours`
- `GET /api/tours/:id`
- `POST /api/tours` (admin)
- `PATCH /api/tours/:id` (admin)

### Bookings
- `POST /api/bookings` (auth)
- `GET /api/bookings/mine` (auth)
- `GET /api/bookings` (admin)
- `GET /api/bookings/:id` (auth or owner)
- `PATCH /api/bookings/:id/status` (admin)

### Payments
- `POST /api/payments` (auth)
- `GET /api/payments/booking/:bookingId` (auth or admin)
- `PATCH /api/payments/:id/status` (admin)

### Contacts
- `POST /api/contacts`
- `GET /api/contacts` (admin)
- `PATCH /api/contacts/:id/status` (admin)

### Reviews
- `GET /api/reviews` (public, approved only)
- `POST /api/reviews` (submit review, pending approval)
- `GET /api/reviews/admin?status=pending|approved|rejected` (admin)
- `PATCH /api/reviews/:id/status` (admin, `approved` or `rejected`)

## Notes

- Sequelize uses `sync()` at startup for rapid setup.
- For production, use proper migrations before deployment.
- Reviews are stored in `reviews` and are publicly visible only after admin approval.
