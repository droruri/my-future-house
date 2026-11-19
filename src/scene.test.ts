import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyWalkPose, buildDots, buildHouse, EYE_HEIGHT, PITCH_LIMIT, pickDot } from './scene';
import { pointInside, roomDots } from './geometry';
import type { Pt } from './house';
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

describe('walk mode', () => {
  const house = (() => {
    const r = validateHouse(sampleHouse);
    if (!r.ok) throw new Error(r.error);
    return r.house;
  })();

  it('places one dot per room inside its polygon, including an L shape', () => {
    const dots = roomDots(house.rooms);
    expect(dots.map((d) => d.roomId)).toEqual(house.rooms.map((r) => r.id));
    const L: Pt[] = [[0, 0], [10, 0], [10, 1], [1, 1], [1, 10], [0, 10], [0, 0]].map(([x, z]) => ({ x: x ?? 0, z: z ?? 0 }));
    const [d] = roomDots([{ id: 'l', name: 'L', polygon: L, kind: 'room' }]);
    expect(d).toBeDefined();
    expect(d && pointInside(L)).toEqual(d?.pos);
    const p = d?.pos ?? { x: -1, z: -1 };
    expect(p.x < 1 || p.z < 1).toBe(true);
    expect(p.x).toBeGreaterThan(0);
    expect(p.z).toBeGreaterThan(0);
  });

  it('stands at 1.65 m, turns freely, limits pitch', () => {
    const cam = new THREE.PerspectiveCamera();
    applyWalkPose(cam, 3, 3, 7, 5);
    expect(cam.position.y).toBe(EYE_HEIGHT);
    expect(EYE_HEIGHT).toBe(1.65);
    expect(cam.rotation.y).toBeCloseTo(7);
    expect(cam.rotation.x).toBeCloseTo(PITCH_LIMIT);
  });

  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const aimAt = (from: Pt, to: Pt) => {
    const built = buildHouse(house);
    const dots = buildDots(house);
    applyWalkPose(cam, from.x, from.z, 0, 0);
    cam.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.set(cam.position, new THREE.Vector3(to.x, 0.03, to.z).sub(cam.position).normalize());
    ray.camera = cam;
    return pickDot(ray, built, dots);
  };
  const pos = (id: string) => roomDots(house.rooms).find((d) => d.roomId === id)?.pos ?? { x: 0, z: 0 };

  it('picks a visible dot but not one behind a wall', () => {
    expect(aimAt(pos('bath'), pos('bed'))).toBe(null); // wall i2 between
    expect(aimAt(pos('living'), pos('living'))).toBe('living');
    expect(aimAt({ x: 5, z: 2 }, pos('living'))).toBe('living');
  });

  it('dots follow the house', () => {
    const fewer = { ...house, rooms: house.rooms.slice(0, 2) };
    expect(buildDots(fewer).children).toHaveLength(2);
  });
});
