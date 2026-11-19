import { z } from 'zod';
import type { Ai } from './ai';
import type { FetchPage } from './safeFetch';

const dim = z.number().positive().nullable();
export const ModelItemSchema = z.object({
  name: z.string(),
  width: dim,
  depth: dim,
  height: dim,
  color: z.string(),
  price: z.number().nonnegative().nullable(),
  room: z.string().nullable(),
});

export const ItemRequest = z
  .object({ url: z.string().trim().max(2000).optional(), text: z.string().trim().max(5000).optional(), rooms: z.array(z.string()).max(50).default([]) })
  .refine((b) => Boolean(b.url) || Boolean(b.text), { message: 'url or text required' });

export type ItemDraft = {
  name: string;
  size: { w: number | null; d: number | null; h: number | null };
  color: string;
  price?: number;
  url?: string;
  room?: string;
};
export type ItemResult =
  | { ok: true; status: 'found'; item: ItemDraft }
  | { ok: true; status: 'needs_dimensions'; item: ItemDraft }
  | { ok: false; error: string; suggestPaste: boolean };

const SYSTEM = `You extract one piece of furniture from a product page text or a short description (Hebrew or English).
Return its name, width, depth and height in METRES, a CSS colour (hex), price in shekels if shown, and the room it most suits, chosen from the given room names.
Never guess dimensions: use null for any dimension that is not stated.`;

export async function findItem(
  ai: Ai,
  fetchPage: FetchPage,
  req: z.output<typeof ItemRequest>,
): Promise<ItemResult> {
  let source = req.text ?? '';
  if (req.url) {
    const page = await fetchPage(req.url);
    if (!page.ok) return { ok: false, error: `${page.error}. אפשר להדביק את תיאור המוצר כטקסט.`, suggestPaste: true };
    source = `${page.text}\n${req.text ?? ''}`;
  }
  const r = await ai.extract({
    schema: ModelItemSchema,
    system: SYSTEM,
    prompt: `Rooms: ${req.rooms.join(', ') || '(none)'}\n\nSource:\n${source}`,
    model: 'agent',
    task: 'item',
  });
  if (!r.ok) return { ok: false, error: 'הסוכן לא הצליח לקרוא את המוצר', suggestPaste: Boolean(req.url) };
  const m = r.value;
  const item: ItemDraft = {
    name: m.name,
    size: { w: m.width, d: m.depth, h: m.height },
    color: m.color,
    ...(m.price !== null ? { price: m.price } : {}),
    ...(req.url ? { url: req.url } : {}),
    ...(m.room ? { room: m.room } : {}),
  };
  const complete = m.width !== null && m.depth !== null && m.height !== null;
  return { ok: true, status: complete ? 'found' : 'needs_dimensions', item };
}
