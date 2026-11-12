// The Elsewhere Annex (behind The Loose Stitch). Eclectic Transformation · Gremlin Desks only.
// A small, original, Backrooms-inspired side world: liminal rooms, a hum, wandering almost-people, gentle grabbers
// that only relocate you, curiosities, and crystal waystones. Everything placeable lives in data/elsewhere-annex.json.
// Procedural low-detail geometry only (same craft as office3d.js). Progress is per player in localStorage.
import { createAnnexAudio } from "./annex-audio.js";

export function createAnnex(kit, data, host) {
  const { THREE, scene, mat, box, plane, canvasTex, plate, wrap, fit, PAL, H, T, R, ROOM, walkable, planeGeo } = kit;
  const AX = data.origin?.x ?? -200, AZ = data.origin?.z ?? 0;
  const root = new THREE.Group(); root.position.set(AX, 0, AZ); scene.add(root);
  const el = host.el, audio = createAnnexAudio();
  const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const roomsById = Object.fromEntries(data.rooms.map((r) => [r.id, r]));
  const levelsById = Object.fromEntries(data.levels.map((l) => [l.id, l]));
  const pal = (lv) => data.palettes[lv] || data.palettes.print;
  const W = (x, z) => ({ x: AX + x, z: AZ + z }); // local -> world

  // ---------- player names (the almost-people get yours slightly wrong) ----------
  const first = String(host.me?.display_name || "you").trim().split(/\s+/)[0] || "you";
  const nameOff = (() => { const s = first; if (s.length < 3) return s + s.slice(-1); const a = s.split(""); const i = a.length - 2; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a.join(""); })();
  const fill = (t) => String(t).replaceAll("{name}", first).replaceAll("{nameOff}", nameOff);

  // ---------- progress (localStorage, same JSON shape as a future seam_progress row) ----------
  const KEY = "et-desks-annex-v1:" + (host.me?.id || "anon");
  let prog = { waystones: {}, curiosities: [], flags: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") prog = { waystones: s.waystones || {}, curiosities: s.curiosities || [], flags: s.flags || {} }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...prog, updated_at: new Date().toISOString() })); } catch {} };
  const goal = data.goal?.curiosities || 3;

  // ---------- shared textures / materials ----------
  const carpetTex = (base) => canvasTex(128, 128, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? "60,50,20" : "255,250,220"},${rnd(0.03, 0.09)})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = "rgba(70,60,25,.10)"; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(rnd(20, 108), rnd(20, 108), rnd(10, 26), rnd(6, 16), rnd(0, 3), 0, 7); c.fill(); } }); // damp patches
  const carpetCache = {};
  const floorMat = (lv, w, d) => { const p = pal(lv); const base = (carpetCache[lv] ||= carpetTex(p.floor)); const t = base.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, w / 2), Math.max(1, d / 2)); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); };
  const flicker = []; // light panels that misbehave a little
  const lightsByLevel = {};

  // ---------- walls with door gaps (each room draws its own walls inset by T/2, so neighbours never overlap) ----------
  function wallRun(axis, line, inward, a, b, gaps, y, hgt, m, trimM) {
    const c = line + inward * T / 2; let cur = a; const segs = [];
    [...gaps].sort((p, q) => p.c - q.c).forEach((g) => { const g0 = Math.max(a, g.c - g.w / 2), g1 = Math.min(b, g.c + g.w / 2);
      if (g0 > cur) segs.push([cur, g0]); if (!g.open && g1 > g0) lintel(g0, g1); cur = Math.max(cur, g1); });
    if (b > cur) segs.push([cur, b]);
    function piece(s0, s1, y0, y1, mm, off = 0, th = T) { const mid = (s0 + s1) / 2, len = s1 - s0; if (len <= 0.001) return;
      if (axis === "x") box(mid, (y0 + y1) / 2, c + off, len, y1 - y0, th, mm, root); else box(c + off, (y0 + y1) / 2, mid, th, y1 - y0, len, mm, root); }
    function lintel(g0, g1) { piece(g0, g1, y + 2.2, y + hgt, m); }
    segs.forEach(([s0, s1]) => { piece(s0, s1, y, y + hgt, m); if (trimM) piece(s0, s1, y + 0.004, y + 0.12, trimM, inward * 0.02, T); });
  }
  const doorsOn = (side, r) => data.doors.filter((d) => {
    if (side === "s" || side === "n") { const z = side === "s" ? r.z0 : r.z1; return Math.abs(d.z - z) < 0.01 && d.x > r.x0 - 0.01 && d.x < r.x1 + 0.01; }
    const x = side === "w" ? r.x0 : r.x1; return Math.abs(d.x - x) < 0.01 && d.z > r.z0 - 0.01 && d.z < r.z1 + 0.01;
  }).map((d) => ({ c: side === "s" || side === "n" ? d.x : d.z, w: d.w, open: d.open }));
  const lightPanel = (x, z, y, intensity, skew = 0) => { const m = box(x, y + H - 0.02, z, 1.2, 0.03, 0.6, new THREE.MeshStandardMaterial({ color: "#fff7d0", emissive: "#fff2b8", emissiveIntensity: intensity }), root); m.rotation.y = skew; return m; };

  function buildRoom(r) {
    const p = pal(r.level), y = r.y || 0, w = r.x1 - r.x0, d = r.z1 - r.z0;
    const wallM = mat(r.wall || p.wall, { roughness: 0.95 }), trimM = mat(p.trim, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    if (r.kind === "overlook") return buildOverlook(r, p, wallM, trimM);
    const f = new THREE.Mesh(planeGeo, floorMat(r.level, w, d)); f.rotation.x = -Math.PI / 2; f.scale.set(w, d, 1); f.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2); root.add(f);
    const ce = new THREE.Mesh(planeGeo, mat(p.ceil, { emissive: p.ceil, emissiveIntensity: 0.25 })); ce.rotation.x = Math.PI / 2; ce.scale.set(w, d, 1); ce.position.set((r.x0 + r.x1) / 2, y + H, (r.z0 + r.z1) / 2); root.add(ce);
    wallRun("x", r.z0, +1, r.x0, r.x1, doorsOn("s", r), y, H, wallM, trimM);
    wallRun("x", r.z1, -1, r.x0, r.x1, doorsOn("n", r), y, H, wallM, trimM);
    wallRun("z", r.x0, +1, r.z0 + T, r.z1 - T, doorsOn("w", r), y, H, wallM, trimM);
    wallRun("z", r.x1, -1, r.z0 + T, r.z1 - T, doorsOn("e", r), y, H, wallM, trimM);
    if (r.lightEvery > 0) { const nx = Math.max(1, Math.round(w / r.lightEvery)), nz = Math.max(1, Math.round(d / r.lightEvery)); const list = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) list.push(lightPanel(r.x0 + (i + 0.5) * w / nx, r.z0 + (j + 0.5) * d / nz, y, p.light, (r.skew || 0) * (i + j + 1)));
      (lightsByLevel[r.level] ||= []).push(...list.map((m) => ({ m, base: p.light })));
      if (list.length > 2) flicker.push({ m: list[Math.floor(list.length / 2)], base: p.light, t: rnd(0, 5) }); }
    walkable.push({ x0: AX + r.x0 + R, x1: AX + r.x1 - R, z0: AZ + r.z0 + R, z1: AZ + r.z1 - R, room: "annex:" + r.id, y });
  }
  function buildOverlook(r, p, wallM, trimM) {
    const y = r.y, w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, open = r.open || [];
    box(cx, y - 0.1, cz, w, 0.2, d, mat(p.floor, { roughness: 0.7 }), root);
    // planks
    for (let i = 0; i < 9; i++) box(r.x0 + (i + 0.5) * w / 9, y + 0.003, cz, 0.02, 0.006, d - 0.1, mat("#6f5a3e"), root);
    const railM = mat("#c9a57a", { roughness: 0.7 }), postM = mat("#6f5a3e", { roughness: 0.8 });
    const side = (s, line, inward, a, b, axis) => { const isOpen = open.includes(s);
      if (!isOpen) return wallRun(axis, line, inward, a, b, [], y, 3.2, wallM, trimM);
      const c = line + inward * 0.05; // see-through railing: posts + two rails, so you can look down over the levels
      const at = (u, yy, len, th, hh, m) => axis === "x" ? box(u, yy, c, len, hh, th, m, root) : box(c, yy, u, th, hh, len, m, root);
      at((a + b) / 2, y + 1.02, b - a, 0.09, 0.06, railM); at((a + b) / 2, y + 0.55, b - a, 0.04, 0.04, railM);
      for (let u = a; u <= b + 0.01; u += 1.25) at(Math.min(u, b), y + 0.5, 0.07, 0.07, 1.0, postM); };
    side("s", r.z0, +1, r.x0, r.x1, "x"); side("n", r.z1, -1, r.x0, r.x1, "x"); side("w", r.x0, +1, r.z0 + T, r.z1 - T, "z"); side("e", r.x1, -1, r.z0 + T, r.z1 - T, "z");
    // hanging lantern bulbs on a string over the deck
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat("#ffe28a", { emissive: "#ffd45a", emissiveIntensity: 1.4 })); b.position.set(r.x0 + 1 + i * (w - 2) / 4, y + 2.7 - Math.sin(i / 4 * Math.PI) * 0.25, r.z1 - 0.6); root.add(b); }
    // the overlook hangs on thick threads from nowhere (seen from the deck edge)
    [[r.x0 + 0.1, r.z0 + 0.1], [r.x1 - 0.1, r.z0 + 0.1]].forEach(([x, z]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, y, 6), mat("#d8c9a4")); t.position.set(x, y / 2, z); root.add(t); });
    walkable.push({ x0: AX + r.x0 + R, x1: AX + r.x1 - R, z0: AZ + r.z0 + R, z1: AZ + r.z1 - R, room: "annex:" + r.id, y });
    // survey table + map + note + flag + spyglass
    box(18, y + 0.8, -15, 2.0, 0.06, 1.1, mat(PAL.oak, { roughness: 0.6 }), root);
    [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]].forEach(([dx, dz]) => box(18 + dx, y + 0.4, -15 + dz, 0.06, 0.8, 0.06, mat(PAL.wood), root));
    const surveyTex = canvasTex(1024, 560, (c, cw, ch) => { c.fillStyle = "#f3ead2"; c.fillRect(0, 0, cw, ch); c.strokeStyle = "#6b5a3a"; c.lineWidth = 5; c.strokeRect(10, 10, cw - 20, ch - 20);
      c.fillStyle = PAL.moss; c.font = "bold 52px Georgia, serif"; c.fillText("Elsewhere Annex — survey", 40, 80); c.font = "28px 'Comic Sans MS','Marker Felt',system-ui"; c.fillStyle = PAL.ink;
      (data.overlook?.survey || []).forEach((s, i) => c.fillText(s, 50, 140 + i * 44));
      c.strokeStyle = "#a33"; c.lineWidth = 4; data.rooms.filter((q) => q.kind !== "overlook").forEach((q) => { const sx = 600 + (q.x0 + 14) * 9, sz = 120 + (-q.z1) * 10; c.strokeRect(sx, sz, (q.x1 - q.x0) * 9, (q.z1 - q.z0) * 10); });
      c.fillStyle = "#4f8a3c"; c.font = "bold 30px system-ui"; c.fillText("← mapped by gremlins (mostly)", 520, 530); });
    const sm = plane(surveyTex, 1.7, 0.93, 18, y + 0.835, -15, 0, root); sm.rotation.x = -Math.PI / 2;
    const noteTex = canvasTex(512, 300, (c, cw, ch) => { c.fillStyle = "#f8e58c"; c.fillRect(0, 0, cw, ch); c.fillStyle = PAL.ink; c.textAlign = "center"; c.font = "bold 50px 'Comic Sans MS','Marker Felt',system-ui";
      wrap(c, data.overlook?.note || "aha! this is where we found it.", cw / 2, 90, cw - 50, 58, 3); c.font = "italic 34px Georgia"; c.fillText(data.overlook?.noteBy || "— the Gremlins", cw / 2, 260); });
    plane(noteTex, 1.2, 0.7, 21.92, y + 1.75, -15, -Math.PI / 2, root);
    const footT = canvasTex(128, 128, (c) => { c.fillStyle = "#4f8a3c"; c.beginPath(); c.ellipse(64, 80, 26, 34, 0, 0, 7); c.fill(); [[34, 34], [64, 22], [94, 34]].forEach(([x, z]) => { c.beginPath(); c.ellipse(x, z, 11, 15, 0, 0, 7); c.fill(); }); });
    const footM = new THREE.MeshStandardMaterial({ map: footT, transparent: true, alphaTest: 0.3, roughness: 1 });
    for (let i = 0; i < 10; i++) { const f = new THREE.Mesh(planeGeo, footM); f.rotation.set(-Math.PI / 2, 0, 0.9); f.scale.set(0.16, 0.18, 1); f.position.set(14 + i * 0.7 + (i % 2) * 0.1, y + 0.006, -12 - i * 0.5 - (i % 2) * 0.12); root.add(f); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), mat(PAL.wood)); pole.position.set(21.5, y + 1.2, -18.5); root.add(pole);
    const flagTex = canvasTex(256, 160, (c, cw, ch) => { c.fillStyle = "#4f8a3c"; c.fillRect(0, 0, cw, ch); c.fillStyle = "#f3d98b"; c.font = "bold 44px system-ui"; c.textAlign = "center"; c.fillText("GREMLINS", cw / 2, 70); c.font = "60px serif"; c.fillText("👀", cw / 2, 140); });
    plane(flagTex, 0.8, 0.5, 21.08, y + 2.1, -18.5, 0, root, { side: THREE.DoubleSide });
    // spyglass on a tripod at the corner of the railing
    const sg = new THREE.Group(); sg.position.set(12.75, y, -13.3); root.add(sg);
    [0, 2.1, 4.2].forEach((a) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 5), mat(PAL.ink)); leg.position.set(Math.sin(a) * 0.22, 0.62, Math.cos(a) * 0.22); leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); sg.add(leg); });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 10), mat("#c9b27a", { metalness: 0.6, roughness: 0.35 })); tube.position.set(-0.1, 1.32, 0.1); tube.rotation.set(0.25, 0, Math.PI / 2 - 0.25); sg.add(tube);
    overlookSpots.push({ key: "spyglass", x: 12.75, z: -13.3, y, label: () => (host.zoomed() ? "🔭 Put the spyglass down" : "🔭 Look through the spyglass"), run: () => { host.setZoom(!host.zoomed()); host.toast(host.zoomed() ? "You can see the wanderers from up here. Drag to look around." : "Spyglass down."); } });
    overlookSpots.push({ key: "survey", x: 18, z: -15, y, label: () => "🗺 Read the Gremlins' survey", run: openSurvey });
    overlookSpots.push({ key: "note", x: 21.3, z: -15, y, label: () => "📝 Read the taped note", run: () => host.openPanel("A taped note", (pn) => { pn.appendChild(el("p", null, data.overlook?.note)); pn.appendChild(el("p", "o3-small", data.overlook?.noteBy)); }) });
  }
  const overlookSpots = [];

  // ---------- props ----------
  const wallSpot = (r, wall, at, y) => { const off = T + 0.012;
    if (wall === "n") return { x: at, z: r.z1 - off, ry: Math.PI, y }; if (wall === "s") return { x: at, z: r.z0 + off, ry: 0, y };
    if (wall === "w") return { x: r.x0 + off, z: at, ry: Math.PI / 2, y }; return { x: r.x1 - off, z: at, ry: -Math.PI / 2, y }; };
  const posterTex = canvasTex(256, 360, (c, w, h) => { c.fillStyle = "#f4efd9"; c.fillRect(0, 0, w, h); c.strokeStyle = "#7a6f45"; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = "#b03a2e"; c.font = "bold 34px system-ui"; c.textAlign = "center"; c.fillText("YOU ARE HERE", w / 2, 56);
    c.strokeStyle = "#7a6f45"; c.lineWidth = 10; c.strokeRect(50, 90, 156, 200); c.strokeRect(85, 125, 86, 130); // a square loop
    c.fillStyle = "#b03a2e"; c.beginPath(); c.arc(128, 100, 12, 0, 7); c.fill(); c.font = "bold 40px system-ui"; c.fillText("↻", 128, 335); });
  const frameTex = canvasTex(256, 300, (c, w, h) => { c.fillStyle = "#efe6c8"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(120,100,50,.12)"; c.fillRect(20, 20, w - 40, h - 40); });
  const frameLabel = plate("Untitld", "by (unreadable)", { w: 768, h: 140, bg: "#f3ead2", fg: PAL.ink, accent: "#a8964f" });
  const P = {
    plant(x, z, s = 1) { box(x, 0.22 * s, z, 0.4 * s, 0.44 * s, 0.4 * s, mat(PAL.clay), root);
      const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * s, 1), mat("#6f7f45", { flatShading: true })); g.position.set(x, 0.75 * s, z); root.add(g); },
    chair(x, z, ry, color = PAL.forest) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
      box(0, 0.48, 0, 0.55, 0.08, 0.55, mat(color), g); box(0, 0.8, -0.26, 0.55, 0.6, 0.06, mat(color), g); box(0, 0.24, 0, 0.06, 0.45, 0.06, mat(PAL.ink), g); },
    bench(x, z) { box(x, 0.42, z, 2.4, 0.08, 0.6, mat(PAL.oak, { roughness: 0.6 }), root); box(x - 1, 0.2, z, 0.08, 0.4, 0.5, mat(PAL.moss), root); box(x + 1, 0.2, z, 0.08, 0.4, 0.5, mat(PAL.moss), root); },
    table(x, z, big) { const w = big ? 1.4 : 1.1, d = big ? 0.9 : 0.7; box(x, 0.82, z, w, 0.06, d, mat("#b89a6a"), root); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(x + a * (w / 2 - 0.06), 0.4, z + b * (d / 2 - 0.06), 0.05, 0.8, 0.05, mat(PAL.wood), root)); },
    boxes(x, z) { const cm = mat("#b08a5a", { roughness: 1 }); box(x, 0.22, z, 0.5, 0.44, 0.45, cm, root); box(x + 0.05, 0.62, z - 0.02, 0.4, 0.36, 0.38, cm, root); box(x + 0.48, 0.18, z + 0.1, 0.36, 0.36, 0.36, cm, root); },
    vending(x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
      box(0, 0.95, 0, 0.9, 1.9, 0.7, mat("#6d7a6a", { roughness: 0.6 }), g); box(-0.08, 1.05, 0.355, 0.6, 1.3, 0.02, mat("#1d2622", { emissive: "#3f5f52", emissiveIntensity: 0.5 }), g);
      plane(plate("SNAKS", "no buttons", { w: 512, h: 150, bg: "#2d3a33", fg: "#cfe6b8", accent: "#8f9f88" }), 0.6, 0.18, -0.08, 1.8, 0.37, 0, g); },
    shelf(x, z, ry, recede) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g); const sm = mat("#8a8470", { roughness: 0.8 });
      box(-0.95, 1.1, 0, 0.06, 2.2, 0.5, sm, g); box(0.95, 1.1, 0, 0.06, 2.2, 0.5, sm, g);
      for (let i = 0; i < 4; i++) { box(0, 0.25 + i * 0.6, 0, 1.9, 0.04, 0.5, sm, g); for (let k = 0; k < 3; k++) if (Math.random() < 0.75) box(-0.6 + k * 0.6 + rnd(-0.1, 0.1), 0.25 + i * 0.6 + 0.16, rnd(-0.05, 0.05), rnd(0.25, 0.45), 0.28, 0.32, mat("#a88458", { roughness: 1 }), g); }
      if (recede) receders.push({ g, bx: x, bz: z }); },
    frame(r, spot) { const g = new THREE.Group(); g.position.set(spot.x, spot.y, spot.z); g.rotation.y = spot.ry; root.add(g);
      box(0, 0, 0, 1.28, 1.48, 0.06, mat("#2c2a24", { roughness: 0.5 }), g); plane(frameTex, 1.1, 1.3, 0, 0, 0.035, 0, g); plane(frameLabel, 1.1, 0.2, 0, -0.98, 0.01, 0, g); },
    sign(r, spot, pr) { const tex = plate(pr.text, pr.sub, { w: 900, h: pr.sub ? 320 : 220, bg: pr.bg || "#5b5a2e", fg: "#fbf3d0", accent: "#e6d07a" }); plane(tex, pr.w || 1.4, pr.h || 0.5, spot.x, spot.y, spot.z, spot.ry, root); },
    poster(r, spot) { plane(posterTex, 0.62, 0.87, spot.x, spot.y, spot.z, spot.ry, root); },
    board(r, spot, pr) { const g = new THREE.Group(); g.position.set(spot.x, spot.y, spot.z); g.rotation.y = spot.ry; root.add(g);
      box(0, 0, -0.02, 2.4, 1.5, 0.05, mat(PAL.wood), g);
      plane(canvasTex(900, 560, (c, w, h) => { c.fillStyle = "#c9a57a"; c.fillRect(0, 0, w, h); c.fillStyle = "#6b6033"; c.fillRect(0, 0, w, 90); c.fillStyle = "#fbf3d0"; c.font = "bold 56px Georgia"; c.textAlign = "center"; c.fillText(pr.text || "Notces", w / 2, 64);
        c.fillStyle = "#fffdf0"; c.fillRect(90, 150, 300, 220); c.fillStyle = "#f8e58c"; c.fillRect(500, 170, 300, 220); c.fillStyle = "rgba(0,0,0,.25)"; for (let i = 0; i < 5; i++) { c.fillRect(110, 190 + i * 32, 250 - i * 30, 8); c.fillRect(520, 210 + i * 32, 240 - i * 20, 8); } }), 2.25, 1.38, 0, 0, 0.01, 0, g); },
  };
  const receders = [];

  // ---------- stitch kit (used for office entrances and annex exits) ----------
  function makeStitch(parent, { size = 1, subtle = false, sealed = false } = {}) {
    const g = new THREE.Group(); parent.add(g); const hgt = 1.1 * size, wid = 0.36 * size;
    const pucker = canvasTex(128, 384, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(90,70,40,0)"); gr.addColorStop(0.42, subtle ? "rgba(90,70,40,.18)" : "rgba(70,50,25,.42)"); gr.addColorStop(0.5, subtle ? "rgba(60,40,20,.3)" : "rgba(40,25,10,.7)"); gr.addColorStop(0.58, subtle ? "rgba(90,70,40,.18)" : "rgba(70,50,25,.42)"); gr.addColorStop(1, "rgba(90,70,40,0)");
      c.fillStyle = gr; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 7); c.fill(); });
    plane(pucker, wid * 1.6, hgt * 1.1, 0, 0, 0.002, 0, g, { transparent: true, depthWrite: false });
    const gap = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: sealed ? "#5a4630" : "#120c05" })); gap.scale.set(0.035 * size, hgt * 0.92, 1); gap.position.z = 0.004; g.add(gap);
    const tm = new THREE.MeshStandardMaterial({ color: subtle ? "#cdbf9f" : "#b8483a", roughness: 0.9, emissive: subtle ? "#fff3c8" : "#5a120a", emissiveIntensity: subtle ? 0.0 : 0.15 });
    const threads = []; const n = sealed ? 11 : subtle ? 4 : 7;
    for (let i = 0; i < n; i++) { const yy = -hgt * 0.42 + (i + 0.5) * (hgt * 0.84) / n;
      [1, -1].forEach((sgn) => { const t = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), tm); t.scale.set(wid * 0.62, 0.016 * Math.max(size, 0.6), 0.012); t.position.set(0, yy, 0.012); t.rotation.z = sgn * 0.55; g.add(t); threads.push({ t, sgn, yy }); }); }
    const loose = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), tm); loose.scale.set(0.012, 0.22 * size, 0.01); loose.position.set(0.02 * size, -hgt * 0.55, 0.014); loose.rotation.z = 0.35; g.add(loose);
    const hit = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(Math.max(0.35, wid * 2), Math.max(0.45, hgt * 1.2), 1); hit.position.z = 0.02; g.add(hit);
    const s = { g, gap, threads, loose, tm, hit, size, subtle, sealed, k: 0, t: rnd(0, 6) };
    s.yawn = (k) => { s.k = k; };
    s.anim = (ts) => { const k = s.k; const breathe = s.sealed ? 0 : Math.sin(ts * 1.7 + s.t) * 0.25;
      gap.scale.x = 0.035 * size * (1 + breathe + k * 16); threads.forEach(({ t, sgn }) => { t.position.x = sgn * k * wid * 0.9; t.rotation.z = sgn * (0.55 + k * 0.9) + Math.sin(ts * 3 + s.t) * 0.02; });
      loose.rotation.z = 0.35 + Math.sin(ts * 1.3 + s.t) * 0.15;
      if (subtle) tm.emissiveIntensity = Math.max(0, Math.sin(ts * 1.05 + s.t) - 0.93) * 6; }; // a rare tiny glint
    return s;
  }
  const stitches = [];

  // ---------- office entrances (data-driven; anchors survive layout tweaks) ----------
  const officeEntrances = [];
  const L = host.layout;
  function placeEntrance(e) {
    if (!e.active && !host.showAllEntrances) return;
    const mounts = [];
    if (e.anchor === "galleryBackWall") mounts.push({ parent: scene, x: e.x, y: e.y, z: L.gz1 + T / 2 + 0.012, ry: 0 });
    else if (e.anchor === "hallLeftWall") mounts.push({ parent: scene, x: -L.hx + T / 2 + 0.012, y: e.y ?? 0, z: e.z, ry: Math.PI / 2 });
    else if (e.anchor === "deskLeftWallCorner") {
      const names = (e.deskOwner || []).map((s) => s.toLowerCase());
      host.rooms.forEach((rm) => { const nm = String(rm.owner?.display_name || (rm.mine ? host.me?.display_name : "") || "").toLowerCase();
        if (rm.g && names.includes(nm)) mounts.push({ parent: rm.g, x: -ROOM / 2 + T / 2 + 0.006, y: e.y, z: e.x, ry: Math.PI / 2 }); });
    }
    mounts.forEach((m) => {
      const holder = new THREE.Group(); holder.position.set(m.x, m.y, m.z); holder.rotation.y = m.ry; m.parent.add(holder);
      let kitObj;
      if (e.type === "odd-door") kitObj = makeOddDoor(holder);
      else kitObj = makeStitch(holder, { size: e.size || 1, subtle: e.type === "stitch-secret" });
      holder.updateWorldMatrix(true, true); const wp = new THREE.Vector3(); (kitObj.hit || holder).getWorldPosition(wp);
      const nrm = new THREE.Vector3(); holder.getWorldDirection(nrm); const stand = holder.localToWorld(new THREE.Vector3(-0.6, 0, 1.0)); // a spot in front of it, a bit off the back wall
      const ent = { e, holder, kit: kitObj, wp, nrm, stand, key: "ent:" + e.id };
      kitObj.hit.userData.run = () => useEntrance(ent); kitObj.hit.userData.maxD = e.type === "stitch-secret" ? 3 : 4.5;
      officeEntrances.push(ent); if (kitObj.anim) stitches.push(kitObj);
    });
  }
  function makeOddDoor(holder) { // stub kit for later: a slightly-too-small door, a little crooked
    const g = new THREE.Group(); g.position.y = 0; g.rotation.z = 0.025; holder.add(g);
    box(0, 0.95, 0.01, 0.86, 1.9, 0.05, mat("#7d6a50"), g); box(0.3, 0.95, 0.05, 0.05, 0.05, 0.06, mat("#c9b27a", { metalness: 0.6 }), g);
    plane(plate("Annex", "staff only (sort of)", { w: 512, h: 160, bg: "#5b5a2e" }), 0.6, 0.19, 0, 1.6, 0.04, 0, g);
    const hit = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(0.9, 1.9, 1); hit.position.set(0, 0.95, 0.06); g.add(hit);
    return { g, hit, yawn() {} };
  }

  // ---------- riddle prompt (secret stitch) ----------
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  function openRiddle(ent) {
    const rid = String(ent.e.unlock).slice("riddle:".length), rd = data.riddles?.[rid]; if (!rd) return;
    let wrongI = Math.floor(Math.random() * (rd.wrong?.length || 1));
    host.openPanel(rd.title || "A riddle", (pn) => {
      pn.appendChild(el("p", "o3-riddle", rd.prompt));
      const form = el("form", "o3-riddleform"); const inp = el("input"); inp.type = "text"; inp.maxLength = 60; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = rd.placeholder || "Your answer"; inp.setAttribute("aria-label", "Your answer");
      const go = el("button", "o3-btn", "Answer"); go.type = "submit"; const out = el("p", "o3-riddleout"); out.setAttribute("role", "status");
      form.append(inp, go); pn.append(form, out);
      form.onsubmit = (ev) => { ev.preventDefault(); const a = norm(inp.value); if (!a) return;
        if ((rd.answers || []).map(norm).includes(a)) { out.textContent = rd.success || "Right!"; out.className = "o3-riddleout ok"; audio.sfx("chime"); prog.flags.solvedRiddle = true; save();
          setTimeout(() => { host.closePanel(); enterVia(ent); }, 650); }
        else { out.textContent = fill(rd.wrong?.[wrongI++ % rd.wrong.length] || "Nope."); out.className = "o3-riddleout no"; audio.sfx("nope"); inp.select(); } };
      setTimeout(() => inp.focus(), 60);
    });
  }
  function useEntrance(ent) {
    if (host.state().busy) return; audio.prime();
    if (String(ent.e.unlock).startsWith("riddle:")) return openRiddle(ent);
    enterVia(ent);
  }
  function enterVia(ent) {
    const sp = data.spawns[ent.e.destination]; if (!sp) return; audio.prime(); audio.sfx("zip");
    host.threadWarp({ target: ent.wp, onK: (k) => ent.kit.yawn?.(k), swap: () => { ent.kit.yawn?.(0); arrive(sp, ent.e.destination, ent.e); } });
  }

  // ---------- annex interior ----------
  data.rooms.forEach(buildRoom);
  data.doors.forEach((d) => { const isX = data.rooms.some((r) => (Math.abs(d.z - r.z0) < 0.01 || Math.abs(d.z - r.z1) < 0.01) && d.x > r.x0 - 0.01 && d.x < r.x1 + 0.01);
    const ins = d.open ? R : 0.15;
    if (isX) walkable.push({ x0: AX + d.x - d.w / 2 + ins, x1: AX + d.x + d.w / 2 - ins, z0: AZ + d.z - 0.6, z1: AZ + d.z + 0.6, room: null, y: 0 });
    else walkable.push({ x0: AX + d.x - 0.6, x1: AX + d.x + 0.6, z0: AZ + d.z - d.w / 2 + ins, z1: AZ + d.z + d.w / 2 - ins, room: null, y: 0 }); });
  (data.props || []).forEach((pr) => { const r = roomsById[pr.room]; if (!r) return;
    if (pr.wall) { const sp = wallSpot(r, pr.wall, pr.at, pr.y ?? 1.6); P[pr.type]?.(r, sp, pr); }
    else if (pr.type === "plant") P.plant(pr.x, pr.z, pr.s || 1); else if (pr.type === "chair") P.chair(pr.x, pr.z, pr.ry || 0, pr.color);
    else if (pr.type === "bench") P.bench(pr.x, pr.z); else if (pr.type === "table") P.table(pr.x, pr.z, pr.big); else if (pr.type === "boxes") P.boxes(pr.x, pr.z);
    else if (pr.type === "vending") P.vending(pr.x, pr.z, pr.ry || 0); else if (pr.type === "shelf") P.shelf(pr.x, pr.z, pr.ry || 0, pr.recede); });

  // ---------- shifting areas: wall panels swap among preset layouts (data.shifts) ----------
  const blockers = []; // active partitions block walking (local rects)
  const shifts = (data.shifts || []).map((sh) => {
    const parts = {};
    Object.entries(sh.partitions || {}).forEach(([pid, pt]) => { const r = roomsById[pt.room]; if (!r) return; const p = pal(r.level), y = r.y || 0;
      const m = mat(r.wall || p.wall, { roughness: 0.95 }); let mesh, rect;
      if (pt.axis === "x") { mesh = box((r.x0 + r.x1) / 2, y + H / 2, pt.at, r.x1 - r.x0 - 0.02, H - 0.01, 0.2, m, root); rect = { x0: r.x0, x1: r.x1, z0: pt.at - 0.1 - R, z1: pt.at + 0.1 + R }; }
      else { mesh = box(pt.at, y + H / 2, (r.z0 + r.z1) / 2, 0.2, H - 0.01, r.z1 - r.z0 - 0.02, m, root); rect = { x0: pt.at - 0.1 - R, x1: pt.at + 0.1 + R, z0: r.z0, z1: r.z1 }; }
      const poster = plane(posterTex, 0.62, 0.87, pt.axis === "x" ? (r.x0 + r.x1) / 2 : pt.at + 0.105, 1.6, pt.axis === "x" ? pt.at + 0.105 : (r.z0 + r.z1) / 2, pt.axis === "x" ? 0 : Math.PI / 2, root);
      mesh.visible = poster.visible = false; parts[pid] = { mesh, poster, rect, on: false }; });
    return { sh, parts, layout: 0, t: 0, warnT: -1, pending: -1 };
  });
  function applyLayout(S, idx) { S.layout = idx; const on = new Set(S.sh.layouts[idx] || []);
    Object.entries(S.parts).forEach(([pid, pp]) => { pp.on = on.has(pid); pp.mesh.visible = pp.poster.visible = pp.on; });
    blockers.length = 0; shifts.forEach((q) => Object.values(q.parts).forEach((pp) => pp.on && blockers.push(pp.rect))); }
  const blockedLocal = (x, z) => blockers.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
  function startShift(S, idx) { if (S.warnT >= 0) return; const n = S.sh.layouts.length; if (n < 2) return;
    S.pending = idx ?? ((S.layout + 1 + Math.floor(Math.random() * (n - 1))) % n); S.warnT = S.sh.warn ?? 2.5; host.toast(S.sh.warning || "Something is shifting…"); audio.sfx("nope"); }
  function tickShift(S, dt, p, inAnnex) {
    S.t += dt;
    if (S.warnT >= 0) { S.warnT -= dt; (lightsByLevel[S.sh.level] || []).forEach((l) => (l.m.material.emissiveIntensity = Math.random() < 0.5 ? 0.1 : l.base));
      if (S.warnT < 0) { const next = new Set(S.sh.layouts[S.pending] || []); // never drop a wall on someone
        const onYou = Object.entries(S.parts).some(([pid, pp]) => next.has(pid) && p.x > pp.rect.x0 - 0.6 && p.x < pp.rect.x1 + 0.6 && p.z > pp.rect.z0 - 0.6 && p.z < pp.rect.z1 + 0.6);
        (lightsByLevel[S.sh.level] || []).forEach((l) => (l.m.material.emissiveIntensity = l.base));
        if (onYou) { S.warnT = 1.5; return; }
        applyLayout(S, S.pending); S.t = 0; S.warnT = -1; audio.sfx("flump"); if (inAnnex) host.toast(S.sh.done || "Something shifted."); } return; }
    if (inAnnex && S.sh.every && S.t > S.sh.every) startShift(S);
  }
  shifts.forEach((S) => applyLayout(S, 0));

  // exits inside the annex
  const exits = (data.exits || []).map((x) => {
    if (x.type === "return-stitch") { const r = roomsById[x.room]; const sp = wallSpot(r, x.wall, x.at, x.y); const holder = new THREE.Group(); holder.position.set(sp.x, sp.y, sp.z); holder.rotation.y = sp.ry; root.add(holder);
      const sealed = !!x.requires && !reqMet(x); const s = makeStitch(holder, { size: 0.9, sealed }); stitches.push(s); const wp = new THREE.Vector3(); holder.updateWorldMatrix(true, true); holder.getWorldPosition(wp);
      const ex = { x, holder, kit: s, wp, lx: sp.x, lz: sp.z, ly: r.y || 0 }; s.hit.userData.run = () => useExit(ex); s.hit.userData.maxD = 4.5; return ex; }
    if (x.type === "descend") { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, x.y + 1.2, 6), mat("#d8c9a4")); t.position.set(x.x, (x.y + 1.2) / 2, x.z); root.add(t);
      const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat("#b8483a")); knot.position.set(x.x, x.y + 1.15, x.z); root.add(knot);
      return { x, lx: x.x, lz: x.z, ly: x.y, wp: new THREE.Vector3(AX + x.x, x.y + 1.2, AZ + x.z) }; }
    return null; }).filter(Boolean);
  function reqMet(x) { return !x.requires?.curiosities || prog.curiosities.length >= x.requires.curiosities; }
  function refreshSeals() { exits.forEach((ex) => { if (ex.kit && ex.x.requires) ex.kit.sealed = !reqMet(ex.x); if (ex.kit) ex.kit.gap.material.color.set(ex.kit.sealed ? "#5a4630" : "#120c05"); }); }
  function useExit(ex) {
    if (host.state().busy) return;
    if (ex.x.type === "return-stitch") { if (!reqMet(ex.x)) { audio.sfx("nope"); host.toast(`It's sewn shut. Find ${goal} curiosities and it'll come undone.`); return; } exitHome(ex.wp, ex.kit); }
    if (ex.x.type === "descend") { audio.sfx("zip"); host.setZoom(false); host.threadWarp({ target: ex.wp, swap: () => place(data.spawns[ex.x.to], "You slide down the thread and land softly in the empty gallery.") }); }
  }

  // waystones
  const stones = (data.waystones || []).map((w) => { const g = new THREE.Group(); const y = w.y || 0; g.position.set(w.x, y, w.z); root.add(g);
    if (!w.y || w.secret) { box(0, 0.4, 0, 0.5, 0.8, 0.5, mat("#8b8a7a", { roughness: 0.8 }), g); box(0, 0.82, 0, 0.62, 0.06, 0.62, mat("#a4a28f"), g); }
    const cm = new THREE.MeshStandardMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.25, flatShading: true, roughness: 0.3, transparent: true, opacity: 0.92 });
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), cm); cr.scale.y = 1.6; cr.position.y = (!w.y || w.secret) ? 1.25 : 0.42; g.add(cr);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.015, 6, 28), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.0 })); ring.rotation.x = Math.PI / 2; ring.position.y = cr.position.y - 0.25; g.add(ring);
    return { w, g, cr, cm, ring, y, t: rnd(0, 6) }; });
  const attuned = (id) => !!prog.waystones[id];
  function refreshStones() { stones.forEach((s) => { const on = attuned(s.w.id); s.cm.emissiveIntensity = on ? 1.3 : 0.22; s.ring.material.opacity = on ? 0.8 : 0; }); }
  function useStone(s) {
    if (!attuned(s.w.id)) { prog.waystones[s.w.id] = new Date().toISOString(); save(); refreshStones(); audio.sfx("chime"); host.toast(`💎 Attuned: ${s.w.name}. You can always travel back here.`); host.updateActions(); return; }
    openTravel(s.w.id);
  }
  function openTravel(fromId) {
    host.openPanel("💎 Waystones", (pn) => {
      pn.appendChild(el("p", "o3-small", "Travel to any waystone you've attuned to. A tug of thread, and you're there."));
      stones.forEach((s) => { if (s.w.secret && !attuned(s.w.id)) return; const on = attuned(s.w.id);
        const b = el("button", "o3-btn" + (on ? "" : " ghost"), (on ? "💎 " : "❔ ") + (on ? s.w.name : "??? (not attuned yet)") + (s.w.id === fromId ? " · you are here" : ""));
        b.disabled = !on || s.w.id === fromId; b.dataset.stone = s.w.id; b.onclick = () => { host.closePanel(); travelTo(s.w.id); }; pn.appendChild(el("div", null)).appendChild(b); });
    });
  }
  let forceMisfire = null; // tests: true = force once, false = suppress once
  function travelTo(id) { const s = stones.find((q) => q.w.id === id); if (!s || !attuned(id)) return; audio.sfx("zip"); host.setZoom(false);
    const mf = data.misfire, chance = s.w.misfireChance ?? mf?.chance ?? 0;
    const fm = forceMisfire; forceMisfire = null;
    if (mf?.pool?.length && fm !== false && (fm || Math.random() < chance)) {
      const vis = new Set(prog.flags.visited || []), pool = mf.pool.filter((sp) => data.spawns[sp]);
      const fresh = pool.filter((sp) => !vis.has(roomOfLocal(data.spawns[sp].x, data.spawns[sp].z)));
      const to = pick(fresh.length ? fresh : pool); lastMisfire = to;
      return host.threadWarp({ swap: () => place(data.spawns[to], "💥 " + pick(mf.messages || ["Misfire!"])) }); }
    host.threadWarp({ swap: () => place(data.spawns[s.w.spawn], `You arrive at ${s.w.name}.`) }); }
  let lastMisfire = null;
  const roomOfLocal = (x, z) => data.rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)?.id || null;

  // curiosities
  const curios = (data.curiosities || []).map((c) => { const g = new THREE.Group(); g.position.set(c.x, 0, c.z); root.add(g); const ty = data.curiosityTypes[c.type];
    box(0, 0.17, 0, 0.34, 0.34, 0.3, mat("#b08a5a", { roughness: 1 }), g);
    let item;
    if (c.type === "memo") { item = plane(canvasTex(128, 160, (cx, w, h) => { cx.fillStyle = "#fffdf5"; cx.fillRect(0, 0, w, h); cx.fillStyle = "#444"; for (let i = 0; i < 7; i++) cx.fillRect(14, 22 + i * 18, 100 - (i % 3) * 18, 5); cx.fillStyle = "#b03a2e"; cx.fillRect(14, 140, 50, 8); }), 0.22, 0.28, 0, 0.345, 0, 0, g); item.rotation.x = -Math.PI / 2; item.rotation.z = 0.3; }
    else if (c.type === "badge") { item = plane(canvasTex(160, 110, (cx, w, h) => { cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.fillStyle = "#b03a2e"; cx.fillRect(0, 0, w, 34); cx.fillStyle = "#fff"; cx.font = "bold 20px system-ui"; cx.fillText("HELLO", 44, 24); cx.fillStyle = "#333"; cx.font = "italic 26px Georgia"; cx.fillText(nameOff, 20, 82); }), 0.2, 0.14, 0, 0.345, 0, 0, g); item.rotation.x = -Math.PI / 2; item.rotation.z = -0.4; }
    else { item = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), new THREE.MeshStandardMaterial({ color: "#d7dde0", emissive: "#bfe8ff", emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 })); item.rotation.z = Math.PI / 2; item.position.set(0, 0.37, 0); g.add(item); }
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: "#fffbe0" })); spark.position.y = 0.6; g.add(spark);
    const got = prog.curiosities.includes(c.id); g.visible = !got;
    return { c, ty, g, item, spark, t: rnd(0, 6) }; });
  function pickUp(cu) {
    if (prog.curiosities.includes(cu.c.id)) return; prog.curiosities.push(cu.c.id); save(); cu.g.visible = false; audio.sfx("pick"); refreshSeals();
    const n = prog.curiosities.length;
    host.openPanel(`${cu.ty.icon} You found ${cu.ty.name}`, (pn) => { pn.appendChild(el("p", null, fill(cu.ty.text))); pn.appendChild(el("p", "o3-small", `Pockets: ${n} curiosit${n === 1 ? "y" : "ies"}` + (n < goal ? ` · the Gremlins think ${goal} is a good start (optional)` : " ✓"))); });
    if (n === goal) setTimeout(() => host.toast(data.goal?.message || "Goal reached!"), 400);
    host.updateActions();
  }
  function openPockets() { host.openPanel("🎒 Pockets", (pn) => {
    const got = curios.filter((q) => prog.curiosities.includes(q.c.id));
    pn.appendChild(el("p", "o3-small", `Optional goal: find ${goal} curiosities. You have ${got.length} of ${curios.length} out there.`));
    if (!got.length) pn.appendChild(el("p", null, "Nothing yet. Look in corners, on boxes, near things that hum."));
    got.forEach((q) => { const r = el("div", "o3-note"); r.appendChild(el("b", null, `${q.ty.icon} ${q.ty.name[0].toUpperCase() + q.ty.name.slice(1)}: `)); r.appendChild(document.createTextNode(fill(q.ty.text))); pn.appendChild(r); });
  }); }
  function openSurvey() { host.openPanel("🗺 The Gremlins' survey", (pn) => {
    pn.appendChild(el("p", null, data.tagline)); const ul = el("ul", "o3-howto"); (data.overlook?.survey || []).forEach((s) => ul.appendChild(el("li", null, s))); pn.appendChild(ul);
    pn.appendChild(el("p", "o3-small", `Your waystones: ${stones.filter((s) => attuned(s.w.id)).length} of ${stones.length} · curiosities: ${prog.curiosities.length} of ${curios.length}`));
  }, { wide: true }); }

  // ---------- almost-people (NPCs) ----------
  const faceTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#e6d9bf"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(40,30,20,.55)";
    c.beginPath(); c.ellipse(40, 52, 9, 6, 0.2, 0, 7); c.fill(); c.beginPath(); c.ellipse(86, 58, 9, 6, -0.1, 0, 7); c.fill(); // eyes, not level
    c.strokeStyle = "rgba(40,30,20,.5)"; c.lineWidth = 4; c.beginPath(); c.arc(64, 78, 20, 0.2, Math.PI - 0.2); c.stroke(); c.globalAlpha = 0.35; c.beginPath(); c.arc(70, 84, 20, 0.2, Math.PI - 0.2); c.stroke(); }); // smile printed twice
  const badgeTex = canvasTex(96, 64, (c, w, h) => { c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.fillStyle = "#b03a2e"; c.fillRect(0, 0, w, 18); c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(12, 34, 70, 6); c.fillRect(12, 46, 50, 6); });
  function makeFigure(def) {
    const g = new THREE.Group(); root.add(g); const body = new THREE.Group(); g.add(body);
    const pale = def.type === "unfiled"; const bm = mat(def.color, pale ? { transparent: true, opacity: 0.82 } : {}); const dark = mat("#3d3a33");
    box(-0.12, 0.42, 0, 0.16, 0.84, 0.18, dark, body); box(0.12, 0.42, 0, 0.16, 0.84, 0.18, dark, body);
    box(0, 1.15, 0, 0.56, 0.66, 0.3, bm, body); box(-0.34, 1.12, 0, 0.12, 0.6, 0.14, bm, body);
    const rArm = box(0.34, 1.12, 0, 0.12, 0.6, 0.14, bm, body);
    const head = new THREE.Group(); head.position.y = 1.68; body.add(head);
    box(0, 0, 0, 0.34, 0.38, 0.32, mat("#e6d9bf", pale ? { transparent: true, opacity: 0.85 } : {}), head); plane(faceTex, 0.32, 0.34, 0, 0, 0.162, 0, head);
    plane(badgeTex, 0.12, 0.08, -0.14, 1.28, 0.152, 0, body); plane(badgeTex, 0.12, 0.08, -0.1, 1.17, 0.152, 0.08, body); // badge printed twice
    if (def.type === "reprint") { head.rotation.z = 0.12; const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.32), new THREE.MeshBasicMaterial({ color: "#e6d9bf", transparent: true, opacity: 0.25, depthWrite: false })); ghost.position.set(0.05, 0.02, -0.03); head.add(ghost); }
    if (def.type === "onhold") { rArm.position.set(0.3, 1.5, 0.02); rArm.rotation.z = 2.6; box(0.2, 0.02, 0.05, 0.06, 0.2, 0.08, mat("#222"), head); }
    if (def.type === "unfiled") for (let i = 0; i < 3; i++) { const sh = plane(null, 0.2, 0.28, rnd(-0.4, 0.4), rnd(0.9, 1.6), rnd(0.2, 0.3), rnd(-0.6, 0.6), body, { color: "#fffdf5", side: THREE.DoubleSide }); sh.rotation.z = rnd(-0.5, 0.5); }
    if (def.type === "echohire") { box(0.3, 1.0, 0.18, 0.24, 0.32, 0.02, mat("#c9a57a"), body); box(0, 1.38, 0.155, 0.02, 0.24, 0.005, mat("#2f6fb5"), body); }
    return { g, body, head };
  }
  const npcs = (data.npcs || []).map((d) => { const f = makeFigure(d); const pts = d.path.map(([x, z]) => new THREE.Vector2(x, z)); f.g.position.set(pts[0].x, 0, pts[0].y);
    return { d, ...f, pts, i: 1, wait: rnd(0, 2), talking: false, look: 0, ph: rnd(0, 6) }; });
  function openTalk(n) {
    n.talking = true; const lines = data.npcLines[n.d.type] || [];
    host.openPanel(`💬 ${n.d.name[0].toUpperCase() + n.d.name.slice(1)}`, (pn) => {
      pn.appendChild(el("p", "o3-small", "It looks almost like someone. Say something:")); const log = el("div", "o3-chatlog"); const row = el("div", "o3-prompts");
      (data.npcPrompts || []).forEach((q, qi) => { const b = el("button", "o3-btn ghost small", q); b.onclick = () => { const reply = fill(pick(lines[qi] || ["…"]));
        const a = el("div", "o3-note"); a.appendChild(el("b", null, "You: ")); a.appendChild(document.createTextNode(q)); const r = el("div", "o3-note o3-reply"); r.appendChild(el("b", null, n.d.name.replace(/^(a|an|the) /, "") + ": ")); r.appendChild(document.createTextNode(reply));
        log.append(a, r); log.scrollTop = 1e6; audio.sfx("blip"); }; row.appendChild(b); });
      pn.append(row, log);
    }, { onClose: () => { n.talking = false; n.wait = rnd(1, 3); } });
  }

  // ---------- gentle grabbers (they relocate you; nothing else) ----------
  function makeGrabber(d) {
    const g = new THREE.Group(); root.add(g); const parts = [];
    if (d.type === "hem") { const tm = mat("#d9cfb3", { roughness: 1 });
      for (let i = 0; i < 6; i++) { const pts = []; for (let k = 0; k < 6; k++) pts.push(new THREE.Vector3(rnd(-0.4, 0.4), 0.1 + k * 0.34 + rnd(-0.1, 0.1), rnd(-0.4, 0.4)));
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 5), tm); g.add(m); parts.push(m); }
      const ank = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 5, 18), tm); ank.rotation.x = Math.PI / 2; ank.position.y = 0.08; g.add(ank); parts.push(ank); }
    else if (d.type === "courtesy") { const wm = mat("#4a3b2e");
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), wm); pole.position.y = 1.3; g.add(pole);
      box(0, 0.03, 0, 0.7, 0.05, 0.08, wm, g); box(0, 0.03, 0, 0.08, 0.05, 0.7, wm, g);
      const top = new THREE.Group(); top.position.y = 2.45; g.add(top);
      [0, 1.57, 3.14, 4.71].forEach((a) => { const h = box(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14, 0.03, 0.03, 0.22, wm, top); h.rotation.y = a; });
      box(0, 0.22, 0, 0.36, 0.14, 0.36, mat("#2b2b30"), top); box(0, 0.16, 0, 0.5, 0.02, 0.5, mat("#2b2b30"), top); // a hat
      box(0, -0.75, 0.1, 0.62, 1.2, 0.22, mat("#6c5a48"), top); parts.push(top); }
    else { const lm = mat("#9b7fb8", { flatShading: true }); const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), lm); lump.position.y = 0.62; g.add(lump); parts.push(lump);
      [["#e8573f", 0.5, 0.95, 0.3], ["#5f9fd6", -0.45, 0.7, 0.4], ["#f3d98b", 0.1, 1.2, -0.35], ["#7fbf6a", -0.2, 0.4, -0.5]].forEach(([c, x, y, z]) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(c, { flatShading: true })); b.position.set(x, y - 0.62, z); lump.add(b); });
      box(0.15, 0.25, 0.62, 0.3, 0.06, 0.04, mat("#3a2a3a"), lump); } // a soft grin
    return { g, parts };
  }
  const grabbers = (data.grabbers || []).map((d) => { const k = makeGrabber(d); k.g.position.set(d.home[0], 0, d.home[1]); return { d, ...k, state: "home", told: false, cool: 0 }; });
  function grab(gr) {
    gr.state = "cool"; gr.cool = 14; gr.told = false; audio.sfx("flump");
    if (gr.d.officeChance && Math.random() < gr.d.officeChance) { host.toast("The Hem reeled you all the way back through the stitch. (It does that sometimes.)"); exitHome(null, null, true); return; }
    const mercy = Math.random() < (gr.d.mercyChance ?? 0);
    let sp, note = gr.d.caught;
    if (mercy) { sp = mercySpot(); if (gr.d.type !== "bounceback") note = gr.d.caught + " Lucky drop: somewhere familiar."; }
    else sp = data.spawns[pick(gr.d.drops || ["print-arrival"])];
    host.threadWarp({ swap: () => { gr.g.position.set(gr.d.home[0], 0, gr.d.home[1]); place(sp, note); } });
  }
  function mercySpot() { // nearest attuned waystone, else the arrival stitch
    const p = local(host.state().pos); let best = null, bd = 1e9;
    stones.forEach((s) => { if (!attuned(s.w.id) || s.w.secret) return; const d = Math.hypot(s.w.x - p.x, s.w.z - p.z); if (d < bd) { bd = d; best = s; } });
    return best ? data.spawns[best.w.spawn] : data.spawns["print-arrival"];
  }

  // ---------- arriving, moving around, leaving ----------
  const local = (pos) => ({ x: pos.x - AX, z: pos.z - AZ });
  let timeIn = 0, lostHelped = false, visitFrom = null;
  function place(sp, toast) { if (!sp) return; host.placeAnnex({ x: AX + sp.x, z: AZ + sp.z, y: sp.y || 0, yaw: sp.yaw || 0, pitch: sp.pitch ?? 0 }); if (toast) host.toast(toast); }
  function arrive(sp, spawnId, e) {
    visitFrom = e?.id || null; timeIn = 0; lostHelped = false;
    shifts.forEach((S) => { if (S.sh.onEnter && S.sh.layouts.length > 1) applyLayout(S, Math.floor(Math.random() * S.sh.layouts.length)); }); // it's never quite the same twice
    host.enterAnnexMode(); place(sp); audio.start(); muteBtn.hidden = false; renderMute();
    if (spawnId === "overlook-arrival") { prog.flags.foundOverlook = true; save(); banner("aha! this is where we found it.", "The Gremlins' Overlook · a secret way into the Elsewhere Annex"); }
    else banner(data.name, data.tagline);
  }
  function exitHome(target, kit, quick) {
    audio.sfx("zip"); host.setZoom(false);
    host.threadWarp({ target: target || null, onK: (k) => kit?.yawn?.(k), swap: () => { kit?.yawn?.(0); audio.stop(); muteBtn.hidden = true; host.leaveAnnexMode(); if (!quick) host.toast("You're back in the office. The stitch is still there, if you want it."); } });
  }

  // ---------- HUD bits ----------
  const muteBtn = el("button", "o3-btn ghost o3-q o3-mute"); muteBtn.hidden = true; muteBtn.setAttribute("aria-label", "Mute Annex sound");
  const renderMute = () => { muteBtn.textContent = audio.muted ? "🔇" : "🔊"; muteBtn.title = audio.muted ? "Sound off (click to unmute)" : "Sound on (click to mute)"; muteBtn.setAttribute("aria-pressed", String(audio.muted)); };
  muteBtn.onclick = () => { audio.setMuted(!audio.muted); renderMute(); host.toast(audio.muted ? "Annex sound muted." : "Annex sound on."); }; renderMute();
  const bannerEl = el("div", "o3-annexbanner"); const bT = el("b"), bS = el("span"); bannerEl.append(bT, bS); host.hud.appendChild(bannerEl);
  function banner(t, s) { bT.textContent = t; bS.textContent = s; bannerEl.classList.add("show"); clearTimeout(bannerEl._h); bannerEl._h = setTimeout(() => bannerEl.classList.remove("show"), 5200); }
  function hudButtons() {
    const out = [];
    const nStones = stones.filter((s) => attuned(s.w.id)).length;
    if (nStones) out.push(Object.assign(el("button", "o3-btn ghost", `💎 Waystones (${nStones})`), { onclick: () => openTravel(null) }));
    out.push(Object.assign(el("button", "o3-btn ghost", `🎒 Pockets ${prog.curiosities.length}/${goal}`), { onclick: openPockets }));
    return out;
  }

  // ---------- "near" targets for the action button / E key ----------
  const fwdH = new THREE.Vector2();
  function near({ mode, pos, feet, fwd }) {
    let best = null, bd = 1e9; const cand = (key, d, max, label, run) => { if (d < max && d < bd) { bd = d; best = { key, label, run }; } };
    if (mode === "office") {
      fwdH.set(fwd.x, fwd.z).normalize();
      officeEntrances.forEach((en) => { const dx = en.wp.x - pos.x, dz = en.wp.z - pos.z, d = Math.hypot(dx, dz);
        if (en.e.mustFace && (d < 0.01 || (dx * fwdH.x + dz * fwdH.y) / d < 0.55)) return;
        cand(en.key, d, en.e.near || 2.4, en.e.prompt || "🧵 Touch the stitch", () => useEntrance(en)); });
      return best;
    }
    if (mode !== "annex") return null;
    const p = local(pos), lv = (y) => Math.abs((y || 0) - feet) < 2.5;
    stones.forEach((s) => { if (!lv(s.y)) return; cand("ws:" + s.w.id, Math.hypot(s.w.x - p.x, s.w.z - p.z), 2.0, attuned(s.w.id) ? "💎 Waystone: travel" : "💎 Attune to this waystone", () => useStone(s)); });
    curios.forEach((c) => { if (!c.g.visible) return; cand("cu:" + c.c.id, Math.hypot(c.c.x - p.x, c.c.z - p.z), 1.6, `✋ Pick up ${c.ty.name}`, () => pickUp(c)); });
    exits.forEach((ex) => { if (!lv(ex.ly)) return; const locked = ex.x.requires && !reqMet(ex.x); cand("ex:" + ex.x.id + (locked ? ":l" : ""), Math.hypot(ex.lx - p.x, ex.lz - p.z), 2.2, locked ? ex.x.lockedPrompt : ex.x.prompt, () => useExit(ex)); });
    npcs.forEach((n) => { if (feet > 1) return; cand("npc:" + n.d.id, Math.hypot(n.g.position.x - p.x, n.g.position.z - p.z), 2.4, `💬 Say something to ${n.d.name}`, () => openTalk(n)); });
    overlookSpots.forEach((o) => { if (!lv(o.y)) return; const lab = o.label(); cand("ov:" + o.key + lab, Math.hypot(o.x - p.x, o.z - p.z), 1.9, lab, o.run); });
    return best;
  }
  const clickTargets = (mode) => mode === "office" ? officeEntrances.map((e) => e.kit.hit) : exits.filter((x) => x.kit).map((x) => x.kit.hit);

  // ---------- per-frame ----------
  const v2 = new THREE.Vector2();
  function update(dt, ts, st) {
    stitches.forEach((s) => s.anim(ts));
    if (st.mode !== "annex") return;
    const p = local(st.pos), zone = st.zone, busy = st.busy;
    timeIn += dt; shifts.forEach((S) => tickShift(S, dt, p, true));
    flicker.forEach((f) => { f.t += dt; const on = Math.sin(f.t * 0.7) > -0.92 || Math.random() < 0.3; f.m.material.emissiveIntensity = on ? f.base : 0.15; });
    stones.forEach((s) => { s.cr.rotation.y = ts * 0.8 + s.t; s.cr.position.y = ((!s.w.y || s.w.secret) ? 1.25 : 0.42) + Math.sin(ts * 1.6 + s.t) * 0.05; s.ring.scale.setScalar(1 + Math.sin(ts * 2 + s.t) * 0.08); });
    curios.forEach((c) => { if (!c.g.visible) return; c.spark.position.y = 0.6 + Math.sin(ts * 2 + c.t) * 0.06; c.spark.rotation.y = ts * 2; c.spark.visible = Math.sin(ts * 1.3 + c.t) > -0.3; if (c.c.type === "starter") c.item.material.emissiveIntensity = 0.3 + Math.random() * 0.6; });
    receders.forEach((r) => { const d = Math.hypot(r.bx - p.x, r.bz - p.z); const away = Math.sign(r.bx - p.x) || 1; const k = Math.max(0, Math.min(1, (4.5 - d) / 3)); r.g.position.x += ((r.bx + away * k * 1.4) - r.g.position.x) * Math.min(1, dt * 2); });
    // NPCs wander on their own
    npcs.forEach((n) => { const gp = n.g.position, dp = Math.hypot(gp.x - p.x, gp.z - p.z);
      if (n.talking || (dp < 1.3 && st.feet < 1)) { const want = Math.atan2(p.x - gp.x, p.z - gp.z); n.g.rotation.y += angDiff(want, n.g.rotation.y) * Math.min(1, dt * 4); n.body.position.y = 0; return; }
      if (n.wait > 0) { n.wait -= dt; n.look += dt; if (n.look > 1.6) { n.look = 0; if (Math.random() < 0.4) n.g.rotation.y += rnd(-1.2, 1.2); } n.body.position.y = 0; return; }
      const tgt = n.pts[n.i]; v2.set(tgt.x - gp.x, tgt.y - gp.z); const d = v2.length();
      if (d < 0.05) { n.i = (n.i + 1) % n.pts.length; if (Math.random() < 0.6) n.wait = rnd(2, 6); return; }
      const sp = Math.min(d, n.d.speed * dt);
      if (blockedLocal(gp.x + v2.x / d * 0.5, gp.z + v2.y / d * 0.5)) { n.pts.reverse(); n.i = (n.pts.length - 1 - n.i + 1) % n.pts.length; n.wait = rnd(1, 3); return; } // a wall appeared: turn around
      gp.x += v2.x / d * sp; gp.z += v2.y / d * sp;
      const want = Math.atan2(v2.x, v2.y); n.g.rotation.y += angDiff(want, n.g.rotation.y) * Math.min(1, dt * 5);
      n.body.position.y = Math.abs(Math.sin(ts * 6 + n.ph)) * 0.04; n.head.rotation.y = Math.sin(ts * 0.7 + n.ph) * 0.3; });
    // grabbers: slow, telegraphed, stay in their own room
    grabbers.forEach((gr) => { const gp = gr.g.position, r = roomsById[gr.d.room], inRoom = zone === "annex:" + gr.d.room, dp = Math.hypot(gp.x - p.x, gp.z - p.z);
      animGrabber(gr, ts);
      if (gr.state === "cool") { gr.cool -= dt; moveTo(gr, gr.d.home[0], gr.d.home[1], dt, r); if (gr.cool <= 0) gr.state = "home"; return; }
      if (busy) return;
      if (inRoom && dp < gr.d.notice) { if (gr.state !== "stalk") { gr.state = "stalk"; if (!gr.told) { gr.told = true; host.toast(gr.d.telegraph); audio.sfx(gr.d.type === "bounceback" ? "flump" : "blip"); } } }
      else if (gr.state === "stalk" && (!inRoom || dp > gr.d.notice + 3)) { gr.state = "home"; gr.told = false; }
      if (gr.state === "stalk") { moveTo(gr, p.x, p.z, dt, r); if (dp < 0.75) grab(gr); }
      else moveTo(gr, gr.d.home[0], gr.d.home[1], dt, r); });
    // soft redirects (the hallway that turns when you're not looking)
    (data.redirects || []).forEach((rd) => { if (!busy && p.x > rd.x0 && p.x < rd.x1 && p.z > rd.z0 && p.z < rd.z1) place(data.spawns[rd.to], rd.toast); });
    // mercy if someone is really lost and has no stone yet
    if (!lostHelped && !busy && timeIn > (data.lostMercySeconds || 300) && !stones.some((s) => attuned(s.w.id))) { lostHelped = true; audio.sfx("flump");
      host.threadWarp({ swap: () => place(data.spawns["print-arrival"], "The Bounceback found you wandering and hugged you back to the stitch. (Try a waystone next time!)") }); }
  }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function moveTo(gr, x, z, dt, r) { const gp = gr.g.position; v2.set(x - gp.x, z - gp.z); const d = v2.length(); if (d < 0.02) return;
    const sp = Math.min(d, gr.d.speed * dt); if (blockedLocal(gp.x + v2.x / d * 0.4, gp.z + v2.y / d * 0.4)) return; gp.x = Math.max(r.x0 + 0.5, Math.min(r.x1 - 0.5, gp.x + v2.x / d * sp)); gp.z = Math.max(r.z0 + 0.5, Math.min(r.z1 - 0.5, gp.z + v2.y / d * sp)); gr.g.rotation.y = Math.atan2(v2.x, v2.y); }
  function animGrabber(gr, ts) {
    if (gr.d.type === "hem") gr.parts.forEach((m, i) => { m.rotation.y = ts * (0.3 + i * 0.07) * (i % 2 ? 1 : -1); });
    else if (gr.d.type === "courtesy") gr.parts[0].rotation.x = Math.sin(ts * 1.4) * 0.12; // the polite nod
    else { const s = 1 + Math.sin(ts * 5) * 0.08; gr.parts[0].scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); gr.parts[0].position.y = 0.62 + Math.abs(Math.sin(ts * 5)) * 0.12; }
  }
  function atmos(zone) { const r = roomsById[String(zone || "").replace("annex:", "")]; if (!r) return null;
    const v = (prog.flags.visited ||= []); if (!v.includes(r.id)) { v.push(r.id); save(); }
    return pal(r.level); }
  const roomLabel = (zone) => roomsById[String(zone || "").replace("annex:", "")]?.label || data.name;

  (data.entrances || []).forEach(placeEntrance);
  refreshStones();

  // demo / test helpers (office3d only exposes these through window.__o3 in localhost demo mode)
  const W3 = (x, y, z) => ({ x: AX + x, y, z: AZ + z });
  const debug = {
    state: () => ({ prog: JSON.parse(JSON.stringify(prog)), audio: audio.state(), timeIn,
      npcs: npcs.map((n) => ({ id: n.d.id, ...W3(n.g.position.x, 0, n.g.position.z), talking: n.talking })),
      grabbers: grabbers.map((g) => ({ id: g.d.id, state: g.state, ...W3(g.g.position.x, 0, g.g.position.z) })),
      entrances: officeEntrances.map((e) => ({ id: e.e.id, x: e.wp.x, y: e.wp.y, z: e.wp.z, nx: e.nrm.x, nz: e.nrm.z, sx: e.stand.x, sz: e.stand.z })) }),
    stone: (id) => { const s = stones.find((q) => q.w.id === id); return s && W3(s.w.x, s.y, s.w.z); },
    spawn: (id) => { const s = data.spawns[id]; return s && { ...W3(s.x, s.y || 0, s.z), yaw: s.yaw, pitch: s.pitch }; },
    npc: (id) => { const n = npcs.find((q) => q.d.id === id); return n && W3(n.g.position.x, 0, n.g.position.z); },
    grabber: (id) => { const g = grabbers.find((q) => q.d.id === id); return g && W3(g.g.position.x, 0, g.g.position.z); },
    curio: (id) => { const c = curios.find((q) => q.c.id === id); return c && W3(c.c.x, 0, c.c.z); },
    arrive: (spawnId) => arrive(data.spawns[spawnId], spawnId, null),
    goto: (spawnId) => place(data.spawns[spawnId]),
    gotoLocal: (x, z, yaw = 0, y = 0, pitch = 0) => place({ x, z, yaw, y, pitch }),
    shift: (id, idx) => { const S = shifts.find((q) => q.sh.id === id); if (S) startShift(S, idx); },
    layout: (id) => shifts.find((q) => q.sh.id === id)?.layout, blockedLocal, misfireNext: (v = true) => { forceMisfire = v; }, lastMisfire: () => lastMisfire,
    reset: () => { prog = { waystones: {}, curiosities: [], flags: {} }; save(); curios.forEach((c) => (c.g.visible = true)); refreshStones(); refreshSeals(); },
  };
  return { near, clickTargets, update, blockedAt: (x, z) => blockedLocal(x - AX, z - AZ), hudButtons, atmos, roomLabel, exitHome: () => exitHome(null, null), muteBtn, debug, audio };
}
