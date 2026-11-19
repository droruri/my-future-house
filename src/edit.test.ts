import { describe, expect, it } from 'vitest';
import { deleteItem, halfExtents, interiorBounds, moveItem, placeItem, rotateItem } from './edit';
import { sampleHouse } from './sample';

const sofa = sampleHouse.items[0];
if (!sofa) throw new Error('sample has no sofa');

describe('edit', () => {
  it('snaps to a 10 cm grid', () => {
    const p = placeItem(sampleHouse, sofa, { x: 3.14, z: 4.52 });
    expect(p).toEqual({ x: 3.1, z: 4.5 });
  });
  it('keeps the footprint inside the walls', () => {
    const b = interiorBounds(sampleHouse);
    if (!b) throw new Error('no bounds');
    for (const want of [{ x: -50, z: -50 }, { x: 99, z: 99 }]) {
      const p = placeItem(sampleHouse, sofa, want);
      const { hx, hz } = halfExtents(sofa);
      expect(p.x - hx).toBeGreaterThanOrEqual(b.x0 - 1e-9);
      expect(p.x + hx).toBeLessThanOrEqual(b.x1 + 1e-9);
      expect(p.z - hz).toBeGreaterThanOrEqual(b.z0 - 1e-9);
      expect(p.z + hz).toBeLessThanOrEqual(b.z1 + 1e-9);
    }
  });
  it('moves, rotates and deletes only the target item', () => {
    expect(moveItem(sampleHouse, 'sofa', { x: 2, z: 2 }).items[0]?.pos).toEqual({ x: 2, z: 2 });
    expect(rotateItem(sampleHouse, 'sofa').items[0]?.rotation).toBe(90);
    expect(rotateItem(sampleHouse, 'bed').items[1]?.rotation).toBe(180);
    expect(deleteItem(sampleHouse, 'sofa').items.map((i) => i.id)).toEqual(['bed']);
  });
});
