import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

const HttpError = require('../utils/httpError');

function validate<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      return next(new HttpError(400, result.error.issues[0]?.message || 'Validation error'));
    }

    req.validated = result.data;
    return next();
  };
}

module.exports = validate;
