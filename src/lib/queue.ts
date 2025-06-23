import { Client } from '@upstash/qstash';

if (!process.env.QSTASH_URL || !process.env.QSTASH_TOKEN) {
  throw new Error('QStash environment variables are not set');
}

export const qstash = new Client({
  baseUrl: process.env.QSTASH_URL,
  token: process.env.QSTASH_TOKEN,
});