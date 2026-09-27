import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { getRedis } from '@/lib/redis';

export const CILT_SESSION_COOKIE = '__Host-wu-s-session';
const SESSION_TTL_MS = 15 * 60 * 1000;

type StoredSession = {
  cookies: string;
  expiresAt: number;
};

const SESSION_KEY_PREFIX = 'wu-s:session:';

function sessionKey(id: string) {
  return `${SESSION_KEY_PREFIX}${id}`;
}

export async function createCiltSession(cookies: string) {
  const id = randomUUID();
  const redis = await getRedis();
  await redis.setEx(sessionKey(id), Math.floor(SESSION_TTL_MS / 1000), cookies);
  return { id, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export async function getCiltSession(request: NextRequest) {
  const id = request.cookies.get(CILT_SESSION_COOKIE)?.value;
  if (!id) return null;
  const redis = await getRedis();
  const cookies = await redis.get(sessionKey(id));
  if (!cookies) return null;
  await redis.expire(sessionKey(id), Math.floor(SESSION_TTL_MS / 1000));
  return { id, cookies };
}

export async function updateCiltSession(id: string, cookies: string) {
  const redis = await getRedis();
  const result = await redis.set(sessionKey(id), cookies, { XX: true, EX: Math.floor(SESSION_TTL_MS / 1000) });
  return result === 'OK';
}
