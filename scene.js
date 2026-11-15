/**
 * ICHEY — single-scene gift box launch (Three.js r170, MIT).
 * One box: logo, name, LAUNCHING SOON, and gifts emerge from the same opening.
 */

import * as THREE from "./assets/vendor/three.module.min.js";
import { GLTFLoader } from "./assets/vendor/loaders/GLTFLoader.js";
import { KTX2Loader } from "./assets/vendor/loaders/KTX2Loader.js";

const canvas = document.getElementById("ichey-canvas");
const openBtn = document.getElementById("gift-open-btn");
const confettiRoot = document.getElementById("ambient-confetti");
const flashOverlay = document.getElementById("flash-overlay");
const storeDock = document.querySelector("[data-store-dock]");
const body = document.body;

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const isNarrow = window.matchMedia("(max-width: 768px)").matches;

const OPENING_Y = 1.02;

const SANTA = {
  walkStart: 0.85,
  walkDuration: 4.35,
  approachDuration: 1.15,
  pauseBeforeOpen: 0.75,
  openDuration: 1.75,
  openTouchDelay: 0.3,
  reactDuration: 1.2,
};

const SANTA_MODEL = "assets/models/santa/santa-lod0.glb";

const BRAND_SAFE = {
  nameY0: 1.45,
  nameY1: 2.12,
  nameX: 0.78,
  launchY0: 0.62,
  launchY1: 1.55,
  launchX: 1.12,
  logoY0: 2.02,
  logoX: 0.62,
  frontZ: 0.42,
};

const TIMELINE = {
  openStart: 1.0,
  openDuration: 1.25,
  logoStart: 2.05,
  logoDuration: 1.05,
  nameStart: 3.15,
  nameDuration: 0.82,
  launchStart: 4.1,
  launchDuration: 1.45,
  giftsStart: 5.65,
  giftsDuration: 2.15,
  settleStart: 7.2,
  dockShow: 7.8,
  autoStart: 0.65,
};

const state = {
  webgl: false,
  elapsed: 0,
  playbackStart: null,
  started: false,
  confettiFired: false,
  running: true,
  visible: !document.hidden,
  pointer: { x: 0, y: 0, tx: 0, ty: 0 },
  santaReady: false,
  santaFailed: false,
  lastFrame: 0,
};

let renderer;
let scene;
let camera;
let boxRoot;
let lidPivot;
let innerGlow;
let rimGlow;
let interiorRoot;
let logoGroup;
let nameGroup;
let launchGroup;
let brandLogo;
let openingClip;
let gifts = [];
let sparkles = [];
let confetti3d = [];
let glowRing;
let burstLight;
let rafId = 0;
let boxHoverTilt = { x: 0, y: 0 };
let santaRoot;
let santaModel;
let santaMixer;
let santaActions = {};
let santaActiveAction;
const santaBones = {};
const santaRestPose = new Map();
const santaPos = {
  enter: new THREE.Vector3(3.85, 0, 1.55),
  approach: new THREE.Vector3(1.32, 0, 0.92),
  open: new THREE.Vector3(1.14, 0, 0.76),
  watch: new THREE.Vector3(1.26, 0, 1.05),
};
const SANTA_FACE_BOX = -1.62;
const _worldA = new THREE.Vector3();
const _worldB = new THREE.Vector3();

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => {
  const c = 1.35;
  return 1 + c * (t - 1) ** 3 + (c + 1) * (t - 1) ** 2;
};
const lerp = (a, b, t) => a + (b - a) * t;

function markFallback(reason) {
  body.classList.add("experience-fallback", `experience-fallback--${reason}`);
  canvas?.remove();
  openBtn?.setAttribute("hidden", "");
  storeDock?.classList.add("is-visible");
}

function canvasSize() {
  const host = canvas?.parentElement;
  if (!host) return { w: window.innerWidth, h: window.innerHeight };
  return { w: Math.max(host.clientWidth, 1), h: Math.max(host.clientHeight, 1) };
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.52,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

function ribbonMat(color = 0xf4d35e) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.26,
    metalness: 0.14,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16,
  });
}

function physMat(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.32,
    metalness: opts.metalness ?? 0.2,
    clearcoat: opts.clearcoat ?? 0.35,
    clearcoatRoughness: 0.14,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

function glassMat(color = 0x9ee7ff, opacity = 0.55) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.04,
    transmission: Math.min(opacity, 0.92),
    thickness: 0.18,
    transparent: true,
    opacity,
  });
}

function addMesh(group, geo, material, pos) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.copy(pos);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function applyOpeningClip(material) {
  if (!material || !openingClip) return;
  material.clippingPlanes = openingClip;
  material.clipShadows = true;
}

function syncOpeningClipPlane() {
  if (!openingClip || !boxRoot) return;
  boxRoot.getWorldPosition(_worldA);
  const openY = _worldA.y + OPENING_Y * boxRoot.scale.y;
  openingClip[0].constant = -openY;
}

function setGroupClipped(group, clipped) {
  if (!group) return;
  group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (clipped) applyOpeningClip(m);
      else m.clippingPlanes = null;
    });
  });
}

function emergedPastRim(group, pad = 0.06) {
  if (!group || !boxRoot) return false;
  group.getWorldPosition(_worldA);
  boxRoot.getWorldPosition(_worldB);
  const openWorldY = _worldB.y + OPENING_Y * boxRoot.scale.y;
  return _worldA.y >= openWorldY + pad * boxRoot.scale.y;
}

function clipObjectTree(object) {
  object.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(applyOpeningClip);
    }
  });
}

