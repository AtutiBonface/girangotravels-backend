import type { AuthenticatedUser, ValidatedRequestData } from './http';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      validated?: ValidatedRequestData<any, any, any>;
    }
  }
}

export {};
