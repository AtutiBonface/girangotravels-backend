import type { NextFunction, Request, Response } from 'express';

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
}

function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: 'Route not found' });
}

function errorHandler(err: ErrorWithStatusCode, req: Request, res: Response, next: NextFunction) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(statusCode).json({ message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
