// Desks 3D office. Procedural geometry only; all text is drawn on canvases (never HTML).
import * as THREE from "./vendor/three.module.min.js";
import { createAnnex } from "./annex.js"; // The Loose Stitch -> Elsewhere Annex (Desks only)

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
// Static, approved gallery art shipped with the frontend (frames 1-7, wording from gallery-labels.md).
// A gallery_art row with an uploaded image_path at the same position overrides the static piece; no DB changes needed.
const STATIC_ART = {
  1: { title: "Tea Under the Old Oak", artist: "Moth's Design Studio", src: "assets/gallery/tea-under-the-old-oak.webp", thumb: "assets/gallery/tea-under-the-old-oak-thumb.webp", aspect: 1280 / 1600,
    description: "An old tea-keeper takes a quiet cup under a great oak at golden hour, with a path winding toward a garden gate.",
    find: ["A little gremlin peeking out of the oak trunk, upper left", "A tiny moth on the teapot lid", "Teaspoon the snail on the left bench arm", "Clover the rabbit with his pocket watch, on the footbridge", "Mossbun in the grass, lower right", "A seedling sprout in the path, bottom center", "One lit lamp among the paper lanterns, far right (Glim's glow)", "The arched garden gate in the stone wall (the quest game's Doorway)"] },
  2: { title: "Still Life with Tea and Small Visitors", artist: "Moth's Design Studio", src: "assets/gallery/still-life-with-tea-and-small-visitors.webp", thumb: "assets/gallery/still-life-with-tea-and-small-visitors-thumb.webp", aspect: 1280 / 1600,
    description: "Cream and white blooms in a celadon vase glow against a dark green niche beside a cup of tea, a peeled lemon and a pocket watch.",
    find: ["A cream moth on the big white peony, upper left", "A snail on the vase's left handle", "Glim's tiny glowing lamp in the leaves right of the vase", "A gremlin face peeking out behind the vase base", "Pebbo the apricot pebble with a tiny feather, on the ledge right of center", "A seedling on the ledge, front left", "A ladybird on the ledge, far left", "A blossom floating in the tea", "A pocket watch, lower right (a nod to Clover)"] },
  3: { title: "Healing Herbs Plate", artist: "Moth's Design Studio", src: "assets/gallery/healing-herbs-plate.webp", thumb: "assets/gallery/healing-herbs-plate-thumb.webp", aspect: 1280 / 1600,
    description: "A vintage botanical plate of yarrow, chamomile, lavender and plantain, drawn in fine ink with soft sage watercolor.",
    find: ["A small moth on the lavender stem, left middle", "A seedling at the bottom center"] },
  4: { title: "Morning Check-In, Highlands", artist: "Moth's Design Studio", src: "assets/gallery/morning-check-in-highlands.webp", thumb: "assets/gallery/morning-check-in-highlands-thumb.webp", aspect: 1600 / 1280,
    description: "Sunrise over the wooded ridges of the New Jersey Highlands, with mist in the valley, a farm field and an old barn.",
    find: ["A small moth on the fence post, left of center", "A friendly gremlin peeking over the hay bale, center"] },
  5: { title: "Slow Hands", artist: "Moth's Design Studio", src: "assets/gallery/slow-hands.webp", thumb: "assets/gallery/slow-hands-thumb.webp", aspect: 1280 / 1600,
    description: "Layered sage, cream and dark-green ribbons that sweep like slow, gentle strokes.",
    find: ["A tiny moth silhouette, lower right"] },
  6: { title: "Three Stones", artist: "Moth's Design Studio", src: "assets/gallery/three-stones.webp", thumb: "assets/gallery/three-stones-thumb.webp", aspect: 1280 / 1600,
    description: "Three pale stones carved with simple Nordic rune shapes (a design motif only), on sage linen against a dark green wall.",
    find: ["A seedling sprouting from the linen fold, front left"] },
  7: { title: "Desks Floor Plan (Gremlin Edition)", artist: "Moth's Design Studio", src: "assets/gallery/desks-floor-plan-gremlin-edition.webp", thumb: "assets/gallery/desks-floor-plan-gremlin-edition-thumb.webp", aspect: 1600 / 1280,
    description: "A hand-drawn floor plan of Desks, with cubicles along a hallway that opens into the gallery. At the end of the hallway is a locked door with a taped-up note: \"Gremlin World, the gremlins have us locked in here right now.\"",
    find: ["Gremlin eyes and green fingers at the padlocked door, west end of the hallway", "A tiny moth in the gallery's lower right", "A seedling in the 4th cubicle on the bottom row"] },
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
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 50); cam.rotation.order = "YXZ";
  const hemi = new THREE.HemisphereLight("#fff6e6", "#7d8a6e", 1.25); scene.add(hemi);
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
  const wallM = mat(PAL.paper), trimM = mat(PAL.forest, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), ceilM = mat("#f5f1e7", { emissive: "#efe7d6", emissiveIntensity: 0.55 });
  // Wall along X at fixed z, from x0..x1, with door gaps [{c,w}]
  // baseboards: lifted off the floor and given a tiny unique height so crossing trims never share a face (no z-fighting)
  let trimK = 0; const trimH = () => 0.12 + (trimK++ % 7) * 0.003;
  function wallX(z, x0, x1, gaps = [], m = wallM) {
    let cur = x0; [...gaps].sort((a, b) => a.c - b.c).forEach((g) => {
      if (g.c - g.w / 2 > cur) box((cur + g.c - g.w / 2) / 2, H / 2, z, g.c - g.w / 2 - cur, H, T, m);
      box(g.c, (H + 2.2) / 2, z, g.w, H - 2.2, T, m); cur = g.c + g.w / 2;
    });
    if (x1 > cur) box((cur + x1) / 2, H / 2, z, x1 - cur, H, T, m);
    { const th = trimH(); box((x0 + x1) / 2, 0.004 + th / 2, z, x1 - x0 - 0.002, th, T + 0.04, trimM); }
  }
  function wallZ(x, z0, z1, gaps = [], m = wallM) {
    let cur = z0; [...gaps].sort((a, b) => a.c - b.c).forEach((g) => {
      if (g.c - g.w / 2 > cur) box(x, H / 2, (cur + g.c - g.w / 2) / 2, T, H, g.c - g.w / 2 - cur, m);
      box(x, (H + 2.2) / 2, g.c, T, H - 2.2, g.w, m); cur = g.c + g.w / 2;
    });
    if (z1 > cur) box(x, H / 2, (cur + z1) / 2, T, H, z1 - cur, m);
    { const th = trimH(); box(x, 0.004 + th / 2, (z0 + z1) / 2, T + 0.044, th, z1 - z0 - 0.002, trimM); }
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
    // door frame: jambs overlap the wall ends by 1cm and stand 3.5/4.5cm proud so no face is coplanar with the wall
    box(0, 2.225, 0, DOOR + 0.19, 0.09, T + 0.07, trimM, g); box(-DOOR / 2 - 0.035, 1.105, 0, 0.09, 2.19, T + 0.09, trimM, g); box(DOOR / 2 + 0.035, 1.105, 0, 0.09, 2.19, T + 0.09, trimM, g);
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
    const g = new THREE.Group(); scene.add(g); rm.g = g; // (the Annex can mount things on desk walls)
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
  // art spots: 3 on the back wall, 2 per side wall clear of the notice board (left, centre) and the Gremlin World door + sign (right, centre)
  const artSpots = {
    1: { x: -5.5, z: gz1 + 0.1, ry: 0 }, 2: { x: 0, z: gz1 + 0.1, ry: 0 }, 3: { x: 5.5, z: gz1 + 0.1, ry: 0 },
    4: { x: -gx + 0.1, z: gz0 - 2.8, ry: Math.PI / 2 }, 5: { x: -gx + 0.1, z: gz1 + 2.8, ry: Math.PI / 2 },
    6: { x: gx - 0.1, z: gz1 + 2.8, ry: -Math.PI / 2 }, 7: { x: gx - 0.1, z: gz0 - 2.8, ry: -Math.PI / 2 },
  };
  const artMeshes = [];
  const byPos = new Map(art.map((a) => [a.position, a]));
  Object.keys(artSpots).map(Number).forEach((p) => {
    const row = byPos.get(p), st = STATIC_ART[p], s = artSpots[p];
    const a = row?.image_path ? { ...row, title: row.title || st.title, artist: row.artist || st.artist, aspect: st.aspect } // uploaded art wins
      : { id: row?.id ?? "static-" + p, position: p, image_path: null, title: st.title, artist: st.artist, aspect: st.aspect, static: st };
    const g = new THREE.Group(); g.position.set(s.x, 1.75, s.z); g.rotation.y = s.ry; scene.add(g);
    const land = a.aspect > 1, ph = land ? 1.3 : 1.5, pw = ph * a.aspect;
    box(0, 0, 0, pw + 0.28, ph + 0.28, 0.06, mat("#2c2a24", { roughness: 0.5 }), g); box(0, 0, 0.035, pw + 0.12, ph + 0.12, 0.02, mat("#f8f5ec"), g);
    const pic = plane(canvasTex(8, 8, (c, w, h) => { c.fillStyle = "#e8e4d8"; c.fillRect(0, 0, w, h); }), pw, ph, 0, 0, 0.055, 0, g);
    plane(plate(a.title, "by " + a.artist, { w: 1152, h: 140, bg: PAL.paper, fg: PAL.ink, accent: PAL.forest }), 1.3, 0.158, 0, -(ph / 2 + 0.3), 0.03, 0, g);
    const wp = new THREE.Vector3(); g.getWorldPosition(wp);
    artMeshes.push({ a, pic, wp, url: a.static?.src || null });
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

  // ---------- ceiling oddities (look up!) — own cubicle + hallway, procedural only ----------
  const ceilFx = { fan: null };
  {
    // upside-down tiny desk + chair, legs glued to the ceiling
    const ud = new THREE.Group(); ud.position.set(-1.15, H - 0.001, 2.3); ud.rotation.set(Math.PI, 0.5, 0); ud.scale.setScalar(0.42); scene.add(ud);
    box(0, 0.74, 0, 1.6, 0.06, 0.8, mat(PAL.oak, { roughness: 0.6 }), ud);
    [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]].forEach(([x, z]) => box(x, 0.36, z, 0.06, 0.72, 0.06, mat(PAL.wood), ud));
    box(0.3, 0.92, -0.1, 0.5, 0.3, 0.03, mat("#2b2f2a"), ud); box(-0.4, 0.83, 0.1, 0.12, 0.12, 0.12, mat(PAL.clay), ud);
    box(0, 0.46, 0.85, 0.5, 0.07, 0.5, mat(PAL.forest), ud); box(0, 0.78, 1.08, 0.5, 0.55, 0.06, mat(PAL.forest), ud); box(0, 0.22, 0.85, 0.06, 0.44, 0.06, mat(PAL.ink), ud);
    // a striped sock stuck to a ceiling tile
    const sockT = canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#e8573f" : "#f4efe2"; c.fillRect(0, i * 8, w, 8); } });
    const sock = new THREE.Group(); sock.position.set(1.25, H - 0.02, 3.1); sock.rotation.y = -0.6; scene.add(sock);
    const sm = new THREE.MeshStandardMaterial({ map: sockT, roughness: 1 });
    box(0, 0, 0, 0.13, 0.025, 0.42, sm, sock); box(0.08, 0, 0.24, 0.28, 0.025, 0.13, sm, sock); box(0.2, -0.005, 0.24, 0.07, 0.03, 0.12, mat("#e8573f"), sock);
    // "you looked up!" sticky note
    const sticky = plane(canvasTex(256, 256, (c, w, h) => { c.fillStyle = "#f8e58c"; c.fillRect(0, 0, w, h); c.fillStyle = PAL.ink; c.textAlign = "center";
      c.font = "bold 40px 'Comic Sans MS','Marker Felt',system-ui"; c.fillText("you", w / 2, 80); c.fillText("looked", w / 2, 128); c.fillText("up!", w / 2, 176); c.font = "38px serif"; c.fillText("👀", w / 2, 228); }),
      0.32, 0.32, 1.0, H - 0.006, 2.0, 0);
    sticky.rotation.set(Math.PI / 2, 0, Math.PI + 0.3); // reads upright when you look up from your chair
    // ceiling fan with a rubber duck riding one blade
    const fan = new THREE.Group(); fan.position.set(0.2, H, 3.05); scene.add(fan);
    const cyl = (r, h, m, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    const rod = cyl(0.025, 0.1, mat(PAL.ink)); rod.position.y = -0.05; fan.add(rod);
    const hub = cyl(0.1, 0.08, mat("#c9b27a", { metalness: 0.5, roughness: 0.4 })); hub.position.y = -0.12; fan.add(hub);
    const blades = new THREE.Group(); blades.position.y = -0.13; fan.add(blades);
    for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.y = i * Math.PI / 2; blades.add(b); box(0.32, 0, 0, 0.5, 0.015, 0.12, mat(PAL.oak), b); }
    const duck = new THREE.Group(); duck.position.set(0.48, 0.05, 0); blades.add(duck);
    const sph = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
    const yel = mat("#ffd93b", { roughness: 0.5 });
    const body = sph(0.07, yel); body.scale.set(1.25, 0.8, 1); body.position.y = 0.04; duck.add(body);
    const head = sph(0.045, yel); head.position.set(0.06, 0.11, 0); duck.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 6), mat("#f28c28")); beak.rotation.z = -Math.PI / 2; beak.position.set(0.11, 0.105, 0); duck.add(beak);
    duck.rotation.y = Math.PI / 2; // duck faces the way the blade travels
    ceilFx.fan = blades;
    // gremlin footprints walking across the ceiling, out the door and down the hall
    const footT = canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#4f8a3c"; c.beginPath(); c.ellipse(64, 80, 26, 34, 0, 0, 7); c.fill();
      [[34, 34], [64, 22], [94, 34]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 11, 15, (x - 64) / 90, 0, 7); c.fill(); }); });
    const footM = new THREE.MeshStandardMaterial({ map: footT, transparent: true, alphaTest: 0.3, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const steps = [];
    for (let i = 0; i < 9; i++) steps.push([1.6 - i * 0.2, 3.7 - i * 0.42]); // cubicle, toward the door
    for (let i = 0; i < 12; i++) steps.push([0.0 + 0.55, -0.2 - i * 0.45]); // hallway
    steps.forEach(([x, z], i) => { const f = new THREE.Mesh(planeGeo, footM); f.rotation.set(Math.PI / 2, 0, 0); f.scale.set(0.14, 0.16, 1);
      const side = i % 2 ? 0.09 : -0.09; f.position.set(x + side, H - 0.004, z); scene.add(f); });
  }

  // ---------- "What's this?" portal pinned beside the notice board ----------
  const swirlTex = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(128, 128, 4, 128, 128, 128); g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, "#c8a6ff"); g.addColorStop(0.7, "#5b2db8"); g.addColorStop(1, "#1d0b44");
    c.fillStyle = g; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
    c.lineWidth = 7; c.lineCap = "round";
    for (let arm = 0; arm < 4; arm++) { c.strokeStyle = arm % 2 ? "rgba(140,255,214,.85)" : "rgba(255,255,255,.8)"; c.beginPath();
      for (let t = 0; t < 1; t += 0.02) { const a = arm * Math.PI / 2 + t * 7, r = 8 + t * 115; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  });
  const glowTex = canvasTex(128, 128, (c, w, h) => { const g = c.createRadialGradient(64, 64, 20, 64, 64, 64); g.addColorStop(0, "rgba(190,140,255,.9)"); g.addColorStop(1, "rgba(190,140,255,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  function makePortal(parent, x, y, z, ry, r, label) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
    const glow = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(r * 3.2, r * 3.2, 1); glow.position.z = -0.005; g.add(glow);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: swirlTex })); disc.position.z = 0.01; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.09, 8, 40), mat("#b48cff", { emissive: "#8f5cff", emissiveIntensity: 1.1 })); ring.position.z = 0.015; g.add(ring);
    if (label) plane(plate(label, null, { w: 512, h: 150, bg: "#3b1f73", fg: "#ffffff", accent: "#8cffd6" }), r * 2, r * 0.58, 0, r + 0.32, 0.01, 0, g);
    const wp = new THREE.Vector3(); g.updateWorldMatrix(true, false); g.getWorldPosition(wp);
    return { g, disc, glow, ring, wp, t: Math.random() * 6 };
  }
  const nbPortal = makePortal(nb, 1.95, -0.1, 0.05, 0, 0.5, "What's this?");
  const portals = [nbPortal];

  // ---------- The Cat House: climbing room for humans & gremlins (client-side only) ----------
  const CAT = { cx: 200, cz: 0, half: 8, h: 15, cw: 13 }; CAT.x0 = CAT.cx - CAT.half; CAT.x1 = CAT.cx + CAT.half; CAT.z0 = CAT.cz - CAT.half; CAT.z1 = CAT.cz + CAT.half;
  const cat = new THREE.Group(); scene.add(cat);
  const solids = []; // {x0,x1,z0,z1,y0,y1,name,bounce?,perch?}
  const solid = (x, z, w, d, y0, y1, m, o = {}) => { const s = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1, ...o }; solids.push(s); if (m) s.mesh = box(x, (y0 + y1) / 2, z, w, y1 - y0, d, m, cat); return s; };
  const ladders = []; // climb zones in front of each ladder
  const inst = { rung: [], post: [] }; // instanced (1 draw call each)
  const rimM = mat("#fffbe6", { emissive: "#fff3bf", emissiveIntensity: 0.9 });
  const rim = (x, z, w, d, top) => box(x, top - 0.06, z, w + 0.14, 0.1, d + 0.14, rimM, cat); // bright edge trim
  {
    const { cx, cz, half, h: CH, cw: CW } = CAT;
    const stripes = canvasTex(256, 256, (c, w, h) => { const cols = ["#f9dbe6", "#d9eef7", "#fcf0c6", "#e1f3e2", "#e8def8"]; cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * w / 5, 0, w / 5, h); });
      c.fillStyle = "rgba(90,60,40,.12)"; for (let i = 0; i < 6; i++) { const x = 30 + (i * 83) % 220, y = 30 + (i * 57) % 200; c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill(); [[-14, -14], [0, -20], [14, -14]].forEach(([a, b]) => { c.beginPath(); c.arc(x + a, y + b, 5, 0, 7); c.fill(); }); } });
    stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(3, 2.8);
    const wallCat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.95 });
    box(cx, CH / 2, CAT.z0 - 0.1, 2 * half + 0.4, CH, 0.2, wallCat, cat); box(cx, CH / 2, CAT.z1 + 0.1, 2 * half + 0.4, CH, 0.2, wallCat, cat);
    box(CAT.x0 - 0.1, CH / 2, cz, 0.2, CH, 2 * half, wallCat, cat); box(CAT.x1 + 0.1, CH / 2, cz, 0.2, CH, 2 * half, wallCat, cat);
    // bouncy trampoline-carpet floor
    const carpet = canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#7fb7a4"; c.fillRect(0, 0, w, h); c.fillStyle = "#94c9b6"; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(16 + i * 32 + (j % 2) * 16, 16 + j * 32, 7, 0, 7); c.fill(); } });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(8, 8);
    const fl = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.scale.set(2 * half, 2 * half, 1); fl.position.set(cx, 0, cz); cat.add(fl);
    const cl = new THREE.Mesh(planeGeo, mat("#fff4e0", { emissive: "#ffeccc", emissiveIntensity: 0.5 })); cl.rotation.x = Math.PI / 2; cl.scale.set(2 * half, 2 * half, 1); cl.position.set(cx, CH, cz); cat.add(cl);
    for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5], [0, 0]]) box(cx + x, CH - 0.03, cz + z, 2, 0.05, 2, mat("#fff7e0", { emissive: "#fff2cc", emissiveIntensity: 1.3 }), cat);
    const sisal = canvasTex(64, 64, (c, w, h) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? "#c7a46b" : "#b38e55"; c.fillRect(0, i * 4, w, 4); } }); sisal.wrapS = sisal.wrapT = THREE.RepeatWrapping;
    const postM = (len) => { const t = sisal.clone(); t.needsUpdate = true; t.repeat.set(2, len * 3); return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); };
    const post = (x, z, r, y0, y1, name) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 10), postM(y1 - y0)); m.position.set(x, (y0 + y1) / 2, z); cat.add(m); solid(x, z, r * 1.7, r * 1.7, y0, y1, null, { name }); };
    // central carpeted tower + top perch
    post(cx, cz, 0.7, 0, 10.8, "the tower");
    const PERCH = 10.95;
    solid(cx, cz, 2.8, 2.8, 10.8, PERCH, mat("#e03131", { emissive: "#e03131", emissiveIntensity: 0.15 }), { perch: true, name: "The Crown Perch" }); rim(cx, cz, 2.8, 2.8, PERCH);
    box(cx, PERCH + 0.004, cz, 2.5, 0.01, 2.5, mat("#f39a8e"), cat);
    // spiral of BIG platforms (2.45 m square, ~1.5x the old area), deep colours + bright rim + number
    const pcols = ["#d6336c", "#1c7ed6", "#f08c00", "#2f9e44", "#7048e8", "#e8590c"];
    const NP = 12, PR = 3.4, PS = 2.45;
    for (let i = 0; i < NP; i++) {
      const a = i * 0.9, x = cx + Math.sin(a) * PR, z = cz + Math.cos(a) * PR, top = 0.8 + i * 0.85, col = pcols[i % pcols.length];
      solid(x, z, PS, PS, top - 0.22, top, mat(col, { emissive: col, emissiveIntensity: 0.18 }), { name: `Platform ${i + 1}` }); rim(x, z, PS, PS, top);
      const num = plane(canvasTex(128, 128, (c, w, h) => { c.fillStyle = "rgba(255,255,255,.92)"; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill(); c.fillStyle = col; c.font = "bold 72px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(i + 1), 64, 68); }),
        0.7, 0.7, x, top + 0.006, z, 0, cat, { transparent: true }); num.rotation.set(-Math.PI / 2, 0, a);
      const arm = new THREE.Mesh(boxGeo, mat(PAL.wood)); arm.scale.set(0.18, 0.14, PR - 0.8); arm.position.set(cx + Math.sin(a) * PR / 2, top - 0.32, cz + Math.cos(a) * PR / 2); arm.rotation.y = a; cat.add(arm);
    }
    // cubby holes along the west wall (stand on top), one with gremlin eyes
    const cubbyFace = (eyes) => canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#e9b97a"; c.fillRect(0, 0, w, h); c.fillStyle = "#3a2a1c"; c.beginPath(); c.arc(64, 70, 42, 0, 7); c.fill();
      if (eyes) { c.fillStyle = "#c6ff6b"; c.beginPath(); c.ellipse(48, 64, 8, 11, 0, 0, 7); c.ellipse(80, 64, 8, 11, 0, 0, 7); c.fill(); c.fillStyle = "#111"; c.fillRect(46, 60, 4, 8); c.fillRect(78, 60, 4, 8); } });
    [-3.4, -1.1, 1.2, 3.5].forEach((dz, i) => { solid(CAT.x0 + 1.1, cz + dz, 2.2, 2.2, 0, 1.5, mat("#d9a565"), { name: "a cubby top" });
      plane(cubbyFace(i === 2), 1.8, 1.3, CAT.x0 + 2.21, 0.75, cz + dz, Math.PI / 2, cat); });
    solid(CAT.x0 + 1.2, cz, 2.4, 6, 4.0, 4.2, mat("#1c7ed6", { emissive: "#1c7ed6", emissiveIntensity: 0.15 }), { name: "the high ledge" }); rim(CAT.x0 + 1.2, cz, 2.4, 6, 4.2);
    // ramp up the east wall onto a ledge (collision = small steps, visual = smooth slope)
    const RH = 2.6, rx = CAT.x1 - 1.2;
    for (let k = 0; k < 10; k++) solid(rx, cz + 5 - (k + 0.5) * 0.5, 2.0, 0.5, 0, RH * (k + 1) / 10, null, { name: "the ramp" });
    const ramp = new THREE.Mesh(boxGeo, mat("#f6d26b")); const rl = Math.hypot(5, RH); ramp.scale.set(2.0, 0.12, rl); ramp.position.set(rx, RH / 2, cz + 2.5); ramp.rotation.x = Math.atan2(RH, 5); cat.add(ramp);
    solid(CAT.x1 - 1.2, cz - 2, 2.4, 4, RH - 0.2, RH, mat("#2f9e44", { emissive: "#2f9e44", emissiveIntensity: 0.15 }), { name: "the ramp ledge" }); rim(CAT.x1 - 1.2, cz - 2, 2.4, 4, RH);
    // bouncy cushions (launch you up)
    const cushion = (x, z, y, r, col, v) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.35, 16), mat(col, { roughness: 0.7 })); m.position.set(x, y + 0.175, z); cat.add(m);
      return solid(x, z, r * 1.6, r * 1.6, y, y + 0.35, null, { bounce: v, mesh: m, name: "a bouncy cushion" }); };
    cushion(CAT.x0 + 3.1, cz, 0, 0.75, "#ff6fa8", 12.5);
    cushion(cx - 4.5, cz - 5.5, 0, 0.7, "#ffb347", 12);
    cushion(cx + 4.6, cz + 5.6, 0, 0.7, "#9b7bff", 12);
    cushion(CAT.x0 + 1.2, cz + 2, 4.2, 0.6, "#ff6fa8", 12.5);
    [[cx - 5.5, cz - 6.4], [cx + 3.6, cz - 6.4]].forEach(([x, z]) => { post(x, z, 0.25, 0, 2.2, "a scratching post"); const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), mat("#ff6fa8", { flatShading: true })); b.position.set(x, 2.5, z); cat.add(b); solid(x, z, 0.6, 0.6, 2.2, 2.75, null, { name: "a scratching-post ball (nice balance!)" }); });
    // hanging dangly toy (moved clear of the catwalks)
    const toy = new THREE.Group(); toy.position.set(cx + 5.3, CH, cz + 5.3); cat.add(toy);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 5.6, 4), mat("#f4efe2")); str.position.y = -2.8; toy.add(str);
    const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), mat("#ff4f8b", { flatShading: true })); pom.position.y = -5.7; toy.add(pom);
    ["#8cffd6", "#ffd93b", "#7fc7e8"].forEach((c, i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 5), mat(c)); f.position.set(Math.sin(i * 2.1) * 0.15, -6.15, Math.cos(i * 2.1) * 0.15); f.rotation.set(Math.PI + Math.cos(i * 2.1) * 0.4, 0, -Math.sin(i * 2.1) * 0.4); toy.add(f); });
    ceilFx.toy = toy;
    // crown + sign on the perch
    const crown = new THREE.Group(); crown.position.set(cx, PERCH + 0.75, cz - 0.9); cat.add(crown);
    const gold = mat("#f5c542", { metalness: 0.6, roughness: 0.3, emissive: "#8a6400", emissiveIntensity: 0.4 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.22, 10, 1, true), gold); band.material.side = THREE.DoubleSide; crown.add(band);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), gold); const a = i * Math.PI * 2 / 5; sp.position.set(Math.sin(a) * 0.28, 0.22, Math.cos(a) * 0.28); crown.add(sp);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), mat(["#ff4f8b", "#7fc7e8", "#8fd19e"][i % 3], { emissive: "#333" })); gem.position.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3); crown.add(gem); }
    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.2, 10), mat("#b9a2ea")); pillow.position.set(cx, PERCH + 0.1, cz - 0.9); cat.add(pillow);
    ceilFx.crown = crown;
    box(cx + 0.9, PERCH + 0.6, cz - 1.25, 0.06, 1.2, 0.06, mat(PAL.wood), cat);
    plane(plate("You made it to the top!", "👑 Gremlin royalty", { w: 768, h: 220, bg: "#3b1f73", fg: "#fff", accent: "#f5c542" }), 1.5, 0.43, cx + 0.9, PERCH + 1.35, cz - 1.2, 0, cat);
    plane(plate("The Cat House", "a climbing room for humans & gremlins", { w: 1024, h: 260, bg: "#e86a5c", fg: "#fff", accent: "#fbe7a1" }), 4.4, 1.12, cx - 4.9, 2.9, CAT.z0 + 0.02, 0, cat);
    plane(plate("Bouncy floor", "falling never hurts · E or tap the swirl to go back", { w: 900, h: 180, bg: PAL.moss }), 2.4, 0.48, cx + 2.6, 2.6, CAT.z1 - 0.02, Math.PI, cat);

    // ladders: one per wall, floor to ceiling (bright yellow rungs, red rails)
    const railM = mat("#e03131", { emissive: "#c92a2a", emissiveIntensity: 0.3 });
    function ladder(x, z, nx, nz) {
      const W = 0.8, lx = x + nx * 0.12, lz = z + nz * 0.12, alongX = nz !== 0;
      for (const s of [-1, 1]) box(alongX ? lx + s * W / 2 : lx, CH / 2, alongX ? lz : lz + s * W / 2, 0.09, CH, 0.09, railM, cat);
      for (let y = 0.35; y < CH; y += 0.4) inst.rung.push([lx, y, lz, alongX ? W : 0.06, 0.06, alongX ? 0.06 : W]);
      const d = 0.95; // climb zone depth in front of the ladder
      ladders.push({ x, z, nx, nz, x0: alongX ? x - W / 2 : Math.min(x, x + nx * d), x1: alongX ? x + W / 2 : Math.max(x, x + nx * d), z0: alongX ? Math.min(z, z + nz * d) : z - W / 2, z1: alongX ? Math.max(z, z + nz * d) : z + W / 2 });
      plane(plate("Ladder ↑", "to the catwalk", { w: 512, h: 160, bg: "#e03131", fg: "#fff", accent: "#ffd43b" }), 1.0, 0.31, alongX ? x + 0.95 : x + nx * 0.03, 2.1, alongX ? z + nz * 0.03 : z + 0.95, nz > 0 ? 0 : nz < 0 ? Math.PI : nx > 0 ? Math.PI / 2 : -Math.PI / 2, cat);
    }
    ladder(cx + 2.5, CAT.z0, 0, 1); ladder(cx - 2.5, CAT.z1, 0, -1); ladder(CAT.x0, cz - 6, 1, 0); ladder(CAT.x1, cz - 6, -1, 0);

    // ceiling catwalks: a # grid wall to wall that interlocks over the middle; centre square is open (the drop hatch)
    const walkM = mat("#4dabf7", { emissive: "#1c7ed6", emissiveIntensity: 0.2 }), WW = 0.9, WT = 0.15;
    const walk = (xa, xb, za, zb) => { const x = (xa + xb) / 2, z = (za + zb) / 2, w = Math.abs(xb - xa), d = Math.abs(zb - za); solid(x, z, w, d, CW - WT, CW, walkM, { name: "the catwalk" }); rim(x, z, w, d, CW); };
    const g = 2.5, hw = WW / 2;
    walk(cx - g - hw, cx - g + hw, CAT.z0, CAT.z1 - 0.9);   // A (south ladder end)
    walk(cx + g - hw, cx + g + hw, CAT.z0 + 0.9, CAT.z1);   // B (north ladder end)
    walk(CAT.x0, CAT.x1, cz - g - hw, cz - g + hw);         // C
    walk(CAT.x0, CAT.x1, cz + g - hw, cz + g + hw);         // D
    walk(CAT.x0 + 0.9, cx - g, cz - 6 - hw, cz - 6 + hw);   // E (west ladder spur)
    walk(cx + g, CAT.x1 - 0.9, cz - 6 - hw, cz - 6 + hw);   // F (east ladder spur)
    // railings on some outer edges only (partly open, so you can step off on purpose)
    const railTop = mat("#ffd43b", { emissive: "#f59f00", emissiveIntensity: 0.3 });
    const railing = (xa, xb, za, zb) => { const x = (xa + xb) / 2, z = (za + zb) / 2, w = Math.max(0.06, Math.abs(xb - xa)), d = Math.max(0.06, Math.abs(zb - za)), len = Math.max(w, d);
      solid(x, z, w, d, CW, CW + 1.0, null, { name: "a railing" }); box(x, CW + 0.95, z, w, 0.06, d, railTop, cat); box(x, CW + 0.5, z, w, 0.04, d, railTop, cat);
      for (let t = 0; t <= len + 0.01; t += 1.2) inst.post.push([w > d ? xa + Math.min(t, len) * Math.sign(xb - xa) : x, CW + 0.5, w > d ? z : za + Math.min(t, len) * Math.sign(zb - za), 0.06, 1.0, 0.06]); };
    const o = hw + 0.03, n = 2.95;
    railing(cx - g - o, cx - g - o, CAT.z0, cz - 6.55); railing(cx - g - o, cx - g - o, cz - 5.45, cz - n); railing(cx - g - o, cx - g - o, cz + n, CAT.z1 - 0.9);
    railing(cx + g + o, cx + g + o, CAT.z0 + 0.9, cz - 6.55); railing(cx + g + o, cx + g + o, cz - 5.45, cz - n); railing(cx + g + o, cx + g + o, cz + n, CAT.z1);
    railing(CAT.x0, cx - n, cz - g - o, cz - g - o); railing(cx + n, CAT.x1, cz - g - o, cz - g - o);
    railing(CAT.x0, cx - n, cz + g + o, cz + g + o); railing(cx + n, CAT.x1, cz + g + o, cz + g + o);
    // drop-zone markings on the 4 hub edges + a hanging sign over the hatch
    const hazard = canvasTex(512, 128, (c, w, h) => { for (let i = -2; i < 20; i++) { c.fillStyle = i % 2 ? "#111" : "#ffd43b"; c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32 + 32, 0); c.lineTo(i * 32, h); c.lineTo(i * 32 - 32, h); c.fill(); }
      c.fillStyle = "#fff"; c.fillRect(130, 34, 252, 60); c.fillStyle = "#c92a2a"; c.font = "bold 44px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("DROP ZONE ↓", 256, 66); });
    const hzM = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    [[cx - g, cz, Math.PI / 2], [cx + g, cz, -Math.PI / 2], [cx, cz - g, 0], [cx, cz + g, Math.PI]].forEach(([x, z, r]) => { const m = new THREE.Mesh(planeGeo, hzM); m.scale.set(3.6, 0.85, 1); m.rotation.set(-Math.PI / 2, 0, r); m.position.set(x, CW + 0.006, z); cat.add(m); });
    const dz = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ map: plate("↓ DROP ZONE ↓", "falling never hurts", { w: 640, h: 200, bg: "#c92a2a", fg: "#fff", accent: "#ffd43b" }), emissive: "#330000" }));
    dz.scale.set(1.9, 0.6, 1.9); dz.position.set(cx, CH - 0.55, cz); cat.add(dz);
    const sus = new THREE.Mesh(boxGeo, mat(PAL.ink)); sus.scale.set(0.03, 0.25, 0.03); sus.position.set(cx, CH - 0.12, cz); cat.add(sus);
    // instanced rungs + railing posts (2 draw calls total)
    const tmpM = new THREE.Matrix4(), q0 = new THREE.Quaternion();
    for (const [key, m] of [["rung", mat("#ffd43b", { emissive: "#f59f00", emissiveIntensity: 0.4 })], ["post", railTop]]) {
      const list = inst[key], im = new THREE.InstancedMesh(boxGeo, m, list.length);
      list.forEach(([x, y, z, sx, sy, sz], i) => im.setMatrixAt(i, tmpM.compose(new THREE.Vector3(x, y, z), q0, new THREE.Vector3(sx, sy, sz)))); cat.add(im);
    }
    // landing puff (10 shared low-poly bits) + best-landing star
    const puffM = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }), puffG = new THREE.IcosahedronGeometry(0.16, 0);
    const puff = new THREE.Group(); puff.visible = false; cat.add(puff);
    for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(puffG, puffM); b.userData.a = i * Math.PI / 5; puff.add(b); }
    ceilFx.puff = { g: puff, m: puffM, t: 9, s: 1 };
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat("#ffd43b", { emissive: "#ffd43b", emissiveIntensity: 0.9 })); star.visible = false; cat.add(star); ceilFx.star = star;
  }
  const catPortal = makePortal(cat, CAT.cx, 1.5, CAT.z1 - 0.05, Math.PI, 0.65, "Back to the office");
  portals.push(catPortal);
  const CAT_SPAWN = { x: CAT.cx, z: CAT.z1 - 1.6, yaw: 0 };

  // ---------- photos & art textures (signed URLs, loaded lazily) ----------
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
  const applyTex = (mesh, url) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; mesh.material.map = t; mesh.material.color.set("#fff"); mesh.material.needsUpdate = true; });
  async function loadPhotos(rm) {
    if (rm.photosLoaded || !rm.frames?.length || !api.photoUrls) return; rm.photosLoaded = true;
    const urls = await api.photoUrls(rm.frames.map((f) => f.path)); rm.frames.forEach((f) => { if (urls[f.path]) { f.url = urls[f.path]; applyTex(f.pic, urls[f.path]); } });
  }
  loadPhotos(rooms[0]);
  artMeshes.forEach((m) => m.a.static && applyTex(m.pic, m.a.static.src));
  if (api.artUrls) api.artUrls(artMeshes.filter((m) => m.a.image_path).map((m) => m.a.image_path)).then((u) => artMeshes.forEach((m) => { const url = m.a.image_path && u[m.a.image_path]; if (url) { m.url = url; applyTex(m.pic, url); } }));

  // ---------- HUD ----------
  const hud = document.createElement("div"); hud.className = "o3-hud"; root.appendChild(hud);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const top = el("div", "o3-top"); hud.appendChild(top);
  const where = el("div", "o3-where", "Your cubicle"); top.appendChild(where);
  const exit = el("button", "o3-btn", "← Back to my desk"); exit.onclick = () => (mode === "cathouse" ? enterPortal(catPortal) : mode === "annex" ? annex?.exitHome() : api.exit?.()); const tr = el("div", "o3-tr"); tr.appendChild(exit); top.appendChild(tr);
  const onl = el("div", "o3-online"); hud.appendChild(onl);
  function renderOnline(set) {
    onl.textContent = ""; onl.appendChild(el("b", null, `${set.size} online`));
    floor.filter((p) => set.has(p.user_id)).slice(0, 12).forEach((p) => { const r = el("div"); r.appendChild(el("span", "dot on")); r.appendChild(document.createTextNode(p.nickname || p.display_name)); onl.appendChild(r); });
  }
  renderOnline(online);
  const actions = el("div", "o3-actions"); hud.appendChild(actions);
  const touch = matchMedia("(pointer:coarse)").matches;
  const help = el("div", "o3-help", touch ? "Joystick to walk · drag to look · ⤒ to jump · ? for help" : "WASD to walk · Q / ← → turn · drag or R / F to look up & down · Space to jump · E for portals & stitches · ? for help"); hud.appendChild(help);
  // every overlay: X (top right), Close button, Escape key, or click/tap outside closes it
  const backdrop = el("div", "o3-backdrop"); backdrop.hidden = true; hud.appendChild(backdrop);
  const panel = el("div", "o3-panel"); panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); hud.appendChild(panel);
  let onClose = null;
  const closePanel = () => { panel.hidden = true; backdrop.hidden = true; panel.textContent = ""; const f = onClose; onClose = null; f?.(); };
  backdrop.addEventListener("pointerdown", (e) => { e.preventDefault(); closePanel(); });
  function openPanel(title, build, opt = {}) {
    panel.textContent = ""; panel.className = "o3-panel" + (opt.wide ? " wide" : ""); panel.hidden = false; backdrop.hidden = false; onClose = opt.onClose || null;
    const x = el("button", "o3-x", "×"); x.setAttribute("aria-label", "Close"); x.title = "Close (Esc)"; x.onclick = closePanel; panel.appendChild(x);
    panel.setAttribute("aria-label", title); panel.appendChild(el("h3", null, title)); build(panel);
    const c = el("button", "o3-btn ghost", opt.closeText || "Close"); c.onclick = closePanel; panel.appendChild(c);
    setTimeout(() => x.focus({ preventScroll: true }), 0);
  }
  // how to move: first-visit overlay (remembered), reopen with "?"
  const HELP_KEY = "desks.o3.howto.v3";
  function openHelp() { openPanel("How to get around", (p) => {
    const ul = el("ul", "o3-howto");
    (touch ? ["🕹 Walk: drag the round joystick, bottom left", "👆 Look around: drag anywhere on the screen (drag down to look up at the ceiling)", "⤒ Jump: the round Jump button, bottom right", "🪜 Ladders (Cat House): walk into one, then push the joystick forward to climb, back to go down; tap Jump to hop off", "🤸 Drop off the catwalk: you bounce on the floor (never hurts) and can steer with the joystick while in the air", "🌀 Swirly portal: tap it, or tap the button that appears when you're close", "🖼 Tap a painting or photo to see it up close", "Buttons for things you can do appear bottom right"]
      : ["⌨️ Walk: W / S or ↑ / ↓ to go forward and back, A / D to step sideways", "↻ Turn: ← / → (or Q), or drag with the mouse", "⇅ Look up / down: R / F (or Page Up / Page Down), or drag the mouse up and down. Try the ceiling!", "␣ Jump: Space", "🌀 Portal: walk up to it and press E (or click it). E only does portals", "🪜 Ladders (Cat House): walk into one, W / ↑ climbs, S / ↓ goes down, Space hops off", "🤸 Drop off the catwalk: you bounce on the floor (never hurts), steer with WASD in the air and try to land on something", "⇧ Hold Shift to walk faster", "🖼 Click a painting or photo to see it up close", "Buttons for things you can do appear bottom right · Esc closes any window"])
      .forEach((t) => ul.appendChild(el("li", null, t)));
    p.appendChild(ul);
  }, { closeText: "Got it", onClose: () => { try { localStorage.setItem(HELP_KEY, "1"); } catch {} } }); }
  const helpBtn = el("button", "o3-btn ghost o3-q", "?"); helpBtn.setAttribute("aria-label", "How to move"); helpBtn.title = "How to move"; helpBtn.onclick = openHelp; tr.prepend(helpBtn);
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
  function openArt(m) { const a = m.a; openPanel(a.title, (p) => {
    const im = el("img", "o3-art"); im.src = m.url || a.static?.thumb || ""; im.alt = a.title; p.appendChild(im);
    p.appendChild(el("p", "o3-credit", "by " + a.artist));
    if (a.static) { p.appendChild(el("p", null, a.static.description));
      if (a.static.find?.length) p.appendChild(el("p", "o3-find", "Things to find: " + a.static.find.join(" · "))); }
  }); }
  function openPhoto(f) { openPanel("Photo", (p) => { const im = el("img", "o3-art"); im.src = f.url; im.alt = "Desk photo"; p.appendChild(im); }); }
  function artList() { openPanel("The Gallery", (p) => {
    p.appendChild(el("p", "o3-small", "Art by Moth's Design Studio. Pick a piece to look closer."));
    const l = el("div", "o3-artlist");
    artMeshes.forEach((m) => { const b = el("button", "o3-artitem"); const t = el("img"); t.src = m.a.static?.thumb || m.url || ""; t.alt = "";
      b.append(t, el("span", null, m.a.title)); b.onclick = () => openArt(m); l.appendChild(b); });
    p.appendChild(l);
  }); }
  // nearest piece in view gets its own button; everything else is one tap away in the list
  const nearBtn = el("button", "o3-btn ghost"); let nearArt = null; nearBtn.onclick = () => nearArt && openArt(nearArt);
  const listBtn = Object.assign(el("button", "o3-btn ghost", `🖼 All art (${artMeshes.length})`), { onclick: artList });
  const fwd = new THREE.Vector3(), tmpV = new THREE.Vector3();
  function updateNear() {
    updatePortalNear(); updateAnnexNear(); if (curZone !== "gallery") return; cam.getWorldDirection(fwd); let best = null, bd = 1e9;
    artMeshes.forEach((m) => { tmpV.subVectors(m.wp, cam.position); const d = tmpV.length(); if (d < 7.5 && tmpV.normalize().dot(fwd) > 0.8 && d < bd) { bd = d; best = m; } });
    if (best !== nearArt) { nearArt = best; nearBtn.textContent = best ? `🔍 Look closer: ${best.a.title}` : ""; nearBtn.hidden = !best; }
  }
  // portal prompt (shows when you're close to a swirl) + jump button (touch) + warp overlay
  const portalBtn = el("button", "o3-btn o3-portalbtn"); portalBtn.hidden = true; let nearPortal = null;
  portalBtn.onclick = () => nearPortal && enterPortal(nearPortal);
  const jumpBtn = el("button", "o3-jump", "⤒"); jumpBtn.setAttribute("aria-label", "Jump"); jumpBtn.title = "Jump (Space)"; hud.appendChild(jumpBtn);
  jumpBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); jump(); });
  const warpEl = el("div", "o3-warp"); hud.appendChild(warpEl);
  const bounceEl = el("div", "o3-bounce"); const bLine = el("div", "o3-bline"), bBest = el("div", "o3-bbest"); bounceEl.append(bLine, bBest); hud.appendChild(bounceEl);
  function readout(msg) { bLine.textContent = msg; bounceEl.classList.add("show"); clearTimeout(bounceEl._h); bounceEl._h = setTimeout(() => bounceEl.classList.remove("show"), 4500); }
  function updatePortalNear() {
    let best = null; for (const pt of portals) { if ((pt === catPortal) !== (mode === "cathouse")) continue; if (Math.hypot(pt.wp.x - pos.x, pt.wp.z - pos.z) < 2.6) best = pt; }
    if (best !== nearPortal) { nearPortal = best; portalBtn.hidden = !best; portalBtn.textContent = best === catPortal ? "🌀 Back to the office" + (touch ? "" : " (E)") : "🌀 What's this?" + (touch ? "" : " (E)"); }
  }
  const toastEl = el("div", "o3-toast"); hud.appendChild(toastEl);
  function toast3(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastEl._h); toastEl._h = setTimeout(() => toastEl.classList.remove("show"), 3000); }
  let curZone = null;
  function updateActions(force) {
    const z = zoneAt(pos.x, pos.z); if (z === curZone && !force) return; curZone = z; actions.textContent = "";
    if (z === "own") { where.textContent = "Your cubicle"; actions.append(annexBtn, lockBtn(), notesBtn()); }
    else if (z === "hall") { where.textContent = "Hallway"; actions.append(annexBtn); }
    else if (z === "gallery") { where.textContent = "The Gallery"; nearArt = undefined; actions.append(portalBtn, annexBtn, nearBtn, listBtn, noticesBtn()); updateNear(); }
    else if (z?.startsWith("annex:")) { where.textContent = "🧵 " + annex.roomLabel(z); actions.append(annexBtn, ...annex.hudButtons()); applyAnnexAtmos(z); }
    else if (z === "cathouse") { where.textContent = "🐾 The Cat House"; actions.append(portalBtn); }
    else if (z?.startsWith("room:")) { const p = floor.find((x) => "room:" + x.user_id === z); where.textContent = `${p.nickname || p.display_name}'s cubicle`; actions.append(annexBtn, leaveNoteBtn(p)); loadPhotos(rooms.find((r) => r.owner === p)); }
    exit.textContent = z === "cathouse" || mode === "annex" ? "← Back to the office" : "← Back to my desk";
    // door state for own door mesh
    ownDoor.children[3] && (ownDoor.children[3].rotation.y = myLock ? 0 : 1.35);
  }
  const onLevel = (r) => Math.abs((r.y || 0) - feet) < 2; // the Annex has floors stacked above each other (the Overlook hangs over the rooms)
  function zoneAt(x, z) { if (mode === "cathouse") return "cathouse"; for (const r of walkable) if (r.room && x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 - 0.01 && z <= r.z1 + 0.01 && onLevel(r)) return r.room; return curZone; }
  const inside = (x, z) => walkable.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && onLevel(r));

  // ---------- controls ----------
  const pos = new THREE.Vector3(0, EYE, 1.5); let yaw = 0, pitch = -0.05; // facing -z (towards door)
  if (opts.start) { pos.x = opts.start.x; pos.z = opts.start.z; yaw = opts.start.yaw ?? 0; pitch = opts.start.pitch ?? -0.05; }
  // own room faces desk at z=ROOM; start looking at the desk
  if (!opts.start) yaw = Math.PI;
  const PITCH_MAX = 1.45; // ~83°: straight-ish up at the ceiling / down at your feet, never flips
  const clampPitch = (v) => Math.max(-PITCH_MAX, Math.min(PITCH_MAX, v));
  // vertical physics: feet height, gravity, jumping, landing (office floor = 0; Cat House uses solids)
  const STEP = 0.4, BODY = 1.75, GRAV = 18, JUMP_V = 6.6;
  let mode = "office", feet = 0, vy = 0, onGround = true, wasTop = false, returnSpot = null, warp = null;
  let climb = null, fallApex = 0, bounces = 0, floorLandings = 0, best = null, lastLanding = null;
  // office: lower "ceiling" under the fan and the upside-down desk so a jump never puts your head in them
  const lowCeil = [{ x: 0.2, z: 3.05, r: 0.85, h: H - 0.32 }, { x: -1.15, z: 2.3, r: 0.8, h: H - 0.55 }];
  const overlaps = (s, x, z) => x + R > s.x0 && x - R < s.x1 && z + R > s.z0 && z - R < s.z1;
  function blocked(x, z) {
    if (mode === "office") return !inside(x, z);
    if (mode === "annex") return !inside(x, z) || !!annex?.blockedAt(x, z);
    if (x < CAT.x0 + R || x > CAT.x1 - R || z < CAT.z0 + R || z > CAT.z1 - R) return true;
    for (const s of solids) if (overlaps(s, x, z) && feet < s.y1 - STEP && feet + BODY > s.y0) return true;
    return false;
  }
  function groundAt(x, z) {
    if (mode === "office") return { h: 0, src: null };
    if (mode === "annex") return { h: annexFloor(x, z), src: null };
    let h = 0, src = null; for (const s of solids) if (overlaps(s, x, z) && s.y1 <= feet + STEP && s.y1 > h) { h = s.y1; src = s; } return { h, src };
  }
  function ceilAt(x, z) {
    if (mode === "annex") return annexFloor(x, z) + H - 0.06;
    if (mode === "office") { let c = H - 0.06; for (const l of lowCeil) if (Math.hypot(x - l.x, z - l.z) < l.r + R) c = Math.min(c, l.h); return c; }
    let c = CAT.h - 0.05; for (const s of solids) if (overlaps(s, x, z) && s.y0 >= feet + BODY - 0.05 && s.y0 < c) c = s.y0; return c;
  }
  function jump() { if (warp || !panel.hidden) return;
    if (climb) { const l = climb.l; tmpV.set(pos.x + l.nx * 0.5, 0, pos.z + l.nz * 0.5); climb = null; if (!blocked(tmpV.x, tmpV.z)) { pos.x = tmpV.x; pos.z = tmpV.z; } vy = 4; fallApex = feet; return; }
    if (onGround) { vy = JUMP_V; onGround = false; } }
  function ladderAt(x, z) { for (const l of ladders) if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return l; return null; }
  function doPuff(x, y, z, size) { const p = ceilFx.puff; if (!p) return; p.g.position.set(x, y + 0.05, z); p.t = 0; p.s = size; p.g.visible = true; }
  function landed(src, h) {
    if (!(fallApex - h > 1.4 || bounces > 0)) { bounces = 0; return; }
    const name = src?.name || (floorLandings++ ? "the floor (again)" : "the floor");
    lastLanding = { name, h }; doPuff(pos.x, h, pos.z, 0.7);
    if (h > 0.05 && (!best || h > best.h)) { best = { name, h }; const st = ceilFx.star; st.visible = true; st.position.set(pos.x, h + 1.1, pos.z); bBest.textContent = `⭐ Best landing: ${name} (${h.toFixed(1)} m up)`; }
    readout(`${bounces ? "Bounce! " : ""}Landed on: ${name}${h > 0.05 ? ` · ${h.toFixed(1)} m up` : ""}`); bounces = 0;
  }
  function enterPortal(pt) {
    if (warp) return; Object.keys(keys).forEach((k) => (keys[k] = false));
    warp = { t: 0, phase: 0, pt, toCat: pt !== catPortal, fromYaw: yaw, fromPitch: pitch };
    // turn to face the swirl as you get pulled in
    tmpV.subVectors(pt.wp, pos); warp.yaw = Math.atan2(-tmpV.x, -tmpV.z); warp.pitch = Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
    warp.start = pos.clone(); warpEl.classList.add("on");
  }
  function goCat() {
    returnSpot = { x: pos.x, z: pos.z, yaw, pitch: 0 };
    mode = "cathouse"; pos.x = CAT_SPAWN.x; pos.z = CAT_SPAWN.z; yaw = CAT_SPAWN.yaw; pitch = 0.05; feet = 0; vy = 0; onGround = true; wasTop = false; climb = null; fallApex = 0; bounces = 0;
    updateActions(true); toast3("Welcome to The Cat House! Jump with " + (touch ? "the ⤒ button" : "Space") + ". The cushions are bouncy.");
  }
  function goOffice() {
    mode = "office"; climb = null; bounceEl.classList.remove("show"); const r = returnSpot || { x: -gx + 2.4, z: nbPortal.wp.z, yaw: Math.PI / 2, pitch: 0 };
    pos.x = r.x; pos.z = r.z; yaw = r.yaw; pitch = r.pitch; feet = 0; vy = 0; onGround = true; updateActions(true);
  }
  const keys = {}; const kd = (e) => { if (e.key === "Escape" && !panel.hidden) { closePanel(); e.preventDefault(); return; } if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "spacebar") { e.preventDefault(); if (!e.repeat) jump(); return; }
    if (k === "e") { if (nearPortal && panel.hidden) { e.preventDefault(); enterPortal(nearPortal); } else if (nearAnnex && panel.hidden && !warp) { e.preventDefault(); nearAnnex.run(); } return; } // E = portals & stitches
    keys[k] = true; if (e.key.startsWith("Arrow") || e.key.startsWith("Page")) e.preventDefault(); };
  const ku = (e) => { const k = e.key.toLowerCase(); if (k === " ") { if (e.target.tagName !== "TEXTAREA" && e.target.tagName !== "INPUT") e.preventDefault(); return; } keys[k] = false; };
  addEventListener("keydown", kd); addEventListener("keyup", ku);
  const cv = renderer.domElement; cv.style.touchAction = "none";
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!drag || drag.id !== e.pointerId || warp) return; const s = e.pointerType === "touch" ? 0.006 : 0.004;
    yaw -= (e.clientX - drag.x) * s; pitch = clampPitch(pitch - (e.clientY - drag.y) * s); drag.x = e.clientX; drag.y = e.clientY; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const endDrag = (e) => { if (!drag || drag.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0); drag = null;
    if (e.type !== "pointerup" || moved > 6 || warp) return; // a tap/click (not a drag) on a painting, photo or portal opens it
    const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); ray.far = 8;
    const portalHit = ray.intersectObjects(portals.map((p) => p.disc), false)[0];
    if (portalHit) { const pt = portals.find((p) => p.disc === portalHit.object); if (pt && portalHit.distance < 4.5) return enterPortal(pt); }
    if (annex && panel.hidden) { const ah = ray.intersectObjects(annex.clickTargets(mode), false)[0]; if (ah && ah.distance < (ah.object.userData.maxD || 4.5)) return ah.object.userData.run?.(); }
    if (mode !== "office") return;
    const photos = rooms.flatMap((rm) => (rm.frames || []).filter((f) => f.url)); const targets = [...artMeshes.map((m) => m.pic), ...photos.map((f) => f.pic)];
    const hit = ray.intersectObjects(targets, false)[0]; if (!hit) return;
    const m = artMeshes.find((x) => x.pic === hit.object); if (m) return openArt(m); const f = photos.find((x) => x.pic === hit.object); if (f) openPhoto(f);
  };
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

  // ---------- The Loose Stitch -> Elsewhere Annex (data-driven; see annex.js + data/elsewhere-annex.json) ----------
  const annexBtn = el("button", "o3-btn o3-annexbtn"); annexBtn.hidden = true; let nearAnnex = null;
  annexBtn.onclick = () => nearAnnex && !warp && nearAnnex.run();
  const threadEl = el("div", "o3-thread"); hud.appendChild(threadEl);
  const OFFICE_ATMOS = { bg: "#dcd6c6", fog: [18, 45] }; let annexHemi = 1.2, zoomed = false;
  const rectAt = (x, z) => walkable.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && onLevel(r));
  const annexFloor = (x, z) => rectAt(x, z)?.y || 0;
  function applyAtmos(a) { scene.background.set(a.bg); scene.fog.color.set(a.bg); scene.fog.near = a.fog[0]; scene.fog.far = a.fog[1]; }
  function applyAnnexAtmos(z) { const a = annex?.atmos(z); if (a) { applyAtmos(a); annexHemi = a.hemi ?? 1.2; } if (z !== "annex:overlook") zoomed = false; }
  function threadWarp({ target, swap, onK }) {
    if (warp) return false; Object.keys(keys).forEach((k) => (keys[k] = false));
    const wp = target ? target.clone() : new THREE.Vector3(pos.x - Math.sin(yaw) * 0.9, pos.y, pos.z - Math.cos(yaw) * 0.9);
    warp = { t: 0, phase: 0, pt: { wp }, swap, onK, el: threadEl, fromYaw: yaw, fromPitch: pitch };
    tmpV.subVectors(wp, pos); warp.yaw = Math.atan2(-tmpV.x, -tmpV.z); warp.pitch = Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
    warp.start = pos.clone(); threadEl.classList.add("on"); return true;
  }
  function updateAnnexNear() {
    if (!annex) return; cam.getWorldDirection(fwd);
    const t = warp || !panel.hidden ? null : annex.near({ mode, pos, feet, fwd, zone: curZone });
    if ((t?.key || null) !== (nearAnnex?.key || null) || (t && t.label !== annexBtn.dataset.label)) { annexBtn.hidden = !t; annexBtn.dataset.label = t?.label || ""; annexBtn.textContent = t ? t.label + (touch ? "" : " (E)") : ""; }
    nearAnnex = t;
  }
  let annex = null;
  if (opts.annex) {
    try {
      annex = createAnnex({ THREE, scene, mat, box, plane, canvasTex, plate, wrap, fit, PAL, H, T, R, ROOM, walkable, planeGeo }, opts.annex, {
        el, me, hud, layout: { L, gz0, gz1, hx, gx }, rooms, showAllEntrances: !!opts.annexShowAll,
        state: () => ({ mode, pos, feet, yaw, busy: !!warp || !panel.hidden }),
        openPanel, closePanel, toast: toast3, threadWarp, updateActions: () => updateActions(true),
        placeAnnex: (p) => { pos.x = p.x; pos.z = p.z; feet = p.y || 0; yaw = p.yaw; pitch = clampPitch(p.pitch ?? 0); vy = 0; onGround = true; climb = null; updateActions(true); },
        enterAnnexMode: () => { if (mode !== "annex" && warp) returnSpot = { x: warp.start.x, z: warp.start.z, yaw: warp.fromYaw, pitch: 0 }; mode = "annex"; cam.far = 130; cam.updateProjectionMatrix(); },
        leaveAnnexMode: () => { mode = "office"; zoomed = false; cam.far = 50; cam.updateProjectionMatrix(); applyAtmos(OFFICE_ATMOS);
          const r = returnSpot || { x: 2.85, z: gz1 + 1.8, yaw: 0, pitch: 0 }; pos.x = r.x; pos.z = r.z; yaw = r.yaw; pitch = r.pitch; feet = 0; vy = 0; onGround = true; updateActions(true); },
        setZoom: (v) => { zoomed = !!v; }, zoomed: () => zoomed,
      });
      tr.prepend(annex.muteBtn);
    } catch (err) { console.warn("Elsewhere Annex failed to load", err); annex = null; }
  }

  function resize() { const w = root.clientWidth, h = root.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();
  const ease = (t) => t * t * (3 - 2 * t);
  let last = performance.now(), raf = 0, alive = true, roll = 0;
  function tick(now) {
    if (!alive) return; raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let f = 0, s = 0;
    if (!warp) {
      if (keys.w || keys.arrowup) f += 1; if (keys.s || keys.arrowdown) f -= 1; if (keys.a) s -= 1; if (keys.d) s += 1;
      if (keys.arrowleft || keys.q) yaw += 1.8 * dt; if (keys.arrowright) yaw -= 1.8 * dt;
      if (keys.r || keys.pageup) pitch = clampPitch(pitch + 1.5 * dt); if (keys.f || keys.pagedown) pitch = clampPitch(pitch - 1.5 * dt);
      f += -jv.y; s += jv.x;
    }
    if (climb) { // on a ladder: forward/back = up/down, no sideways walking
      feet = Math.max(0, Math.min(CAT.cw, feet + f * 2.4 * dt)); vy = 0; onGround = false; pos.x = climb.px; pos.z = climb.pz; if (f <= 0) climb.armed = true;
      if (feet >= CAT.cw - 0.001 && f > 0 && climb.armed) { pos.x = climb.tx; pos.z = climb.tz; feet = CAT.cw; climb = null; onGround = true; fallApex = feet; toast3("You're on the catwalk! Walk to the middle and drop off."); }
      else if (feet <= 0.001 && f < 0) { const l = climb.l; climb = null; onGround = true; feet = 0; pos.x = l.x + l.nx * 0.75; pos.z = l.z + l.nz * 0.75; }
      f = s = 0;
    }
    if (f || s) {
      const sp = (keys.shift ? 4.2 : 2.6) * dt, l = Math.max(1, Math.hypot(f, s));
      const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) / l * sp, dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) / l * sp;
      if (!blocked(pos.x + dx, pos.z)) pos.x += dx; if (!blocked(pos.x, pos.z + dz)) pos.z += dz;
      updateActions();
      if (mode === "cathouse" && f > 0 && !warp) { const L2 = ladderAt(pos.x, pos.z); // grab a ladder you walk into while facing it
        if (L2 && -Math.sin(yaw) * -L2.nx + -Math.cos(yaw) * -L2.nz > 0.5) { climb = { l: L2, px: L2.x + L2.nx * 0.45, pz: L2.z + L2.nz * 0.45, tx: L2.x + L2.nx * 1.35, tz: L2.z + L2.nz * 1.35, armed: feet < CAT.cw - 0.05 }; vy = 0; if (!climb.armed) toast3(touch ? "On the ladder. Pull the joystick back to climb down." : "On the ladder. Press S / ↓ to climb down.");
          if (!tick.ladderTip) { tick.ladderTip = 1; toast3(touch ? "Climbing! Joystick forward = up, back = down, Jump hops off." : "Climbing! W = up, S = down, Space hops off."); } } }
    }
    // gravity + landing (skipped while on a ladder)
    const wasGround = onGround; if (!climb) { vy -= GRAV * dt; let nf = feet + vy * dt;
    const g = groundAt(pos.x, pos.z);
    if (wasGround && vy <= 0 && feet - g.h < 0.31 && feet >= g.h) nf = Math.min(nf, g.h); // walk down steps/ramps without hopping
    if (nf <= g.h) {
      const impact = -vy;
      if (g.src?.bounce) { nf = g.h; vy = g.src.bounce; onGround = false; g.src.squash = 1; if (mode === "cathouse") { bounces++; fallApex = nf; doPuff(pos.x, nf, pos.z, 0.5); readout("Boing! Launched off a bouncy cushion"); } }
      else if (mode === "cathouse" && !g.src && impact > 7.5) { // bouncy floor: bounce back ~72% of the speed, so each bounce is about half as high
        nf = 0; vy = impact * 0.72; onGround = false; bounces++; fallApex = 0; doPuff(pos.x, 0, pos.z, Math.min(2, impact / 8)); readout(`Bounce! ×${bounces}  (steer to land on something)`); }
      else { if (!wasGround && mode === "cathouse") landed(g.src, g.h); nf = g.h; vy = 0; onGround = true; }
    } else { onGround = false; if (nf > fallApex) fallApex = nf; }
    if (onGround) fallApex = nf;
    const c = ceilAt(pos.x, pos.z); if (nf + BODY > c) { nf = Math.max(g.h, c - BODY); if (vy > 0) vy = 0; }
    feet = nf; }
    if (feet < -3) { feet = 0; vy = 0; pos.x = CAT_SPAWN.x; pos.z = CAT_SPAWN.z; } // safety respawn
    if (mode === "cathouse") { const top = solids.find((q) => q.perch); const atTop = onGround && feet >= top.y1 - 0.01 && overlaps(top, pos.x, pos.z);
      if (atTop && !wasTop) toast3("👑 You made it to the top! Gremlin royalty."); wasTop = atTop; }
    hemi.intensity = mode === "cathouse" ? 1.6 : mode === "annex" ? annexHemi : 1.25;
    pos.y = feet + EYE + (onGround && (f || s) ? Math.sin(now / 140) * 0.02 : 0);
    // portal suck-in: zoom + swirl + fade, then a quick spin-out on the other side
    let fov = 70;
    if (warp) {
      warp.t += dt;
      if (warp.phase === 0) { const k = ease(Math.min(1, warp.t / 0.9));
        yaw = warp.fromYaw + (((warp.yaw - warp.fromYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, k * 2); pitch = warp.fromPitch + (warp.pitch - warp.fromPitch) * Math.min(1, k * 2);
        pos.lerpVectors(warp.start, warp.pt.wp, k * 0.75); fov = 70 - 50 * k; roll = k * (warp.el ? -2 : 4); (warp.el || warpEl).style.opacity = String(k); warp.onK?.(k);
        if (warp.t >= 0.9) { warp.phase = 1; warp.t = 0; warp.swap ? warp.swap() : warp.toCat ? goCat() : goOffice(); }
      } else { const k = ease(Math.min(1, warp.t / 0.7)); fov = 115 - 45 * k; roll = (1 - k) * -2.5; (warp.el || warpEl).style.opacity = String(1 - k);
        if (warp.t >= 0.7) { const we = warp.el || warpEl; warp = null; roll = 0; we.classList.remove("on"); we.style.opacity = ""; updateAnnexNear(); } }
    }
    if (zoomed && !warp) fov = 26;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.copy(pos); cam.rotation.set(pitch, yaw, roll);
    // little animations
    const ts = now / 1000;
    if (ceilFx.fan) ceilFx.fan.rotation.y = ts * 2.2;
    portals.forEach((p) => { p.disc.rotation.z = -ts * 2.5; p.ring.scale.setScalar(1 + Math.sin(ts * 3 + p.t) * 0.04); p.glow.material.opacity = 0.7 + Math.sin(ts * 2 + p.t) * 0.3; });
    if (mode === "cathouse") {
      if (ceilFx.toy) { ceilFx.toy.rotation.z = Math.sin(ts * 1.3) * 0.12; ceilFx.toy.rotation.x = Math.sin(ts * 0.9) * 0.08; }
      if (ceilFx.crown) { ceilFx.crown.rotation.y = ts; ceilFx.crown.position.y = solids.find((q) => q.perch).y1 + 0.75 + Math.sin(ts * 2) * 0.05; }
      const pf = ceilFx.puff; if (pf && pf.t < 0.6) { pf.t += dt; const k = pf.t / 0.6; pf.m.opacity = 0.85 * (1 - k); pf.g.children.forEach((b) => { const r = (0.2 + k * 1.1) * pf.s; b.position.set(Math.cos(b.userData.a) * r, k * 0.35, Math.sin(b.userData.a) * r); b.scale.setScalar(0.6 + k * pf.s); }); if (pf.t >= 0.6) pf.g.visible = false; }
      if (ceilFx.star?.visible) ceilFx.star.rotation.y = ts * 2;
      solids.forEach((q) => { if (q.bounce && q.mesh) { q.squash = Math.max(0, (q.squash || 0) - dt * 3); q.mesh.scale.y = 1 - q.squash * 0.4; } });
    }
    if (annex) annex.update(dt, ts, { mode, pos, feet, zone: curZone, busy: !!warp || !panel.hidden });
    if (now - (tick.n || 0) > 200) { tick.n = now; updateNear(); }
    renderer.render(scene, cam);
  }
  updateActions(true); raf = requestAnimationFrame(tick);
  let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch {}
  if (!seen && !opts.demo) openHelp();
  return {
    setOnline: renderOnline,
    openHelp, openArtAt(i) { artMeshes[i] && openArt(artMeshes[i]); }, artList,
    teleport(x, z, y, p = -0.05) { mode = "office"; feet = 0; vy = 0; pos.x = x; pos.z = z; yaw = y; pitch = clampPitch(p); updateActions(true); },
    // demo/screenshot helpers (only reachable via window.__o3 in localhost demo mode)
    enterCatHouse() { goCat(); returnSpot = null; },
    catTeleport(x, z, y, p = 0, standOn = null) { mode = "cathouse"; climb = null; pos.x = CAT.cx + x; pos.z = CAT.cz + z; yaw = y; pitch = clampPitch(p); vy = 0; feet = standOn ?? 0; fallApex = feet; bounces = 0; onGround = true; updateActions(true); },
    portalAt: () => ({ ...nbPortal.wp }),
    layout: { L, gz0, gz1, hx, gx, cat: { ...CAT } },
    annex: annex ? { ...annex.debug, near: () => nearAnnex && { key: nearAnnex.key, label: nearAnnex.label }, run: () => nearAnnex?.run(), zoomed: () => zoomed } : null,
    look(y, p) { yaw = y; pitch = clampPitch(p); },
    state: () => ({ climbing: !!climb, bounces, lastLanding, best, vy, mode, feet, onGround, x: pos.x, z: pos.z, yaw, pitch, warp: !!warp, nearPortal: !!nearPortal }),
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("keydown", kd); removeEventListener("keyup", ku); renderer.dispose(); root.innerHTML = ""; },
  };
}
