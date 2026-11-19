import { describe, expect, it } from 'vitest';
import { buildHouse } from './scene';
import { sampleHouse } from './sample';
import { validateHouse } from './house';

function kinds(): Record<string, number> {
  const r = validateHouse(sampleHouse);
  if (!r.ok) throw new Error(r.error);
  const counts: Record<string, number> = {};
  buildHouse(r.house).traverse((o) => {
    const k = o.userData['kind'];
    if (typeof k === 'string') counts[k] = (counts[k] ?? 0) + 1;
  });
  return counts;
}

describe('buildHouse(sampleHouse)', () => {
  const c = kinds();
  it('draws every element type', () => {
    expect(c['floor']).toBe(sampleHouse.rooms.length);
    expect(c['room-label']).toBe(sampleHouse.rooms.length);
    expect(c['railing']).toBeGreaterThan(0);
    expect(c['pergola']).toBe(1);
    expect(c['solid-roof']).toBe(1);
    expect(c['counter']).toBeGreaterThanOrEqual(2);
    expect(c['item']).toBe(sampleHouse.items.length);
    expect(c['item-label']).toBe(sampleHouse.items.length);
    expect(c['wall']).toBeGreaterThan(sampleHouse.walls.length);
  });
});
