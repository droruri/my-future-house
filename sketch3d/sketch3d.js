// ---------------------------------------------------------------------------
// sketch3d — the engine behind the hand-sketch 3D viewers (my-house-3d.html,
// my-bathroom-3d.html). A page only describes its geometry; this module owns
// everything else: renderer, lights, the cut-height slider, plan coordinates,
// walls / floors / labels / dimensions, movable items, navigation (orbit, top,
// point-and-go, locked walk, touch pad), the full-screen sketch viewer, and
// edit mode (select, drag, rotate, save into the page's own #layout block).
//
//   import { createSketch, THREE } from './sketch3d/sketch3d.js';
//   const sk = createSketch({ title, perMetre, plan, height, sketch, view3d, start });
//   sk.hWall(…); sk.addRooms([…]); sk.item('sofa', { name: 'ספה' }, () => sk.box(…));
//   sk.start();
//
// Units: the page picks its world unit with `perMetre` (1 = metres, 100 = cm);
// every option given "in world units" is in that unit. Plan coordinates are
// whatever the sketch is measured in (image pixels, cm…); `plan.scale` turns
// one plan unit into world units, `plan.origin` is the plan point at world 0.
// Plan x runs right (world +X), plan y runs down the sketch (world +Z).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export { THREE, CSS2DObject };

