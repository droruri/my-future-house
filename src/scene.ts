import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { House, Pt } from './house';
import { openSides, slatSpans, wallRects } from './geometry';

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
export function buildHouse(house: House): THREE.Group {
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
      new THREE.MeshStandardMaterial({ color: new THREE.Color(it.color) }),
    );
    box.position.set(it.pos.x, it.size.h / 2, it.pos.z);
    box.rotation.y = -THREE.MathUtils.degToRad(it.rotation);
    group.add(tag(box, 'item'));
    const label = makeLabel(it.name, 'item-label', 1.2);
    label.position.set(it.pos.x, it.size.h + 0.3, it.pos.z);
    group.add(label);
  }
  return group;
}

export type SceneHandle = { dispose: () => void; setView: (v: 'orbit' | 'top') => void };

/** Mount a renderer into `el`. */
export function mountScene(el: HTMLElement, house: House): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f5);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(8, 15, 5);
  scene.add(sun);
  scene.add(buildHouse(house));

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  el.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  const target = new THREE.Vector3(5, 0, 3.5);
  const setView = (v: 'orbit' | 'top') => {
    controls.target.copy(target);
    if (v === 'top') camera.position.set(target.x, 18, target.z + 0.001);
    else camera.position.set(5, 12, 16);
    camera.lookAt(target);
    controls.update();
  };
  setView('orbit');
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
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
    dispose: () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
