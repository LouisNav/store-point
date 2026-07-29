// iron-session config — encrypted cookie, no DB hits per request for auth.

import type { SessionOptions } from 'iron-session';
import { env } from '@/env';
import type { Role } from '../types';

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  isRoot?: boolean;
  /** Active store picked via switcher. */
  activeStoreId?: string;
  /** All memberships cached at login. */
  memberships?: Array<{ storeId: string; storeName: string; role: Role }>;
}

export const SESSION_COOKIE = 'storepoint_session';

export const sessionOptions: SessionOptions = {
  password: env().SESSION_PASSWORD,
  cookieName: SESSION_COOKIE,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
};
