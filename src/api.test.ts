import { afterEach, expect, it, vi } from 'vitest';
import { parseDocuments } from './api';
import { sampleHouse } from './sample';

afterEach(() => vi.unstubAllGlobals());
const stub = (body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => body })));
const file = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' });

it('returns the house with repairs and skipped files', async () => {
  stub({ ok: true, house: sampleHouse, repairs: ['x'], skipped: ['b.pdf'] });
  const r = await parseDocuments([file]);
  expect(r.ok && r.repairs).toEqual(['x']);
  expect(r.skipped).toEqual(['b.pdf']);
});

it('reports a failed call', async () => {
  stub({ ok: false, error: 'boom', skipped: [] });
  expect(await parseDocuments([file])).toEqual({ ok: false, error: 'boom', skipped: [] });
});

it('reports a network error without throwing', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
  expect((await parseDocuments([file])).ok).toBe(false);
});
