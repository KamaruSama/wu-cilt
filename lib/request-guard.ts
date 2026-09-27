import type { NextRequest } from 'next/server';
import { getRedis } from '@/lib/redis';

export function clientKey(request: NextRequest) {
  // Cloudflare supplies this only to the origin. Prefer it so a visitor cannot
  // choose a different X-Forwarded-For value to evade a public-form limit.
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwardedHost || request.headers.get('host');
    // TLS terminates at the CDN/proxy, so request.nextUrl can be HTTP even for
    // a real HTTPS browser request. Compare the public host, not that internal scheme.
    return Boolean(host)
      && ['http:', 'https:'].includes(originUrl.protocol)
      && originUrl.host === host;
  } catch {
    return false;
  }
}

export async function withinRateLimit(request: NextRequest, scope: string, limit: number, windowMs: number, identity?: string) {
  const redis = await getRedis();
  const key = `wu-s:rate:${scope}:${identity || clientKey(request)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000));
  return count <= limit;
}
