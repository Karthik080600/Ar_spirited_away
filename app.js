import * as THREE from 'three';
import { buildBox } from './scene.js';

const $ = id => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
const stage = $('stage');
const DEG = Math.PI / 180;
const now = () => performance.now() / 1000;
const params = new URLSearchParams(location.search);
let L;                                   // layout.json
const audio = { music: null, voice: null, muted: false };

const setMsg = m => ($('loadMsg').textContent = m);
let toastTimer; function toast(msg, ms = 5000) { const t = $('toast'); t.textContent = msg; show('toast'); clearTimeout(toastTimer); toastTimer = setTimeout(() => show('toast', false), ms); }
function hint(msg) { if (!msg) return show('hint', false); $('hint').textContent = msg; show('hint'); }
function fail(msg) { show('loading', false); show('start', false); $('errMsg').textContent = msg; show('error'); }
async function exists(url) { try { return (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok; } catch { return false; } }

// ------------------------------------------------------------------ start-screen trailer (muted, looping)
function startIntro() {
  const v = $('introVideo'), i = L.intro; if (!i) return;
  if (i.poster) v.poster = i.poster; v.muted = true; v.src = i.video; v.play().catch(() => {});
}
function stopIntro() { const v = $('introVideo'); v.pause(); v.removeAttribute('src'); v.load(); }

// ------------------------------------------------------------------ audio (music loop + tap dialogue)
function startMusic() {                  // called straight from the button click so the browser allows playback
  stopIntro();
  const a = new Audio(L.music); a.loop = true; a.volume = 0.45;
  a.addEventListener('error', () => { audio.music = null; show('btnMute', false); });
  a.play().then(() => { audio.music = a; show('btnMute'); }).catch(() => {});
  audio.music = a;
}
$('btnMute').onclick = () => {
  audio.muted = !audio.muted; $('btnMute').classList.toggle('off', audio.muted);
  if (audio.music) audio.music.muted = audio.muted; if (audio.voice) audio.voice.muted = audio.muted;
};
let capTimer;
function speak(c) {
  $('capName').textContent = c.name; $('capLine').textContent = c.line; show('caption');
  clearTimeout(capTimer); capTimer = setTimeout(() => show('caption', false), 4200);
  if (audio.voice) audio.voice.pause();
  if (c.audio) {
    const v = new Audio(c.audio); v.muted = audio.muted; audio.voice = v;
    if (audio.music) audio.music.volume = 0.18;
    const restore = () => { if (audio.music) audio.music.volume = 0.45; };
    v.onended = restore; v.onerror = restore; v.play().catch(restore);
  }
}
function enableTap(el, camera, world) {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let sx = 0, sy = 0, st = 0;
  el.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = performance.now(); });
  el.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10 || performance.now() - st > 600) return;   // a drag, not a tap
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    world.root.updateMatrixWorld(true); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(world.hit, false)[0];
    if (h) { const c = h.object.userData.char; world.poke(c, now()); speak(c); }
  });
}

// ------------------------------------------------------------------ device motion (gyro)
class Gyro {
  constructor() {
    this.q = new THREE.Quaternion(); this.has = false;
    const eu = new THREE.Euler(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), q0 = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    this.h = e => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * DEG;
      eu.set(e.beta * DEG, e.alpha * DEG, -e.gamma * DEG, 'YXZ');
      this.q.setFromEuler(eu).multiply(q1).multiply(q0.setFromAxisAngle(z, -orient)); this.has = true;
    };
  }
  start() { window.addEventListener('deviceorientation', this.h, true); }
}
async function motionPermission() {        // iOS needs an explicit prompt, triggered by a tap
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') { try { return (await D.requestPermission()) === 'granted'; } catch { return false; } }
  return !!D;
}

// ------------------------------------------------------------------ poster target (targets.mind)
async function getTargetURL() {
  if (await exists('targets.mind')) return 'targets.mind';
  // no pre-compiled file: try compiling in the browser (slow; official offline tool is more reliable)
  setMsg('Learning the poster…');
  const src = 'https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/dist/mindar-image.prod.js';
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('compiler script did not load')); document.head.appendChild(s); });
  const Compiler = window.MINDAR && window.MINDAR.IMAGE && window.MINDAR.IMAGE.Compiler;
  if (!Compiler) throw new Error('compiler not available');
  const img = new Image(); img.src = L.poster.img; await img.decode();
  const c = new Compiler(); await c.compileImageTargets([img], p => setMsg(`Learning the poster… ${Math.round(p)}%`));
  return URL.createObjectURL(new Blob([await c.exportData()]));
}

