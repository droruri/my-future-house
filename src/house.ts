import { z } from 'zod';

const num = z.number().finite();
export const PtSchema = z.object({ x: num, z: num });

export const WallSchema = z.object({
  id: z.string(),
  a: PtSchema,
  b: PtSchema,
  thickness: num,
  height: num,
  exterior: z.boolean(),
});
export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  kind: z.enum(['door', 'window', 'sliding']),
  offset: num,
  width: num,
  height: num,
  sill: num,
});
export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  polygon: z.array(PtSchema),
  kind: z.enum(['room', 'wet', 'balcony', 'service_balcony', 'mamad']),
});
export const RoofSchema = z.object({
  id: z.string(),
  polygon: z.array(PtSchema),
  height: num,
  kind: z.enum(['pergola', 'solid']),
});
export const KitchenSchema = z.object({
  polygon: z.array(PtSchema),
  counterHeight: num,
  hasIsland: z.boolean(),
});
export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.object({ w: num, d: num, h: num }),
  pos: PtSchema,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  color: z.string(),
  price: num.optional(),
  url: z.string().optional(),
});

export const HouseSchema = z.object({
  version: z.literal(1),
  source: z.object({ files: z.array(z.string()), notes: z.string() }),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  rooms: z.array(RoomSchema),
  roofs: z.array(RoofSchema),
  kitchen: KitchenSchema.nullable(),
  items: z.array(ItemSchema),
});

export type Pt = z.infer<typeof PtSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type House = z.infer<typeof HouseSchema>;

export type ValidateResult =
  | { ok: true; house: House; repairs: string[] }
  | { ok: false; error: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Polygons are stored closed (last point equals first). Returns null if unusable. */
function closePolygon(poly: Pt[]): Pt[] | null {
  const first = poly[0];
  const last = poly[poly.length - 1];
  if (!first || !last) return null;
  const closed = first.x === last.x && first.z === last.z;
  const pts = closed ? poly : [...poly, first];
  return pts.length >= 4 ? pts : null;
}

/** Check structure, then repair values instead of failing. */
export function validateHouse(input: unknown): ValidateResult {
  const parsed = HouseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const repairs: string[] = [];
  const h = parsed.data;

  const walls = h.walls.map((w) => {
    const thickness = clamp(w.thickness, 0.05, 1);
    const height = clamp(w.height, 0.5, 6);
    if (thickness !== w.thickness) repairs.push(`wall ${w.id}: thickness clamped`);
    if (height !== w.height) repairs.push(`wall ${w.id}: height clamped`);
    return { ...w, thickness, height };
  });
  const wallById = new Map(walls.map((w) => [w.id, w]));

  const openings = h.openings.flatMap((o) => {
    const wall = wallById.get(o.wallId);
    if (!wall) {
      repairs.push(`opening ${o.id}: dropped (missing wall ${o.wallId})`);
      return [];
    }
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
    const width = clamp(o.width, 0.3, Math.max(0.3, len));
    const height = clamp(o.height, 0.3, wall.height);
    const sill = clamp(o.sill, 0, Math.max(0, wall.height - height));
    const offset = clamp(o.offset, 0, Math.max(0, len - width));
    if (width !== o.width || height !== o.height || sill !== o.sill || offset !== o.offset)
      repairs.push(`opening ${o.id}: size clamped`);
    return [{ ...o, width, height, sill, offset }];
  });

  const fixPoly = (what: string, poly: Pt[]): Pt[] | null => {
    const closed = closePolygon(poly);
    if (!closed) repairs.push(`${what}: dropped (fewer than 3 points)`);
    else if (closed.length !== poly.length) repairs.push(`${what}: polygon closed`);
    return closed;
  };

  const rooms = h.rooms.flatMap((r) => {
    const polygon = fixPoly(`room ${r.id}`, r.polygon);
    return polygon ? [{ ...r, polygon }] : [];
  });
  const clampRepair = (what: string, field: string, v: number, lo: number, hi: number) => {
    const c = clamp(v, lo, hi);
    if (c !== v) repairs.push(`${what}: ${field} clamped`);
    return c;
  };
  const roofs = h.roofs.flatMap((r) => {
    const polygon = fixPoly(`roof ${r.id}`, r.polygon);
    if (!polygon) return [];
    return [{ ...r, polygon, height: clampRepair(`roof ${r.id}`, 'height', r.height, 0.5, 6) }];
  });
  let kitchen = h.kitchen;
  if (kitchen) {
    const polygon = fixPoly('kitchen', kitchen.polygon);
    kitchen = polygon
      ? {
          ...kitchen,
          polygon,
          counterHeight: clampRepair('kitchen', 'counterHeight', kitchen.counterHeight, 0.6, 1.2),
        }
      : null;
  }
  const items = h.items.map((i) => {
    const what = `item ${i.id}`;
    return {
      ...i,
      size: {
        w: clampRepair(what, 'width', i.size.w, 0.05, 10),
        d: clampRepair(what, 'depth', i.size.d, 0.05, 10),
        h: clampRepair(what, 'height', i.size.h, 0.05, 4),
      },
    };
  });

  return { ok: true, house: { ...h, walls, openings, rooms, roofs, kitchen, items }, repairs };
}

// ---------- Edits: the only way the renovation agent changes a house ----------

export const EditSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addWall'), wall: WallSchema }),
  z.object({ type: z.literal('removeWall'), id: z.string() }),
  z.object({ type: z.literal('moveWall'), id: z.string(), a: PtSchema, b: PtSchema }),
  z.object({ type: z.literal('addOpening'), opening: OpeningSchema }),
  z.object({ type: z.literal('removeOpening'), id: z.string() }),
  z.object({
    type: z.literal('setRoom'),
    id: z.string(),
    name: z.string().nullable(),
    polygon: z.array(PtSchema).nullable(),
    kind: RoomSchema.shape.kind.nullable(),
  }),
  z.object({ type: z.literal('addRoof'), roof: RoofSchema }),
  z.object({ type: z.literal('removeRoof'), id: z.string() }),
  z.object({ type: z.literal('setKitchen'), kitchen: KitchenSchema.nullable() }),
  z.object({ type: z.literal('removeItem'), id: z.string() }),
]);
export type Edit = z.infer<typeof EditSchema>;

