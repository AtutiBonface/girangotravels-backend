import type { Request } from 'express';

export type UserRole = 'customer' | 'admin';

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  country?: string | null;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ValidatedRequestData<Body = unknown, Params = unknown, Query = unknown> {
  body: Body;
  params: Params;
  query: Query;
}

export type RequestWithUser = Request & { user: AuthenticatedUser };

export type RequestWithValidated<Body = unknown, Params = unknown, Query = unknown> = Request & {
  validated: ValidatedRequestData<Body, Params, Query>;
};

export type AuthenticatedValidatedRequest<Body = unknown, Params = unknown, Query = unknown> =
  RequestWithUser & RequestWithValidated<Body, Params, Query>;
