import type { House, Item, Pt } from './house';

export const GRID = 0.1;

export const snap = (v: number): number => Math.round(v / GRID) * GRID;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Half extents of an item's footprint, accounting for 90° steps. */
export function halfExtents(item: Pick<Item, 'size' | 'rotation'>): { hx: number; hz: number } {
  const swap = item.rotation === 90 || item.rotation === 270;
  return { hx: (swap ? item.size.d : item.size.w) / 2, hz: (swap ? item.size.w : item.size.d) / 2 };
}

/** Inner bounds of the exterior walls, or null if the house has none. */
export function interiorBounds(house: House): { x0: number; x1: number; z0: number; z1: number } | null {
  const ext = house.walls.filter((w) => w.exterior);
  if (ext.length === 0) return null;
  const xs = ext.flatMap((w) => [w.a.x, w.b.x]);
  const zs = ext.flatMap((w) => [w.a.z, w.b.z]);
  const t = Math.max(...ext.map((w) => w.thickness)) / 2;
  return {
    x0: Math.min(...xs) + t,
    x1: Math.max(...xs) - t,
    z0: Math.min(...zs) + t,
    z1: Math.max(...zs) - t,
  };
}

/** Snap a centre to the 10 cm grid, then keep the whole footprint inside the walls. */
export function placeItem(house: House, item: Item, want: Pt): Pt {
  const b = interiorBounds(house);
  let x = snap(want.x);
  let z = snap(want.z);
  if (b) {
    const { hx, hz } = halfExtents(item);
    const clampAxis = (v: number, lo: number, hi: number) =>
      lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
    // Clamp to the grid points that still fit, so the result stays on the grid.
    const gx0 = Math.ceil((b.x0 + hx) / GRID - 1e-9) * GRID;
    const gx1 = Math.floor((b.x1 - hx) / GRID + 1e-9) * GRID;
    const gz0 = Math.ceil((b.z0 + hz) / GRID - 1e-9) * GRID;
    const gz1 = Math.floor((b.z1 - hz) / GRID + 1e-9) * GRID;
    x = clampAxis(x, gx0, gx1);
    z = clampAxis(z, gz0, gz1);
  }
  return { x: round2(x), z: round2(z) };
}

const mapItem = (house: House, id: string, f: (i: Item) => Item): House => ({
  ...house,
  items: house.items.map((i) => (i.id === id ? f(i) : i)),
});

export function moveItem(house: House, id: string, want: Pt): House {
  return mapItem(house, id, (i) => ({ ...i, pos: placeItem(house, i, want) }));
}

export function rotateItem(house: House, id: string): House {
  return mapItem(house, id, (i) => {
    const rotated = { ...i, rotation: (((i.rotation + 90) % 360) as Item['rotation']) };
    return { ...rotated, pos: placeItem(house, rotated, i.pos) };
  });
}

export function deleteItem(house: House, id: string): House {
  return { ...house, items: house.items.filter((i) => i.id !== id) };
}
