import { z } from 'zod';
import { HouseSchema, validateHouse, type House } from './house';

export type ParseOutcome =
  | { ok: true; house: House; repairs: string[]; skipped: string[] }
  | { ok: false; error: string; skipped: string[] };

const Body = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  house: HouseSchema.optional(),
  repairs: z.array(z.string()).catch([]),
  skipped: z.array(z.string()).catch([]),
});

/** Send the documents to the server; the answer is re-checked here too. Never throws. */
export async function parseDocuments(files: File[]): Promise<ParseOutcome> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  try {
    const res = await fetch('/api/parse-docs', { method: 'POST', body: form });
    const body = Body.safeParse(await res.json());
    if (!body.success) return { ok: false, error: 'תשובה לא תקינה מהשרת', skipped: [] };
    if (!body.data.ok || !body.data.house) return { ok: false, error: body.data.error ?? 'הקריאה נכשלה', skipped: body.data.skipped };
    const v = validateHouse(body.data.house);
    if (!v.ok) return { ok: false, error: v.error, skipped: body.data.skipped };
    return { ok: true, house: v.house, repairs: [...body.data.repairs, ...v.repairs], skipped: body.data.skipped };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת', skipped: [] };
  }
}

const Draft = z.object({
  name: z.string(),
  size: z.object({ w: z.number().nullable(), d: z.number().nullable(), h: z.number().nullable() }),
  color: z.string(),
  price: z.number().optional(),
  url: z.string().optional(),
  room: z.string().optional(),
});
export type ItemDraft = z.infer<typeof Draft>;

export type ItemOutcome =
  | { ok: true; status: 'found' | 'needs_dimensions'; item: ItemDraft }
  | { ok: false; error: string };

const ItemBody = z.union([
  z.object({ ok: z.literal(true), status: z.enum(['found', 'needs_dimensions']), item: Draft }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

/** Ask the item agent. Never throws. */
export async function requestItem(input: { url?: string; text?: string; rooms: string[] }): Promise<ItemOutcome> {
  try {
    const res = await fetch('/api/item', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = ItemBody.safeParse(await res.json());
    return body.success ? body.data : { ok: false, error: 'תשובה לא תקינה מהשרת' };
  } catch {
    return { ok: false, error: 'אין חיבור לשרת' };
  }
}
