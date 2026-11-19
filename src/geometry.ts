import type { Opening, Pt, Room, Wall } from './house';

export type Rect = { u0: number; u1: number; y0: number; y1: number };

/** Solid rectangles of a wall (u = metres along the wall, y = height) with openings cut out. */
export function wallRects(wall: Wall, openings: Opening[]): Rect[] {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
  const ops = openings
    .filter((o) => o.wallId === wall.id)
    .sort((p, q) => p.offset - q.offset);
  const rects: Rect[] = [];
  let cursor = 0;
  for (const o of ops) {
    const u0 = Math.max(o.offset, cursor);
    const u1 = Math.min(o.offset + o.width, len);
    if (u1 <= u0) continue;
    if (u0 > cursor) rects.push({ u0: cursor, u1: u0, y0: 0, y1: wall.height });
    if (o.sill > 0) rects.push({ u0, u1, y0: 0, y1: o.sill });
    if (o.sill + o.height < wall.height) rects.push({ u0, u1, y0: o.sill + o.height, y1: wall.height });
    cursor = u1;
  }
  if (cursor < len) rects.push({ u0: cursor, u1: len, y0: 0, y1: wall.height });
  return rects;
}

/** Edges (as point pairs) of a room polygon, or parts of them, that no wall runs along. */
export function openSides(room: Room, walls: Wall[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < room.polygon.length; i++) {
    const p = room.polygon[i];
    const q = room.polygon[i + 1];
    if (!p || !q) continue;
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len < 1e-6) continue;
    const ux = (q.x - p.x) / len;
    const uz = (q.z - p.z) / len;
    const dist = (r: Pt) => Math.abs((r.x - p.x) * uz - (r.z - p.z) * ux);
    const along = (r: Pt) => (r.x - p.x) * ux + (r.z - p.z) * uz;
    const covered: [number, number][] = [];
    for (const w of walls) {
      const tol = w.thickness / 2 + 0.05;
      if (dist(w.a) > tol || dist(w.b) > tol) continue;
      const s = [along(w.a), along(w.b)].sort((a, b) => a - b);
      covered.push([Math.max(0, s[0] ?? 0), Math.min(len, s[1] ?? 0)]);
    }
    covered.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const gaps: [number, number][] = [];
    for (const [s, e] of covered) {
      if (s > cursor + 0.05) gaps.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < len - 0.05) gaps.push([cursor, len]);
    for (const [s, e] of gaps)
      out.push([
        { x: p.x + ux * s, z: p.z + uz * s },
        { x: p.x + ux * e, z: p.z + uz * e },
      ]);
  }
  return out;
}

/** Slats running along z every `spacing` metres in x, clipped to the polygon. */
export function slatSpans(polygon: Pt[], spacing: number): { x: number; z0: number; z1: number }[] {
  const xs = polygon.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const out: { x: number; z0: number; z1: number }[] = [];
  for (let x = minX + spacing / 2; x < maxX; x += spacing) {
    const hits: number[] = [];
    for (let i = 0; i + 1 < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[i + 1];
      if (!p || !q || p.x === q.x) continue;
      if ((p.x <= x && x < q.x) || (q.x <= x && x < p.x))
        hits.push(p.z + ((x - p.x) / (q.x - p.x)) * (q.z - p.z));
    }
    hits.sort((a, b) => a - b);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const z0 = hits[k];
      const z1 = hits[k + 1];
      if (z0 !== undefined && z1 !== undefined) out.push({ x, z0, z1 });
    }
  }
  return out;
}
