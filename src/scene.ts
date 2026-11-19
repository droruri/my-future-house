import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { House, Item, Pt } from './house';
import { moveItem, placeItem } from './edit';
import { openSides, roomDots, slatSpans, wallRects } from './geometry';

const ROOM_COLORS = {
  room: 0xd9c7a8,
  wet: 0xa9c4d6,
  balcony: 0xb8c4b0,
  service_balcony: 0xc9cfa0,
  mamad: 0xd6a9a9,
} as const;

function tag<T extends THREE.Object3D>(o: T, kind: string): T {
  o.userData['kind'] = kind;
  return o;
}

/** Text sprite; without a DOM (tests) it is an empty sprite. */
function makeLabel(text: string, kind: string, scale: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#222';
      ctx.font = '32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.fillText(text, 128, 34, 240);
      mat.map = new THREE.CanvasTexture(canvas);
    }
  }
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale / 4, 1);
  return tag(s, kind);
}

/** Eye height of an average adult man: ~1.77 m tall, eyes ~12 cm below the top of the head. */
export const EYE_HEIGHT = 1.65;
export const PITCH_LIMIT = THREE.MathUtils.degToRad(80);
const WALK_MOVE_SECONDS = 0.5;

export const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

/** Put the camera at eye height at (x, z), facing `yaw` (0 = toward -z) and `pitch` (clamped). */
export function applyWalkPose(camera: THREE.Camera, x: number, z: number, yaw: number, pitch: number): void {
  camera.rotation.order = 'YXZ';
  camera.position.set(x, EYE_HEIGHT, z);
  camera.rotation.set(clampPitch(pitch), yaw, 0);
}

const IGNORED_KINDS = new Set(['room-label', 'item-label', 'proposal-label', 'glass']);

/** The room id of the dot under `ray`, or null when a wall/item/etc. is in front of it. */
export function pickDot(ray: THREE.Raycaster, built: THREE.Object3D, dots: THREE.Object3D): string | null {
  built.updateMatrixWorld(true);
  dots.updateMatrixWorld(true);
  const hit = ray
    .intersectObjects([built, dots], true)
    .find((h) => !IGNORED_KINDS.has(String(h.object.userData['kind'])));
  const id = hit?.object.userData['roomId'];
  return hit?.object.userData['kind'] === 'walk-dot' && typeof id === 'string' ? id : null;
}

export function buildDots(house: House): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x2f7dd1 });
  for (const d of roomDots(house.rooms)) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24), mat);
    m.position.set(d.pos.x, 0.03, d.pos.z);
    m.userData['roomId'] = d.roomId;
    g.add(tag(m, 'walk-dot'));
  }
  return g;
}

const shapeOf = (poly: Pt[]) =>
  // Shape lives in the XY plane; rotating -90° about X maps shape y -> world -z, so negate.
  new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.z)));

function slab(poly: Pt[], y: number, thickness: number, color: number, kind: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shapeOf(poly), { depth: thickness, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return tag(mesh, kind);
}

const centroid = (poly: Pt[]): Pt => {
  const pts = poly.slice(0, -1);
  const n = Math.max(pts.length, 1);
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, z: pts.reduce((s, p) => s + p.z, 0) / n };
};

