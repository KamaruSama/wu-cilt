import { createHmac, randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { getTicketRedis } from '@/lib/ticket-redis';

export type TicketStatus = 'open' | 'reviewing' | 'resolved';
export type TicketSentiment = 'bad' | 'neutral' | 'good';

export interface Ticket {
  id: string;
  title: string;
  details: string;
  stars: number;
  status: TicketStatus;
  createdAt: number;
  updatedAt: number;
}

const TICKET_INDEX_KEY = 'wu-s:tickets:index';
const ticketKey = (id: string) => `wu-s:ticket:${id}`;
const MAX_PUBLIC_TICKETS = 100;

function requiredSecret() {
  const name = 'TICKET_RATE_SALT';
  const value = process.env[name];
  if (!value || value.length < 24) throw new Error(`${name} is not configured`);
  return value;
}

function hmac(value: string) {
  return createHmac('sha256', requiredSecret()).update(value).digest('base64url');
}

export function anonymousRateIdentity(request: NextRequest) {
  // Cloudflare documents this header as the client IP delivered from its edge.
  // Do not fall back to X-Forwarded-For: a requester can supply that header.
  return hmac(request.headers.get('cf-connecting-ip') || 'missing-cloudflare-ip');
}

export async function withinTicketRateLimit(scope: string, limit: number, windowMs: number, identity: string) {
  const redis = await getTicketRedis();
  const key = `wu-s:tickets:rate:${scope}:${identity}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000));
  return count <= limit;
}

export function ticketSentiment(stars: number): TicketSentiment {
  if (stars <= 2) return 'bad';
  if (stars === 3) return 'neutral';
  return 'good';
}

export function sanitizeTicketInput(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('ข้อมูลตั๋วไม่ถูกต้อง');
  const value = input as Record<string, unknown>;
  const title = typeof value.title === 'string' ? value.title.replace(/\s+/g, ' ').trim() : '';
  const details = typeof value.details === 'string' ? value.details.trim() : '';
  const stars = Number(value.stars);
  const honeypot = typeof value.website === 'string' ? value.website.trim() : '';
  const startedAt = Number(value.startedAt);

  if (honeypot) return { blocked: true as const };
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2500 || Date.now() - startedAt > 2 * 60 * 60 * 1000) {
    throw new Error('กรุณากรอกรายละเอียดก่อนส่ง');
  }
  if (title.length < 8 || title.length > 120) throw new Error('หัวข้อควรมี 8–120 ตัวอักษร');
  if (details.length < 20 || details.length > 3000) throw new Error('รายละเอียดควรมี 20–3,000 ตัวอักษร');
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error('กรุณาเลือกระดับดาว 1–5');
  const publicText = `${title}\n${details}`;
  const hasAttachment = ['file', 'files', 'attachment', 'attachments'].some((key) => value[key] !== undefined && value[key] !== null && value[key] !== '');
  if (hasAttachment) throw new Error('ตั๋วรับเฉพาะข้อความ ไม่รับไฟล์แนบ');
  if (/(?:https?:\/\/|www\.)\S+/i.test(publicText)) throw new Error('ตั๋วไม่รับลิงก์ กรุณาอธิบายปัญหาด้วยข้อความ');
  if (/(.)\1{11,}/u.test(publicText)) throw new Error('ข้อความมีลักษณะเป็นสแปม');
  const personalData = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?<!\d)0\d{8,9}(?!\d)/,
    /(?<!\d)\d{8}(?!\d)/,
    /(?<!\d)\d{13}(?!\d)/,
    /(?:รหัสผ่าน|password|passwd|otp|one.time.password)/i,
  ];
  if (personalData.some((pattern) => pattern.test(publicText))) {
    throw new Error('ตั๋วสาธารณะห้ามใส่อีเมล เบอร์โทร รหัสนักศึกษา รหัสผ่าน หรือ OTP');
  }
  return { blocked: false as const, title, details, stars };
}

export async function createTicket(input: Pick<Ticket, 'title' | 'details' | 'stars'>) {
  const now = Date.now();
  const ticket: Ticket = {
    id: `WU-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
    ...input,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  const redis = await getTicketRedis();
  await redis.multi()
    .hSet(ticketKey(ticket.id), {
      id: ticket.id,
      title: ticket.title,
      details: ticket.details,
      stars: String(ticket.stars),
      status: ticket.status,
      createdAt: String(ticket.createdAt),
      updatedAt: String(ticket.updatedAt),
    })
    .zAdd(TICKET_INDEX_KEY, { score: ticket.createdAt, value: ticket.id })
    .zAdd(`wu-s:tickets:stars:${ticket.stars}`, { score: ticket.createdAt, value: ticket.id })
    .exec();
  return ticket;
}

export async function reserveDuplicate(content: Pick<Ticket, 'title' | 'details' | 'stars'>) {
  const redis = await getTicketRedis();
  const fingerprint = hmac(`${content.title}\n${content.details}\n${content.stars}`);
  return redis.set(`wu-s:tickets:duplicate:${fingerprint}`, '1', { NX: true, EX: 30 * 60 });
}

function fromHash(value: Record<string, string>): Ticket | null {
  const stars = Number(value.stars);
  const createdAt = Number(value.createdAt);
  const updatedAt = Number(value.updatedAt);
  if (!value.id || !value.title || !value.details || !Number.isInteger(stars) || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  if (!['open', 'reviewing', 'resolved'].includes(value.status)) return null;
  return { id: value.id, title: value.title, details: value.details, stars, status: value.status as TicketStatus, createdAt, updatedAt };
}

export async function listTickets(stars = [1, 2, 3, 4, 5]) {
  const redis = await getTicketRedis();
  const indexKeys = stars.map((star) => `wu-s:tickets:stars:${star}`);
  const [totalByIndex, idsByIndex] = await Promise.all([
    Promise.all(indexKeys.map((key) => redis.zCard(key))),
    Promise.all(indexKeys.map((key) => redis.zRange(key, 0, MAX_PUBLIC_TICKETS - 1, { REV: true }))),
  ]);
  const ids = [...new Set(idsByIndex.flat())];
  const tickets = await Promise.all(ids.map(async (id) => fromHash(await redis.hGetAll(ticketKey(id)))));
  const sortedTickets = tickets.filter((ticket): ticket is Ticket => ticket !== null).sort((left, right) => right.createdAt - left.createdAt);
  return {
    tickets: sortedTickets.slice(0, MAX_PUBLIC_TICKETS),
    total: totalByIndex.reduce((sum, count) => sum + count, 0),
  };
}

export async function issueTicketFormToken() {
  const token = `${randomUUID()}${randomUUID()}`;
  const redis = await getTicketRedis();
  await redis.set(`wu-s:tickets:form:${hmac(token)}`, '1', { EX: 2 * 60 * 60 });
  return token;
}

export async function consumeTicketFormToken(token: string | undefined) {
  if (!token) return false;
  const redis = await getTicketRedis();
  return (await redis.getDel(`wu-s:tickets:form:${hmac(token)}`)) === '1';
}

export async function updateTicketStatus(id: string, status: TicketStatus) {
  if (!/^WU-[A-F0-9]{10}$/.test(id)) throw new Error('รหัสตั๋วไม่ถูกต้อง');
  if (!['open', 'reviewing', 'resolved'].includes(status)) throw new Error('สถานะไม่ถูกต้อง');
  const redis = await getTicketRedis();
  if (!await redis.exists(ticketKey(id))) throw new Error('ไม่พบตั๋ว');
  const updatedAt = Date.now();
  await redis.hSet(ticketKey(id), { status, updatedAt: String(updatedAt) });
  return updatedAt;
}
