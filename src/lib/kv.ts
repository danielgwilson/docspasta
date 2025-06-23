import { createClient } from '@vercel/kv';

if (
  !process.env.KV_REST_API_URL ||
  !process.env.KV_REST_API_TOKEN
) {
  throw new Error('KV environment variables are not set');
}

export const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});