/** Build the 3D group for a house. */
export function buildHouse(house: House, selectedId: string | null = null, proposal: Item | null = null): THREE.Group {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2efe9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9ccbe8, transparent: true, opacity: 0.35 });

  for (const w of house.walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz);
    const wallGroup = new THREE.Group();
    wallGroup.position.set(w.a.x, 0, w.a.z);
    wallGroup.rotation.y = -Math.atan2(dz, dx);
    for (const r of wallRects(w, house.openings)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(r.u1 - r.u0, r.y1 - r.y0, w.thickness),
        wallMat,
      );
      mesh.position.set((r.u0 + r.u1) / 2, (r.y0 + r.y1) / 2, 0);
      wallGroup.add(tag(mesh, 'wall'));
    }
    for (const o of house.openings) {
      if (o.wallId !== w.id || o.kind === 'door') continue;
      const pane = new THREE.Mesh(new THREE.BoxGeometry(o.width, o.height, 0.02), glassMat);
      pane.position.set(Math.min(o.offset + o.width / 2, len), o.sill + o.height / 2, 0);
      wallGroup.add(tag(pane, 'glass'));
    }
    group.add(wallGroup);
  }

  for (const r of house.rooms) {
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(shapeOf(r.polygon)),
      new THREE.MeshStandardMaterial({ color: ROOM_COLORS[r.kind], side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    group.add(tag(floor, 'floor'));
    const c = centroid(r.polygon);
    const label = makeLabel(r.name, 'room-label', 2);
    label.position.set(c.x, 0.15, c.z);
    group.add(label);
    if (r.kind === 'balcony') {
      const railMat = new THREE.MeshStandardMaterial({ color: 0x555a60 });
      for (const [a, b] of openSides(r, house.walls)) {
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1, 0.04), railMat);
        rail.position.set((a.x + b.x) / 2, 0.5, (a.z + b.z) / 2);
        rail.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        group.add(tag(rail, 'railing'));
      }
    }
  }

  for (const roof of house.roofs) {
    if (roof.kind === 'solid') {
      group.add(slab(roof.polygon, roof.height, 0.12, 0xb9a99a, 'solid-roof'));
      continue;
    }
    const pergola = tag(new THREE.Group(), 'pergola');
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b6b4a });
    for (const s of slatSpans(roof.polygon, 0.3)) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, s.z1 - s.z0), mat);
      slat.position.set(s.x, roof.height, (s.z0 + s.z1) / 2);
      pergola.add(slat);
    }
    group.add(pergola);
  }

  const k = house.kitchen;
  if (k) {
    group.add(slab(k.polygon, 0, k.counterHeight, 0xcfd3d6, 'counter'));
    if (k.hasIsland) {
      const xs = k.polygon.map((p) => p.x);
      const zs = k.polygon.map((p) => p.z);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const maxZ = Math.max(...zs);
      const island = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(maxX - minX, 1) * 0.6, k.counterHeight, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xb7bcc0 }),
      );
      island.position.set((minX + maxX) / 2, k.counterHeight / 2, maxZ + 1.2);
      group.add(tag(island, 'counter'));
    }
  }

  for (const it of house.items) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(it.size.w, it.size.h, it.size.d),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(it.color),
        emissive: new THREE.Color(it.id === selectedId ? 0x335577 : 0x000000),
      }),
    );
    box.userData['itemId'] = it.id;
    box.position.set(it.pos.x, it.size.h / 2, it.pos.z);
    box.rotation.y = -THREE.MathUtils.degToRad(it.rotation);
    group.add(tag(box, 'item'));
    const label = makeLabel(it.name, 'item-label', 1.2);
    label.position.set(it.pos.x, it.size.h + 0.3, it.pos.z);
    group.add(label);
  }

  if (proposal) {
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(proposal.size.w, proposal.size.h, proposal.size.d),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(proposal.color), transparent: true, opacity: 0.45, depthWrite: false }),
    );
    ghost.position.set(proposal.pos.x, proposal.size.h / 2, proposal.pos.z);
    ghost.rotation.y = -THREE.MathUtils.degToRad(proposal.rotation);
    group.add(tag(ghost, 'proposal'));
    const { w, d, h } = proposal.size;
    const cm = (v: number) => Math.round(v * 100);
    const price = proposal.price !== undefined ? ` · ₪${proposal.price}` : '';
    const label = makeLabel(`${proposal.name} ${cm(w)}×${cm(d)}×${cm(h)}${price}`, 'proposal-label', 1.6);
    label.position.set(proposal.pos.x, h + 0.3, proposal.pos.z);
    group.add(label);
  }
  return group;
}

export type SceneHandle = {
  dispose: () => void;
  setView: (v: 'orbit' | 'top') => void;
  setHouse: (house: House, selectedId: string | null, proposal?: Item | null) => void;
  enterWalk: () => void;
  exitWalk: () => void;
};

export type SceneCallbacks = {
  onSelect: (id: string | null) => void;
  /** A finished drag: the item's new (already snapped and clamped) position. */
  onMove: (id: string, pos: Pt) => void;
  /** Walk mode turned on or off (button, Escape). */
  onWalk?: (walking: boolean) => void;
};

