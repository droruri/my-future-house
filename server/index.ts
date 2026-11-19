import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { createAi, parseEnv, type Ai } from './ai';
import { parseDocs } from './parseDocs';

export function createApp(ai: Ai) {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/parse-docs', async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ ok: false, error: 'בקשה לא תקינה', skipped: [] }, 400);
    }
    const files = await Promise.all(
      form
        .getAll('files')
        .filter((f): f is File => f instanceof File)
        .map(async (f) => ({ name: f.name, mediaType: f.type, data: new Uint8Array(await f.arrayBuffer()) })),
    );
    if (files.length === 0) return c.json({ ok: false, error: 'לא נשלחו קבצים', skipped: [] }, 400);
    const r = await parseDocs(ai, files);
    return c.json(r, r.ok ? 200 : 502);
  });
  return app;
}

// Env is checked once at startup. Tests always use the fake.
const env = parseEnv(process.env['VITEST'] ? { ...process.env, AI_FAKE: '1' } : process.env);
export const app = createApp(createAi(env));

const port = z.coerce.number().int().min(1).max(65535).catch(8787).parse(process.env['PORT']);

if (!process.env['VITEST']) {
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
}
