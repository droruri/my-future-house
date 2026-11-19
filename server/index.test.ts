import { expect, it } from 'vitest';
import { app } from './index';
import { HouseSchema } from '../src/house';

const post = (names: string[]) => {
  const form = new FormData();
  for (const n of names) form.append('files', new File([new Uint8Array([1, 2, 3])], n, { type: 'application/pdf' }));
  return app.request('/api/parse-docs', { method: 'POST', body: form });
};

it('health endpoint responds', async () => {
  const res = await app.request('/api/health');
  expect(await res.json()).toEqual({ ok: true });
});

it('parse-docs returns a checked house with the fake', async () => {
  const res = await post(['plan.pdf']);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; house: unknown; repairs: string[]; skipped: string[] };
  expect(HouseSchema.safeParse(body.house).success).toBe(true);
  expect(body.skipped).toEqual([]);
});

it('names an unreadable file and still uses the rest', async () => {
  const res = await post(['plan.pdf', 'unreadable.pdf']);
  const body = (await res.json()) as { ok: boolean; house: { source: { files: string[] } }; skipped: string[] };
  expect(res.status).toBe(200);
  expect(body.skipped).toEqual(['unreadable.pdf']);
  expect(body.house.source.files).toEqual(['plan.pdf']);
});

it('fails with the error when nothing is readable', async () => {
  const res = await post(['unreadable.pdf']);
  expect(res.status).toBe(502);
});

it('rejects a request with no files', async () => {
  const res = await app.request('/api/parse-docs', { method: 'POST', body: new FormData() });
  expect(res.status).toBe(400);
});
