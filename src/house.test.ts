import { describe, expect, it } from 'vitest';
import { validateHouse, type House } from './house';
import { sampleHouse } from './sample';

const base = (): House => structuredClone(sampleHouse);

function repaired(h: unknown) {
  const r = validateHouse(h);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('validateHouse', () => {
  it('accepts the sample house with no repairs', () => {
    expect(repaired(sampleHouse).repairs).toEqual([]);
  });
  it('rejects non-house input', () => {
    expect(validateHouse({ nope: 1 }).ok).toBe(false);
    expect(validateHouse(null).ok).toBe(false);
  });
  it('clamps wall sizes', () => {
    const h = base();
    const w = h.walls[0];
    if (!w) throw new Error('no wall');
    w.thickness = 50;
    w.height = -1;
    const r = repaired(h);
    expect(r.house.walls[0]?.thickness).toBe(1);
    expect(r.house.walls[0]?.height).toBe(0.5);
    expect(r.repairs).toContain('wall n: thickness clamped');
  });
  it('closes open polygons', () => {
    const h = base();
    h.rooms = [
      { id: 'r', name: 'x', kind: 'room', polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] },
    ];
    const poly = repaired(h).house.rooms[0]?.polygon ?? [];
    expect(poly).toHaveLength(4);
    expect(poly[3]).toEqual(poly[0]);
  });
  it('drops degenerate polygons', () => {
    const h = base();
    h.rooms = [{ id: 'r', name: 'x', kind: 'room', polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }] }];
    expect(repaired(h).house.rooms).toEqual([]);
  });
  it('drops openings that point to a missing wall', () => {
    const h = base();
    h.openings.push({ id: 'o-bad', wallId: 'nope', kind: 'door', offset: 0, width: 1, height: 2, sill: 0 });
    const r = repaired(h);
    expect(r.house.openings.find((o) => o.id === 'o-bad')).toBeUndefined();
    expect(r.house.openings.length).toBe(sampleHouse.openings.length);
  });
  it('clamps item sizes', () => {
    const h = base();
    h.items = [
      { id: 'i', name: 'x', size: { w: 0, d: 99, h: 1 }, pos: { x: 0, z: 0 }, rotation: 0, color: '#fff' },
    ];
    const r = repaired(h);
    expect(r.house.items[0]?.size).toEqual({ w: 0.05, d: 10, h: 1 });
    expect(r.repairs).toContain('item i: width clamped');
    expect(r.repairs).toContain('item i: depth clamped');
  });
  it('clamps opening size to its wall', () => {
    const h = base();
    h.openings = [
      { id: 'o', wallId: 'n', kind: 'window', offset: 0, width: 99, height: 99, sill: 5 },
    ];
    const o = repaired(h).house.openings[0];
    expect(o?.width).toBe(10);
    expect(o?.height).toBe(2.6);
    expect(o?.sill).toBe(0);
    expect(repaired(h).repairs).toContain('opening o: size clamped');
  });
  it('clamps roof height and kitchen counter height, drops unusable polygons', () => {
    const h = base();
    h.roofs = [
      { id: 'roof', polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }], height: 40, kind: 'solid' },
      { id: 'bad-roof', polygon: [{ x: 0, z: 0 }], height: 2, kind: 'pergola' },
    ];
    h.kitchen = {
      polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }],
      counterHeight: 3,
      hasIsland: false,
    };
    const r = repaired(h);
    expect(r.house.roofs.map((x) => x.id)).toEqual(['roof']);
    expect(r.house.roofs[0]?.height).toBe(6);
    expect(r.house.kitchen?.counterHeight).toBe(1.2);
    expect(r.repairs).toContain('roof roof: height clamped');
    expect(r.repairs).toContain('kitchen: counterHeight clamped');
    expect(r.repairs).toContain('roof bad-roof: dropped (fewer than 3 points)');
  });
});

import { applyEdits, type Edit } from './house';
import { sampleHouse as sample } from './sample';
import * as Hist from './history';

