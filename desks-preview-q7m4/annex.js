// The Elsewhere Annex v3 (behind The Loose Stitch). Eclectic Transformation · Gremlin Desks only.
// A Backrooms-inspired side world, now procedural: a seeded grid of cells streamed in around you and thrown away
// behind you. Each section (data.sections) has a crystal plaza at its center cell; every other cell joins the nearest
// section and gets SAFE hallways plus rooms off them. Grabbers and the rare almost-people only ever live inside rooms.
// Sections slowly rearrange (rooms re-roll, hallway walls slide) around their crystal. Progress is per player in localStorage.
// v3: Grenshol (a big, curious creature the Gremlins let out of a portal), its flitters, lights-change mode, Escher stairwells,
// silly TVs, and the glimpse world (glimpse.js + data/glimpse-world.json).
import { createAnnexAudio } from "./annex-audio.js";

export function createAnnex(kit, data, host) {
  const { THREE, scene, mat, box, plane, canvasTex, plate, wrap, PAL, H, T, R, ROOM, walkable, planeGeo } = kit;
  const AX = data.origin?.x ?? -200, AZ = data.origin?.z ?? 0;
  const root = new THREE.Group(); root.position.set(AX, 0, AZ); scene.add(root);
  const el = host.el, audio = createAnnexAudio();
  const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const GR = data.grid || {};
  const C = GR.cell || 16, HW = (GR.hall || 2.4) / 2, PM = GR.plazaMargin ?? 2, GAP = GR.roomGap ?? 0.3, LOAD = GR.loadRadius ?? 1, UNLOAD = GR.unloadRadius ?? 2, C2 = C / 2;
  const sections = data.sections || [], secById = Object.fromEntries(sections.map((s) => [s.id, s]));
  const startSec = secById[data.start?.section] || sections[0];
  const npcDefs = Object.fromEntries((data.npcs || []).map((n) => [n.id, n]));
  const W3 = (x, y, z) => ({ x: AX + x, y, z: AZ + z }); // root-local -> world

  // ---------- player names (the almost-people get yours slightly wrong) ----------
  const first = String(host.me?.display_name || "you").trim().split(/\s+/)[0] || "you";
  const nameOff = (() => { const s = first; if (s.length < 3) return s + s.slice(-1); const a = s.split(""); const i = a.length - 2; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a.join(""); })();
  const fill = (t) => String(t).replaceAll("{name}", first).replaceAll("{nameOff}", nameOff);

  // ---------- progress (localStorage, same JSON shape as a future seam_progress row) ----------
  const KEY = "et-desks-annex-v1:" + (host.me?.id || "anon");
  let prog = { waystones: {}, curiosities: [], flags: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") prog = { waystones: s.waystones || {}, curiosities: s.curiosities || [], flags: s.flags || {}, glimpse: s.glimpse || {} }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...prog, updated_at: new Date().toISOString() })); } catch {} };
  const goal = data.goal?.curiosities || 3;

  // ---------- seeded hashing (same seed = same hallways; epochs re-roll rooms) ----------
  const SEED = data.seed | 0;
  const strH = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
  function hsh(...v) { let h = (SEED ^ 0x9e3779b9) | 0; for (let x of v) { if (typeof x === "string") x = strH(x); h = Math.imul(h ^ (x | 0), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; } return (h >>> 0) / 4294967296; }
  const pickH = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];

  // ---------- the map: sections (Voronoi around crystal centers), dead zones, forced corridors ----------
  const ck = (i, j) => i + "," + j;
  const centerOf = new Map(sections.map((s) => [ck(s.center[0], s.center[1]), s]));
  const secCache = new Map();
  function sectionOf(i, j) { const k = ck(i, j); let s = secCache.get(k); if (s) return s; s = centerOf.get(k);
    if (!s) { let bd = 1e9; for (const S of sections) { const d = Math.hypot(i - S.center[0], j - S.center[1]) + hsh(i, j, "vor", S.id) * 1.6; if (d < bd) { bd = d; s = S; } } }
    if (secCache.size > 40000) secCache.clear(); secCache.set(k, s); return s; }
  const deadCells = new Map(); // "i,j" -> { z: zone def, S }
  sections.forEach((S) => (S.deadZones || []).forEach((z) => (z.cells || []).forEach(([di, dj]) => deadCells.set(ck(S.center[0] + di, S.center[1] + dj), { z, S }))));
  const EK = (i, j, a) => i + "," + j + "," + a;
  const forced = new Set();
  const DIRS = ["xp", "xn", "zp", "zn"], DV = { xp: [1, 0], xn: [-1, 0], zp: [0, 1], zn: [0, -1] };
  const edgeOf = (i, j, d) => d === "xp" ? EK(i, j, "x") : d === "xn" ? EK(i - 1, j, "x") : d === "zp" ? EK(i, j, "z") : EK(i, j - 1, "z");
  sections.forEach((S) => { const [ci, cj] = S.center; DIRS.forEach((d) => { for (let k = 0; k < (GR.spokes ?? 2); k++) forced.add(edgeOf(ci + DV[d][0] * k, cj + DV[d][1] * k, d)); }); });
  deadCells.forEach((_, k) => { const [i, j] = k.split(",").map(Number); DIRS.forEach((d) => forced.add(edgeOf(i, j, d))); });
  const QUADS = [[1, 1], [-1, 1], [1, -1], [-1, -1]]; // quadrant index -> (sx, sz)
  const curioByCell = new Map(); const curioDefs = [];
  (data.curiosities || []).forEach((c) => { const S = secById[c.section]; if (!S) return; const i = S.center[0] + c.cell[0], j = S.center[1] + c.cell[1], qi = c.quad ?? 0, sz = QUADS[qi][1];
    forced.add(edgeOf(i, j, sz > 0 ? "zp" : "zn")); const row = { ...c, i, j, qi, via: "z" }; curioDefs.push(row);
    if (!curioByCell.has(ck(i, j))) curioByCell.set(ck(i, j), []); curioByCell.get(ck(i, j)).push(row); });
  function edgeOpen(i, j, d) { const k = edgeOf(i, j, d); if (forced.has(k)) return true; const [a, b, ax] = k.split(","); const S = sectionOf(+a, +b); return hsh(+a, +b, ax, "edge") < (S.openness ?? 0.68); }
  const depthOf = (i, j) => Math.hypot(i - startSec.center[0], j - startSec.center[1]);
  const epochs = {}; sections.forEach((S) => (epochs[S.id] = 0));
  const q2 = (v) => Math.round(v * 2) / 2;

  // A cell's plan is pure data (deterministic for a given epoch); tests read it via debug.plan().
  function planCell(i, j, ep) {
    const S = sectionOf(i, j), key = ck(i, j), dz = deadCells.get(key) || null, center = centerOf.get(key) === S;
    const arms = {}; DIRS.forEach((d) => (arms[d] = edgeOpen(i, j, d)));
    const hs = center ? C2 - PM : HW;
    const blk = []; // shifting hallway walls on the cell's own +x / +z edges
    if (!center && S.shift?.blockChance) [["xp", "x"], ["zp", "z"]].forEach(([d, a]) => { if (arms[d] && !forced.has(EK(i, j, a)) && hsh(i, j, a, "blk", ep) < S.shift.blockChance) blk.push(d); });
    const rooms = [];
    if (!center) {
      const Q = C2 - HW - GAP, cur = curioByCell.get(key) || [];
      QUADS.forEach(([sx, sz], qi) => {
        const cu = cur.find((c) => c.qi === qi), zArm = sz > 0 ? "zp" : "zn", xArm = sx > 0 ? "xp" : "xn";
        const opts = []; if (arms[zArm]) opts.push("z"); if (arms[xArm]) opts.push("x"); if (!opts.length) return;
        const e = cu ? 0 : ep;
        if (!cu && hsh(i, j, qi, "room", e) >= (S.roomChance ?? 0.5)) return;
        const w = cu ? q2(Q) : q2(3 + hsh(i, j, qi, "w", e) * (Q - 3)), d = cu ? q2(Q) : q2(3 + hsh(i, j, qi, "d", e) * (Q - 3));
        const x0 = sx > 0 ? C2 + HW : C2 - HW - w, z0 = sz > 0 ? C2 + HW : C2 - HW - d, x1 = x0 + w, z1 = z0 + d;
        const via = cu ? cu.via : opts[Math.floor(hsh(i, j, qi, "via", e) * opts.length)];
        let door;
        if (via === "z") { const lo = z0 + 0.9, hi = z1 - 0.9; door = { line: "x", at: C2 + sx * HW, c: q2(lo + hsh(i, j, qi, "dc", e) * (hi - lo)), w: 1.2, arm: zArm }; }
        else { const lo = x0 + 0.9, hi = x1 - 0.9; door = { line: "z", at: C2 + sz * HW, c: q2(lo + hsh(i, j, qi, "dc", e) * (hi - lo)), w: 1.2, arm: xArm }; }
        const type = cu ? "nook" : pickH(S.roomTypes || ["empty"], hsh(i, j, qi, "type", e));
        let grab = null, npc = null;
        if (!cu && !dz && S.grabbers?.length && hsh(i, j, qi, "grab", e) < (S.grabberChance ?? 0)) grab = pickH(S.grabbers, hsh(i, j, qi, "gt", e));
        if (!cu && !grab && !dz && S.npcs?.length && depthOf(i, j) >= (GR.npcMinDepth ?? 4) && hsh(i, j, qi, "npc", e) < (S.npcChance ?? 0)) npc = pickH(S.npcs, hsh(i, j, qi, "nt", e));
        let stair = null, tv = false, sw = false; // v3 (own hash keys, so v2 rolls are unchanged)
        if (!cu && !grab && !npc && hsh(i, j, qi, "stair", e) < (S.stairChance ?? 0)) stair = pickStair(hsh(i, j, qi, "stk", e));
        if (!cu && !stair && (data.tvs?.roomTypes || []).includes(type) && hsh(i, j, qi, "tv", e) < (data.tvs?.chance ?? 0)) tv = true;
        if (!cu && !grab && !npc && !stair && !dz && creatureOK(i, j) && hsh(i, j, qi, "sw", e) < (data.aliveMode?.switchChance ?? 0)) sw = true;
        rooms.push({ qi, sx, sz, x0, x1, z0, z1, door, type, grab, npc, curio: cu?.id || null, stair, tv, sw });
      });
    }
    return { i, j, key, S, dead: dz, center, arms, hs, blk, rooms, ep };
  }

  // ---------- shared materials / geometry (chunks reuse these, so throwing a chunk away leaks nothing) ----------
  const cache = new Map(); const once = (k, fn) => { let v = cache.get(k); if (v === undefined) { v = fn(); cache.set(k, v); } return v; };
  const cplane = (tex, w, h, x, y, z, ry = 0, parent = root, extra = {}) => {
    const m = once("pm:" + (tex?.uuid || "none") + JSON.stringify(extra), () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, ...extra }));
    const me = new THREE.Mesh(planeGeo, m); me.scale.set(w, h, 1); me.position.set(x, y, z); me.rotation.y = ry; parent.add(me); return me; };
  const floorTex = (style, base) => canvasTex(128, 128, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h);
    if (style === "tile") { c.strokeStyle = "rgba(60,90,90,.28)"; c.lineWidth = 2; for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, k * 32); c.lineTo(w, k * 32); c.stroke(); } return; }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? "60,50,20" : "255,250,220"},${rnd(0.03, 0.09)})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = style === "concrete" ? "rgba(30,30,30,.10)" : "rgba(70,60,25,.10)"; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(rnd(20, 108), rnd(20, 108), rnd(10, 26), rnd(6, 16), rnd(0, 3), 0, 7); c.fill(); } }); // damp patches
  const palOf = (S, dead) => dead ? { ...S.palette, ...(data.deadPalette || {}) } : S.palette;
  function secMats(S, dead) { return once("sm:" + S.id + (dead ? ":dead" : ""), () => { const p = palOf(S, dead);
    return { p, wall: mat(p.wall, { roughness: 0.95 }), trim: mat(p.trim, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      ceil: mat(p.ceil, { emissive: p.ceil, emissiveIntensity: 0.25 }), base: floorTex(S.floorStyle || "carpet", p.floor),
      light: new THREE.MeshStandardMaterial({ color: "#fff7d0", emissive: "#fff2b8", emissiveIntensity: p.light }), lightBase: p.light,
      flick: new THREE.MeshStandardMaterial({ color: "#fff7d0", emissive: "#fff2b8", emissiveIntensity: p.light }), ft: rnd(0, 5) }; }); }
  const floorMat = (M, key, w, d) => once("fm:" + key + ":" + w.toFixed(1) + "x" + d.toFixed(1), () => { const t = M.base.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, w / 3.5), Math.max(1, d / 3.5)); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); });
  function floorCeil(g, x0, x1, z0, z1, M, mk) { const w = x1 - x0, d = z1 - z0;
    const f = new THREE.Mesh(planeGeo, floorMat(M, mk, w, d)); f.rotation.x = -Math.PI / 2; f.scale.set(w, d, 1); f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.add(f);
    const ce = new THREE.Mesh(planeGeo, M.ceil); ce.rotation.x = Math.PI / 2; ce.scale.set(w, d, 1); ce.position.set((x0 + x1) / 2, H, (z0 + z1) / 2); g.add(ce); }
  const lightPanel = (g, x, z, M, flick) => box(x, H - 0.02, z, 1.2, 0.03, 0.6, flick ? M.flick : M.light, g);

  // walls with door gaps (each space draws its own walls inset by T/2, so neighbours never overlap)
  function wallRun(par, axis, line, inward, a, b, gaps, hgt, m, trimM) {
    const c = line + inward * T / 2; let cur = a; const segs = [];
    function piece(s0, s1, y0, y1, mm, off = 0, th = T) { const mid = (s0 + s1) / 2, len = s1 - s0; if (len <= 0.001) return;
      if (axis === "x") box(mid, (y0 + y1) / 2, c + off, len, y1 - y0, th, mm, par); else box(c + off, (y0 + y1) / 2, mid, th, y1 - y0, len, mm, par); }
    [...gaps].sort((p, q) => p.c - q.c).forEach((g) => { const g0 = Math.max(a, g.c - g.w / 2), g1 = Math.min(b, g.c + g.w / 2);
      if (g0 > cur) segs.push([cur, g0]); if (!g.open && g1 > g0) piece(g0, g1, 2.2, hgt, m); cur = Math.max(cur, g1); });
    if (b > cur) segs.push([cur, b]);
    segs.forEach(([s0, s1]) => { piece(s0, s1, 0, hgt, m); if (trimM) piece(s0, s1, 0.004, 0.12, trimM, inward * 0.02, T); });
  }
  const wallSpot = (r, wall, at, y) => { const off = T + 0.012;
    if (wall === "n") return { x: at, z: r.z1 - off, ry: Math.PI, y }; if (wall === "s") return { x: at, z: r.z0 + off, ry: 0, y };
    if (wall === "w") return { x: r.x0 + off, z: at, ry: Math.PI / 2, y }; return { x: r.x1 - off, z: at, ry: -Math.PI / 2, y }; };
  const wallMid = (r, wall) => (wall === "n" || wall === "s" ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2);

  // ---------- props ----------
  const posterTex = canvasTex(256, 360, (c, w, h) => { c.fillStyle = "#f4efd9"; c.fillRect(0, 0, w, h); c.strokeStyle = "#7a6f45"; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = "#b03a2e"; c.font = "bold 34px system-ui"; c.textAlign = "center"; c.fillText("YOU ARE HERE", w / 2, 56);
    c.strokeStyle = "#7a6f45"; c.lineWidth = 10; c.strokeRect(50, 90, 156, 200); c.strokeRect(85, 125, 86, 130);
    c.fillStyle = "#b03a2e"; c.beginPath(); c.arc(128, 100, 12, 0, 7); c.fill(); c.font = "bold 40px system-ui"; c.fillText("↻", 128, 335); });
  const frameTex = canvasTex(256, 300, (c, w, h) => { c.fillStyle = "#efe6c8"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(120,100,50,.12)"; c.fillRect(20, 20, w - 40, h - 40); });
  const frameLabel = plate("Untitld", "by (unreadable)", { w: 768, h: 140, bg: "#f3ead2", fg: PAL.ink, accent: "#a8964f" });
  const exitTex = plate("EXIT →", "(probably)", { w: 900, h: 320, bg: "#2f6b3a", fg: "#fbf3d0", accent: "#cfe6b8" });
  const servingTex = plate("NOW SERVING", "—", { w: 900, h: 320, bg: "#2d3a33", fg: "#ff6b5a", accent: "#8f9f88" });
  const snaksTex = plate("SNAKS", "no buttons", { w: 512, h: 150, bg: "#2d3a33", fg: "#cfe6b8", accent: "#8f9f88" });
  let curTwitch = null; const twk = (o) => { if (curTwitch && o) { o.userData.ry0 = o.rotation.y; o.userData.rz0 = o.rotation.z; curTwitch.push(o); } return o; }; // props that twitch in lights-change mode
  const P = {
    plant(g, x, z, s = 1) { box(x, 0.22 * s, z, 0.4 * s, 0.44 * s, 0.4 * s, mat(PAL.clay), g);
      const m = new THREE.Mesh(once("geo:plant", () => new THREE.IcosahedronGeometry(0.38, 1)), mat("#6f7f45", { flatShading: true })); m.scale.setScalar(s); m.position.set(x, 0.75 * s, z); g.add(m); twk(m); },
    chair(g, x, z, ry, color = PAL.forest) { const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c); twk(c);
      box(0, 0.48, 0, 0.55, 0.08, 0.55, mat(color), c); box(0, 0.8, -0.26, 0.55, 0.6, 0.06, mat(color), c); box(0, 0.24, 0, 0.06, 0.45, 0.06, mat(PAL.ink), c); },
    table(g, x, z, big) { const w = big ? 1.4 : 1.1, d = big ? 0.9 : 0.7; box(x, 0.82, z, w, 0.06, d, mat("#b89a6a"), g); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(x + a * (w / 2 - 0.06), 0.4, z + b * (d / 2 - 0.06), 0.05, 0.8, 0.05, mat(PAL.wood), g)); },
    boxes(g, x, z) { const cm = mat("#b08a5a", { roughness: 1 }); box(x, 0.22, z, 0.5, 0.44, 0.45, cm, g); box(x + 0.05, 0.62, z - 0.02, 0.4, 0.36, 0.38, cm, g); box(x + 0.48, 0.18, z + 0.1, 0.36, 0.36, 0.36, cm, g); },
    vending(g, sp) { const v = new THREE.Group(); v.position.set(sp.x, 0, sp.z); v.rotation.y = sp.ry; g.add(v); v.translateZ(0.4);
      box(0, 0.95, 0, 0.9, 1.9, 0.7, mat("#6d7a6a", { roughness: 0.6 }), v); box(-0.08, 1.05, 0.355, 0.6, 1.3, 0.02, mat("#1d2622", { emissive: "#3f5f52", emissiveIntensity: 0.5 }), v);
      cplane(snaksTex, 0.6, 0.18, -0.08, 1.8, 0.37, 0, v); },
    shelf(g, sp, recs) { const s = new THREE.Group(); s.position.set(sp.x, 0, sp.z); s.rotation.y = sp.ry; g.add(s); s.translateZ(0.3); const sm = mat("#8a8470", { roughness: 0.8 }), bm = mat("#a88458", { roughness: 1 });
      box(-0.95, 1.1, 0, 0.06, 2.2, 0.5, sm, s); box(0.95, 1.1, 0, 0.06, 2.2, 0.5, sm, s);
      for (let i = 0; i < 4; i++) { box(0, 0.25 + i * 0.6, 0, 1.9, 0.04, 0.5, sm, s); for (let k = 0; k < 3; k++) if (Math.random() < 0.75) box(-0.6 + k * 0.6 + rnd(-0.1, 0.1), 0.41 + i * 0.6, rnd(-0.05, 0.05), rnd(0.25, 0.45), 0.28, 0.32, bm, s); }
      recs.push({ g: s, bx: s.position.x, bz: s.position.z, ax: Math.abs(Math.sin(sp.ry)) > 0.5 ? "z" : "x" }); },
    frame(g, sp) { const f = new THREE.Group(); f.position.set(sp.x, sp.y, sp.z); f.rotation.y = sp.ry; g.add(f); twk(f);
      box(0, 0, 0, 1.28, 1.48, 0.06, mat("#2c2a24", { roughness: 0.5 }), f); cplane(frameTex, 1.1, 1.3, 0, 0, 0.035, 0, f); cplane(frameLabel, 1.1, 0.2, 0, -0.98, 0.01, 0, f); },
    sign(g, sp, tex, w = 1.4, h = 0.5) { cplane(tex, w, h, sp.x, sp.y, sp.z, sp.ry, g); },
    poster(g, sp) { twk(cplane(posterTex, 0.62, 0.87, sp.x, sp.y, sp.z, sp.ry, g)); },
    water(g, r) { const m = once("mat:water", () => new THREE.MeshStandardMaterial({ color: "#8fd8d0", transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2, emissive: "#5fb8b0", emissiveIntensity: 0.15 }));
      const wv = new THREE.Mesh(planeGeo, m); wv.rotation.x = -Math.PI / 2; wv.scale.set(r.x1 - r.x0 - 1.4, r.z1 - r.z0 - 1.4, 1); wv.position.set((r.x0 + r.x1) / 2, 0.05, (r.z0 + r.z1) / 2); g.add(wv); return wv; },
  };
  function furnish(g, rm, ch) { // room-type props; all visual only (nothing blocks you, and nothing is ever placed in a hallway)
    const doorWall = rm.door.line === "x" ? (rm.door.at <= rm.x0 + 0.01 ? "w" : "e") : (rm.door.at <= rm.z0 + 0.01 ? "s" : "n");
    const walls = ["n", "s", "e", "w"].filter((w) => w !== doorWall), cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2, far = walls[0];
    const corner = (fx, fz, inset = 0.6) => [fx > 0 ? rm.x1 - inset : rm.x0 + inset, fz > 0 ? rm.z1 - inset : rm.z0 + inset];
    const t = rm.type;
    if (t === "frames") walls.forEach((w) => P.frame(g, wallSpot(rm, w, wallMid(rm, w), 1.6)));
    else if (t === "exitsign") { P.sign(g, wallSpot(rm, far, wallMid(rm, far), 2.3), exitTex, 1.1, 0.4); P.poster(g, wallSpot(rm, walls[1], wallMid(rm, walls[1]), 1.6)); }
    else if (t === "chairs") { const nx = Math.max(1, Math.floor((rm.x1 - rm.x0 - 1.2) / 0.8)), rows = Math.max(1, Math.floor((rm.z1 - rm.z0 - 1.6) / 1.4));
      for (let r = 0; r < Math.min(3, rows); r++) for (let k = 0; k < nx; k++) P.chair(g, rm.x0 + 0.9 + k * 0.8, rm.z0 + 1.0 + r * 1.4, 0, rm.S?.id === "waiting" ? "#6f7f9a" : PAL.forest);
      if (doorWall !== "n") P.sign(g, wallSpot(rm, "n", cx, 2.2), servingTex, 1.1, 0.4); }
    else if (t === "plants") QUADS.forEach(([a, b]) => { const [x, z] = corner(a, b, 0.7); P.plant(g, x, z, rnd(0.8, 1.4)); });
    else if (t === "table") { P.table(g, cx, cz, true); P.chair(g, cx - 0.4, cz - 0.8, 0); P.chair(g, cx + 0.4, cz + 0.8, Math.PI); P.chair(g, cx + 1.1, cz, -Math.PI / 2, "#8a3a2e"); }
    else if (t === "shelves") walls.slice(0, 2).forEach((w) => P.shelf(g, wallSpot(rm, w, wallMid(rm, w), 0), ch.receders));
    else if (t === "boxes") { const [x, z] = corner(1, 1, 0.9), [x2, z2] = corner(-1, 1, 0.9), [x3, z3] = corner(1, -1, 0.9); P.boxes(g, x, z); P.boxes(g, x2, z2); if (Math.random() < 0.6) P.boxes(g, x3, z3); }
    else if (t === "vending") { P.vending(g, wallSpot(rm, far, wallMid(rm, far) + 0.6, 0)); P.chair(g, cx, cz, rnd(0, 6)); }
    else if (t === "pool") { P.water(g, rm); P.plant(g, ...corner(1, 1, 0.5), 0.7); }
    else if (t === "desk") { P.table(g, cx, cz, false); P.chair(g, cx, cz + 0.7, Math.PI); box(cx + 0.35, 1.05, cz - 0.15, 0.12, 0.35, 0.12, mat("#ffd45a", { emissive: "#ffcc55", emissiveIntensity: 1.6 }), g); }
    else if (t === "dark") { if (Math.random() < 0.5) P.chair(g, cx, cz, rnd(0, 6), "#6c5a48"); }
    else if (t === "nook") P.plant(g, ...corner(-rm.sx, -rm.sz, 0.7), 0.9);
    else if (t === "empty" && Math.random() < 0.4) P.poster(g, wallSpot(rm, far, wallMid(rm, far), 1.6));
  }

  // ---------- stitch kit (office entrances and annex exits) ----------
  const puckerTex = (subtle) => once("tex:pucker:" + subtle, () => canvasTex(128, 384, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(90,70,40,0)"); gr.addColorStop(0.42, subtle ? "rgba(90,70,40,.18)" : "rgba(70,50,25,.42)"); gr.addColorStop(0.5, subtle ? "rgba(60,40,20,.3)" : "rgba(40,25,10,.7)"); gr.addColorStop(0.58, subtle ? "rgba(90,70,40,.18)" : "rgba(70,50,25,.42)"); gr.addColorStop(1, "rgba(90,70,40,0)");
    c.fillStyle = gr; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 7); c.fill(); }));
  function makeStitch(parent, { size = 1, subtle = false, sealed = false } = {}) {
    const g = new THREE.Group(); parent.add(g); const hgt = 1.1 * size, wid = 0.36 * size;
    cplane(puckerTex(subtle), wid * 1.6, hgt * 1.1, 0, 0, 0.002, 0, g, { transparent: true, depthWrite: false });
    const gap = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: sealed ? "#5a4630" : "#120c05" })); gap.scale.set(0.035 * size, hgt * 0.92, 1); gap.position.z = 0.004; g.add(gap);
    const tm = new THREE.MeshStandardMaterial({ color: subtle ? "#cdbf9f" : "#b8483a", roughness: 0.9, emissive: subtle ? "#fff3c8" : "#5a120a", emissiveIntensity: subtle ? 0.0 : 0.15 });
    const threads = []; const n = sealed ? 11 : subtle ? 4 : 7; const bg = once("geo:box", () => new THREE.BoxGeometry(1, 1, 1));
    for (let i = 0; i < n; i++) { const yy = -hgt * 0.42 + (i + 0.5) * (hgt * 0.84) / n;
      [1, -1].forEach((sgn) => { const t = new THREE.Mesh(bg, tm); t.scale.set(wid * 0.62, 0.016 * Math.max(size, 0.6), 0.012); t.position.set(0, yy, 0.012); t.rotation.z = sgn * 0.55; g.add(t); threads.push({ t, sgn, yy }); }); }
    const loose = new THREE.Mesh(bg, tm); loose.scale.set(0.012, 0.22 * size, 0.01); loose.position.set(0.02 * size, -hgt * 0.55, 0.014); loose.rotation.z = 0.35; g.add(loose);
    const hit = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.scale.set(Math.max(0.35, wid * 2), Math.max(0.45, hgt * 1.2), 1); hit.position.z = 0.02; g.add(hit);
    const s = { g, gap, threads, loose, tm, hit, size, subtle, sealed, k: 0, t: rnd(0, 6), disp: [gap.material, tm, hit.material] };
    s.yawn = (k) => { s.k = k; };
    s.anim = (ts) => { const k = s.k; const breathe = s.sealed ? 0 : Math.sin(ts * 1.7 + s.t) * 0.25;
      gap.scale.x = 0.035 * size * (1 + breathe + k * 16); threads.forEach(({ t, sgn }) => { t.position.x = sgn * k * wid * 0.9; t.rotation.z = sgn * (0.55 + k * 0.9) + Math.sin(ts * 3 + s.t) * 0.02; });
      loose.rotation.z = 0.35 + Math.sin(ts * 1.3 + s.t) * 0.15;
      if (subtle) tm.emissiveIntensity = Math.max(0, Math.sin(ts * 1.05 + s.t) - 0.93) * 6; };
    return s;
  }
  const stitches = []; // office-side stitches (always animated)

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
      const kitObj = e.type === "odd-door" ? makeOddDoor(holder) : makeStitch(holder, { size: e.size || 1, subtle: e.type === "stitch-secret" });
      holder.updateWorldMatrix(true, true); const wp = new THREE.Vector3(); (kitObj.hit || holder).getWorldPosition(wp);
      const nrm = new THREE.Vector3(); holder.getWorldDirection(nrm); const stand = holder.localToWorld(new THREE.Vector3(-0.6, 0, 1.0));
      const ent = { e, holder, kit: kitObj, wp, nrm, stand, key: "ent:" + e.id };
      kitObj.hit.userData.run = () => useEntrance(ent); kitObj.hit.userData.maxD = e.type === "stitch-secret" ? 3 : 4.5;
      officeEntrances.push(ent); if (kitObj.anim) stitches.push(kitObj);
    });
  }
  function makeOddDoor(holder) { // stub kit for later: a slightly-too-small door, a little crooked
    const g = new THREE.Group(); g.rotation.z = 0.025; holder.add(g);
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
  function useEntrance(ent) { if (host.state().busy) return; audio.prime(); if (String(ent.e.unlock).startsWith("riddle:")) return openRiddle(ent); enterVia(ent); }
  function enterVia(ent) {
    const sp = resolveSpawn(ent.e.destination); if (!sp) return; audio.prime(); audio.sfx("zip");
    host.threadWarp({ target: ent.wp, onK: (k) => ent.kit.yawn?.(k), swap: () => { ent.kit.yawn?.(0); arrive(sp, ent.e.destination, ent.e); } });
  }

  // ---------- spawns ----------
  const plazaSpawn = (S) => ({ x: S.center[0] * C + C2, z: S.center[1] * C + C2 + 1.6, yaw: 0 }); // next to the crystal, facing it
  const arrivalSpawn = () => ({ x: startSec.center[0] * C + C2 + 2.4, z: startSec.center[1] * C + C - PM - 1.4, yaw: 0 }); // the Loose Stitch is right behind you
  function resolveSpawn(id) {
    if (id === "print-arrival" || id === "arrival") return arrivalSpawn();
    if (String(id).startsWith("section:")) { const S = secById[id.slice(8)]; return S && plazaSpawn(S); }
    return data.spawns?.[id] || null;
  }
  const hubSpawn = (i, j, yaw) => ({ x: i * C + C2, z: j * C + C2, yaw });
  const yawFor = (d) => ({ zn: 0, zp: Math.PI, xp: -Math.PI / 2, xn: Math.PI / 2 })[d];

  // ---------- the Overlook (secret; hand-built, hangs above The Wrong Print) ----------
  const overlookSpots = [];
  const OV = { x0: 12, x1: 22, z0: -19, z1: -11, y: 7, open: ["w", "s"], ...(data.overlook?.room || {}) };
  (function buildOverlook(r) {
    const p = { wall: "#3f4b3a", floor: "#8a6f4e", trim: "#2c3328" }, y = r.y, w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const wallM = mat(p.wall, { roughness: 0.95 }), trimM = mat(p.trim, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const og = new THREE.Group(); og.position.y = y; root.add(og);
    box(cx, -0.1, cz, w, 0.2, d, mat(p.floor, { roughness: 0.7 }), og);
    for (let i = 0; i < 9; i++) box(r.x0 + (i + 0.5) * w / 9, 0.003, cz, 0.02, 0.006, d - 0.1, mat("#6f5a3e"), og);
    const railM = mat("#c9a57a", { roughness: 0.7 }), postM = mat("#6f5a3e", { roughness: 0.8 });
    const side = (s, line, inward, a, b, axis) => { if (!r.open.includes(s)) return wallRun(og, axis, line, inward, a, b, [], 3.2, wallM, trimM);
      const c = line + inward * 0.05; const at = (u, yy, len, th, hh, m) => axis === "x" ? box(u, yy, c, len, hh, th, m, og) : box(c, yy, u, th, hh, len, m, og);
      at((a + b) / 2, 1.02, b - a, 0.09, 0.06, railM); at((a + b) / 2, 0.55, b - a, 0.04, 0.04, railM);
      for (let u = a; u <= b + 0.01; u += 1.25) at(Math.min(u, b), 0.5, 0.07, 0.07, 1.0, postM); };
    side("s", r.z0, +1, r.x0, r.x1, "x"); side("n", r.z1, -1, r.x0, r.x1, "x"); side("w", r.x0, +1, r.z0 + T, r.z1 - T, "z"); side("e", r.x1, -1, r.z0 + T, r.z1 - T, "z");
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat("#ffe28a", { emissive: "#ffd45a", emissiveIntensity: 1.4 })); b.position.set(r.x0 + 1 + i * (w - 2) / 4, 2.7 - Math.sin(i / 4 * Math.PI) * 0.25, r.z1 - 0.6); og.add(b); }
    [[r.x0 + 0.1, r.z0 + 0.1], [r.x1 - 0.1, r.z0 + 0.1]].forEach(([x, z]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, y, 6), mat("#d8c9a4")); t.position.set(x, -y / 2, z); og.add(t); });
    walkable.push({ x0: AX + r.x0 + R, x1: AX + r.x1 - R, z0: AZ + r.z0 + R, z1: AZ + r.z1 - R, room: "annex:overlook", y });
    const tx = cx + 1, tz = cz; // survey table
    box(tx, 0.8, tz, 2.0, 0.06, 1.1, mat(PAL.oak, { roughness: 0.6 }), og);
    [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]].forEach(([dx, dz]) => box(tx + dx, 0.4, tz + dz, 0.06, 0.8, 0.06, mat(PAL.wood), og));
    const surveyTex = canvasTex(1024, 560, (c, cw, ch) => { c.fillStyle = "#f3ead2"; c.fillRect(0, 0, cw, ch); c.strokeStyle = "#6b5a3a"; c.lineWidth = 5; c.strokeRect(10, 10, cw - 20, ch - 20);
      c.fillStyle = PAL.moss; c.font = "bold 52px Georgia, serif"; c.fillText("Elsewhere Annex — survey", 40, 80); c.font = "26px 'Comic Sans MS','Marker Felt',system-ui"; c.fillStyle = PAL.ink;
      (data.overlook?.survey || []).forEach((s, i) => c.fillText(s, 40, 136 + i * 40));
      const mx = (i) => 760 + i * 17, mz = (j) => 300 - j * 17;
      c.strokeStyle = "rgba(160,40,40,.35)"; c.setLineDash([6, 6]); c.lineWidth = 3; sections.forEach((S) => { c.beginPath(); c.arc(mx(S.center[0]), mz(S.center[1]), 46, 0, 7); c.stroke(); }); c.setLineDash([]);
      sections.forEach((S) => { c.fillStyle = S.crystal?.color || "#999"; c.beginPath(); c.arc(mx(S.center[0]), mz(S.center[1]), 9, 0, 7); c.fill(); c.fillStyle = PAL.ink; c.font = "bold 17px system-ui"; c.textAlign = "center"; c.fillText(S.name.replace(/^The /, ""), mx(S.center[0]), mz(S.center[1]) + 28); c.textAlign = "left"; });
      c.fillStyle = "#4f8a3c"; c.font = "bold 28px system-ui"; c.fillText("← the edges keep moving", 620, 530); });
    const sm = cplane(surveyTex, 1.7, 0.93, tx, 0.835, tz, 0, og); sm.rotation.x = -Math.PI / 2;
    const noteTex = canvasTex(512, 300, (c, cw) => { c.fillStyle = "#f8e58c"; c.fillRect(0, 0, cw, 300); c.fillStyle = PAL.ink; c.textAlign = "center"; c.font = "bold 50px 'Comic Sans MS','Marker Felt',system-ui";
      wrap(c, data.overlook?.note || "aha! this is where we found it.", cw / 2, 90, cw - 50, 58, 3); c.font = "italic 34px Georgia"; c.fillText(data.overlook?.noteBy || "— the Gremlins", cw / 2, 260); });
    cplane(noteTex, 1.2, 0.7, r.x1 - 0.08, 1.75, cz, -Math.PI / 2, og);
    const footT = canvasTex(128, 128, (c) => { c.fillStyle = "#4f8a3c"; c.beginPath(); c.ellipse(64, 80, 26, 34, 0, 0, 7); c.fill(); [[34, 34], [64, 22], [94, 34]].forEach(([x, z]) => { c.beginPath(); c.ellipse(x, z, 11, 15, 0, 0, 7); c.fill(); }); });
    const footM = new THREE.MeshStandardMaterial({ map: footT, transparent: true, alphaTest: 0.3, roughness: 1 });
    for (let i = 0; i < 10; i++) { const f = new THREE.Mesh(planeGeo, footM); f.rotation.set(-Math.PI / 2, 0, 0.9); f.scale.set(0.16, 0.18, 1); f.position.set(r.x0 + 2 + i * 0.7 + (i % 2) * 0.1, 0.006, r.z1 - 1 - i * 0.5 - (i % 2) * 0.12); og.add(f); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), mat(PAL.wood)); pole.position.set(r.x1 - 0.5, 1.2, r.z0 + 0.5); og.add(pole);
    const flagTex = canvasTex(256, 160, (c, cw) => { c.fillStyle = "#4f8a3c"; c.fillRect(0, 0, cw, 160); c.fillStyle = "#f3d98b"; c.font = "bold 44px system-ui"; c.textAlign = "center"; c.fillText("GREMLINS", cw / 2, 70); c.font = "60px serif"; c.fillText("👀", cw / 2, 140); });
    cplane(flagTex, 0.8, 0.5, r.x1 - 0.92, 2.1, r.z0 + 0.5, 0, og, { side: THREE.DoubleSide });
    const sg = new THREE.Group(); sg.position.set(r.x0 + 0.75, 0, cz + 1.7); og.add(sg);
    [0, 2.1, 4.2].forEach((a) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 5), mat(PAL.ink)); leg.position.set(Math.sin(a) * 0.22, 0.62, Math.cos(a) * 0.22); leg.rotation.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); sg.add(leg); });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 10), mat("#c9b27a", { metalness: 0.6, roughness: 0.35 })); tube.position.set(-0.1, 1.32, 0.1); tube.rotation.set(0.25, 0, Math.PI / 2 - 0.25); sg.add(tube);
    overlookSpots.push({ key: "spyglass", x: r.x0 + 0.75, z: cz + 1.7, y, label: () => (host.zoomed() ? "🔭 Put the spyglass down" : "🔭 Look through the spyglass"), run: () => { host.setZoom(!host.zoomed()); host.toast(host.zoomed() ? "From up here you can watch the rooms below rearrange. Drag to look around." : "Spyglass down."); } });
    overlookSpots.push({ key: "survey", x: tx, z: tz, y, label: () => "🗺 Read the Gremlins' survey", run: openSurvey });
    overlookSpots.push({ key: "note", x: r.x1 - 0.7, z: cz, y, label: () => "📝 Read the taped note", run: () => host.openPanel("A taped note", (pn) => { pn.appendChild(el("p", null, data.overlook?.note)); pn.appendChild(el("p", "o3-small", data.overlook?.noteBy)); }) });
  })(OV);

  // ---------- crystals (one per section plaza, plus the Overlook's secret master stone) ----------
  const stoneDefs = [...sections.filter((S) => S.crystal).map((S) => ({ ...S.crystal, sec: S, spawnFn: () => plazaSpawn(S) })),
    ...(data.waystones || []).map((w) => ({ ...w, master: !!data.overlook?.master && w.id === "ws-overlook", spawnFn: () => resolveSpawn(w.spawn) }))];
  const stoneById = Object.fromEntries(stoneDefs.map((s) => [s.id, s]));
  const attuned = (id) => !!prog.waystones[id];
  function makeStone(def, parent, x, y, z, pedestal) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    if (pedestal) { box(0, 0.4, 0, 0.5, 0.8, 0.5, mat("#8b8a7a", { roughness: 0.8 }), g); box(0, 0.82, 0, 0.62, 0.06, 0.62, mat("#a4a28f"), g); }
    const cm = once("sm:stone:" + def.id, () => new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.25, flatShading: true, roughness: 0.3, transparent: true, opacity: 0.92 }));
    const cr = new THREE.Mesh(once("geo:oct", () => new THREE.OctahedronGeometry(0.24, 0)), cm); cr.scale.y = 1.6; cr.position.y = pedestal ? 1.25 : 0.42; g.add(cr);
    const rmat = once("sm:ring:" + def.id, () => new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0 }));
    const ring = new THREE.Mesh(once("geo:ring", () => new THREE.TorusGeometry(0.34, 0.015, 6, 28)), rmat); ring.rotation.x = Math.PI / 2; ring.position.y = cr.position.y - 0.25; g.add(ring);
    const s = { w: def, g, cr, cm, ring, baseY: cr.position.y, t: rnd(0, 6), lx: 0, lz: 0, y }; refreshStone(s); return s; }
  function refreshStone(s) { const on = attuned(s.w.id); s.cm.emissiveIntensity = on ? 1.3 : 0.22; s.ring.material.opacity = on ? 0.8 : 0; }
  const ovStoneDef = stoneById["ws-overlook"];
  const ovStone = ovStoneDef ? Object.assign(makeStone(ovStoneDef, root, ovStoneDef.x, ovStoneDef.y || 0, ovStoneDef.z, true), { lx: ovStoneDef.x, lz: ovStoneDef.z }) : null;

  // ---------- chunk streaming ----------
  const chunks = new Map(); let blockers = [];
  const stats = { built: 0, roomsBuilt: 0, cellsSeen: new Set(), roomsSeen: new Set() };
  let lastP = { x: 0, z: 0 }, inAnnexNow = false;
  const cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];
  function refreshBlockers() { blockers = []; chunks.forEach((ch) => blockers.push(...ch.blockers)); }
  const blockedLocal = (x, z) => blockers.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);

  function buildCell(pl) {
    const g = new THREE.Group(), lx = pl.i * C, lz = pl.j * C; g.position.set(lx, 0, lz); root.add(g);
    const ch = { key: pl.key, i: pl.i, j: pl.j, pl, g, lx, lz, walk: [], blockers: [], grabbers: [], npcs: [], curios: [], stones: [], exits: [], receders: [], disp: [], stairs: [], tvs: [], switches: [], twitch: [] };
    const M = secMats(pl.S, !!pl.dead), mk = pl.S.id + (pl.dead ? ":dead" : ""), hs = pl.hs;
    const Wk = (x0, x1, z0, z1, room) => { const r = { x0: AX + lx + x0, x1: AX + lx + x1, z0: AZ + lz + z0, z1: AZ + lz + z1, room, y: 0, chunk: pl.key }; walkable.push(r); ch.walk.push(r); };
    const zH = `annex:c:${pl.key}:h`;
    // hub (a small junction, or the crystal plaza)
    floorCeil(g, C2 - hs, C2 + hs, C2 - hs, C2 + hs, M, mk);
    Wk(C2 - hs + R, C2 + hs - R, C2 - hs + R, C2 + hs - R, zH);
    const gapC = [{ c: C2, w: 2 * HW, open: true }];
    wallRun(g, "x", C2 - hs, +1, C2 - hs, C2 + hs, pl.arms.zn ? gapC : [], H, M.wall, M.trim);
    wallRun(g, "x", C2 + hs, -1, C2 - hs, C2 + hs, pl.arms.zp ? gapC : [], H, M.wall, M.trim);
    wallRun(g, "z", C2 - hs, +1, C2 - hs + T, C2 + hs - T, pl.arms.xn ? gapC : [], H, M.wall, M.trim);
    wallRun(g, "z", C2 + hs, -1, C2 - hs + T, C2 + hs - T, pl.arms.xp ? gapC : [], H, M.wall, M.trim);
    // corridor arms out to the cell edge (doors to this cell's rooms are cut into their side walls)
    const doorsOnLine = (line, at) => pl.rooms.filter((r) => r.door.line === line && Math.abs(r.door.at - at) < 0.01).map((r) => ({ c: r.door.c, w: r.door.w }));
    let li = 0;
    DIRS.forEach((d) => { if (!pl.arms[d]) return;
      const zArm = d[0] === "z", pos = d[1] === "p", a0 = pos ? C2 + hs : 0, a1 = pos ? C : C2 - hs;
      if (zArm) { floorCeil(g, C2 - HW, C2 + HW, a0, a1, M, mk); Wk(C2 - HW + R, C2 + HW - R, pos ? C2 : 0, pos ? C : C2, zH);
        wallRun(g, "z", C2 - HW, +1, a0, a1, doorsOnLine("x", C2 - HW).filter((q) => q.c > a0 && q.c < a1), H, M.wall, M.trim);
        wallRun(g, "z", C2 + HW, -1, a0, a1, doorsOnLine("x", C2 + HW).filter((q) => q.c > a0 && q.c < a1), H, M.wall, M.trim);
        for (let z = a0 + 2; z < a1 - 0.5; z += 4) lightPanel(g, C2, z, M, (li++ === 1) && !pl.dead).rotation.y = Math.PI / 2; }
      else { floorCeil(g, a0, a1, C2 - HW, C2 + HW, M, mk); Wk(pos ? C2 : 0, pos ? C : C2, C2 - HW + R, C2 + HW - R, zH);
        wallRun(g, "x", C2 - HW, +1, a0, a1, doorsOnLine("z", C2 - HW).filter((q) => q.c > a0 && q.c < a1), H, M.wall, M.trim);
        wallRun(g, "x", C2 + HW, -1, a0, a1, doorsOnLine("z", C2 + HW).filter((q) => q.c > a0 && q.c < a1), H, M.wall, M.trim);
        for (let x = a0 + 2; x < a1 - 0.5; x += 4) lightPanel(g, x, C2, M, (li++ === 1) && !pl.dead); }
    });
    if (!pl.center && !pl.dead) lightPanel(g, C2, C2, M, false);
    // shifting hallway walls (owned +x/+z edges). Never dropped on top of you.
    pl.blk.forEach((d) => {
      const rect = d === "zp" ? { x0: lx + C2 - HW, x1: lx + C2 + HW, z0: lz + C - 0.1 - R, z1: lz + C + 0.1 + R } : { x0: lx + C - 0.1 - R, x1: lx + C + 0.1 + R, z0: lz + C2 - HW, z1: lz + C2 + HW };
      if (inAnnexNow && lastP.x > rect.x0 - 2.5 && lastP.x < rect.x1 + 2.5 && lastP.z > rect.z0 - 2.5 && lastP.z < rect.z1 + 2.5) return;
      if (d === "zp") { box(C2, H / 2, C, 2 * HW, H - 0.01, 0.2, M.wall, g); P.poster(g, { x: C2, y: 1.6, z: C - 0.105, ry: Math.PI }); P.poster(g, { x: C2, y: 1.6, z: C + 0.105, ry: 0 }); }
      else { box(C, H / 2, C2, 0.2, H - 0.01, 2 * HW, M.wall, g); P.poster(g, { x: C - 0.105, y: 1.6, z: C2, ry: -Math.PI / 2 }); P.poster(g, { x: C + 0.105, y: 1.6, z: C2, ry: Math.PI / 2 }); }
      ch.blockers.push(rect); });
    // rooms off the hallways (this is where things live)
    pl.rooms.forEach((rm) => { rm.S = pl.S;
      const zR = `annex:c:${pl.key}:r${rm.qi}`, rt = data.roomTypes?.[rm.type] || {};
      floorCeil(g, rm.x0, rm.x1, rm.z0, rm.z1, M, mk);
      const dg = (line, at) => (rm.door.line === line && Math.abs(rm.door.at - at) < 0.01 ? [{ c: rm.door.c, w: rm.door.w }] : []);
      wallRun(g, "x", rm.z0, +1, rm.x0, rm.x1, dg("z", rm.z0), H, M.wall, null);
      wallRun(g, "x", rm.z1, -1, rm.x0, rm.x1, dg("z", rm.z1), H, M.wall, null);
      wallRun(g, "z", rm.x0, +1, rm.z0 + T, rm.z1 - T, dg("x", rm.x0), H, M.wall, null);
      wallRun(g, "z", rm.x1, -1, rm.z0 + T, rm.z1 - T, dg("x", rm.x1), H, M.wall, null);
      Wk(rm.x0 + R, rm.x1 - R, rm.z0 + R, rm.z1 - R, zR);
      const dd = rm.door; if (dd.line === "x") Wk(dd.at - 0.6, dd.at + 0.6, dd.c - dd.w / 2 + 0.15, dd.c + dd.w / 2 - 0.15, null); else Wk(dd.c - dd.w / 2 + 0.15, dd.c + dd.w / 2 - 0.15, dd.at - 0.6, dd.at + 0.6, null);
      if ((rt.lights ?? 1) && !pl.dead) { const w = rm.x1 - rm.x0, d = rm.z1 - rm.z0, nx = w > 4.6 ? 2 : 1, nz = d > 4.6 ? 2 : 1;
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) lightPanel(g, rm.x0 + (a + 0.5) * w / nx, rm.z0 + (b + 0.5) * d / nz, M, a + b === 1 && Math.random() < 0.5); }
      curTwitch = ch.twitch; furnish(g, rm, ch); curTwitch = null;
      if (rm.stair) ch.stairs.push(makeStairs(g, rm, ch, M));
      if (rm.tv) ch.tvs.push(makeTV(g, rm, ch));
      if (rm.sw) ch.switches.push(makeSwitch(g, rm, ch));
      if (rm.grab) ch.grabbers.push(makeGrabberRt(rm, zR, ch, g));
      if (rm.npc) ch.npcs.push(makeNpcRt(rm, zR, ch, g));
      if (rm.curio) { const cd = curioDefs.find((c) => c.id === rm.curio); if (cd) ch.curios.push(makeCurio(cd, g, rm.sx > 0 ? rm.x1 - 0.7 : rm.x0 + 0.7, rm.sz > 0 ? rm.z1 - 0.7 : rm.z0 + 0.7, ch)); }
      stats.roomsBuilt++; stats.roomsSeen.add(pl.key + ":" + pl.ep + ":" + rm.qi);
    });
    // the crystal plaza: section sign, crystal on its pedestal, maybe a return stitch
    if (pl.center) { const S = pl.S, pr = { x0: C2 - hs, x1: C2 + hs, z0: C2 - hs, z1: C2 + hs };
      for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) lightPanel(g, C2 + a, C2 + b, M, false);
      const sTex = once("tex:sign:" + S.id, () => plate(S.name, "crystal plaza", { w: 900, h: 300, bg: "#5b5a2e", fg: "#fbf3d0", accent: S.crystal?.color || "#e6d07a" }));
      P.sign(g, wallSpot(pr, "s", C2 + 3.4, 2.1), sTex, 2.2, 0.72); P.sign(g, wallSpot(pr, "w", C2 - 3.4, 2.1), sTex, 2.2, 0.72);
      const bench = (x, z, ry) => { const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b); box(0, 0.42, 0, 2.4, 0.08, 0.6, mat(PAL.oak, { roughness: 0.6 }), b); box(-1, 0.2, 0, 0.08, 0.4, 0.5, mat(PAL.moss), b); box(1, 0.2, 0, 0.08, 0.4, 0.5, mat(PAL.moss), b); };
      bench(C2 - 3.4, C2 - hs + 0.6, 0); bench(C2 + hs - 0.6, C2 + 3.4, Math.PI / 2);
      if (S.crystal) { const st = makeStone(stoneById[S.crystal.id], g, C2, 0, C2, true); st.lx = lx + C2; st.lz = lz + C2; ch.stones.push(st);
        ch.blockers.push({ x0: lx + C2 - 0.45, x1: lx + C2 + 0.45, z0: lz + C2 - 0.45, z1: lz + C2 + 0.45 }); }
      (data.exits || []).filter((x) => x.type === "return-stitch" && x.section === S.id).forEach((x) => {
        const sp = wallSpot(pr, x.wall || "n", C2 + (x.offset ?? 2.4), x.y ?? 1.5); const holder = new THREE.Group(); holder.position.set(sp.x, sp.y, sp.z); holder.rotation.y = sp.ry; g.add(holder);
        const kitS = makeStitch(holder, { size: 0.9, sealed: !!x.requires && !reqMet(x) }); ch.disp.push(...kitS.disp);
        holder.updateWorldMatrix(true, true); const wp = new THREE.Vector3(); holder.getWorldPosition(wp);
        const ex = { x, kit: kitS, wp, lx: lx + sp.x, lz: lz + sp.z, ly: 0 }; kitS.hit.userData.run = () => useExit(ex); kitS.hit.userData.maxD = 4.5; ch.exits.push(ex); refreshSeal(ex); });
    }
    // dead zone: gremlin signs on the corridor walls, lights out
    if (pl.dead) { const dz = pl.dead.z, tex = once("tex:dead:" + dz.id, () => plate(dz.sign || "NO SIGNAL", dz.signSub || "", { w: 900, h: 320, bg: "#3a2f4a", fg: "#f3d98b", accent: "#b48cff" }));
      P.sign(g, { x: C2 - HW + T + 0.012, y: 1.8, z: C2 + HW + 2.2, ry: Math.PI / 2 }, tex, 1.6, 0.56); P.sign(g, { x: C2 + HW - T - 0.012, y: 1.8, z: C2 - HW - 2.2, ry: -Math.PI / 2 }, tex, 1.6, 0.56);
      lightPanel(g, C2, C2, M, true); }
    stats.built++; stats.cellsSeen.add(pl.key);
    return ch;
  }
  function loadCell(i, j) { const k = ck(i, j); if (chunks.has(k)) return chunks.get(k); const S = sectionOf(i, j); const ch = buildCell(planCell(i, j, epochs[S.id] || 0)); chunks.set(k, ch); refreshBlockers(); return ch; }
  function unloadCell(k) { const ch = chunks.get(k); if (!ch) return; root.remove(ch.g);
    for (let n = walkable.length - 1; n >= 0; n--) if (walkable[n].chunk === k) walkable.splice(n, 1);
    ch.disp.forEach((m) => m.dispose?.()); chunks.delete(k); refreshBlockers(); }
  function unloadAll() { [...chunks.keys()].forEach(unloadCell); }
  function stream(p, sync) {
    const [ci, cj] = cellOf(p.x, p.z);
    for (const [k, ch] of chunks) if (Math.max(Math.abs(ch.i - ci), Math.abs(ch.j - cj)) > UNLOAD) unloadCell(k);
    loadCell(ci, cj); let built = 0;
    for (let r = 1; r <= LOAD; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r || chunks.has(ck(ci + di, cj + dj))) continue;
      if (!sync && built >= 1) return; loadCell(ci + di, cj + dj); built++; }
  }

  // ---------- exits ----------
  const descend = (data.exits || []).filter((x) => x.type === "descend").map((x) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, x.y + 1.2, 6), mat("#d8c9a4")); t.position.set(x.x, (x.y + 1.2) / 2, x.z); root.add(t);
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat("#b8483a")); knot.position.set(x.x, x.y + 1.15, x.z); root.add(knot);
    return { x, lx: x.x, lz: x.z, ly: x.y, wp: new THREE.Vector3(AX + x.x, x.y + 1.2, AZ + x.z) }; });
  function reqMet(x) { return !x.requires?.curiosities || prog.curiosities.length >= x.requires.curiosities; }
  function refreshSeal(ex) { if (!ex.kit) return; ex.kit.sealed = !!ex.x.requires && !reqMet(ex.x); ex.kit.gap.material.color.set(ex.kit.sealed ? "#5a4630" : "#120c05"); }
  const refreshSeals = () => chunks.forEach((ch) => ch.exits.forEach(refreshSeal));
  function useExit(ex) {
    if (host.state().busy) return;
    if (ex.x.type === "return-stitch") { if (!reqMet(ex.x)) { audio.sfx("nope"); host.toast(`It's sewn shut. Find ${goal} curiosities and it'll come undone.`); return; } exitHome(ex.wp, ex.kit); }
    if (ex.x.type === "descend") { audio.sfx("zip"); host.setZoom(false); host.threadWarp({ target: ex.wp, swap: () => place(resolveSpawn(ex.x.to), "You slide down the thread and land softly in The Wrong Print.") }); }
  }

  // ---------- where am I ----------
  const local = (pos) => ({ x: pos.x - AX, z: pos.z - AZ });
  const zoneCell = (zone) => { const m = /^annex:c:(-?\d+),(-?\d+):(h|r(\d))$/.exec(String(zone || "")); return m && { i: +m[1], j: +m[2], room: m[4] != null ? +m[4] : null }; };
  function here() { const p = local(host.state().pos), [i, j] = cellOf(p.x, p.z), S = sectionOf(i, j); return { i, j, S, dead: deadCells.get(ck(i, j)) || null, p }; }
  const curSection = () => here().S;

  // ---------- travel: crystals, misfires, the home crystal, grabs -> a new section ----------
  function useStone(s) {
    if (!attuned(s.w.id)) { prog.waystones[s.w.id] = new Date().toISOString(); save(); chunks.forEach((ch) => ch.stones.forEach(refreshStone)); if (ovStone) refreshStone(ovStone); audio.sfx("chime");
      host.toast(`💎 Attuned: ${s.w.name}. You can always travel back here.`); host.updateActions(); return; }
    openTravel(s.w.id);
  }
  let lastFizzle = 0;
  function fizzle() { audio.sfx("nope"); host.toast(pick(data.homeCrystal?.fizzle || ["🫧 Fizzle. Crystals don't work here."])); lastFizzle = Date.now(); }
  function openTravel(fromId) {
    if (!fromId && here().dead) return fizzle();
    const master = !!stoneById[fromId]?.master;
    host.openPanel("💎 Waystones", (pn) => {
      pn.appendChild(el("p", "o3-small", master ? "The Gremlins' master stone. From here you can hop to ANY crystal plaza, attuned or not." : "Travel to any crystal you've attuned to. Each one sits in the middle of its own section. A tug of thread, and you're there."));
      stoneDefs.forEach((d) => { if (d.secret && !attuned(d.id)) return; const on = attuned(d.id) || (master && !d.secret);
        const b = el("button", "o3-btn" + (on ? "" : " ghost"), (on ? "💎 " : "❔ ") + (on ? d.name : "??? (not attuned yet)") + (d.id === fromId ? " · you are here" : ""));
        b.disabled = !on || d.id === fromId; b.dataset.stone = d.id; b.onclick = () => { host.closePanel(); travelTo(d.id, master); }; pn.appendChild(el("div", null)).appendChild(b); });
    });
  }
  let forceMisfire = null, lastMisfire = null, lastGrab = null;
  function dropIn(S, toPlaza) { // a hub somewhere in section S (not a plaza, not a dead zone, not a dead end)
    if (!toPlaza) for (let t = 0; t < 80; t++) { const r = 2 + Math.floor(Math.random() * 3), a = Math.random() * Math.PI * 2, i = S.center[0] + Math.round(Math.cos(a) * r), j = S.center[1] + Math.round(Math.sin(a) * r);
      if (sectionOf(i, j) !== S || deadCells.has(ck(i, j)) || centerOf.has(ck(i, j))) continue;
      const open = DIRS.filter((d) => edgeOpen(i, j, d)); if (open.length < 2) continue; return { ...hubSpawn(i, j, yawFor(pick(open))), cell: [i, j] }; }
    return plazaSpawn(S);
  }
  function otherSection(not) { const vis = new Set(prog.flags.sections || []); const pool = sections.filter((s) => s !== not); const fresh = pool.filter((s) => !vis.has(s.id)); return pick(fresh.length ? fresh : pool); }
  function travelTo(id, viaMaster) { const d = stoneById[id]; if (!d || !(attuned(id) || (viaMaster && !d.secret))) return; audio.sfx("zip"); host.setZoom(false); lostT = 0;
    const chance = d.misfireChance ?? data.misfire?.chance ?? 0, fm = forceMisfire; forceMisfire = null;
    if (fm !== false && (fm || Math.random() < chance)) { const S = otherSection(d.sec || null); lastMisfire = S.id;
      return host.threadWarp({ swap: () => place(dropIn(S, false), "💥 " + pick(data.misfire?.messages || ["Misfire!"]) + ` (${S.name})`) }); }
    host.threadWarp({ swap: () => place(d.spawnFn(), `You arrive at ${d.name}.`) }); }
  function useHome() {
    if (host.state().busy) return; if (here().dead) return fizzle();
    audio.sfx("zip"); host.setZoom(false); prog.flags.homeUses = (prog.flags.homeUses || 0) + 1; save(); lostT = 0;
    host.threadWarp({ swap: () => place(arrivalSpawn(), data.homeCrystal?.used || "Back to the start.") });
  }
  function grab(gr) {
    gr.state = "cool"; gr.cool = 14; gr.told = false; audio.sfx("flump");
    const from = curSection(), to = otherSection(from), sp = dropIn(to, !!gr.d.toPlaza); lastGrab = { from: from.id, to: to.id, by: gr.type };
    host.threadWarp({ swap: () => place(sp, String(gr.d.caught || "Grabbed!").replace("{section}", to.name)) });
  }

  // ---------- curiosities ----------
  const curioTex = { memo: canvasTex(128, 160, (cx, w) => { cx.fillStyle = "#fffdf5"; cx.fillRect(0, 0, w, 160); cx.fillStyle = "#444"; for (let i = 0; i < 7; i++) cx.fillRect(14, 22 + i * 18, 100 - (i % 3) * 18, 5); cx.fillStyle = "#b03a2e"; cx.fillRect(14, 140, 50, 8); }),
    badge: canvasTex(160, 110, (cx, w) => { cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, 110); cx.fillStyle = "#b03a2e"; cx.fillRect(0, 0, w, 34); cx.fillStyle = "#fff"; cx.font = "bold 20px system-ui"; cx.fillText("HELLO", 44, 24); cx.fillStyle = "#333"; cx.font = "italic 26px Georgia"; cx.fillText(nameOff, 20, 82); }) };
  const starterM = new THREE.MeshStandardMaterial({ color: "#d7dde0", emissive: "#bfe8ff", emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 }), sparkM = new THREE.MeshBasicMaterial({ color: "#fffbe0" });
  function makeCurio(c, parent, x, z, ch) { const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); const ty = data.curiosityTypes[c.type];
    box(0, 0.17, 0, 0.34, 0.34, 0.3, mat("#b08a5a", { roughness: 1 }), g);
    let item;
    if (c.type === "memo" || c.type === "badge") { item = cplane(curioTex[c.type], c.type === "memo" ? 0.22 : 0.2, c.type === "memo" ? 0.28 : 0.14, 0, 0.345, 0, 0, g); item.rotation.x = -Math.PI / 2; item.rotation.z = c.type === "memo" ? 0.3 : -0.4; }
    else { item = new THREE.Mesh(once("geo:starter", () => new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8)), starterM); item.rotation.z = Math.PI / 2; item.position.set(0, 0.37, 0); g.add(item); }
    const spark = new THREE.Mesh(once("geo:spark", () => new THREE.OctahedronGeometry(0.05, 0)), sparkM); spark.position.y = 0.6; g.add(spark);
    g.visible = !prog.curiosities.includes(c.id);
    return { c, ty, g, item, spark, t: rnd(0, 6), lx: ch.lx + x, lz: ch.lz + z }; }
  function pickUp(cu) {
    if (prog.curiosities.includes(cu.c.id)) return; prog.curiosities.push(cu.c.id); save(); cu.g.visible = false; audio.sfx("pick"); refreshSeals();
    const n = prog.curiosities.length;
    host.openPanel(`${cu.ty.icon} You found ${cu.ty.name}`, (pn) => { pn.appendChild(el("p", null, fill(cu.ty.text))); pn.appendChild(el("p", "o3-small", `Pockets: ${n} curiosit${n === 1 ? "y" : "ies"}` + (n < goal ? ` · the Gremlins think ${goal} is a good start (optional)` : " ✓"))); });
    if (n === goal) setTimeout(() => host.toast(data.goal?.message || "Goal reached!"), 400);
    host.updateActions();
  }
  function openPockets() { host.openPanel("🎒 Pockets", (pn) => {
    const got = curioDefs.filter((q) => prog.curiosities.includes(q.id));
    pn.appendChild(el("p", "o3-small", `Optional goal: find ${goal} curiosities. You have ${got.length} of ${curioDefs.length} out there, scattered across the sections (usually in a little nook not far from a crystal).`));
    if (!got.length) pn.appendChild(el("p", null, "Nothing yet. Look in little rooms, on boxes, near things that hum."));
    got.forEach((q) => { const ty = data.curiosityTypes[q.type]; const r = el("div", "o3-note"); r.appendChild(el("b", null, `${ty.icon} ${ty.name[0].toUpperCase() + ty.name.slice(1)}: `)); r.appendChild(document.createTextNode(fill(ty.text))); pn.appendChild(r); });
    pn.appendChild(el("p", "o3-small", `${data.homeCrystal?.icon || "🏠"} Also in your pocket: a home crystal. It always takes you back to the start (except in a few spots where crystals don't work).`));
  }); }
  function openSurvey() { host.openPanel("🗺 The Gremlins' survey", (pn) => {
    pn.appendChild(el("p", null, data.tagline)); const ul = el("ul", "o3-howto");
    sections.forEach((S) => ul.appendChild(el("li", null, `${attuned(S.crystal?.id) ? "💎" : "❔"} ${S.name}: ${S.blurb || ""}`))); pn.appendChild(ul);
    pn.appendChild(el("p", "o3-small", `Your crystals: ${stoneDefs.filter((s) => attuned(s.id)).length} of ${stoneDefs.length} · curiosities: ${prog.curiosities.length} of ${curioDefs.length} · rooms wandered past: ${stats.roomsSeen.size}`));
  }, { wide: true }); }

  // ---------- almost-people (rare, deeper in, always inside rooms) ----------
  const faceTex = canvasTex(128, 128, (c) => { c.fillStyle = "#e6d9bf"; c.fillRect(0, 0, 128, 128); c.fillStyle = "rgba(40,30,20,.55)";
    c.beginPath(); c.ellipse(40, 52, 9, 6, 0.2, 0, 7); c.fill(); c.beginPath(); c.ellipse(86, 58, 9, 6, -0.1, 0, 7); c.fill();
    c.strokeStyle = "rgba(40,30,20,.5)"; c.lineWidth = 4; c.beginPath(); c.arc(64, 78, 20, 0.2, Math.PI - 0.2); c.stroke(); c.globalAlpha = 0.35; c.beginPath(); c.arc(70, 84, 20, 0.2, Math.PI - 0.2); c.stroke(); });
  const badgeTex = canvasTex(96, 64, (c, w, h) => { c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.fillStyle = "#b03a2e"; c.fillRect(0, 0, w, 18); c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(12, 34, 70, 6); c.fillRect(12, 46, 50, 6); });
  function makeFigure(def, parent) {
    const g = new THREE.Group(); parent.add(g); const body = new THREE.Group(); g.add(body);
    const pale = def.type === "unfiled"; const bm = mat(def.color, pale ? { transparent: true, opacity: 0.82 } : {}); const dark = mat("#3d3a33");
    box(-0.12, 0.42, 0, 0.16, 0.84, 0.18, dark, body); box(0.12, 0.42, 0, 0.16, 0.84, 0.18, dark, body);
    box(0, 1.15, 0, 0.56, 0.66, 0.3, bm, body); box(-0.34, 1.12, 0, 0.12, 0.6, 0.14, bm, body);
    const rArm = box(0.34, 1.12, 0, 0.12, 0.6, 0.14, bm, body);
    const head = new THREE.Group(); head.position.y = 1.68; body.add(head);
    box(0, 0, 0, 0.34, 0.38, 0.32, mat("#e6d9bf", pale ? { transparent: true, opacity: 0.85 } : {}), head); cplane(faceTex, 0.32, 0.34, 0, 0, 0.162, 0, head);
    cplane(badgeTex, 0.12, 0.08, -0.14, 1.28, 0.152, 0, body); cplane(badgeTex, 0.12, 0.08, -0.1, 1.17, 0.152, 0.08, body);
    if (def.type === "reprint") { head.rotation.z = 0.12; box(0.05, 0.02, -0.03, 0.34, 0.38, 0.32, once("mat:ghost", () => new THREE.MeshBasicMaterial({ color: "#e6d9bf", transparent: true, opacity: 0.25, depthWrite: false })), head); }
    if (def.type === "onhold") { rArm.position.set(0.3, 1.5, 0.02); rArm.rotation.z = 2.6; box(0.2, 0.02, 0.05, 0.06, 0.2, 0.08, mat("#222"), head); }
    if (def.type === "unfiled") for (let i = 0; i < 3; i++) { const sh = cplane(null, 0.2, 0.28, rnd(-0.4, 0.4), rnd(0.9, 1.6), rnd(0.2, 0.3), rnd(-0.6, 0.6), body, { color: "#fffdf5", side: THREE.DoubleSide }); sh.rotation.z = rnd(-0.5, 0.5); }
    if (def.type === "echohire") { box(0.3, 1.0, 0.18, 0.24, 0.32, 0.02, mat("#c9a57a"), body); box(0, 1.38, 0.155, 0.02, 0.24, 0.005, mat("#2f6fb5"), body); }
    if (def.type === "late") { const clk = new THREE.Mesh(once("geo:clock", () => new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14)), mat("#f4efd9")); clk.rotation.x = Math.PI / 2; clk.position.set(0, 1.22, 0.16); body.add(clk); box(0.03, 1.25, 0.18, 0.015, 0.08, 0.005, mat("#222"), body); }
    if (def.quirk === "tall") body.scale.set(0.92, 1.2, 0.92);
    return { g, body, head };
  }
  function makeNpcRt(rm, zone, ch, parent) {
    const d = npcDefs[rm.npc] || Object.values(npcDefs)[0]; const f = makeFigure(d, parent);
    const rect = { x0: rm.x0 + 0.6, x1: rm.x1 - 0.6, z0: rm.z0 + 0.6, z1: rm.z1 - 0.6 };
    f.g.position.set((rect.x0 + rect.x1) / 2, 0, (rect.z0 + rect.z1) / 2);
    return { d, ...f, rect, zone, ch, tgt: new THREE.Vector2(f.g.position.x, f.g.position.z), wait: rnd(0, 2), talking: false, look: 0, ph: rnd(0, 6), st: 0, lastQ: null,
      corner: [rm.sx > 0 ? rect.x1 : rect.x0, rm.sz > 0 ? rect.z1 : rect.z0] };
  }
  function openTalk(n) {
    n.talking = true; const possd = !!n.poss; const lines = possd ? (data.npcPrompts || []).map(() => data.minions?.lines || ["We are curious."]) : data.npcLines[n.d.type] || [];
    host.openPanel(`💬 ${n.d.name[0].toUpperCase() + n.d.name.slice(1)}`, (pn) => {
      if (possd) pn.appendChild(el("p", "o3-small", fill(data.minions?.talkIntro || "Its eyes are glowing. Something small and fluttery is doing the talking.")));
      else pn.appendChild(el("p", "o3-small", n.d.quirk === "late" ? "It looks almost like someone, a few seconds behind. Say something:" : "It looks almost like someone. Say something:"));
      const log = el("div", "o3-chatlog"); const row = el("div", "o3-prompts");
      (data.npcPrompts || []).forEach((q, qi) => { const b = el("button", "o3-btn ghost small", q); b.onclick = () => {
        const useQ = n.d.quirk === "late" && !possd ? n.lastQ : qi; n.lastQ = qi; // the Late Arrival answers the question you asked before
        const reply = fill(useQ == null ? (lines[0]?.[0] || "…") : pick(lines[useQ] || ["…"]));
        const a = el("div", "o3-note"); a.appendChild(el("b", null, "You: ")); a.appendChild(document.createTextNode(q)); const r = el("div", "o3-note o3-reply"); r.appendChild(el("b", null, n.d.name.replace(/^(a|an|the) /, "") + ": ")); r.appendChild(document.createTextNode(reply));
        log.append(a, r); log.scrollTop = 1e6; audio.sfx("blip"); }; row.appendChild(b); });
      pn.append(row, log);
    }, { onClose: () => { n.talking = false; n.wait = rnd(1, 3); } });
  }

  // ---------- gentle grabbers (rooms only; they relocate you to a whole new section) ----------
  function makeGrabber(type, parent) {
    const g = new THREE.Group(); parent.add(g); const parts = [];
    if (type === "hem") { const tm = mat("#d9cfb3", { roughness: 1 });
      for (let i = 0; i < 6; i++) { const geo = once("geo:hem" + i, () => { const pts = []; for (let k = 0; k < 6; k++) pts.push(new THREE.Vector3(rnd(-0.4, 0.4), 0.1 + k * 0.34 + rnd(-0.1, 0.1), rnd(-0.4, 0.4))); return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 5); });
        const m = new THREE.Mesh(geo, tm); g.add(m); parts.push(m); }
      const ank = new THREE.Mesh(once("geo:ank", () => new THREE.TorusGeometry(0.3, 0.03, 5, 18)), tm); ank.rotation.x = Math.PI / 2; ank.position.y = 0.08; g.add(ank); parts.push(ank); }
    else if (type === "courtesy") { const wm = mat("#4a3b2e");
      const pole = new THREE.Mesh(once("geo:cpole", () => new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8)), wm); pole.position.y = 1.3; g.add(pole);
      box(0, 0.03, 0, 0.7, 0.05, 0.08, wm, g); box(0, 0.03, 0, 0.08, 0.05, 0.7, wm, g);
      const top = new THREE.Group(); top.position.y = 2.45; g.add(top);
      [0, 1.57, 3.14, 4.71].forEach((a) => { const h = box(Math.sin(a) * 0.14, 0, Math.cos(a) * 0.14, 0.03, 0.03, 0.22, wm, top); h.rotation.y = a; });
      box(0, 0.22, 0, 0.36, 0.14, 0.36, mat("#2b2b30"), top); box(0, 0.16, 0, 0.5, 0.02, 0.5, mat("#2b2b30"), top);
      box(0, -0.75, 0.1, 0.62, 1.2, 0.22, mat("#6c5a48"), top); parts.push(top); }
    else { const lm = mat("#9b7fb8", { flatShading: true }); const lump = new THREE.Mesh(once("geo:lump", () => new THREE.IcosahedronGeometry(0.7, 1)), lm); lump.position.y = 0.62; g.add(lump); parts.push(lump);
      [["#e8573f", 0.5, 0.95, 0.3], ["#5f9fd6", -0.45, 0.7, 0.4], ["#f3d98b", 0.1, 1.2, -0.35], ["#7fbf6a", -0.2, 0.4, -0.5]].forEach(([c, x, y, z]) => { const b = new THREE.Mesh(once("geo:blob", () => new THREE.IcosahedronGeometry(0.2, 0)), mat(c, { flatShading: true })); b.position.set(x, y - 0.62, z); lump.add(b); });
      box(0.15, 0.25, 0.62, 0.3, 0.06, 0.04, mat("#3a2a3a"), lump); }
    return { g, parts };
  }
  function makeGrabberRt(rm, zone, ch, parent) {
    const d = data.grabberTypes?.[rm.grab] || {}; const k = makeGrabber(rm.grab, parent);
    const rect = { x0: rm.x0 + 0.5, x1: rm.x1 - 0.5, z0: rm.z0 + 0.5, z1: rm.z1 - 0.5 };
    const home = [rm.sx > 0 ? rect.x1 - 0.3 : rect.x0 + 0.3, rm.sz > 0 ? rect.z1 - 0.3 : rect.z0 + 0.3]; // the far corner, away from the hallway
    k.g.position.set(home[0], 0, home[1]);
    return { d, type: rm.grab, ...k, rect, home, zone, ch, state: "home", told: false, cool: 0 };
  }

  // ---------- arriving, moving around, leaving ----------
  let timeIn = 0, lostT = 0, hinted = false, visitFrom = null;
  function place(sp, toast) { if (!sp) return; lastP = { x: sp.x, z: sp.z }; stream(lastP, true);
    host.placeAnnex({ x: AX + sp.x, z: AZ + sp.z, y: sp.y || 0, yaw: sp.yaw || 0, pitch: sp.pitch ?? 0 }); if (toast) host.toast(toast); }
  function arrive(sp, spawnId, e) {
    visitFrom = e?.id || null; timeIn = 0; lostT = 0; hinted = false; inAnnexNow = true; cleanupGlimpse(); endAlive(true); crHide(); flipT = 0; audio.setMood("annex");
    if (data.shuffleOnEnter) { unloadAll(); sections.forEach((S) => (epochs[S.id] = Math.floor(Math.random() * 100000))); } // never quite the same twice (hallways stay put; rooms re-roll)
    host.enterAnnexMode(); place(sp); audio.start(); muteBtn.hidden = false; renderMute();
    const firstCrystal = !prog.flags.homeCrystal; if (firstCrystal) { prog.flags.homeCrystal = new Date().toISOString(); save(); }
    if (spawnId === "overlook-arrival") { prog.flags.foundOverlook = true; save(); banner("aha! this is where we found it.", "The Gremlins' Overlook · a secret way into the Elsewhere Annex"); }
    else banner(data.name, data.tagline);
    if (firstCrystal) setTimeout(() => host.toast(data.homeCrystal?.given || "You have a home crystal."), 2600);
  }
  function exitHome(target, kit, quick) {
    audio.sfx("zip"); host.setZoom(false);
    host.threadWarp({ target: target || null, onK: (k) => kit?.yawn?.(k), swap: () => { kit?.yawn?.(0); cleanupGlimpse(); endAlive(true); crHide(); flipT = 0; audio.setMood("annex"); audio.stop(); muteBtn.hidden = true; inAnnexNow = false; host.leaveAnnexMode(); unloadAll(); if (!quick) host.toast("You're back in the office. The stitch is still there, if you want it."); } });
  }

  // ---------- HUD bits ----------
  const muteBtn = el("button", "o3-btn ghost o3-q o3-mute"); muteBtn.hidden = true; muteBtn.setAttribute("aria-label", "Mute Annex sound");
  const renderMute = () => { muteBtn.textContent = audio.muted ? "🔇" : "🔊"; muteBtn.title = audio.muted ? "Sound off (click to unmute)" : "Sound on (click to mute)"; muteBtn.setAttribute("aria-pressed", String(audio.muted)); };
  muteBtn.onclick = () => { audio.setMuted(!audio.muted); renderMute(); host.toast(audio.muted ? "Annex sound muted." : "Annex sound on."); }; renderMute();
  const bannerEl = el("div", "o3-annexbanner"); const bT = el("b"), bS = el("span"); bannerEl.append(bT, bS); host.hud.appendChild(bannerEl);
  function banner(t, s) { bT.textContent = t; bS.textContent = s; bannerEl.classList.add("show"); clearTimeout(bannerEl._h); bannerEl._h = setTimeout(() => bannerEl.classList.remove("show"), 5200); }
  function hudButtons() {
    if (G.active) return [];
    const out = [Object.assign(el("button", "o3-btn ghost o3-home", `${data.homeCrystal?.icon || "🏠"} ${data.homeCrystal?.name || "Home crystal"}`), { onclick: useHome, title: "Back to the start (where the Loose Stitch lets out)" })];
    const nStones = stoneDefs.filter((s) => attuned(s.id)).length;
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
    if (mode !== "annex" || G.active) return null;
    const p = local(pos), lv = (y) => Math.abs((y || 0) - feet) < 2.5;
    if (cr.st === "frozen" && feet < 1 && Math.hypot(cr.x - p.x, cr.z - p.z) < (CRD?.tagRadius ?? 2)) return { key: "cr:tag", label: `✋ Tag ${CRD.name}!`, run: () => { if (cr.st === "frozen") crTagged(); } };
    const stoneCand = (s) => { if (!lv(s.y)) return; cand("ws:" + s.w.id, Math.hypot(s.lx - p.x, s.lz - p.z), 2.0, attuned(s.w.id) ? "💎 Crystal: travel" : "💎 Attune to this crystal", () => useStone(s)); };
    if (ovStone) stoneCand(ovStone);
    chunks.forEach((ch) => {
      ch.stones.forEach(stoneCand);
      if (feet > 1) return;
      ch.curios.forEach((c) => { if (c.g.visible) cand("cu:" + c.c.id, Math.hypot(c.lx - p.x, c.lz - p.z), 1.6, `✋ Pick up ${c.ty.name}`, () => pickUp(c)); });
      ch.exits.forEach((ex) => { const locked = ex.x.requires && !reqMet(ex.x); cand("ex:" + ex.x.id + (locked ? ":l" : ""), Math.hypot(ex.lx - p.x, ex.lz - p.z), 2.2, locked ? ex.x.lockedPrompt : ex.x.prompt, () => useExit(ex)); });
      ch.stairs.forEach((st) => cand("st:" + st.cell + ":" + st.rm.qi, Math.hypot(st.lx - p.x, st.lz - p.z), 1.7, st.up ? "🪜 Climb the stairs" : "🪜 Go down the stairs", () => useStair(st)));
      ch.switches.forEach((sw) => cand("sw:" + ch.key + ":" + sw.rm.qi, Math.hypot(sw.lx - p.x, sw.lz - p.z), 1.8, alive.on ? "💡 The switch won't budge (the lights are already changed)" : "💡 " + (data.aliveMode?.switchLabel || "A light switch that wasn't here before"), () => { if (!alive.on) openSwitch(); }));
      ch.npcs.forEach((n) => cand("npc:" + n.zone, Math.hypot(ch.lx + n.g.position.x - p.x, ch.lz + n.g.position.z - p.z), 2.4, `💬 Say something to ${n.d.name}`, () => openTalk(n)));
    });
    descend.forEach((ex) => { if (lv(ex.ly)) cand("ex:" + ex.x.id, Math.hypot(ex.lx - p.x, ex.lz - p.z), 2.2, ex.x.prompt, () => useExit(ex)); });
    overlookSpots.forEach((o) => { if (!lv(o.y)) return; const lab = o.label(); cand("ov:" + o.key + lab, Math.hypot(o.x - p.x, o.z - p.z), 1.9, lab, o.run); });
    return best;
  }
  const clickTargets = (mode) => { if (mode === "office") return officeEntrances.map((e) => e.kit.hit); const out = []; chunks.forEach((ch) => ch.exits.forEach((x) => out.push(x.kit.hit))); return out; };

  // ---------- shifting: each section slowly rearranges around its crystal ----------
  const shiftSt = {}; sections.forEach((S) => (shiftSt[S.id] = { t: 0, warnT: -1 }));
  let lastShift = null;
  function startShift(S) { const st = shiftSt[S.id]; if (!S.shift || st.warnT >= 0) return; st.warnT = S.shift.warn ?? 2.5; host.toast(S.shift.warning || "Something is shifting…"); audio.sfx("nope"); }
  function applyShift(S, p) {
    epochs[S.id] = (epochs[S.id] || 0) + 1; const [ci, cj] = cellOf(p.x, p.z); let n = 0;
    [...chunks.values()].forEach((ch) => { if (ch.pl.S !== S || (ch.i === ci && ch.j === cj)) return; unloadCell(ch.key); loadCell(ch.i, ch.j); n++; }); // the cell you're standing in stays put
    audio.sfx("flump"); host.toast(S.shift.done || "Something shifted."); lastShift = { section: S.id, rebuilt: n, epoch: epochs[S.id] };
  }
  function tickShift(dt, p, busy) {
    const S = sectionOf(...cellOf(p.x, p.z)); if (!S?.shift) return; const st = shiftSt[S.id];
    if (st.warnT >= 0) { st.warnT -= dt; const M = secMats(S, false); M.light.emissiveIntensity = Math.random() < 0.5 ? 0.1 : M.lightBase;
      if (st.warnT < 0) { M.light.emissiveIntensity = M.lightBase; st.t = 0; applyShift(S, p); } return; }
    st.t += dt; if (!busy && S.shift.every && st.t > S.shift.every) startShift(S);
  }

  // ---------- per-frame ----------
  const v2 = new THREE.Vector2();
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function update(dt, ts, st) {
    stitches.forEach((s) => s.anim(ts));
    if (st.mode !== "annex") return;
    if (G.active) { tickGlimpse(dt, ts); return; }
    const p = local(st.pos), zone = st.zone, busy = st.busy; lastP = p;
    timeIn += dt; lostT += dt; flipT = Math.max(0, flipT - dt);
    if (!busy) stream(p, false);
    tickShift(dt, p, busy);
    cache.forEach((v, k) => { if (v && v.flick && k.startsWith("sm:")) { v.ft += dt; v.flick.emissiveIntensity = (Math.sin(v.ft * 0.7) > -0.9 || Math.random() < 0.3) ? v.lightBase : 0.12; } });
    const animStone = (s) => { s.cr.rotation.y = ts * 0.8 + s.t; s.cr.position.y = s.baseY + Math.sin(ts * 1.6 + s.t) * 0.05; s.ring.scale.setScalar(1 + Math.sin(ts * 2 + s.t) * 0.08); };
    if (ovStone) animStone(ovStone);
    const yaw = host.state().yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    chunks.forEach((ch) => {
      ch.stones.forEach(animStone); ch.exits.forEach((ex) => ex.kit.anim(ts));
      ch.curios.forEach((c) => { if (!c.g.visible) return; c.spark.position.y = 0.6 + Math.sin(ts * 2 + c.t) * 0.06; c.spark.rotation.y = ts * 2; c.spark.visible = Math.sin(ts * 1.3 + c.t) > -0.3; if (c.c.type === "starter") c.item.material.emissiveIntensity = 0.3 + Math.random() * 0.6; });
      const px = p.x - ch.lx, pz = p.z - ch.lz;
      ch.receders.forEach((r) => { const d = Math.hypot(r.bx - px, r.bz - pz), k = Math.max(0, Math.min(1, (4 - d) / 3));
        if (r.ax === "x") { const away = Math.sign(r.bx - px) || 1; r.g.position.x += ((r.bx + away * k * 0.9) - r.g.position.x) * Math.min(1, dt * 2); }
        else { const away = Math.sign(r.bz - pz) || 1; r.g.position.z += ((r.bz + away * k * 0.9) - r.g.position.z) * Math.min(1, dt * 2); } });
      ch.npcs.forEach((n) => tickNpc(n, dt, ts, px, pz, st.feet, fx, fz));
      ch.grabbers.forEach((gr) => tickGrabber(gr, dt, ts, px, pz, zone, busy));
    });
    const deep = st.feet < 1 && creatureOK(...cellOf(p.x, p.z));
    tickCreature(dt, ts, p, st.feet, busy); tickFlitters(dt, ts, p, deep, busy); tickAlive(dt, p, deep, busy); crDim();
    if (!hinted && !busy && lostT > (data.lostHintSeconds || 240)) { hinted = true; host.toast(data.lostHint || "Lost? Try your home crystal."); }
  }
  function tickNpc(n, dt, ts, px, pz, feet, fx, fz) {
    if (n.poss) { if (!n.talking) tickPossessed(n, dt, px, pz); return; }
    if (n.homing) return tickHoming(n, dt);
    const gp = n.g.position, dp = Math.hypot(gp.x - px, gp.z - pz), q = n.d.quirk;
    const face = (want, k = 4) => { n.g.rotation.y += angDiff(want, n.g.rotation.y) * Math.min(1, dt * k); };
    if (q === "corner" && !n.talking) { // stands in the corner; only turns round when you're not looking at it
      const [cx, cz] = n.corner; v2.set(cx - gp.x, cz - gp.z); const d = v2.length();
      if (d > 0.05) { const sp = Math.min(d, n.d.speed * dt); gp.x += v2.x / d * sp; gp.z += v2.y / d * sp; face(Math.atan2(v2.x, v2.y)); return; }
      const toN = dp || 1, looking = ((gp.x - px) * fx + (gp.z - pz) * fz) / toN > 0.75;
      face(looking ? Math.atan2(cx - (n.rect.x0 + n.rect.x1) / 2, cz - (n.rect.z0 + n.rect.z1) / 2) : Math.atan2(px - gp.x, pz - gp.z), looking ? 9 : 2); n.body.position.y = 0; return; }
    if (n.talking || (dp < 1.3 && feet < 1)) { face(Math.atan2(px - gp.x, pz - gp.z)); n.body.position.y = 0; if (q === "tall") n.head.rotation.z = Math.sin(ts * 0.8) * 0.35; return; }
    if (n.wait > 0) { n.wait -= dt; n.look += dt; if (n.look > 1.6) { n.look = 0; if (Math.random() < 0.4) n.g.rotation.y += rnd(-1.2, 1.2); } n.body.position.y = 0; return; }
    v2.set(n.tgt.x - gp.x, n.tgt.y - gp.z); const d = v2.length();
    if (d < 0.05) { n.tgt.set(rnd(n.rect.x0, n.rect.x1), rnd(n.rect.z0, n.rect.z1)); if (Math.random() < 0.6) n.wait = rnd(2, 6); return; }
    let sp = Math.min(d, n.d.speed * dt);
    if (q === "stutter") { n.st += dt; sp = (n.st % 0.6) < 0.12 ? Math.min(d, n.d.speed * dt * 5) : 0; }
    gp.x += v2.x / d * sp; gp.z += v2.y / d * sp;
    face(Math.atan2(v2.x, v2.y) + (q === "backwards" ? Math.PI : 0), 5);
    n.body.position.y = q === "late" ? 0 : Math.abs(Math.sin(ts * 6 + n.ph)) * 0.04; n.head.rotation.y = Math.sin(ts * (q === "late" ? 0.25 : 0.7) + n.ph) * 0.3;
  }
  function tickGrabber(gr, dt, ts, px, pz, zone, busy) {
    const gp = gr.g.position, inRoom = zone === gr.zone, dp = Math.hypot(gp.x - px, gp.z - pz);
    animGrabber(gr, ts);
    if (gr.state === "cool") { gr.cool -= dt; moveTo(gr, gr.home[0], gr.home[1], dt); if (gr.cool <= 0) gr.state = "home"; return; }
    if (busy) return;
    if (inRoom && dp < (gr.d.notice || 5.5)) { if (gr.state !== "stalk") { gr.state = "stalk"; if (!gr.told) { gr.told = true; host.toast(gr.d.telegraph || "Something is coming…"); audio.sfx(gr.type === "bounceback" ? "flump" : "blip"); } } }
    else if (gr.state === "stalk" && !inRoom) { gr.state = "home"; gr.told = false; }
    if (gr.state === "stalk") { moveTo(gr, px, pz, dt); if (inRoom && dp < 0.75) grab(gr); }
    else moveTo(gr, gr.home[0], gr.home[1], dt);
  }
  function moveTo(gr, x, z, dt) { const gp = gr.g.position, r = gr.rect; v2.set(x - gp.x, z - gp.z); const d = v2.length(); if (d < 0.02) return;
    const sp = Math.min(d, (gr.d.speed || 0.8) * dt); gp.x = Math.max(r.x0, Math.min(r.x1, gp.x + v2.x / d * sp)); gp.z = Math.max(r.z0, Math.min(r.z1, gp.z + v2.y / d * sp)); gr.g.rotation.y = Math.atan2(v2.x, v2.y); }
  function animGrabber(gr, ts) {
    if (gr.type === "hem") gr.parts.forEach((m, i) => { m.rotation.y = ts * (0.3 + i * 0.07) * (i % 2 ? 1 : -1); });
    else if (gr.type === "courtesy") gr.parts[0].rotation.x = Math.sin(ts * 1.4) * 0.12;
    else { const s = 1 + Math.sin(ts * 5) * 0.08; gr.parts[0].scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); gr.parts[0].position.y = 0.62 + Math.abs(Math.sin(ts * 5)) * 0.12; }
  }
  const OVPAL = { bg: "#2b3340", fog: [30, 95], hemi: 1.15 };
  function atmos(zone) {
    if (zone === "annex:overlook") return OVPAL;
    if (zone === "annex:glimpse") return { bg: "#0e2a2c", fog: [5, 60], hemi: 1.2 };
    const zc = zoneCell(zone); if (!zc) return null; const S = sectionOf(zc.i, zc.j), dead = deadCells.has(ck(zc.i, zc.j));
    const v = (prog.flags.sections ||= []); if (!v.includes(S.id)) { v.push(S.id); save(); }
    if (alive.on && S.id === alive.section) return { ...palOf(S, dead), ...(data.aliveMode?.palette || { bg: "#1a2a3a", fog: [2, 16], hemi: 0.75 }) };
    return palOf(S, dead);
  }
  function roomLabel(zone) {
    if (zone === "annex:overlook") return "The Gremlins' Overlook (secret)";
    if (zone === "annex:glimpse") return `${GW?.name || "Somewhere else"} · ${G.active === "tour" ? "seen through " + (CRD?.name || "its") + "'s eyes" : "exploring (you caught " + (CRD?.name || "it") + ")"}`;
    const zc = zoneCell(zone); if (!zc) return data.name; const S = sectionOf(zc.i, zc.j), dz = deadCells.get(ck(zc.i, zc.j));
    if (dz) return `${S.name} · ${dz.z.name} (🚫 no crystal signal)`;
    if (centerOf.get(ck(zc.i, zc.j)) === S) return `${S.name} · crystal plaza`;
    if (zc.room == null) return S.name + (alive.on && S.id === alive.section ? " · 💡 the lights have changed" : "");
    const rm = chunks.get(ck(zc.i, zc.j))?.pl.rooms.find((r) => r.qi === zc.room);
    return `${S.name} · ${data.roomTypes?.[rm?.type]?.label || "a room"}`;
  }

  // =====================================================================================================
  // v3: Grenshol (the creature), its flitters (minions), lights-change mode, the glimpse world, Escher stairwells, silly TVs.
  // Lore: the Gremlins found a portal deep in the Annex, poked it to see what it was, and accidentally let Grenshol out.
  // =====================================================================================================
  const CRD = data.creature || null, MND = data.minions || {}, ALD = data.aliveMode || {}, STD = data.stairwells || {}, TVD = data.tvs || {}, GLD = data.glimpse || {};
  const rr = (a) => (Array.isArray(a) ? rnd(a[0], a[1]) : a);
  let calm = false; // demo/tests only: no spontaneous creature visits, possessions or light changes
  function creatureOK(i, j) { if (!CRD) return false; const S = sectionOf(i, j); return !(CRD.excludeSections || []).includes(S.id) && depthOf(i, j) >= (CRD.minDepth ?? 3); }
  const walkOK = (x, z) => { const wx = AX + x, wz = AZ + z; return walkable.some((r) => r.chunk && r.chunk !== "glimpse" && (r.y || 0) < 1 && wx >= r.x0 && wx <= r.x1 && wz >= r.z0 && wz <= r.z1) && !blockedLocal(x, z); };
  const fwdOf = () => { const y = host.state().yaw; return [-Math.sin(y), -Math.cos(y)]; };
  const looking = (x, z, p, dot) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1, [fx, fz] = fwdOf(); return (dx * fx + dz * fz) / d > dot; };
  function allLightMats(fn) { cache.forEach((v, k) => { if (v && v.light && k.startsWith("sm:") && !k.startsWith("sm:stone") && !k.startsWith("sm:ring")) fn(v); }); }

  // ---------- Grenshol ----------
  const cr = (() => { const g = new THREE.Group(); g.visible = false; root.add(g); const hk = (CRD?.height || 3.3) / 3.3;
    const sil = new THREE.MeshBasicMaterial({ color: CRD?.color || "#130e1b", fog: false }), eyeM = new THREE.MeshBasicMaterial({ color: CRD?.eyes || "#ffe9a8", fog: false });
    const body = new THREE.Group(); body.scale.setScalar(hk); g.add(body);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 2.3, 7), sil); torso.position.y = 1.35; body.add(torso);
    const head = new THREE.Group(); head.position.y = 2.75; body.add(head);
    const hm = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), sil); hm.scale.set(1, 1.15, 0.9); head.add(hm);
    const eyes = [-0.16, 0.16].map((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), eyeM); e.position.set(x, 0.05, 0.4); head.add(e); return e; });
    [-1, 1].forEach((s) => { const a = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.03), sil); a.position.set(s * 0.22, 0.75, 0.05); a.rotation.z = -s * 0.5; head.add(a);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.02), sil); f.position.set(s * 0.42, 1.08, 0.05); f.rotation.z = -s * 0.7; head.add(f); }); // feathery antennae, like a very tall moth
    const arms = [-1, 1].map((s) => { const pv = new THREE.Group(); pv.position.set(s * 0.42, 2.3, 0); body.add(pv); const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), sil); a.position.y = -0.95; pv.add(a); pv.rotation.z = s * 0.12; return pv; });
    return { g, body, head, eyes, arms, st: "away", t: 0, timer: rr(CRD?.appearEvery || [25, 45]), x: 0, z: 0, stuck: 0, ph: 0, seenAt: 0, fade: 1, sfxT: 0, count: 0 }; })();
  let lastCatch = null, lastCaught = null;
  function crSay(kind) { const L = CRD?.lines?.[kind]; if (L?.length) host.toast(fill(pick(L)).replaceAll("{creature}", CRD.name)); }
  function crShow(x, z, p) { cr.x = x; cr.z = z; cr.g.position.set(x, 0, z); cr.g.rotation.y = Math.atan2(p.x - x, p.z - z); cr.g.visible = true; cr.fade = 1; cr.body.scale.y = (CRD?.height || 3.3) / 3.3; cr.stuck = 0; }
  function crHide(next) { cr.st = "away"; cr.g.visible = false; cr.timer = next ?? rr(alive.on ? (CRD?.aliveAppearEvery || [6, 14]) : (CRD?.appearEvery || [25, 45])); }
  function crSpawn(p, opt = {}) { // pick a hallway end (the next junction along an open corridor) or a cell edge, in a creature-allowed cell
    const [ci, cj] = cellOf(p.x, p.z), cand = [];
    DIRS.forEach((d) => { if (!edgeOpen(ci, cj, d)) return; const [dx, dz] = DV[d];
      [[ci + dx, cj + dz, 1], [ci, cj, 0.5]].forEach(([i, j, k]) => { const x = ci * C + C2 + dx * C * k, z = cj * C + C2 + dz * C * k, dist = Math.hypot(x - p.x, z - p.z);
        if (!creatureOK(i, j) || !walkOK(x, z) || dist < (opt.min ?? 6) || dist > (opt.max ?? 26)) return;
        const aligned = Math.abs(x - p.x) < 1.6 || Math.abs(z - p.z) < 1.6; cand.push({ x, z, dist, aligned, ahead: looking(x, z, p, 0.6) }); }); });
    let pool = cand.filter((c) => c.aligned); if (opt.ahead) pool = pool.filter((c) => c.ahead).length ? pool.filter((c) => c.ahead) : pool; if (!pool.length) pool = cand;
    const c = pick(pool); if (!c) return false;
    crShow(c.x, c.z, p); cr.st = "peek"; cr.t = rr(CRD.peekSeconds || [5, 9]); cr.count++; audio.sfx("creak");
    if (!prog.flags.metGrenshol) { prog.flags.metGrenshol = new Date().toISOString(); save(); banner(CRD.name, fill(data.lore?.firstSighting || "Something tall is watching from the end of the hall.")); }
    else crSay("appear");
    return true; }
  function crBlink(p) { // reappear somewhere behind you (it's playing)
    const [fx, fz] = fwdOf(); for (let t = 0; t < 24; t++) { const a = Math.random() * Math.PI * 2, r = rnd(4, 7), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if ((Math.cos(a) * fx + Math.sin(a) * fz) > -0.2 || !walkOK(x, z) || !creatureOK(...cellOf(x, z))) continue; crShow(x, z, p); cr.st = "sneak"; audio.sfx("peek"); crSay("blink"); return true; }
    return false; }
  function crStep(p, sp, dt) { const dx = p.x - cr.x, dz = p.z - cr.z, d = Math.hypot(dx, dz) || 1, s = sp * dt, nx = cr.x + dx / d * s, nz = cr.z + dz / d * s;
    if (walkOK(nx, nz)) { cr.x = nx; cr.z = nz; cr.stuck = 0; } else if (walkOK(nx, cr.z)) { cr.x = nx; cr.stuck = 0; } else if (walkOK(cr.x, nz)) { cr.z = nz; cr.stuck = 0; } else cr.stuck += dt;
    cr.g.position.set(cr.x, 0, cr.z); cr.g.rotation.y = Math.atan2(dx, dz); }
  function tickCreature(dt, ts, p, feet, busy) {
    if (!CRD) return;
    const [ci, cj] = cellOf(p.x, p.z), ok = inAnnexNow && !G.active && feet < 1 && creatureOK(ci, cj);
    if (cr.st !== "away" && (!ok)) { crHide(); return; }
    // animation (it sways and peeks around corners)
    if (cr.g.visible) { cr.ph += dt; cr.head.rotation.z = Math.sin(cr.ph * 1.3) * 0.35; cr.head.rotation.y = Math.sin(cr.ph * 0.7) * 0.25; cr.arms.forEach((a, i) => (a.rotation.x = Math.sin(cr.ph * (cr.st === "sneak" ? 4 : 1.2) + i * Math.PI) * (cr.st === "sneak" ? 0.35 : 0.08)));
      cr.body.position.x = cr.st === "peek" ? Math.sin(cr.ph * 0.9) * 0.45 : 0; cr.eyes.forEach((e) => (e.visible = Math.sin(ts * 0.9 + 1.7) > -0.96)); }
    if (busy) return;
    const dist = Math.hypot(cr.x - p.x, cr.z - p.z), seen = cr.g.visible && dist < 30 && looking(cr.x, cr.z, p, CRD.lookDot ?? 0.93);
    if (cr.st === "away") { if (!ok || calm) return; cr.timer -= dt; if (cr.timer <= 0) { if (!crSpawn(p)) cr.timer = 3; } return; }
    if (cr.st === "peek" || cr.st === "sneak") {
      if (seen && !(alive.on && cr.st === "sneak" && Math.random() < 0.35 * dt * 4)) { cr.st = "frozen"; cr.t = (CRD.freezeSeconds ?? 2.6) * (alive.on ? 0.8 : 1); audio.sfx("peek"); crSay("freeze"); return; }
      if (cr.st === "peek") { cr.t -= dt; cr.g.rotation.y = Math.atan2(p.x - cr.x, p.z - cr.z); if (cr.t <= 0) cr.st = "sneak"; return; }
      if (!seen || alive.on) crStep(p, (alive.on ? CRD.huntSpeed : CRD.sneakSpeed) * (seen ? 0.35 : 1) || 1.5, dt);
      if (cr.stuck > 2.2) { if (!crBlink(p)) crHide(); return; }
      if (Math.hypot(cr.x - p.x, cr.z - p.z) < (CRD.catchRadius ?? 0.9)) return crCaught();
      cr.sfxT -= dt; if (cr.sfxT < 0) { cr.sfxT = rnd(5, 9); if (dist > 4) audio.sfx("creak"); }
      return; }
    if (cr.st === "frozen") { cr.t -= dt; cr.g.rotation.y = Math.atan2(p.x - cr.x, p.z - cr.z);
      if (dist < (CRD.catchRadius ?? 0.9) + 0.5) return crTagged();
      if (cr.t <= 0) { if (alive.on && Math.random() < 0.5 && crBlink(p)) return; cr.st = "flee"; cr.t = 0.9; crSay("flee"); audio.sfx("peek"); } return; }
    if (cr.st === "flee") { cr.t -= dt; cr.body.scale.y = Math.max(0.01, cr.body.scale.y - dt * 1.2); cr.g.position.y -= dt * 0.2; if (cr.t <= 0) { cr.g.position.y = 0; crHide(); } }
  }
  function crDim() { // lights near Grenshol go dim (and change colour in lights-change mode)
    const d = cr.g.visible ? Math.hypot(cr.x - lastP.x, cr.z - lastP.z) : 99, k = cr.g.visible ? Math.max(0.22, Math.min(1, (d - 2) / (CRD?.dimRadius || 10))) : 1;
    const warn = Object.values(shiftSt).some((s) => s.warnT >= 0);
    allLightMats((M) => { if (warn && M === secMats(curSection(), false)) return; M.light.emissiveIntensity = M.lightBase * k * (alive.on ? 0.8 : 1); });
    return k; }
  function crCaught() { const from = curSection(); cr.st = "held"; cr.g.visible = false; lastCaught = { from: from.id, at: Date.now() };
    const gm = gmem(); gm.caughtBy = (gm.caughtBy || 0) + 1; save(); audio.sfx("flump"); host.toast(fill(CRD.caught || "Grenshol got you!"));
    enterGlimpse("tour"); }
  function crTagged() { cr.st = "held"; const gm = gmem(), first = !(gm.catches > 0); gm.catches = (gm.catches || 0) + 1; save(); audio.sfx("chime"); lastCatch = { first, at: Date.now() };
    host.toast(fill(CRD.tagged || "You tagged Grenshol!"));
    if (!first && gm.discovered?.length) return openGlimpseChoice(); enterGlimpse("explore", null); }

  // ---------- flitters (Grenshol's little helpers) + possession ----------
  const flit = (() => { const out = [], wm = new THREE.MeshBasicMaterial({ color: MND.color || "#d9cbe8", side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), bm = new THREE.MeshBasicMaterial({ color: "#3a2f4a" }), em = new THREE.MeshBasicMaterial({ color: MND.eye || "#9cf7ff", fog: false });
    const wg = new THREE.PlaneGeometry(0.16, 0.12), bg = new THREE.BoxGeometry(0.035, 0.035, 0.12), eg = new THREE.SphereGeometry(0.014, 5, 4);
    for (let i = 0; i < Math.max(MND.aliveCount || 7, MND.count || 2); i++) { const g = new THREE.Group(); g.visible = false; root.add(g); g.add(new THREE.Mesh(bg, bm));
      const w = [-1, 1].map((s) => { const pv = new THREE.Group(); g.add(pv); const m = new THREE.Mesh(wg, wm); m.position.x = s * 0.08; pv.add(m); return pv; });
      [-1, 1].forEach((s) => { const e = new THREE.Mesh(eg, em); e.position.set(s * 0.015, 0.012, 0.06); g.add(e); });
      out.push({ g, w, st: "off", tx: 0, ty: 2.4, tz: 0, ph: rnd(0, 6), npc: null }); }
    return out; })();
  let possT = rr(MND.possessEvery || [25, 50]), lastPossess = null;
  const npcWorld = (n) => ({ x: n.ch.lx + n.g.position.x, z: n.ch.lz + n.g.position.z });
  const allNpcs = () => [...chunks.values()].flatMap((ch) => ch.npcs);
  function possTint() { return once("mat:poss", () => mat(MND.tint || "#7d6aa8", { emissive: MND.tint || "#7d6aa8", emissiveIntensity: 0.35 })); }
  function possess(n, secs) {
    if (n.poss) return; n.poss = { t: secs ?? rr(MND.possessSeconds || [12, 22]), line: 1.5 }; n.homing = false;
    n.origM = []; n.body.traverse((o) => { if (o.isMesh && o.material?.color && !o.material.map) { n.origM.push([o, o.material]); o.material = possTint(); } });
    if (!n.peyes) { n.peyes = [-0.08, 0.08].map((x) => { const e = new THREE.Mesh(once("geo:peye", () => new THREE.SphereGeometry(0.035, 6, 5)), once("mat:peye", () => new THREE.MeshBasicMaterial({ color: MND.eye || "#9cf7ff", fog: false }))); e.position.set(x, 0.02, 0.18); n.head.add(e); return e; }); }
    n.peyes.forEach((e) => (e.visible = true)); audio.sfx("flutter"); lastPossess = { id: n.d.id, cell: n.ch.key, at: Date.now() };
    const w = npcWorld(n); if (Math.hypot(w.x - lastP.x, w.z - lastP.z) < 12) host.toast(fill(pick(MND.possessed || ["A flitter lands on its head. Its eyes go a very bright blue."]))); }
  function release(n) { if (!n.poss) return; n.poss = null; (n.origM || []).forEach(([o, m]) => (o.material = m)); n.origM = null; n.peyes?.forEach((e) => (e.visible = false)); n.homing = true;
    const f = flit.find((q) => q.st === "off"); if (f) { const w = npcWorld(n); f.g.position.set(w.x, 1.9, w.z); f.g.visible = true; f.st = "wander"; f.tx = w.x + rnd(-4, 4); f.tz = w.z + rnd(-4, 4); }
    const w = npcWorld(n); if (Math.hypot(w.x - lastP.x, w.z - lastP.z) < 10) host.toast(fill(pick(MND.release || ["It blinks. \"Sorry. What was I saying?\""]))); }
  function tickPossessed(n, dt, px, pz) { // follows you around (gently), says creature-ish things, then lets go
    const gp = n.g.position; n.poss.t -= dt; if (n.poss.t <= 0) return release(n);
    const dx = px - gp.x, dz = pz - gp.z, d = Math.hypot(dx, dz) || 1; n.g.rotation.y += angDiff(Math.atan2(dx, dz), n.g.rotation.y) * Math.min(1, dt * 5);
    if (d > 1.6 && d < 20) { const s = Math.min(d - 1.5, (n.d.speed + 0.5) * dt), nx = gp.x + dx / d * s, nz = gp.z + dz / d * s;
      if (walkOK(n.ch.lx + nx, n.ch.lz + nz)) { gp.x = nx; gp.z = nz; } else if (walkOK(n.ch.lx + nx, n.ch.lz + gp.z)) gp.x = nx; else if (walkOK(n.ch.lx + gp.x, n.ch.lz + nz)) gp.z = nz; }
    n.body.position.y = Math.abs(Math.sin(n.poss.t * 9)) * 0.03; n.head.rotation.z = Math.sin(n.poss.t * 2.3) * 0.4;
    n.poss.line -= dt; if (d < 3.2 && n.poss.line <= 0 && !n.talking) { n.poss.line = rnd(6, 10); host.toast(`${n.d.name[0].toUpperCase() + n.d.name.slice(1)} (glowing eyes): "${fill(pick(MND.lines || ["We are curious."]))}"`); }
  }
  function tickHoming(n, dt) { const gp = n.g.position, cx = (n.rect.x0 + n.rect.x1) / 2, cz = (n.rect.z0 + n.rect.z1) / 2, dx = cx - gp.x, dz = cz - gp.z, d = Math.hypot(dx, dz);
    if (gp.x >= n.rect.x0 && gp.x <= n.rect.x1 && gp.z >= n.rect.z0 && gp.z <= n.rect.z1) { n.homing = false; n.tgt.set(gp.x, gp.z); return; }
    const s = Math.min(d, n.d.speed * dt * 1.5), nx = gp.x + dx / d * s, nz = gp.z + dz / d * s; if (walkOK(n.ch.lx + nx, n.ch.lz + nz)) { gp.x = nx; gp.z = nz; } else { gp.x = cx; gp.z = cz; } // snaps home if it's stuck (nobody's looking)
    n.g.rotation.y = Math.atan2(dx, dz); }
  function tickFlitters(dt, ts, p, deep, busy) {
    const want = deep && !G.active ? (alive.on ? MND.aliveCount || 7 : MND.count || 2) : 0; let on = 0;
    flit.forEach((f) => { if (f.st === "off") return; on++;
      if (f.st === "toNpc" && f.npc) { const w = npcWorld(f.npc); f.tx = w.x; f.tz = w.z; f.ty = 1.75 * (f.npc.d.quirk === "tall" ? 1.2 : 1); }
      const dx = f.tx - f.g.position.x, dy = f.ty - f.g.position.y, dz = f.tz - f.g.position.z, d = Math.hypot(dx, dy, dz) || 1, sp = (f.st === "toNpc" ? 3.2 : 1.6) * dt;
      f.g.position.x += dx / d * Math.min(d, sp); f.g.position.y += dy / d * Math.min(d, sp) + Math.sin(ts * 7 + f.ph) * 0.006; f.g.position.z += dz / d * Math.min(d, sp); f.g.rotation.y = Math.atan2(dx, dz);
      f.w[0].rotation.y = Math.sin(ts * 28 + f.ph) * 0.9; f.w[1].rotation.y = -Math.sin(ts * 28 + f.ph) * 0.9;
      if (f.st === "toNpc" && d < 0.25) { possess(f.npc); f.npc = null; f.st = "off"; f.g.visible = false; return; }
      if (f.st === "wander" && d < 0.4) { const a = Math.random() * 6.28, r = rnd(3, 9); f.tx = p.x + Math.cos(a) * r; f.tz = p.z + Math.sin(a) * r; f.ty = rnd(1.6, 2.8); }
      if (f.st === "wander" && (Math.hypot(f.g.position.x - p.x, f.g.position.z - p.z) > 22 || on > want)) { f.st = "off"; f.g.visible = false; on--; } });
    if (on < want && Math.random() < dt * 2) { const f = flit.find((q) => q.st === "off"); if (f) { const a = Math.random() * 6.28; f.g.position.set(p.x + Math.cos(a) * 8, 2.6, p.z + Math.sin(a) * 8); f.st = "wander"; f.tx = p.x; f.tz = p.z; f.ty = 2.2; f.g.visible = true; } }
    if (!busy && !calm && deep) { possT -= dt * (alive.on ? 3 : 1); if (possT <= 0) { possT = rr(MND.possessEvery || [25, 50]); sendFlitter(); } }
  }
  function sendFlitter(n) { n = n || allNpcs().filter((q) => !q.poss && !q.talking).sort((a, b) => { const A = npcWorld(a), B = npcWorld(b); return Math.hypot(A.x - lastP.x, A.z - lastP.z) - Math.hypot(B.x - lastP.x, B.z - lastP.z); })[0];
    if (!n) return false; const w = npcWorld(n); if (Math.hypot(w.x - lastP.x, w.z - lastP.z) > (MND.possessRange || 22)) return false;
    const f = flit.find((q) => q.st === "off") || flit.find((q) => q.st === "wander"); if (!f) return false;
    if (f.st === "off") { f.g.position.set(w.x + rnd(-5, 5), 2.6, w.z + rnd(-5, 5)); f.g.visible = true; } f.st = "toNpc"; f.npc = n; audio.sfx("flutter"); return true; }

  // ---------- lights-change mode ----------
  const alive = { on: false, t: 0, section: null, by: null, count: 0, roll: 0 };
  const lightColors = new Map();
  function startAlive(by) {
    if (alive.on || G.active) return false; const S = curSection(); alive.on = true; alive.t = ALD.seconds || 75; alive.section = S.id; alive.by = by; alive.count++;
    allLightMats((M) => { if (!lightColors.has(M)) lightColors.set(M, M.light.emissive.getHex()); M.light.emissive.set(ALD.light || "#9cf7ff"); M.flick.emissive.set(ALD.light || "#9cf7ff"); });
    audio.setMood("alive"); audio.sfx("creak"); host.toast(fill(ALD.on || "The lights change. Everything wakes up a little.")); host.updateActions();
    cr.timer = Math.min(cr.timer, rr(CRD?.aliveAppearEvery || [6, 14])); possT = Math.min(possT, 4); return true; }
  function endAlive(quiet) {
    if (!alive.on) return; alive.on = false; lightColors.forEach((hex, M) => { M.light.emissive.setHex(hex); M.flick.emissive.setHex(hex); }); lightColors.clear();
    chunks.forEach((ch) => ch.twitch.forEach((o) => { o.rotation.y = o.userData.ry0; o.rotation.z = o.userData.rz0; }));
    if (!G.active) audio.setMood("annex"); if (!quiet) host.toast(fill(ALD.off || "The lights settle. Everything pretends nothing happened.")); host.updateActions(); }
  function tickAlive(dt, p, deep, busy) {
    if (alive.on) { alive.t -= dt; if (alive.t <= 0 || curSection().id !== alive.section) return endAlive();
      chunks.forEach((ch) => { if (ch.pl.S.id !== alive.section) return; ch.twitch.forEach((o) => { if (Math.random() < dt * 1.2) { o.rotation.y = o.userData.ry0 + rnd(-0.3, 0.3); o.rotation.z = o.userData.rz0 + rnd(-0.12, 0.12); } }); });
      return; }
    if (!deep || busy || calm || G.active) return; alive.roll += dt; if (alive.roll >= 1) { alive.roll = 0; if (Math.random() < (ALD.randomPerMinute ?? 0.05) / 60) startAlive("random"); }
  }
  function openSwitch() { host.openPanel("💡 " + (ALD.switchTitle || "A light switch that wasn't here before"), (pn) => {
    pn.appendChild(el("p", null, ALD.prompt || "See what happens when the lights change?"));
    const row = el("div", "o3-prompts"), yes = el("button", "o3-btn", ALD.yes || "Flip it"), no = el("button", "o3-btn ghost", ALD.no || "Leave it");
    yes.dataset.alive = "yes"; no.dataset.alive = "no"; yes.onclick = () => { host.closePanel(); audio.sfx("click"); startAlive("switch"); }; no.onclick = () => { host.closePanel(); host.toast(fill(ALD.decline || "You leave it. The switch looks a little disappointed.")); };
    row.append(yes, no); pn.appendChild(row); pn.appendChild(el("p", "o3-small", ALD.small || "Nothing bad happens. Things just get… livelier for a while."));
  }); }
  function makeSwitch(g, rm, ch) { const doorWall = rm.door.line === "x" ? (rm.door.at <= rm.x0 + 0.01 ? "w" : "e") : (rm.door.at <= rm.z0 + 0.01 ? "s" : "n");
    const sp = wallSpot(rm, doorWall, rm.door.c + (rm.door.c - wallMid(rm, doorWall) > 0 ? -1.0 : 1.0), 1.25), s = new THREE.Group(); s.position.set(sp.x, sp.y, sp.z); s.rotation.y = sp.ry; g.add(s);
    box(0, 0, 0, 0.14, 0.22, 0.02, mat("#efe6c8"), s); const k = box(0, 0.03, 0.02, 0.04, 0.07, 0.03, mat("#9cf7ff", { emissive: "#5fd8e8", emissiveIntensity: 0.8 }), s);
    return { g: s, k, lx: ch.lx + sp.x, lz: ch.lz + sp.z, rm }; }

  // ---------- Escher stairwells ----------
  const stairKinds = Object.keys(STD.weights || { up: 3, down: 3, loop: 2, flip: 1 });
  function pickStair(u) { const W = STD.weights || { up: 3, down: 3, loop: 2, flip: 1 }, tot = stairKinds.reduce((a, k) => a + W[k], 0); let x = u * tot; for (const k of stairKinds) { x -= W[k]; if (x < 0) return k; } return stairKinds[0]; }
  let lastStair = null, flipT = 0, loops = 0;
  function makeStairs(g, rm, ch, M) {
    const doorWall = rm.door.line === "x" ? (rm.door.at <= rm.x0 + 0.01 ? "w" : "e") : (rm.door.at <= rm.z0 + 0.01 ? "s" : "n");
    const far = { n: "s", s: "n", e: "w", w: "e" }[doorWall], dir = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[far];
    const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2, half = dir[0] ? (rm.x1 - rm.x0) / 2 : (rm.z1 - rm.z0) / 2, L = half - 0.15, n = 7, kind = rm.stair;
    const sm = once("mat:stair", () => mat("#9a9078", { roughness: 0.9 })), dark = once("mat:stairdark", () => new THREE.MeshBasicMaterial({ color: "#0b0906" }));
    const down = kind === "down" || kind === "flip", up = !down;
    const stepAt = (k, y, hgt, parent = g) => { const a = (k + 0.5) * L / n, x = cx + dir[0] * a, z = cz + dir[1] * a; return box(x, y, z, dir[0] ? L / n : 1.2, hgt, dir[0] ? 1.2 : L / n, sm, parent); };
    if (up) { for (let k = 0; k < n; k++) stepAt(k, (k + 1) * 0.36 / 2, (k + 1) * 0.36); // a flight up into a dark hole in the ceiling
      box(cx + dir[0] * (L - 0.6), H - 0.004, cz + dir[1] * (L - 0.6), dir[0] ? 1.3 : 1.3, 0.01, dir[0] ? 1.3 : 1.3, dark, g); }
    else { const hole = box(cx + dir[0] * L / 2, 0.012, cz + dir[1] * L / 2, dir[0] ? L : 1.25, 0.01, dir[0] ? 1.25 : L, dark, g); // a dark stairwell going down
      for (let k = 0; k < 3; k++) { const a = (k + 0.5) * 0.45, s = box(cx + dir[0] * a, 0.016, cz + dir[1] * a, dir[0] ? 0.4 : 1.15, 0.01, dir[0] ? 1.15 : 0.4, sm, g); s.material = once("mat:stairfade" + k, () => mat("#9a9078", { transparent: true, opacity: 0.8 - k * 0.25 })); }
      const rail = once("mat:rail", () => mat("#5a4e3a")); [-0.68, 0.68].forEach((o) => box(cx + dir[0] * L / 2 + dir[1] * o, 0.5, cz + dir[1] * L / 2 + dir[0] * o, dir[0] ? L : 0.04, 0.04, dir[0] ? 0.04 : L, rail, g)); }
    if (kind === "flip") for (let k = 0; k < n; k++) { const s = stepAt(k, H - (k + 1) * 0.36 / 2, (k + 1) * 0.36); s.material = sm; } // the same stairs, hanging off the ceiling
    if (kind === "loop") P.poster(g, { ...wallSpot(rm, far, wallMid(rm, far), 2.5), y: 2.6 });
    const foot = { x: cx - dir[0] * 0.4, z: cz - dir[1] * 0.4 }, top = up ? { x: cx + dir[0] * L * 0.9, y: 2.6, z: cz + dir[1] * L * 0.9 } : { x: cx + dir[0] * L * 0.8, y: -1.2, z: cz + dir[1] * L * 0.8 };
    return { rm, kind, up, lx: ch.lx + foot.x, lz: ch.lz + foot.z, yaw: Math.atan2(-dir[0], -dir[1]), top: new THREE.Vector3(AX + ch.lx + top.x, top.y, AZ + ch.lz + top.z), cell: ch.key, i: ch.i, j: ch.j }; }
  function useStair(st) {
    if (host.state().busy) return; audio.sfx("steps"); host.setZoom(false);
    host.threadWarp({ target: st.top, swap: () => {
      const from = curSection(), K = STD.kinds?.[st.kind] || {};
      if (st.kind === "loop") { loops++; place({ x: st.lx, z: st.lz, yaw: st.yaw }, fill(pick(K.messages || ["You climb up. You are at the bottom of the same stairs."])) + (loops >= 3 ? " " + fill(STD.loopNote || "") : ""));
        lastStair = { kind: "loop", from: { cell: st.cell, section: from.id }, to: { cell: st.cell, section: from.id }, loops }; return; }
      const other = Math.random() < (STD.otherSectionChance ?? 0.4), S = other ? otherSection(from) : from; let sp = null;
      for (let t = 0; t < 10 && !sp; t++) { const c = dropIn(S, false); if (!c.cell || ck(c.cell[0], c.cell[1]) !== st.cell) sp = c; } sp = sp || plazaSpawn(S);
      const msg = fill(pick(K.messages || ["The stairs go somewhere else."])).replace("{section}", S.name);
      if (st.kind === "flip") { flipT = STD.flipSeconds || 9; } place(sp, msg);
      lastStair = { kind: st.kind, from: { cell: st.cell, section: from.id }, to: { cell: sp.cell ? ck(sp.cell[0], sp.cell[1]) : "plaza", section: S.id } }; } }); }

  // ---------- silly TVs (procedural cartoons, ~8 fps, paused when off-screen) ----------
  const TVW = 128, TVH = 96;
  const CART = {
    stamper(c, f) { c.fillStyle = "#c8b98a"; c.fillRect(0, 70, TVW, 26); const up = f % 4 < 2; c.fillStyle = "#3a3328"; c.beginPath(); c.arc(40, 34, 8, 0, 7); c.fill(); c.fillRect(33, 42, 14, 24);
      c.save(); c.translate(46, 46); c.rotate(up ? -0.9 : 0.4); c.fillRect(0, -2, 20, 5); c.fillStyle = "#b03a2e"; c.fillRect(18, -5, 7, 11); c.restore();
      const px = 64 + ((f % 8) < 2 ? (2 - (f % 8)) * 18 : 0); c.fillStyle = "#fffdf5"; c.fillRect(px, 62, 26, 8); if (f % 8 >= 2) { c.fillStyle = "#b03a2e"; c.fillRect(px + 9, 63, 8, 5); }
      const pile = Math.floor(f / 8) % 10; c.fillStyle = "#fffdf5"; for (let i = 0; i < pile; i++) c.fillRect(96, 66 - i * 3, 26, 2); c.fillStyle = "#3a3328"; c.font = "8px monospace"; c.fillText("FORM " + (100 + Math.floor(f / 8)), 4, 92); },
    sunclock(c, f) { c.fillStyle = "#7fb6d8"; c.fillRect(0, 14, TVW, 82); c.fillStyle = "#6f9a5a"; c.fillRect(0, 80, TVW, 16); const ph = f % 32, x = ph < 12 ? 10 + ph * 5 : ph < 20 ? 70 : 70 - (ph - 20) * 5;
      c.fillStyle = "#ffd45a"; c.beginPath(); c.arc(x, 56, 12, 0, 7); c.fill(); c.strokeStyle = "#ffd45a"; c.lineWidth = 2; for (let a = 0; a < 8; a++) { c.beginPath(); c.moveTo(x + Math.cos(a + f * 0.3) * 15, 56 + Math.sin(a + f * 0.3) * 15); c.lineTo(x + Math.cos(a + f * 0.3) * 19, 56 + Math.sin(a + f * 0.3) * 19); c.stroke(); }
      c.fillStyle = "#3a2a1a"; c.fillRect(x - 5, 52, 2, 2); c.fillRect(x + 3, 52, 2, 2); c.beginPath(); c.arc(x, 58, 5, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = "#555"; c.fillRect(90, 38, 26, 34); c.fillStyle = "#e9f2d0"; c.fillRect(93, 41, 20, 12); c.fillStyle = "#222"; c.font = "8px monospace"; c.fillText("9:00", 94, 50); if (ph >= 12 && ph < 20) { c.fillStyle = "#fff"; c.fillRect(84, 58 + (ph % 2) * 3, 10, 6); } },
    queue(c, f) { c.fillStyle = "#d8d0bc"; c.fillRect(0, 14, TVW, 82); c.fillStyle = "#8a6f4e"; c.fillRect(8, 50, 20, 26); c.fillStyle = "#222"; c.font = "7px monospace"; c.fillText(f % 16 < 8 ? "NEXT" : "CLOSED", 7, 46);
      const sh = (f % 8) / 8; for (let i = 0; i < 6; i++) { const x = 36 + i * 14 - sh * 14; c.fillStyle = ["#b48cff", "#7cf7d4", "#ffd37a", "#ff8a7a", "#6fd0ff", "#c9a57a"][(i + Math.floor(f / 8)) % 6]; c.beginPath(); c.arc(x, 66 - (i === 0 ? Math.abs(Math.sin(f)) * 3 : 0), 6, 0, 7); c.fill(); c.fillRect(x - 5, 66, 10, 10); } },
    survey(c, f) { c.fillStyle = "#20302a"; c.fillRect(0, 14, TVW, 82); c.fillStyle = "#cfe6b8"; c.font = "8px monospace"; c.fillText("HOW CALM ARE YOU?", 14, 30); const ph = f % 24;
      for (let i = 1; i <= 5; i++) { const dodge = i < 5 && ph > i * 3 ? (ph - i * 3) * 4 : 0; c.fillStyle = i === 5 ? "#7cf7d4" : "#556"; c.fillRect(12 + (i - 1) * 22, 44 + dodge, 16, 14); c.fillStyle = "#111"; c.fillText(String(i), 17 + (i - 1) * 22, 54 + dodge); }
      const cx = 20 + Math.min(ph, 18) * 5, cy = 70 - Math.min(ph, 18); c.fillStyle = "#fff"; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 6, cy + 9); c.lineTo(cx + 2, cy + 8); c.fill(); if (ph > 19) { c.fillStyle = "#cfe6b8"; c.fillText("THANK YOU. AGAIN?", 14, 88); } },
    coffee(c, f) { c.fillStyle = "#e9e1cc"; c.fillRect(0, 14, TVW, 82); const ph = f % 28, big = Math.floor(f / 28) % 4, w = 18 + big * 6, h = 20 + big * 6, x = 64 - w / 2, y = 84 - h;
      c.fillStyle = "#666"; c.fillRect(54, 16, 20, 12); c.fillStyle = "#5a3a22"; if (ph < 22) c.fillRect(63, 28, 2, y - 28); const lvl = Math.min(h - 2, ph * h / 18); c.fillRect(x + 2, 84 - lvl, w - 4, lvl);
      if (ph > 18 && ph < 24) { c.fillRect(x - 6, 84, w + 12, 3); } c.strokeStyle = "#333"; c.lineWidth = 2; c.strokeRect(x, y, w, h); c.fillStyle = "#b03a2e"; c.font = "7px monospace"; c.fillText("MORE", x + 2, y + h / 2 + 3); if (ph > 24) { c.fillStyle = "#f2c9a0"; c.fillRect(100 - (ph - 24) * 8, 70, 14, 6); } },
  };
  const tvList = () => [...chunks.values()].flatMap((ch) => ch.tvs);
  function makeTV(g, rm, ch) {
    const doorWall = rm.door.line === "x" ? (rm.door.at <= rm.x0 + 0.01 ? "w" : "e") : (rm.door.at <= rm.z0 + 0.01 ? "s" : "n"), wall = ["n", "e", "s", "w"].find((w) => w !== doorWall && w !== { n: "s", s: "n", e: "w", w: "e" }[doorWall]) || "n";
    const sp = wallSpot(rm, wall, wallMid(rm, wall), 2.05), t = new THREE.Group(); t.position.set(sp.x, sp.y, sp.z); t.rotation.y = sp.ry; g.add(t);
    box(0, 0, 0.06, 0.92, 0.66, 0.12, once("mat:tvcase", () => mat("#2b2b30", { roughness: 0.5 })), t); box(0, 0.42, 0.02, 0.06, 0.2, 0.04, once("mat:tvcase", () => mat("#2b2b30")), t);
    const cv = document.createElement("canvas"); cv.width = TVW; cv.height = TVH; const c = cv.getContext("2d"); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const sm = new THREE.MeshBasicMaterial({ map: tex }); const scr = new THREE.Mesh(planeGeo, sm); scr.scale.set(0.8, 0.56, 1); scr.position.z = 0.125; t.add(scr); ch.disp.push(tex, sm);
    const names = (TVD.cartoons || Object.keys(CART)).filter((k) => CART[k]), u = hsh(ch.i, ch.j, rm.qi, "tvc", ch.pl.ep), name = names[Math.floor(u * names.length)] || "stamper";
    const caps = TVD.captions || ["PLEASE BE SEATED"], cap = caps[Math.floor(hsh(ch.i, ch.j, rm.qi, "tvcap", ch.pl.ep) * caps.length)];
    const wp = new THREE.Vector3(AX + ch.lx + sp.x, sp.y, AZ + ch.lz + sp.z); const tvo = { name, cap, c, tex, frames: 0, last: -1, f: Math.floor(u * 100), wp, visible: false, cell: ch.key, qi: rm.qi };
    drawTV(tvo); return tvo; }
  function drawTV(tv) { const c = tv.c; c.fillStyle = "#111"; c.fillRect(0, 0, TVW, TVH); try { CART[tv.name](c, tv.f); } catch {}
    c.fillStyle = "#000"; c.fillRect(0, 0, TVW, 14); c.fillStyle = tv.f % 10 < 8 ? "#ff6b5a" : "#ffb0a5"; c.font = "bold 9px monospace"; c.textAlign = "center"; c.fillText(tv.cap, TVW / 2, 10); c.textAlign = "left";
    c.fillStyle = "rgba(255,255,255,0.06)"; for (let y = 0; y < TVH; y += 3) c.fillRect(0, y, TVW, 1); tv.tex.needsUpdate = true; tv.frames++; }
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  function tickTVs(cam, ts) { const list = tvList(); if (!list.length) return; cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const fps = TVD.fps || 8, range = TVD.range || 16;
    list.forEach((tv) => { tv.visible = tv.wp.distanceTo(cam.position) < range && frustum.containsPoint(tv.wp); if (!tv.visible) return; if (ts - tv.last < 1 / fps) return; tv.last = ts; tv.f++; drawTV(tv); }); }

  // ---------- the glimpse world (separate module; loaded in the background, built the first time you need it) ----------
  const G = { active: null, spot: null, t: 0, tour: null, warnDone: false, lastSec: -1 };
  let GW = null, gwMod = null, gwData = null, lens = null;
  const gwReady = Promise.all([import("./glimpse.js"), fetch(GLD.data || "data/glimpse-world.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null))])
    .then(([m, d]) => { gwMod = m; gwData = d; }).catch(() => { gwMod = null; });
  function glimpseWorld() { if (!GW && gwMod && gwData) { GW = gwMod.createGlimpse(THREE, gwData, { origin: GLD.origin }); lens = gwMod.createLens(THREE); } return GW; }
  function gmem() { const g = (prog.glimpse ||= {}); g.catches ||= 0; g.caughtBy ||= 0; g.seen ||= []; g.discovered ||= []; g.visits ||= 0; return g; }
  const gbar = el("div", "o3-glimpsebar"); gbar.hidden = true; host.hud.appendChild(gbar);
  function openGlimpseChoice() { const gm = gmem(), W = glimpseWorld();
    host.openPanel("🦕 " + (GLD.chooseTitle || "Grenshol holds still. Where to?"), (pn) => {
      pn.appendChild(el("p", null, fill(GLD.chooseText || "It remembers you. It can take you back somewhere you've already been, or somewhere new.")));
      const row = el("div", "o3-prompts");
      (W?.spots || []).filter((s) => gm.discovered.includes(s.id)).forEach((s) => { const b = el("button", "o3-btn ghost small", "📍 " + s.name); b.dataset.spot = s.id; b.onclick = () => { host.closePanel(); enterGlimpse("explore", s.id); }; row.appendChild(b); });
      const nb = el("button", "o3-btn small", "✨ Somewhere new"); nb.dataset.spot = "new"; nb.onclick = () => { host.closePanel(); enterGlimpse("explore", null); }; row.appendChild(nb); pn.appendChild(row); }, { onClose: () => { if (cr.st === "held" && !G.active && !host.state().warp) crHide(); } }); }
  function tourPlan(W) { const T = W.data.tour || {}, n = Math.round(rnd(...(T.views || [4, 6]))), views = [...W.views].sort(() => Math.random() - 0.5).slice(0, n);
    let durs = views.map(() => rnd(T.min ?? 1.4, T.max ?? 5.5)); const sum = durs.reduce((a, b) => a + b, 0), k = (T.total || 20) / sum; durs = durs.map((d) => d * k);
    let at = 0; return { segs: views.map((v, i) => { const s = { v, t0: at, d: durs[i] }; at += durs[i]; return s; }), total: at, t: 0, idx: -1 }; }
  function enterGlimpse(kind, spotId) {
    const W = glimpseWorld(); if (!W) { const S = otherSection(curSection()); cr.st = "away"; crHide(); return host.threadWarp({ swap: () => place(dropIn(S, false), "Grenshol tried to show you something, but the way was stuck. You land in " + S.name + ".") }); }
    audio.sfx("whoosh"); host.setZoom(false); const gm = gmem();
    let spot = W.spots.find((s) => s.id === spotId); if (!spot) { const fresh = W.spots.filter((s) => !gm.discovered.includes(s.id)); spot = pick(fresh.length ? fresh : W.spots); }
    host.threadWarp({ swap: () => {
      endAlive(true); crHide(); G.active = kind; G.spot = spot.id; G.t = 0; G.warnDone = false; G.lastSec = -1; gm.visits++;
      walkable.push(...W.walk); audio.setMood("glimpse");
      host.placeAnnex({ x: spot.wx, z: spot.wz, y: 0, yaw: spot.yaw || 0, pitch: 0 });
      if (kind === "tour") { G.tour = tourPlan(W); host.setFreeze(true); banner(W.name, fill(GLD.tourText || "You see through Grenshol's eyes…")); }
      else { G.tour = null; G.dur = W.data.explore?.seconds || 75; discover(spot); banner(W.name, fill(GLD.exploreText || "You caught Grenshol! It lets you look around its home for a bit.")); }
      save(); host.updateActions(); } });
  }
  function discover(s) { const gm = gmem(); if (gm.discovered.includes(s.id)) return; gm.discovered.push(s.id); if (!gm.seen.includes(s.id)) gm.seen.push(s.id); save(); host.toast(`📍 ${s.name}. ${s.blurb || ""} (Grenshol will remember you liked it.)`); }
  function cleanupGlimpse() { if (!G.active) return; G.active = null; G.tour = null; for (let n = walkable.length - 1; n >= 0; n--) if (walkable[n].chunk === "glimpse") walkable.splice(n, 1); host.setFreeze(false); gbar.hidden = true; }
  let lastReturn = null;
  function leaveGlimpse() { if (!G.active || host.state().warp) return; const S = pick(sections), was = G.active;
    host.threadWarp({ swap: () => { cleanupGlimpse(); audio.setMood("annex"); const sp = dropIn(S, false); lastReturn = { from: was, to: S.id, at: Date.now() }; crHide(); place(sp, fill(GLD.returnText || "…and you're back in the Annex: {section}.").replace("{section}", S.name)); } }); }
  function tickGlimpse(dt, ts) {
    const W = GW; if (!W) return; W.update(dt, ts); if (host.state().warp) return; G.t += dt;
    if (G.active === "tour") { const tp = G.tour; tp.t += dt; const i = tp.segs.findIndex((s) => tp.t >= s.t0 && tp.t < s.t0 + s.d);
      if (i !== tp.idx && i >= 0) { tp.idx = i; const sp = tp.segs[i].v.spot; if (sp) { const gm = gmem(); if (!gm.seen.includes(sp)) { gm.seen.push(sp); save(); } } }
      if (tp.t >= tp.total) leaveGlimpse(); return; }
    if (G.active === "explore") { const p = host.state().pos, left = Math.max(0, Math.ceil(G.dur - G.t));
      W.spots.forEach((s) => { if (Math.hypot(s.wx - p.x, s.wz - p.z) < (W.data.spotRadius || 9)) discover(s); });
      if (left !== G.lastSec) { G.lastSec = left; gbar.hidden = false; gbar.textContent = `🦕 ${W.name} · ${left}s before Grenshol sends you back`; }
      if (!G.warnDone && left <= (W.data.explore?.warn || 10)) { G.warnDone = true; host.toast(fill(GLD.thinText || "The glimpse is thinning…")); }
      if (G.t >= G.dur) leaveGlimpse(); }
  }
  const tmpQ = new THREE.Vector3();
  function render(renderer, cam, mainScene, dt, ts) {
    if (G.active && GW && lens) {
      const U = lens.uniforms; U.uTime.value = ts; const far = cam.far, fov = cam.fov; cam.far = 220;
      if (G.active === "tour" && G.tour) { const tp = G.tour, s = tp.segs[Math.max(0, tp.idx)], v = s.v, k = Math.min(1, Math.max(0, (tp.t - s.t0) / s.d)), O = GW.origin;
        cam.position.set(O.x + v.pos[0] + (v.drift?.[0] || 0) * k, v.pos[1] + (v.drift?.[1] || 0) * k, O.z + v.pos[2] + (v.drift?.[2] || 0) * k);
        tmpQ.set(O.x + v.look[0] + Math.sin(ts * 0.7) * 0.6, v.look[1] + Math.sin(ts * 0.9) * 0.3, O.z + v.look[2]); cam.lookAt(tmpQ); cam.rotation.z += Math.sin(ts * 0.6) * 0.06; cam.fov = 82;
        const into = tp.t - s.t0, out = s.t0 + s.d - tp.t; U.uBlink.value = into < 0.3 ? 0.02 + into / 0.3 : out < 0.22 ? 0.02 + out / 0.22 : 0;
        U.uK.value = 0.55; U.uAb.value = 0.035; U.uWob.value = 0.02; U.uVig.value = 1.15; }
      else { U.uBlink.value = 0; U.uK.value = 0.22; U.uAb.value = 0.012; U.uWob.value = 0.005; U.uVig.value = 0.95; }
      cam.updateProjectionMatrix(); lens.render(renderer, GW.scene, cam, GLD.lensScale || 0.6); cam.far = far; cam.fov = fov; cam.updateProjectionMatrix(); return true; }
    tickTVs(cam, ts);
    if (flipT > 0) { const z = cam.rotation.z, k = Math.min(1, flipT / 1.5); cam.rotation.z = z + Math.PI * k; renderer.render(mainScene, cam); cam.rotation.z = z; return true; }
    return false; }

  (data.entrances || []).forEach(placeEntrance);

  // ---------- demo / test helpers (office3d only exposes these through window.__o3 in localhost demo mode) ----------
  const epOf = (i, j) => epochs[sectionOf(i, j).id] || 0;
  function findCell(f = {}) { // spiral out from a section center looking for a cell plan matching f
    const S = secById[f.section] || startSec, [ci, cj] = S.center;
    for (let r = f.minR ?? 1; r <= (f.maxR ?? 8); r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (f.sameSection !== false && sectionOf(i, j) !== S) continue; const pl = planCell(i, j, epOf(i, j));
      if (pl.center || (f.dead != null && !!pl.dead !== f.dead)) continue;
      if (f.grab) { const rm = pl.rooms.find((q) => q.grab && (f.grab === true || q.grab === f.grab)); if (rm) return { i, j, qi: rm.qi, grab: rm.grab }; continue; }
      if (f.npc) { const rm = pl.rooms.find((q) => q.npc); if (rm) return { i, j, qi: rm.qi, npc: rm.npc }; continue; }
      if (f.stair) { const rm = pl.rooms.find((q) => q.stair && (f.stair === true || q.stair === f.stair)); if (rm) return { i, j, qi: rm.qi, stair: rm.stair }; continue; }
      if (f.tv) { const rm = pl.rooms.find((q) => q.tv); if (rm) return { i, j, qi: rm.qi, type: rm.type }; continue; }
      if (f.sw) { const rm = pl.rooms.find((q) => q.sw); if (rm) return { i, j, qi: rm.qi }; continue; }
      if (f.arms && DIRS.filter((d) => pl.arms[d]).length < f.arms) continue;
      if (f.armDir && !pl.arms[f.armDir]) continue;
      return { i, j }; }
    return null; }
  const planSummary = (pl) => ({ i: pl.i, j: pl.j, section: pl.S.id, dead: !!pl.dead, center: pl.center, arms: pl.arms, blk: pl.blk, ep: pl.ep,
    rooms: pl.rooms.map((r) => ({ qi: r.qi, type: r.type, grab: r.grab, npc: r.npc, curio: r.curio, stair: r.stair, tv: r.tv, sw: r.sw, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, door: r.door })) });
  const debug = {
    state: () => { const h = inAnnexNow ? here() : null; return { prog: JSON.parse(JSON.stringify(prog)), audio: audio.state(), timeIn, epochs: { ...epochs },
      cell: h && { i: h.i, j: h.j, section: h.S.id, dead: !!h.dead },
      stats: { loaded: chunks.size, built: stats.built, roomsBuilt: stats.roomsBuilt, roomsSeen: stats.roomsSeen.size, cellsSeen: stats.cellsSeen.size, walkRects: walkable.filter((r) => r.chunk).length,
        roomsLoaded: [...chunks.values()].reduce((a, c) => a + c.pl.rooms.length, 0), meshes: (() => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; })() },
      npcs: [...chunks.values()].flatMap((ch) => ch.npcs.map((n) => ({ id: n.d.id, quirk: n.d.quirk, cell: ch.key, zone: n.zone, ...W3(ch.lx + n.g.position.x, 0, ch.lz + n.g.position.z) }))),
      grabbers: [...chunks.values()].flatMap((ch) => ch.grabbers.map((g) => ({ type: g.type, state: g.state, cell: ch.key, zone: g.zone, ...W3(ch.lx + g.g.position.x, 0, ch.lz + g.g.position.z) }))),
      entrances: officeEntrances.map((e) => ({ id: e.e.id, x: e.wp.x, y: e.wp.y, z: e.wp.z, nx: e.nrm.x, nz: e.nrm.z, sx: e.stand.x, sz: e.stand.z })),
      lastGrab, lastMisfire, lastShift, lastFizzle,
      creature: { name: CRD?.name, st: cr.st, visible: cr.g.visible, count: cr.count, timer: +cr.timer.toFixed(2), ...W3(cr.x, 0, cr.z) }, lastCatch, lastCaught, lastPossess, lastStair, lastReturn, flipT: +flipT.toFixed(2), loops,
      alive: { on: alive.on, t: +alive.t.toFixed(1), section: alive.section, by: alive.by, count: alive.count },
      glimpse: { active: G.active, spot: G.spot, t: +G.t.toFixed(2), ready: !!(gwMod && gwData), built: !!GW, tour: G.tour && { idx: G.tour.idx, n: G.tour.segs.length, total: +G.tour.total.toFixed(2), durs: G.tour.segs.map((q) => +q.d.toFixed(2)) }, mem: JSON.parse(JSON.stringify(gmem())) },
      flitters: flit.filter((f) => f.st !== "off").length, possessed: allNpcs().filter((n) => n.poss).length,
      tvs: tvList().map((t) => ({ name: t.name, cap: t.cap, frames: t.frames, visible: t.visible, cell: t.cell, x: t.wp.x, y: t.wp.y, z: t.wp.z })) }; },
    plan: (i, j) => planSummary(planCell(i, j, epOf(i, j))),
    scan: (r = 3, ci = startSec.center[0], cj = startSec.center[1]) => { const out = { cells: 0, rooms: 0, grabbers: 0, npcs: [], sections: {} };
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const pl = planCell(i, j, epOf(i, j)); out.cells++; out.sections[pl.S.id] = (out.sections[pl.S.id] || 0) + 1;
        pl.rooms.forEach((rm) => { out.rooms++; if (rm.grab) out.grabbers++; if (rm.npc) out.npcs.push({ i, j, npc: rm.npc, depth: +depthOf(i, j).toFixed(2) }); }); }
      return out; },
    findCell, sectionOf: (i, j) => sectionOf(i, j).id, cellOf: (x, z) => cellOf(x - AX, z - AZ),
    outsideRooms: () => { let n = 0; chunks.forEach((ch) => ch.grabbers.forEach((g) => { const gp = g.g.position; if (!(gp.x >= g.rect.x0 - 0.01 && gp.x <= g.rect.x1 + 0.01 && gp.z >= g.rect.z0 - 0.01 && gp.z <= g.rect.z1 + 0.01)) n++; })); return n; },
    gotoCell: (i, j, where = "hub", yaw = 0) => { if (where === "hub") { place(hubSpawn(i, j, yaw)); return true; } const rm = planCell(i, j, epOf(i, j)).rooms.find((q) => q.qi === where);
      if (!rm) return false; place({ x: i * C + (rm.x0 + rm.x1) / 2, z: j * C + (rm.z0 + rm.z1) / 2, yaw }); return true; },
    stone: (id) => { const d = stoneById[id]; if (!d) return null; if (d.sec) return W3(d.sec.center[0] * C + C2, 0, d.sec.center[1] * C + C2); return W3(d.x, d.y || 0, d.z); },
    spawn: (id) => { const s = resolveSpawn(id) || stoneById[id]?.spawnFn(); return s && { ...W3(s.x, s.y || 0, s.z), yaw: s.yaw, pitch: s.pitch }; },
    curio: (id) => { const c = curioDefs.find((q) => q.id === id); if (!c) return null; const rm = planCell(c.i, c.j, epOf(c.i, c.j)).rooms.find((q) => q.curio === id); if (!rm) return null;
      return { ...W3(c.i * C + (rm.sx > 0 ? rm.x1 - 0.7 : rm.x0 + 0.7), 0, c.j * C + (rm.sz > 0 ? rm.z1 - 0.7 : rm.z0 + 0.7)), i: c.i, j: c.j, qi: c.qi }; },
    exitAt: (id) => { const x = (data.exits || []).find((q) => q.id === id), S = x && secById[x.section]; if (!S) return null; const pr = { x0: PM, x1: C - PM, z0: PM, z1: C - PM };
      const sp = wallSpot(pr, x.wall || "n", C2 + (x.offset ?? 2.4), 0), back = { n: [0, -1.2, Math.PI], s: [0, 1.2, 0], e: [-1.2, 0, -Math.PI / 2], w: [1.2, 0, Math.PI / 2] }[x.wall || "n"];
      return { ...W3(S.center[0] * C + sp.x + back[0], 0, S.center[1] * C + sp.z + back[1]), yaw: back[2] }; },
    arrive: (spawnId) => arrive(resolveSpawn(spawnId), spawnId, null),
    goto: (spawnId) => place(resolveSpawn(spawnId) || stoneById[spawnId]?.spawnFn()),
    gotoLocal: (x, z, yaw = 0, y = 0, pitch = 0) => place({ x, z, yaw, y, pitch }),
    home: useHome, shift: (id) => { const S = secById[id]; if (S) startShift(S); }, epoch: (id) => epochs[id],
    blockedLocal, misfireNext: (v = true) => { forceMisfire = v; }, lastMisfire: () => lastMisfire, lastGrab: () => lastGrab, cell: C,
    calm: (v = true) => { calm = !!v; if (calm) crHide(); }, creatureOK: (i, j) => creatureOK(i, j),
    creatureScan: (r = 14) => { const out = { ok: 0, bySection: {}, minDepth: 99, start: 0 }; for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (creatureOK(i, j)) { const S = sectionOf(i, j).id; out.ok++; out.bySection[S] = (out.bySection[S] || 0) + 1; out.minDepth = Math.min(out.minDepth, +depthOf(i, j).toFixed(2)); if (S === startSec.id) out.start++; } return out; },
    summon: (opt = {}) => { cr.timer = 0; const ok = crSpawn(lastP, opt); return ok && { st: cr.st, ...W3(cr.x, 0, cr.z) }; },
    creaturePut: (x, z, st = "sneak") => { crShow(x - AX, z - AZ, lastP); cr.st = st; cr.t = st === "frozen" ? (CRD?.freezeSeconds ?? 2.6) : 3; return true; },
    creatureTimer: (t) => { cr.timer = t; }, freezeLonger: (t) => { cr.t = t; },
    possess: (secs) => { const n = allNpcs().sort((a, b) => { const A = npcWorld(a), B = npcWorld(b); return Math.hypot(A.x - lastP.x, A.z - lastP.z) - Math.hypot(B.x - lastP.x, B.z - lastP.z); })[0]; if (!n) return null; possess(n, secs); return { id: n.d.id, ...W3(npcWorld(n).x, 0, npcWorld(n).z) }; },
    sendFlitter: () => sendFlitter(), npcInfo: () => allNpcs().map((n) => ({ id: n.d.id, poss: !!n.poss, homing: !!n.homing, eyes: !!n.peyes?.[0]?.visible, mat: n.body.children[2]?.material?.color?.getHexString(), ...W3(npcWorld(n).x, 0, npcWorld(n).z) })),
    alive: (v = true, by = "test") => (v ? startAlive(by) : endAlive()), aliveTime: (t) => { alive.t = t; }, twitchSample: () => { const out = []; chunks.forEach((ch) => ch.twitch.slice(0, 40).forEach((o) => out.push(+(o.rotation.y - o.userData.ry0).toFixed(3) + +(o.rotation.z - o.userData.rz0).toFixed(3)))); return out; },
    lightK: () => { let v = null; allLightMats((M) => { if (v == null) v = +(M.light.emissiveIntensity / M.lightBase).toFixed(3); }); return v; },
    glimpse: (kind = "tour", spot = null) => enterGlimpse(kind, spot), glimpseEnd: () => leaveGlimpse(), glimpseTime: (t) => { if (G.active === "explore") G.dur = G.t + t; else if (G.tour) G.tour.t = G.tour.total - t; },
    glimpseInfo: () => GW && { name: GW.name, spots: GW.spots.map((s) => ({ id: s.id, x: s.wx, z: s.wz })), stats: GW.stats(), dinos: GW.dinoInfo() }, glimpseLoaded: () => gwReady.then(() => !!(gwMod && gwData)),
    stairAt: (i, j, qi) => { const ch = chunks.get(ck(i, j)); const st = ch?.stairs.find((q) => q.rm.qi === qi); return st && { ...W3(st.lx, 0, st.lz), yaw: st.yaw, kind: st.kind }; },
    stairForce: (v) => { STD.otherSectionChance = v; },
    tvAt: (i, j, qi) => { const tv = tvList().find((t) => t.cell === ck(i, j) && t.qi === qi); return tv && { x: tv.wp.x, y: tv.wp.y, z: tv.wp.z, frames: tv.frames, name: tv.name }; },
    switchAt: (i, j, qi) => { const sw = chunks.get(ck(i, j))?.switches.find((q) => q.rm.qi === qi); return sw && { ...W3(sw.lx, 0, sw.lz) }; },
    reset: () => { prog = { waystones: {}, curiosities: [], flags: {}, glimpse: {} }; save(); chunks.forEach((ch) => { ch.stones.forEach(refreshStone); ch.curios.forEach((c) => (c.g.visible = true)); }); if (ovStone) refreshStone(ovStone); refreshSeals(); },
  };
  return { near, clickTargets, update, render, blockedAt: (x, z) => (G.active && GW ? GW.blockedLocal(x - GW.origin.x, z - GW.origin.z) : blockedLocal(x - AX, z - AZ)), hudButtons, atmos, roomLabel, exitHome: () => exitHome(null, null), muteBtn, debug, audio };
}
