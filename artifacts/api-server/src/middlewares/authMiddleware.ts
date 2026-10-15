import type { AuthUser } from '@workspace/api-zod';
import { type NextFunction, type Request, type Response } from 'express';
import * as oidc from 'openid-client';
import { db, invitationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { privateLoginEnabled, PRIVATE_PREFIX } from "../lib/private-access";
import { isCoach } from "../lib/coach-access";
import { passwordCredential } from "../lib/password-access";

import {
  clearSession,
  getOidcConfig,
  getSession,
  getSessionId,
  updateSession,
  type SessionData,
} from '../lib/auth';

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request['isAuthenticated'];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }
  const credential = await passwordCredential(session.user.id);
  if(session.provider === "password") {
    if (!credential?.passwordHash || credential.version !== session.credentialVersion) {
      await clearSession(res, sid); next(); return;
    }
    req.user = session.user; next(); return;
  }
  // Completing password setup retires ALL older authentication methods for
  // this identity, including old Replit sessions and reusable private links.
  if (credential?.passwordHash) {
    await clearSession(res, sid); next(); return;
  }
  if(session.provider==="private-link") {
    const [link]=session.privateLinkId ? await db.select().from(invitationsTable).where(eq(invitationsTable.id,session.privateLinkId)) : [];
    if(!link || !link.token.startsWith(PRIVATE_PREFIX) || link.acceptedBy!==session.user.id || link.expiresAt.getTime()<=Date.now() || !isCoach(link.coachId)) {
      await clearSession(res,sid);next();return;
    }
    req.user=session.user;
    next();return;
  }
  if(privateLoginEnabled()) {
    await clearSession(res,sid);next();return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = refreshed.user;
  next();
}