describe('applyEdits', () => {
  const ok = (edits: Edit[]) => {
    const r = applyEdits(sample, edits);
    if (!r.ok) throw new Error(r.error);
    return r;
  };
  const sq = (x0: number, z0: number, x1: number, z1: number) => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 },
  ];
  it('addWall / removeWall (drops its openings) / moveWall', () => {
    const w = { id: 'new', a: { x: 1, z: 1 }, b: { x: 2, z: 1 }, thickness: 0.1, height: 2.6, exterior: false };
    expect(ok([{ type: 'addWall', wall: w }]).house.walls.map((x) => x.id)).toContain('new');
    const r = ok([{ type: 'removeWall', id: 'i1' }]);
    expect(r.house.walls.some((x) => x.id === 'i1')).toBe(false);
    expect(r.house.openings.some((o) => o.id === 'door1')).toBe(false);
    expect(r.changes).toHaveLength(1);
    expect(ok([{ type: 'moveWall', id: 'i1', a: { x: 5, z: 0 }, b: { x: 5, z: 6 } }]).house.walls.find((x) => x.id === 'i1')?.a.x).toBe(5);
  });
  it('addOpening / removeOpening', () => {
    const o = { id: 'd2', wallId: 'i2', kind: 'door' as const, offset: 1, width: 0.9, height: 2.1, sill: 0 };
    expect(ok([{ type: 'addOpening', opening: o }]).house.openings.map((x) => x.id)).toContain('d2');
    expect(ok([{ type: 'removeOpening', id: 'door1' }]).house.openings.some((x) => x.id === 'door1')).toBe(false);
  });
  it('setRoom patches only given fields', () => {
    const r = ok([{ type: 'setRoom', id: 'balcony', name: 'מרפסת שמש', polygon: sq(0, 6, 6, 8.4), kind: null }]);
    const room = r.house.rooms.find((x) => x.id === 'balcony');
    expect([room?.name, room?.kind, room?.polygon[2]?.z]).toEqual(['מרפסת שמש', 'balcony', 8.4]);
  });
  it('addRoof / removeRoof', () => {
    const roof = { id: 'p2', polygon: sq(3, 6, 4.5, 8), height: 2.6, kind: 'pergola' as const };
    expect(ok([{ type: 'addRoof', roof }]).house.roofs.map((x) => x.id)).toContain('p2');
    expect(ok([{ type: 'removeRoof', id: 'pergola' }]).house.roofs.some((x) => x.id === 'pergola')).toBe(false);
  });
  it('setKitchen / removeItem', () => {
    expect(ok([{ type: 'setKitchen', kitchen: null }]).house.kitchen).toBeNull();
    expect(ok([{ type: 'setKitchen', kitchen: { polygon: sq(0, 0, 2, 1), counterHeight: 0.9, hasIsland: false } }]).house.kitchen?.hasIsland).toBe(false);
    expect(ok([{ type: 'removeItem', id: 'sofa' }]).house.items.map((x) => x.id)).toEqual(['bed']);
  });
  it('refuses the whole list when any target is missing', () => {
    const bad: Edit[][] = [
      [{ type: 'removeItem', id: 'sofa' }, { type: 'removeWall', id: 'zzz' }],
      [{ type: 'moveWall', id: 'zzz', a: { x: 0, z: 0 }, b: { x: 1, z: 1 } }],
      [{ type: 'removeOpening', id: 'zzz' }],
      [{ type: 'removeRoof', id: 'zzz' }],
      [{ type: 'removeItem', id: 'zzz' }],
      [{ type: 'setRoom', id: 'zzz', name: 'x', polygon: null, kind: null }],
      [{ type: 'addOpening', opening: { id: 'q', wallId: 'zzz', kind: 'door', offset: 0, width: 1, height: 2, sill: 0 } }],
    ];
    for (const edits of bad) {
      const r = applyEdits(sample, edits);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('לא בוצע שום שינוי');
    }
  });
  it('result is validated (repairs reported) and accept is one undo step', () => {
    const r = ok([{ type: 'removeWall', id: 'i1' }, { type: 'removeItem', id: 'bed' }]);
    expect(validateHouse(r.house).ok).toBe(true);
    const after = Hist.commit(Hist.createHistory(sample), r.house);
    expect(after.past).toHaveLength(1);
    expect(Hist.undo(after).house).toEqual(sample);
  });
});
