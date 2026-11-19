import { z } from 'zod';
import type { Ai } from './ai';
import { EditSchema, HouseSchema, type Edit } from '../src/house';

export const EditRequest = z.object({ house: HouseSchema, request: z.string().trim().min(1).max(2000) });
export const ModelEditsSchema = z.object({ edits: z.array(EditSchema).max(30) });
export type EditResult = { ok: true; edits: Edit[] } | { ok: false; error: string };

const SYSTEM = `You are a renovation agent for a house described as JSON (units: metres, x/z plane, polygons closed).
Answer the user's request (Hebrew or English) ONLY as a short list of edits. Allowed edit types:
addWall, removeWall, moveWall, addOpening, removeOpening, setRoom, addRoof, removeRoof, setKitchen, removeItem.
Refer only to ids that exist in the house. New ids must be unique. A pergola is a roof with kind "pergola".
A kitchen island is setKitchen with hasIsland true. Return an empty list if the request cannot be done.`;

export async function findEdits(ai: Ai, req: z.output<typeof EditRequest>): Promise<EditResult> {
  const r = await ai.extract({
    schema: ModelEditsSchema,
    system: SYSTEM,
    prompt: `Request: ${req.request}\n\nHouse:\n${JSON.stringify(req.house)}`,
    model: 'agent',
    task: 'edit',
  });
  if (!r.ok) return { ok: false, error: 'הסוכן לא הצליח להבין את הבקשה' };
  if (r.value.edits.length === 0) return { ok: false, error: 'הסוכן לא מצא שינוי לבצע. נסו לנסח אחרת.' };
  return { ok: true, edits: r.value.edits };
}
