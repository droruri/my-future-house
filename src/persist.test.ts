import { describe, expect, it } from 'vitest';
import { loadSaved, parseImport, save, serializeHouse, STORAGE_KEY } from './persist';
import { sampleHouse } from './sample';
import { validateHouse } from './house';

const base = (() => {
  const r = validateHouse(sampleHouse);
  if (!r.ok) throw new Error(r.error);
  return r.house;
})();
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('persist', () => {
  it('save then load round-trips house and baseline', () => {
    const s = mem();
    const changed = { ...base, source: { files: [], notes: 'x' } };
    expect(save(changed, base, s)).toBeNull();
    const l = loadSaved(s);
    expect(l?.house).toEqual(changed);
    expect(l?.baseline).toEqual(base);
  });
  it('load ignores garbage and empty storage', () => {
    expect(loadSaved(mem())).toBeNull();
    const s = mem();
    s.setItem(STORAGE_KEY, '{nope');
    expect(loadSaved(s)).toBeNull();
    s.setItem(STORAGE_KEY, JSON.stringify({ house: 5, baseline: 5 }));
    expect(loadSaved(s)).toBeNull();
  });
  it('save reports full or blocked storage instead of throwing', () => {
    const full = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(save(base, base, full)).toMatch(/.+/);
    expect(save(base, base, undefined)).not.toBeNull();
  });
  it('export then import gives the same house', () => {
    const r = parseImport(serializeHouse(base));
    expect(r.ok && r.house).toEqual(base);
    expect(r.ok && r.repairs).toEqual([]);
  });
  it('import repairs hand-edited values and lists repairs', () => {
    const edited = { ...base, walls: base.walls.map((w) => ({ ...w, thickness: 99 })) };
    const r = parseImport(JSON.stringify(edited));
    expect(r.ok && r.repairs.length).toBeGreaterThan(0);
  });
  it('import rejects non-houses', () => {
    expect(parseImport('hello').ok).toBe(false);
    expect(parseImport('{"a":1}').ok).toBe(false);
  });
});