// ---------------------------------------------------------------------------
// Layout block (pure): { id: { x, z, rot? } } — x / z the offset in world units
// from where the code draws the item, rot its extra turn in degrees
// (counter-clockwise seen from above). A bad entry is skipped, never fatal.
// ---------------------------------------------------------------------------
export function parseLayout(text) {
  const entries = new Map(), skipped = [];
  let data;
  try {
    data = JSON.parse(text || '{}');
  } catch {
    return { entries, skipped: ['(unreadable JSON)'] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { entries, skipped: ['(not an object)'] };
  for (const [id, o] of Object.entries(data)) {
    const rot = o?.rot ?? 0;
    if (Number.isFinite(o?.x) && Number.isFinite(o?.z) && Number.isFinite(rot)) entries.set(id, { x: o.x, z: o.z, rot });
    else skipped.push(id);
  }
  return { entries, skipped };
}

// Offsets rounded to 1 cm, turns to 1° within (−180, 180]; untouched items are left out.
export function layoutJson(entries, perMetre) {
  const cm = (v) => Math.round((v * 100) / perMetre) / (100 / perMetre);
  const out = {};
  for (const [id, e] of entries) {
    const x = cm(e.x), z = cm(e.z);
    let rot = Math.round(e.rot ?? 0) % 360;
    if (rot > 180) rot -= 360;
    if (rot <= -180) rot += 360;
    if (x === 0 && z === 0 && rot === 0) continue;
    out[id] = rot === 0 ? { x: x || 0, z: z || 0 } : { x: x || 0, z: z || 0, rot };
  }
  return JSON.stringify(out);
}

const LAYOUT_BLOCK = /(<script type="application\/json" id="layout">)[\s\S]*?(<\/script>)/;

// ---------------------------------------------------------------------------
// Page chrome. Static markup only; everything page-specific is set as text.
// ---------------------------------------------------------------------------
const CHROME = `
<div id="app"></div>
<div id="labels"></div>
<button id="menuBtn" aria-label="תפריט" aria-controls="panel" aria-expanded="false">☰</button>
<div id="pad" aria-label="תנועה">
  <button class="up" data-key="ArrowUp" aria-label="קדימה">▲</button>
  <button class="left" data-key="ArrowLeft" aria-label="שמאלה">◀</button>
  <button class="down" data-key="ArrowDown" aria-label="אחורה">▼</button>
  <button class="right" data-key="ArrowRight" aria-label="ימינה">▶</button>
  <button class="exit" id="padExit" aria-label="יציאה מההליכה">✕</button>
</div>
<div id="panel">
  <h1 id="title"></h1>
  <div class="sub" id="area"></div>
  <div class="group">
    <button id="view3d">תלת-ממד</button>
    <button id="viewTop">מבט על</button>
    <button id="viewGo">הצבע ולך</button>
    <button id="viewWalk">הליכה (עכבר נעול)</button>
  </div>
  <div class="group" id="toggles"></div>
  <label for="cut">גובה חיתוך קירות</label>
  <input id="cut" dir="ltr" type="range" />
  <div class="group"><button id="tEdit" class="wide" aria-pressed="false">✎ מצב עריכה</button></div>
  <div id="editor" hidden>
    <div id="selName"></div>
    <div id="selPos"></div>
    <div class="group">
      <button id="rotL" aria-label="סיבוב 15 מעלות נגד כיוון השעון">↺ 15°</button>
      <button id="rotR" aria-label="סיבוב 15 מעלות עם כיוון השעון">↻ 15°</button>
      <button id="rotL90" aria-label="סיבוב 90 מעלות נגד כיוון השעון">↺ 90°</button>
      <button id="rotR90" aria-label="סיבוב 90 מעלות עם כיוון השעון">↻ 90°</button>
      <button id="deselect" class="wide">ביטול בחירה</button>
    </div>
  </div>
  <div id="pending" hidden>
    <div>פריטים הוזזו או סובבו — לשמור?</div>
    <div class="group">
      <button id="saveLayout">שמירה</button>
      <button id="cancelLayout">ביטול</button>
    </div>
  </div>
  <div id="saveStatus" role="status"></div>
  <div class="hint" id="hint">גרירה — סיבוב המבט · גלגלת — זום לכיוון העכבר · לחצן ימני — הזזה · לחיצה על הרצפה — כניסה לשם · לחיצה כפולה — מרכז סיבוב<br />✎ מצב עריכה: לחיצה על פריט — בחירה · גרירה — הזזה · Q / E — סיבוב 15° (עם Shift — 90°) · Esc — ביטול בחירה · ואז שמירה<br />P — שרטוט במסך מלא (גם בהליכה)<br />הצבע ולך: גרירה — מבט · לחיצה על הרצפה — מעבר לשם · WASD / חצים — תנועה · גלגלת — זום · Shift — מהר · Esc — יציאה<br />הליכה (עכבר נעול): העכבר מסובב את המבט · Esc — חזרה להצבע ולך</div>
  <div class="hint touchHint">גרירה באצבע — סיבוב · צביטה — זום · שתי אצבעות — הזזה · הקשה על הרצפה — כניסה לשם<br />✎ מצב עריכה: הקשה על פריט — בחירה · גרירה — הזזה · כפתורי הסיבוב בתפריט<br />הצבע ולך: גרירה — מבט · הקשה על הרצפה — מעבר לשם · חצים בפינה — תנועה · ✕ — יציאה</div>
</div>
<dialog id="planDlg" aria-label="שרטוט מקורי">
  <div id="planView">
    <div id="planStage"><img id="planImg" alt="השרטוט המקורי" /><div id="planHere" hidden></div></div>
  </div>
  <div id="planBar">
    <button id="planClose" aria-label="סגירה">✕</button>
    <button id="planIn" aria-label="הגדלה">+</button>
    <button id="planOut" aria-label="הקטנה">−</button>
    <button id="planFit">התאמה למסך</button>
  </div>
  <div id="planHint">גלגלת / צביטה — זום · גרירה — הזזה · לחיצה כפולה — זום · P / Esc — סגירה</div>
</dialog>`;

/**
 * @param {object} o
 * @param {string} o.title                      panel heading
 * @param {number} [o.perMetre=1]               world units per metre (1 = metres, 100 = cm)
 * @param {{origin?: [number, number], scale?: number}} [o.plan]  plan → world mapping
 * @param {number} o.height                     wall height (world units)
 * @param {number} [o.doorHead]                 default door head height (world units), 2.1 m
 * @param {number} [o.eye]                      eye height (world units), 1.65 m
 * @param {{src: string, size: [number, number], rect: [number, number, number, number]}} o.sketch
 *        the original drawing: data URL, its pixel size, and the plan rect it covers
 * @param {[number, number, number]} o.view3d   3D-view camera position (world units)
 * @param {{at: [number, number], look: [number, number]}} o.start  "point and go" entry (plan)
 * @param {number} o.shadowExtent               half-width of the sun's shadow box (world units)
 * @param {{hemi?: number, sun?: number, fill?: number}} [o.light]
 * @param {boolean} [o.dimsOn=false]            dimension labels shown at load
 * @param {string[]} [o.notes]                  extra lines for the panel's hint
 */
export function createSketch(o) {
  const U = o.perMetre ?? 1;
  const metres = (v) => v * U;
  const S = o.plan?.scale ?? 1;
  const [OX, OY] = o.plan?.origin ?? [0, 0];
  const H = o.height;
  const DOOR_HEAD = o.doorHead ?? metres(2.1);
  const EYE = o.eye ?? metres(1.65);
  const wx = (x) => (x - OX) * S;                  // plan x → world X
  const wz = (y) => (y - OY) * S;                  // plan y → world Z
  const planX = (X) => X / S + OX;                 // world → plan
  const planY = (Z) => Z / S + OY;
  const toCm = (v) => (v * 100) / U;

  document.body.insertAdjacentHTML('afterbegin', CHROME);
  const $ = (id) => document.getElementById(id);
  document.title ||= o.title;
  $('title').textContent = o.title;
  for (const line of o.notes ?? []) {
    $('hint').append(document.createElement('br'), line);
    $('panel').querySelector('.touchHint').append(document.createElement('br'), line);
  }
  const app = $('app');
  const labelsEl = $('labels');
  const planDlg = $('planDlg');

  // -------------------------------------------------------------------------
  // Scene
  // -------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  app.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer({ element: labelsEl });
  labelRenderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ee);
  scene.fog = new THREE.Fog(0xdfe6ee, metres(40), metres(90));

  const ORBIT_FOV = 45, WALK_FOV = 75, LOCKED_FOV = 90;
  const camera = new THREE.PerspectiveCamera(ORBIT_FOV, window.innerWidth / window.innerHeight, metres(0.05), metres(200));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.zoomToCursor = true;                    // the wheel zooms toward whatever is under the mouse
  controls.minDistance = metres(0.2);              // close enough to inspect a socket or a handle
  controls.maxDistance = metres(50);

  const E = o.shadowExtent;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2cc, o.light?.hemi ?? 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, o.light?.sun ?? 1.8);
  sun.position.set(-0.65 * E, 1.6 * E, -0.85 * E);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -E, right: E, top: E, bottom: -E, near: E * 0.05, far: E * 6 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = metres(0.006);
  scene.add(sun);
  if (o.light?.fill) {                             // soft side light so walls read as white, not grey
    const fill = new THREE.DirectionalLight(0xffffff, o.light.fill);
    fill.position.set(E, 0.6 * E, 1.5 * E);
    scene.add(fill);
  }

  // "Cut height" slider: keeps everything below `constant`.
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), H + metres(0.1));

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, clippingPlanes: [cutPlane], clipShadows: true, ...extra });
  const MAT = {
    wall: mat(0xf7f5f0, { side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, clippingPlanes: [cutPlane], depthWrite: false }),
  };

  // Canvas texture for a surface whose UVs are world units (extruded floors): a canvas
  // covering w × h world units repeats every w × h.
  function worldTexture(canvas, w, h) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / w, 1 / h);
    tex.anisotropy = 8;
    return tex;
  }

  // Where box() and the page's own helpers put meshes: the item being built, else `fallback`.
  let building = null;
  const target = (fallback = scene) => building ?? fallback;

  // Axis-aligned box spanning plan rect [x1,x2]×[y1,y2] and heights [h0,h1] (world units).
  function box(x1, y1, x2, y2, h0, h1, material, parent = target()) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x2 - x1) * S, h1 - h0, Math.abs(y2 - y1) * S), material);
    m.position.set(wx((x1 + x2) / 2), (h0 + h1) / 2, wz((y1 + y2) / 2));
    m.castShadow = !material.transparent;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // -------------------------------------------------------------------------
  // Walls. segment(rect, kind, o, material): kind wall | door (o.head) | window
  // (o.sill, o.head, a glass pane between) | glass (an opening closed by glass the
  // page draws itself: label only). hWall / vWall: a wall t plan units thick
  // centred on a horizontal / vertical plan line. Every piece gets its length in cm
  // on top (the dimensions toggle); stubs under 20 cm stay unlabelled.
  // -------------------------------------------------------------------------
  const walls = new THREE.Group();
  scene.add(walls);
  const dims = new THREE.Group();
  dims.visible = false;
  scene.add(dims);
  const DIM_PREFIX = { wall: '', door: 'פתח ', window: 'חלון ', glass: 'דלת זכוכית ' };
  function dimLabel([x1, y1, x2, y2], kind) {
    const isH = Math.abs(x2 - x1) > Math.abs(y2 - y1);
    const cm = Math.round(toCm(Math.abs(isH ? x2 - x1 : y2 - y1) * S));
    if (cm < 20) return;
    const el = document.createElement('div');       // CSS2DRenderer owns this one's transform,
    el.className = 'dimw';                          // so the vertical turn goes on the inner tag
    const tag = el.appendChild(document.createElement('span'));
    tag.className = `dim ${kind} ${isH ? 'h' : 'v'}`;
    tag.textContent = `${DIM_PREFIX[kind] ?? ''}${cm}`;
    const label = new CSS2DObject(el);
    label.position.set(wx((x1 + x2) / 2), H, wz((y1 + y2) / 2));
    dims.add(label);
  }
  function segment(rect, kind = 'wall', opts = {}, material = MAT.wall) {
    const [x1, y1, x2, y2] = rect;
    dimLabel(rect, kind);
    const add = (h0, h1) => box(x1, y1, x2, y2, h0, h1, material, walls);
    if (kind === 'wall') add(0, H);
    else if (kind === 'door') add(opts.head ?? DOOR_HEAD, H);
    else if (kind === 'window') {
      if (opts.sill > 0) add(0, opts.sill);
      add(opts.head, H);
      const half = metres(0.01) / S;               // the pane is 2 cm thick, centred in the wall
      const isH = Math.abs(x2 - x1) > Math.abs(y2 - y1);
      const gx = isH ? [x1, x2] : [(x1 + x2) / 2 - half, (x1 + x2) / 2 + half];
      const gy = isH ? [(y1 + y2) / 2 - half, (y1 + y2) / 2 + half] : [y1, y2];
      box(gx[0], gy[0], gx[1], gy[1], opts.sill, opts.head, MAT.glass, walls);
    }
  }
  const hWall = (y, x1, x2, t, kind = 'wall', opts = {}, m = MAT.wall) => segment([x1, y - t / 2, x2, y + t / 2], kind, opts, m);
  const vWall = (x, y1, y2, t, kind = 'wall', opts = {}, m = MAT.wall) => segment([x - t / 2, y1, x + t / 2, y2], kind, opts, m);

  // -------------------------------------------------------------------------
  // Floors and labels
  // -------------------------------------------------------------------------
  const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
  const polyArea = (p) => Math.abs(p.reduce((s, [x, y], i) => {
    const [nx, ny] = p[(i + 1) % p.length] ?? p[0];
    return s + x * ny - nx * y;
  }, 0)) / 2;
  const centroid = (p) => p.reduce(([sx, sy], [x, y]) => [sx + x / p.length, sy + y / p.length], [0, 0]);

  // Room-style label at plan point `at`: a bold name and an optional smaller line.
  function label(name, { sub, cls = '', at, h = metres(0.05) } = {}) {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    el.appendChild(document.createElement('b')).textContent = name;
    if (sub) el.appendChild(document.createElement('span')).textContent = sub;
    const obj = new CSS2DObject(el);
    obj.position.set(wx(at[0]), h, wz(at[1]));
    scene.add(obj);
    return el;
  }

  // rooms: [{ name, poly: [[x, y]…] (plan), mat, at?, kind?: 'outside' | 'common', noArea?,
  // drop? (floor top below 0, world units), size? (text after the area) }]. Each floor is a
  // `slab`-thick extrusion topped at −drop. Returns the area (m²) of rooms without a kind.
  function addRooms(rooms, { slab = metres(0.05) } = {}) {
    let interior = 0;
    for (const r of rooms) {
      const shape = new THREE.Shape(r.poly.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);                     // shape XY → world XZ, extruded upward
      const floor = new THREE.Mesh(geo, r.mat);
      floor.position.y = -slab - (r.drop ?? 0);
      floor.receiveShadow = true;
      scene.add(floor);
      const area = (polyArea(r.poly) * S * S) / (U * U);
      if (!r.kind) interior += area;
      const sub = r.noArea ? undefined : `≈ ${area.toFixed(area < 10 ? 2 : 1)} מ"ר${r.size ? ` · ${r.size}` : ''}`;
      label(r.name, { sub, cls: r.kind ?? '', at: r.at ?? centroid(r.poly) });
    }
    return interior;
  }

  // -------------------------------------------------------------------------
  // Items: free-standing pieces that can be selected, dragged and turned in edit mode.
  //   item(id, build)                            build in world/plan coordinates
  //   item(id, { name, at, rot, tag, tagAt }, build)
  // `at` (plan point) and `rot` (degrees; 0 faces plan south, 90 east) place a local
  // frame for build(); `tag` is a size label at local point `tagAt`, shown with the
  // dimensions. Inside build(), box() and target() add to the item.
  // Structure: outer (at the footprint centre: offset + turn) → inner (−centre) → local.
  // -------------------------------------------------------------------------
  const furniture = new THREE.Group();
  scene.add(furniture);
  const items = new Map();                         // id → outer group
  const tags = [];
  function item(id, opts, build) {
    if (typeof opts === 'function') { build = opts; opts = {}; }
    if (items.has(id)) throw new Error(`sketch3d: duplicate item id "${id}"`);
    const outer = new THREE.Group(), inner = new THREE.Group(), local = new THREE.Group();
    const pivot = new THREE.Vector3();
    outer.userData = { itemId: id, name: opts.name ?? opts.tag ?? id, pivot };
    if (opts.at) local.position.set(wx(opts.at[0]), 0, wz(opts.at[1]));
    local.rotation.y = THREE.MathUtils.degToRad(opts.rot ?? 0);
    outer.add(inner);
    inner.add(local);
    furniture.add(outer);
    building = local;
    try { build(); } finally { building = null; }
    if (opts.tag) {
      const el = document.createElement('div');
      el.className = 'tag';
      el.textContent = opts.tag;
      const tag = new CSS2DObject(el);
      tag.position.set(...(opts.tagAt ?? [0, 0, 0]));
      tag.visible = dims.visible;
      local.add(tag);
      tags.push(tag);
    }
    const bounds = new THREE.Box3().setFromObject(local);
    if (!bounds.isEmpty()) {
      const c = bounds.getCenter(new THREE.Vector3());
      pivot.set(c.x, 0, c.z);
    }
    outer.position.copy(pivot);
    inner.position.copy(pivot).negate();
    items.set(id, outer);
    return outer;
  }

  // Groups that stop the walker (raycasts ignore .visible; hidden ones are skipped).
  const solids = [walls, furniture];
  const solid = (group) => { solids.push(group); };

  // -------------------------------------------------------------------------
  // The original sketch: overlay on the floor (toggle) and the full-screen viewer.
  // -------------------------------------------------------------------------
  const [PW, PH] = o.sketch.size;
  const [RX1, RY1, RX2, RY2] = o.sketch.rect;
  const planTex = new THREE.TextureLoader().load(o.sketch.src);
  planTex.colorSpace = THREE.SRGBColorSpace;
  const plan = new THREE.Mesh(
    new THREE.PlaneGeometry((RX2 - RX1) * S, (RY2 - RY1) * S),
    new THREE.MeshBasicMaterial({ map: planTex, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  plan.rotation.x = -Math.PI / 2;
  plan.position.set(wx((RX1 + RX2) / 2), metres(0.02), wz((RY1 + RY2) / 2));
  plan.visible = false;
  scene.add(plan);

  // -------------------------------------------------------------------------
  // Panel toggles
  // -------------------------------------------------------------------------
  function button(text, onClick, { wide = false } = {}) {
    const btn = document.createElement('button');
    btn.textContent = text;
    if (wide) btn.className = 'wide';
    btn.onclick = onClick;
    $('toggles').appendChild(btn);
    return btn;
  }
  // An on/off button; apply(on) runs now with the initial state and on every press.
  function toggle(text, on, apply, opts) {
    const btn = button(text, () => {
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(next));
      apply(next);
    }, opts);
    btn.setAttribute('aria-pressed', String(on));
    apply(on);
    return btn;
  }
  toggle('שמות חדרים', true, (on) => labelsEl.classList.toggle('hidden', !on));

  // -------------------------------------------------------------------------
  // Navigation, after vr-interior.oaksun.studio. Three modes:
  //  - Orbit (3D / top view): OrbitControls. A disc follows the mouse over the floor; a click
  //    there flies you inside, to eye height just short of the disc, facing the way you looked.
  //  - Point and go (inside): drag to look, click the floor to glide there, keys walk.
  //  - Locked walk: the same, with the mouse captured (pointer lock) for looking.
  // Esc steps back one mode. Every change of place is a ~1 s flight: the eye eases out
  // cubically, the gaze eases out exponentially so it settles before the eye arrives.
  // -------------------------------------------------------------------------
  const VIEW_3D = new THREE.Vector3(...o.view3d);
  const BACK = Math.hypot(VIEW_3D.x, VIEW_3D.z);
  const FLY_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000;
  const ORIGIN = new THREE.Vector3();
  let walking = false;
  let flight = null;                    // { from, to, gazeFrom, gazeTo, fovFrom, fovTo, t0, ms, done }
  const gaze = new THREE.Vector3();
  const facing = new THREE.Vector3();

  function pressView(id) {
    for (const b of ['view3d', 'viewTop', 'viewGo', 'viewWalk']) $(b).setAttribute('aria-pressed', String(b === id));
  }
  function heading() {                  // horizontal unit vector the camera looks along
    camera.getWorldDirection(facing).setY(0);
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, -1);
    return facing.normalize();
  }
  // Start a flight. Call it before switching `walking`: the gaze starts where the camera looks
  // now (the orbit centre outside, 2 m ahead inside). gazeTo = null keeps the look direction.
  function fly(to, gazeTo, fov, done, ms = FLY_MS) {
    camera.getWorldDirection(gaze).multiplyScalar(walking ? metres(2) : camera.position.distanceTo(controls.target)).add(camera.position);
    flight = { from: camera.position.clone(), to, gazeFrom: gaze.clone(), gazeTo, fovFrom: camera.fov, fovTo: fov, t0: performance.now(), ms: FLY_MS && ms, done };
    controls.enabled = false;
    marker.visible = false;
  }
  function flightStep(now) {
    const f = flight;
    const t = f.ms ? Math.min((now - f.t0) / f.ms, 1) : 1;
    const ease = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(f.from, f.to, ease);
    if (f.gazeTo) camera.lookAt(gaze.lerpVectors(f.gazeFrom, f.gazeTo, t === 1 ? 1 : 1 - 2 ** (-10 * t)));
    camera.fov = f.fovFrom + (f.fovTo - f.fovFrom) * ease;
    camera.updateProjectionMatrix();
    if (t === 1) { flight = null; f.done?.(); }
  }
  function toOrbit(position, id) {
    const target = ORIGIN.clone();
    fly(position, target, ORBIT_FOV, () => { controls.target.copy(target); controls.enabled = true; controls.update(); });
    exitWalk();
    pressView(id);
  }
  function setView(top) {
    toOrbit(top ? new THREE.Vector3(0, VIEW_3D.length() * 1.1, metres(0.01)) : VIEW_3D.clone(), top ? 'viewTop' : 'view3d');
  }
  function leaveWalk() {                // back outside, behind the model as you were facing
    toOrbit(heading().multiplyScalar(-BACK).setY(VIEW_3D.y), 'view3d');
  }
  $('view3d').onclick = () => setView(false);
  $('viewTop').onclick = () => setView(true);

  const pick = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function rayAt(e) {                   // aim `pick` through the mouse position
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pick.setFromCamera(pointer, camera);
  }
  const shown = (obj) => { for (; obj; obj = obj.parent) if (!obj.visible) return false; return true; };
  // First surface actually seen: shown, and not cut away by the cut height.
  const seen = (h) => h.point.y <= cutPlane.constant && shown(h.object);

  // Outside: double-click a surface to orbit around that point.
  let goTimer = 0;                      // a single click on the floor waits out a possible double click
  renderer.domElement.addEventListener('dblclick', (e) => {
    clearTimeout(goTimer);
    if (walking || flight) return;
    rayAt(e);
    const hit = pick.intersectObjects(scene.children, true).find(seen);
    if (hit) { controls.target.copy(hit.point); controls.update(); }
  });

  // The floor point under the mouse you could stand on, or null: the first surface seen that
  // isn't see-through (glass, rails, the sketch overlay) must face up within 5 cm of floor level
  // (a rug, a sunken shower or balcony — not a seat, a table or the ground far below).
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  function floorAt(e) {
    rayAt(e);
    const hit = pick.intersectObjects(scene.children, true).find((h) => seen(h) && !h.object.material?.transparent);
    if (!hit?.face || Math.abs(hit.point.y) > metres(0.05)) return null;
    normal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
    return normal.y > 0.7 ? hit.point : null;
  }
  const marker = new THREE.Mesh(
    new THREE.CircleGeometry(metres(0.15), 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.raycast = () => {};            // never picked itself
  marker.visible = false;
  scene.add(marker);

  // Inside: first person at eye height, keys move; the mouse looks by dragging, or captured.
  const BODY = metres(0.2);             // how close you can get to a wall
  const walk = new PointerLockControls(camera, document.body);
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const cutEl = $('cut');
  Object.assign(cutEl, { min: String(metres(0.3)), max: String(H), step: String(metres(0.05)), value: String(H) });
  function setCut(value) {
    cutPlane.constant = value >= H ? H + metres(0.1) : value;
    dims.position.y = Math.min(value, H) - H;      // wall lengths sit on the cut wall tops
  }
  cutEl.oninput = () => setCut(Number(cutEl.value));

  const plan3 = ([x, y], h = EYE) => new THREE.Vector3(wx(x), h, wz(y));
  function enterWalk(at, lookAt) {
    setEditing(false);
    fly(at, lookAt, WALK_FOV);
    walking = true;
    cutEl.value = String(H);
    setCut(H);                                       // full-height walls while inside
    labelsEl.classList.add('walking');
    document.body.classList.add('walking');
    pressView(walk.isLocked ? 'viewWalk' : 'viewGo');
  }
  function exitWalk() {
    if (!walking) return;
    walking = false;
    keys.clear();
    if (walk.isLocked) walk.unlock();
    labelsEl.classList.remove('walking');
    document.body.classList.remove('walking');
  }
  function enterStart() {
    if (!walking) enterWalk(plan3(o.start.at), plan3(o.start.look));
  }
  // Outside, a floor click lands just short of the disc looking ahead; inside it glides there.
  function goTo(at) {
    if (!walking) {
      const ahead = heading();
      const stand = new THREE.Vector3(at.x, EYE, at.z);
      enterWalk(stand.clone().addScaledVector(ahead, -metres(0.5)), stand.addScaledVector(ahead, metres(1.5)));
      return;
    }
    const step = new THREE.Vector3(at.x - camera.position.x, 0, at.z - camera.position.z);
    const stop = Math.min(metres(0.5), step.length());
    fly(new THREE.Vector3(at.x, EYE, at.z).addScaledVector(step.normalize(), -stop), null, camera.fov);
  }
  $('viewGo').onclick = () => {
    if (walk.isLocked) walk.unlock();   // the unlock handler presses this button
    else enterStart();
  };
  $('viewWalk').onclick = () => {
    enterStart();
    walk.lock();                        // needs this click's user gesture; if refused, point and go stays
  };
  function setLens(fov) {               // ease the lens over 0.5 s, or retarget a flight under way
    if (flight) flight.fovTo = fov;
    else fly(camera.position.clone(), null, fov, null, 500);
  }
  walk.addEventListener('lock', () => { pressView('viewWalk'); setLens(LOCKED_FOV); });
  walk.addEventListener('unlock', () => {  // Esc while captured
    if (!walking) return;
    pressView('viewGo');
    setLens(WALK_FOV);
  });
  // Wheel while walking zooms the lens (narrower field of view), not the body.
  renderer.domElement.addEventListener('wheel', (e) => {
    if (!walking || flight) return;
    e.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.001)), 15, 90);
    camera.updateProjectionMatrix();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && walking && !walk.isLocked && !flight && !planDlg.open) leaveWalk();
  });

  // A press that moves more than 3 px is a drag (look, orbit, move an item), not a click.
  // Deltas come from the last position, not movementX/Y, which touch pointers may not report.
  const press = { x: 0, y: 0, lastX: 0, lastY: 0, moved: false };
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    Object.assign(press, { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false });
    marker.visible = false;
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!e.isPrimary) return;
    const dx = e.clientX - press.lastX, dy = e.clientY - press.lastY;
    press.lastX = e.clientX; press.lastY = e.clientY;
    if (e.buttons && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 3) press.moved = true;
    if (flight || drag || walk.isLocked) return;
    if (e.buttons) {                    // drag the view: 0.0013 rad/px (touch: 0.004), pitch within ±60°
      if (walking && e.buttons === 1 && press.moved) {
        const k = e.pointerType === 'touch' ? 0.004 : 0.0013;
        look.setFromQuaternion(camera.quaternion);
        look.y += dx * k;
        look.x = THREE.MathUtils.clamp(look.x + dy * k, -Math.PI / 3, Math.PI / 3);
        camera.quaternion.setFromEuler(look);
      }
      return;
    }
    if (e.pointerType === 'touch' || editing) return;   // no hover disc for fingers or while editing
    const at = floorAt(e);
    marker.visible = at !== null;
    if (!at) return;
    marker.position.set(at.x, at.y + metres(0.01), at.z);
    marker.scale.setScalar(Math.max(1, camera.position.distanceTo(at) / metres(5)));   // same size on screen from afar
  });
  renderer.domElement.addEventListener('pointerleave', () => { marker.visible = false; });
  renderer.domElement.addEventListener('click', (e) => {
    if (flight || press.moved || walk.isLocked) return;
    if (editing) {                      // a click on nothing drops the selection
      if (!pressedItem) select(null);
      return;
    }
    const at = floorAt(e);
    if (!at) return;
    clearTimeout(goTimer);
    if (walking) goTo(at);
    else goTimer = setTimeout(() => goTo(at), 250);
  });

  const probe = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const axisDir = new THREE.Vector3();
  function blocked(axis, sign, reach) {
    axisDir.set(axis === 'x' ? sign : 0, 0, axis === 'z' ? sign : 0);
    probe.far = reach;
    for (const y of [EYE, metres(0.3)]) {   // head height (walls, glass) and knee height (sills, rails, beds, counters)
      probe.set(origin.set(camera.position.x, y, camera.position.z), axisDir);
      if (probe.intersectObjects(solids, true).some((h) => shown(h.object))) return true;
    }
    return false;
  }
  const fwd = new THREE.Vector3(), side = new THREE.Vector3(), move = new THREE.Vector3();
  function walkStep(dt) {
    if (planDlg.open) return;           // keys go to the sketch viewer meanwhile
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    side.crossVectors(fwd, camera.up);
    move.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(fwd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(fwd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(side);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(side);
    if (move.lengthSq() === 0) return;
    const speed = metres(keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1.4);   // per second
    move.normalize().multiplyScalar(speed * dt);
    // Move each axis separately so you slide along a wall instead of sticking to it.
    for (const axis of ['x', 'z']) {
      const d = move[axis];
      if (d !== 0 && !blocked(axis, Math.sign(d), Math.abs(d) + BODY)) camera.position[axis] += d;
    }
  }

  // Mobile menu: the panel folds behind ☰ on narrow screens; picking a view folds it again.
  const panelEl = $('panel');
  const menuBtn = $('menuBtn');
  function setMenu(open) {
    panelEl.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? '✕' : '☰';
  }
  menuBtn.onclick = () => setMenu(!panelEl.classList.contains('open'));
  for (const id of ['view3d', 'viewTop', 'viewGo']) $(id).addEventListener('click', () => setMenu(false));

  // Touch walk pad: holding an arrow is holding that key; ✕ steps back outside like Esc.
  for (const btn of document.querySelectorAll('#pad [data-key]')) {
    const code = btn.dataset.key;
    if (!code) continue;
    const up = () => keys.delete(code);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(code); });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);   // touch pointers are captured to the button implicitly
    btn.addEventListener('contextmenu', (e) => e.preventDefault());   // long-press menu
  }
  $('padExit').onclick = () => { if (walking && !flight) leaveWalk(); };

  // -------------------------------------------------------------------------
  // Full-screen sketch viewer, from any view (P key or button). The image is drawn at its
  // pixel size, so stage pixels are image pixels; `view` maps them to the screen. In walk
  // mode a dot marks where you stand, and closing it returns you to the walk.
  // -------------------------------------------------------------------------
  const planView = $('planView');
  const planStage = $('planStage');
  const planHere = $('planHere');
  const planImg = $('planImg');
  planImg.src = o.sketch.src;
  planImg.style.width = `${PW}px`;
  planImg.style.height = `${PH}px`;
  const view = { s: 1, x: 0, y: 0 };
  function drawPlan() { planStage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`; }
  function fitPlan() {
    const w = planView.clientWidth, h = planView.clientHeight;
    view.s = Math.min(w / PW, h / PH) * 0.95;
    view.x = (w - PW * view.s) / 2;
    view.y = (h - PH * view.s) / 2;
    drawPlan();
  }
  function zoomPlan(f, cx, cy) {        // scale by f, keeping screen point (cx, cy) fixed
    const s = THREE.MathUtils.clamp(view.s * f, 0.1, 12);
    view.x = cx - ((cx - view.x) * s) / view.s;
    view.y = cy - ((cy - view.y) * s) / view.s;
    view.s = s;
    drawPlan();
  }
  const centre = () => [planView.clientWidth / 2, planView.clientHeight / 2];
  let relock = false;                   // the locked walk resumes when the viewer closes
  function openPlan() {
    if (planDlg.open) return;
    keys.clear();
    relock = walk.isLocked;
    planHere.hidden = !walking;
    if (walking) {
      planHere.style.left = `${((planX(camera.position.x) - RX1) / (RX2 - RX1)) * PW}px`;
      planHere.style.top = `${((planY(camera.position.z) - RY1) / (RY2 - RY1)) * PH}px`;
    }
    planDlg.showModal();
    fitPlan();
    if (relock) walk.unlock();          // free the mouse; the walk goes on as point and go meanwhile
  }
  planDlg.addEventListener('close', () => {
    keys.clear();
    if (walking && relock) walk.lock(); // back to the locked walk (point and go if refused)
  });
  $('planClose').onclick = () => planDlg.close();
  $('planFit').onclick = fitPlan;
  $('planIn').onclick = () => zoomPlan(1.4, ...centre());
  $('planOut').onclick = () => zoomPlan(1 / 1.4, ...centre());
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (planDlg.open) planDlg.close(); else openPlan();
  });
  planView.addEventListener('wheel', (e) => {   // trackpad pinch arrives as ctrl+wheel
    e.preventDefault();
    zoomPlan(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  }, { passive: false });
  planView.addEventListener('dblclick', (e) => zoomPlan(2, e.clientX, e.clientY));
  // One pointer pans; two (touch) pinch-zoom around their midpoint.
  const touches = new Map();            // pointerId → last { x, y }
  const gap = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  planView.addEventListener('pointerdown', (e) => {
    planView.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    planView.classList.add('panning');
  });
  planView.addEventListener('pointermove', (e) => {
    const last = touches.get(e.pointerId);
    if (!last) return;
    const before = gap();
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 1) { view.x += dx; view.y += dy; drawPlan(); return; }
    const [a, b] = [...touches.values()];
    if (a && b && before > 0) zoomPlan(gap() / before, (a.x + b.x) / 2, (a.y + b.y) / 2);
  });
  const release = (e) => {
    touches.delete(e.pointerId);
    if (touches.size === 0) planView.classList.remove('panning');
  };
  planView.addEventListener('pointerup', release);
  planView.addEventListener('pointercancel', release);

  // -------------------------------------------------------------------------
  // Edit mode: click an item to select it (outlined), drag it across the floor, turn it
  // with Q / E or the panel buttons. Changes wait in `pending` until saved into the
  // #layout block of this very page (so they are there on the next load) or cancelled.
  // Viewing never moves anything: outside edit mode, drags only move the camera.
  // -------------------------------------------------------------------------
  const editBtn = $('tEdit');
  const editorEl = $('editor');
  const selNameEl = $('selName');
  const selPosEl = $('selPos');
  const pendingEl = $('pending');
  const statusEl = $('saveStatus');
  const pending = new Map();            // item → { pos, rot } before its first unsaved change
  const outline = new THREE.BoxHelper(undefined, 0xf59e0b);
  outline.material.depthTest = false;   // seen through walls too
  outline.renderOrder = 999;
  outline.raycast = () => {};
  outline.visible = false;
  scene.add(outline);
  let editing = false;
  let selected = null;
  let pressedItem = false;              // the last press landed on an item (so its click keeps it)

  function setEditing(on) {
    editing = on;
    editBtn.setAttribute('aria-pressed', String(on));
    editorEl.hidden = !on;
    document.body.classList.toggle('editing', on);
    marker.visible = false;
    if (!on) select(null);
    else showSelection();
  }
  editBtn.onclick = () => {
    if (!editing && walking) leaveWalk();   // items are edited from outside
    setEditing(!editing);
  };
  function select(group) {
    selected = group;
    outline.visible = group !== null;
    if (group) outline.setFromObject(group);
    showSelection();
  }
  // Numbers isolated left-to-right, so a sign stays in front of its number inside RTL text.
  const ltr = (s) => `⁦${s}⁩`;
  const signed = (v) => ltr(v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
  function showSelection() {
    for (const id of ['rotL', 'rotR', 'rotL90', 'rotR90', 'deselect']) $(id).disabled = !selected;
    if (!selected) {
      selNameEl.textContent = 'לחצו על פריט כדי לבחור אותו';
      selPosEl.textContent = '';
      return;
    }
    const { name, pivot } = selected.userData;
    const dx = Math.round(toCm(selected.position.x - pivot.x)), dz = Math.round(toCm(selected.position.z - pivot.z));
    const deg = Math.round(THREE.MathUtils.radToDeg(selected.rotation.y));
    selNameEl.textContent = name;
    selPosEl.textContent = `הזזה: ${signed(dx)} · ${signed(dz)} ס"מ · סיבוב: ${signed(deg)}°`;
  }
  function remember(group, pos = group.position, rot = group.rotation.y) {
    if (!pending.has(group)) pending.set(group, { pos: pos.clone(), rot });
    pendingEl.hidden = false;
    statusEl.textContent = '';
  }
  function turn(deg) {
    if (!selected) return;
    remember(selected);
    const r = selected.rotation.y + THREE.MathUtils.degToRad(deg);
    selected.rotation.y = Math.atan2(Math.sin(r), Math.cos(r));   // keep it in (−180°, 180°]
    outline.update();
    showSelection();
  }
  $('rotL').onclick = () => turn(15);
  $('rotR').onclick = () => turn(-15);
  $('rotL90').onclick = () => turn(90);
  $('rotR90').onclick = () => turn(-90);
  $('deselect').onclick = () => select(null);
  window.addEventListener('keydown', (e) => {
    if (!editing || planDlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyQ' || e.code === 'KeyE') turn((e.code === 'KeyQ' ? 1 : -1) * (e.shiftKey ? 90 : 15));
    else if (e.code === 'Escape') select(null);
  });

  const dragPlane = new THREE.Plane();
  const UP = new THREE.Vector3(0, 1, 0);
  const grab = new THREE.Vector3();
  const onPlane = new THREE.Vector3();
  let drag = null;                      // { group, start, pointerId }

  // Capture phase on the container runs before OrbitControls' listener on the canvas, so a
  // press on an item turns orbiting off for that gesture.
  app.addEventListener('pointerdown', (e) => {
    pressedItem = false;
    if (!editing || walking || flight || e.button !== 0) return;
    rayAt(e);
    const hit = pick.intersectObjects([walls, furniture], true).find(seen);   // walls block
    let group = hit?.object;
    while (group && !group.userData.itemId) group = group.parent;
    if (!hit || !group) return;
    pressedItem = true;
    select(group);
    controls.enabled = false;
    dragPlane.setFromNormalAndCoplanarPoint(UP, hit.point);
    grab.copy(group.position).sub(hit.point);
    drag = { group, start: group.position.clone(), pointerId: e.pointerId };
    renderer.domElement.setPointerCapture(e.pointerId);
    document.body.classList.add('dragging');
  }, { capture: true });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    rayAt(e);
    if (!pick.ray.intersectPlane(dragPlane, onPlane)) return;   // ray parallel to / away from the floor
    drag.group.position.x = onPlane.x + grab.x;
    drag.group.position.z = onPlane.z + grab.z;
    outline.update();
    showSelection();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { group, start } = drag;
    drag = null;
    controls.enabled = true;
    document.body.classList.remove('dragging');
    if (group.position.distanceTo(start) < metres(0.001)) return;   // a click, not a move
    remember(group, start);
  }
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  $('cancelLayout').onclick = () => {
    for (const [group, { pos, rot }] of pending) { group.position.copy(pos); group.rotation.y = rot; }
    pending.clear();
    pendingEl.hidden = true;
    statusEl.textContent = '';
    if (selected) outline.update();
    showSelection();
  };

  function currentLayout() {
    const entries = new Map();
    for (const [id, g] of items) {
      const { pivot } = g.userData;
      entries.set(id, { x: g.position.x - pivot.x, z: g.position.z - pivot.z, rot: THREE.MathUtils.radToDeg(g.rotation.y) });
    }
    return layoutJson(entries, U);
  }

  // Writing back into the HTML needs the File System Access API (Chrome / Edge). The file
  // handle is kept in IndexedDB (one database per page) so the file is picked only once;
  // after a reload the browser asks once more for write permission.
  const FILE = decodeURIComponent(location.pathname.split('/').pop() || '');
  function idb(mode, op) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(FILE.replace(/\.html?$/, '') || 'sketch3d', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('handles');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const req = op(db.transaction('handles', mode).objectStore('handles'));
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
      };
    });
  }
  let fileHandle = null;
  async function getFileHandle() {
    if (fileHandle) return fileHandle;
    try {
      const stored = await idb('readonly', (s) => s.get('html'));
      if (stored instanceof FileSystemFileHandle) fileHandle = stored;
    } catch (err) {
      console.warn('layout: no stored file handle', err);
    }
    if (!fileHandle) {
      [fileHandle] = await window.showOpenFilePicker({ types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }] });
      idb('readwrite', (s) => s.put(fileHandle, 'html')).catch((err) => console.warn('layout: handle not remembered', err));
    }
    return fileHandle;
  }
  function forgetFileHandle() {
    fileHandle = null;
    idb('readwrite', (s) => s.delete('html')).catch((err) => console.warn('layout: handle not forgotten', err));
  }
  const saveBtn = $('saveLayout');
  saveBtn.onclick = async () => {
    if (!('showOpenFilePicker' in window)) {
      statusEl.textContent = 'שמירה לקובץ דורשת Chrome או Edge';
      return;
    }
    saveBtn.disabled = true;
    statusEl.textContent = 'שומר…';
    try {
      const handle = await getFileHandle();
      if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted'
        && await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        statusEl.textContent = 'אין הרשאה לכתוב לקובץ — לא נשמר';
        return;
      }
      const text = await (await handle.getFile()).text();   // fresh copy: keeps any edits made on disk
      if (!LAYOUT_BLOCK.test(text) || (FILE && handle.name !== FILE)) {
        forgetFileHandle();
        statusEl.textContent = `זה לא הקובץ הנכון — בחרו את ${FILE || 'קובץ הדף'}`;
        return;
      }
      const json = currentLayout();
      const out = await handle.createWritable();
      await out.write(text.replace(LAYOUT_BLOCK, (_, open, close) => open + json + close));
      await out.close();
      pending.clear();
      pendingEl.hidden = true;
      statusEl.textContent = `נשמר בקובץ ${handle.name}`;
    } catch (err) {
      if (err?.name === 'AbortError') statusEl.textContent = 'לא נבחר קובץ — לא נשמר';
      else {
        console.error('layout: save failed', err);
        statusEl.textContent = 'השמירה נכשלה — פרטים בקונסול';
      }
    } finally {
      saveBtn.disabled = false;
    }
  };

  // -------------------------------------------------------------------------
  // Start: the built-in toggles go after the page's own, the saved layout is applied,
  // and the render loop runs the page's per-frame hooks.
  // -------------------------------------------------------------------------
  const frameHooks = [];
  const clock = new THREE.Clock();
  function start() {
    toggle('שרטוט על הרצפה', false, (on) => { plan.visible = on; });
    toggle('מידות (ס"מ)', o.dimsOn ?? false, (on) => { dims.visible = on; for (const t of tags) t.visible = on; });
    button('שרטוט במסך מלא (P)', () => { setMenu(false); openPlan(); }, { wide: true });

    const { entries, skipped } = parseLayout($('layout')?.textContent ?? '{}');
    for (const [id, { x, z, rot }] of entries) {
      const g = items.get(id);
      if (!g) { skipped.push(id); continue; }
      const { pivot } = g.userData;
      g.position.set(pivot.x + x, 0, pivot.z + z);
      g.rotation.y = THREE.MathUtils.degToRad(rot);
    }
    if (skipped.length) console.warn('layout: skipped entries', skipped);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
    });
    camera.position.copy(VIEW_3D);
    controls.update();
    pressView('view3d');
    showSelection();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      if (flight) flightStep(performance.now());
      else if (walking) walkStep(dt);
      else controls.update();
      for (const hook of frameHooks) hook(dt, clock.elapsedTime);
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    });
  }

  return {
    scene, camera, renderer, cutPlane,
    perMetre: U, height: H, wx, wz,
    mat, MAT, worldTexture,
    box, segment, hWall, vWall, walls, dims,
    rect, addRooms, label, setSubtitle: (text) => { $('area').textContent = text; },
    furniture, item, items, target, solid,
    toggle, onFrame: (hook) => { frameHooks.push(hook); },
    start,
  };
}
