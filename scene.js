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
const viewport = { w: 0, h: 0, aspect: 1, narrow: isNarrow, portrait: false, dpr: 1 };
let resizeObserver;

const OPENING_Y = 1.02;
const MAX_DPR = 2;

const SANTA = {
  walkStart: 0.85,
  walkDuration: 3.95,
  stopBlend: 0.38,
};

const AUTO_LID = {
  delayAfterSanta: 0.4,
  duration: 1.18,
};

/** Elliptical orbit for pastel floating gifts (stays below / beside LAUNCHING SOON). */
const FLOAT_ORBIT = {
  cx: 0,
  cy: 0.54,
  cz: 0.46,
  rx: 1.18,
  rz: 0.36,
};

const LAUNCH_PHRASE = "LAUNCHING SOON";
const LAUNCH_STAGGER = 0.13;
const LAUNCH_LETTER_DURATION = 0.58;

const REVEAL = {
  logo: 1.12,
  name: 0.95,
  get launch() {
    return (LAUNCH_PHRASE.length - 1) * LAUNCH_STAGGER + LAUNCH_LETTER_DURATION + 0.08;
  },
  phaseGap: 0.18,
  gifts: 2.85,
};

const ANIMATION_STATES = {
  INITIAL: "initial",
  SANTA_WALKING: "santaWalking",
  SANTA_ARRIVED: "santaArrived",
  OPENING_BOX: "openingBox",
  BOX_OPENED: "boxOpened",
  LOGO_REVEAL: "logoReveal",
  ICHEY_REVEAL: "icheyReveal",
  LAUNCH_REVEAL: "launchReveal",
  GIFTS_MOVING: "giftsMoving",
  FINAL_LAYOUT: "finalLayout",
};

const SANTA_MODEL = "assets/models/santa/santa-lod0.glb";

