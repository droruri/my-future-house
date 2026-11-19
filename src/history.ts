import type { House } from './house';

/** Whole-house snapshots; the house is small. */
export type History = { house: House; baseline: House; past: House[]; future: House[] };

export const createHistory = (baseline: House): History => ({
  house: baseline,
  baseline,
  past: [],
  future: [],
});

export function commit(h: History, next: House): History {
  if (next === h.house) return h;
  return { ...h, house: next, past: [...h.past, h.house], future: [] };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { ...h, house: prev, past: h.past.slice(0, -1), future: [h.house, ...h.future] };
}

export function redo(h: History): History {
  const [next, ...rest] = h.future;
  if (!next) return h;
  return { ...h, house: next, past: [...h.past, h.house], future: rest };
}

/** Back to the baseline, as one undo step. */
export const reset = (h: History): History => commit(h, h.baseline);
