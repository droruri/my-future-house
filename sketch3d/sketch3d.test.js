import { describe, expect, it } from 'vitest';
import { layoutJson, parseLayout } from './sketch3d.js';

describe('parseLayout', () => {
  it('reads offsets and turns, defaulting rot to 0', () => {
    const { entries, skipped } = parseLayout('{"sofa":{"x":-1.5,"z":0.25},"bed":{"x":0,"z":0,"rot":90}}');
    expect([...entries]).toEqual([['sofa', { x: -1.5, z: 0.25, rot: 0 }], ['bed', { x: 0, z: 0, rot: 90 }]]);
    expect(skipped).toEqual([]);
  });

  it('skips bad entries and survives unreadable text', () => {
    const { entries, skipped } = parseLayout('{"a":{"x":"1","z":0},"b":{"x":1},"c":{"x":1,"z":2,"rot":null},"d":5}');
    expect(entries.size).toBe(1);
    expect(entries.get('c')).toEqual({ x: 1, z: 2, rot: 0 });
    expect(skipped).toEqual(['a', 'b', 'd']);
    expect(parseLayout('{oops').entries.size).toBe(0);
    expect(parseLayout('[1]').entries.size).toBe(0);
    expect(parseLayout('').entries.size).toBe(0);
  });
});

describe('layoutJson', () => {
  it('rounds to 1 cm in a metre world and drops untouched items', () => {
    const json = layoutJson(new Map([
      ['moved', { x: 0.123456, z: -2.0049, rot: 0 }],
      ['turned', { x: 0.001, z: 0, rot: 89.6 }],
      ['still', { x: 0.004, z: -0.004, rot: 0.2 }],
    ]), 1);
    expect(JSON.parse(json)).toEqual({ moved: { x: 0.12, z: -2 }, turned: { x: 0, z: 0, rot: 90 } });
  });

  it('rounds to whole cm in a centimetre world and keeps turns within (−180, 180]', () => {
    const json = layoutJson(new Map([['a', { x: 12.4, z: -7.6, rot: 270 }], ['b', { x: 0, z: 0, rot: -180 }]]), 100);
    expect(JSON.parse(json)).toEqual({ a: { x: 12, z: -8, rot: -90 }, b: { x: 0, z: 0, rot: 180 } });
  });

  it('round-trips through parseLayout', () => {
    const before = new Map([['sofa', { x: -19.85, z: -5.06, rot: 15 }]]);
    expect([...parseLayout(layoutJson(before, 1)).entries]).toEqual([...before]);
  });
});
