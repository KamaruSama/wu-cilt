import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';
import { isSameOriginRequest } from '@/lib/request-guard';
import { logError } from '@/lib/logger';
import { anonymousRateIdentity, consumeTicketFormToken, createTicket, issueTicketFormToken, listTickets, reserveDuplicate, sanitizeTicketInput, withinTicketRateLimit } from '@/lib/tickets';

function starFilter(raw: string | null) {
  const filters: Record<string, number[]> = { all: [1, 2, 3, 4, 5], bad: [1, 2], neutral: [3], good: [4], excellent: [5] };
  if (raw && /^[1-5]$/.test(raw)) return [Number(raw)];
  return filters[raw || 'all'] || filters.all;
}

async function handleGet(request: NextRequest) {
  try {
    if (!await withinTicketRateLimit('list', 120, 60 * 1000, anonymousRateIdentity(request))) {
      return NextResponse.json({ error: 'โหลดรายการบ่อยเกินไป กรุณารอสักครู่' }, { status: 429 });
    }
    const result = await listTickets(starFilter(request.nextUrl.searchParams.get('filter')));
    const response = NextResponse.json({ ...result, limited: result.total > result.tickets.length });
    response.cookies.set('wu_s_ticket_form', await issueTicketFormToken(), { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/tickets', maxAge: 2 * 60 * 60 });
    return response;
  } catch {
    return NextResponse.json({ error: 'ยังไม่พร้อมให้บริการตั๋ว กรุณาลองใหม่ภายหลัง' }, { status: 503 });
  }
}

async function handlePost(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: 'Origin ของคำขอไม่ถูกต้อง' }, { status: 403 });
    }
    const input = sanitizeTicketInput(await request.json());
    // Honeypot bots receive an uninteresting accepted result without creating
    // a record or confirming which detection rule caught them.
    if (input.blocked) return NextResponse.json({ success: true, ticketId: null }, { status: 202 });
    const identity = anonymousRateIdentity(request);
    if (!await withinTicketRateLimit('submit-short', 3, 60 * 60 * 1000, identity)
      || !await withinTicketRateLimit('submit-day', 10, 24 * 60 * 60 * 1000, identity)) {
      return NextResponse.json({ error: 'ส่งตั๋วบ่อยเกินไป กรุณารอแล้วลองใหม่' }, { status: 429 });
    }
    if (!await consumeTicketFormToken(request.cookies.get('wu_s_ticket_form')?.value)) {
      return NextResponse.json({ error: 'หน้าเปิดตั๋วหมดอายุ กรุณารีเฟรชหน้าแล้วลองใหม่' }, { status: 403 });
    }
    if (!await reserveDuplicate(input)) {
      return NextResponse.json({ error: 'พบรายงานข้อความเดิมในช่วง 30 นาทีที่ผ่านมา' }, { status: 409 });
    }
    const ticket = await createTicket(input);
    return NextResponse.json({ success: true, ticketId: ticket.id, ticket }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /^(หัวข้อ|รายละเอียด|กรุณา|ตั๋ว|ข้อความ)/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const errorId = logError('tickets.create.failed', error);
    return NextResponse.json({ error: 'ไม่สามารถเปิดตั๋วได้ กรุณาตรวจข้อมูลแล้วลองใหม่', errorId }, { status: 500 });
  }
}

export const GET = withApiLogging('tickets.list', handleGet);
export const POST = withApiLogging('tickets.create', handlePost);