function createLabelPlane(text, fontPx, color, planeW, planeH, withGlow = false, depthWrite = false) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 2048;
  canvasEl.height = 512;
  const ctx = canvasEl.getContext("2d");
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.font = `800 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (withGlow) {
    const sweep = ctx.createLinearGradient(0, 0, canvasEl.width, 0);
    sweep.addColorStop(0, "#e84a7a");
    sweep.addColorStop(0.45, "#ff6b9d");
    sweep.addColorStop(0.55, "#ffe66d");
    sweep.addColorStop(1, "#e84a7a");
    ctx.fillStyle = sweep;
    ctx.shadowColor = "rgba(255, 200, 90, 0.85)";
    ctx.shadowBlur = 36;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fillText(text, canvasEl.width / 2, canvasEl.height / 2);
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite,
    alphaTest: depthWrite ? 0.06 : 0,
  });
  applyOpeningClip(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), material);
  mesh.renderOrder = withGlow ? 3 : 6;
  return mesh;
}

function faceCamera(group) {
  if (!group || !camera) return;
  group.quaternion.copy(camera.quaternion);
}

function createBow() {
  const bow = new THREE.Group();
  const loopL = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.045, 12, 24, Math.PI * 1.15),
    ribbonMat(0xff6b9d)
  );
  loopL.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  loopL.position.set(-0.1, 0, 0);
  const loopR = loopL.clone();
  loopR.position.set(0.1, 0, 0);
  loopR.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  const knot = addMesh(bow, new THREE.SphereGeometry(0.07, 16, 16), ribbonMat(0xff4d88), new THREE.Vector3());
  knot.scale.set(1.2, 0.85, 0.9);
  bow.add(loopL, loopR);
  return bow;
}

function createGiftBox() {
  boxRoot = new THREE.Group();
  boxRoot.scale.setScalar(isNarrow ? 0.86 : 1);

  const shell = mat(0xff5e7a);
  const wallT = 0.11;
  const outerW = 1.65;
  const outerH = 1.05;
  const outerD = 1.65;
  const halfW = outerW / 2;
  const halfD = outerD / 2;
  addMesh(boxRoot, new THREE.BoxGeometry(outerW, wallT, outerD), shell, new THREE.Vector3(0, wallT / 2, 0));
  addMesh(
    boxRoot,
    new THREE.BoxGeometry(outerW, outerH, wallT),
    shell,
    new THREE.Vector3(0, outerH / 2, halfD - wallT / 2)
  );
  addMesh(
    boxRoot,
    new THREE.BoxGeometry(outerW, outerH, wallT),
    shell,
    new THREE.Vector3(0, outerH / 2, -halfD + wallT / 2)
  );
  addMesh(
    boxRoot,
    new THREE.BoxGeometry(wallT, outerH, outerD - wallT * 2),
    shell,
    new THREE.Vector3(-halfW + wallT / 2, outerH / 2, 0)
  );
  addMesh(
    boxRoot,
    new THREE.BoxGeometry(wallT, outerH, outerD - wallT * 2),
    shell,
    new THREE.Vector3(halfW - wallT / 2, outerH / 2, 0)
  );

  addMesh(boxRoot, new THREE.BoxGeometry(1.5, 0.04, 1.5), mat(0xe84a68), new THREE.Vector3(0, 1.04, 0));
  addMesh(
    boxRoot,
    new THREE.BoxGeometry(1.45, 0.85, 1.45),
    mat(0xffedf2, { roughness: 0.88 }),
    new THREE.Vector3(0, 0.48, 0)
  );
  addMesh(boxRoot, new THREE.BoxGeometry(1.66, 1.06, 0.18), ribbonMat(), new THREE.Vector3(0, 0.525, 0));
  addMesh(boxRoot, new THREE.BoxGeometry(0.18, 1.06, 1.66), ribbonMat(), new THREE.Vector3(0, 0.525, 0));

  const depth = 1.65;
  lidPivot = new THREE.Group();
  lidPivot.position.set(0, 1.05, -depth / 2);
  addMesh(lidPivot, new THREE.BoxGeometry(1.7, 0.2, depth), mat(0xff7a92), new THREE.Vector3(0, 0.1, depth / 2));
  addMesh(lidPivot, new THREE.BoxGeometry(1.72, 0.04, 0.18), ribbonMat(), new THREE.Vector3(0, 0.2, depth / 2));
  addMesh(lidPivot, new THREE.BoxGeometry(0.18, 0.04, depth), ribbonMat(), new THREE.Vector3(0, 0.2, depth / 2));
  const bow = createBow();
  bow.position.set(0, 0.28, depth / 2);
  lidPivot.add(bow);
  boxRoot.add(lidPivot);

  innerGlow = new THREE.PointLight(0xffe6a8, 0, 9, 2);
  innerGlow.position.set(0, 0.88, 0);
  boxRoot.add(innerGlow);

  rimGlow = new THREE.PointLight(0xff9ec4, 0.3, 10, 2);
  rimGlow.position.set(0, 1.12, 1.1);
  boxRoot.add(rimGlow);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 48),
    new THREE.MeshBasicMaterial({ color: 0x5c2340, transparent: true, opacity: 0.24 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  boxRoot.add(shadow);

  addMesh(
    boxRoot,
    new THREE.CylinderGeometry(1.75, 1.9, 0.08, 48),
    mat(0xffffff, { roughness: 0.72 }),
    new THREE.Vector3(0, 0.04, 0)
  );

  interiorRoot = new THREE.Group();
  interiorRoot.name = "interiorRoot";
  interiorRoot.position.set(0, 0.02, -0.06);
  boxRoot.add(interiorRoot);

  if (!openingClip) {
    openingClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -OPENING_Y)];
  }

  const rimLip = addMesh(
    boxRoot,
    new THREE.BoxGeometry(1.52, 0.06, 1.52),
    mat(0xf8c4d0, { roughness: 0.82 }),
    new THREE.Vector3(0, OPENING_Y - 0.02, 0)
  );
  rimLip.renderOrder = 1;

  scene.add(boxRoot);
}

function createInteriorReveal(logoTexture) {
  // Clip fragments below the box opening (y < OPENING_Y in box-local space).
  openingClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -OPENING_Y)];

  logoGroup = new THREE.Group();
  const logoW = isNarrow ? 0.78 : 1.02;
  const logoMat = new THREE.MeshBasicMaterial({
    map: logoTexture,
    transparent: true,
    depthWrite: false,
  });
  applyOpeningClip(logoMat);
  brandLogo = new THREE.Mesh(new THREE.PlaneGeometry(logoW, logoW), logoMat);
  brandLogo.renderOrder = 5;
  logoGroup.add(brandLogo);
  logoGroup.userData = {
    inside: new THREE.Vector3(0, 0.42, -0.06),
    settled: new THREE.Vector3(0, 2.72, 0.52),
  };
  interiorRoot.add(logoGroup);

  nameGroup = new THREE.Group();
  const nameMesh = createLabelPlane(
    "ICHEY",
    isNarrow ? 118 : 178,
    "#2a1e35",
    isNarrow ? 1.28 : 1.62,
    isNarrow ? 0.32 : 0.38
  );
  nameGroup.add(nameMesh);
  nameGroup.visible = false;
  nameGroup.userData = {
    inside: new THREE.Vector3(0, 0.4, -0.05),
    settled: new THREE.Vector3(0, 1.76, 0.58),
  };
  interiorRoot.add(nameGroup);

  launchGroup = new THREE.Group();
  const launchMesh = createLabelPlane(
    "LAUNCHING SOON",
    isNarrow ? 92 : 158,
    "#e84a7a",
    isNarrow ? 2.35 : 3.55,
    isNarrow ? 0.5 : 0.72,
    true,
    true
  );
  launchGroup.add(launchMesh);
  launchGroup.visible = false;
  launchGroup.userData = {
    inside: new THREE.Vector3(0, 0.38, -0.05),
    settled: new THREE.Vector3(0, 1.1, 0.44),
    scaleFrom: 0.04,
    scalePeak: isNarrow ? 1.08 : 1.22,
    scaleTo: isNarrow ? 0.92 : 1.02,
  };
  interiorRoot.add(launchGroup);

  logoGroup.position.copy(logoGroup.userData.inside);
  logoGroup.scale.setScalar(0.04);
  nameGroup.position.copy(nameGroup.userData.inside);
  nameGroup.scale.setScalar(0.04);
  launchGroup.position.copy(launchGroup.userData.inside);
  launchGroup.scale.setScalar(launchGroup.userData.scaleFrom);
}

/* Gift builders — premium product-style meshes */
function createPhone() {
  const g = new THREE.Group();
  const frame = physMat(0x3a3d52, { metalness: 0.65, roughness: 0.22, clearcoat: 0.8 });
  addMesh(g, new THREE.BoxGeometry(0.1, 0.22, 0.018), frame, new THREE.Vector3(0, 0.13, 0));
  addMesh(g, new THREE.BoxGeometry(0.088, 0.19, 0.006), glassMat(0x88e8ff, 0.65), new THREE.Vector3(0, 0.13, 0.01));
  addMesh(
    g,
    new THREE.BoxGeometry(0.088, 0.17, 0.002),
    physMat(0x0d1117, { emissive: 0x1a4a52, emissiveIntensity: 0.35, roughness: 0.15 }),
    new THREE.Vector3(0, 0.13, 0.012)
  );
  addMesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16), physMat(0x111111, { metalness: 0.4 }), new THREE.Vector3(0.032, 0.21, 0.011));
  addMesh(g, new THREE.BoxGeometry(0.008, 0.04, 0.01), physMat(0x555566, { metalness: 0.5 }), new THREE.Vector3(-0.052, 0.13, 0.005));
  return g;
}

function createTeddy() {
  const g = new THREE.Group();
  const fur = physMat(0xd4b08c, { roughness: 0.82, metalness: 0.02, clearcoat: 0.05 });
  addMesh(g, new THREE.SphereGeometry(0.13, 24, 24), fur, new THREE.Vector3(0, 0.15, 0));
  addMesh(g, new THREE.SphereGeometry(0.1, 24, 24), fur, new THREE.Vector3(0, 0.33, 0.01));
  addMesh(g, new THREE.SphereGeometry(0.042, 16, 16), fur, new THREE.Vector3(-0.085, 0.4, 0.02));
  addMesh(g, new THREE.SphereGeometry(0.042, 16, 16), fur, new THREE.Vector3(0.085, 0.4, 0.02));
  addMesh(g, new THREE.SphereGeometry(0.028, 12, 12), mat(0x332820, { roughness: 0.7 }), new THREE.Vector3(0, 0.34, 0.08));
  addMesh(g, new THREE.SphereGeometry(0.012, 10, 10), mat(0x222222), new THREE.Vector3(-0.03, 0.345, 0.095));
  addMesh(g, new THREE.SphereGeometry(0.012, 10, 10), mat(0x222222), new THREE.Vector3(0.03, 0.345, 0.095));
  return g;
}

function createToyCar() {
  const g = new THREE.Group();
  const body = physMat(0xe63946, { clearcoat: 0.9, metalness: 0.35, roughness: 0.18 });
  addMesh(g, new THREE.BoxGeometry(0.28, 0.09, 0.14), body, new THREE.Vector3(0, 0.09, 0));
  addMesh(g, new THREE.BoxGeometry(0.13, 0.05, 0.11), glassMat(0xaadfff, 0.45), new THREE.Vector3(-0.02, 0.14, 0.005));
  const rim = physMat(0xbbbbcc, { metalness: 0.85, roughness: 0.2 });
  const wheelGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.028, 20);
  [[-0.09, 0.038, 0.075], [0.09, 0.038, 0.075], [-0.09, 0.038, -0.075], [0.09, 0.038, -0.075]].forEach(([x, y, z]) => {
    const w = addMesh(g, wheelGeo, rim, new THREE.Vector3(x, y, z));
    w.rotation.x = Math.PI / 2;
    addMesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), mat(0x222222), new THREE.Vector3(x, y, z)).rotation.x = Math.PI / 2;
  });
  return g;
}

function createBooks() {
  const g = new THREE.Group();
  const specs = [
    { c: 0x2a6f7a, t: 0x4ecdc4 },
    { c: 0xc9a227, t: 0xffe66d },
    { c: 0xb83b5e, t: 0xff6b9d },
  ];
  specs.forEach((s, i) => {
    addMesh(g, new THREE.BoxGeometry(0.2, 0.048, 0.15), physMat(s.t, { roughness: 0.45 }), new THREE.Vector3(0, 0.03 + i * 0.052, 0));
    addMesh(g, new THREE.BoxGeometry(0.018, 0.046, 0.15), physMat(s.c, { roughness: 0.55 }), new THREE.Vector3(-0.102, 0.03 + i * 0.052, 0));
    addMesh(g, new THREE.BoxGeometry(0.17, 0.046, 0.006), mat(0xfff8f0, { roughness: 0.95 }), new THREE.Vector3(-0.01, 0.03 + i * 0.052, 0.075));
  });
  return g;
}

function createHeadphones() {
  const g = new THREE.Group();
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.016, 20, 48, Math.PI * 1.02),
    physMat(0x444455, { metalness: 0.75, roughness: 0.18 })
  );
  band.rotation.z = Math.PI;
  band.position.y = 0.2;
  g.add(band);
  const pad = physMat(0x2a2a35, { roughness: 0.75 });
  [-0.14, 0.14].forEach((x) => {
    addMesh(g, new THREE.CylinderGeometry(0.055, 0.058, 0.03, 20), pad, new THREE.Vector3(x, 0.11, 0));
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.018, 20), physMat(0x888899, { metalness: 0.6 }), new THREE.Vector3(x, 0.125, 0));
  });
  return g;
}

function createShirt() {
  const g = new THREE.Group();
  const fabric = physMat(0x6c63ff, { roughness: 0.72, metalness: 0.02 });
  addMesh(g, new THREE.BoxGeometry(0.28, 0.05, 0.2), fabric, new THREE.Vector3(0, 0.035, 0));
  addMesh(g, new THREE.BoxGeometry(0.11, 0.04, 0.09), fabric, new THREE.Vector3(0, 0.075, 0.04));
  addMesh(g, new THREE.BoxGeometry(0.05, 0.035, 0.04), mat(0x544ccc, { roughness: 0.85 }), new THREE.Vector3(0, 0.045, 0.09));
  return g;
}

function createPlant() {
  const g = new THREE.Group();
  addMesh(g, new THREE.CylinderGeometry(0.065, 0.075, 0.09, 24), physMat(0xe8a87c, { roughness: 0.55 }), new THREE.Vector3(0, 0.045, 0));
  [[0, 0.17, 0], [-0.06, 0.13, 0.04], [0.05, 0.14, -0.03], [0.02, 0.2, 0.05]].forEach(([x, y, z]) => {
    addMesh(g, new THREE.SphereGeometry(0.05, 16, 16), physMat(0x3ea86a, { roughness: 0.6 }), new THREE.Vector3(x, y, z));
  });
  return g;
}

function createBackpack() {
  const g = new THREE.Group();
  const body = physMat(0xff9f1c, { roughness: 0.48 });
  addMesh(g, new THREE.BoxGeometry(0.19, 0.26, 0.1), body, new THREE.Vector3(0, 0.15, 0));
  addMesh(g, new THREE.BoxGeometry(0.2, 0.07, 0.105), physMat(0xffbf69, { roughness: 0.55 }), new THREE.Vector3(0, 0.255, -0.004));
  addMesh(g, new THREE.BoxGeometry(0.03, 0.22, 0.012), mat(0x333333, { roughness: 0.4 }), new THREE.Vector3(0, 0.15, 0.055));
  [[-0.055, 0.28], [0.055, 0.28]].forEach(([x, y]) => {
    addMesh(g, new THREE.CylinderGeometry(0.012, 0.012, 0.08, 10), physMat(0x444444, { metalness: 0.5 }), new THREE.Vector3(x, y, 0.03));
  });
  return g;
}

const GIFT_BUILDERS = [
  createPhone,
  createTeddy,
  createBooks,
  createHeadphones,
  createShirt,
  createToyCar,
  createBackpack,
  createPlant,
  createPhone,
];

function nudgeOutOfBrandSafe(pos) {
  if (!inBrandSafeZone(pos.x, pos.y, pos.z)) return;
  const pushX = Math.sign(pos.x || 1) * (BRAND_SAFE.nameX + (isNarrow ? 0.42 : 0.52));
  pos.x = pushX;
  if (pos.y > BRAND_SAFE.nameY0 && pos.y < BRAND_SAFE.nameY1) pos.y = BRAND_SAFE.nameY1 + 0.22;
  if (pos.z > BRAND_SAFE.frontZ) pos.z = Math.min(pos.z, 0.28);
}

function inBrandSafeZone(x, y, z) {
  if (Math.abs(x) < BRAND_SAFE.nameX && y >= BRAND_SAFE.nameY0 && y <= BRAND_SAFE.nameY1) return true;
  if (Math.abs(x) < BRAND_SAFE.launchX && y >= BRAND_SAFE.launchY0 && y <= BRAND_SAFE.launchY1) return true;
  if (Math.abs(x) < BRAND_SAFE.logoX && y >= BRAND_SAFE.logoY0) return true;
  if (z > BRAND_SAFE.frontZ && Math.abs(x) < 0.62 && y >= 1.25 && y <= 2.25) return true;
  return false;
}

function buildGiftSlots(count) {
  const side = isNarrow ? 1.05 : 1.22;
  const slots = [
    new THREE.Vector3(side, 2.38, 0.3),
    new THREE.Vector3(-side, 2.32, 0.28),
    new THREE.Vector3(side * 1.06, 2.58, 0.12),
    new THREE.Vector3(-side * 1.04, 2.5, 0.1),
    new THREE.Vector3(side * 1.1, 1.05, 0.16),
    new THREE.Vector3(-side * 1.08, 1.02, 0.14),
    new THREE.Vector3(side * 0.95, 0.9, 0.05),
    new THREE.Vector3(-side * 0.98, 0.92, 0.02),
    new THREE.Vector3(side * 1.15, 1.32, -0.06),
  ];
  return slots.slice(0, count);
}

function createGifts() {
  const count = isNarrow ? 7 : 9;
  const slots = buildGiftSlots(count);
  gifts = [];
  for (let i = 0; i < count; i += 1) {
    const item = GIFT_BUILDERS[i]();
    clipObjectTree(item);
    const target = slots[i % slots.length].clone();

    item.userData = {
      index: i,
      delay: i * 0.12,
      target,
      inside: new THREE.Vector3(
        (i % 3) * 0.05 - 0.05,
        0.36 + (i % 4) * 0.03,
        -0.14 - (i % 3) * 0.035
      ),
      arc: new THREE.Vector3(
        target.x * 0.16,
        1.1,
        Math.min(target.z, 0.14)
      ),
      spin: 0.28 + i * 0.06,
    };
    item.position.copy(item.userData.inside);
    item.scale.setScalar(0.02);
    item.visible = true;
    item.traverse((o) => {
      if (o.isMesh) o.renderOrder = 9;
    });
    gifts.push(item);
    interiorRoot.add(item);
  }
}

function createSparkles() {
  sparkles = [];
  const n = isNarrow ? 24 : 40;
  for (let i = 0; i < n; i += 1) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      new THREE.MeshBasicMaterial({
        color: [0xffe66d, 0xff6b9d, 0x4ecdc4, 0xffffff][i % 4],
        transparent: true,
        opacity: 0.15,
      })
    );
    p.userData = { phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.8 };
    p.position.set(
      (Math.random() - 0.5) * 0.65,
      0.38 + Math.random() * 0.42,
      -0.18 - Math.random() * 0.22
    );
    applyOpeningClip(p.material);
    sparkles.push(p);
    interiorRoot.add(p);
  }
}

function createCelebrationFX() {
  glowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 2.5, 56),
    new THREE.MeshBasicMaterial({ color: 0xffe66d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.05;
  scene.add(glowRing);
  burstLight = new THREE.PointLight(0xfff4cc, 0, 16, 2);
  burstLight.position.set(0, 1.1, 0.15);
  scene.add(burstLight);
}

function spawnConfetti3D(count) {
  const colors = [0xff6b9d, 0xf4d35e, 0x4ecdc4, 0x9b5de5, 0xff9f1c, 0x52b788, 0xffffff];
  for (let i = 0; i < count; i += 1) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.random() > 0.65 ? 0.12 : 0.06, Math.random() > 0.65 ? 0.025 : 0.05),
      new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    s.position.set((Math.random() - 0.5) * 0.45, 1.05, (Math.random() - 0.5) * 0.45);
    s.userData = {
      vel: new THREE.Vector3((Math.random() - 0.5) * 3.5, 1.8 + Math.random() * 3.5, (Math.random() - 0.5) * 3),
      spin: (Math.random() - 0.5) * 10,
      life: 2.5 + Math.random() * 1.2,
      age: 0,
    };
    confetti3d.push(s);
    scene.add(s);
  }
}

function spawnDomConfetti() {
  if (!confettiRoot || prefersReducedMotion) return;
  confettiRoot.replaceChildren();
  const pieces = isNarrow ? 50 : 85;
  for (let i = 0; i < pieces; i += 1) {
    const el = document.createElement("span");
    el.className = Math.random() > 0.6 ? "confetti-piece confetti-piece--streamer" : "confetti-piece";
    el.style.setProperty("--x", `${(Math.random() - 0.5) * 110}vw`);
    el.style.setProperty("--delay", `${Math.random() * 0.5}s`);
    el.style.setProperty("--hue", `${Math.floor(Math.random() * 360)}`);
    el.style.setProperty("--duration", `${3 + Math.random() * 2}s`);
    confettiRoot.appendChild(el);
  }
}

function santaTimestamps() {
  const walkEnd = SANTA.walkStart + SANTA.walkDuration;
  const pauseEnd = walkEnd + SANTA.approachDuration;
  const openStart = pauseEnd + SANTA.pauseBeforeOpen;
  const openEnd = openStart + SANTA.openDuration;
  return { walkEnd, pauseEnd, openStart, openEnd };
}

function getBrandOffset() {
  if (!state.santaReady) return 0;
  const { openEnd } = santaTimestamps();
  return openEnd + 0.18 - TIMELINE.openStart;
}

function enhanceSantaMaterials(model) {
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.map) m.map.anisotropy = maxAniso;
      if (typeof m.roughness === "number") m.roughness = Math.min(m.roughness, 0.62);
      if (typeof m.metalness === "number" && m.metalness > 0.65) m.metalness = 0.65;
    });
    o.renderOrder = 4;
  });
}

function cacheSantaRig(model) {
  Object.keys(santaBones).forEach((k) => delete santaBones[k]);
  santaRestPose.clear();
  model.traverse((o) => {
    if (!o.isBone) return;
    santaBones[o.name] = o;
    santaRestPose.set(o.name, o.quaternion.clone());
  });
}

function resetSantaBones() {
  santaRestPose.forEach((q, name) => {
    const bone = santaBones[name];
    if (bone) bone.quaternion.copy(q);
  });
  santaModel?.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.update();
  });
}

function applySantaOpenPose(openU, reachOnly = false) {
  if (!santaModel) return;
  resetSantaBones();
  const u = easeInOutCubic(openU);
  const lean = reachOnly ? u * 0.12 : u * 0.32;
  if (santaBones.spine) santaBones.spine.rotation.x += lean;
  if (santaBones.spine1) santaBones.spine1.rotation.x += lean * 0.65;
  if (santaBones.neck) santaBones.neck.rotation.x += lean * 0.2;
  if (santaBones.shoulder_R) santaBones.shoulder_R.rotation.z -= u * 0.08;
  const arm = reachOnly ? 0.55 : 1;
  if (santaBones.upperarm_R) {
    santaBones.upperarm_R.rotation.x -= u * 1.45 * arm;
    santaBones.upperarm_R.rotation.z -= u * 0.58 * arm;
  }
  if (santaBones.forearm_R) santaBones.forearm_R.rotation.x -= u * 1.08 * arm;
  if (santaBones.hand_R) santaBones.hand_R.rotation.x -= u * 0.28 * arm;
  if (santaBones.upperarm_L) {
    santaBones.upperarm_L.rotation.x -= u * 1.08 * arm;
    santaBones.upperarm_L.rotation.z += u * 0.35 * arm;
  }
  if (santaBones.forearm_L) santaBones.forearm_L.rotation.x -= u * 0.78 * arm;
  santaModel.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.update();
  });
}

function getSantaOpenT(timeS) {
  if (!state.santaReady) return 0;
  const { openStart, openEnd } = santaTimestamps();
  if (timeS < openStart) return 0;
  const local = (timeS - openStart) / SANTA.openDuration;
  if (local < SANTA.openTouchDelay) return 0;
  const lift = (local - SANTA.openTouchDelay) / (1 - SANTA.openTouchDelay);
  if (timeS >= openEnd) return 1;
  return easeInOutCubic(clamp(lift, 0, 1));
}

function playSantaAction(name, fade = 0.22, loop = THREE.LoopRepeat) {
  const next = santaActions[name];
  if (!next || !santaMixer) return;
  if (santaActiveAction === next) return;
  if (santaActiveAction) santaActiveAction.fadeOut(fade);
  next.reset().setLoop(loop).fadeIn(fade).play();
  santaActiveAction = next;
}

async function initSanta() {
  santaRoot = new THREE.Group();
  santaRoot.visible = false;
  scene.add(santaRoot);

  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath("./assets/vendor/libs/basis/")
    .detectSupport(renderer);
  const loader = new GLTFLoader();
  loader.setKTX2Loader(ktx2Loader);
  try {
    const { MeshoptDecoder } = await import("./assets/vendor/libs/meshopt_decoder.module.js");
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch (err) {
    console.warn("Meshopt decoder unavailable:", err);
  }

  loader.load(
    SANTA_MODEL,
    (gltf) => {
      try {
        santaModel = gltf.scene;
        const scale = isNarrow ? 0.84 : 0.96;
        santaModel.scale.setScalar(scale);
        santaModel.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        enhanceSantaMaterials(santaModel);
        cacheSantaRig(santaModel);
        santaRoot.add(santaModel);
        santaMixer = new THREE.AnimationMixer(santaModel);
        gltf.animations.forEach((clip) => {
          santaActions[clip.name] = santaMixer.clipAction(clip);
        });
        if (santaActions.idle) santaActions.idle.setEffectiveWeight(1);
        state.santaReady = true;
        body.classList.add("santa-ready");
        if (state._logoReady) state._loadTime = performance.now();
      } catch (err) {
        console.error("Santa setup failed:", err);
        state.santaFailed = true;
        body.classList.add("santa-unavailable");
        if (state._logoReady) state._loadTime = performance.now();
      }
    },
    undefined,
    (err) => {
      console.error("Santa model load error:", err);
      state.santaFailed = true;
      body.classList.add("santa-unavailable");
      if (state._logoReady) state._loadTime = performance.now();
    }
  );
}

function syncWalkStepSpeed() {
  const walk = santaActions.walk;
  if (!walk) return;
  const clipDur = walk.getClip().duration || 1;
  const cycles = Math.max(3, Math.round(SANTA.walkDuration / clipDur));
  walk.timeScale = (clipDur * cycles) / SANTA.walkDuration;
}

function updateSanta(timeS) {
  if (!santaRoot || !state.santaReady) return;

  const { walkEnd, pauseEnd, openStart, openEnd } = santaTimestamps();
  const reactEnd = openEnd + SANTA.reactDuration;

  if (timeS < SANTA.walkStart) {
    santaRoot.visible = false;
    return;
  }

  santaRoot.visible = true;
  if (santaMixer) santaMixer.timeScale = 1;

  if (timeS < walkEnd) {
    const u = easeInOutCubic((timeS - SANTA.walkStart) / SANTA.walkDuration);
    santaRoot.position.lerpVectors(santaPos.enter, santaPos.approach, u);
    santaRoot.rotation.y = lerp(Math.PI * 0.95, SANTA_FACE_BOX, u);
    playSantaAction("walk", 0.12);
    syncWalkStepSpeed();
  } else if (timeS < pauseEnd) {
    const u = easeOutCubic((timeS - walkEnd) / SANTA.approachDuration);
    santaRoot.position.lerpVectors(santaPos.approach, santaPos.open, u);
    santaRoot.rotation.y = lerp(SANTA_FACE_BOX, SANTA_FACE_BOX + 0.05, u);
    playSantaAction("walk", 0.2);
    if (santaActions.walk) santaActions.walk.timeScale = 0.42;
  } else if (timeS < openStart) {
    santaRoot.position.copy(santaPos.open);
    santaRoot.rotation.y = SANTA_FACE_BOX;
    playSantaAction("look_around", 0.25);
    if (santaActions.look_around) santaActions.look_around.timeScale = 0.75;
  } else if (timeS < openEnd) {
    const local = (timeS - openStart) / SANTA.openDuration;
    santaRoot.position.copy(santaPos.open);
    santaRoot.rotation.y = SANTA_FACE_BOX;
    if (santaMixer) santaMixer.timeScale = 0.45;
    playSantaAction("idle", 0.15);
    if (local < SANTA.openTouchDelay) {
      applySantaOpenPose(local / SANTA.openTouchDelay, true);
    } else {
      const lift = (local - SANTA.openTouchDelay) / (1 - SANTA.openTouchDelay);
      applySantaOpenPose(lift, false);
    }
  } else if (timeS < reactEnd) {
    const u = easeOutCubic((timeS - openEnd) / SANTA.reactDuration);
    santaRoot.position.lerpVectors(santaPos.open, santaPos.watch, u);
    santaRoot.rotation.y = lerp(SANTA_FACE_BOX, SANTA_FACE_BOX + 0.08, u);
    if (santaMixer) santaMixer.timeScale = 1;
    playSantaAction("idle", 0.25);
    applySantaOpenPose(lerp(0.95, 0.2, u));
  } else {
    santaRoot.position.copy(santaPos.watch);
    santaRoot.rotation.y = SANTA_FACE_BOX + 0.1 + Math.sin(timeS * 0.55) * 0.03;
    playSantaAction("idle", 0.2);
    applySantaOpenPose(0.16);
    santaRoot.position.y = Math.sin(timeS * 1.1) * 0.006;
  }
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xfff8ff, 0xffb4c4, 1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.38));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(isNarrow ? 512 : 1024, isNarrow ? 512 : 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9bf6ff, 0.5);
  fill.position.set(-4, 3, 2);
  scene.add(fill);
  const warm = new THREE.DirectionalLight(0xffd6a5, 0.42);
  warm.position.set(0, 2, -4);
  scene.add(warm);
}

function getPhaseT(t) {
  const off = getBrandOffset();
  const openDur = state.santaReady ? SANTA.openDuration : TIMELINE.openDuration;
  return {
    enter: easeOutCubic(clamp(t / 1.0, 0, 1)),
    open: easeInOutCubic(clamp((t - TIMELINE.openStart - off) / openDur, 0, 1)),
    logo: easeOutCubic(clamp((t - TIMELINE.logoStart - off) / TIMELINE.logoDuration, 0, 1)),
    name: easeOutCubic(clamp((t - TIMELINE.nameStart - off) / TIMELINE.nameDuration, 0, 1)),
    launch: easeOutBack(clamp((t - TIMELINE.launchStart - off) / TIMELINE.launchDuration, 0, 1)),
    gifts: easeOutCubic(clamp((t - TIMELINE.giftsStart - off) / TIMELINE.giftsDuration, 0, 1)),
    settle: easeOutCubic(clamp((t - TIMELINE.settleStart - off) / 1.2, 0, 1)),
  };
}

function startPlayback() {
  if (state.started) return;
  state.started = true;
  state.playbackStart = performance.now();
  openBtn?.setAttribute("hidden", "");
  body.classList.add("playback-active");
}

function updateGifts(open, launchT, giftsT, timeS) {
  if (timeS < TIMELINE.giftsStart + getBrandOffset() || launchT < 0.92) {
    gifts.forEach((gift) => {
      gift.position.copy(gift.userData.inside);
      gift.scale.setScalar(0.02);
    });
    return;
  }
  gifts.forEach((gift) => {
    const u = gift.userData;
    const local = clamp((giftsT - u.delay) / 0.52, 0, 1);
    if (open < 0.45 || local <= 0) {
      gift.position.copy(u.inside);
      gift.scale.setScalar(lerp(0.02, 0.08, open));
      return;
    }
    const e = easeOutBack(local);
    const mid = new THREE.Vector3().lerpVectors(u.inside, u.arc, easeOutCubic(local));
    gift.position.lerpVectors(mid, u.target, easeOutCubic(local));
    const lift = Math.sin(e * Math.PI) * 0.26;
    gift.position.y += lift;
    gift.position.y += Math.sin(timeS * 1.35 + u.index) * 0.025 * local;
    gift.scale.setScalar(lerp(0.08, isNarrow ? 1.02 : 1.16, e));
    gift.rotation.y = timeS * u.spin;
    gift.rotation.x = Math.sin(timeS * 0.85 + u.index) * 0.16;
    nudgeOutOfBrandSafe(gift.position);
    setGroupClipped(gift, local < 0.92 && !emergedPastRim(gift, -0.02));
  });
}

function updateInteriorReveal(phase, timeS) {
  if (!logoGroup) return;

  const off = getBrandOffset();
  const { logo, name, launch, open } = phase;
  const ready = open >= 0.42;

  if (!ready) {
    logoGroup.position.copy(logoGroup.userData.inside);
    logoGroup.scale.setScalar(0.03);
    nameGroup.visible = false;
    launchGroup.visible = false;
    return;
  }

  if (timeS < TIMELINE.nameStart + off) {
    nameGroup.visible = false;
    nameGroup.position.copy(nameGroup.userData.inside);
    nameGroup.scale.setScalar(0.03);
    setGroupClipped(nameGroup, true);
  }

  if (timeS < TIMELINE.launchStart + off) {
    launchGroup.visible = false;
    launchGroup.position.copy(launchGroup.userData.inside);
    launchGroup.scale.setScalar(launchGroup.userData.scaleFrom);
    setGroupClipped(launchGroup, true);
  }

  if (timeS < TIMELINE.logoStart + off) {
    logoGroup.position.copy(logoGroup.userData.inside);
    logoGroup.scale.setScalar(0.03);
    setGroupClipped(logoGroup, true);
    return;
  }

  if (logo > 0) {
    logoGroup.position.lerpVectors(
      logoGroup.userData.inside,
      logoGroup.userData.settled,
      easeOutCubic(logo)
    );
    logoGroup.scale.setScalar(lerp(0.05, 1, easeOutBack(logo)));
    faceCamera(logoGroup);
    logoGroup.position.y += Math.sin(timeS * 1.15) * 0.01 * logo;
    setGroupClipped(logoGroup, !emergedPastRim(logoGroup) && logo < 0.98);
  } else {
    logoGroup.position.copy(logoGroup.userData.inside);
    logoGroup.scale.setScalar(0.04);
    faceCamera(logoGroup);
    setGroupClipped(logoGroup, true);
  }

  if (timeS >= TIMELINE.nameStart + off && name > 0.02 && logo >= 0.82) {
    nameGroup.visible = true;
    nameGroup.position.lerpVectors(
      nameGroup.userData.inside,
      nameGroup.userData.settled,
      easeOutCubic(name)
    );
    nameGroup.scale.setScalar(lerp(0.05, 1, easeOutBack(name)));
    faceCamera(nameGroup);
    setGroupClipped(nameGroup, !emergedPastRim(nameGroup) && name < 0.98);
  } else {
    nameGroup.visible = false;
    nameGroup.position.copy(nameGroup.userData.inside);
    nameGroup.scale.setScalar(0.03);
    setGroupClipped(nameGroup, true);
  }

  if (timeS >= TIMELINE.launchStart + off && launch > 0.02 && name >= 0.72) {
    launchGroup.visible = true;
    const u = launchGroup.userData;
    const rise = easeOutCubic(launch);
    launchGroup.position.lerpVectors(u.inside, u.settled, rise);
    const dramatic = easeOutBack(launch);
    let scaleT = lerp(u.scaleFrom, u.scalePeak, dramatic);
    if (launch > 0.72) {
      scaleT = lerp(scaleT, u.scaleTo, (launch - 0.72) / 0.28);
    }
    launchGroup.scale.setScalar(scaleT);
    launchGroup.rotation.x = lerp(0.32, 0, easeOutCubic(launch));
    faceCamera(launchGroup);
    launchGroup.position.y += Math.sin(timeS * 1.35) * 0.006 * (1 - launch * 0.35);
    setGroupClipped(launchGroup, !emergedPastRim(launchGroup, 0.02) && launch < 0.96);
    if (rimGlow) rimGlow.intensity = 0.45 + launch * 1.05;
  } else {
    launchGroup.visible = false;
    launchGroup.position.copy(launchGroup.userData.inside);
    launchGroup.scale.setScalar(launchGroup.userData.scaleFrom);
    setGroupClipped(launchGroup, true);
  }
}

function updateScene(timeS) {
  if (!boxRoot) return;
  const phase = getPhaseT(timeS);

  const float = Math.sin(timeS * 0.75) * 0.022;
  const vibrate = phase.open > 0.05 && phase.open < 0.85 ? Math.sin(timeS * 20) * 0.012 * (1 - phase.open) : 0;

  boxRoot.position.y = lerp(-1.2, 0, phase.enter) + float + vibrate;
  boxRoot.rotation.y = lerp(boxRoot.rotation.y, Math.sin(timeS * 0.4) * 0.04 + boxHoverTilt.y * 0.08, 0.05);
  boxRoot.rotation.x = lerp(boxRoot.rotation.x, boxHoverTilt.x * 0.05, 0.05);
  boxRoot.updateMatrixWorld(true);
  syncOpeningClipPlane();

  const santaOpenT = getSantaOpenT(timeS);
  let lidMix = phase.open;
  if (state.santaReady) {
    lidMix = timeS < santaTimestamps().openStart ? 0 : Math.max(santaOpenT, phase.open);
  }
  if (lidPivot) lidPivot.rotation.x = -clamp(lidMix, 0, 1) * 1.7;

  const glow = Math.max(phase.open, santaOpenT) * (2.5 + Math.sin(timeS * 2.2) * 0.25);
  if (innerGlow) innerGlow.intensity = glow;
  if (rimGlow) rimGlow.intensity = 0.35 + phase.open * 0.9;

  if (phase.gifts > 0.45 && !state.confettiFired) {
    state.confettiFired = true;
    spawnConfetti3D(isNarrow ? 70 : 120);
    spawnDomConfetti();
    flashOverlay?.classList.add("is-active");
    window.setTimeout(() => flashOverlay?.classList.remove("is-active"), 380);
    body.classList.add("gift-celebrating");
  }

  if (glowRing) {
    const burst = clamp((phase.gifts - 0.35) / 0.45, 0, 1);
    glowRing.material.opacity = burst * 0.4 * (1 - phase.settle * 0.7);
    glowRing.scale.setScalar(1 + burst * 1.5);
  }
  if (burstLight) burstLight.intensity = clamp((phase.gifts - 0.2) / 0.5, 0, 1) * 4.5;

  sparkles.forEach((s) => {
    const brand = Math.max(phase.logo, phase.name * 0.85);
    const a = phase.open < 0.25 ? 0 : 0.15 + phase.open * 0.35 + brand * 0.45;
    s.material.opacity = a * (0.5 + Math.sin(timeS * s.userData.speed + s.userData.phase) * 0.35);
    s.visible = phase.open >= 0.2;
  });

  updateSanta(timeS);
  updateInteriorReveal(phase, timeS);
  updateGifts(phase.open, phase.launch, phase.gifts, timeS);

  confetti3d.forEach((c) => {
    c.userData.age += 1 / 60;
    c.position.addScaledVector(c.userData.vel, 1 / 60);
    c.userData.vel.y -= 1.9 / 60;
    c.rotation.z += c.userData.spin / 60;
    c.material.opacity = clamp(1 - c.userData.age / c.userData.life, 0, 1);
    if (c.userData.age > c.userData.life) scene.remove(c);
  });
  confetti3d = confetti3d.filter((c) => c.userData.age <= c.userData.life);

  const parallax = isCoarsePointer ? 0 : 0.5;
  state.pointer.tx = lerp(state.pointer.tx, state.pointer.x * 0.14 * parallax, 0.06);
  state.pointer.ty = lerp(state.pointer.ty, state.pointer.y * 0.08 * parallax, 0.06);
  camera.position.x = state.pointer.tx;
  camera.position.y = (isNarrow ? 1.44 : 1.46) + state.pointer.ty;
  camera.lookAt(0, isNarrow ? 1.28 : 1.42, 0);
  camera.position.z = isNarrow ? 5.9 : 5.58;

  if (timeS >= TIMELINE.dockShow + getBrandOffset()) {
    storeDock?.classList.add("is-visible");
  }
}

function animate(now) {
  if (!renderer) return;
  rafId = requestAnimationFrame(animate);
  if (!state.running || !state.visible) return;

  if (!state.started) {
    const assetsReady = state._logoReady && (state.santaReady || state.santaFailed);
    if (
      now &&
      assetsReady &&
      performance.now() > (state._loadTime || 0) + TIMELINE.autoStart * 1000
    ) {
      startPlayback();
    }
    if (santaMixer && state.lastFrame) {
      const dt = Math.min((now - state.lastFrame) / 1000, 0.05);
      santaMixer.update(dt);
    }
    state.lastFrame = now;
    renderer.render(scene, camera);
    return;
  }

  const dt = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 1 / 60;
  state.lastFrame = now;
  if (santaMixer) santaMixer.update(dt);

  state.elapsed = (now - state.playbackStart) / 1000;
  updateScene(state.elapsed);
  renderer.render(scene, camera);
}

function initThree() {
  if (!canvas) {
    markFallback("no-canvas");
    return;
  }
  if (prefersReducedMotion) {
    markFallback("motion");
    return;
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isNarrow });
  } catch {
    markFallback("webgl");
    return;
  }

  const { w, h } = canvasSize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isNarrow ? 1.35 : 2));
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isNarrow ? 1.02 : 1.08;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xfff5f8, 0.036);
  camera = new THREE.PerspectiveCamera(43, w / h, 0.1, 50);
  camera.position.set(0, isNarrow ? 1.44 : 1.46, isNarrow ? 5.9 : 5.58);
  camera.lookAt(0, isNarrow ? 1.28 : 1.42, 0);

  setupLights();
  createGiftBox();
  createSparkles();
  createCelebrationFX();
  initSanta();

  const loader = new THREE.TextureLoader();
  loader.load(
    "ichey-logo.png",
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      createInteriorReveal(tex);
      createGifts();
      state._logoReady = true;
      if (state.santaReady || state.santaFailed) state._loadTime = performance.now();
      body.classList.add("experience-webgl");
      state.webgl = true;
      rafId = requestAnimationFrame(animate);
    },
    undefined,
    () => {
      markFallback("logo");
    }
  );
}

function onResize() {
  if (!renderer || !camera) return;
  const { w, h } = canvasSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

const FALLING_PALETTE = [
  { box: "#ff7a92", dark: "#e84a7a", lid: "#ff9eb8" },
  { box: "#7ed9c8", dark: "#45b5a4", lid: "#9fe8db" },
  { box: "#ffd36e", dark: "#e8a824", lid: "#ffe699" },
  { box: "#b8a0ff", dark: "#8870d9", lid: "#cbb8ff" },
  { box: "#8ec5ff", dark: "#5b9bd9", lid: "#b4dcff" },
];

const FALLING_PRODUCTS = [
  { id: "phone", label: "smartphone" },
  { id: "teddy", label: "teddy bear" },
  { id: "headphones", label: "wireless headphones" },
  { id: "book", label: "books" },
  { id: "backpack", label: "backpack" },
  { id: "car", label: "toy car" },
  { id: "plant", label: "indoor plant" },
  { id: "shirt", label: "folded shirt" },
];

let fallingRoot;
let fallingSpawnId = 0;
const fallingItems = [];
let fallingRaf = 0;
const FALLING_MAX = isNarrow ? 3 : 6;

function buildFallingGiftMarkup(productClass, productLabel) {
  return `
    <span class="falling-gift__stage">
      <span class="falling-gift__spark" aria-hidden="true"></span>
      <span class="falling-gift__spark" aria-hidden="true"></span>
      <span class="falling-gift__spark" aria-hidden="true"></span>
      <span class="falling-gift__lid" aria-hidden="true"></span>
      <span class="falling-gift__bow" aria-hidden="true"></span>
      <span class="falling-gift__body" aria-hidden="true">
        <span class="falling-gift__ribbon-v" aria-hidden="true"></span>
        <span class="falling-gift__ribbon-h" aria-hidden="true"></span>
      </span>
      <span class="falling-gift__product product--${productClass}" role="img" aria-label="${productLabel}"></span>
      <button type="button" class="falling-gift__close" aria-label="Close gift reveal">&times;</button>
    </span>`;
}

function pickFallingSide() {
  const leftLane = 6 + Math.random() * 20;
  const rightLane = 74 + Math.random() * 20;
  return Math.random() > 0.5 ? leftLane : rightLane;
}

function spawnFallingGift() {
  if (!fallingRoot || prefersReducedMotion || !state.visible) return;
  if (fallingRoot.querySelectorAll(".falling-gift:not(.is-done)").length >= FALLING_MAX) return;

  const palette = FALLING_PALETTE[Math.floor(Math.random() * FALLING_PALETTE.length)];
  const product = FALLING_PRODUCTS[Math.floor(Math.random() * FALLING_PRODUCTS.length)];
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "falling-gift";
  btn.dataset.product = product.id;
  btn.style.setProperty("--left", `${pickFallingSide()}%`);
  btn.style.setProperty("--spin", `${(Math.random() - 0.5) * 28}deg`);
  btn.style.setProperty("--box-size", isNarrow ? "2.5rem" : `${2.6 + Math.random() * 1.2}rem`);
  btn.style.setProperty("--box-light", palette.box);
  btn.style.setProperty("--box-dark", palette.dark);
  btn.style.setProperty("--box-lid", palette.lid);
  btn.setAttribute("aria-label", `Open gift box to reveal a ${product.label}`);
  btn.innerHTML = buildFallingGiftMarkup(product.id, product.label);

  const item = {
    el: btn,
    y: -72 - Math.random() * 40,
    spin: (Math.random() - 0.5) * 28,
    spinVel: (Math.random() - 0.5) * 36,
    vy: 52 + Math.random() * 38,
    paused: false,
    opened: false,
  };
  fallingItems.push(item);

  const pauseFall = () => {
    item.paused = true;
  };
  btn.addEventListener("pointerenter", pauseFall);
  btn.addEventListener("pointerdown", pauseFall);
  btn.addEventListener("focus", pauseFall);

  btn.addEventListener("click", (e) => {
    if (btn.classList.contains("is-opened") || btn.classList.contains("is-opening")) return;
    e.stopPropagation();
    item.paused = true;
    btn.classList.add("is-opening");
    requestAnimationFrame(() => btn.classList.add("is-opened"));
    item.opened = true;
  });

  const closeBtn = btn.querySelector(".falling-gift__close");
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    btn.classList.remove("is-opened", "is-opening");
    btn.classList.add("is-done");
    btn.remove();
  });

  fallingRoot.appendChild(btn);
  applyFallingTransform(item);
}

function applyFallingTransform(item) {
  item.el.style.transform = `translate3d(-50%, ${item.y}px, 0) rotate(${item.spin}deg)`;
}

function tickFallingGifts() {
  fallingRaf = requestAnimationFrame(tickFallingGifts);
  if (!state.visible || prefersReducedMotion) return;

  const limit = window.innerHeight + 100;
  for (let i = fallingItems.length - 1; i >= 0; i -= 1) {
    const item = fallingItems[i];
    if (!item.el.isConnected) {
      fallingItems.splice(i, 1);
      continue;
    }
    if (!item.paused && !item.opened) {
      item.y += item.vy / 60;
      item.spin += item.spinVel / 60;
      if (item.y > limit) {
        item.el.remove();
        fallingItems.splice(i, 1);
        continue;
      }
    }
    applyFallingTransform(item);
  }
}

function initFallingGifts() {
  if (prefersReducedMotion) return;
  fallingRoot = document.getElementById("falling-gifts");
  if (!fallingRoot) return;

  const schedule = () => {
    fallingSpawnId = window.setTimeout(() => {
      spawnFallingGift();
      schedule();
    }, isNarrow ? 3200 + Math.random() * 2200 : 2200 + Math.random() * 1800);
  };

  window.setTimeout(() => {
    spawnFallingGift();
    schedule();
  }, 1800);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (fallingRoot.querySelectorAll(".falling-gift:not(.is-done)").length < 2) spawnFallingGift();
  });

  fallingRaf = requestAnimationFrame(tickFallingGifts);
}

function initDom() {
  body.classList.add("is-ready");
  openBtn?.addEventListener("click", startPlayback);
  initFallingGifts();
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener(
  "pointermove",
  (e) => {
    state.pointer.x = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
    state.pointer.y = clamp(-((e.clientY / window.innerHeight) * 2 - 1), -1, 1);
    if (state.elapsed < TIMELINE.settleStart) {
      boxHoverTilt.y = state.pointer.x * 0.35;
      boxHoverTilt.x = state.pointer.y * 0.25;
    }
  },
  { passive: true }
);
document.addEventListener("visibilitychange", () => {
  state.visible = !document.hidden;
});

if (!prefersReducedMotion) initThree();
else markFallback("motion");

initDom();

window.addEventListener("beforeunload", () => {
  state.running = false;
  cancelAnimationFrame(rafId);
  renderer?.dispose();
});