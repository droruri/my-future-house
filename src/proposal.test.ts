import { expect, it } from 'vitest';
import { acceptProposal, completeSize, toProposal } from './proposal';
import { sampleHouse } from './sample';
import { validateHouse } from './house';
import * as H from './history';

const r = validateHouse(sampleHouse);
if (!r.ok) throw new Error(r.error);
const house = r.house;
const draft = { name: 'ספה', size: { w: 2.2, d: 0.9, h: null }, color: '#888', room: house.rooms[0]?.name };

it('needs every dimension before placing', () => {
  expect(completeSize(draft)).toBeNull();
  expect(completeSize(draft, { h: 0.85 })).toEqual({ w: 2.2, d: 0.9, h: 0.85 });
  expect(completeSize(draft, { h: -1 })).toBeNull();
});

it('places the ghost in the suggested room and accept is one undo step', () => {
  const p = toProposal(house, draft, { w: 2.2, d: 0.9, h: 0.85 });
  const room = house.rooms[0];
  expect(room).toBeDefined();
  const xs = room?.polygon.map((q) => q.x) ?? [];
  expect(p.pos.x).toBeGreaterThanOrEqual(Math.min(...xs));
  expect(p.pos.x).toBeLessThanOrEqual(Math.max(...xs));
  const base = H.createHistory(house);
  const after = H.commit(base, acceptProposal(house, p));
  expect(after.house.items).toHaveLength(house.items.length + 1);
  expect(H.undo(after).house).toEqual(house);
  expect(new Set(after.house.items.map((i) => i.id)).size).toBe(after.house.items.length);
});
