import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const FETCH_TIMEOUT_MS = 5000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_TEXT_CHARS = 20000;

export type PageResult = { ok: true; text: string } | { ok: false; error: string };
export type FetchPage = (url: string) => Promise<PageResult>;
type Resolve = (host: string) => Promise<string[]>;

/** True for loopback, private, link-local, unspecified and otherwise non-public addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped?.[1]) return isPrivateIp(mapped[1]);
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff');
  }
  return true; // not an IP at all: refuse
}

const defaultResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function checkUrl(raw: string, resolve: Resolve): Promise<URL | string> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'כתובת לא תקינה';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'מותרות רק כתובות http ו-https';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return 'כתובת פנימית חסומה';
  let addrs: string[];
  try {
    addrs = isIP(host) ? [host] : await resolve(host);
  } catch {
    return 'לא ניתן לפתור את שם האתר';
  }
  if (addrs.length === 0 || addrs.some(isPrivateIp)) return 'כתובת פנימית חסומה';
  return u;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  void reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(Math.min(total, MAX_PAGE_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, buf.length - at);
    buf.set(part, at);
    at += part.length;
    if (at >= buf.length) break;
  }
  return new TextDecoder().decode(buf);
}

/** Fetch a public http(s) page as plain text: 5 s, 2 MB, no private addresses (also after redirects). */
export function createFetchPage(resolve: Resolve = defaultResolve, doFetch: typeof fetch = fetch): FetchPage {
  return async (raw) => {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    let current = raw;
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const u = await checkUrl(current, resolve);
        if (typeof u === 'string') return { ok: false, error: u };
        const res = await doFetch(u, { redirect: 'manual', signal, headers: { accept: 'text/html,text/plain' } });
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
          current = new URL(loc, u).toString();
          continue;
        }
        if (!res.ok) return { ok: false, error: `האתר החזיר שגיאה ${res.status}` };
        const text = htmlToText(await readCapped(res));
        return text ? { ok: true, text } : { ok: false, error: 'הדף ריק' };
      }
      return { ok: false, error: 'יותר מדי הפניות' };
    } catch {
      return { ok: false, error: 'הבאת הדף נכשלה או חרגה מ-5 שניות' };
    }
  };
}
