// Builds the "shadow box": the poster is the BACK wall; top / bottom / left / right are extensions of the
// poster's world that flare out toward the viewer. Characters stand on the floor.
// Units: 1 = poster width. Poster centre = (0,0,0). +x right, +y up, +z toward the viewer.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const loadTex = url => new Promise((res, rej) => loader.load(url, t => {
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; res(t);
}, undefined, () => rej(new Error('Could not load ' + url))));

// crop an image to a target aspect ("object-fit: cover"), centred on `focus` (fractions, y from the top)
function coverRect(imgAspect, targetAspect, focus) {
  let w = 1, h = 1;
  if (imgAspect > targetAspect) w = targetAspect / imgAspect; else h = imgAspect / targetAspect;
  const cx = Math.min(Math.max(focus[0], w / 2), 1 - w / 2);
  const cy = Math.min(Math.max(1 - focus[1], h / 2), 1 - h / 2);   // flip: three.js v=0 is the bottom
  return [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
}

// Flat grid whose vertices follow P(u,v); (u,v) are IMAGE coordinates (v=0 bottom). Subdivided so the texture
// bends smoothly across the trapezoid instead of showing a diagonal seam.
function gridMesh(P, rect, map, shade, n = 18, nv = n, matOpts = {}) {
  const pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= n; i++) {
    const u = i / n, v = j / nv, p = P(u, v), s = shade(p.z);
    pos.push(p.x, p.y, p.z); col.push(s, s, s);
    uv.push(rect[0] + (rect[1] - rect[0]) * u, rect[2] + (rect[3] - rect[2]) * v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, vertexColors: true, side: THREE.DoubleSide, toneMapped: false, ...matOpts }));
}

export async function buildBox(L, { withPoster = false, onProgress = () => {} } = {}) {
  const W0 = L.poster.w, H0 = L.poster.h, D = L.box.depth, W1 = L.box.frontW, H1 = L.box.frontH;
  const dim = L.box.dimFront ?? 0.55;
  const shade = z => 1 - (1 - dim) * Math.max(0, Math.min(1, z / D));
  const lerp = (a, b, t) => a + (b - a) * t;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const floorY = z => -(H0 / 2 + (H1 - H0) / 2 * (z / D));
  const root = new THREE.Group();
  const total = 4 + L.characters.length + (withPoster ? 1 : 0); let done = 0;
  const tick = () => onProgress(++done / total);

  // ---- walls (each is an extension of the poster: the image edge that touches the poster sits on the poster edge)
  const lenSide = Math.hypot(D, (W1 - W0) / 2), lenVert = Math.hypot(D, (H1 - H0) / 2);
  const walls = {
    top: { // image bottom meets poster top; image top is at the viewer
      aspect: ((W0 + W1) / 2) / lenVert,
      P: (u, v) => { const b = V(-W0 / 2 + u * W0, H0 / 2, 0), f = V(-W1 / 2 + u * W1, H1 / 2, D); return b.lerp(f, v); } },
    bottom: { // floor: image top meets poster bottom; image bottom is at the viewer
      aspect: ((W0 + W1) / 2) / lenVert,
      P: (u, v) => { const b = V(-W0 / 2 + u * W0, -H0 / 2, 0), f = V(-W1 / 2 + u * W1, -H1 / 2, D); return b.lerp(f, 1 - v); } },
    left: { // image right edge meets poster left edge
      aspect: lenSide / ((H0 + H1) / 2),
      P: (u, v) => { const b = V(-W0 / 2, -H0 / 2 + v * H0, 0), f = V(-W1 / 2, -H1 / 2 + v * H1, D); return b.lerp(f, 1 - u); } },
    right: { // image left edge meets poster right edge
      aspect: lenSide / ((H0 + H1) / 2),
      P: (u, v) => { const b = V(W0 / 2, -H0 / 2 + v * H0, 0), f = V(W1 / 2, -H1 / 2 + v * H1, D); return b.lerp(f, u); } },
  };
  for (const [name, w] of Object.entries(walls)) {
    const cfg = L.walls[name], map = await loadTex(cfg.img);
    const rect = coverRect(map.image.width / map.image.height, w.aspect * (cfg.squash ?? 1), cfg.focus || [0.5, 0.5]);
    const m = gridMesh(w.P, rect, map, shade); m.name = 'wall-' + name; root.add(m); tick();
  }

  // ---- red lattice railings along both edges of the bridge (real 3D, so they sell the depth)
  if (L.railing) {
    const rmap = await loadTex(L.railing.img), rh = L.railing.height ?? 0.3;
    for (const sgn of [-1, 1]) {
      const P = (u, v) => { const b = V(sgn * W0 / 2, -H0 / 2, 0).lerp(V(sgn * W1 / 2, -H1 / 2, D), 1 - u); b.y += v * rh; return b; };
      // u=0 -> viewer end, u=1 -> poster end of the texture so posts line up on both sides
      const m = gridMesh(P, [0, 1, 0, 1], rmap, shade, 10, 1, { transparent: true, alphaTest: 0.02, depthWrite: false });
      m.renderOrder = -1; m.name = 'rail'; root.add(m);
    }
  }

  if (withPoster) {   // stand-in for the physical poster when there is no tracking (preview / placement mode)
    const map = await loadTex(L.poster.img);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W0, H0), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
    m.position.z = 0.001; root.add(m); tick();
  }

  // ---- characters: upright cut-outs standing on the (sloped) floor
  const slope = Math.atan(((H1 - H0) / 2) / D);
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const chars = [], hit = [];
  for (const c of L.characters) {
    const map = await loadTex(c.img), w = c.h * map.image.width / map.image.height;
    const g = new THREE.Group(); const baseY = floorY(c.z) + c.h / 2; g.position.set(c.x, baseY, c.z);
    const body = new THREE.Mesh(new THREE.PlaneGeometry(w, c.h),
      new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.06, toneMapped: false }));
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.15, Math.max(w * 0.32, 0.08)),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2 + slope; shadow.position.set(0, -c.h / 2 + 0.004, 0.004);
    g.add(shadow, body); root.add(g);
    body.userData.char = c; hit.push(body);
    chars.push({ g, body, c, baseY, phase: Math.random() * 6.28, hop: -10 }); tick();
  }

  const camLocal = new THREE.Vector3();
  function update(t, camera) {
    camera.getWorldPosition(camLocal); root.worldToLocal(camLocal);
    for (const k of chars) {
      const yaw = Math.atan2(camLocal.x - k.g.position.x, Math.max(camLocal.z - k.g.position.z, 0.3));
      k.body.rotation.y = Math.max(-0.55, Math.min(0.55, yaw));
      const since = t - k.hop, bounce = since >= 0 && since < 0.45 ? Math.sin(since / 0.45 * Math.PI) * 0.07 : 0;
      k.g.position.y = k.baseY + Math.sin(t * 1.3 + k.phase) * 0.004 + bounce;
    }
  }
  const poke = (c, t) => { const k = chars.find(k => k.c === c); if (k) k.hop = t; };
  return { root, update, hit, poke };
}
