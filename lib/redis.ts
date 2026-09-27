import { createClient } from 'redis';

let redis: ReturnType<typeof createClient> | null = null;
let connecting: Promise<void> | null = null;

function getClient() {
  if (redis) return redis;
  const password = process.env.REDIS_PASSWORD;
  if (!password) throw new Error('REDIS_PASSWORD is required');
  redis = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'wu-s-redis',
      port: Number(process.env.REDIS_PORT || 6379),
    },
    password,
  });
  redis.on('error', (error) => {
    console.error('Redis connection error:', error instanceof Error ? error.message : 'unknown error');
  });
  return redis;
}

export async function getRedis() {
  const client = getClient();
  if (!client.isOpen) {
    connecting ??= client.connect().then(() => undefined).finally(() => { connecting = null; });
    await connecting;
  }
  return client;
}
