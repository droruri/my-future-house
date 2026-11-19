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