export type ApplyResult =
  | { ok: true; house: House; changes: string[]; repairs: string[] }
  | { ok: false; error: string };

/** Applies every edit or none: a missing target refuses the whole list. Result goes through validateHouse. */
export function applyEdits(house: House, edits: Edit[]): ApplyResult {
  let h = house;
  const changes: string[] = [];
  for (const e of edits) {
    const missing = (what: string, id: string): ApplyResult => ({ ok: false, error: `${what} "${id}" לא קיים בבית — לא בוצע שום שינוי` });
    const dup = (what: string, id: string): ApplyResult => ({ ok: false, error: `${what} "${id}" כבר קיים — לא בוצע שום שינוי` });
    switch (e.type) {
      case 'addWall':
        if (h.walls.some((w) => w.id === e.wall.id)) return dup('קיר', e.wall.id);
        h = { ...h, walls: [...h.walls, e.wall] };
        changes.push(`הוספת קיר ${e.wall.id}`);
        break;
      case 'removeWall': {
        if (!h.walls.some((w) => w.id === e.id)) return missing('קיר', e.id);
        const gone = h.openings.filter((o) => o.wallId === e.id).length;
        h = { ...h, walls: h.walls.filter((w) => w.id !== e.id), openings: h.openings.filter((o) => o.wallId !== e.id) };
        changes.push(`הסרת קיר ${e.id}${gone > 0 ? ` (וגם ${gone} פתחים בו)` : ''}`);
        break;
      }
      case 'moveWall':
        if (!h.walls.some((w) => w.id === e.id)) return missing('קיר', e.id);
        h = { ...h, walls: h.walls.map((w) => (w.id === e.id ? { ...w, a: e.a, b: e.b } : w)) };
        changes.push(`הזזת קיר ${e.id}`);
        break;
      case 'addOpening':
        if (!h.walls.some((w) => w.id === e.opening.wallId)) return missing('קיר', e.opening.wallId);
        if (h.openings.some((o) => o.id === e.opening.id)) return dup('פתח', e.opening.id);
        h = { ...h, openings: [...h.openings, e.opening] };
        changes.push(`הוספת פתח ${e.opening.id} בקיר ${e.opening.wallId}`);
        break;
      case 'removeOpening':
        if (!h.openings.some((o) => o.id === e.id)) return missing('פתח', e.id);
        h = { ...h, openings: h.openings.filter((o) => o.id !== e.id) };
        changes.push(`הסרת פתח ${e.id}`);
        break;
      case 'setRoom': {
        const room = h.rooms.find((r) => r.id === e.id);
        if (!room) return missing('חדר', e.id);
        const next = { ...room, ...(e.name !== null ? { name: e.name } : {}), ...(e.polygon !== null ? { polygon: e.polygon } : {}), ...(e.kind !== null ? { kind: e.kind } : {}) };
        h = { ...h, rooms: h.rooms.map((r) => (r.id === e.id ? next : r)) };
        changes.push(`עדכון חדר ${room.name}`);
        break;
      }
      case 'addRoof':
        if (h.roofs.some((r) => r.id === e.roof.id)) return dup('גג', e.roof.id);
        h = { ...h, roofs: [...h.roofs, e.roof] };
        changes.push(`הוספת ${e.roof.kind === 'pergola' ? 'פרגולה' : 'גג'} ${e.roof.id}`);
        break;
      case 'removeRoof':
        if (!h.roofs.some((r) => r.id === e.id)) return missing('גג', e.id);
        h = { ...h, roofs: h.roofs.filter((r) => r.id !== e.id) };
        changes.push(`הסרת גג ${e.id}`);
        break;
      case 'setKitchen':
        h = { ...h, kitchen: e.kitchen };
        changes.push(e.kitchen ? (h.kitchen?.hasIsland ? 'עדכון מטבח עם אי' : 'עדכון מטבח') : 'הסרת המטבח');
        break;
      case 'removeItem': {
        const item = h.items.find((i) => i.id === e.id);
        if (!item) return missing('פריט', e.id);
        h = { ...h, items: h.items.filter((i) => i.id !== e.id) };
        changes.push(`הסרת ${item.name}`);
        break;
      }
    }
  }
  const v = validateHouse(h);
  if (!v.ok) return { ok: false, error: `התוצאה אינה בית תקין: ${v.error}` };
  return { ok: true, house: v.house, changes, repairs: v.repairs };
}
