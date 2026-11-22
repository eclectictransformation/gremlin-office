/* The Wander — Pip's Workshop sandbox. An endless, humming, yellow office maze.
   Original procedural art (canvas-drawn), no network, nothing saved but a sound preference. */
(() => {
  'use strict';
  const T = window.THREE;
  const $ = (id) => document.getElementById(id);
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (TOUCH) document.body.classList.add('touch');

  // ---------- world rules ----------
  const C = 4, H = 3, WT = 0.18, CH = 4;           // cell size, wall height, wall thickness, cells per chunk
  const RAD = 2;                                    // chunks kept around you
  let seed = (Math.random() * 1e9) >>> 0;
  function hash(a, b, c) {                          // deterministic 0..1 for (seed, a, b, c)
    let h = (seed ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const mod = (n, m) => ((n % m) + m) % m;
  const isRoom = (i, j) => hash(Math.floor(i / 4), Math.floor(j / 4), 7) < 0.16;   // big open pillar rooms
  // wall on the east edge of cell (i,j)?  highways every 6 rows keep the maze walkable
  function wallE(i, j) { if (mod(j, 6) === 0) return false; if (isRoom(i, j) && isRoom(i + 1, j)) return false; return hash(i, j, 1) < 0.36; }
  function wallS(i, j) { if (mod(i, 6) === 0) return false; if (isRoom(i, j) && isRoom(i, j + 1)) return false; return hash(i, j, 2) < 0.36; }
  const pillar = (i, j) => isRoom(i, j) && isRoom(i - 1, j - 1) && mod(i, 2) === 0 && mod(j, 2) === 0;
  const lightAt = (i, j) => hash(i, j, 3) < 0.62;
  const flickerAt = (i, j) => lightAt(i, j) && hash(i, j, 4) < 0.08;

  // ---------- odd finds ----------
  const FINDS = [
    { k: 'chair', say: 'An office chair, facing the wall. The seat is still warm.' },
    { k: 'sign', say: 'A wet floor sign. The floor is completely dry.' },
    { k: 'phone', say: 'A desk phone on the carpet. The cord goes straight into the wall.' },
    { k: 'plant', say: 'A plastic plant. Someone has been watering it anyway.' },
    { k: 'note', say: 'A sticky note on the carpet: “back in 5”. No date.' },
    { k: 'clock', say: 'A wall clock leaning on the floor. It says 3:00. They all say 3:00.' },
    { k: 'mug', say: 'A mug that reads WORLD’S OKAYEST GREMLIN. Still steaming.' },
    { k: 'door', say: 'A door. It is painted on. It is a very good painting.' },
  ];
  const findAt = (i, j) => (hash(i, j, 5) < 0.07) ? FINDS[Math.floor(hash(i, j, 6) * FINDS.length)] : null;
  
  // ---------- procedural textures ----------
  function cvs(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
  function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function tex(c, rep) { const t = new T.CanvasTexture(c); t.magFilter = T.NearestFilter; t.minFilter = T.NearestMipmapNearestFilter; t.colorSpace = T.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t; }
  const wallTex = tex(cvs(64, 64, (x, w, h) => {
    const r = rng(11); x.fillStyle = '#c9b65e'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) { x.fillStyle = 'rgba(120,100,30,.16)'; x.fillRect(i, 0, 2, h); x.fillStyle = 'rgba(255,240,170,.10)'; x.fillRect(i + 4, 0, 1, h); }
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},20,${r() * 0.08})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let y = 4; y < h; y += 16) for (let i = 0; i < w; i += 8) { x.fillStyle = 'rgba(150,125,40,.22)'; x.fillRect(i + 2 + ((y / 16) % 2) * 4, y, 2, 2); }
    x.fillStyle = 'rgba(80,60,20,.35)'; x.fillRect(0, h - 4, w, 4);        // skirting shadow
  }), true);
  const floorTex = tex(cvs(64, 64, (x, w, h) => {
    const r = rng(23); x.fillStyle = '#8f7f3c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = r(); x.fillStyle = v < .5 ? 'rgba(60,50,15,.18)' : 'rgba(190,170,90,.14)'; x.fillRect(r() * w | 0, r() * h | 0, 1, 1); }
    x.fillStyle = 'rgba(70,58,20,.12)'; x.beginPath(); x.ellipse(40, 22, 14, 9, .4, 0, 7); x.fill();   // damp patch
  }), true);
  const ceilTex = tex(cvs(64, 64, (x, w, h) => {
    const r = rng(37); x.fillStyle = '#d8d0a8'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(120,110,70,${r() * 0.18})`; x.fillRect(r() * w | 0, r() * h | 0, 1, 1); }
    x.fillStyle = '#a89f78'; x.fillRect(0, 0, w, 2); x.fillRect(0, 0, 2, h); x.fillRect(0, 31, w, 2); x.fillRect(31, 0, 2, h);
  }), true);
  const lightTex = tex(cvs(16, 16, (x) => { x.fillStyle = '#fff8d8'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#f2e6a8'; for (let i = 1; i < 16; i += 3) x.fillRect(i, 1, 1, 14); x.fillStyle = '#b8ad80'; x.strokeStyle = '#b8ad80'; x.lineWidth = 2; x.strokeRect(0, 0, 16, 16); }));

  function findSprite(k) {
    const c = cvs(32, 32, (x) => {
      const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
      const K = '#1a1a18';
      if (k === 'chair') { R(K, 9, 4, 14, 13); R('#4a5a7a', 10, 5, 12, 11); R(K, 8, 17, 16, 4); R('#4a5a7a', 9, 18, 14, 2); R(K, 15, 21, 2, 6); R(K, 9, 27, 14, 2); R(K, 8, 29, 3, 2); R(K, 21, 29, 3, 2); }
      if (k === 'sign') { R(K, 10, 3, 12, 27); R('#ffd21a', 11, 4, 10, 25); R(K, 13, 9, 6, 6); R('#ffd21a', 15, 10, 2, 3); R(K, 13, 18, 6, 1); R(K, 12, 22, 8, 1); R(K, 9, 29, 3, 2); R(K, 20, 29, 3, 2); }
      if (k === 'phone') { R(K, 6, 18, 20, 11); R('#cfc8b4', 7, 19, 18, 9); R(K, 7, 15, 18, 4); R('#cfc8b4', 8, 16, 16, 2); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) R('#666', 10 + i * 4, 21 + j * 3, 2, 2); R(K, 25, 26, 6, 1); }
      if (k === 'plant') { R(K, 10, 21, 12, 10); R('#b8775a', 11, 22, 10, 8); R('#3d8a3a', 15, 6, 2, 15); R('#4fae4a', 9, 9, 6, 4); R('#4fae4a', 17, 6, 6, 4); R('#4fae4a', 8, 15, 7, 3); R('#4fae4a', 17, 13, 7, 3); R('#2e6b26', 12, 3, 4, 4); }
      if (k === 'note') { R(K, 8, 14, 16, 16); R('#ffe36a', 9, 15, 14, 14); R('#555', 11, 18, 9, 1); R('#555', 11, 21, 7, 1); R('#555', 11, 24, 10, 1); }
      if (k === 'clock') { R(K, 7, 9, 18, 18); R('#f6f1e0', 8, 10, 16, 16); R(K, 15, 12, 2, 7); R(K, 15, 17, 6, 2); R('#b33', 15, 17, 2, 2); R(K, 9, 27, 14, 3); }
      if (k === 'mug') { R(K, 9, 15, 13, 15); R('#f1ede2', 10, 16, 11, 13); R(K, 22, 18, 4, 8); R('#f1ede2', 22, 19, 2, 6); R('#b8775a', 11, 21, 9, 2); R('rgba(255,255,255,.7)', 12, 9, 2, 4); R('rgba(255,255,255,.7)', 16, 6, 2, 6); }
      if (k === 'door') { R(K, 7, 0, 18, 32); R('#7a5a3a', 8, 1, 16, 31); R('#8f6c48', 10, 3, 12, 11); R('#8f6c48', 10, 17, 12, 12); R('#e0c040', 20, 16, 2, 3); R('rgba(255,255,255,.25)', 8, 1, 2, 31); }
    });
    const m = new T.SpriteMaterial({ map: tex(c), transparent: true, alphaTest: 0.5, fog: true });
    const s = new T.Sprite(m); return s;
  }

  // ---------- renderer / scene ----------
  const canvas = $('view');
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const FOG = new T.Color('#4a4220');
  const scene = new T.Scene(); scene.background = FOG.clone(); scene.fog = new T.Fog(FOG.clone(), 2.5, 24);
  const camera = new T.PerspectiveCamera(72, 1, 0.05, 60);
  const wallMat = new T.MeshBasicMaterial({ map: wallTex, vertexColors: true });
  const floorMat = new T.MeshBasicMaterial({ map: floorTex, vertexColors: true });
  const ceilMat = new T.MeshBasicMaterial({ map: ceilTex, vertexColors: true });
  const lightMat = new T.MeshBasicMaterial({ map: lightTex, fog: false });
  const flickMat = new T.MeshBasicMaterial({ map: lightTex, fog: false });
  const BASE = new T.Color(1, 1, 1);

  function GeoBuf() { return { p: [], u: [], c: [] }; }
  // quad from 4 corners (counter-clockwise as seen from the visible side) with uv rect and per-vertex shade
  function quad(g, a, b, c, d, uv, sh) {
    const P = [a, b, c, a, c, d], U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    const S = [sh[0], sh[1], sh[2], sh[0], sh[2], sh[3]];
    for (let i = 0; i < 6; i++) { g.p.push(P[i][0], P[i][1], P[i][2]); g.u.push(U[i][0], U[i][1]); g.c.push(S[i], S[i], S[i] * 0.94); }
  }
  function toMesh(g, mat) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(g.p, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(g.u, 2));
    geo.setAttribute('color', new T.Float32BufferAttribute(g.c, 3));
    return new T.Mesh(geo, mat);
  }
  const LO = 0.62, HI = 1.0;                         // walls darker near the carpet
  // vertical wall face from (x0,z0) to (x1,z1), facing its left-hand normal
  function face(g, x0, z0, x1, z1, len) { quad(g, [x0, 0, z0], [x1, 0, z1], [x1, H, z1], [x0, H, z0], [0, 0, len / 2, 1], [LO, LO, HI, HI]); }
  function box(g, x0, z0, x1, z1) {                  // axis-aligned wall box, four sides
    const lx = x1 - x0, lz = z1 - z0;
    face(g, x0, z1, x1, z1, lx); face(g, x1, z0, x0, z0, lx); face(g, x1, z1, x1, z0, lz); face(g, x0, z0, x0, z1, lz);
  }
  function rectsInCell(i, j, out) {                  // collision rects (x0,z0,x1,z1) owned by cell (i,j)
    const x = i * C, z = j * C, h = WT / 2;
    if (wallE(i, j)) out.push([x + C - h, z - h, x + C + h, z + C + h]);
    if (wallS(i, j)) out.push([x - h, z + C - h, x + C + h, z + C + h]);
    if (pillar(i, j)) out.push([x - 0.35, z - 0.35, x + 0.35, z + 0.35]);
    return out;
  }

  const chunks = new Map();
  const live = [];                                    // finds currently in the world {s, f, key, x, z}
  function buildChunk(ci, cj) {
    const grp = new T.Group(); const gw = GeoBuf(), gf = GeoBuf(), gc = GeoBuf(), gl = GeoBuf(), gk = GeoBuf();
    const x0 = ci * CH * C, z0 = cj * CH * C, S = CH * C;
    quad(gf, [x0, 0, z0 + S], [x0 + S, 0, z0 + S], [x0 + S, 0, z0], [x0, 0, z0], [x0 / 3, -(z0 + S) / 3, (x0 + S) / 3, -z0 / 3], [1, 1, 1, 1]);
    quad(gc, [x0, H, z0], [x0 + S, H, z0], [x0 + S, H, z0 + S], [x0, H, z0 + S], [x0 / 2, z0 / 2, (x0 + S) / 2, (z0 + S) / 2], [.9, .9, .9, .9]);
    const finds = [];
    for (let a = 0; a < CH; a++) for (let b = 0; b < CH; b++) {
      const i = ci * CH + a, j = cj * CH + b; const r = rectsInCell(i, j, []);
      for (const q of r) box(gw, q[0], q[1], q[2], q[3]);
      if (lightAt(i, j)) {
        const cx = i * C + C / 2, cz = j * C + C / 2, w = 0.7, l = 1.3, y = H - 0.01;
        quad(flickerAt(i, j) ? gk : gl, [cx - w, y, cz - l], [cx + w, y, cz - l], [cx + w, y, cz + l], [cx - w, y, cz + l], [0, 0, 1, 1], [1, 1, 1, 1]);
      }
      const f = findAt(i, j);
      if (f) {
        const s = findSprite(f.k); const big = (f.k === 'door' || f.k === 'clock') ? 1.1 : 0.8;
        const fx = i * C + 1 + hash(i, j, 8) * (C - 2), fz = j * C + 1 + hash(i, j, 9) * (C - 2);
        s.scale.set(big, big, 1); s.position.set(fx, big / 2 - 0.02, fz); grp.add(s);
        finds.push({ s, f, key: i + ',' + j, x: fx, z: fz });
      }
    }
    grp.add(toMesh(gf, floorMat), toMesh(gc, ceilMat), toMesh(gw, wallMat));
    if (gl.p.length) grp.add(toMesh(gl, lightMat));
    if (gk.p.length) grp.add(toMesh(gk, flickMat));
    scene.add(grp);
    return { grp, finds };
  }
  function dropChunk(key) {
    const ch = chunks.get(key); if (!ch) return;
    scene.remove(ch.grp);
    ch.grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    chunks.delete(key);
  }
  let lastChunk = '';
  function stream(force) {
    const ci = Math.floor(me.x / (CH * C)), cj = Math.floor(me.z / (CH * C)); const k = ci + ',' + cj;
    if (!force && k === lastChunk) return; lastChunk = k;
    const want = new Set();
    for (let a = -RAD; a <= RAD; a++) for (let b = -RAD; b <= RAD; b++) { const kk = (ci + a) + ',' + (cj + b); want.add(kk); if (!chunks.has(kk)) chunks.set(kk, buildChunk(ci + a, cj + b)); }
    for (const kk of [...chunks.keys()]) if (!want.has(kk)) dropChunk(kk);
    live.length = 0; for (const ch of chunks.values()) live.push(...ch.finds);
  }

  // ---------- you ----------
  const me = { x: 0, z: 0, yaw: 0, pitch: 0, r: 0.28, bob: 0, eye: 1.55 };
  const seen = new Set(); let target = null, stuckT = 0;
  function collide() {
    const ci = Math.floor(me.x / C), cj = Math.floor(me.z / C); const rects = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) rectsInCell(ci + a, cj + b, rects);
    for (const q of rects) {
      const nx = Math.max(q[0], Math.min(me.x, q[2])), nz = Math.max(q[1], Math.min(me.z, q[3]));
      const dx = me.x - nx, dz = me.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < me.r * me.r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), p = (me.r - d) / d; me.x += dx * p; me.z += dz * p; }
        else { const l = me.x - q[0], rr = q[2] - me.x, t = me.z - q[1], bb = q[3] - me.z, m = Math.min(l, rr, t, bb);
          if (m === l) me.x = q[0] - me.r; else if (m === rr) me.x = q[2] + me.r; else if (m === t) me.z = q[1] - me.r; else me.z = q[3] + me.r; }
      }
    }
  }
  function openCell(i, j) {   // a cell with at least two open sides, so you never start boxed in
    let open = 0; if (!wallE(i, j)) open++; if (!wallE(i - 1, j)) open++; if (!wallS(i, j)) open++; if (!wallS(i, j - 1)) open++;
    return open >= 2;
  }
  function newSpot(s) {
    seed = (s == null ? (Math.random() * 1e9) >>> 0 : s >>> 0);
    for (const k of [...chunks.keys()]) dropChunk(k);
    let i = Math.floor(hash(1, 2, 3) * 500) - 250, j = Math.floor(hash(4, 5, 6) * 500) - 250;
    for (let n = 0; n < 50 && !openCell(i, j); n++) i++;
    me.x = i * C + C / 2; me.z = j * C + C / 2; me.yaw = hash(7, 8, 9) * Math.PI * 2; me.pitch = 0; target = null;
    seen.clear(); updFinds(); lastChunk = ''; stream(true);
    $('spot').textContent = 'spot #' + seed.toString(36).toUpperCase();
    toast(pickLine());
  }
  const ARRIVE = ['Somewhere new. It hums the same.', 'You blink. The carpet is a slightly different beige.', 'New spot. Same lights. Different nothing.', 'You are here. Wherever here is.'];
  const pickLine = () => ARRIVE[Math.floor(hash(9, 9, 9) * ARRIVE.length)];

  // ---------- HUD ----------
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); toastT = 4.2; }
  function updFinds() { $('finds').textContent = 'Odd finds: ' + seen.size; }

  // ---------- sound: a low office hum, made on the spot ----------
  let AC = null, master = null, soundOn = true;
  try { soundOn = localStorage.getItem('workshopWanderSound') !== 'off'; } catch (e) {}
  function startAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    AC = new Ctx(); master = AC.createGain(); master.gain.value = soundOn ? 0.5 : 0; master.connect(AC.destination);
    const hum = (f, g) => { const o = AC.createOscillator(), v = AC.createGain(); o.type = 'sine'; o.frequency.value = f; v.gain.value = g; o.connect(v); v.connect(master); o.start(); };
    hum(60, 0.06); hum(120, 0.035); hum(180.5, 0.012);
    const len = AC.sampleRate * 2, b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    const n = AC.createBufferSource(); n.buffer = b; n.loop = true; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const ng = AC.createGain(); ng.gain.value = 0.02; n.connect(lp); lp.connect(ng); ng.connect(master); n.start();
  }
  function buzz() {
    if (!AC || !soundOn) return;
    const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.value = 120;
    g.gain.setValueAtTime(0.025, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.12);
    o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + 0.13);
  }
  function setSound(on) {
    soundOn = on; try { localStorage.setItem('workshopWanderSound', on ? 'on' : 'off'); } catch (e) {}
    const b = $('btn-sound'); b.textContent = 'Sound: ' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    if (master) master.gain.value = on ? 0.5 : 0;
  }

  // ---------- input ----------
  const keys = {}; let holdWalk = false, locked = false;
  addEventListener('keydown', (e) => { if (e.target.closest && e.target.closest('.card')) return; keys[e.code] = true; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); if (e.code === 'KeyN' && started) newSpot(); });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; holdWalk = false; });
  const drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (!started) return; startAudio();
    if (!TOUCH && e.pointerType === 'mouse' && canvas.requestPointerLock && !locked) { try { canvas.requestPointerLock(); } catch (er) {} }
    drag.id = e.pointerId; drag.x = drag.sx = e.clientX; drag.y = drag.sy = e.clientY; drag.t = performance.now(); drag.moved = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (locked) { look(e.movementX, e.movementY, 0.0025); return; }
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    look(dx, dy, TOUCH ? 0.006 : 0.004);
  });
  const endDrag = (e) => {
    if (e.pointerId !== drag.id) return; drag.id = null;
    if (!locked && drag.moved < 10 && performance.now() - drag.t < 450) tapWalk(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', (e) => { if (e.pointerId === drag.id) drag.id = null; });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  function look(dx, dy, s) { me.yaw -= dx * s; me.pitch = Math.max(-1.2, Math.min(1.2, me.pitch - dy * s)); }
  const hold = $('btn-walk');
  hold.addEventListener('pointerdown', (e) => { e.preventDefault(); startAudio(); holdWalk = true; target = null; hold.classList.add('on'); try { hold.setPointerCapture(e.pointerId); } catch (er) {} });
  const unhold = () => { holdWalk = false; hold.classList.remove('on'); };
  hold.addEventListener('pointerup', unhold); hold.addEventListener('pointercancel', unhold); hold.addEventListener('lostpointercapture', unhold);
  const tmp = new T.Vector3();
  function tapWalk(cx, cy) {                       // tap the carpet: walk there in a straight line
    const r = canvas.getBoundingClientRect();
    tmp.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const dx = tmp.x - ox, dy = tmp.y - oy, dz = tmp.z - oz;
    let tx, tz;
    if (dy < -1e-4) { const t = -oy / dy; tx = ox + dx * t; tz = oz + dz * t; }
    else { const l = Math.hypot(dx, dz) || 1; tx = ox + dx / l * 8; tz = oz + dz / l * 8; }   // tapped the horizon: head that way
    const d = Math.hypot(tx - me.x, tz - me.z); if (d > 18) { tx = me.x + (tx - me.x) / d * 18; tz = me.z + (tz - me.z) / d * 18; }
    target = { x: tx, z: tz }; stuckT = 0;
    const ring = $('ring'); ring.style.left = cx + 'px'; ring.style.top = cy + 'px'; ring.hidden = false; ringT = 0.6;
  }
  let ringT = 0;

  // ---------- loop ----------
  let started = false, last = performance.now(), flickT = 1, flickOn = true, globalDim = 0;
  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 82 : 72; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (started) step(dt);
    camera.position.set(me.x, me.eye + (RM ? 0 : Math.sin(me.bob) * 0.035), me.z);
    camera.rotation.order = 'YXZ'; camera.rotation.set(me.pitch, me.yaw, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function step(dt) {
    let fx = 0, fz = 0; const sp = (keys.ShiftLeft || keys.ShiftRight) ? 3.4 : 2.0;
    const f = (keys.KeyW || keys.ArrowUp || holdWalk ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (keys.ArrowLeft) me.yaw += 1.8 * dt; if (keys.ArrowRight) me.yaw -= 1.8 * dt;
    const sx = Math.sin(me.yaw), cz = Math.cos(me.yaw);
    if (f || s) { target = null; fx = (-sx * f + cz * s); fz = (-cz * f - sx * s); }
    else if (target) {
      const dx = target.x - me.x, dz = target.z - me.z, d = Math.hypot(dx, dz);
      if (d < 0.25) target = null; else { fx = dx / d; fz = dz / d; const want = Math.atan2(-dx, -dz); let dy = want - me.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); me.yaw += dy * Math.min(1, dt * 3); }
    }
    const l = Math.hypot(fx, fz);
    if (l > 0) {
      const px = me.x, pz = me.z; me.x += fx / l * sp * dt; me.z += fz / l * sp * dt; collide();
      const moved = Math.hypot(me.x - px, me.z - pz); me.bob += moved * 5.5;
      if (target) { if (moved < sp * dt * 0.25) { stuckT += dt; if (stuckT > 0.5) { target = null; toast('A wall. Of course.'); } } else stuckT = 0; }
    }
    stream(false);
    // odd finds nearby
    for (const o of live) {
      if (seen.has(o.key)) continue;
      if (Math.hypot(o.x - me.x, o.z - me.z) < 1.7) { seen.add(o.key); updFinds(); toast(o.f.say); }
    }
    // flickering lights
    flickT -= dt;
    if (flickT <= 0) {
      if (RM) { flickOn = true; flickT = 999; }
      else { flickOn = !flickOn; flickT = flickOn ? 0.6 + Math.random() * 3.5 : 0.04 + Math.random() * 0.18; if (!flickOn) buzz(); }
    }
    flickMat.color.setScalar(flickOn ? 1 : 0.25);
    const target_dim = flickOn ? 0 : 0.06; globalDim += (target_dim - globalDim) * Math.min(1, dt * 20);
    const k = 1 - globalDim; wallMat.color.setScalar(k); floorMat.color.setScalar(k); ceilMat.color.setScalar(k);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
    if (ringT > 0) { ringT -= dt; if (ringT <= 0) $('ring').hidden = true; }
  }

  // ---------- start ----------
  $('how').textContent = TOUCH
    ? 'Drag to look around. Tap the carpet to walk there, or hold the walk button.'
    : 'WASD or arrow keys to walk, Shift to stroll faster. Click and move the mouse to look (Esc lets go). N for a new spot.';
  function begin() {
    $('intro').hidden = true; $('hud').hidden = false; started = true; startAudio(); setSound(soundOn); last = performance.now();
  }
  $('btn-start').addEventListener('click', begin);
  $('btn-new').addEventListener('click', () => { startAudio(); newSpot(); });
  $('btn-sound').addEventListener('click', () => { startAudio(); setSound(!soundOn); });
  $('btn-help').addEventListener('click', () => toast($('how').textContent));
  setSound(soundOn);
  newSpot(); $('toast').classList.remove('on'); toastT = 0;
  requestAnimationFrame(frame);
  $('btn-start').focus();

  // test hooks (read-only peeks)
  window.__wander = {
    state: () => ({ started, seed, x: me.x, z: me.z, yaw: me.yaw, finds: seen.size, chunks: chunks.size, target: !!target }),
    newSpot: (s) => newSpot(s),
    walk: (sec) => { holdWalk = true; setTimeout(() => { holdWalk = false; }, sec * 1000); },
  };
})();
