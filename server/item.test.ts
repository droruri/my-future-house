import { describe, expect, it } from 'vitest';
import { createApp } from './index';
import { createAi, parseEnv } from './ai';
import { createFetchPage, isPrivateIp } from './safeFetch';

const ai = createAi(parseEnv({ AI_FAKE: '1' }));
const page = (text: string) => createApp(ai, async () => ({ ok: true, text }));
const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request('/api/item', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('/api/item', () => {
  it('finds an item from a URL with dimensions', async () => {
    const res = await post(page('ספה 220×90×85 ס"מ מחיר 4500 ₪'), { url: 'https://shop.example/sofa', rooms: ['סלון'] });
    const b = (await res.json()) as { status: string; item: { size: { w: number; d: number; h: number }; room: string; price: number; url: string } };
    expect(res.status).toBe(200);
    expect(b.status).toBe('found');
    expect(b.item.size).toEqual({ w: 2.2, d: 0.9, h: 0.85 });
    expect([b.item.room, b.item.price, b.item.url]).toEqual(['סלון', 4500, 'https://shop.example/sofa']);
  });
  it('finds an item from a text description', async () => {
    const res = await post(page(''), { text: 'ספה תלת מושבית 220×90', rooms: [] });
    const b = (await res.json()) as { status: string; item: { size: { w: number } } };
    expect(b.status).toBe('found');
    expect(b.item.size.w).toBe(2.2);
  });
  it('asks for dimensions when the page has none', async () => {
    const res = await post(page('ספה יפה ונוחה'), { url: 'https://shop.example/x', rooms: [] });
    const b = (await res.json()) as { status: string; item: { size: { w: null } } };
    expect(res.status).toBe(200);
    expect(b.status).toBe('needs_dimensions');
    expect(b.item.size.w).toBeNull();
  });
  it('refuses a private address and suggests pasting text', async () => {
    const res = await post(createApp(ai), { url: 'http://127.0.0.1:8787/api/health', rooms: [] });
    const b = (await res.json()) as { ok: boolean; error: string; suggestPaste: boolean };
    expect(res.status).toBe(422);
    expect(b.suggestPaste).toBe(true);
    expect(b.error).toContain('טקסט');
  });
  it('rejects an empty request', async () => {
    expect((await post(page(''), { rooms: [] })).status).toBe(400);
  });
});

describe('safe fetch', () => {
  const fp = (resolve: (h: string) => Promise<string[]>, f: typeof fetch) => createFetchPage(resolve, f);
  it('classifies addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '169.254.169.254', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1'])
      expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700::1111']) expect(isPrivateIp(ip)).toBe(false);
  });
  it('allows only http(s) and blocks hosts resolving to private addresses', async () => {
    const f = fp(async () => ['10.0.0.5'], (() => Promise.reject(new Error('should not fetch'))) as typeof fetch);
    expect((await f('file:///etc/passwd')).ok).toBe(false);
    expect((await f('http://localhost/')).ok).toBe(false);
    expect((await f('http://intranet.example/')).ok).toBe(false);
  });
  it('re-checks redirects', async () => {
    const f = fp(
      async (h) => [h === 'evil.example' ? '127.0.0.1' : '8.8.8.8'],
      (async () => new Response(null, { status: 302, headers: { location: 'http://evil.example/' } })) as typeof fetch,
    );
    expect((await f('https://ok.example/')).ok).toBe(false);
  });
  it('caps the body at 2 MB and strips html', async () => {
    const big = `<p>hello</p><script>x()</script>${'a'.repeat(3 * 1024 * 1024)}`;
    const f = fp(async () => ['8.8.8.8'], (async () => new Response(big)) as typeof fetch);
    const r = await f('https://ok.example/');
    expect(r.ok && r.text.startsWith('hello a')).toBe(true);
  });
  it('times out', async () => {
    const f = fp(
      async () => ['8.8.8.8'],
      ((_u: unknown, init?: RequestInit) =>
        new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abort'))))) as typeof fetch,
    );
    const r = await f('https://ok.example/');
    expect(r.ok).toBe(false);
  }, 8000);
});
