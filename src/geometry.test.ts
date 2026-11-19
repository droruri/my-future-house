import { describe, expect, it } from 'vitest';
import { openSides, slatSpans, wallRects } from './geometry';
import { sampleHouse } from './sample';

const L = [
  { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }, { x: 0, z: 0 },
];

describe('wallRects', () => {
  it('cuts a window with sill and head', () => {
    const wall = sampleHouse.walls.find((w) => w.id === 'n');
    if (!wall) throw new Error('no wall');
    const r = wallRects(wall, sampleHouse.openings);
    expect(r).toContainEqual({ u0: 2, u1: 3.6, y0: 0, y1: 0.9 });
    expect(r).toContainEqual({ u0: 2, u1: 3.6, y0: 2.1, y1: 2.6 });
    expect(r).toContainEqual({ u0: 0, u1: 2, y0: 0, y1: 2.6 });
    expect(r).toContainEqual({ u0: 3.6, u1: 10, y0: 0, y1: 2.6 });
  });
  it('door leaves only a head piece', () => {
    const wall = sampleHouse.walls.find((w) => w.id === 'i1');
    if (!wall) throw new Error('no wall');
    const r = wallRects(wall, sampleHouse.openings);
    expect(r.filter((x) => x.u0 === 2.5)).toEqual([{ u0: 2.5, u1: 3.4, y0: 2.1, y1: 2.6 }]);
  });
});

describe('openSides', () => {
  it('balcony railing only where there is no wall', () => {
    const balcony = sampleHouse.rooms.find((r) => r.kind === 'balcony');
    if (!balcony) throw new Error('no balcony');
    const sides = openSides(balcony, sampleHouse.walls);
    // top edge z=6 is the building wall; the other three sides are open
    expect(sides).toHaveLength(3);
    expect(sides.every(([a, b]) => !(a.z === 6 && b.z === 6))).toBe(true);
  });
});

describe('slatSpans', () => {
  it('stays inside a non-rectangular polygon', () => {
    const spans = slatSpans(L, 1);
    expect(spans.length).toBe(4);
    for (const s of spans) {
      if (s.x > 2) expect(s.z1).toBeLessThanOrEqual(2);
      else expect(s.z1).toBeCloseTo(4);
    }
  });
});