const BRAND_SAFE = {
  nameY0: 1.45,
  nameY1: 2.12,
  nameX: 0.78,
  launchY0: 0.5,
  launchY1: 1.48,
  launchX: 1.22,
  launchRightX: 0.58,
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
  get launchDuration() {
    return REVEAL.launch;
  },
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
let snowmanRoot;
let decorGifts = [];
let rafId = 0;
let boxHoverTilt = { x: 0, y: 0 };
let santaRoot;
let santaModel;
let santaMixer;
let santaActions = {};
let santaActiveAction;
let santaLegsFrozen = false;
const santaBones = {};
const santaRestPose = new Map();
const santaPos = {
  enter: new THREE.Vector3(-3.62, 0, 1.22),
  stop: new THREE.Vector3(-2.08, 0, 0.82),
  watch: new THREE.Vector3(-2.08, 0, 0.82),
};
const SANTA_FACE_BOX = 1.12;
const _worldA = new THREE.Vector3();
const _worldB = new THREE.Vector3();
const _launchAim = new THREE.Vector3();
const _launchDir = new THREE.Vector3();

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

function updateViewportMetrics() {
  const { w, h } = canvasSize();
  viewport.w = w;
  viewport.h = h;
  viewport.aspect = w / Math.max(h, 1);
  viewport.narrow = w <= 768;
  viewport.portrait = h > w;
  viewport.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

function getRendererPixelRatio() {
  updateViewportMetrics();
  const mem = navigator.deviceMemory;
  if (viewport.narrow && mem && mem <= 4) return Math.min(viewport.dpr, 1.75);
  return viewport.dpr;
}

function tuneTexture(tex) {
  if (!tex || !renderer) return;
  const aniso = renderer.capabilities?.getMaxAnisotropy?.() ?? 4;
  tex.anisotropy = Math.min(aniso, 8);
  const img = tex.image;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  const pot =
    w > 0 &&
    h > 0 &&
    (w & (w - 1)) === 0 &&
    (h & (h - 1)) === 0;
  tex.magFilter = THREE.LinearFilter;
  if (pot) {
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
  } else {
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
  }
  tex.needsUpdate = true;
}

function syncRendererSize() {
  if (!renderer || !camera) return;
  updateViewportMetrics();
  const { w, h } = canvasSize();
  renderer.setPixelRatio(getRendererPixelRatio());
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}

/** Frame box + full-body Santa across portrait/landscape without shrinking the whole scene. */
function applyResponsiveCamera() {
  if (!camera) return;
  updateViewportMetrics();
  const { w, h, portrait, aspect } = viewport;
  const short = h < 640;
  const veryNarrow = w <= 390;
  const mid = w > 390 && w <= 768;

  let fov = 43;
  let lookY = 1.42;
  let camY = 1.48;
  let camZ = 5.58;
  let lookZ = 0;

  let camX = state.pointer.tx;
  if (portrait) {
    fov = veryNarrow ? 51 : mid ? 49 : 48;
    lookY = short ? 0.96 : 1.04;
    camY = lookY + 0.16;
    camZ = 7.05 + clamp(0.78 - aspect, 0, 0.5) * 2.65;
    if (short) camZ += 0.55;
    lookZ = -0.04;
    camX = state.pointer.tx - (w <= 320 ? 0.2 : veryNarrow ? 0.15 : w <= 430 ? 0.11 : 0.08);
  } else if (viewport.narrow || w <= 1024) {
    fov = 44.5;
    lookY = 1.32;
    camY = 1.4;
    camZ = 6.05;
  } else if (w >= 1440) {
    camZ = 5.72;
    fov = 42.5;
  }

  camera.fov = fov;
  camera.aspect = w / Math.max(h, 1);
  camera.position.x = camX;
  camera.position.y = camY + state.pointer.ty;
  camera.position.z = camZ;
  camera.lookAt(0, lookY, lookZ);
  camera.updateProjectionMatrix();
  syncSantaLayout();
}

function getSantaSceneScale() {
  updateViewportMetrics();
  if (viewport.portrait && viewport.h < 700) return 0.8;
  if (viewport.portrait) return 0.84;
  return viewport.narrow ? 0.82 : 0.92;
}

/**
 * Santa stop pose: desktop keeps left offset for headline clearance;
 * portrait/narrow viewports use in-frustum X (wide FOV + tall aspect clips far-left).
 */
function syncSantaLayout() {
  updateViewportMetrics();
  const w = viewport.w || window.innerWidth;
  const portrait = viewport.portrait;

  let leftX;
  let stopZ;
  let enterX;
  let enterZ;

  if (portrait && w <= 320) {
    leftX = -1.02;
    stopZ = 0.98;
    enterX = -1.95;
    enterZ = 1.0;
  } else if (portrait && w <= 430) {
    leftX = -1.22;
    stopZ = 0.96;
    enterX = -2.28;
    enterZ = 1.02;
  } else if (portrait && w <= 768) {
    leftX = -1.34;
    stopZ = 0.92;
    enterX = -2.5;
    enterZ = 1.06;
  } else if (w <= 768) {
    leftX = -1.72;
    stopZ = 0.84;
    enterX = -3.1;
    enterZ = 1.12;
  } else {
    leftX = w <= 1024 ? -2.06 : -2.18;
    stopZ = 0.82;
    enterX = -3.62;
    enterZ = 1.18;
  }

  santaPos.stop.set(leftX, 0, stopZ);
  santaPos.watch.copy(santaPos.stop);
  santaPos.enter.set(enterX, 0, enterZ);
}

function isSantaInCameraFrustum() {
  if (!santaRoot || !camera || !state.santaReady || !santaRoot.visible) return false;
  santaRoot.updateMatrixWorld(true);
  _worldA.set(0, 0.95, 0);
  santaRoot.localToWorld(_worldA);
  _worldA.project(camera);
  return (
    _worldA.x >= -0.98 &&
    _worldA.x <= 0.98 &&
    _worldA.y >= -0.98 &&
    _worldA.y <= 0.98 &&
    _worldA.z >= -1 &&
    _worldA.z <= 1
  );
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

function createLabelPlane(text, fontPx, color, planeW, planeH, style = "solid", depthWrite = false) {
  const canvasEl = document.createElement("canvas");
  const hiRes = style === "launch-emerald";
  canvasEl.width = hiRes ? 3072 : 2048;
  canvasEl.height = 512;
  const ctx = canvasEl.getContext("2d");
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  const scaledFont = hiRes ? Math.round(fontPx * 1.5) : fontPx;
  ctx.font = `800 ${scaledFont}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = canvasEl.width / 2;
  const cy = canvasEl.height / 2;
  if (style === "launch-emerald") {
    const shade = ctx.createLinearGradient(0, cy - scaledFont * 0.55, 0, cy + scaledFont * 0.55);
    shade.addColorStop(0, "#1f9d6a");
    shade.addColorStop(0.42, "#0b6b47");
    shade.addColorStop(1, "#064a32");
    ctx.fillStyle = shade;
    ctx.shadowColor = "rgba(6, 74, 50, 0.32)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, scaledFont * 0.018);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeText(text, cx, cy);
  } else {
    ctx.fillStyle = color;
    ctx.fillText(text, cx, cy);
  }
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  tuneTexture(texture);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite,
    alphaTest: depthWrite ? 0.06 : 0,
  });
  applyOpeningClip(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), material);
  mesh.renderOrder = style === "launch-emerald" ? 4 : 6;
  return mesh;
}

function paintLaunchEmeraldGlyph(ctx, ch, scaledFont, cx, cy) {
  ctx.font = `800 ${scaledFont}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const shade = ctx.createLinearGradient(0, cy - scaledFont * 0.62, 0, cy + scaledFont * 0.18);
  shade.addColorStop(0, "#1f9d6a");
  shade.addColorStop(0.42, "#0b6b47");
  shade.addColorStop(1, "#064a32");
  ctx.fillStyle = shade;
  ctx.shadowColor = "rgba(6, 74, 50, 0.32)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillText(ch, cx, cy);
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(2, scaledFont * 0.018);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeText(ch, cx, cy);
}

function createLaunchLetterMesh(ch, fontPx, planeW, planeH, advancePx) {
  const scaledFont = Math.round(fontPx * 1.5);
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `800 ${scaledFont}px "Segoe UI", system-ui, sans-serif`;
  const m = probe.measureText(ch);
  const inkL = m.actualBoundingBoxLeft ?? scaledFont * 0.08;
  const inkR = m.actualBoundingBoxRight ?? m.width;
  const canvasW = Math.max(Math.ceil(advancePx ?? m.width), Math.ceil(inkL + inkR + 8), 24);
  const inkH = Math.max(
    Math.ceil((m.actualBoundingBoxAscent ?? scaledFont * 0.82) + (m.actualBoundingBoxDescent ?? scaledFont * 0.22)),
    24
  );
  const canvasEl = document.createElement("canvas");
  canvasEl.width = canvasW;
  canvasEl.height = inkH;
  const ctx = canvasEl.getContext("2d");
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  const cx = canvasW / 2;
  const cy = canvasEl.height / 2;
  ctx.font = `800 ${scaledFont}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const shade = ctx.createLinearGradient(0, cy - scaledFont * 0.42, 0, cy + scaledFont * 0.42);
  shade.addColorStop(0, "#1f9d6a");
  shade.addColorStop(0.42, "#0b6b47");
  shade.addColorStop(1, "#064a32");
  ctx.fillStyle = shade;
  ctx.shadowColor = "rgba(6, 74, 50, 0.32)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillText(ch, cx, cy);
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(2, scaledFont * 0.018);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeText(ch, cx, cy);
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  tuneTexture(texture);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: true,
    alphaTest: 0.06,
    opacity: 0,
  });
  applyOpeningClip(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), material);
  mesh.renderOrder = 8;
  return mesh;
}

function launchFontForViewport(w) {
  if (w <= 320) return 94;
  if (w <= 360) return 100;
  if (w <= 430) return 108;
  if (w <= 768) return 122;
  if (w <= 1024) return 150;
  return 164;
}

function measureCanvasPhraseWidth(text, fontPx) {
  const scaledFont = Math.round(fontPx * 1.5);
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `800 ${scaledFont}px "Segoe UI", system-ui, sans-serif`;
  return probe.measureText(text).width;
}

/** Kerning-aware glyph advances; total width matches full phrase measurement. */
function measureLaunchGlyphs(fontPx) {
  const scaledFont = Math.round(fontPx * 1.5);
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `800 ${scaledFont}px "Segoe UI", system-ui, sans-serif`;
  const glyphs = [];
  for (let i = 0; i < LAUNCH_PHRASE.length; i += 1) {
    const ch = LAUNCH_PHRASE[i];
    const before = LAUNCH_PHRASE.slice(0, i);
    const through = LAUNCH_PHRASE.slice(0, i + 1);
    const advance = probe.measureText(through).width - probe.measureText(before).width;
    glyphs.push({ ch, advance, mesh: ch !== " " });
  }
  const totalPx = probe.measureText(LAUNCH_PHRASE).width;
  return { glyphs, totalPx };
}

function launchHeadlineMaxWorld(w) {
  if (w <= 320) return 1.98;
  if (w <= 360) return 2.06;
  if (w <= 430) return 2.14;
  if (w <= 768) return 2.48;
  if (w <= 1024) return 2.98;
  return 3.22;
}

function buildLaunchLetterLayout(launchType) {
  const { glyphs, totalPx } = measureLaunchGlyphs(launchType.font);
  const worldW = launchType.planeW;
  const worldScale = worldW / Math.max(totalPx, 1);
  const ySettled = launchType.settledY;
  const insideOrigin = new THREE.Vector3(0, 0.36, -0.05);
  const settledZ = launchType.settledZ ?? 0.58;
  let leftPx = 0;
  const layouts = [];
  for (let phraseIndex = 0; phraseIndex < glyphs.length; phraseIndex += 1) {
    const g = glyphs[phraseIndex];
    const advanceWorld = g.advance * worldScale;
    const cx = (leftPx + g.advance * 0.5) * worldScale - worldW / 2;
    leftPx += g.advance;
    layouts.push({
      ch: g.ch,
      mesh: g.mesh,
      staggerIndex: phraseIndex,
      settled: new THREE.Vector3(cx, ySettled, settledZ),
      inside: insideOrigin.clone(),
      planeW: g.mesh ? advanceWorld : 0,
      planeH: launchType.planeH,
      advancePx: g.advance,
    });
  }
  return layouts;
}

function launchBelowName(nameType, launchType) {
  const gap = 0.055;
  const y = nameType.settledY - nameType.planeH * 0.5 - launchType.planeH * 0.5 - gap;
  return { ...launchType, settledY: y, settledZ: 0.6 };
}

function getLaunchSequenceStart(timeS) {
  const off = getBrandOffset();
  if (state.santaReady) return getChoreoTimes().launchStart;
  return TIMELINE.launchStart + off;
}

function getLaunchLetterT(timeS, staggerIndex) {
  const start = getLaunchSequenceStart(timeS) + staggerIndex * LAUNCH_STAGGER;
  if (timeS < start) return 0;
  return clamp((timeS - start) / LAUNCH_LETTER_DURATION, 0, 1);
}

function getLaunchSequenceProgress(timeS) {
  const launchStart = getLaunchSequenceStart(timeS);
  if (timeS < launchStart) return 0;
  if (state.santaReady) {
    const c = getChoreoTimes();
    if (timeS >= c.launchEnd) return 1;
  } else if (timeS >= launchStart + REVEAL.launch) return 1;
  const lastIndex = LAUNCH_PHRASE.length - 1;
  const lastStart = launchStart + lastIndex * LAUNCH_STAGGER;
  if (timeS >= lastStart + LAUNCH_LETTER_DURATION) return 1;
  return clamp((timeS - launchStart) / REVEAL.launch, 0, 0.995);
}

function launchLettersFullySettled(timeS) {
  return getLaunchLetterT(timeS, LAUNCH_PHRASE.length - 1) >= 1;
}

function resetLaunchLetters() {
  if (!launchGroup) return;
  launchGroup.visible = false;
  launchGroup.position.set(0, 0, 0);
  launchGroup.rotation.set(0, 0, 0);
  launchGroup.scale.setScalar(1);
  launchGroup.traverse((o) => {
    if (o.isGroup && o !== launchGroup && o.userData?.settled) {
      o.visible = false;
      o.position.copy(o.userData.inside);
      o.rotation.set(0.32, 0, 0);
      o.scale.setScalar(o.userData.scaleFrom ?? 0.06);
      o.traverse((m) => {
        if (m.isMesh && m.material) m.material.opacity = 0;
      });
    }
  });
}

function updateLaunchLetterReveal(timeS) {
  if (!launchGroup) return 0;
  let anyVisible = false;
  let maxT = 0;
  launchGroup.children.forEach((letterGroup) => {
    const { staggerIndex, inside, settled, scaleFrom, scaleTo } = letterGroup.userData;
    if (staggerIndex === undefined) return;
    const t = getLaunchLetterT(timeS, staggerIndex);
    maxT = Math.max(maxT, t);
    const mesh = letterGroup.children.find((c) => c.isMesh);
    if (t <= 0) {
      letterGroup.visible = false;
      letterGroup.position.copy(inside);
      letterGroup.rotation.x = 0.32;
      letterGroup.scale.setScalar(scaleFrom ?? 0.06);
      if (mesh?.material) mesh.material.opacity = 0;
      setGroupClipped(letterGroup, true);
      return;
    }
    anyVisible = true;
    letterGroup.visible = true;
    const rise = easeOutCubic(t);
    letterGroup.position.lerpVectors(inside, settled, rise);
    const pop = easeOutBack(t);
    letterGroup.scale.setScalar(lerp(scaleFrom ?? 0.06, scaleTo ?? 1, pop));
    letterGroup.rotation.x = lerp(0.28, 0, easeOutCubic(t));
    if (mesh?.material) {
      mesh.material.opacity = clamp(rise * 1.05, 0, 1);
    }
    setGroupClipped(letterGroup, !emergedPastRim(letterGroup, 0.02) && t < 0.98);
  });
  launchGroup.visible = anyVisible || launchLettersFullySettled(timeS);
  faceCamera(launchGroup);
  return maxT;
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

  const shell = physMat(0xff5e7a, { roughness: 0.38, clearcoat: 0.42, metalness: 0.08 });
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

function nameTypography() {
  updateViewportMetrics();
  const w = viewport.w || window.innerWidth;
  if (w <= 320) return { font: 134, planeW: 1.44, planeH: 0.38, settledY: 1.82 };
  if (w <= 360) return { font: 138, planeW: 1.48, planeH: 0.39, settledY: 1.82 };
  if (w <= 430) return { font: 144, planeW: 1.54, planeH: 0.4, settledY: 1.83 };
  if (w <= 768) return { font: 160, planeW: 1.68, planeH: 0.43, settledY: 1.84 };
  if (w <= 1024) return { font: 182, planeW: 1.82, planeH: 0.46, settledY: 1.86 };
  return { font: 202, planeW: 1.94, planeH: 0.48, settledY: 1.86 };
}

function launchTypography(nameType) {
  updateViewportMetrics();
  const w = viewport.w || window.innerWidth;
  const font = launchFontForViewport(w);
  const phrasePx = measureCanvasPhraseWidth(LAUNCH_PHRASE, font);
  const icheyPx = measureCanvasPhraseWidth("ICHEY", nameType.font);
  const proportionalW = nameType.planeW * (phrasePx / Math.max(icheyPx, 1));
  const planeW = Math.min(proportionalW, launchHeadlineMaxWorld(w));
  const planeH =
    w <= 320 ? 0.44 : w <= 360 ? 0.46 : w <= 430 ? 0.48 : w <= 768 ? 0.52 : w <= 1024 ? 0.6 : 0.64;
  return { font, planeW, planeH };
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
  const nameType = nameTypography();
  const nameMesh = createLabelPlane(
    "ICHEY",
    nameType.font,
    "#2a1e35",
    nameType.planeW,
    nameType.planeH
  );
  nameGroup.add(nameMesh);
  nameGroup.visible = false;
  nameGroup.userData = {
    inside: new THREE.Vector3(0, 0.4, -0.05),
    settled: new THREE.Vector3(0, nameType.settledY, 0.58),
  };
  interiorRoot.add(nameGroup);

  launchGroup = new THREE.Group();
  const launchType = launchBelowName(nameType, launchTypography(nameType));
  const letterLayouts = buildLaunchLetterLayout(launchType);
  letterLayouts.forEach((spec) => {
    if (!spec.mesh) return;
    const letterRoot = new THREE.Group();
    letterRoot.add(
      createLaunchLetterMesh(spec.ch, launchType.font, spec.planeW, spec.planeH, spec.advancePx)
    );
    letterRoot.userData = {
      char: spec.ch,
      staggerIndex: spec.staggerIndex,
      inside: spec.inside,
      settled: spec.settled,
      scaleFrom: 0.06,
      scaleTo: 1,
    };
    letterRoot.visible = false;
    letterRoot.position.copy(spec.inside);
    letterRoot.scale.setScalar(0.06);
    clipObjectTree(letterRoot);
    launchGroup.add(letterRoot);
  });
  launchGroup.visible = false;
  interiorRoot.add(launchGroup);

  logoGroup.position.copy(logoGroup.userData.inside);
  logoGroup.scale.setScalar(0.04);
  nameGroup.position.copy(nameGroup.userData.inside);
  nameGroup.scale.setScalar(0.04);
  resetLaunchLetters();
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
  if (pos.x > 0.2) {
    pos.x = BRAND_SAFE.launchRightX + 0.12;
    pos.y = Math.min(pos.y, BRAND_SAFE.launchY0 - 0.08);
  } else {
    const pushX = -1 * (BRAND_SAFE.nameX + (isNarrow ? 0.42 : 0.52));
    pos.x = pushX;
  }
  if (pos.y > BRAND_SAFE.nameY0 && pos.y < BRAND_SAFE.nameY1) pos.y = BRAND_SAFE.nameY1 + 0.22;
  if (pos.z > BRAND_SAFE.frontZ) pos.z = Math.min(pos.z, 0.28);
}

function inBrandSafeZone(x, y, z) {
  if (Math.abs(x) < BRAND_SAFE.nameX && y >= BRAND_SAFE.nameY0 && y <= BRAND_SAFE.nameY1) return true;
  if (x > -BRAND_SAFE.launchX && x < BRAND_SAFE.launchRightX && y >= BRAND_SAFE.launchY0 && y <= BRAND_SAFE.launchY1) {
    return true;
  }
  if (x < -BRAND_SAFE.launchX && y >= BRAND_SAFE.launchY0 && y <= BRAND_SAFE.launchY1) return true;
  if (Math.abs(x) < BRAND_SAFE.logoX && y >= BRAND_SAFE.logoY0) return true;
  if (z > BRAND_SAFE.frontZ && Math.abs(x) < 0.62 && y >= 1.25 && y <= 2.25) return true;
  return false;
}

/**
 * Clockwise arc: emerge → near “L” → over top of branding → settle near “N” (outside text).
 */
function buildGiftArcLayout(count) {
  updateViewportMetrics();
  const compact = viewport.portrait || viewport.narrow;
  const headlineX = 0;
  const halfW = compact ? 1.05 : 1.58;
  const pathL = new THREE.Vector3(headlineX - halfW * 0.96, compact ? 0.98 : 1.04, 0.48);
  const pathTop = new THREE.Vector3(headlineX + halfW * 0.05, compact ? 2.52 : 2.78, 0.2);
  const midLT = new THREE.Vector3(
    headlineX - halfW * 0.42,
    compact ? 1.88 : 2.05,
    0.32
  );
  const midTN = new THREE.Vector3(
    headlineX + halfW * 0.48,
    compact ? 1.72 : 1.92,
    0.38
  );
  const nBase = new THREE.Vector3(headlineX + halfW * 0.72, compact ? 0.72 : 0.78, 0.56);
  const layouts = [];
  for (let i = 0; i < count; i += 1) {
    const target = nBase.clone();
    const ring = Math.floor(i / 3);
    const slot = i % 3;
    target.x += slot * 0.09 - 0.09;
    target.y += ring * 0.065;
    target.z += (slot % 2) * 0.04;
    if (inBrandSafeZone(target.x, target.y, target.z)) {
      target.y = BRAND_SAFE.launchY0 - 0.16;
      target.x = Math.min(target.x, headlineX + halfW * 0.68);
    }
    layouts.push({ pathL: pathL.clone(), pathTop, midLT, midTN, target });
  }
  return layouts;
}

function giftBezierPoint(inside, ctrl, target, t) {
  const u = 1 - t;
  return new THREE.Vector3(
    u * u * inside.x + 2 * u * t * ctrl.x + t * t * target.x,
    u * u * inside.y + 2 * u * t * ctrl.y + t * t * target.y,
    u * u * inside.z + 2 * u * t * ctrl.z + t * t * target.z
  );
}

function sampleGiftArcPath(u, layout) {
  const t = clamp(u, 0, 1);
  if (t <= 0.12) {
    const p = easeOutCubic(t / 0.12);
    return new THREE.Vector3().lerpVectors(layout.inside, layout.pathL, p);
  }
  if (t <= 0.52) {
    const p = (t - 0.12) / 0.4;
    return giftBezierPoint(layout.pathL, layout.midLT, layout.pathTop, easeInOutCubic(p));
  }
  const p = (t - 0.52) / 0.48;
  return giftBezierPoint(layout.pathTop, layout.midTN, layout.target, easeInOutCubic(p));
}

function createGifts() {
  const count = isNarrow ? 7 : 9;
  const layouts = buildGiftArcLayout(count);
  gifts = [];
  for (let i = 0; i < count; i += 1) {
    const item = GIFT_BUILDERS[i]();
    clipObjectTree(item);
    const layout = layouts[i % layouts.length];
    const inside = new THREE.Vector3(
      (i % 3) * 0.04 - 0.04,
      0.36 + (i % 4) * 0.028,
      -0.13 - (i % 3) * 0.03
    );
    layout.inside = inside;

    item.userData = {
      index: i,
      delay: (i / count) * (REVEAL.gifts * 0.78),
      layout,
      settleYaw: Math.atan2(layout.target.x - layout.pathL.x, layout.target.z - layout.pathL.z),
      spin: 0.06,
    };
    item.position.copy(inside);
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

function createSnowman() {
  snowmanRoot = new THREE.Group();
  const snow = mat(0xf4f7fa, { roughness: 0.78 });
  addMesh(snowmanRoot, new THREE.SphereGeometry(0.13, 22, 22), snow, new THREE.Vector3(0, 0.13, 0));
  addMesh(snowmanRoot, new THREE.SphereGeometry(0.1, 20, 20), snow, new THREE.Vector3(0, 0.31, 0));
  addMesh(snowmanRoot, new THREE.SphereGeometry(0.075, 18, 18), snow, new THREE.Vector3(0, 0.44, 0));
  addMesh(snowmanRoot, new THREE.ConeGeometry(0.055, 0.12, 12), mat(0xff9f1c), new THREE.Vector3(0, 0.505, 0.062));
  addMesh(snowmanRoot, new THREE.CylinderGeometry(0.082, 0.088, 0.048, 16), mat(0x2a2a2a), new THREE.Vector3(0, 0.468, 0));
  [[-0.022, 0.448, 0.065], [0.022, 0.448, 0.065]].forEach(([x, y, z]) => {
    addMesh(snowmanRoot, new THREE.SphereGeometry(0.009, 8, 8), mat(0x151515), new THREE.Vector3(x, y, z));
  });
  addMesh(snowmanRoot, new THREE.ConeGeometry(0.016, 0.06, 8), mat(0xff8c42), new THREE.Vector3(0, 0.445, 0.078)).rotation.x = Math.PI / 2;
  snowmanRoot.position.set(viewport.narrow ? 1.38 : 1.52, 0, 1.1);
  snowmanRoot.scale.setScalar(0);
  snowmanRoot.renderOrder = 3;
  scene.add(snowmanRoot);
}

function orbitPointAt(angle) {
  return new THREE.Vector3(
    FLOAT_ORBIT.cx + FLOAT_ORBIT.rx * Math.cos(angle),
    FLOAT_ORBIT.cy,
    FLOAT_ORBIT.cz + FLOAT_ORBIT.rz * Math.sin(angle)
  );
}

function createSceneDecor() {
  decorGifts = [];
  const count = isNarrow ? 4 : 6;
  const colors = [0xffc857, 0xffe66d, 0xb8f2e6, 0xffb4c8, 0xffd6a5, 0xc9b8ff];
  const sizes = [0.095, 0.085, 0.09, 0.08, 0.088, 0.082];
  for (let i = 0; i < count; i += 1) {
    const specS = sizes[i % sizes.length] * (viewport.narrow ? 0.92 : 1);
    const g = new THREE.Group();
    const shell = physMat(colors[i % colors.length], { clearcoat: 0.55, roughness: 0.38 });
    const h = specS * 0.88;
    addMesh(g, new THREE.BoxGeometry(specS, h, specS), shell, new THREE.Vector3(0, h / 2, 0));
    addMesh(
      g,
      new THREE.BoxGeometry(specS * 1.04, specS * 0.11, specS * 0.16),
      ribbonMat(0xffe66d),
      new THREE.Vector3(0, h, 0)
    );
    g.userData.orbitAngle = (i / count) * Math.PI * 2 - Math.PI * 0.5;
    g.userData.uniformScale = 1;
    g.scale.setScalar(0);
    g.castShadow = true;
    scene.add(g);
    decorGifts.push(g);
  }
}

function updateSceneDecor(timeS) {
  if (!state.santaReady) return;
  const c = getChoreoTimes();
  const snowT = timeS >= c.stopEnd ? clamp((timeS - c.stopEnd) / 0.75, 0, 1) : 0;
  if (snowmanRoot) {
    snowmanRoot.scale.setScalar((viewport.narrow ? 0.82 : 0.92) * easeOutBack(snowT));
    snowmanRoot.position.y = Math.sin(timeS * 1.1) * 0.003 * snowT;
  }

  const orbitT0 = c.giftsStart;
  const orbitSpan = REVEAL.gifts;
  const orbitU =
    !giftsPhaseGate(timeS) ? 0 : timeS < orbitT0 ? 0 : clamp((timeS - orbitT0) / orbitSpan, 0, 1);
  const spin = easeInOutCubic(orbitU) * Math.PI * 2;
  const settled = orbitU >= 0.97;

  decorGifts.forEach((g, i) => {
    if (orbitU <= 0) {
      g.scale.setScalar(0);
      return;
    }
    const base = g.userData.orbitAngle;
    const ang = settled ? base : base + spin;
    const pos = orbitPointAt(ang);
    if (inBrandSafeZone(pos.x, pos.y, pos.z)) {
      pos.y = BRAND_SAFE.launchY0 - 0.14;
      pos.x *= 1.06;
    }
    g.position.copy(pos);
    const grow = clamp((orbitU - i * 0.04) / 0.22, 0, 1);
    const sc = (viewport.narrow ? 0.88 : 1) * easeOutBack(grow);
    g.scale.set(sc, sc, sc);
    g.rotation.y = -ang + Math.PI * 0.5;
    g.rotation.x = 0;
    g.rotation.z = 0;
  });
}

function publishChoreoState(timeS) {
  const phase = state.santaReady ? getScenePhase(timeS) : "INITIAL";
  const map = {
    INITIAL: ANIMATION_STATES.INITIAL,
    UNAVAILABLE: ANIMATION_STATES.INITIAL,
    WALKING: ANIMATION_STATES.SANTA_WALKING,
    STOPPED: ANIMATION_STATES.SANTA_ARRIVED,
    AUTO_LID: ANIMATION_STATES.BOX_OPENED,
    IDLE: ANIMATION_STATES.SANTA_ARRIVED,
    REVEAL_LOGO: ANIMATION_STATES.LOGO_REVEAL,
    REVEAL_ICHEY: ANIMATION_STATES.ICHEY_REVEAL,
    REVEAL_HEADLINE: ANIMATION_STATES.LAUNCH_REVEAL,
    GIFTS_MOVING: ANIMATION_STATES.GIFTS_MOVING,
    GIFTS_SETTLING: ANIMATION_STATES.GIFTS_MOVING,
    COMPLETE: ANIMATION_STATES.FINAL_LAYOUT,
  };
  const key = map[phase] || ANIMATION_STATES.INITIAL;
  if (body.dataset.choreo === key) return;
  body.dataset.choreo = key;
  Object.values(ANIMATION_STATES).forEach((v) => body.classList.remove(`choreo--${v}`));
  body.classList.add(`choreo--${key}`);
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

function getChoreoTimes() {
  const walkEnd = SANTA.walkStart + SANTA.walkDuration;
  const stopEnd = walkEnd + SANTA.stopBlend;
  const openStart = stopEnd + AUTO_LID.delayAfterSanta;
  const openEnd = openStart + AUTO_LID.duration;
  const logoStart = openEnd + 0.1;
  const logoEnd = logoStart + REVEAL.logo;
  const nameStart = logoEnd + REVEAL.phaseGap;
  const nameEnd = nameStart + REVEAL.name;
  const launchStart = nameEnd + REVEAL.phaseGap;
  const launchEnd = launchStart + REVEAL.launch;
  const giftsStart = launchEnd + REVEAL.phaseGap + 0.08;
  const giftsEnd = giftsStart + REVEAL.gifts;
  const settleEnd = giftsEnd + 1.05;
  const dockShow = settleEnd + 0.35;
  return {
    walkEnd,
    stopEnd,
    openStart,
    openEnd,
    logoStart,
    logoEnd,
    nameStart,
    nameEnd,
    launchStart,
    launchEnd,
    giftsStart,
    giftsEnd,
    settleEnd,
    dockShow,
  };
}

function santaTimestamps() {
  const c = getChoreoTimes();
  return {
    walkEnd: c.walkEnd,
    pauseEnd: c.stopEnd,
    openStart: c.openStart,
    openEnd: c.openEnd,
  };
}

function getAutoLidT(timeS) {
  const c = getChoreoTimes();
  if (timeS < c.openStart) return 0;
  if (timeS >= c.openEnd) return 1;
  return easeInOutCubic((timeS - c.openStart) / AUTO_LID.duration);
}

function getSantaPhase(timeS) {
  if (!state.santaReady) return "UNAVAILABLE";
  if (timeS < SANTA.walkStart) return "INITIAL";
  const c = getChoreoTimes();
  if (timeS < c.walkEnd) return "WALKING";
  if (timeS < c.stopEnd) return "STOPPED";
  return "IDLE";
}

function getScenePhase(timeS) {
  if (!state.santaReady && timeS < 1) return "INITIAL";
  const c = getChoreoTimes();
  if (timeS < SANTA.walkStart) return "INITIAL";
  if (timeS < c.walkEnd) return "WALKING";
  if (timeS < c.stopEnd) return "STOPPED";
  if (timeS < c.openEnd) return "AUTO_LID";
  if (timeS < c.logoEnd) return "REVEAL_LOGO";
  if (timeS < c.nameEnd) return "REVEAL_ICHEY";
  if (timeS < c.launchEnd) return "REVEAL_HEADLINE";
  if (timeS < c.giftsEnd) return "GIFTS_MOVING";
  if (timeS < c.settleEnd) return "GIFTS_SETTLING";
  return "COMPLETE";
}

function getBrandOffset() {
  if (!state.santaReady) return 0;
  const c = getChoreoTimes();
  return c.logoStart - TIMELINE.logoStart;
}

function freezeSantaLegs() {
  if (santaLegsFrozen) return;
  santaLegsFrozen = true;
  santaMixer?.stopAllAction();
  Object.values(santaActions).forEach((a) => {
    if (!a) return;
    a.stop();
    a.enabled = false;
    a.setEffectiveWeight(0);
  });
  santaActiveAction = null;
  resetSantaBones();
}

function beginSantaWalk() {
  if (!santaLegsFrozen && santaActiveAction === santaActions.walk && santaActions.walk?.enabled) return;
  santaLegsFrozen = false;
  santaMixer?.stopAllAction();
  Object.values(santaActions).forEach((a) => {
    if (!a) return;
    a.enabled = false;
    a.setEffectiveWeight(0);
  });
  const walk = santaActions.walk;
  if (!walk || !santaMixer) return;
  walk.enabled = true;
  walk.reset().setLoop(THREE.LoopRepeat).fadeIn(0.08).play();
  walk.setEffectiveWeight(1);
  santaActiveAction = walk;
}

function applySantaStandPose() {
  if (!santaModel) return;
  resetSantaBones();
  restSantaRightArm();
  if (santaBones.upperarm_L) {
    santaBones.upperarm_L.rotation.x += 0.06;
    santaBones.upperarm_L.rotation.z += 0.12;
  }
  if (santaBones.forearm_L) santaBones.forearm_L.rotation.x += 0.05;
  santaModel.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.update();
  });
}

function getChoreoReveal(timeS) {
  if (!state.santaReady) return null;
  const c = getChoreoTimes();
  const lidT = getAutoLidT(timeS);
  return {
    enter: easeOutCubic(clamp(timeS / 1.0, 0, 1)),
    open: lidT,
    logo:
      timeS < c.logoStart
        ? 0
        : easeOutCubic(clamp((timeS - c.logoStart) / REVEAL.logo, 0, 1)),
    name:
      timeS < c.nameStart || timeS < c.logoEnd
        ? 0
        : easeOutCubic(clamp((timeS - c.nameStart) / REVEAL.name, 0, 1)),
    launch:
      timeS < c.launchStart || timeS < c.nameEnd ? 0 : getLaunchSequenceProgress(timeS),
    gifts:
      timeS < c.giftsStart
        ? 0
        : easeOutCubic(clamp((timeS - c.giftsStart) / REVEAL.gifts, 0, 1)),
    settle:
      timeS < c.giftsEnd ? 0 : easeOutCubic(clamp((timeS - c.giftsEnd) / 1.05, 0, 1)),
  };
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

function restSantaRightArm() {
  if (santaBones.upperarm_R) {
    santaBones.upperarm_R.rotation.x += 0.14;
    santaBones.upperarm_R.rotation.z += 0.22;
    santaBones.upperarm_R.rotation.y += 0.1;
  }
  if (santaBones.forearm_R) santaBones.forearm_R.rotation.x += 0.12;
  if (santaBones.hand_R) santaBones.hand_R.rotation.x += 0.06;
}

function restSantaLeftArm() {
  if (santaBones.upperarm_L) {
    santaBones.upperarm_L.rotation.x += 0.1;
    santaBones.upperarm_L.rotation.z += 0.08;
  }
  if (santaBones.forearm_L) santaBones.forearm_L.rotation.x += 0.07;
  if (santaBones.hand_L) santaBones.hand_L.rotation.x += 0.04;
}

/** Character LEFT arm opens lid (upperarm_L / hand_L). Right arm stays at rest. */
function applySantaLeftLidPose(openU, mode = "lift", lidT = 0) {
  if (!santaModel) return;
  resetSantaBones();
  restSantaRightArm();
  const reachU = mode === "reach" ? easeInOutCubic(openU) : 1;
  const liftU = mode === "reach" ? 0 : easeInOutCubic(openU);
  const lid = clamp(lidT, 0, 1);
  const lean = mode === "reach" ? reachU * 0.15 : 0.24 + liftU * 0.12 + lid * 0.08;
  if (santaBones.spine) santaBones.spine.rotation.x += lean;
  if (santaBones.spine1) santaBones.spine1.rotation.x += lean * 0.68;
  if (santaBones.neck) santaBones.neck.rotation.x += lean * 0.18;

  const lReach = reachU * 1.55;
  const lLift = liftU * 0.58 + lid * 0.52;
  if (santaBones.shoulder_L) santaBones.shoulder_L.rotation.z -= reachU * 0.06;
  if (santaBones.upperarm_L) {
    santaBones.upperarm_L.rotation.x -= lReach + lLift * 0.95;
    santaBones.upperarm_L.rotation.z -= reachU * 0.38 + liftU * 0.12;
    santaBones.upperarm_L.rotation.y -= reachU * 0.16;
  }
  if (santaBones.forearm_L) {
    santaBones.forearm_L.rotation.x -= lReach * 0.9 + lLift * 1.02;
  }
  if (santaBones.hand_L) {
    santaBones.hand_L.rotation.x -= reachU * 0.2 + lid * 0.44;
    santaBones.hand_L.rotation.z += reachU * 0.06;
  }

  santaModel.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.update();
  });
}

/** Left-hand presentation gesture synced with rising brand planes. */
function applySantaLeftPresentPose(kind, u) {
  if (!santaModel) return;
  resetSantaBones();
  restSantaRightArm();
  const t = easeInOutCubic(clamp(u, 0, 1));
  const lean = 0.1 + t * 0.08;
  if (santaBones.spine) santaBones.spine.rotation.x += lean;
  if (santaBones.spine1) santaBones.spine1.rotation.x += lean * 0.5;

  const lifts = { logo: 1.05, ichey: 1.18, launch: 1.32 };
  const reach = lifts[kind] ?? 1.1;
  if (santaBones.upperarm_L) {
    santaBones.upperarm_L.rotation.x -= t * reach;
    santaBones.upperarm_L.rotation.z += 0.35 + t * 0.2;
  }
  if (santaBones.forearm_L) santaBones.forearm_L.rotation.x -= t * (reach * 0.82);
  if (santaBones.hand_L) santaBones.hand_L.rotation.x -= t * 0.32;

  santaModel.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.update();
  });
}

function getLaunchHeadlineWorldTarget(out) {
  out.set(0, 0.92, 0.58);
  if (interiorRoot) {
    interiorRoot.localToWorld(out);
    return out;
  }
  if (boxRoot) {
    out.set(0, 1.45, 0.42);
    boxRoot.localToWorld(out);
  }
  return out;
}

/** World position at the center of rising letter “L” (touch target for Santa’s hand). */
function getLaunchLetterLWorld(out) {
  if (!launchGroup || !interiorRoot) return getLaunchHeadlineWorldTarget(out);
  const lGroup = launchGroup.children.find((g) => g.userData?.char === "L");
  if (!lGroup) return getLaunchHeadlineWorldTarget(out);
  if (lGroup.visible) lGroup.getWorldPosition(out);
  else {
    out.copy(lGroup.userData.settled);
    interiorRoot.localToWorld(out);
  }
  out.x += 0.06;
  out.y -= 0.03;
  return out;
}

function addBoneAimAtWorld(bone, targetWorld, strength) {
  if (!bone || strength <= 0) return;
  bone.getWorldPosition(_worldA);
  _launchDir.subVectors(targetWorld, _worldA);
  const len = _launchDir.length();
  if (len < 0.015) return;
  _launchDir.multiplyScalar(1 / len);
  bone.rotation.x += _launchDir.y * strength;
  bone.rotation.y += _launchDir.x * strength * 1.15;
  bone.rotation.z -= _launchDir.z * strength * 0.35;
}

/**
 * Right hand presents toward LAUNCHING SOON (Santa left of box).
 * Extends from rest pose with positive rotations so palm faces the headline, not the back of the hand.
 */
function applySantaRightPointAtLaunch(u) {
  if (!santaModel) return;
  resetSantaBones();
  restSantaLeftArm();
  const t = easeInOutCubic(clamp(u, 0, 1));

  if (santaBones.spine) santaBones.spine.rotation.x += 0.04 + t * 0.1;
  if (santaBones.spine1) santaBones.spine1.rotation.x += t * 0.06;
  if (santaBones.neck) {
    santaBones.neck.rotation.x -= t * 0.16;
    santaBones.neck.rotation.y += t * 0.12;
  }
  if (santaBones.head) santaBones.head.rotation.y += t * 0.08;

  if (santaBones.shoulder_R) {
    santaBones.shoulder_R.rotation.x += t * 0.06;
    santaBones.shoulder_R.rotation.y -= t * 0.12;
  }
  if (santaBones.upperarm_R) {
    santaBones.upperarm_R.rotation.x += 0.14 + t * 1.12;
    santaBones.upperarm_R.rotation.y += 0.1 - t * 0.92;
    santaBones.upperarm_R.rotation.z += 0.22 + t * 0.1;
  }
  if (santaBones.forearm_R) {
    santaBones.forearm_R.rotation.x += 0.12 + t * 1.05;
    santaBones.forearm_R.rotation.y += t * 0.14;
  }
  if (santaBones.hand_R) {
    santaBones.hand_R.rotation.x += 0.06 - t * 0.38;
    santaBones.hand_R.rotation.y += t * 0.62;
    santaBones.hand_R.rotation.z += t * 0.32;
  }

  if (t > 0.08 && santaRoot) {
    santaModel.updateMatrixWorld(true);
    getLaunchLetterLWorld(_launchAim);
    const aim = t * 1.02;
    addBoneAimAtWorld(santaBones.upperarm_R, _launchAim, aim * 0.58);
    addBoneAimAtWorld(santaBones.forearm_R, _launchAim, aim * 0.95);
    addBoneAimAtWorld(santaBones.hand_R, _launchAim, aim * 1.08);
  }

  santaModel.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.update();
  });
}

/** Arm toward LAUNCHING SOON while letters reveal (Santa stands left of the box). */
function getSantaLaunchPointT(timeS) {
  if (!state.santaReady) return 0;
  const c = getChoreoTimes();
  if (timeS < c.launchStart) return 0;
  const rise = c.launchStart + 0.4;
  if (timeS < rise) return easeOutCubic((timeS - c.launchStart) / (rise - c.launchStart));
  const holdEnd = c.launchEnd + 0.6;
  if (timeS <= holdEnd) return 1;
  const fadeEnd = holdEnd + 0.5;
  if (timeS < fadeEnd) return 1 - easeInOutCubic((timeS - holdEnd) / (fadeEnd - holdEnd));
  return 0;
}

function getSantaOpenT(timeS) {
  return state.santaReady ? getAutoLidT(timeS) : 0;
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
        santaModel.scale.setScalar(getSantaSceneScale());
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
  if (!walk || !walk.enabled) return;
  const clipDur = walk.getClip().duration || 1;
  const cycles = Math.max(3, Math.round(SANTA.walkDuration / clipDur));
  walk.timeScale = (clipDur * cycles) / SANTA.walkDuration;
}

function updateSanta(timeS) {
  if (!santaRoot || !state.santaReady) return;

  const phase = getSantaPhase(timeS);
  const c = getChoreoTimes();

  if (timeS < SANTA.walkStart) {
    santaRoot.visible = false;
    return;
  }

  santaRoot.visible = true;
  santaRoot.position.y = 0;

  if (phase === "WALKING") {
    if (santaMixer) santaMixer.timeScale = 1;
    beginSantaWalk();
    const u = easeInOutCubic((timeS - SANTA.walkStart) / SANTA.walkDuration);
    santaRoot.position.lerpVectors(santaPos.enter, santaPos.stop, u);
    santaRoot.rotation.y = lerp(0.62, SANTA_FACE_BOX, u);
    syncWalkStepSpeed();
    if (u >= 0.992) {
      santaRoot.position.copy(santaPos.stop);
      santaRoot.rotation.y = SANTA_FACE_BOX;
      freezeSantaLegs();
    }
    return;
  }

  freezeSantaLegs();

  santaRoot.position.copy(santaPos.stop);

  const pointAtLaunch = getSantaLaunchPointT(timeS);
  if (pointAtLaunch > 0.01) {
    applySantaRightPointAtLaunch(pointAtLaunch);
    santaRoot.rotation.y = lerp(SANTA_FACE_BOX, SANTA_FACE_BOX + 0.05, pointAtLaunch);
  } else {
    applySantaStandPose();
    santaRoot.rotation.y = SANTA_FACE_BOX;
  }
  const u = phase === "STOPPED" ? easeOutCubic((timeS - c.walkEnd) / SANTA.stopBlend) : 1;
  if (pointAtLaunch < 0.01 && u < 0.7) {
    santaRoot.rotation.y = lerp(SANTA_FACE_BOX, SANTA_FACE_BOX + 0.03, u / 0.7);
  }
  santaRoot.position.y = Math.sin(timeS * 0.85) * 0.003;
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xfff8ff, 0xffb4c4, 1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.38));
  const key = new THREE.DirectionalLight(0xffffff, 1.38);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.bias = -0.00022;
  key.shadow.normalBias = 0.02;
  key.shadow.mapSize.set(viewport.narrow ? 768 : 1024, viewport.narrow ? 768 : 1024);
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
  const openDur = state.santaReady ? AUTO_LID.duration : TIMELINE.openDuration;
  return {
    enter: easeOutCubic(clamp(t / 1.0, 0, 1)),
    open: easeInOutCubic(clamp((t - TIMELINE.openStart - off) / openDur, 0, 1)),
    logo: easeOutCubic(clamp((t - TIMELINE.logoStart - off) / TIMELINE.logoDuration, 0, 1)),
    name: easeOutCubic(clamp((t - TIMELINE.nameStart - off) / TIMELINE.nameDuration, 0, 1)),
    launch: getLaunchSequenceProgress(t),
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

function giftsPhaseGate(timeS) {
  if (state.santaReady) {
    const c = getChoreoTimes();
    return timeS >= c.giftsStart && launchLettersFullySettled(timeS);
  }
  const off = getBrandOffset();
  return timeS >= TIMELINE.giftsStart + off && launchLettersFullySettled(timeS);
}

function updateGifts(open, launchT, giftsT, timeS) {
  gifts.forEach((gift) => {
    gift.visible = false;
    gift.scale.setScalar(0.001);
  });
}

function updateInteriorReveal(phase, timeS) {
  if (!logoGroup) return;

  const choreo = state.santaReady ? getChoreoReveal(timeS) : null;
  const off = getBrandOffset();
  const reveal = choreo ?? phase;
  const { logo, name, launch } = reveal;
  const c = state.santaReady ? getChoreoTimes() : null;
  const lidReady = state.santaReady ? timeS >= c.openEnd : phase.open >= 0.42;

  if (!lidReady) {
    logoGroup.position.copy(logoGroup.userData.inside);
    logoGroup.scale.setScalar(0.03);
    nameGroup.visible = false;
    launchGroup.visible = false;
    setGroupClipped(logoGroup, true);
    return;
  }

  const logoAllowed = state.santaReady ? timeS >= c.logoStart : timeS >= TIMELINE.logoStart + off;
  const nameAllowed = state.santaReady
    ? timeS >= c.nameStart && timeS >= c.logoEnd
    : timeS >= TIMELINE.nameStart + off;
  const launchAllowed = state.santaReady
    ? timeS >= c.launchStart && timeS >= c.nameEnd
    : timeS >= TIMELINE.launchStart + off;

  if (!logoAllowed || logo <= 0) {
    logoGroup.position.copy(logoGroup.userData.inside);
    logoGroup.scale.setScalar(0.03);
    setGroupClipped(logoGroup, true);
  } else {
    logoGroup.position.lerpVectors(
      logoGroup.userData.inside,
      logoGroup.userData.settled,
      easeOutCubic(logo)
    );
    logoGroup.scale.setScalar(lerp(0.05, 1, easeOutBack(logo)));
    faceCamera(logoGroup);
    logoGroup.position.y += Math.sin(timeS * 1.15) * 0.008 * (1 - logo);
    setGroupClipped(logoGroup, !emergedPastRim(logoGroup) && logo < 0.98);
  }

  if (!nameAllowed || name <= 0) {
    nameGroup.visible = false;
    nameGroup.position.copy(nameGroup.userData.inside);
    nameGroup.scale.setScalar(0.03);
    setGroupClipped(nameGroup, true);
  } else {
    nameGroup.visible = true;
    nameGroup.position.lerpVectors(
      nameGroup.userData.inside,
      nameGroup.userData.settled,
      easeOutCubic(name)
    );
    nameGroup.scale.setScalar(lerp(0.05, 1, easeOutBack(name)));
    faceCamera(nameGroup);
    setGroupClipped(nameGroup, !emergedPastRim(nameGroup) && name < 0.98);
  }

  if (!launchAllowed || launch <= 0) {
    resetLaunchLetters();
  } else {
    updateLaunchLetterReveal(timeS);
    if (rimGlow) rimGlow.intensity = 0.45 + getLaunchSequenceProgress(timeS) * 1.05;
  }
}

function updateScene(timeS) {
  if (!boxRoot) return;
  const phase = state.santaReady && getChoreoReveal(timeS) ? getChoreoReveal(timeS) : getPhaseT(timeS);

  const float = Math.sin(timeS * 0.75) * 0.022;
  const vibrate = phase.open > 0.05 && phase.open < 0.85 ? Math.sin(timeS * 20) * 0.012 * (1 - phase.open) : 0;

  boxRoot.position.y = lerp(-1.2, 0, phase.enter) + float + vibrate;
  boxRoot.rotation.y = lerp(boxRoot.rotation.y, Math.sin(timeS * 0.4) * 0.04 + boxHoverTilt.y * 0.08, 0.05);
  boxRoot.rotation.x = lerp(boxRoot.rotation.x, boxHoverTilt.x * 0.05, 0.05);
  boxRoot.updateMatrixWorld(true);
  syncOpeningClipPlane();

  const lidMix = state.santaReady ? getAutoLidT(timeS) : phase.open;
  if (lidPivot) lidPivot.rotation.x = -clamp(lidMix, 0, 1) * 1.7;

  const glow = lidMix * (2.5 + Math.sin(timeS * 2.2) * 0.25);
  if (innerGlow) innerGlow.intensity = glow;
  if (rimGlow) rimGlow.intensity = 0.35 + phase.open * 0.9;

  const scenePhase = state.santaReady ? getScenePhase(timeS) : "INITIAL";
  if (
    (phase.gifts > 0.45 || scenePhase === "GIFTS_MOVING") &&
    !state.confettiFired
  ) {
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

  publishChoreoState(timeS);

  updateSanta(timeS);
  updateInteriorReveal(phase, timeS);
  updateGifts(phase.open, phase.launch, phase.gifts, timeS);
  updateSceneDecor(timeS);

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
  applyResponsiveCamera();

  const dockAt = state.santaReady ? getChoreoTimes().dockShow : TIMELINE.dockShow + getBrandOffset();
  if (timeS >= dockAt) storeDock?.classList.add("is-visible");
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
    state.lastFrame = now;
    renderer.render(scene, camera);
    return;
  }

  const dt = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 1 / 60;
  state.lastFrame = now;

  state.elapsed = (now - state.playbackStart) / 1000;
  const santaPhase = state.santaReady ? getSantaPhase(state.elapsed) : "INITIAL";
  if (santaMixer && santaPhase === "WALKING") santaMixer.update(dt);

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
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    markFallback("webgl");
    return;
  }

  updateViewportMetrics();
  syncRendererSize();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isNarrow ? 1.02 : 1.08;
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xfff5f8, 0.036);
  camera = new THREE.PerspectiveCamera(43, viewport.aspect, 0.1, 50);
  applyResponsiveCamera();

  setupLights();
  createGiftBox();
  createSnowman();
  createSceneDecor();
  createSparkles();
  createCelebrationFX();
  initSanta();

  const loader = new THREE.TextureLoader();
  loader.load(
    "ichey-logo.png",
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tuneTexture(tex);
      createInteriorReveal(tex);
      createGifts();
      state._logoReady = true;
      if (state.santaReady || state.santaFailed) state._loadTime = performance.now();
      body.classList.add("experience-webgl");
      state.webgl = true;
      const host = canvas?.parentElement;
      if (host && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => syncRendererSize());
        resizeObserver.observe(host);
      }
      window.addEventListener("orientationchange", syncRendererSize, { passive: true });
      rafId = requestAnimationFrame(animate);
    },
    undefined,
    () => {
      markFallback("logo");
    }
  );
}

function onResize() {
  syncRendererSize();
  if (santaModel && state.santaReady) {
    santaModel.scale.setScalar(getSantaSceneScale());
  }
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

if (typeof window !== "undefined") {
  window.__icheySantaFrustum = () => isSantaInCameraFrustum();
}

initDom();

window.addEventListener("beforeunload", () => {
  state.running = false;
  cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  window.removeEventListener("orientationchange", syncRendererSize);
  renderer?.dispose();
});