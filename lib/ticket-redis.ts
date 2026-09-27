import { createClient } from 'redis';

let ticketRedis: ReturnType<typeof createClient> | null = null;
let connecting: Promise<void> | null = null;

function getClient() {
  if (ticketRedis) return ticketRedis;
  const password = process.env.TICKET_REDIS_PASSWORD;
  if (!password) throw new Error('TICKET_REDIS_PASSWORD is required');
  ticketRedis = createClient({
    socket: {
      host: process.env.TICKET_REDIS_HOST || 'wu-s-ticket-redis',
      port: Number(process.env.TICKET_REDIS_PORT || 6379),
    },
    password,
  });
  ticketRedis.on('error', (error) => {
    console.error('Ticket Redis connection error:', error instanceof Error ? error.message : 'unknown error');
  });
  return ticketRedis;
}

export async function getTicketRedis() {
  const client = getClient();
  if (!client.isOpen) {
    connecting ??= client.connect().then(() => undefined).finally(() => { connecting = null; });
    await connecting;
  }
  return client;
}