/** Mount a renderer into `el`. Only furniture items can be picked and dragged. */
export function mountScene(
  el: HTMLElement,
  initial: House,
  cb: SceneCallbacks,
): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f5);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(8, 15, 5);
  scene.add(sun);

  let house = initial;
  let selected: string | null = null;
  let ghost: Item | null = null;
  let built: THREE.Group | null = null;
  let dots = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  el.appendChild(renderer.domElement);
  const render = () => renderer.render(scene, camera);
  const rebuild = (h: House) => {
    if (built) {
      scene.remove(built);
      built.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          if (o.material instanceof THREE.Material) o.material.dispose();
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        }
      });
    }
    built = buildHouse(h, selected, ghost);
    scene.add(built);
    scene.remove(dots);
    dots.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    dots = buildDots(h);
    dots.visible = walk !== null;
    scene.add(dots);
    render();
  };
  type Walk = { x: number; z: number; yaw: number; pitch: number };
  let walk: Walk | null = null;
  rebuild(house);

  const controls = new OrbitControls(camera, renderer.domElement);
  const target = new THREE.Vector3(5, 0, 3.5);
  const setView = (v: 'orbit' | 'top') => {
    if (walk) return;
    controls.target.copy(target);
    if (v === 'top') camera.position.set(target.x, 18, target.z + 0.001);
    else camera.position.set(5, 12, 16);
    camera.lookAt(target);
    controls.update();
  };
  setView('orbit');
  controls.addEventListener('change', render);

  // --- walk mode: own yaw/pitch look (exact eye height), dots to move between ---
  let saved: { pos: THREE.Vector3; quat: THREE.Quaternion; target: THREE.Vector3 } | null = null;
  let anim = 0;
  const setWalkDot = (on: boolean) => {
    dots.visible = on;
  };
  const poseWalk = () => {
    if (walk) applyWalkPose(camera, walk.x, walk.z, walk.yaw, walk.pitch);
    render();
  };
  const enterWalk = () => {
    if (walk) return;
    const room = house.rooms.find((r) => /entrance|כניסה/i.test(`${r.id} ${r.name}`)) ?? house.rooms[0];
    const start = room ? roomDots([room])[0]?.pos : undefined;
    if (!start) return;
    saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), target: controls.target.clone() };
    const dir = camera.getWorldDirection(new THREE.Vector3());
    walk = { x: start.x, z: start.z, yaw: Math.atan2(-dir.x, -dir.z), pitch: 0 };
    drag = null;
    controls.enabled = false;
    setWalkDot(true);
    poseWalk();
    cb.onWalk?.(true);
  };
  const exitWalk = () => {
    if (!walk || !saved) return;
    cancelAnimationFrame(anim);
    walk = null;
    camera.rotation.order = 'XYZ';
    camera.position.copy(saved.pos);
    camera.quaternion.copy(saved.quat);
    controls.target.copy(saved.target);
    controls.enabled = true;
    controls.update();
    saved = null;
    setWalkDot(false);
    render();
    cb.onWalk?.(false);
  };
  const walkTo = (roomId: string) => {
    const w = walk;
    const dot = roomDots(house.rooms).find((d) => d.roomId === roomId);
    if (!w || !dot) return;
    cancelAnimationFrame(anim);
    const from = { x: w.x, z: w.z };
    const t0 = performance.now();
    const step = (now: number) => {
      if (walk !== w) return;
      const t = Math.min((now - t0) / (WALK_MOVE_SECONDS * 1000), 1);
      const k = t * t * (3 - 2 * t);
      w.x = from.x + (dot.pos.x - from.x) * k;
      w.z = from.z + (dot.pos.z - from.z) * k;
      poseWalk();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  let look: { x: number; y: number; moved: number } | null = null;
  const walkDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    look = { x: e.clientX, y: e.clientY, moved: 0 };
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  const walkMove = (e: PointerEvent) => {
    if (!look || !walk) return;
    const dx = e.clientX - look.x;
    const dy = e.clientY - look.y;
    look.x = e.clientX;
    look.y = e.clientY;
    look.moved += Math.abs(dx) + Math.abs(dy);
    walk.yaw += dx * 0.004;
    walk.pitch = clampPitch(walk.pitch + dy * 0.004);
    poseWalk();
  };
  const walkUp = (e: PointerEvent) => {
    const l = look;
    look = null;
    if (!l || !built || l.moved > 5) return;
    aim(e);
    const id = pickDot(ray, built, dots);
    if (id) walkTo(id);
  };

  // --- dragging items ---
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aim = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  type Drag = { id: string; grab: Pt; pos: Pt; moved: boolean };
  let drag: Drag | null = null;

  const onDown = (e: PointerEvent) => {
    if (walk) return walkDown(e);
    if (e.button !== 0 || !built) return;
    aim(e);
    const hit = ray.intersectObject(built, true).find((h) => h.object.userData['kind'] !== 'room-label');
    const id = hit?.object.userData['itemId'];
    const item = typeof id === 'string' ? house.items.find((i) => i.id === id) : undefined;
    if (!item) {
      // Walls, openings, kitchen, balcony: do nothing. Only empty space clears the selection.
      if (!hit) cb.onSelect(null);
      return;
    }
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floor, p)) return;
    drag = { id: item.id, grab: { x: p.x - item.pos.x, z: p.z - item.pos.z }, pos: item.pos, moved: false };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    cb.onSelect(item.id);
  };
  const onMoveEvt = (e: PointerEvent) => {
    if (walk) return walkMove(e);
    if (!drag) return;
    aim(e);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floor, p)) return;
    const item = house.items.find((i) => i.id === drag?.id);
    if (!item) return;
    const pos = placeItem(house, item, { x: p.x - drag.grab.x, z: p.z - drag.grab.z });
    if (pos.x === drag.pos.x && pos.z === drag.pos.z) return;
    drag.pos = pos;
    drag.moved = true;
    rebuild(moveItem(house, drag.id, pos));
  };
  const endDrag = () => {
    controls.enabled = true;
    drag = null;
  };
  const onUp = (e: PointerEvent) => {
    if (walk) return walkUp(e);
    const d = drag;
    if (!d) return;
    endDrag();
    if (d.moved) cb.onMove(d.id, d.pos); // parent commits and calls setHouse
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && walk) return exitWalk();
    if (e.key !== 'Escape' || !drag) return;
    endDrag();
    rebuild(house); // back to the pre-drag house; nothing was committed
  };
  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMoveEvt);
  dom.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  return {
    setView,
    enterWalk,
    exitWalk,
    setHouse: (h, sel, proposal = null) => {
      house = h;
      selected = sel;
      ghost = proposal;
      drag = null;
      controls.enabled = walk === null;
      rebuild(h);
    },
    dispose: () => {
      cancelAnimationFrame(anim);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMoveEvt);
      dom.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
