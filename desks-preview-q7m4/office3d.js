// Desks 3D office. Procedural geometry only; all text is drawn on canvases (never HTML).
import * as THREE from "./vendor/three.module.min.js";

const PAL = { cream: "#E8E4D8", paper: "#F1EDE2", sage: "#A6B89A", forest: "#54664A", moss: "#3A4A33", ink: "#1A1A18", clay: "#B8775A", wood: "#9a7653", oak: "#c9a57a" };
const THEME = { sage: "#cfdcc4", sunny: "#f6e2a6", lavender: "#d9cde8", sky: "#c6dceb", cocoa: "#d9c0a8", night: "#3e4660" };
const H = 3, T = 0.12, ROOM = 4, HALL = 3.2, DOOR = 1.2, R = 0.28, EYE = 1.6;

export function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; }
}

// ---------- canvas text helpers ----------
function wrap(ctx, text, x, y, maxW, lh, maxLines = 99) {
  const words = String(text || "").split(/\s+/); let line = "", n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (++n >= maxLines) { ctx.fillText(line + "…", x, y); return y + lh; }
      ctx.fillText(line, x, y); line = words[i]; y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y); return y + lh;
}
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
  draw(ctx, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function plate(text, sub, { w = 512, h = 160, bg = PAL.moss, fg = PAL.paper, accent = "#f3d98b" } = {}) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h); c.strokeStyle = accent; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = fg; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `bold ${sub ? 52 : 60}px Georgia, serif`; c.fillText(fit(c, text, w - 50), w / 2, sub ? h * 0.4 : h / 2);
    if (sub) { c.font = "30px system-ui, sans-serif"; c.globalAlpha = 0.85; c.fillText(fit(c, sub, w - 50), w / 2, h * 0.75); }
  });
}
function fit(c, s, max) { s = String(s || ""); while (s.length > 1 && c.measureText(s).width > max) s = s.slice(0, -2) + "…"; return s; }

