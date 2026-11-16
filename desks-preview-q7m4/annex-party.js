// Elsewhere Annex: opt-in party runs inside instances (Grotto first).
// Hall exploration stays solo. Leaving the instance returns each player to their own world.
// Relay: Supabase Realtime Broadcast+Presence on the existing private "annex" channel
// (eclectic-desks / dotwzemmkrxswoeqcggj) when both players are logged in — no new tables.
// Local tests / demo: a WebSocket given as ?partyRelay=ws://… .
export function createParty(ctx) {
  const { THREE, root, host, el, rpg, net, AX, AZ } = ctx;
  const IX = -3000, IZ = -3000;
  const AVS = ["bryan", "emily", "gremlin"];
  const AV_OK = (id) => AVS.includes(id) ? id : "gremlin";
  const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const codeNew = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
  const storeAv = () => { try { return AV_OK(localStorage.getItem("et-desks-party-av") || guessAv()); } catch { return guessAv(); } };
  const saveAv = (id) => { try { localStorage.setItem("et-desks-party-av", id); } catch {} };
  const guessAv = () => {
    const n = String(host.me?.display_name || rpg?.state?.()?.char?.name || "").toLowerCase();
    if (n.includes("bryan")) return "bryan"; if (n.includes("emily")) return "emily"; return "gremlin";
  };
  const ARMOR = { clothes: null, light: "#9fd8c0", medium: "#b08a58", heavy: "#c0c8d0" };

  const P = {
    on: false, role: null, code: null, seed: null, inst: null, hostId: null,
    selfId: (function () {
      try {
        const q = new URLSearchParams(location.search).get("partySelf");
        if (q) return q;
        if (net?.N?.selfId && net.N.selfId !== "me") return net.N.selfId;
        let s = sessionStorage.getItem("et-desks-party-self");
        if (!s) { s = "p-" + Math.random().toString(36).slice(2, 8); sessionStorage.setItem("et-desks-party-self", s); }
        return s;
      } catch { return net?.N?.selfId || "me"; }
    })(), selfName: net?.N?.selfName || "you",
    av: storeAv(), armor: "clothes", members: new Map(), cam: "first",
    finds: [], cleared: [], boss: false, status: "off",
  };
  const remotes = new Map(); // id -> { fig, tx,tz,ty,tyaw, x,z,y,yaw, moving, av, armor, name, room }
  const grottoFn = [];
  let selfFig = null, transport = null, lastPosAt = 0, lastPos = null, lastHB = 0, bobT = 0;
  let friendHud = null, camBtn = null, reconnecting = false;
  const texCache = new Map();
  const loadTex = (src) => {
    if (texCache.has(src)) return texCache.get(src);
    const t = new THREE.TextureLoader().load(src, (tx) => { tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace; tx.needsUpdate = true; });
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(src, t); return t;
  };
  const faceMat = (src, color) => {
    if (src) { const m = new THREE.MeshLambertMaterial({ map: loadTex(src), transparent: true, alphaTest: 0.05 }); return m; }
    return new THREE.MeshLambertMaterial({ color: color || "#888", transparent: true });
  };
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Front of the avatar is -z (yaw 0 faces -z).
  function block(w, h, d, maps, solid) {
    const mats = [
      faceMat(maps.right, solid), faceMat(maps.left, solid),
      faceMat(null, solid), faceMat(null, solid),
      faceMat(maps.back, solid), faceMat(maps.front, solid),
    ];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.userData.mats = mats; return m;
  }
  function avMaps(id, part) {
    const p = `assets/avatars/pixel/${id}-${part}-`;
    return { front: p + "front.png", back: p + "back.png", left: p + "left.png", right: p + "right.png" };
  }
  function makeAvatar(info) {
    const id = AV_OK(info.av), g = new THREE.Group();
    const head = block(0.42, 0.42, 0.42, avMaps(id, "head"), "#e8c8a8"); head.position.y = 1.36; g.add(head);
    const body = block(0.52, 0.58, 0.32, avMaps(id, "body"), "#445"); body.position.y = 0.85; g.add(body);
    const legs = block(0.50, 0.52, 0.30, avMaps(id, "legs"), "#333"); legs.position.y = 0.30; g.add(legs);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.48), new THREE.MeshLambertMaterial({ color: "#a8b0b8", transparent: true, opacity: 0.92 }));
    helm.position.y = 1.58; helm.visible = false; g.add(helm);
    const overlay = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.36), new THREE.MeshLambertMaterial({ color: "#c0c8d0", transparent: true, opacity: 0.38, depthWrite: false }));
    overlay.position.y = 0.85; overlay.visible = false; g.add(overlay);
    const tex = document.createElement("canvas"); tex.width = 256; tex.height = 64;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    tag.position.y = 1.82; g.add(tag);
    const fig = { g, head, body, legs, helm, overlay, tag, tex, av: id, armor: info.armor || "clothes", name: info.name || "friend", moving: false, step: 0 };
    drawTag(fig, info.name || "friend"); applyArmor(fig, fig.armor); return fig;
  }
  function drawTag(fig, name) {
    const c = fig.tex.getContext("2d"); c.clearRect(0, 0, 256, 64);
    c.fillStyle = "rgba(14,24,34,.8)"; c.fillRect(0, 0, 256, 64);
    c.fillStyle = "#fff"; c.font = "bold 34px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(String(name || "").slice(0, 14), 128, 32);
    const t = new THREE.CanvasTexture(fig.tex); t.colorSpace = THREE.SRGBColorSpace; fig.tag.material.map = t; fig.tag.material.needsUpdate = true;
  }
  function applyArmor(fig, tier) {
    fig.armor = tier || "clothes";
    const col = ARMOR[fig.armor];
    fig.overlay.visible = !!col && fig.armor !== "clothes";
    if (col) fig.overlay.material.color.set(col);
    fig.helm.visible = fig.armor === "heavy";
  }
  function dropFig(fig) { if (!fig) return; root.remove(fig.g); fig.g.traverse((o) => { if (o.isMesh) { o.geometry.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); } }); }
  function pose(fig, moving, dt) {
    fig.step += dt * (moving ? 10 : 0);
    const swing = moving ? Math.sin(fig.step) * 0.35 : 0;
    const bob = moving ? Math.abs(Math.sin(fig.step)) * 0.04 : 0;
    fig.body.position.y = 0.85 + bob; fig.head.position.y = 1.36 + bob; fig.helm.position.y = 1.58 + bob; fig.overlay.position.y = 0.85 + bob;
    fig.legs.rotation.x = swing * 0.15;
    fig.tag.position.y = 1.82 + bob;
  }

  // ---------- transport ----------
  function relayUrl() { try { return new URLSearchParams(location.search).get("partyRelay") || ""; } catch { return ""; } }
  function emitLocal(msg) { onMsg({ ...msg, from: msg.from || P.selfId }); }
  function wsTransport(url) {
    let ws = null, buf = [], opened = false;
    const open = () => {
      try { ws = new WebSocket(url); } catch (e) { P.status = "offline"; return; }
      ws.onopen = () => { opened = true; P.status = "relay"; buf.splice(0).forEach((m) => ws.send(JSON.stringify(m))); };
      ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch {} };
      ws.onclose = () => { opened = false; P.status = P.on ? "reconnecting" : "off"; if (P.on) setTimeout(() => { if (P.on) open(); }, 800); };
      ws.onerror = () => {};
    };
    open();
    return {
      kind: "ws",
      send(m) { const msg = { ...m, code: P.code, from: P.selfId }; if (opened && ws?.readyState === 1) ws.send(JSON.stringify(msg)); else buf.push(msg); },
      close() { try { ws?.close(); } catch {} ws = null; opened = false; },
    };
  }
  function netTransport() {
    const off = net.on("run", (m) => { if (!m || (m.code && P.code && m.code !== P.code)) return; onMsg(m); });
    return {
      kind: "supabase",
      send(m) { const ok = net.sendRun?.({ ...m, code: P.code }); return ok; },
      close() { /* listener stays; messages ignored when P.on is false */ },
    };
  }
  function pickTransport() {
    const u = relayUrl();
    if (u && /^wss?:\/\//.test(u)) return wsTransport(u);
    if (net && (net.status?.() === "online") && net.sendRun) return netTransport();
    if (u) return wsTransport(u);
    // demo / offline: still allow a ws if the test set one; otherwise stay local-only
    return { kind: "local", send(m) { /* other browsers will not hear this */ }, close() {} };
  }
  function send(m) { transport?.send(m); }
  function persist() { try { if (P.on && P.code) sessionStorage.setItem("et-desks-party-run", JSON.stringify({ code: P.code, role: P.role, seed: P.seed, inst: P.inst, av: P.av })); else sessionStorage.removeItem("et-desks-party-run"); } catch {} }

  function myArmor() {
    try { const c = rpg.state?.()?.char; const id = c?.gear?.armor; const it = rpg.data?.()?.gear?.[id]; return it?.tier || "clothes"; } catch { return "clothes"; }
  }
  function myName() { return rpg.debug?.state?.()?.char?.name || rpg.state?.()?.char?.name || net?.N?.selfName || host.me?.display_name || "you"; }
  function snapshot() {
    return { t: "snap", seed: P.seed, inst: P.inst, host: P.hostId, finds: P.finds.slice(), cleared: P.cleared.slice(), boss: !!P.boss,
      members: [{ id: P.selfId, name: myName(), av: P.av, armor: myArmor(), role: P.role }, ...[...P.members.values()].map((m) => ({ id: m.id, name: m.name, av: m.av, armor: m.armor }))] };
  }
  function remember(m) { if (!m?.id || m.id === P.selfId) return; P.members.set(m.id, { id: m.id, name: m.name || "friend", av: AV_OK(m.av), armor: m.armor || "clothes" }); }

  function onMsg(m) {
    if (!m || !m.t) return;
    if (m.from === P.selfId) return;
    if (P.code && m.code && m.code !== P.code) return;
    if (m.t === "hello" || m.t === "join") {
      if (!P.on && m.t === "hello") return;
      remember({ id: m.from, name: m.name, av: m.av, armor: m.armor });
      if (P.role === "host") send(snapshot());
      renderHud(); return;
    }
    if (m.t === "snap") {
      if (!P.on && !reconnecting) return;
      P.seed = m.seed; P.inst = m.inst || P.inst; P.hostId = m.host || P.hostId; P.finds = m.finds || []; P.cleared = m.cleared || []; P.boss = !!m.boss;
      (m.members || []).forEach(remember);
      if (rpg.inInstance?.() && rpg.instId?.() === P.inst) rpg.applyRunProgress?.({ cleared: P.cleared, loot: P.finds, boss: P.boss });
      renderHud(); return;
    }
    if (m.t === "pos") {
      const p = m.p || [];
      let r = remotes.get(m.from);
      const mem = P.members.get(m.from) || { id: m.from, name: m.name || "friend", av: AV_OK(m.av), armor: m.armor || "clothes" };
      if (m.av) mem.av = AV_OK(m.av); if (m.armor) mem.armor = m.armor; if (m.name) mem.name = m.name; P.members.set(m.from, mem);
      if (!r) { if (!P.on || rpg.instId?.() !== P.inst) return; r = { fig: makeAvatar(mem), x: p[0], z: p[1], y: p[2] || 0, yaw: p[3] || 0, tx: p[0], tz: p[1], ty: p[2] || 0, tyaw: p[3] || 0, moving: !!p[4], av: mem.av, armor: mem.armor }; root.add(r.fig.g); remotes.set(m.from, r); }
      else if (r.av !== mem.av) { dropFig(r.fig); r.fig = makeAvatar(mem); r.av = mem.av; root.add(r.fig.g); }
      else if (r.armor !== mem.armor) { applyArmor(r.fig, mem.armor); r.armor = mem.armor; }
      r.tx = +p[0] || 0; r.tz = +p[1] || 0; r.ty = +p[2] || 0; r.tyaw = +p[3] || 0; r.moving = !!p[4]; r.room = m.room || r.room;
      renderHud(); return;
    }
    if (m.t === "clear" || m.t === "loot" || m.t === "boss") {
      if (m.t === "clear" && !P.cleared.includes(m.k)) P.cleared.push(m.k);
      if (m.t === "loot" && m.key && !P.finds.includes(m.key)) P.finds.push(m.key);
      if (m.t === "boss") P.boss = true;
      rpg.applyRunProgress?.({ cleared: P.cleared, loot: P.finds, boss: P.boss });
      return;
    }
    if (m.t === "leave") { P.members.delete(m.from); const r = remotes.get(m.from); if (r) { dropFig(r.fig); remotes.delete(m.from); } if (m.from === P.hostId && P.role !== "host") { P.role = "host"; P.hostId = P.selfId; } renderHud(); }
    if (m.t === "g") grottoFn.forEach((f) => { try { f(m); } catch (e) { console.error(e); } });
  }

  function startHost(inst) {
    P.on = true; P.role = "host"; P.code = codeNew(); P.seed = (Math.random() * 0x7fffffff) | 0; P.inst = inst; P.hostId = P.selfId;
    P.finds = []; P.cleared = []; P.boss = false; P.members = new Map(); P.av = storeAv(); P.armor = myArmor();
    transport?.close(); transport = pickTransport(); send({ t: "hello", name: myName(), av: P.av, armor: P.armor, seed: P.seed, inst });
    try { rpg.setParty?.(P.code, []); } catch {}
    persist(); renderHud(); host.toast?.(`Party code ${P.code} — they can join from the Grotto door.`);
    return P.code;
  }
  function join(code, opts = {}) {
    const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (c.length < 4) return Promise.reject(new Error("code"));
    if (opts.av) { P.av = AV_OK(opts.av); saveAv(P.av); }
    P.on = true; P.role = "join"; P.code = c; P.inst = opts.inst || "grotto"; P.av = storeAv(); P.armor = myArmor();
    transport?.close(); transport = pickTransport(); send({ t: "join", name: myName(), av: P.av, armor: P.armor, inst: P.inst });
    try { rpg.setParty?.(c, []); } catch {}
    persist(); renderHud();
    return new Promise((res) => { const t0 = Date.now(); const tick = () => { if (P.seed != null) return res(P); if (Date.now() - t0 > 8000) return res(P); setTimeout(tick, 120); }; tick(); });
  }
  function endRun(quiet) {
    if (P.on) send({ t: "leave" });
    P.on = false; P.role = null; P.code = null; P.seed = null; P.inst = null; P.hostId = null; P.finds = []; P.cleared = []; P.boss = false; P.members = new Map(); P.status = "off";
    remotes.forEach((r) => dropFig(r.fig)); remotes.clear(); dropFig(selfFig); selfFig = null;
    transport?.close(); transport = null; persist(); renderHud();
    if (!quiet) host.toast?.("Back to your own path.");
  }

  function prepareEnter(id) {
    if (!P.on || P.inst !== id) return null;
    return { seed: P.seed, keepProgress: P.role === "join" || !!P.cleared.length || !!P.finds.length || P.boss };
  }
  function onEnter(id) { if (P.on && P.inst === id) { P.armor = myArmor(); renderHud(); } }
  function afterEnter(id) {
    if (!P.on || P.inst !== id) return;
    rpg.seed?.(P.seed);
    rpg.applyRunProgress?.({ cleared: P.cleared, loot: P.finds, boss: P.boss });
    if (P.role === "host") send(snapshot());
    ensureSelf(); renderHud();
  }
  function onLeave(id) {
    if (!P.on) return;
    send({ t: "leave" });
    remotes.forEach((r) => dropFig(r.fig)); remotes.clear(); dropFig(selfFig); selfFig = null;
    // stay in the party only until we leave the instance — then everyone is solo again
    endRun(true);
  }

  function onLocalEvent(type, payload) {
    if (!P.on || rpg.instId?.() !== P.inst) return;
    if (type === "clear") { if (!P.cleared.includes(payload)) P.cleared.push(payload); send({ t: "clear", k: payload }); }
    if (type === "loot") { if (payload && !P.finds.includes(payload)) P.finds.push(payload); send({ t: "loot", key: payload }); }
    if (type === "boss") { P.boss = true; send({ t: "boss" }); }
  }

  function ensureSelf() {
    if (!P.on || rpg.instId?.() !== P.inst) return;
    if (!selfFig) { selfFig = makeAvatar({ av: P.av, armor: myArmor(), name: myName() }); root.add(selfFig.g); }
    selfFig.g.visible = P.cam === "third";
  }
  function setAvatar(id) { P.av = AV_OK(id); saveAv(P.av); if (selfFig) { dropFig(selfFig); selfFig = null; ensureSelf(); } send({ t: "pos", av: P.av, armor: myArmor(), name: myName(), p: lastPos || [0, 0, 0, 0, 0] }); }
  function setCam(mode) { P.cam = mode === "third" ? "third" : "first"; try { localStorage.setItem("et-desks-party-cam", P.cam); } catch {} ensureSelf(); if (camBtn) camBtn.textContent = P.cam === "third" ? "1st" : "3rd"; }
  try { if (localStorage.getItem("et-desks-party-cam") === "third") P.cam = "third"; } catch {}

  let pairHold = false;
  function holdFramePair(on) { pairHold = !!on; }
  function remWorld(rem) {
    if (!rem) return null;
    const lx = rem.fig?.g?.position?.x ?? rem.x, lz = rem.fig?.g?.position?.z ?? rem.z;
    if (lx == null || lz == null) return null;
    return { x: AX + lx, z: AZ + lz, y: rem.fig?.g?.position?.y ?? rem.y ?? 0 };
  }
  function applyCamera(cam) {
    if (!P.on || rpg.instId?.() !== P.inst) return;
    if (!pairHold && P.cam !== "third") return;
    if (host.warping?.()) return;
    const st = host.state?.() || {};
    const px = st.pos?.x ?? st.x, pz = st.pos?.z ?? st.z;
    if (px == null || pz == null) return;
    const yaw = st.yaw ?? 0, feet = st.feet || 0;
    const rw = remWorld([...remotes.values()][0]);
    const dist = rw ? Math.hypot(rw.x - px, rw.z - pz) : 0;
    const pair = rw && dist > 0.2 && dist < 14;
    // Midpoint framing when the partner is nearby. Keep `back` short enough to
    // stay inside a typical 8m-deep room. Shift the look-at a little to camera-right
    // so both figures land in the open column between the dice log and the minimap
    // instead of having the right-hand partner sit under the map.
    const k = pair ? 0.5 : 0;
    let mx = px + (pair ? (rw.x - px) * k : 0);
    let mz = pz + (pair ? (rw.z - pz) * k : 0);
    if (pair) {
      const bias = 0.40;
      mx += Math.cos(yaw) * bias;
      mz -= Math.sin(yaw) * bias;
    }
    const back = pairHold && pair ? 4.6 : (pair ? 4.0 : 3.6);
    const lift = pairHold && pair ? 2.15 : 1.7;
    cam.position.set(mx + Math.sin(yaw) * back, feet + lift, mz + Math.cos(yaw) * back);
    cam.up.set(0, 1, 0);
    cam.lookAt(mx, feet + 0.9, mz);
    cam.updateMatrixWorld?.();
    if (selfFig) selfFig.g.visible = true;
  }

  function update(dt, p) {
    if (!P.on) return;
    const inst = rpg.instId?.() || null;
    const inRun = inst && inst === P.inst;
    if (inRun) {
      ensureSelf();
      const yaw = host.state?.().yaw || 0, feet = host.state?.().feet || 0;
      const moving = !!(lastPos && (Math.abs(lastPos[0] - p.x) > 0.01 || Math.abs(lastPos[1] - p.z) > 0.01));
      if (selfFig) { selfFig.g.position.set(p.x, feet, p.z); selfFig.g.rotation.y = yaw; selfFig.g.visible = P.cam === "third"; pose(selfFig, moving, dt); drawTag(selfFig, myName()); applyArmor(selfFig, myArmor()); }
      const now = Date.now();
      if (moving && now - lastPosAt > 200 || now - lastPosAt > 4000) {
        lastPosAt = now; lastPos = [+p.x.toFixed(2), +p.z.toFixed(2), +feet.toFixed(2), +yaw.toFixed(2), moving ? 1 : 0];
        const room = rpg.roomAt?.(p.x, p.z);
        send({ t: "pos", av: P.av, armor: myArmor(), name: myName(), room: room?.label || room?.id || null, p: lastPos });
      }
    }
    const yawCam = host.state?.().yaw || 0;
    remotes.forEach((r) => {
      if (!inRun) { r.fig.g.visible = false; return; }
      r.fig.g.visible = true;
      const a = Math.min(1, dt * 8); r.x += (r.tx - r.x) * a; r.z += (r.tz - r.z) * a; r.y += (r.ty - r.y) * a;
      let dy = r.tyaw - r.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; r.yaw += dy * a;
      r.fig.g.position.set(r.x, r.y, r.z); r.fig.g.rotation.y = r.yaw; r.fig.tag.rotation.y = yawCam - r.yaw;
      pose(r.fig, r.moving, dt);
    });
    if (nowNeedHud(dt)) renderHud(); else if (friendHud && !friendHud.hidden) placeHud();
  }
  let hudT = 0; function nowNeedHud(dt) { hudT += dt; if (hudT > 0.4) { hudT = 0; return true; } return false; }

  function goToFriend() {
    const r = [...remotes.values()][0]; if (!r || rpg.instId?.() !== P.inst) return false;
    const yaw = host.state?.().yaw || 0;
    host.placeAnnex?.({ x: r.x + Math.sin(yaw + 0.4) * -1.2, z: r.z + Math.cos(yaw + 0.4) * -1.2, y: r.y, yaw });
    host.toast?.(`Heading to ${r.fig.name}.`); return true;
  }


  function placeHud() {
    if (!friendHud || friendHud.hidden || !host.hud) return;
    const hud = host.hud, hb = hud.getBoundingClientRect();
    const tray = hud.querySelector(".o3-tray");
    const map = hud.querySelector(".o3-minimap");
    let top = 8;
    if (map && !map.hidden && map.offsetParent) {
      const mb = map.getBoundingClientRect();
      top = Math.round(mb.bottom - hb.top + 6);
    } else if (tray) {
      const tb = tray.getBoundingClientRect();
      top = Math.round(tb.bottom - hb.top + 8);
    }
    const floorOf = (el) => {
      if (!el || el.hidden || !el.offsetParent) return null;
      if (getComputedStyle(el).display === "none") return null;
      return el.getBoundingClientRect().top - hb.top;
    };
    let floor = hb.height - 8;
    [hud.querySelector(".o3-actions"), hud.querySelector(".o3-joy"), hud.querySelector(".o3-jump")].forEach((el) => {
      const y = floorOf(el); if (y != null) floor = Math.min(floor, y - 8);
    });
    const h = friendHud.offsetHeight || 72;
    if (top + h > floor) top = Math.max(8, Math.round(floor - h));
    friendHud.style.top = top + "px";
    friendHud.style.bottom = "auto";
    friendHud.style.right = "0.65rem";
    friendHud.style.left = "auto";
  }
  function renderHud() {
    if (!friendHud) {
      friendHud = el("div", "o3-partyhud"); friendHud.hidden = true; friendHud.dataset.party = "hud";
      (host.hud || document.body).appendChild(friendHud);
    }
    if (!camBtn && host.tray) {
      camBtn = el("button", "o3-btn ghost o3-cambtn", P.cam === "third" ? "1st" : "3rd");
      camBtn.title = "Toggle third-person camera"; camBtn.setAttribute("aria-label", "Camera"); camBtn.dataset.party = "cam";
      camBtn.onclick = () => setCam(P.cam === "third" ? "first" : "third");
      host.tray.appendChild(camBtn);
    }
    const inRun = P.on && rpg.instId?.() === P.inst;
    if (camBtn) camBtn.hidden = !inRun;
    if (!P.on) { friendHud.hidden = true; return; }
    const others = [...P.members.values()];
    const r = [...remotes.values()][0];
    const room = r?.room ? String(r.room).split("·")[0].trim() : (inRun ? "the run" : "the door");
    const who = r?.fig?.name || others[0]?.name;
    friendHud.hidden = false;
    friendHud.innerHTML = "";
    const line = el("div", "o3-partyhud-line", P.code ? `Party ${P.code}` : "Party");
    line.textContent = who ? `${who} · ${room}` : (P.code ? `Party ${P.code}` : "Party");
    line.title = who ? `${who} in ${r?.room || room}` : line.textContent;
    friendHud.appendChild(line);
    if (P.code) friendHud.appendChild(el("div", "o3-partyhud-code", P.code));
    if (inRun && remotes.size) {
      const b = el("button", "o3-btn ghost o3-partygo", "Go to friend"); b.onclick = () => goToFriend(); friendHud.appendChild(b);
    }
    placeHud(); requestAnimationFrame(placeHud);
  }

  function decorateDoor(pn, inst, goFn) {
    const I = rpg.data?.()?.instances?.[inst] || {};
    if (inst !== "grotto" && !I.partyRuns && !I.party) return;
    const box = el("div", "o3-party o3-partydoor"); box.dataset.party = "door";
    box.appendChild(el("b", null, I.party?.title || "Play together (test)"));
    box.appendChild(el("p", "o3-small", I.party?.blurb || "Each of you explores the halls alone. At this door you can share one run. Leaving returns you to your own path."));
    const avRow = el("div", "o3-partyavs"); avRow.dataset.party = "avs";
    AVS.forEach((id) => {
      const b = el("button", "o3-partyav" + (storeAv() === id ? " on" : "")); b.dataset.av = id; b.title = id;
      const img = document.createElement("img"); img.src = `assets/avatars/pixel/${id}-head-front.png`; img.alt = id; img.width = 48; img.height = 48;
      b.appendChild(img); b.appendChild(el("span", null, id[0].toUpperCase() + id.slice(1)));
      b.onclick = () => { setAvatar(id); avRow.querySelectorAll(".o3-partyav").forEach((q) => q.classList.toggle("on", q.dataset.av === id)); };
      avRow.appendChild(b);
    });
    box.appendChild(avRow);
    const hostBtn = el("button", "o3-btn", I.party?.hostLabel || "Start a Grotto run together"); hostBtn.dataset.party = "host";
    hostBtn.onclick = () => { const code = startHost(inst); hostBtn.textContent = `Code ${code} — waiting…`; goFn?.(); };
    box.appendChild(hostBtn);
    const row = el("div", "o3-partyjoin");
    const inp = document.createElement("input"); inp.type = "text"; inp.maxLength = 6; inp.placeholder = "CODE"; inp.autocapitalize = "characters"; inp.dataset.party = "code";
    inp.className = "o3-partycode"; inp.setAttribute("aria-label", "Party code");
    const joinBtn = el("button", "o3-btn ghost", I.party?.joinLabel || "Join a run"); joinBtn.dataset.party = "join";
    joinBtn.onclick = () => { join(inp.value, { inst }).then(() => goFn?.()).catch(() => host.toast?.("That code didn't work.")); };
    row.appendChild(inp); row.appendChild(joinBtn); box.appendChild(row);
    pn.appendChild(box);
  }

  addEventListener("resize", () => placeHud());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !P.on) return;
    reconnecting = true; transport?.close(); transport = pickTransport();
    send(P.role === "host" ? snapshot() : { t: "join", name: myName(), av: P.av, armor: myArmor(), inst: P.inst });
    setTimeout(() => (reconnecting = false), 1500);
  });

  const api = {
    decorateDoor, prepareEnter, onEnter, afterEnter, onLeave, onLocalEvent, update, applyCamera,
    startHost, join, endRun, setAvatar, setCam, goToFriend, holdFramePair,
    sendGrotto: (m) => send({ t: "g", ...m }),
    onGrotto: (f) => grottoFn.push(f),
    active: () => P.on && rpg.instId?.() === P.inst,
    hidingNetFigs: () => P.on && rpg.instId?.() === P.inst,
    selfId: () => P.selfId, seed: () => P.seed, code: () => P.code, state: () => ({ ...P, members: [...P.members.values()], cam: P.cam, av: P.av, remotes: [...remotes.keys()] }),
  };
  return api;
}
