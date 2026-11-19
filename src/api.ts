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
