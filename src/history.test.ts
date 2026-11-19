import { describe, expect, it } from 'vitest';
import { commit, createHistory, redo, reset, undo } from './history';
import { sampleHouse } from './sample';
import type { House } from './house';

const v = (n: number): House => ({ ...sampleHouse, source: { files: [], notes: `v${n}` } });

describe('history', () => {
  it('commit pushes the old house and clears redo', () => {
    const h = commit(createHistory(v(0)), v(1));
    expect(h.house).toEqual(v(1));
    expect(h.past).toEqual([v(0)]);
    expect(h.future).toEqual([]);
  });
  it('undo and redo walk the snapshots', () => {
    let h = commit(commit(createHistory(v(0)), v(1)), v(2));
    h = undo(h);
    expect(h.house).toEqual(v(1));
    h = undo(h);
    expect(h.house).toEqual(v(0));
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.house).toEqual(v(2));
    expect(redo(h)).toBe(h);
  });
  it('redo is cleared after a new commit', () => {
    let h = undo(commit(createHistory(v(0)), v(1)));
    h = commit(h, v(2));
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });
  it('reset returns to baseline as one undoable step', () => {
    let h = commit(commit(createHistory(v(0)), v(1)), v(2));
    h = reset(h);
    expect(h.house).toEqual(v(0));
    expect(h.past).toHaveLength(3);
    expect(undo(h).house).toEqual(v(2));
  });
});
