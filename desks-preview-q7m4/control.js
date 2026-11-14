// Elsewhere Annex v5: the hidden Control Room + live map + teammates in the world + parties at portals (Eclectic Transformation · Gremlin Desks only).
// The Control Room door is only BUILT for a player the database confirms is an admin (annex-net.js -> public.annex_whoami()).
// Inside: live map with a dot per player, spawn-in-front (admin-write-only Realtime channel "annex-gm"), the combat sandbox,
// movable props, and a viewing booth that shows a miniature copy of any cell you can turn, tilt, flip upside down or lift the roof off.
// Everything in the room is sandboxed like the Training Closet (instances.control.training = true): nothing you do in here is kept.
import { createNet } from "./annex-net.js";
import { createChat } from "./annex-chat.js";
export function createControl(ctx) {
  const { THREE, root, host, el, rpg, OV, overlookSpots, box, mat, cplane, plate, canvasTex, planeGeo, C, C2, HW, AX, AZ, sections, sectionOf, startSec, chunks, boothCell, audio } = ctx;
  const isLocal = (() => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch { return false; } })();
  const net = createNet({ sb: host.sb, me: host.me, demo: host.demo, isLocal });
  let D = null; rpg.ready.then((ok) => { if (ok) D = rpg.data(); });
  const chat = createChat({ net, host, el, rpg, demo: host.demo, sb: host.sb, me: host.me, D: () => D, inControl: () => rpg.instId() === "control" });
  const CFG = () => D?.control || {};
  const T = { door: null, room: null, props: [], booth: null, pin: null, outPos: { x: startSec.center[0] * C + C2, z: startSec.center[1] * C + C2, y: 0 }, portal: null, portalAt: null, carry: null, flashes: [], dots: [], figs: new Map(), inAnnex: false, partyRefresh: null, invites: [], mapT: 0 };
  const hashCol = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360},65%,55%)`; };
  const instName = (id) => D?.instances?.[id]?.short || D?.instances?.[id]?.name || id;
  const cellOfL = (x, z) => [Math.floor(x / C), Math.floor(z / C)];

  // ---------- admin check -> build the hidden door (never built for anyone else) ----------
  net.checkAdmin().then((a) => { if (a) rpg.ready.then(() => buildDoor()); });
  function buildDoor() { if (T.door || !OV) return; const x = OV.x1 - 0.14, z = OV.z1 - 2.4, y = OV.y, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -Math.PI / 2; root.add(g);
    const steel = mat("#3a4a5a", { metalness: 0.6, roughness: 0.4 }), dark = mat("#1a222c");
    box(0, 1.05, -0.03, 1.1, 2.1, 0.05, steel, g); box(0, 2.14, -0.02, 1.25, 0.08, 0.07, dark, g); box(-0.6, 1.05, -0.02, 0.06, 2.1, 0.07, dark, g); box(0.6, 1.05, -0.02, 0.06, 2.1, 0.07, dark, g);
    box(0.38, 1.15, 0.01, 0.16, 0.22, 0.03, mat("#2aa8ff", { emissive: "#2aa8ff", emissiveIntensity: 1.1 }), g); // keypad glow
    const D0 = CFG().door || { sign: "CONTROL ROOM", signSub: "staff only" };
    cplane(plate(D0.sign, D0.signSub, { w: 720, h: 220, bg: "#1f2a36", fg: "#e8f4ff", accent: "#2aa8ff" }), 1.15, 0.35, 0, 2.45, 0.04, 0, g);
    T.door = { g, lx: x, lz: z, y, spawn: { x: x - 1.1, z, y, yaw: Math.atan2(-1, 0) } };
    overlookSpots.push({ key: "control", x: x - 0.8, z, y, label: () => (CFG().door?.label || "🛰 The Control Room (admin)"), run: openDoor }); }
  function openDoor() { if (!net.isAdmin()) return; if (!rpg.transformed()) { host.toast("🛰 The keypad blinks: become your Annex self in the circle first."); return; }
    audio.sfx("zip"); return rpg.enterInstance({ pp: { id: "ctl-door", instance: "control" }, i: startSec.center[0], j: startSec.center[1], spawn: T.door.spawn }); }

  // ---------- building the room (called by rpg.js buildInstance for instances.control) ----------
  const mapCanvas = document.createElement("canvas"); mapCanvas.width = 1024; mapCanvas.height = 512; const mapTex = new THREE.CanvasTexture(mapCanvas); mapTex.colorSpace = THREE.SRGBColorSpace;
  function buildControl(g, s, inst) { const IX = g.position.x, IZ = g.position.z;
    const scr = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: mapTex })); scr.scale.set(6.4, 3.2, 1); scr.position.set(s / 2, 1.75, 0.16); g.add(scr);
    box(s / 2, 1.75, 0.13, 6.6, 3.4, 0.04, mat("#0b1118"), g);
    cplane(plate("CONTROL ROOM", "please do not flip the Annex (much)", { w: 900, h: 200, bg: "#1f2a36", fg: "#e8f4ff", accent: "#2aa8ff" }), 2.6, 0.58, s / 2, 2.72, 0.2, 0, g);
    // control desk
    box(s / 2, 0.45, 9.6, 3.2, 0.9, 0.8, mat("#2c3a4a", { metalness: 0.4 }), g); box(s / 2, 0.92, 9.45, 3.0, 0.04, 0.5, mat("#3fd8a8", { emissive: "#3fd8a8", emissiveIntensity: 0.5 }), g);
    [-1, 0, 1].forEach((k) => box(s / 2 + k * 0.9, 1.25, 9.85, 0.7, 0.45, 0.04, mat("#2aa8ff", { emissive: "#2aa8ff", emissiveIntensity: 0.7 }), g));
    const big = box(s / 2 + 1.4, 1.0, 9.3, 0.18, 0.12, 0.18, mat("#d8452e", { emissive: "#ff3a1a", emissiveIntensity: 0.8 }), g); // the big switch
    inst.extras.push({ key: "desk", lx: IX + s / 2, lz: IZ + 10.4, label: () => "🛰 Control desk (map · spawn · sandbox · move · booth)", run: () => openDesk("map") });
    // viewing booth
    box(2.6, 0.35, 6, 2.5, 0.7, 2.5, mat("#2c3a4a", { metalness: 0.4 }), g);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 2.5), new THREE.MeshStandardMaterial({ color: "#a8d8ff", transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false })); glass.position.set(2.6, 1.95, 6); g.add(glass);
    const pivot = new THREE.Group(); pivot.position.set(2.6, 1.95, 6); g.add(pivot);
    cplane(plate("VIEWING BOOTH", "turn · tilt · flip · lift the roof", { w: 720, h: 200, bg: "#1f2a36", fg: "#e8f4ff", accent: "#b48cff" }), 1.6, 0.44, 2.6, 0.42, 7.27, 0, g);
    inst.extras.push({ key: "booth", lx: IX + 4.3, lz: IZ + 6, label: () => "🔭 Viewing booth", run: () => openDesk("booth") });
    // movable props
    T.props = (CFG().props || []).map((pr) => { const pg = new THREE.Group(); pg.position.set(pr.x, 0, pr.z); g.add(pg); const m = mat(pr.color);
      if (pr.kind === "cone") { const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 12), m); c.position.y = 0.35; pg.add(c); }
      else if (pr.kind === "blob") { const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), m); b.scale.y = 0.6; b.position.y = 0.27; pg.add(b); }
      else if (pr.kind === "cutout") { box(0, 0.9, 0, 0.7, 1.8, 0.04, m, pg); box(-0.15, 1.45, 0.03, 0.1, 0.1, 0.01, mat("#111"), pg); box(0.15, 1.45, 0.03, 0.1, 0.1, 0.01, mat("#111"), pg); }
      else box(0, 0.3, 0, 0.6, 0.6, 0.6, m, pg);
      return { id: pr.id, name: pr.name, g: pg, home: [pr.x, pr.z] }; });
    T.room = { g, IX, IZ, s, pivot, big, scr }; T.booth = { pivot, inner: null, ch: null, cell: null, yaw: 0, tilt: 0, flipped: false, roof: false, spin: false, beacons: [] };
    loadBooth(startSec.center[0], startSec.center[1]); }

  // ---------- viewing booth ----------
  function loadBooth(i, j) { const B = T.booth; if (!B) return false; if (B.inner) { B.pivot.remove(B.inner); B.ch?.disp?.forEach((m) => m.dispose?.()); }
    const ch = boothCell(i, j), inner = new THREE.Group(), k = 1.9 / C; ch.g.position.set(-C2, -1.5, -C2); inner.add(ch.g); inner.scale.setScalar(k); B.pivot.add(inner);
    B.inner = inner; B.ch = ch; B.cell = [i, j]; B.beacons = []; applyBooth(); return true; }
  function applyBooth() { const B = T.booth; if (!B?.inner) return; B.pivot.rotation.set(B.tilt + (B.flipped ? Math.PI : 0), B.yaw, 0, "YXZ");
    B.ch.g.traverse((o) => { if (!o.isMesh) return; let y = o.position.y, q = o.parent; while (q && q !== B.ch.g) { y += q.position.y; q = q.parent; } o.visible = !(B.roof && y > 2.6); }); }
  const boothOp = (op) => { const B = T.booth; if (!B) return null; if (op === "left") B.yaw += Math.PI / 4; else if (op === "right") B.yaw -= Math.PI / 4; else if (op === "tilt") B.tilt = (B.tilt + Math.PI / 6) % (Math.PI * 2);
    else if (op === "flip") B.flipped = !B.flipped; else if (op === "roof") B.roof = !B.roof; else if (op === "spin") B.spin = !B.spin; else if (op === "reset") { B.yaw = 0; B.tilt = 0; B.flipped = false; B.roof = false; B.spin = false; }
    applyBooth(); audio.sfx("click"); return boothState(); };
  const boothState = () => { const B = T.booth; return B && { cell: B.cell, yaw: +B.yaw.toFixed(3), tilt: +B.tilt.toFixed(3), flipped: B.flipped, roof: B.roof, spin: B.spin, rotX: +B.pivot.rotation.x.toFixed(3), beacons: B.beacons.length,
    hidden: (() => { let n = 0; B.ch?.g.traverse((o) => { if (o.isMesh && !o.visible) n++; }); return n; })() }; };
  function lookIntoBooth() { if (!T.room) return false; host.placeAnnex({ x: AX + T.room.IX + 2.6, z: AZ + T.room.IZ + 10.2, y: 0, yaw: 0, pitch: -0.22 }); return true; }

  // ---------- props ----------
  function moveProp(id, op) { const pr = T.props.find((q) => q.id === id); if (!pr) return null; const p = pr.g.position, st = 0.5;
    if (op === "w") p.x -= st; else if (op === "e") p.x += st; else if (op === "n") p.z -= st; else if (op === "s") p.z += st; else if (op === "rl") pr.g.rotation.y += Math.PI / 12; else if (op === "rr") pr.g.rotation.y -= Math.PI / 12;
    else if (op === "up") p.y = Math.min(2.4, p.y + 0.3); else if (op === "down") p.y = Math.max(0, p.y - 0.3); else if (op === "flip") pr.g.rotation.x = pr.g.rotation.x ? 0 : Math.PI;
    else if (op === "bring") { const lp = rpg.lastPos(), yaw = host.state().yaw; p.x = lp.x - T.room.IX - Math.sin(yaw) * 1.6; p.z = lp.z - T.room.IZ - Math.cos(yaw) * 1.6; }
    else if (op === "carry") T.carry = T.carry === id ? null : id; else if (op === "home") { p.set(pr.home[0], 0, pr.home[1]); pr.g.rotation.set(0, 0, 0); }
    if (T.room) { p.x = Math.max(0.6, Math.min(T.room.s - 0.6, p.x)); p.z = Math.max(0.6, Math.min(T.room.s - 0.6, p.z)); }
    return { id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ry: +pr.g.rotation.y.toFixed(3), rx: +pr.g.rotation.x.toFixed(3), carrying: T.carry === id }; }

  // ---------- who's where ----------
  function me() { return { id: net.N.selfId, name: "You", x: T.outPos.x, z: T.outPos.z, y: T.outPos.y || 0, inst: null, me: true, inControl: rpg.isControl?.() }; }
  function everyone() { return [me(), ...[...net.players().values()]]; }
  const where = (p) => { if (p.inst) return `inside ${instName(p.inst)}`; if ((p.y || 0) > 3 && OV && p.x > OV.x0 - 1 && p.x < OV.x1 + 1 && p.z > OV.z0 - 1 && p.z < OV.z1 + 1) return "the Overlook"; const [i, j] = cellOfL(p.x, p.z); return `${sectionOf(i, j).name} · cell ${i},${j}`; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const cells = (a, b) => { const [ai, aj] = cellOfL(a.x, a.z), [bi, bj] = cellOfL(b.x, b.z); return Math.abs(ai - bi) + Math.abs(aj - bj); };

  // ---------- the live map (wall screen + desk panel share one drawing) ----------
  function drawMap(cv, opt = {}) { const c = cv.getContext("2d"), w = cv.width, h = cv.height, all = everyone(), out = all.filter((p) => !p.inst);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; const grow = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    out.forEach((p) => grow(p.x, p.z)); grow(startSec.center[0] * C + C2, startSec.center[1] * C + C2); if (T.pin) grow(T.pin.x, T.pin.z);
    const pad = C * 0.75; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad; const minSpan = C * 3; if (x1 - x0 < minSpan) { const m = (x0 + x1) / 2; x0 = m - minSpan / 2; x1 = m + minSpan / 2; } if (z1 - z0 < minSpan * h / w) { const m = (z0 + z1) / 2; z0 = m - minSpan * h / w / 2; z1 = m + minSpan * h / w / 2; }
    const k = Math.min((w - 20) / (x1 - x0), (h - 40) / (z1 - z0)), ox = (w - (x1 - x0) * k) / 2 - x0 * k, oz = 30 + (h - 40 - (z1 - z0) * k) / 2 - z0 * k, X = (x) => ox + x * k, Z = (z) => oz + z * k;
    c.fillStyle = "#0e1822"; c.fillRect(0, 0, w, h);
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const S = sectionOf(i, j), isC = S.center[0] === i && S.center[1] === j;
      c.fillStyle = (S.crystal?.color || "#6a8a9a") + (isC ? "55" : "26"); c.fillRect(X(i * C) + 1, Z(j * C) + 1, C * k - 2, C * k - 2);
      c.strokeStyle = "rgba(200,230,255,.35)"; c.lineWidth = Math.max(2, HW * 2 * k * 0.6); c.beginPath(); c.moveTo(X(i * C + C2), Z(j * C)); c.lineTo(X(i * C + C2), Z(j * C + C)); c.moveTo(X(i * C), Z(j * C + C2)); c.lineTo(X(i * C + C), Z(j * C + C2)); c.stroke();
      if (isC) { c.fillStyle = "#e8f4ff"; c.font = `bold ${Math.max(11, Math.round(k * 2.2))}px system-ui`; c.textAlign = "center"; c.fillText(S.name.replace(/^The /, ""), X(i * C + C2), Z(j * C + 3)); } }
    if (OV) { c.strokeStyle = "#b48cff"; c.setLineDash([5, 4]); c.lineWidth = 2; c.strokeRect(X(OV.x0), Z(OV.z0), (OV.x1 - OV.x0) * k, (OV.z1 - OV.z0) * k); c.setLineDash([]); }
    const now = Date.now(); T.flashes = T.flashes.filter((f) => now - f.at < 3500);
    T.flashes.forEach((f) => { const p = all.find((q) => q.id === f.to); if (!p || p.inst) return; const r = 8 + ((now - f.at) / 3500) * 30; c.strokeStyle = `rgba(255,90,58,${1 - (now - f.at) / 3500})`; c.lineWidth = 4; c.beginPath(); c.arc(X(p.x), Z(p.z), r, 0, 7); c.stroke(); });
    if (T.pin) { c.strokeStyle = "#ff5a3a"; c.lineWidth = 3; const px = X(T.pin.x), pz = Z(T.pin.z); c.beginPath(); c.moveTo(px - 7, pz - 7); c.lineTo(px + 7, pz + 7); c.moveTo(px + 7, pz - 7); c.lineTo(px - 7, pz + 7); c.stroke(); }
    const dots = []; out.forEach((p) => { const dx = X(p.x), dz = Z(p.z); c.fillStyle = p.me ? "#f3d98b" : hashCol(p.id); c.beginPath(); c.arc(dx, dz, p.me ? 9 : 8, 0, 7); c.fill(); c.strokeStyle = "#0e1822"; c.lineWidth = 2; c.stroke();
      c.fillStyle = "#ffffff"; c.font = `bold ${opt.big ? 22 : 13}px system-ui`; c.textAlign = "left"; c.fillText(p.me ? (p.inControl ? "You (Control Room)" : "You") : p.name, dx + 11, dz + 4); dots.push({ id: p.id, name: p.me ? "You" : p.name, cx: Math.round(dx), cz: Math.round(dz) }); });
    c.fillStyle = "rgba(14,24,34,.85)"; c.fillRect(0, 0, w, 26); c.fillStyle = "#e8f4ff"; c.font = `bold ${opt.big ? 18 : 13}px system-ui`; c.textAlign = "left";
    const inside = all.filter((p) => p.inst).map((p) => `${p.name} (${instName(p.inst)})`);
    c.fillText(`👥 ${all.length - 1} teammate${all.length === 2 ? "" : "s"} in the Annex · ${net.status()}${inside.length ? " · inside: " + inside.join(", ") : ""}`, 8, 18);
    cv._map = { X, Z, k, ox, oz }; if (opt.keep) T.dots = dots; return dots; }
  const mapToWorld = (cv, cx, cz) => { const m = cv._map; return m && { x: (cx - m.ox) / m.k, z: (cz - m.oz) / m.k }; };

  // ---------- the desk panel ----------
  let deskTab = "map", deskTimer = 0;
  function openDesk(tab) { if (!net.isAdmin()) return; deskTab = tab || deskTab; clearInterval(deskTimer);
    host.openPanel("🛰 Control desk", (pn) => { pn.dataset.rpgPanel = "control"; pn.dataset.tab = deskTab;
      const tabs = el("div", "o3-prompts o3-ctltabs"); [["map", "🗺 Map"], ["chat", "💬 Chat & mute"], ["spawn", "🎭 Spawn in front"], ["sandbox", "🧪 Sandbox"], ["move", "📦 Move things"], ["booth", "🔭 Viewing booth"]].forEach(([k, t]) => {
        const b = el("button", "o3-btn ghost small" + (k === deskTab ? " on" : ""), t); b.dataset.ctl = "tab-" + k; b.onclick = () => openDesk(k); tabs.appendChild(b); }); pn.appendChild(tabs);
      const body = el("div", "o3-ctlbody"); pn.appendChild(body); TABS[deskTab](body); }, { wide: true, onClose: () => clearInterval(deskTimer) }); }
  const btn = (t, id, fn, cls = "o3-btn ghost small") => { const b = el("button", cls, t); b.dataset.ctl = id; b.onclick = fn; return b; };
  const sel = (opts, id) => { const s = el("select"); s.dataset.ctl = id; opts.forEach(([v, t]) => { const o = el("option", null, t); o.value = v; s.appendChild(o); }); return s; };
  const row = (pn, lab, ...kids) => { const r = el("div", "o3-sbrow"); r.appendChild(el("b", null, lab)); kids.forEach((k) => r.appendChild(k)); pn.appendChild(r); return r; };
  const TABS = {
    map: (pn) => { const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360; cv.className = "o3-ctlmap"; cv.dataset.ctl = "map"; pn.appendChild(cv);
      pn.appendChild(el("p", "o3-small", "Click the map to drop a pin; distances update live. Dots are teammates out in the Annex; people inside instances are listed at the top."));
      const tb = el("div", "o3-ctllist"); tb.dataset.ctl = "list"; pn.appendChild(tb);
      const draw = () => { if (!cv.isConnected) { clearInterval(deskTimer); return; } drawMap(cv, { keep: true }); const all = everyone(), mine = me(); tb.textContent = "";
        all.forEach((p) => { const r = el("div", "o3-ctlrow"); r.dataset.player = p.id; r.style.borderLeft = "6px solid " + (p.me ? "#f3d98b" : hashCol(p.id));
          r.appendChild(el("b", null, p.me ? "You" : p.name)); r.appendChild(el("span", null, where(p)));
          if (!p.me) r.appendChild(el("span", "o3-small", p.inst ? "—" : `${dist(p, mine).toFixed(0)} m · ${cells(p, mine)} cell${cells(p, mine) === 1 ? "" : "s"} from you`));
          if (T.pin && !p.inst) r.appendChild(el("span", "o3-small", `${dist(p, T.pin).toFixed(0)} m from 📍`)); tb.appendChild(r); });
        const others = all.filter((p) => !p.me && !p.inst); if (others.length > 1) { const pr = el("div", "o3-small"); pr.dataset.ctl = "pairs"; pr.textContent = "Between them: " + others.flatMap((a, q) => others.slice(q + 1).map((b) => `${a.name}↔${b.name} ${dist(a, b).toFixed(0)} m`)).join(" · "); tb.appendChild(pr); } };
      cv.onclick = (e) => { const r = cv.getBoundingClientRect(), w = mapToWorld(cv, (e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height); if (w) { T.pin = w; draw(); } };
      draw(); deskTimer = setInterval(draw, 300); },
    chat: (pn) => { const lc = el("input"); lc.type = "checkbox"; lc.dataset.ctl = "chat-listen"; lc.checked = chat.listenAll(); lc.onchange = () => chat.listenAll(lc.checked);
      const lab = el("label", "o3-small"); lab.appendChild(lc); lab.appendChild(document.createTextNode(" 👂 Hear every room from in here (admin only; lines you overhear are marked 👂)")); pn.appendChild(lab);
      const tb = el("div", "o3-ctllist"); tb.dataset.ctl = "mute-list"; pn.appendChild(tb); const out = el("p", "o3-small", ""); out.dataset.ctl = "mute-out";
      const drawM = () => { tb.textContent = ""; everyone().filter((p) => !p.me).forEach((p) => { const r = el("div", "o3-ctlrow"); r.dataset.player = p.id; r.appendChild(el("b", null, p.name)); r.appendChild(el("span", "o3-small", where(p)));
        const mu = host.demo ? chat.debug.demoMuted(p.id) : false; if (mu) r.appendChild(el("span", "o3-small", "🔇 muted"));
        r.appendChild(btn("🔇 Mute 10 min", "mute-" + p.id, async () => { const x = await chat.mute(p.id, 10); out.textContent = x.ok ? `${p.name} muted for 10 minutes ✓` : "Not muted: " + (x.error || x.status); drawM(); }));
        r.appendChild(btn("🔈 Unmute", "unmute-" + p.id, async () => { const x = await chat.mute(p.id, 0); out.textContent = x.ok ? `${p.name} can talk again ✓` : "Not changed: " + (x.error || x.status); drawM(); })); tb.appendChild(r); }); };
      drawM(); pn.appendChild(out);
      const lg = el("div", "o3-ctllist"); lg.dataset.ctl = "chat-log"; pn.appendChild(el("b", null, "Recent chat (this session" + (host.demo ? ", demo" : "; the full log is the annex_chat_recent() table") + ")")); pn.appendChild(lg);
      const drawL = () => { if (!lg.isConnected) { clearInterval(deskTimer); return; } lg.textContent = ""; chat.recent().slice(-14).forEach((l) => lg.appendChild(el("div", "o3-small", `${l.over ? "👂 " : ""}[${l.scope || "·"}] ${l.me ? "You" : l.name || ""}${l.name || l.me ? ": " : ""}${l.text}`))); };
      if (!host.demo && host.sb) host.sb.rpc("annex_chat_recent", { p_limit: 30 }).then(({ data }) => { if (Array.isArray(data) && data.length && lg.isConnected) { lg.textContent = ""; data.reverse().forEach((r) => lg.appendChild(el("div", "o3-small", `[${r.scope}] ${r.name}: ${r.kind === "voice" ? "🎙 voice clip" : r.body}`))); } }, () => {});
      else { drawL(); deskTimer = setInterval(drawL, 500); }
      pn.appendChild(el("p", "o3-small", "Mute stops typed chat and voice clips. The server enforces it (annex.chat_mutes in the chat RLS and the voice-clips upload policy); the muted page is also told to rejoin. Clips are never stored for long.")); },
    spawn: (pn) => { const all = everyone(); const tg = sel(all.map((p) => [p.id, p.me ? "Me" : `${p.name} (${where(p)})`]), "sp-target");
      const kinds = [...Object.entries(D.enemies).map(([k, e]) => [k, `${e.icon} ${e.name} (lvl ${e.level || 1})`]), ...Object.entries(D.instances).filter(([, I]) => I.boss).map(([id, I]) => ["boss:" + id, `${I.boss.icon} ${I.boss.name} (boss)`])];
      const kd = sel(kinds, "sp-kind"), tr = sel([0, 1, 2, 3, 4].map((t) => [t, "tier " + t]), "sp-tier"), stt = el("p", "o3-small", ""); stt.dataset.ctl = "sp-status";
      row(pn, "Who", tg); row(pn, "What", kd, tr);
      row(pn, "", btn("🎭 Drop it right in front of them", "sp-go", async () => { const r = await net.sendGM({ type: "spawn", to: tg.value, kind: kd.value, tier: +tr.value }); stt.textContent = r.ok ? `Sent ✓ (${kd.options[kd.selectedIndex].text} → ${tg.options[tg.selectedIndex].text})` : "Not sent: " + (r.error || r.status); }, "o3-btn"));
      const nt = el("input"); nt.placeholder = "a note from the ceiling…"; nt.maxLength = 140; nt.dataset.ctl = "note-text"; nt.style.width = "16em";
      row(pn, "Note", nt, btn("Send", "note-go", async () => { const text = (nt.value.trim() || (CFG().gmNotes || ["👀"])[Math.floor(Math.random() * (CFG().gmNotes || [1]).length)]).slice(0, 140); const r = await net.sendGM({ type: "note", to: tg.value, text }); stt.textContent = r.ok ? "Note sent ✓" : "Not sent"; }));
      pn.appendChild(stt); pn.appendChild(el("p", "o3-small", "Only an admin can send these: the server only lets an admin with a two-step session write to the game-master channel. Whatever you drop is never saved and doesn't respawn.")); },
    sandbox: (pn) => { pn.appendChild(el("p", null, "The full combat sandbox: spawn any critter or boss at any tier in here, try any gear, set your level (1–25) and stats, fake a party of 1–3, force dice, knock yourself out. Nothing is kept when you leave."));
      pn.appendChild(btn("🧪 Open the combat sandbox", "sb-open", () => rpg.sandboxOpen(), "o3-btn")); },
    move: (pn) => { const ps = sel(T.props.map((p) => [p.id, p.name]), "mv-prop"), out = el("p", "o3-small", ""); out.dataset.ctl = "mv-out"; row(pn, "Thing", ps);
      const op = (o) => () => { const r = moveProp(ps.value, o); out.textContent = r ? `${r.id}: x ${r.x} · y ${r.y} · z ${r.z}${r.carrying ? " · carrying" : ""}` : ""; };
      row(pn, "Slide", btn("◀", "mv-w", op("w")), btn("▲", "mv-n", op("n")), btn("▼", "mv-s", op("s")), btn("▶", "mv-e", op("e")));
      row(pn, "Turn", btn("⟲", "mv-rl", op("rl")), btn("⟳", "mv-rr", op("rr")), btn("Lift", "mv-up", op("up")), btn("Lower", "mv-down", op("down")), btn("Upside down", "mv-flip", op("flip")));
      row(pn, "", btn("Bring it to me", "mv-bring", op("bring")), btn("Carry / drop", "mv-carry", op("carry")), btn("Put it back", "mv-home", op("home"))); pn.appendChild(out); },
    booth: (pn) => { const srcs = [[`${startSec.center[0]},${startSec.center[1]}`, "Start plaza (where the Loose Stitch lets out)"], ...sections.filter((S) => S !== startSec).map((S) => [`${S.center[0]},${S.center[1]}`, `${S.name} plaza`]),
        ...[...net.players().values()].filter((p) => !p.inst).map((p) => { const [i, j] = cellOfL(p.x, p.z); return [`${i},${j}`, `Where ${p.name} is (cell ${i},${j})`]; })];
      const sc = sel(srcs, "bo-src"), out = el("p", "o3-small", ""); out.dataset.ctl = "bo-out"; const show = (s) => { out.textContent = s ? `Cell ${s.cell.join(",")} · turn ${Math.round(s.yaw * 57.3)}° · tilt ${Math.round(s.tilt * 57.3)}°${s.flipped ? " · UPSIDE DOWN" : ""}${s.roof ? " · roof off" : ""}${s.spin ? " · spinning" : ""}` : ""; };
      row(pn, "Look at", sc, btn("Load", "bo-load", () => { const [i, j] = sc.value.split(",").map(Number); loadBooth(i, j); show(boothState()); }));
      row(pn, "Turn", btn("⟲ 45°", "bo-left", () => show(boothOp("left"))), btn("⟳ 45°", "bo-right", () => show(boothOp("right"))), btn("Tilt", "bo-tilt", () => show(boothOp("tilt"))), btn("🙃 Flip upside down", "bo-flip", () => show(boothOp("flip"))));
      row(pn, "", btn("Lift the roof", "bo-roof", () => show(boothOp("roof"))), btn("Spin", "bo-spin", () => show(boothOp("spin"))), btn("Reset", "bo-reset", () => show(boothOp("reset"))), btn("👀 Look into the booth", "bo-look", () => { host.closePanel(); lookIntoBooth(); }));
      pn.appendChild(out); show(boothState()); pn.appendChild(el("p", "o3-small", "The booth is a miniature copy of the cell, so turning it never moves anyone who's really there. Glowing beads = teammates in that cell.")); },
  };

  // ---------- game-master commands arriving for me ----------
  net.on("gm", (p) => { if (p.to) T.flashes.push({ to: p.to, at: Date.now() }); if (p.to !== net.N.selfId) return;
    if (p.type === "spawn") { const id = rpg.gmSpawn(p.kind, p.tier | 0, { by: "The Control Room" }); if (id) host.toast("🎭 Something lands with a thump right in front of you!"); }
    if (p.type === "note") host.toast("✉️ " + String(p.text || "").slice(0, 140)); });

  // ---------- parties (max 3), only at party portals ----------
  function portalParty(pn, p, refresh) { T.portal = p.pp.id; T.portalAt = { x: p.lx, z: p.lz }; T.partyRefresh = refresh;
    const bx = el("div", "o3-party"); bx.dataset.ctl = "party"; pn.appendChild(bx);
    const render = () => { bx.textContent = ""; const P = rpg.party(); bx.appendChild(el("b", null, `Party ${P.members.length}/${P.max}: ` + P.members.map((m) => (m.me ? "you" : m.name)).join(", ")));
      const near = [...net.players().values()].filter((q) => !q.inst && Math.hypot(q.x - p.lx, q.z - p.lz) < 8 && !P.members.some((m) => m.id === q.id));
      if (!near.length) bx.appendChild(el("p", "o3-small", net.status() === "offline" ? "Multiplayer is offline right now, so it's just you." : "Nobody else is standing at this portal right now. Teammates who walk up will show here."));
      near.forEach((q) => { const b = btn(`➕ Invite ${q.name}`, "invite-" + q.id, () => { if (rpg.party().members.length >= P.max) return; net.sendParty({ type: "invite", to: q.id, portal: p.pp.id, party: ensureParty(p) }); b.textContent = `⏳ Asked ${q.name}…`; b.disabled = true; });
        if (P.members.length >= P.max) b.disabled = true; bx.appendChild(b); }); refresh?.(); };
    T.partyRender = render; render(); }
  const ensureParty = (p) => rpg.party().id || (rpg.setParty(`${net.N.selfId}:${p.pp.id}:${Date.now().toString(36)}`, []), rpg.party().id);
  net.on("party", (m) => { const P = rpg.party();
    if (m.type === "accept" && P.id && m.party === P.id && P.members.length < P.max && !P.members.some((q) => q.id === m.from)) { rpg.setParty(P.id, [...P.members.filter((q) => !q.me), { id: m.from, name: m.fromName }]); host.toast(`🤝 ${m.fromName} joined your party (${rpg.party().members.length}/${P.max}).`); T.partyRender?.(); }
    if (m.type === "invite" && !rpg.inInstance()) { T.invites.push(m); host.openPanel("🤝 Party invite", (pn) => { pn.dataset.rpgPanel = "invite"; pn.appendChild(el("p", null, `${m.fromName} invites you into a party at the portal. Parties are only for instances (max ${D?.party?.max || 3}).`));
      pn.appendChild(btn("Join", "invite-yes", () => { rpg.setParty(m.party, [{ id: m.from, name: m.fromName }]); net.sendParty({ type: "accept", to: m.from, portal: m.portal, party: m.party }); host.closePanel(); host.toast(`🤝 You're in ${m.fromName}'s party. Walk to the portal.`); }, "o3-btn"));
      pn.appendChild(btn("No thanks", "invite-no", () => host.closePanel())); }); }
    if (m.type === "go" && P.id && m.party === P.id && !rpg.inInstance()) { host.toast(`🌀 ${m.fromName} stepped through. Follow them in through the portal!`); T.follow = m; }
    if (m.type === "leave" && P.id && m.party === P.id) { rpg.setParty(P.id, P.members.filter((q) => !q.me && q.id !== m.from)); T.partyRender?.(); } });
  const onPartyGo = (p) => { const P = rpg.party(); if (P.members.length > 1) net.sendParty({ type: "go", to: "*", party: P.id, portal: p.pp.id, instance: p.pp.instance }); };

  // ---------- rpg.js hooks ----------
  // v5b: avatar sprites (static, data-driven: data/annex-rpg.json "avatars"). Moth's per-player drawings plug in here later.
  function myAvatar() { const A = rpg.data()?.avatars; if (!A?.static) return null; const nm = String(net.N.selfName || host.me?.display_name || "").toLowerCase();
    for (const a of A.static) { if (a.adminOnly && !net.isAdmin()) continue; if (host.demo ? a.demoAdmin && net.isAdmin() : nm.includes(a.match)) return a.src; } return null; }
  Object.assign(rpg.ext, { avatarUrl: () => { const u = myAvatar(); net.N.selfAvatar = u; return u; }, isAdmin: () => net.isAdmin(), buildControl, portalParty, onPartyGo,
    controlButtons: () => [btn("🛰 Control desk", "desk-btn", () => openDesk(), "o3-btn ghost")],
    onLeave: (id) => { const P = rpg.party(); if (P.id && P.members.length > 1 && !D?.instances[id]?.training) { net.sendParty({ type: "leave", to: "*", party: P.id }); } if (!D?.instances[id]?.training) rpg.setParty(null, []); T.carry = null; } });

  // ---------- teammates walking around (simple figures; the cartoon avatar billboard replaces the body later) ----------
  function makeFig(p) { const g = new THREE.Group(), col = hashCol(p.id); root.add(g);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.1, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 })); body.position.y = 0.6; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: "#f1d7b8", roughness: 0.8 })); head.position.y = 1.36; g.add(head);
    const tex = canvasTex(256, 64, (c, w, h) => { c.fillStyle = "rgba(14,24,34,.8)"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "bold 34px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(p.name).slice(0, 14), w / 2, h / 2); });
    const tag = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); tag.scale.set(0.9, 0.22, 1); tag.position.y = 1.8; g.add(tag);
    let bb = null; if (p.av) { body.visible = false; head.visible = false; // the cartoon cut-out replaces the simple figure
      bb = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.08, depthWrite: true, side: THREE.DoubleSide })); bb.position.y = 0.85; bb.scale.set(0.9, 1.7, 1); bb.userData.av = p.av; g.add(bb);
      new THREE.TextureLoader().load(p.av, (t) => { t.colorSpace = THREE.SRGBColorSpace; bb.material.map = t; bb.material.needsUpdate = true; const a = t.image.width / t.image.height; bb.scale.set(1.7 * a, 1.7, 1); }, undefined, () => { body.visible = true; head.visible = true; bb.visible = false; }); }
    g.position.set(p.x, p.y || 0, p.z); return { g, tag, tex, body, bb, name: p.name }; }
  function dropFig(id) { const f = T.figs.get(id); if (!f) return; root.remove(f.g); f.g.traverse((o) => { if (o.isMesh) { o.geometry !== planeGeo && o.geometry.dispose(); o.material.map?.dispose?.(); o.material.dispose(); } }); T.figs.delete(id); }
  function syncFigs(dt) { const myInst = rpg.instId(), myParty = rpg.party().id, yaw = host.state().yaw, seen = new Set();
    net.players().forEach((p) => { const show = T.inAnnex && (p.inst || null) === (myInst || null) && (!myInst || (p.party && p.party === myParty)); if (!show) return; seen.add(p.id);
      let f = T.figs.get(p.id); if (!f) { f = makeFig(p); T.figs.set(p.id, f); } const a = Math.min(1, dt * 6); f.g.position.x += (p.x - f.g.position.x) * a; f.g.position.z += (p.z - f.g.position.z) * a; f.g.position.y = p.y || 0; f.body.rotation.y = p.yaw || 0; f.tag.rotation.y = yaw; if (f.bb) f.bb.rotation.y = yaw; });
    [...T.figs.keys()].forEach((id) => { if (!seen.has(id)) dropFig(id); }); }

  // ---------- HUD chip ----------
  const chip = el("div", "o3-netchip"); chip.hidden = true; chip.dataset.ctl = "online"; (host.tray || host.hud).appendChild(chip); // v5b: lives in the top-right tray, off the joystick
  const renderChip = () => { const n = net.players().size; chip.textContent = net.status() === "offline" ? "👥 offline" : `👥 ${n}`; chip.title = `${n} teammate${n === 1 ? "" : "s"} here`; chip.setAttribute("aria-label", chip.title); chip.hidden = !T.inAnnex || net.status() === "off"; };

  // ---------- per frame ----------
  function update(dt, ts, p, st) { if (!D) return; net.tick(dt); const inst = rpg.instId();
    if (!inst) T.outPos = { x: p.x, z: p.z, y: st.feet || 0 };
    if (T.portalAt && Math.hypot(p.x - T.portalAt.x, p.z - T.portalAt.z) > 6) { T.portal = null; T.portalAt = null; T.partyRender = null; }
    net.track({ x: p.x, z: p.z, y: st.feet || 0, yaw: host.state().yaw, inst, portal: T.portal, party: rpg.party().id }); chat.update(p, inst, rpg.party().id);
    syncFigs(dt); T.mapT += dt; if (T.mapT > 0.4) { T.mapT = 0; renderChip(); if (inst === "control") { drawMap(mapCanvas, { big: true }); mapTex.needsUpdate = true; } }
    const B = T.booth; if (B?.inner && inst === "control") { if (B.spin) { B.yaw += dt * 0.6; applyBooth(); }
      const here = [...net.players().values()].filter((q) => !q.inst && B.cell && cellOfL(q.x, q.z).join() === B.cell.join());
      while (B.beacons.length < here.length) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffe28a" })); B.inner.add(b); B.beacons.push(b); }
      while (B.beacons.length > here.length) { const b = B.beacons.pop(); B.inner.remove(b); b.geometry.dispose(); b.material.dispose(); }
      here.forEach((q, n) => B.beacons[n].position.set(q.x - B.cell[0] * C - C2, -1.5 + 1.0, q.z - B.cell[1] * C - C2)); }
    if (T.carry && T.room && inst === "control") { const pr = T.props.find((q) => q.id === T.carry), yaw = host.state().yaw; if (pr) { pr.g.position.x = p.x - T.room.IX - Math.sin(yaw) * 1.3; pr.g.position.z = p.z - T.room.IZ - Math.cos(yaw) * 1.3; pr.g.position.y = 0.6; } }
    if (T.room?.big) T.room.big.material.emissiveIntensity = 0.5 + Math.sin(ts * 3) * 0.3; }
  function onArrive() { T.inAnnex = true; chat.onArrive(); net.join({ C, start: startSec.center }).then(renderChip); }
  function onLeave() { T.inAnnex = false; chat.onLeave(); net.leave(); [...T.figs.keys()].forEach(dropFig); renderChip(); }

  const debug = { net, state: () => ({ admin: net.isAdmin(), adminChecked: net.N.adminChecked, door: !!T.door, doorSpot: overlookSpots.some((o) => o.key === "control"), status: net.status(), players: [...net.players().values()].map((p) => ({ id: p.id, name: p.name, x: +p.x.toFixed(1), z: +p.z.toFixed(1), inst: p.inst, party: p.party })),
      inControl: rpg.instId() === "control", booth: boothState(), figs: [...T.figs.keys()], figAv: [...T.figs.entries()].filter(([, f]) => f.bb).map(([id, f]) => ({ id, av: f.bb.userData.av, loaded: !!f.bb.material.map })), pin: T.pin, dots: T.dots.slice(), gmLog: net.N.log.slice(-5), party: rpg.party(), carry: T.carry, chip: chip.hidden ? null : chip.textContent }),
    door: () => T.door && { x: AX + T.door.lx, z: AZ + T.door.lz, y: T.door.y, spawn: { x: AX + T.door.spawn.x, z: AZ + T.door.spawn.z, y: T.door.spawn.y, yaw: T.door.spawn.yaw } },
    openDoor, enterControl: () => (net.isAdmin() && T.door ? openDoor() : null), openDesk, boothOp, loadBooth, lookIntoBooth, moveProp, props: () => T.props.map((p) => ({ id: p.id, x: +p.g.position.x.toFixed(2), z: +p.g.position.z.toFixed(2) })),
    setPin: (x, z) => { T.pin = { x, z }; return T.pin; }, sendGM: (c) => net.sendGM(c), fakes: () => net.fakes(), demoPlace: net.demoPlace, demoRelease: net.demoRelease, mapDots: () => drawMap(document.createElement("canvas")), chat: chat.debug };
  return { update, onArrive, onLeave, debug, net };
}
