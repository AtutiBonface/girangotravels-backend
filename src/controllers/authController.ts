import type { NextFunction, Response } from 'express';
import type { SignOptions } from 'jsonwebtoken';
import type { RequestWithValidated, RequestWithUser } from '../types/http';
import type { infer as ZodInfer } from 'zod';

const bcrypt = require('bcryptjs') as typeof import('bcryptjs');
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
const { z } = require('zod') as typeof import('zod');
const { User } = require('../models');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const HttpError = require('../utils/httpError');
const { logAuditEvent } = require('../services/auditService');

const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phoneNumber: z.string().min(6).optional(),
    country: z.string().min(2).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
  }),
  params: z.object({}),
  query: z.object({}),
});

const createStaffSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    department: z.enum(['operations', 'support', 'sales']).default('operations'),
    phoneNumber: z.string().min(6).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8),
  }),
  params: z.object({}),
  query: z.object({}),
});

type RegisterInput = ZodInfer<typeof registerSchema>;
type LoginInput = ZodInfer<typeof loginSchema>;
type CreateStaffInput = ZodInfer<typeof createStaffSchema>;
type ChangePasswordInput = ZodInfer<typeof changePasswordSchema>;

interface SerializableUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  country?: string | null;
  role: 'customer' | 'admin';
  createdAt?: Date;
}

interface JwtSignUser {
  id: string;
  role: 'customer' | 'admin';
}

function createToken(user: JwtSignUser): string {
  return jwt.sign({ role: user.role }, jwtSecret, {
    subject: user.id,
    expiresIn: jwtExpiresIn,
  } as SignOptions);
}

function serializeUser(user: SerializableUser): SerializableUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    country: user.country,
    role: user.role,
    createdAt: user.createdAt,
  };
}

async function register(
  req: RequestWithValidated<RegisterInput['body'], RegisterInput['params'], RegisterInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { fullName, email, password, phoneNumber, country } = req.validated.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'Email is already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      phoneNumber,
      country,
      role: 'customer',
    });

    const token = createToken(user);

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

async function login(
  req: RequestWithValidated<LoginInput['body'], LoginInput['params'], LoginInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.validated.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const token = createToken(user);

    return res.json({
      message: 'Login successful',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req: RequestWithUser, res: Response) {
  return res.json({ user: serializeUser(req.user) });
}

async function createStaffMember(
  req: RequestWithValidated<CreateStaffInput['body'], CreateStaffInput['params'], CreateStaffInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { fullName, email, password, department, phoneNumber } = req.validated.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'Email is already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      passwordHash,
      phoneNumber,
      role: 'admin',
      department,
    });

    await logAuditEvent(
      {
        action: 'auth.staff_created',
        entityType: 'user',
        entityId: user.id,
        actor: req.user,
        details: {
          createdUser: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            department: user.department,
            phoneNumber: user.phoneNumber,
          },
        },
      },
      req
    );

    return res.status(201).json({
      message: 'Staff member created',
      member: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber ?? null,
        department: user.department ?? department,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function changePassword(
  req: RequestWithValidated<ChangePasswordInput['body'], ChangePasswordInput['params'], ChangePasswordInput['query']>,
  res: Response,
  next: NextFunction
) {
  try {
    const { currentPassword, newPassword } = req.validated.body;
    const user = await User.findByPk(req.user.id);

    if (!user) throw new HttpError(404, 'User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) throw new HttpError(401, 'Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 10);
    await user.update({ passwordHash: newHash });

    await logAuditEvent(
      {
        action: 'auth.password_changed',
        entityType: 'user',
        entityId: user.id,
        actor: req.user,
        details: {
          message: 'Password changed by account owner',
        },
      },
      req
    );

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  registerSchema,
  loginSchema,
  createStaffSchema,
  changePasswordSchema,
  register,
  login,
  me,
  createStaffMember,
  changePassword,
};
