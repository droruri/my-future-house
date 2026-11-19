import * as THREE from 'three';
import type { House } from './house';

/** Build the 3D group for a house: wall boxes with real thickness, room floors. */
export function buildHouse(house: House): THREE.Group {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2efe9 });
  for (const w of house.walls) {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const len = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, w.height, w.thickness), wallMat);
    mesh.position.set((w.a.x + w.b.x) / 2, w.height / 2, (w.a.z + w.b.z) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    group.add(mesh);
  }
  for (const r of house.rooms) {
    // Shape lives in the XY plane; rotating -90° about X maps shape y -> world -z, so negate.
    const shape = new THREE.Shape(r.polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
    const color = r.kind === 'balcony' ? 0xb8c4b0 : r.kind === 'wet' ? 0xa9c4d6 : 0xd9c7a8;
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
  }
  return group;
}

/** Mount a renderer into `el`; returns a dispose function. */
export function mountScene(el: HTMLElement, house: House): () => void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f5);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(8, 15, 5);
  scene.add(sun);
  const built = buildHouse(house);
  scene.add(built);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(5, 12, 16);
  camera.lookAt(5, 0, 3);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  el.appendChild(renderer.domElement);
  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  return () => {
    ro.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
