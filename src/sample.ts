import type { House, Pt } from './house';

const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
  { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 },
];

const wall = (id: string, ax: number, az: number, bx: number, bz: number, exterior: boolean) => ({
  id, a: { x: ax, z: az }, b: { x: bx, z: bz }, thickness: exterior ? 0.25 : 0.1, height: 2.6, exterior,
});

/** Hand-written 10m x 6m apartment: living room, bedroom, bathroom, balcony. */
export const sampleHouse: House = {
  version: 1,
  source: { files: [], notes: 'hand-written sample' },
  walls: [
    wall('n', 0, 0, 10, 0, true),
    wall('e', 10, 0, 10, 6, true),
    wall('s', 10, 6, 0, 6, true),
    wall('w', 0, 6, 0, 0, true),
    wall('i1', 6, 0, 6, 6, false),
    wall('i2', 6, 3.5, 10, 3.5, false),
  ],
  openings: [
    { id: 'door1', wallId: 'i1', kind: 'door', offset: 2.5, width: 0.9, height: 2.1, sill: 0 },
    { id: 'win1', wallId: 'n', kind: 'window', offset: 2, width: 1.6, height: 1.2, sill: 0.9 },
    { id: 'slide1', wallId: 's', kind: 'sliding', offset: 7, width: 2, height: 2.2, sill: 0 },
  ],
  rooms: [
    { id: 'living', name: 'סלון', polygon: rect(0, 0, 6, 6), kind: 'room' },
    { id: 'bed', name: 'חדר שינה', polygon: rect(6, 0, 10, 3.5), kind: 'room' },
    { id: 'bath', name: 'מקלחת', polygon: rect(6, 3.5, 10, 6), kind: 'wet' },
    { id: 'balcony', name: 'מרפסת', polygon: rect(0, 6, 6, 8), kind: 'balcony' },
  ],
  roofs: [
    { id: 'pergola', polygon: rect(0, 6, 3, 8), height: 2.6, kind: 'pergola' },
    { id: 'slab', polygon: rect(3, 6, 6, 8), height: 2.6, kind: 'solid' },
  ],
  kitchen: { polygon: rect(0.2, 0.2, 3.2, 1.0), counterHeight: 0.9, hasIsland: true },
  items: [
    { id: 'sofa', name: 'ספה', size: { w: 2, d: 0.9, h: 0.8 }, pos: { x: 3, z: 4.5 }, rotation: 0, color: '#7a8fa6' },
    { id: 'bed', name: 'מיטה', size: { w: 1.6, d: 2, h: 0.5 }, pos: { x: 8, z: 1.5 }, rotation: 90, color: '#c9a98b' },
  ],
};
