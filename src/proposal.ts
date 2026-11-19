import type { ItemDraft } from './api';
import { placeItem } from './edit';
import type { House, Item, Pt } from './house';

export const PROPOSAL_ID = 'proposal';

const centroid = (poly: Pt[]): Pt => {
  const pts = poly.slice(0, -1).length > 0 ? poly.slice(0, -1) : poly;
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
};

/** The draft's missing dimensions, in metres, filled from the user's answers. Null if still incomplete. */
export function completeSize(d: ItemDraft, given: { w?: number; d?: number; h?: number } = {}) {
  const w = d.size.w ?? given.w;
  const dd = d.size.d ?? given.d;
  const h = d.size.h ?? given.h;
  const ok = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
  return ok(w) && ok(dd) && ok(h) ? { w, d: dd, h } : null;
}

/** A full item placed at the centre of the suggested room (or the first room), snapped inside the walls. */
export function toProposal(house: House, d: ItemDraft, size: { w: number; d: number; h: number }): Item {
  const room = house.rooms.find((r) => r.name === d.room) ?? house.rooms[0];
  const item: Item = {
    id: PROPOSAL_ID,
    name: d.name,
    size,
    pos: room ? centroid(room.polygon) : { x: 0, z: 0 },
    rotation: 0,
    color: d.color,
    ...(d.price !== undefined ? { price: d.price } : {}),
    ...(d.url !== undefined ? { url: d.url } : {}),
  };
  return { ...item, pos: placeItem(house, item, item.pos) };
}

/** Accepting turns the ghost into a normal item with a fresh id. */
export function acceptProposal(house: House, p: Item): House {
  let n = house.items.length + 1;
  while (house.items.some((i) => i.id === `item-${n}`)) n++;
  return { ...house, items: [...house.items, { ...p, id: `item-${n}` }] };
}
