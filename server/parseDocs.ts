import { z } from 'zod';
import type { Ai, AiFile } from './ai';
import { HouseSchema, validateHouse, type House } from '../src/house';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const okType = (t: string) => t === 'application/pdf' || t.startsWith('image/');

const SYSTEM = `You read Hebrew apartment documents (sales plan / תוכנית מכר, appendices / נספחים, technical spec / מפרט טכני) and return the apartment as a House JSON.
Units are metres. x is east, z is south, y is up. Draw every wall with its thickness and height (default 2.6), every door/window/sliding opening on its wall (offset along the wall from point a),
and every room with its Hebrew name and kind: room, wet, balcony, service_balcony or mamad (ממ"ד). Include balconies and the ממ"ד. Use pergola roofs for covered balcony parts and a kitchen polygon if shown.
Leave items empty. Put short notes about assumptions in source.notes.`;

export type ParseDocsResult =
  | { ok: true; house: House; repairs: string[]; skipped: string[] }
  | { ok: false; error: string; skipped: string[] };

/** Files → checked House. Unreadable files are named and the rest still used. */
export async function parseDocs(ai: Ai, all: AiFile[]): Promise<ParseDocsResult> {
  const skipped: string[] = [];
  let files = all.filter((f) => {
    const ok = f.data.length > 0 && f.data.length <= MAX_FILE_BYTES && okType(f.mediaType);
    if (!ok) skipped.push(f.name);
    return ok;
  });
  if (files.length === 0) return { ok: false, error: 'אין קבצים שאפשר לקרוא', skipped };

  const call = (fs: AiFile[]) =>
    ai.extract({ schema: HouseSchema, system: SYSTEM, prompt: 'Build the House from these documents.', files: fs, model: 'docs' });

  let r = await call(files);
  if (!r.ok && files.length > 1) {
    // Find the file(s) the model can't read, then retry with the others.
    const solo = await Promise.all(files.map(async (f) => ({ f, r: await call([f]) })));
    const good = solo.filter((s) => s.r.ok).map((s) => s.f);
    if (good.length > 0 && good.length < files.length) {
      skipped.push(...solo.filter((s) => !s.r.ok).map((s) => s.f.name));
      files = good;
      r = good.length === 1 ? (solo.find((s) => s.f === good[0])?.r ?? r) : await call(good);
    }
  }
  if (!r.ok) return { ok: false, error: r.error, skipped };

  const v = validateHouse({ ...r.value, source: { ...r.value.source, files: files.map((f) => f.name) } });
  if (!v.ok) return { ok: false, error: v.error, skipped };
  return { ok: true, house: v.house, repairs: v.repairs, skipped };
}

export const ParseDocsResponse = z.object({
  house: HouseSchema,
  repairs: z.array(z.string()),
  skipped: z.array(z.string()),
});