// ------------------------------------------------------------------ AR mode: box anchored to the tracked poster
async function startAR(motionOK) {
  show('start', false); show('loading'); setMsg('Loading scene…');
  let world, targetURL, MindARThree;
  try {
    world = await buildBox(L, { onProgress: p => setMsg(`Loading scene… ${Math.round(p * 100)}%`) });
    targetURL = await getTargetURL();
    ({ MindARThree } = await import('mindar-image-three'));
  } catch (e) {
    console.warn('Tracking unavailable, using placement mode:', e);
    toast('Poster tracking file not found — using placement mode. See README to enable tracking.', 8000);
    return startPlacement({ camera: true, motionOK });
  }
  try {
    const mindar = new MindARThree({ container: stage, imageTargetSrc: targetURL, maxTrack: 1,
      filterMinCF: 0.0005, filterBeta: 100, missTolerance: 15, warmupTolerance: 5, uiLoading: 'no', uiScanning: 'no', uiError: 'no' });
    const { renderer, scene, camera } = mindar;
    const anchor = mindar.addAnchor(0);
    world.root.matrixAutoUpdate = false; world.root.visible = false; scene.add(world.root);
    let found = false, wasFound = false, hasPose = false;
    anchor.onTargetFound = () => { found = true; };
    anchor.onTargetLost = () => { found = false; };
    await mindar.start();
    show('loading', false); hint('Point the camera at the poster');
    const gyro = new Gyro(); if (motionOK) gyro.start();
    const lastM = new THREE.Matrix4(), tmp = new THREE.Matrix4(), q0 = new THREE.Quaternion(), rel = new THREE.Quaternion();
    const flip = params.has('gyroflip');
    enableTap(renderer.domElement, camera, world);
    renderer.setAnimationLoop(() => {
      if (found) {
        world.root.matrix.copy(anchor.group.matrix); lastM.copy(world.root.matrix);
        if (!hasPose) { hasPose = true; hint('Look around — tap a character'); setTimeout(() => hint(''), 5000); }
        else if (!wasFound) hint('');
      } else if (hasPose && gyro.has && !params.has('nogyro')) {
        // poster left the camera view: keep the box fixed in space using the gyroscope
        if (wasFound) { q0.copy(gyro.q); hint('Poster out of view — keep exploring, or aim back at it'); }
        if (flip) rel.copy(q0).invert().multiply(gyro.q); else rel.copy(gyro.q).invert().multiply(q0);
        world.root.matrix.copy(tmp.makeRotationFromQuaternion(rel).multiply(lastM));
      }
      wasFound = found; world.root.visible = hasPose; world.root.matrixWorldNeedsUpdate = true;
      world.update(now(), camera); renderer.render(scene, camera);
    });
  } catch (e) {
    console.error(e);
    const denied = /denied|NotAllowed|Permission/i.test(String(e));
    if (denied) return fail('Camera permission was denied. Allow camera access in your browser settings, then try again.');
    stage.innerHTML = ''; toast('Poster tracking could not start — using placement mode.', 8000);
    return startPlacement({ camera: true, motionOK });
  }
}

// ------------------------------------------------------------------ Placement / preview mode (no poster tracking)
async function startPlacement({ camera: useCam, motionOK }) {
  show('start', false); show('loading'); setMsg('Loading scene…');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0);
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 60);
  const scene = new THREE.Scene();
  let world;
  try { world = await buildBox(L, { withPoster: true, onProgress: p => setMsg(`Loading scene… ${Math.round(p * 100)}%`) }); }
  catch (e) { return fail('Could not load the scene images: ' + e.message); }
  let dist = 2.1; world.root.position.set(0, 0, -dist); scene.add(world.root);
  if (useCam) {
    try {
      const v = document.createElement('video'); v.setAttribute('playsinline', ''); v.muted = true; v.autoplay = true;
      v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      stage.appendChild(v); await v.play();
    } catch (e) { toast('Camera unavailable — showing the scene on a dark background'); }
  }
  stage.appendChild(renderer.domElement);
  const gyro = new Gyro(); if (motionOK) gyro.start();
  let ref = null, yaw = 0, pitch = 0; const pts = new Map(); let lastPinch = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); });
  el.addEventListener('pointerup', e => { pts.delete(e.pointerId); lastPinch = 0; });
  el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); lastPinch = 0; });
  el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId); pts.set(e.pointerId, e);
    if (pts.size === 1) { yaw += (e.clientX - p.clientX) * 0.005; pitch += (e.clientY - p.clientY) * 0.005; pitch = Math.max(-1.2, Math.min(1.2, pitch)); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (lastPinch) dist = Math.max(1.2, Math.min(4, dist * lastPinch / d)); lastPinch = d; world.root.position.z = -dist; }
  });
  el.addEventListener('wheel', e => { dist = Math.max(1.2, Math.min(4, dist * (1 + e.deltaY * 0.001))); world.root.position.z = -dist; }, { passive: true });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  enableTap(el, cam, world);
  show('loading', false);
  hint(motionOK ? 'Move your phone to look around · tap a character' : 'Drag to look around · pinch to zoom · tap a character'); setTimeout(() => hint(''), 6000);
  const base = new THREE.Quaternion(), d = new THREE.Quaternion(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
  renderer.setAnimationLoop(() => {
    base.identity();
    if (gyro.has) { if (!ref) ref = gyro.q.clone().invert(); base.copy(ref).multiply(gyro.q); }
    eu.set(pitch, yaw, 0); d.setFromEuler(eu); cam.quaternion.copy(d).multiply(base);
    world.root.updateMatrixWorld(true); world.update(now(), cam); renderer.render(scene, cam);
  });
}

// ------------------------------------------------------------------ boot
$('btnStart').onclick = async () => {
  const motionOK = await motionPermission();    // must be first: iOS only allows this inside the tap
  startMusic();
  startAR(motionOK);
};
$('btnPreview').onclick = async () => { const motionOK = await motionPermission(); startMusic(); startPlacement({ camera: false, motionOK }); };
(async () => {
  try { L = await (await fetch('layout.json', { cache: 'no-store' })).json(); }
  catch (e) { return fail('Could not load layout.json — make sure it is uploaded next to index.html.'); }
  if (params.has('preview')) startPlacement({ camera: false, motionOK: false }); else startIntro();
})();
