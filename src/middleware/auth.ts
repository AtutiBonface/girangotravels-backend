import type { NextFunction, Request, Response } from 'express';
import type { JwtPayload } from 'jsonwebtoken';
import type { UserRole } from '../types/http';

const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const { User } = require('../models');
const HttpError = require('../utils/httpError');

interface AuthTokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return next(new HttpError(401, 'Missing authorization token'));
    }

    const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload;
    const user = await User.findByPk(decoded.sub);

    if (!user) {
      return next(new HttpError(401, 'Invalid token'));
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(new HttpError(401, 'Unauthorized'));
  }
}

function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Forbidden'));
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
