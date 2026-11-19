import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';

export const app = new Hono();
app.get('/api/health', (c) => c.json({ ok: true }));

const port = z.coerce.number().int().min(1).max(65535).catch(8787).parse(process.env['PORT']);

if (!process.env['VITEST']) {
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
}