// ---------- scene ----------
// Static, approved gallery art shipped with the frontend (frames 1-2). Used whenever the
// gallery_art row for that position has no uploaded image, so it works without DB changes.
const STATIC_ART = {
  1: { title: "Tea Under the Old Oak", artist: "Moth's Design Studio", src: "assets/gallery/tea-under-the-old-oak.webp", thumb: "assets/gallery/tea-under-the-old-oak-thumb.webp", aspect: 1280 / 1600,
    description: "An old tea-keeper takes a quiet cup under a great oak at golden hour, with a path winding toward a garden gate.",
    find: ["a little gremlin peeking out of the oak trunk", "a tiny moth on the teapot lid", "Teaspoon the snail on the bench arm", "Clover the rabbit with his pocket watch", "Mossbun in the grass", "a seedling sprout in the path", "one lit lamp among the lanterns", "the arched garden gate"] },
  2: { title: "Still Life with Tea and Small Visitors", artist: "Moth's Design Studio", src: "assets/gallery/still-life-with-tea-and-small-visitors.webp", thumb: "assets/gallery/still-life-with-tea-and-small-visitors-thumb.webp", aspect: 1280 / 1600,
    description: "Cream and white blooms in a celadon vase glow against a dark green niche beside a cup of tea, a peeled lemon and a pocket watch.",
    find: ["a cream moth on the big peony", "a snail on the vase handle", "Glim's tiny glowing lamp", "a gremlin peeking behind the vase", "Pebbo the apricot pebble", "a seedling and a ladybird on the ledge", "a blossom floating in the tea", "a pocket watch"] },
};
export function startOffice(root, opts) {
  const { me, floor, myDesk, notes = [], notices = [], art = [], online = new Set(), api = {} } = opts;
  root.innerHTML = "";
  root.className = "office3d";
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.demo });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  root.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#dcd6c6"); scene.fog = new THREE.Fog("#dcd6c6", 18, 45);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 80); cam.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight("#fff6e6", "#7d8a6e", 1.25));
  const sun = new THREE.DirectionalLight("#fff1d6", 1.1); sun.position.set(6, 10, 4); scene.add(sun);
  scene.add(new THREE.AmbientLight("#ffffff", 0.25));

  const mats = {};
  const mat = (color, o = {}) => (mats[color + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), planeGeo = new THREE.PlaneGeometry(1, 1);
  const box = (x, y, z, sx, sy, sz, m, parent = scene) => { const b = new THREE.Mesh(boxGeo, m); b.position.set(x, y, z); b.scale.set(sx, sy, sz); parent.add(b); return b; };
  const plane = (tex, w, h, x, y, z, ry = 0, parent = scene, extra = {}) => {
    const m = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, ...extra }));
    m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  };
  const walkable = []; // {x0,x1,z0,z1,room}
  const rect = (x0, x1, z0, z1, room) => walkable.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), room });
  const wallM = mat(PAL.paper), trimM = mat(PAL.forest), ceilM = mat("#f5f1e7", { emissive: "#efe7d6", emissiveIntensity: 0.55 });
  // Wall along X at fixed z, from x0..x1, with door gaps [{c,w}]
  function wallX(z, x0, x1, gaps = [], m = wallM) {
    let cur = x0; [...gaps].sort((a, b) => a.c - b.c).forEach((g) => {
      if (g.c - g.w / 2 > cur) box((cur + g.c - g.w / 2) / 2, H / 2, z, g.c - g.w / 2 - cur, H, T, m);
      box(g.c, (H + 2.2) / 2, z, g.w, H - 2.2, T, m); cur = g.c + g.w / 2;
    });
    if (x1 > cur) box((cur + x1) / 2, H / 2, z, x1 - cur, H, T, m);
    box((x0 + x1) / 2, 0.06, z, x1 - x0, 0.12, T + 0.04, trimM);
  }
  function wallZ(x, z0, z1, gaps = [], m = wallM) {
    let cur = z0; [...gaps].sort((a, b) => a.c - b.c).forEach((g) => {
      if (g.c - g.w / 2 > cur) box(x, H / 2, (cur + g.c - g.w / 2) / 2, T, H, g.c - g.w / 2 - cur, m);
      box(x, (H + 2.2) / 2, g.c, T, H - 2.2, g.w, m); cur = g.c + g.w / 2;
    });
    if (z1 > cur) box(x, H / 2, (cur + z1) / 2, T, H, z1 - cur, m);
    box(x, 0.06, (z0 + z1) / 2, T + 0.04, 0.12, z1 - z0, trimM);
  }
  const floorTile = (x0, x1, z0, z1, color) => {
    const f = new THREE.Mesh(planeGeo, mat(color, { roughness: 0.95 })); f.rotation.x = -Math.PI / 2;
    f.scale.set(x1 - x0, z1 - z0, 1); f.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); scene.add(f);
    const c = new THREE.Mesh(planeGeo, ceilM); c.rotation.x = Math.PI / 2; c.scale.set(x1 - x0, z1 - z0, 1); c.position.set((x0 + x1) / 2, H, (z0 + z1) / 2); scene.add(c);
  };
  const lightPanel = (x, z, w = 1.2, d = 0.6) => box(x, H - 0.02, z, w, 0.03, d, mat("#fff7e0", { emissive: "#fff2cc", emissiveIntensity: 1.2 }));
  const plant = (x, z, s = 1) => {
    box(x, 0.22 * s, z, 0.4 * s, 0.44 * s, 0.4 * s, mat(PAL.clay));
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * s, 1), mat("#5f7f4f", { flatShading: true })); g.position.set(x, 0.75 * s, z); scene.add(g);
    const g2 = g.clone(); g2.scale.setScalar(0.7); g2.position.set(x + 0.12 * s, 1.05 * s, z - 0.05); scene.add(g2);
  };
  // Door panel (closed when locked). Returns group.
  function door(x, z, ry, locked, label, sub) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    box(0, 2.22, 0, DOOR + 0.16, 0.08, T + 0.06, trimM, g); box(-DOOR / 2 - 0.04, 1.1, 0, 0.08, 2.2, T + 0.06, trimM, g); box(DOOR / 2 + 0.04, 1.1, 0, 0.08, 2.2, T + 0.06, trimM, g);
    const leaf = new THREE.Group(); leaf.position.set(-DOOR / 2, 0, 0); g.add(leaf);
    box(DOOR / 2, 1.09, 0, DOOR - 0.02, 2.18, 0.05, mat(locked ? "#6f5a45" : PAL.oak), leaf);
    box(DOOR - 0.12, 1.05, 0.05, 0.05, 0.05, 0.08, mat("#c9b27a", { metalness: 0.6, roughness: 0.3 }), leaf);
    leaf.rotation.y = locked ? 0 : 1.35; // open doors swing into the room
    plane(plate(label, sub || (locked ? "🔒 Door locked" : "Door open — come on in"), { bg: locked ? "#4a3b30" : PAL.moss }), 1.1, 0.34, 0, 2.55, 0.08, 0, g);
    return g;
  }

  // ---------- layout ----------
  const others = floor.filter((p) => p.user_id !== me.id);
  const slotsPerSide = Math.max(3, Math.ceil(others.length / 2) + 1);
  const L = slotsPerSide * ROOM; // hallway length (z 0 .. -L)
  const hx = HALL / 2;
  const rooms = []; // {x0,x1,z0,z1,owner,name}
  // own cubicle: z 0..ROOM, x -2..2, door at z=0
  const own = floor.find((p) => p.user_id === me.id) || { user_id: me.id, display_name: me.display_name };
  const myLocked = !!myDesk?.locked;
  floorTile(-2, 2, 0, ROOM, "#b08a62"); wallX(ROOM, -2, 2); wallZ(-2, 0, ROOM); wallZ(2, 0, ROOM);
  wallX(0, -hx - ROOM, hx + ROOM, [{ c: 0, w: DOOR }]);
  const ownDoor = door(0, 0, Math.PI, myLocked, (myDesk?.nickname || me.display_name) + " (you)", myLocked ? "🔒 Locked to visitors" : "Open to visitors");
  rect(-2 + R, 2 - R, R, ROOM - R, "own"); rect(-DOOR / 2 + 0.15, DOOR / 2 - 0.15, -0.6, 0.6, null);
  rooms.push({ x0: -2, x1: 2, z0: 0, z1: ROOM, owner: own, mine: true });
  lightPanel(0, ROOM / 2);
  // hallway
  floorTile(-hx, hx, -L, 0, "#8fa283");
  for (let z = -2; z > -L; z -= 4) lightPanel(0, z, 0.8, 1.4);
  rect(-hx + R, hx - R, -L - 0.6, -R, "hall");
  const leftGaps = [], rightGaps = [];
  const slotList = [];
  for (let i = 0; i < slotsPerSide * 2; i++) slotList.push(others[i] || null);
  slotList.forEach((p, i) => {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), zc = -k * ROOM - ROOM / 2;
    const x0 = side < 0 ? -hx - ROOM : hx, x1 = side < 0 ? -hx : hx + ROOM;
    if (!p) { // blank wall with a framed print and a plant
      if (k % 2 === 0) plant(side * (hx - 0.35), zc + 1.1, 0.9);
      box(side * (hx - 0.07), 1.65, zc, 0.04, 0.8, 1.1, mat(PAL.forest));
      plane(canvasTex(256, 192, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, PAL.sage); g.addColorStop(1, PAL.paper); c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = PAL.forest; c.beginPath(); c.arc(w * 0.35 + k * 20 % 60, h * 0.55, 46, 0, 7); c.fill(); c.fillStyle = PAL.clay; c.fillRect(w * 0.55, h * 0.3, 60, 80); }),
        0.98, 0.7, side * (hx - 0.1), 1.65, zc, -side * Math.PI / 2);
      return;
    }
    (side < 0 ? leftGaps : rightGaps).push({ c: zc, w: DOOR });
    const name = p.nickname || p.display_name; const sub = p.nickname ? p.display_name : null;
    door(side * hx, zc, side < 0 ? Math.PI / 2 : -Math.PI / 2, p.locked, name, p.locked ? "🔒 Door locked" : sub || "Door open — come on in");
    // room shell (always built; locked ones stay empty and unreachable)
    floorTile(x0, x1, zc - ROOM / 2, zc + ROOM / 2, "#b08a62");
    wallZ(side * (hx + ROOM), zc - ROOM / 2, zc + ROOM / 2);
    lightPanel((x0 + x1) / 2, zc);
    const rm = { x0, x1, z0: zc - ROOM / 2, z1: zc + ROOM / 2, owner: p, side };
    rooms.push(rm);
    if (!p.locked) { rect(x0 + R, x1 - R, rm.z0 + R, rm.z1 - R, "room:" + p.user_id); rect(Math.min(side * (hx - 0.7), side * (hx + 0.7)), Math.max(side * (hx - 0.7), side * (hx + 0.7)), zc - DOOR / 2 + 0.15, zc + DOOR / 2 - 0.15, null); }
  });
  for (let k = 0; k < slotsPerSide - 1; k++) { wallX(-k * ROOM - ROOM, -hx - ROOM, -hx); wallX(-k * ROOM - ROOM, hx, hx + ROOM); }
  wallZ(-hx, -L, 0, leftGaps.map((g) => ({ c: g.c, w: g.w }))); wallZ(hx, -L, 0, rightGaps.map((g) => ({ c: g.c, w: g.w })));

  // ---------- cubicle interiors ----------
  function furnishRoom(rm) {
    const p = rm.owner, mine = !!rm.mine;
    const d = mine ? myDesk || {} : p;
    const theme = THEME[d.theme] || THEME.sage;
    const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2;
    // back wall: for own room = z1 wall; for side rooms = outer x wall
    const g = new THREE.Group(); scene.add(g);
    if (mine) { g.position.set(cx, 0, rm.z1); g.rotation.y = Math.PI; }
    else { g.position.set(rm.side * (hx + ROOM), 0, cz); g.rotation.y = rm.side < 0 ? Math.PI / 2 : -Math.PI / 2; }
    // in g: back wall at z=0, room extends to +z (towards door). x across.
    box(0, H / 2, 0.07, ROOM - 0.1, H - 0.02, 0.02, mat(theme), g); // accent wall
    // desk
    box(0, 0.74, 0.55, 1.9, 0.06, 0.8, mat(PAL.oak, { roughness: 0.6 }), g);
    box(-0.85, 0.37, 0.55, 0.06, 0.72, 0.72, mat(PAL.wood), g); box(0.85, 0.37, 0.55, 0.06, 0.72, 0.72, mat(PAL.wood), g);
    box(0.25, 0.98, 0.35, 0.62, 0.38, 0.03, mat("#2b2f2a", { roughness: 0.4 }), g); box(0.25, 0.8, 0.38, 0.06, 0.12, 0.06, mat("#2b2f2a"), g);
    box(0.25, 0.98, 0.367, 0.56, 0.32, 0.005, mat("#4a6a5a", { emissive: "#6f9b82", emissiveIntensity: 0.35 }), g);
    box(-0.55, 0.82, 0.6, 0.12, 0.1, 0.12, mat(PAL.clay), g); // mug
    const lamp = box(-0.75, 1.05, 0.45, 0.18, 0.06, 0.18, mat("#f3d98b", { emissive: "#f3d98b", emissiveIntensity: 0.8 }), g);
    box(-0.75, 0.9, 0.45, 0.02, 0.3, 0.02, mat(PAL.ink), g);
    // chair
    box(0, 0.48, 1.3, 0.55, 0.08, 0.55, mat(PAL.forest), g); box(0, 0.8, 1.56, 0.55, 0.6, 0.06, mat(PAL.forest), g); box(0, 0.24, 1.3, 0.06, 0.45, 0.06, mat(PAL.ink), g);
    plant(0, 0, 0.9); g.add(scene.children.pop()); g.add(scene.children.pop()); g.add(scene.children.pop()); // (cheap reuse) placed below
    const pl = g.children.slice(-3); pl.forEach((m) => m.position.add(new THREE.Vector3(1.55, 0, 0.45)));
    // sign
    const name = d.nickname || p.display_name || me.display_name;
    plane(canvasTex(768, 256, (c, w, h) => {
      c.fillStyle = "#fffdf0"; c.fillRect(0, 0, w, h); c.strokeStyle = PAL.ink; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = PAL.moss; c.textAlign = "center"; c.font = "bold 56px Georgia, serif"; c.fillText(fit(c, name, w - 40), w / 2, 80);
      c.fillStyle = PAL.ink; c.font = "italic 38px 'Comic Sans MS','Marker Felt',Georgia,serif";
      wrap(c, d.sign_text || (mine ? "No sign yet — add one on your 2D desk" : ""), w / 2, 150, w - 60, 46, 2);
    }), 1.6, 0.53, 0, 2.2, 0.1, 0, g);
    // photo frames on the side walls
    const photos = (d.photos || []).slice(0, 8);
    const spots = [];
    for (let i = 0; i < photos.length; i++) {
      const sideWall = i % 2 ? 1 : -1, j = Math.floor(i / 2);
      spots.push({ x: sideWall * (ROOM / 2 - 0.08), z: 0.8 + (j % 2) * 1.2, y: j < 2 ? 1.7 : 1.15, ry: -sideWall * Math.PI / 2 });
    }
    rm.frames = photos.map((path, i) => {
      const s = spots[i]; const fr = new THREE.Group(); fr.position.set(s.x, s.y, s.z); fr.rotation.y = s.ry; g.add(fr);
      box(0, 0, -0.01, 0.78, 0.62, 0.03, mat(PAL.ink), fr);
      const pic = plane(null, 0.68, 0.52, 0, 0, 0.01, 0, fr, { color: "#ddd" }); return { path, pic };
    });
    rm.notesGroup = new THREE.Group(); rm.notesGroup.position.set(0, 0.775, 0.75); g.add(rm.notesGroup);
    rm.furnished = true;
  }
  function drawNotes(rm, list) {
    if (!rm?.notesGroup) return; rm.notesGroup.clear();
    const cols = ["#f8e58c", "#f6c3a8", "#cfe6b8", "#c9dcef"];
    list.slice(0, 8).forEach((n, i) => {
      const t = canvasTex(256, 256, (c, w, h) => { c.fillStyle = cols[i % 4]; c.fillRect(0, 0, w, h); c.fillStyle = PAL.ink; c.font = "bold 22px system-ui"; c.fillText(fit(c, n.author_name || "Someone", w - 20), 12, 30);
        c.font = "20px 'Comic Sans MS','Marker Felt',system-ui"; wrap(c, n.body, 12, 62, w - 24, 24, 8); });
      const m = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.rotation.z = (i % 3 - 1) * 0.12;
      m.scale.set(0.2, 0.2, 1); m.position.set(-0.75 + (i % 4) * 0.22 + (i > 3 ? 0.11 : 0), 0.002 + i * 0.0005, -0.18 + (i > 3 ? 0.25 : 0)); rm.notesGroup.add(m);
    });
  }
  rooms.forEach((rm) => { if (rm.mine || !rm.owner.locked) furnishRoom(rm); });
  drawNotes(rooms[0], notes);

  // ---------- gallery ----------
  const GW = 18, GD = 14, gz0 = -L, gz1 = -L - GD, gx = GW / 2;
  floorTile(-gx, gx, gz1, gz0, "#d8cfbd");
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), mat(PAL.sage)); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, (gz0 + gz1) / 2); scene.add(rug);
  wallX(gz0, -gx, gx, [{ c: 0, w: HALL }]); wallX(gz1, -gx, gx); wallZ(-gx, gz1, gz0); wallZ(gx, gz1, gz0);
  rect(-gx + R, gx - R, gz1 + R, gz0 - R, "gallery");
  for (let x = -6; x <= 6; x += 4) for (let z = gz0 - 3; z >= gz1 + 3; z -= 4) lightPanel(x, z, 1.4, 0.7);
  // bench
  box(0, 0.42, (gz0 + gz1) / 2, 2.4, 0.08, 0.6, mat(PAL.oak, { roughness: 0.6 })); box(-1, 0.2, (gz0 + gz1) / 2, 0.08, 0.4, 0.5, mat(PAL.moss)); box(1, 0.2, (gz0 + gz1) / 2, 0.08, 0.4, 0.5, mat(PAL.moss));
  plant(-gx + 0.6, gz0 - 0.6, 1.3); plant(gx - 0.6, gz0 - 0.6, 1.3); plant(-gx + 0.6, gz1 + 0.6, 1.3); plant(gx - 0.6, gz1 + 0.6, 1.3);
  // art spots: back wall (z=gz1) and side walls
  const artSpots = [];
  [-5.5, 0, 5.5].forEach((x) => artSpots.push({ x, z: gz1 + 0.09, ry: 0 }));
  [gz0 - 3.2, gz1 + 3.2].forEach((z) => { artSpots.push({ x: -gx + 0.09, z, ry: Math.PI / 2 }); artSpots.push({ x: gx - 0.09, z, ry: -Math.PI / 2 }); });
  const artMeshes = [];
  const byPos = new Map(art.map((a) => [a.position, a]));
  [1, 2].forEach((p) => { if (!byPos.has(p)) byPos.set(p, { id: "static-" + p, position: p, image_path: null }); });
  const sorted = [...byPos.values()].sort((a, b) => a.position - b.position).map((a) => {
    const st = !a.image_path && STATIC_ART[a.position];
    return st ? { ...a, title: st.title, artist: st.artist, static: st } : a;
  });
  sorted.slice(0, artSpots.length).forEach((a, i) => {
    const s = artSpots[i]; const g = new THREE.Group(); g.position.set(s.x, 1.75, s.z); g.rotation.y = s.ry; scene.add(g);
    if (a.static) { // portrait frame sized to the painting (4:5), no stretching
      const ph = 1.5, pw = ph * a.static.aspect;
      box(0, 0, 0, pw + 0.28, ph + 0.28, 0.06, mat("#2c2a24", { roughness: 0.5 }), g); box(0, 0, 0.03, pw + 0.12, ph + 0.12, 0.02, mat("#f8f5ec"), g);
      const pic = plane(canvasTex(8, 8, (c, w, h) => { c.fillStyle = "#e8e4d8"; c.fillRect(0, 0, w, h); }), pw, ph, 0, 0, 0.05, 0, g);
      plane(plate(a.title, "by " + a.artist, { w: 1152, h: 140, bg: PAL.paper, fg: PAL.ink, accent: PAL.forest }), 1.3, 0.158, 0, -(ph / 2 + 0.3), 0.03, 0, g);
      artMeshes.push({ a, pic }); return;
    }
    box(0, 0, 0, 2.1, 1.6, 0.06, mat("#2c2a24", { roughness: 0.5 }), g); box(0, 0, 0.03, 1.9, 1.4, 0.02, mat("#f8f5ec"), g);
    const placeholder = canvasTex(512, 384, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h); const hues = [[PAL.sage, PAL.paper], ["#e9d9b8", "#cfdcc4"], ["#d9cde8", PAL.paper], ["#c6dceb", "#e8e4d8"], ["#f0d3c2", PAL.paper], ["#cfdcc4", "#f6e2a6"]][i % 6];
      gr.addColorStop(0, hues[0]); gr.addColorStop(1, hues[1]); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.globalAlpha = 0.25; c.fillStyle = PAL.forest; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc((k * 97 + i * 53) % w, (k * 61 + i * 31) % h, 30 + k * 12, 0, 7); c.fill(); }
      c.globalAlpha = 1; c.fillStyle = PAL.moss; c.textAlign = "center"; c.font = "italic 34px Georgia, serif"; c.fillText("Art coming soon", w / 2, h / 2 - 8); c.font = "26px Georgia, serif"; c.fillText("from Moth", w / 2, h / 2 + 30);
    });
    const pic = plane(placeholder, 1.7, 1.25, 0, 0, 0.05, 0, g);
    plane(plate(a.title, a.artist ? "by " + a.artist : "", { w: 512, h: 128, bg: PAL.paper, fg: PAL.ink, accent: PAL.forest }), 0.7, 0.18, 0, -1.05, 0.03, 0, g);
    artMeshes.push({ a, pic });
  });
  // notice board on the side near the entrance (left wall center)
  const nb = new THREE.Group(); nb.position.set(-gx + 0.09, 1.6, (gz0 + gz1) / 2); nb.rotation.y = Math.PI / 2; scene.add(nb);
  box(0, 0, 0, 2.6, 1.7, 0.06, mat(PAL.wood), nb);
  const noticeTex = () => canvasTex(1024, 680, (c, w, h) => {
    c.fillStyle = "#c9a57a"; c.fillRect(0, 0, w, h); c.fillStyle = PAL.moss; c.fillRect(0, 0, w, 90); c.fillStyle = PAL.paper; c.font = "bold 54px Georgia, serif"; c.textAlign = "center"; c.fillText("Notice board", w / 2, 64);
    c.textAlign = "left"; const list = [...notices].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created_at) - new Date(a.created_at))).slice(0, 4);
    if (!list.length) { c.fillStyle = PAL.ink; c.font = "italic 36px Georgia"; c.fillText("No notices right now.", 60, 180); }
    list.forEach((n, i) => { const x = 40 + (i % 2) * 490, y = 120 + Math.floor(i / 2) * 270; c.fillStyle = i % 2 ? "#fffdf0" : "#f8e58c"; c.fillRect(x, y, 450, 240);
      c.fillStyle = PAL.clay; c.beginPath(); c.arc(x + 225, y + 14, 10, 0, 7); c.fill(); c.fillStyle = PAL.ink; c.font = "bold 32px Georgia, serif"; wrap(c, (n.pinned ? "📌 " : "") + n.title, x + 20, y + 60, 410, 36, 2);
      c.font = "24px system-ui, sans-serif"; wrap(c, n.body, x + 20, y + 140, 410, 28, 3); });
  });
  plane(noticeTex(), 2.45, 1.55, 0, 0, 0.04, 0, nb);
  // Gremlin World door (fun sign, not functional) on the right wall
  const gwz = (gz0 + gz1) / 2;
  door(gx - 0.09, gwz, -Math.PI / 2, true, "Gremlin World", "");
  plane(canvasTex(768, 320, (c, w, h) => { c.fillStyle = "#f6e2a6"; c.fillRect(0, 0, w, h); c.strokeStyle = PAL.ink; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = PAL.moss; c.textAlign = "center"; c.font = "bold 58px Georgia, serif"; c.fillText("Gremlin World", w / 2, 80);
    c.fillStyle = PAL.ink; c.font = "italic 36px 'Comic Sans MS','Marker Felt',Georgia"; wrap(c, "the gremlins have us locked in here right now", w / 2, 150, w - 80, 44, 3); c.font = "44px serif"; c.fillText("🔒 👀", w / 2, 290); }),
    1.3, 0.54, gx - 0.1, 2.3, gwz + 1.35, -Math.PI / 2);
  // welcome sign over the hallway entrance (gallery side)
  plane(plate("The Gallery", "Art · Notices · Good company", { w: 768, h: 180 }), 2.4, 0.56, 0, 2.6, gz0 - 0.08, Math.PI);

  // ---------- photos & art textures (signed URLs, loaded lazily) ----------
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
  const applyTex = (mesh, url) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; mesh.material.map = t; mesh.material.color.set("#fff"); mesh.material.needsUpdate = true; });
  async function loadPhotos(rm) {
    if (rm.photosLoaded || !rm.frames?.length || !api.photoUrls) return; rm.photosLoaded = true;
    const urls = await api.photoUrls(rm.frames.map((f) => f.path)); rm.frames.forEach((f) => urls[f.path] && applyTex(f.pic, urls[f.path]));
  }
  loadPhotos(rooms[0]);
  artMeshes.forEach((m) => m.a.static && applyTex(m.pic, m.a.static.src));
  if (api.artUrls) api.artUrls(artMeshes.filter((m) => m.a.image_path).map((m) => m.a.image_path)).then((u) => artMeshes.forEach((m) => m.a.image_path && u[m.a.image_path] && applyTex(m.pic, u[m.a.image_path])));

  // ---------- HUD ----------
  const hud = document.createElement("div"); hud.className = "o3-hud"; root.appendChild(hud);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const top = el("div", "o3-top"); hud.appendChild(top);
  const where = el("div", "o3-where", "Your cubicle"); top.appendChild(where);
  const exit = el("button", "o3-btn", "← Back to my desk"); exit.onclick = () => api.exit?.(); top.appendChild(exit);
  const onl = el("div", "o3-online"); hud.appendChild(onl);
  function renderOnline(set) {
    onl.textContent = ""; onl.appendChild(el("b", null, `${set.size} online`));
    floor.filter((p) => set.has(p.user_id)).slice(0, 12).forEach((p) => { const r = el("div"); r.appendChild(el("span", "dot on")); r.appendChild(document.createTextNode(p.nickname || p.display_name)); onl.appendChild(r); });
  }
  renderOnline(online);
  const actions = el("div", "o3-actions"); hud.appendChild(actions);
  const help = el("div", "o3-help", matchMedia("(pointer:coarse)").matches ? "Drag to look · joystick to walk" : "WASD / arrows to walk · drag to look"); hud.appendChild(help);
  const panel = el("div", "o3-panel"); panel.hidden = true; hud.appendChild(panel);
  const closePanel = () => { panel.hidden = true; panel.textContent = ""; };
  function openPanel(title, build) { panel.textContent = ""; panel.hidden = false; const h = el("h3", null, title); panel.appendChild(h); build(panel); const x = el("button", "o3-btn ghost", "Close"); x.onclick = closePanel; panel.appendChild(x); }
  let myLock = myLocked, myNotes = notes;
  function lockBtn() { const b = el("button", "o3-btn", myLock ? "🔓 Unlock my door" : "🔒 Lock my door");
    b.onclick = async () => { b.disabled = true; const ok = await api.setLocked?.(!myLock); b.disabled = false; if (ok !== false) { myLock = !myLock; updateActions(true); toast3(myLock ? "Door locked. Visitors can't come in." : "Door unlocked. Visitors welcome!"); } }; return b; }
  function notesBtn() { return Object.assign(el("button", "o3-btn", `🗒 Notes on my desk (${myNotes.length})`), { onclick: () => openPanel("Notes on your desk", (p) => {
    if (!myNotes.length) p.appendChild(el("p", null, "No notes yet."));
    myNotes.forEach((n) => { const r = el("div", "o3-note"); r.appendChild(el("b", null, (n.author_name || "Someone") + ": ")); r.appendChild(document.createTextNode(n.body));
      const d = el("button", "o3-btn small warn", "Delete"); d.onclick = async () => { if (await api.deleteNote?.(n.id) !== false) { myNotes = myNotes.filter((x) => x.id !== n.id); drawNotes(rooms[0], myNotes); r.remove(); updateActions(true); } }; r.appendChild(d); p.appendChild(r); });
  }) }); }
  function leaveNoteBtn(p) { return Object.assign(el("button", "o3-btn", `✏️ Leave a note for ${p.nickname || p.display_name}`), { onclick: () => openPanel(`Note for ${p.nickname || p.display_name}`, (pn) => {
    const ta = el("textarea"); ta.maxLength = 280; ta.placeholder = "Say something nice (280 characters max)"; pn.appendChild(ta);
    const cnt = el("div", "o3-small", "0 / 280"); ta.oninput = () => (cnt.textContent = `${ta.value.length} / 280`); pn.appendChild(cnt);
    const s = el("button", "o3-btn", "Stick it on the desk"); s.onclick = async () => { const v = ta.value.trim(); if (!v) return; s.disabled = true; const ok = await api.leaveNote?.(p.user_id, v); s.disabled = false; if (ok !== false) { closePanel(); toast3("Note left! Only they can read it."); } }; pn.appendChild(s);
    setTimeout(() => ta.focus(), 50);
  }) }); }
  function noticesBtn() { return Object.assign(el("button", "o3-btn", "📌 Read the notice board"), { onclick: () => openPanel("Notices", (p) => {
    if (!notices.length) p.appendChild(el("p", null, "No notices right now."));
    notices.forEach((n) => { const r = el("div", "o3-note"); r.appendChild(el("b", null, (n.pinned ? "📌 " : "") + n.title)); r.appendChild(el("div", null, n.body)); r.appendChild(el("div", "o3-small", new Date(n.created_at).toLocaleDateString())); p.appendChild(r); });
  }) }); }
  function artBtn(a) { return Object.assign(el("button", "o3-btn ghost", `🖼 Look closer: ${a.title}`), { onclick: () => openArt(a) }); }
  function openArt(a) { openPanel(a.title, (p) => {
    const im = el("img", "o3-art"); im.src = a.static.src; im.alt = a.title; p.appendChild(im);
    p.appendChild(el("p", "o3-credit", "by " + a.artist)); p.appendChild(el("p", null, a.static.description));
    if (a.static.find?.length) p.appendChild(el("p", "o3-find", "Things to find: " + a.static.find.join(", ") + "."));
  }); }
  const toastEl = el("div", "o3-toast"); hud.appendChild(toastEl);
  function toast3(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastEl._h); toastEl._h = setTimeout(() => toastEl.classList.remove("show"), 3000); }
  let curZone = null;
  function updateActions(force) {
    const z = zoneAt(pos.x, pos.z); if (z === curZone && !force) return; curZone = z; actions.textContent = "";
    if (z === "own") { where.textContent = "Your cubicle"; actions.append(lockBtn(), notesBtn()); }
    else if (z === "hall") { where.textContent = "Hallway"; }
    else if (z === "gallery") { where.textContent = "The Gallery"; actions.append(noticesBtn(), ...artMeshes.filter((m) => m.a.static).map((m) => artBtn(m.a))); }
    else if (z?.startsWith("room:")) { const p = floor.find((x) => "room:" + x.user_id === z); where.textContent = `${p.nickname || p.display_name}'s cubicle`; actions.append(leaveNoteBtn(p)); loadPhotos(rooms.find((r) => r.owner === p)); }
    // door state for own door mesh
    ownDoor.children[3] && (ownDoor.children[3].rotation.y = myLock ? 0 : 1.35);
  }
  function zoneAt(x, z) { for (const r of walkable) if (r.room && x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 - 0.01 && z <= r.z1 + 0.01) return r.room; return curZone; }
  const inside = (x, z) => walkable.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

  // ---------- controls ----------
  const pos = new THREE.Vector3(0, EYE, 1.5); let yaw = 0, pitch = -0.05; // facing -z (towards door)
  if (opts.start) { pos.x = opts.start.x; pos.z = opts.start.z; yaw = opts.start.yaw ?? 0; pitch = opts.start.pitch ?? -0.05; }
  // own room faces desk at z=ROOM; start looking at the desk
  if (!opts.start) yaw = Math.PI;
  const keys = {}; const kd = (e) => { if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return; keys[e.key.toLowerCase()] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); };
  const ku = (e) => (keys[e.key.toLowerCase()] = false);
  addEventListener("keydown", kd); addEventListener("keyup", ku);
  const cv = renderer.domElement; cv.style.touchAction = "none";
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag || drag.id !== e.pointerId) return; const s = e.pointerType === "touch" ? 0.006 : 0.004;
    yaw -= (e.clientX - drag.x) * s; pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - drag.y) * s)); drag.x = e.clientX; drag.y = e.clientY; });
  const endDrag = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
  cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
  // joystick
  const joy = el("div", "o3-joy"); const knob = el("div", "o3-knob"); joy.appendChild(knob); hud.appendChild(joy);
  let jv = { x: 0, y: 0 }, jid = null;
  const jmove = (e) => { const r = joy.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy), max = r.width / 2;
    if (m > max) { dx *= max / m; dy *= max / m; } jv = { x: dx / max, y: dy / max }; knob.style.transform = `translate(${dx}px,${dy}px)`; };
  joy.addEventListener("pointerdown", (e) => { jid = e.pointerId; joy.setPointerCapture(e.pointerId); jmove(e); e.stopPropagation(); });
  joy.addEventListener("pointermove", (e) => e.pointerId === jid && jmove(e));
  const jend = (e) => { if (e.pointerId !== jid) return; jid = null; jv = { x: 0, y: 0 }; knob.style.transform = ""; };
  joy.addEventListener("pointerup", jend); joy.addEventListener("pointercancel", jend);

  function resize() { const w = root.clientWidth, h = root.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();
  let last = performance.now(), raf = 0, alive = true;
  function tick(now) {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let f = 0, s = 0;
    if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1; if (keys.a) s -= 1; if (keys.d) s += 1;
    if (keys.arrowleft || keys.q) yaw += 1.8 * dt; if (keys.arrowright || keys.e) yaw -= 1.8 * dt;
    f += -jv.y; s += jv.x;
    if (f || s) {
      const sp = (keys.shift ? 4.2 : 2.6) * dt, l = Math.max(1, Math.hypot(f, s));
      const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) / l * sp, dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) / l * sp;
      if (inside(pos.x + dx, pos.z)) pos.x += dx; if (inside(pos.x, pos.z + dz)) pos.z += dz;
      updateActions();
    }
    pos.y = EYE + ((f || s) ? Math.sin(now / 140) * 0.02 : 0);
    cam.position.copy(pos); cam.rotation.set(pitch, yaw, 0);
    renderer.render(scene, cam);
  }
  updateActions(true); raf = requestAnimationFrame(tick);
  return {
    setOnline: renderOnline,
    teleport(x, z, y, p = -0.05) { pos.x = x; pos.z = z; yaw = y; pitch = p; updateActions(true); },
    layout: { L, gz0, gz1, hx },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("keydown", kd); removeEventListener("keyup", ku); renderer.dispose(); root.innerHTML = ""; },
  };
}
