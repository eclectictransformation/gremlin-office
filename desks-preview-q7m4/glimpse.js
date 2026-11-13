// The Glimpse World ("The Underwood"): Grenshol's home on the far side of the portal the Gremlins found.
// Eclectic Transformation · Gremlin Desks only. A separate module + data file (data/glimpse-world.json) so it can
// grow into a bigger world later. Low-poly, instanced, no image assets, no lights that touch the Annex scene
// (it has its own THREE.Scene). Also exports the "weird lens" post-process used while you're in here.
export function createGlimpse(THREE, D, opts = {}) {
  const OX = opts.origin?.x ?? 5000, OZ = opts.origin?.z ?? 5000, P = D.palette || {};
  const scene = new THREE.Scene(); scene.background = new THREE.Color(P.bg || "#0e2a2c"); scene.fog = new THREE.FogExp2(P.fog || "#123638", P.fogDensity ?? 0.022);
  const root = new THREE.Group(); root.position.set(OX, 0, OZ); scene.add(root);
  scene.add(new THREE.HemisphereLight(P.hemiSky || "#7fe0d0", P.hemiGround || "#2a1840", P.hemi ?? 1.3)); scene.add(new THREE.AmbientLight("#ffffff", P.ambient ?? 0.35));
  const sun = new THREE.DirectionalLight(P.shaft || "#cfffe8", 0.7); sun.position.set(OX - 12, 40, OZ + 6); sun.target.position.set(OX, 0, OZ); scene.add(sun, sun.target);
  let seed = (D.seed | 0) || 1; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; const R = (a, b) => a + rnd() * (b - a);
  const disp = []; const keep = (x) => (disp.push(x), x);
  const lam = (color, o = {}) => keep(new THREE.MeshLambertMaterial({ color, flatShading: true, ...o }));
  const basic = (color, o = {}) => keep(new THREE.MeshBasicMaterial({ color, ...o }));
  const geo = (g) => keep(g);
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = root) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); parent.add(me); return me; };
  const tex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const S = D.size || 120, WH = D.walkHalf || 54, CV = D.cavern || {}, PL = D.plants || {}, WT = D.water || {};
  const lake = WT.lake || { x: 16, z: -18, r: 12 };
  const spots = (D.spots || []).map((s) => ({ ...s }));
  const nearSpot = (x, z, r) => spots.some((s) => Math.hypot(s.x - x, s.z - z) < r);
  const inLake = (x, z, pad = 0) => Math.hypot(x - lake.x, z - lake.z) < lake.r + pad;
  const blockers = []; // local rects (things you can't walk through)
  const block = (x, z, hw) => blockers.push({ x0: x - hw, x1: x + hw, z0: z - hw, z1: z + hw });

  // ---------- ground: flat where you walk, rising into hills at the cavern's edge ----------
  const gg = geo(new THREE.PlaneGeometry(S * 1.4, S * 1.4, 44, 44)); gg.rotateX(-Math.PI / 2);
  { const p = gg.attributes.position, col = [], c1 = new THREE.Color(P.ground || "#1f4a33"), c2 = new THREE.Color(P.ground2 || "#2c5e3a"), cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), e = Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - WH - 2);
      p.setY(i, e > 0 ? e * e * 0.06 + R(0, 1.2) : (inLake(x, z) ? -0.35 : R(-0.04, 0.04))); cc.copy(c1).lerp(c2, rnd()); col.push(cc.r, cc.g, cc.b); }
    gg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); gg.computeVertexNormals(); }
  mesh(gg, lam("#ffffff", { vertexColors: true }));

  // ---------- the cavern: a low dome, stalactites, glowworms, light shafts ----------
  const CR = CV.radius || 78, CH = CV.height || 46;
  const dg = geo(new THREE.SphereGeometry(CR, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)); dg.scale(1, CH / CR, 1);
  { const p = dg.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * R(0.96, 1.04), p.getY(i) * R(0.95, 1.03), p.getZ(i) * R(0.96, 1.04)); dg.computeVertexNormals(); }
  mesh(dg, lam("#231a33", { side: THREE.BackSide }));
  const domeY = (r) => CH * Math.sqrt(Math.max(0, 1 - (r / CR) ** 2));
  { const n = CV.stalactites || 60, sg = geo(new THREE.ConeGeometry(0.9, 6, 5)); sg.rotateX(Math.PI); sg.translate(0, -3, 0);
    const im = new THREE.InstancedMesh(sg, lam("#3a2d4a"), n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (let i = 0; i < n; i++) { const r = Math.sqrt(rnd()) * CR * 0.85, a = rnd() * Math.PI * 2, k = R(0.5, 1.8); ps.set(Math.cos(a) * r, domeY(r) + 1, Math.sin(a) * r); sc.set(k, k * R(0.7, 1.6), k); m4.compose(ps, q, sc); im.setMatrixAt(i, m4); }
    root.add(im); }
  const worms = (() => { const n = CV.glowworms || 800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = Math.sqrt(rnd()) * CR * 0.92, a = rnd() * Math.PI * 2; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = domeY(r) - R(0.3, 2.5); pos[i * 3 + 2] = Math.sin(a) * r; }
    const g = geo(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = keep(new THREE.PointsMaterial({ color: CV.glowwormColor || "#9ffcff", size: 0.45, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false }));
    const pts = new THREE.Points(g, m); root.add(pts); return m; })();
  const shaftM = basic(P.shaft || "#cfffe8", { transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  (CV.shafts || []).forEach(([x, z]) => { const h = domeY(Math.hypot(x, z)); const g = geo(new THREE.CylinderGeometry(1.6, 5, h, 10, 1, true)); mesh(g, shaftM, x, h / 2, z); });

  // ---------- water: the still lake + a waterfall from nowhere ----------
  const lakeM = keep(new THREE.MeshStandardMaterial({ color: "#2f8f8a", emissive: "#2ad1c0", emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.82 }));
  const lk = mesh(geo(new THREE.CircleGeometry(lake.r, 28)), lakeM, lake.x, 0.02, lake.z); lk.rotation.x = -Math.PI / 2;
  for (let a = 0; a < Math.PI * 2; a += 0.32) { const k = R(0.4, 1.1); const st = mesh(geo(new THREE.DodecahedronGeometry(k, 0)), lam("#4a4d55"), lake.x + Math.cos(a) * (lake.r + 0.6), k * 0.3, lake.z + Math.sin(a) * (lake.r + 0.6)); st.rotation.set(rnd() * 3, rnd() * 3, 0); }
  const lw = lake.r * 0.78; blockers.push({ x0: lake.x - lw, x1: lake.x + lw, z0: lake.z - lw, z1: lake.z + lw });
  const fallsT = tex(32, 128, (c, w, h) => { c.fillStyle = "rgba(200,255,250,0.15)"; c.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(230,255,255,${R(0.2, 0.7)})`; c.fillRect(R(0, w), R(0, h), R(1, 3), R(8, 30)); } });
  fallsT.wrapS = fallsT.wrapT = THREE.RepeatWrapping; fallsT.repeat.set(1, 3);
  const fl = WT.falls || { x: 27, z: -31, w: 5, h: 26 };
  const fallsMesh = mesh(geo(new THREE.PlaneGeometry(fl.w, fl.h)), basic("#ffffff", { map: fallsT, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }), fl.x, fl.h / 2, fl.z);
  fallsMesh.lookAt(OX + lake.x, fl.h / 2, OZ + lake.z);

  // ---------- plants (instanced: a few draw calls for hundreds of plants) ----------
  const free = (x, z, pad = 1) => Math.abs(x) < WH + 6 && Math.abs(z) < WH + 6 && !inLake(x, z, pad + 1) && !nearSpot(x, z, PL.clearRadius ?? 6);
  const place = (n, pad, fn) => { let k = 0; for (let t = 0; t < n * 8 && k < n; t++) { const x = R(-WH - 4, WH + 4), z = R(-WH - 4, WH + 4); if (!free(x, z, pad)) continue; fn(x, z, k++); } return k; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), cc = new THREE.Color();
  const inst = (g, m, n) => { const im = new THREE.InstancedMesh(g, m, n); im.count = 0; root.add(im); return im; };
  const put = (im, x, y, z, sx, sy, sz, ry = 0, rx = 0, color = null) => { e3.set(rx, ry, 0); q.setFromEuler(e3); ps.set(x, y, z); sc.set(sx, sy, sz); m4.compose(ps, q, sc); im.setMatrixAt(im.count, m4); if (color) im.setColorAt(im.count, cc.set(color)); im.count++; };
  const glowC = PL.glowColors || ["#7cf7d4", "#b78cff", "#ffd37a"];
  { const nT = PL.trees || 40, trunk = inst(geo(new THREE.CylinderGeometry(0.35, 0.6, 1, 6)), lam("#4a3426"), nT), crown = inst(geo(new THREE.IcosahedronGeometry(1, 0)), lam("#2f6b45"), nT * 2);
    place(nT, 2, (x, z) => { const h = R(9, 20); put(trunk, x, h / 2, z, 1, h, 1, rnd() * 3); put(crown, x, h, z, R(3, 5), R(2, 3.2), R(3, 5), rnd() * 3); put(crown, x + R(-1.5, 1.5), h - R(2, 4), z + R(-1.5, 1.5), R(2, 3.5), R(1.5, 2.5), R(2, 3.5), rnd() * 3); block(x, z, 0.7); }); }
  const capsM = basic("#ffffff", { fog: true });
  { const n = PL.glowcaps || 60, stem = inst(geo(new THREE.CylinderGeometry(0.06, 0.09, 1, 5)), lam("#d8e8d0"), n), cap = inst(geo(new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2)), capsM, n);
    const grove = spots.find((s) => s.id === "glowcap-grove");
    for (let i = 0; i < n; i++) { const g = grove && i < n * 0.6; const a = rnd() * 6.28, r = R(2, 13); const x = g ? grove.x + Math.cos(a) * r : R(-WH, WH), z = g ? grove.z + Math.sin(a) * r : R(-WH, WH); if (inLake(x, z, 1)) continue;
      const h = R(0.3, 1.6) * (g ? 1.6 : 1); put(stem, x, h / 2, z, 1, h, 1); put(cap, x, h, z, h * 0.45, h * 0.3, h * 0.45, 0, 0, glowC[i % glowC.length]); } }
  { const n = PL.ferns || 120, fern = inst(geo(new THREE.ConeGeometry(0.5, 1.6, 4)), lam("#3f8a4a"), n + 24);
    place(n, 0.5, (x, z) => { const k = R(0.5, 1.4); put(fern, x, 0.7 * k, z, k, k, k * 0.4, rnd() * 3, R(-0.5, 0.5)); });
    const fc = spots.find((s) => s.id === "fern-cathedral"); if (fc) for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = 7.5; put(fern, fc.x + Math.cos(a) * r, 4, fc.z + Math.sin(a) * r, 2.2, 6, 0.6, -a + Math.PI / 2, 0.55); } }
  { const n = PL.flowers || 40, fm = inst(geo(new THREE.OctahedronGeometry(0.25, 0)), basic("#ffffff"), n), sm = inst(geo(new THREE.CylinderGeometry(0.03, 0.03, 1, 4)), lam("#4f8a3c"), n);
    place(n, 0.3, (x, z, i) => { const h = R(0.6, 2.2); put(sm, x, h / 2, z, 1, h, 1); put(fm, x, h, z, R(0.8, 1.8), R(0.8, 1.8), R(0.8, 1.8), rnd() * 3, 0, glowC[(i + 1) % glowC.length]); }); }
  { const n = PL.vines || 30, pos = []; for (let i = 0; i < n; i++) { const r = R(8, CR * 0.7), a = rnd() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r, top = domeY(r); pos.push(x, top, z, x + R(-0.5, 0.5), top - R(8, top - 4), z + R(-0.5, 0.5)); }
    const g = geo(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); root.add(new THREE.LineSegments(g, keep(new THREE.LineBasicMaterial({ color: "#5fae6a", transparent: true, opacity: 0.55 })))); }

  // ---------- mist ----------
  const MI = D.mist || {}, mistT = tex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
  const mistM = basic(MI.color || "#bff5ea", { map: mistT, transparent: true, opacity: MI.opacity ?? 0.12, depthWrite: false });
  const mists = []; for (let i = 0; i < (MI.count || 20); i++) { const m = mesh(geo(new THREE.PlaneGeometry(1, 1)), mistM, R(-WH, WH), R(...(MI.height || [0.4, 2.2])), R(-WH, WH)); m.rotation.x = -Math.PI / 2; const k = R(10, 22); m.scale.set(k, k, 1); mists.push({ m, vx: R(-0.4, 0.4), vz: R(-0.4, 0.4) }); }

  // ---------- dinosaurs (2–3 kinds, each a handful of boxes, walking simple loops) ----------
  const bx = geo(new THREE.BoxGeometry(1, 1, 1)), ball = geo(new THREE.IcosahedronGeometry(1, 0)), cone = geo(new THREE.ConeGeometry(1, 1, 5));
  const part = (g, m, parent, x, y, z, sx, sy, sz) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); parent.add(me); return me; };
  const leg = (parent, m, x, y, z, w, h) => { const pv = new THREE.Group(); pv.position.set(x, y, z); parent.add(pv); part(bx, m, pv, 0, -h / 2, 0, w, h, w); return pv; };
  function chain(parent, m, n, len, w0, w1, dirY, dirZ) { const segs = []; let p = parent; for (let i = 0; i < n; i++) { const pv = new THREE.Group(); pv.position.set(0, i ? len * dirY : 0, i ? len * dirZ : 0); p.add(pv); const w = w0 + (w1 - w0) * (i / (n - 1 || 1)); part(bx, m, pv, 0, len * dirY / 2, len * dirZ / 2, w, Math.max(w, Math.abs(len * dirY)), Math.max(w, Math.abs(len * dirZ))); segs.push(pv); p = pv; } return segs; }
  function buildDino(def, k) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const m = lam(def.color), mb = lam(def.belly || def.color), eye = basic("#fff3b0");
    const d = { def, g, body, legs: [], neck: [], tail: [], head: null, ph: R(0, 6) };
    if (def.kind === "longneck") { body.position.y = 4.6; part(ball, m, body, 0, 0, 0, 1.8, 1.5, 3.0); part(ball, mb, body, 0, -0.6, 0, 1.4, 0.9, 2.4);
      [[-0.9, 1.6], [0.9, 1.6], [-0.9, -1.6], [0.9, -1.6]].forEach(([x, z]) => d.legs.push(leg(body, m, x, -0.4, z, 0.7, 4.0)));
      const nb = new THREE.Group(); nb.position.set(0, 0.6, 2.4); body.add(nb); d.neck = chain(nb, m, 6, 1.15, 0.7, 0.4, 0.75, 0.66);
      const hd = new THREE.Group(); hd.position.set(0, 0.86, 0.75); d.neck[5].add(hd); part(bx, m, hd, 0, 0, 0.3, 0.6, 0.5, 1.0); part(bx, eye, hd, 0.31, 0.12, 0.45, 0.04, 0.1, 0.1); part(bx, eye, hd, -0.31, 0.12, 0.45, 0.04, 0.1, 0.1); d.head = hd;
      const tb = new THREE.Group(); tb.position.set(0, 0.2, -2.6); body.add(tb); d.tail = chain(tb, m, 7, 1.2, 0.6, 0.12, -0.12, -0.99); }
    else if (def.kind === "runner") { body.position.y = 1.0; body.rotation.x = 0.2; part(bx, m, body, 0, 0, 0, 0.45, 0.5, 1.0); part(bx, mb, body, 0, -0.18, 0.05, 0.36, 0.2, 0.8);
      d.legs.push(leg(body, m, -0.16, -0.2, -0.05, 0.12, 0.85), leg(body, m, 0.16, -0.2, -0.05, 0.12, 0.85));
      const hd = new THREE.Group(); hd.position.set(0, 0.45, 0.62); body.add(hd); part(bx, m, hd, 0, 0, 0.12, 0.3, 0.3, 0.5); part(bx, eye, hd, 0.16, 0.06, 0.2, 0.02, 0.07, 0.07); part(bx, eye, hd, -0.16, 0.06, 0.2, 0.02, 0.07, 0.07); d.head = hd;
      const tb = new THREE.Group(); tb.position.set(0, 0.05, -0.5); body.add(tb); d.tail = chain(tb, m, 4, 0.35, 0.22, 0.06, 0.05, -1); }
    else { body.position.y = 2.0; part(bx, m, body, 0, 0, 0, 2.4, 1.9, 3.8); part(bx, mb, body, 0, -0.7, 0, 2.0, 0.6, 3.2);
      [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]].forEach(([x, z]) => d.legs.push(leg(body, m, x, -0.8, z, 0.6, 1.3)));
      const hd = new THREE.Group(); hd.position.set(0, 0.1, 2.0); body.add(hd); part(bx, m, hd, 0, 0, 0.6, 1.3, 1.1, 1.4);
      const fr = part(geo(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 9)), lam(def.frill || "#c96a4a"), hd, 0, 0.6, 0, 1, 1, 1); fr.rotation.x = Math.PI / 2 - 0.4;
      [[-0.4, 0.6], [0.4, 0.6], [0, 0.1]].forEach(([x, y]) => { const h = part(cone, lam("#efe6c8"), hd, x, y, 1.45, 0.12, 0.7, 0.12); h.rotation.x = Math.PI / 2 - 0.3; });
      part(bx, eye, hd, 0.66, 0.25, 0.9, 0.04, 0.12, 0.12); part(bx, eye, hd, -0.66, 0.25, 0.9, 0.04, 0.12, 0.12); d.head = hd;
      const tb = new THREE.Group(); tb.position.set(0, 0.2, -1.9); body.add(tb); d.tail = chain(tb, m, 4, 0.8, 0.8, 0.2, -0.2, -0.98); }
    g.scale.setScalar((def.scale || 1) * (def.kind === "runner" ? R(0.85, 1.15) : R(0.9, 1.1)));
    const pts = (def.path || [[0, 0], [10, 0], [10, 10]]).map(([x, z]) => new THREE.Vector3(x, 0, z));
    d.curve = new THREE.CatmullRomCurve3(pts, true); d.len = d.curve.getLength(); d.u = (k / Math.max(1, def.count)) + R(0, 0.05);
    d.side = def.kind === "runner" ? R(-2, 2) : 0; d.pause = 0; d.graze = def.kind === "grazer" ? R(4, 12) : 1e9; root.add(g); return d;
  }
  const dinos = []; (D.dinos || []).forEach((def) => { for (let k = 0; k < (def.count || 1); k++) dinos.push(buildDino(def, k)); });
  const tv = new THREE.Vector3(), pv3 = new THREE.Vector3();
  function tickDino(d, dt, ts) {
    const def = d.def; let moving = true;
    if (def.kind === "grazer") { d.graze -= dt; if (d.graze < 0) { d.pause = R(3, 7); d.graze = R(10, 20); } }
    if (def.kind === "runner" && rnd() < dt * 0.15) d.pause = R(0.4, 1.4);
    if (d.pause > 0) { d.pause -= dt; moving = false; }
    if (moving) d.u = (d.u + (def.speed || 1) * dt / d.len) % 1;
    d.curve.getPointAt(d.u, pv3); d.curve.getTangentAt(d.u, tv);
    d.g.position.set(pv3.x + tv.z * d.side, 0, pv3.z - tv.x * d.side); d.g.rotation.y = Math.atan2(tv.x, tv.z);
    const sp = def.kind === "runner" ? 14 : def.kind === "longneck" ? 2.2 : 2.6, ph = ts * sp + d.ph, amp = moving ? (def.kind === "runner" ? 0.9 : 0.35) : 0;
    d.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * amp));
    d.tail.forEach((s, i) => (s.rotation.y = Math.sin(ts * 1.4 + d.ph - i * 0.5) * 0.12));
    if (def.kind === "longneck") d.neck.forEach((s, i) => (s.rotation.x = Math.sin(ts * 0.5 + d.ph + i * 0.3) * 0.04));
    if (def.kind === "runner") { d.body.position.y = 1.0 + (moving ? Math.abs(Math.sin(ph)) * 0.12 : 0); if (d.head) d.head.rotation.y = moving ? 0 : Math.sin(ts * 7 + d.ph) * 0.6; }
    if (def.kind === "grazer" && d.head) d.head.rotation.x += ((moving ? 0 : 0.7) - d.head.rotation.x) * Math.min(1, dt * 2);
  }

  // ---------- per-frame ----------
  let t0 = 0; const lakeBase = lakeM.emissiveIntensity;
  function update(dt, ts) { t0 += dt;
    dinos.forEach((d) => tickDino(d, dt, ts));
    fallsT.offset.y = (fallsT.offset.y + dt * 1.6) % 1; lakeM.emissiveIntensity = lakeBase + Math.sin(ts * 0.8) * 0.08; worms.opacity = 0.75 + Math.sin(ts * 1.7) * 0.15;
    mists.forEach((m) => { m.m.position.x += m.vx * dt; m.m.position.z += m.vz * dt; if (Math.abs(m.m.position.x) > WH) m.vx *= -1; if (Math.abs(m.m.position.z) > WH) m.vz *= -1; });
  }
  const W = (x, z) => ({ x: OX + x, z: OZ + z });
  return {
    scene, root, origin: { x: OX, z: OZ }, name: D.name || "The Underwood", data: D, update, W,
    spots: spots.map((s) => ({ ...s, wx: OX + s.x, wz: OZ + s.z })),
    views: (D.views || []).map((v) => ({ ...v })),
    walk: [{ x0: OX - WH, x1: OX + WH, z0: OZ - WH, z1: OZ + WH, room: "annex:glimpse", y: 0, chunk: "glimpse" }],
    blockedLocal: (x, z) => blockers.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1),
    dinoInfo: () => dinos.map((d) => ({ kind: d.def.kind, x: +(OX + d.g.position.x).toFixed(2), z: +(OZ + d.g.position.z).toFixed(2), u: +d.u.toFixed(4) })),
    stats: () => { let meshes = 0, inst = 0; scene.traverse((o) => { if (o.isMesh) { meshes++; if (o.isInstancedMesh) inst += o.count; } }); return { meshes, instances: inst, dinos: dinos.length, blockers: blockers.length }; },
    dispose: () => { disp.forEach((x) => x.dispose?.()); scene.clear(); },
  };
}

// The weird lens: render a scene at reduced resolution into a target, then draw it through barrel warp + colour fringe + vignette.
export function createLens(THREE) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uTime: { value: 0 }, uK: { value: 0.35 }, uAb: { value: 0.02 }, uVig: { value: 1.0 }, uWob: { value: 0.01 }, uTint: { value: new THREE.Color("#c8fff0") }, uBlink: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uK, uAb, uVig, uWob, uBlink; uniform vec3 uTint; varying vec2 vUv;
      vec3 samp(vec2 q){ vec2 uv = q * 0.5 + 0.5; if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0); return texture2D(tDiffuse, uv).rgb; }
      void main(){ vec2 p = vUv * 2.0 - 1.0; p += vec2(sin(uTime * 1.3 + p.y * 3.1), cos(uTime * 1.1 + p.x * 2.7)) * uWob;
        float r2 = dot(p, p); vec2 d = p / (1.0 + uK) * (1.0 + uK * r2);
        vec3 col = vec3(samp(d * (1.0 + uAb * r2)).r, samp(d).g, samp(d * (1.0 - uAb * r2)).b);
        float vig = smoothstep(1.55, 0.25, length(p) * uVig); col *= vig; col = mix(col, col * uTint, 0.25);
        float lid = smoothstep(uBlink - 0.08, uBlink, abs(vUv.y - 0.5) * 2.0); col *= 1.0 - lid * step(0.001, uBlink) ;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.Camera();
  const sz = new THREE.Vector2();
  return {
    uniforms: mat.uniforms,
    render(renderer, scene, cam, scale = 0.6) { renderer.getDrawingBufferSize(sz); const w = Math.max(2, Math.floor(sz.x * scale)), h = Math.max(2, Math.floor(sz.y * scale)); if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(qs, qc); },
    dispose() { rt.dispose(); mat.dispose(); quad.geometry.dispose(); },
  };
}
