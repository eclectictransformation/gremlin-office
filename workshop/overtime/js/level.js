// The test level: a grid of "sectors" (each cell has its own floor and ceiling height),
// built into textured, vertex-lit meshes. Light is baked per cell with line-of-sight.
window.LEVEL = (function(){
  const W = 50, H = 34, S = 2, STEP = 0.62;
  const REG = {
    lobby:  { floor: 0, ceil: 3.2, ftex: 'carpetRed',  ctex: 'ceilTile', wtex: 'wood',         amb: [0.30, 0.26, 0.22], name: 'Lobby' },
    hall:   { floor: 0, ceil: 2.6, ftex: 'carpetBlue', ctex: 'ceilTile', wtex: 'cubicle',      amb: [0.22, 0.24, 0.29], name: 'Hallway' },
    farm:   { floor: 0, ceil: 3.2, ftex: 'carpetBlue', ctex: 'ceilTile', wtex: 'cubicle',      amb: [0.22, 0.24, 0.29], name: 'Cubicle Farm' },
    closet: { floor: 0, ceil: 2.4, ftex: 'carpetRed',  ctex: 'ceilDark', wtex: 'wood',         amb: [0.09, 0.17, 0.09], name: 'Supply Closet' },
    stairs: { floor: 0, ceil: 4.0, ftex: 'stair',      ctex: 'ceilTile', wtex: 'painted',      amb: [0.26, 0.24, 0.21], name: 'Stairs' },
    brk:    { floor: 1, ceil: 4.0, ftex: 'tile',       ctex: 'ceilTile', wtex: 'brick',        amb: [0.27, 0.24, 0.20], name: 'Break Room' },
    corr:   { floor: 0, ceil: 2.8, ftex: 'grate',      ctex: 'ceilDark', wtex: 'tech',         amb: [0.20, 0.08, 0.08], name: 'Red Corridor' },
    server: { floor: 0, ceil: 3.4, ftex: 'grate',      ctex: 'ceilDark', wtex: 'tech',         amb: [0.08, 0.12, 0.18], name: 'Server Room' },
    boss:   { floor: 0, ceil: 5.5, ftex: 'concrete',   ctex: 'ceilDark', wtex: 'concreteWall', amb: [0.17, 0.12, 0.21], name: 'Copy Center' },
    exit:   { floor: 0, ceil: 2.8, ftex: 'tile',       ctex: 'ceilTile', wtex: 'painted',      amb: [0.15, 0.29, 0.15], name: 'Elevator' },
  };
  const cells = [];
  function cell(x, y){ if (x < 0 || y < 0 || x >= W || y >= H) return null; return cells[y * W + x]; }
  function reset(){
    cells.length = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push({ x, y, solid: true, floor: 0, ceil: 3, reg: null, ftex: null, ctex: null, wtex: null, stex: null, door: null, light: [0, 0, 0] });
  }
  function carve(x0, y0, x1, y1, rname){ const r = REG[rname];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){ const c = cell(x, y); Object.assign(c, { solid: false, floor: r.floor, ceil: r.ceil, reg: rname, ftex: r.ftex, ctex: r.ctex, wtex: r.wtex, stex: r.wtex }); } }
  function block(x0, y0, x1, y1, h, topTex, sideTex){ for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){ const c = cell(x, y); c.floor = h; c.ftex = topTex; c.stex = sideTex; } }
  function solid(x0, y0, x1, y1){ for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){ cell(x, y).solid = true; } }
  const doorDefs = [];
  function door(x, y, kind, rname, ceil){ carve(x, y, x, y, rname); const c = cell(x, y); c.ceil = ceil; c.doorKind = kind; doorDefs.push(c); }

  const lights = [], decals = [], ents = [];
  function design(){
    reset(); doorDefs.length = 0; lights.length = 0; decals.length = 0; ents.length = 0;
    carve(2, 24, 10, 31, 'lobby'); block(4, 26, 8, 26, 1.0, 'desk', 'desk');
    carve(5, 16, 6, 23, 'hall');
    door(5, 15, 'door', 'hall', 2.6); door(6, 15, 'door', 'hall', 2.6);
    carve(1, 4, 20, 14, 'farm');
    for (const bx of [3, 8, 13]) for (const by of [6, 10]){ block(bx, by, bx + 2, by, 1.05, 'partTop', 'cubicle'); block(bx, by + 1, bx, by + 1, 1.05, 'partTop', 'cubicle'); }
    carve(7, 1, 9, 2, 'closet'); door(8, 3, 'secret', 'closet', 3.2);
    carve(21, 6, 24, 8, 'stairs'); for (let x = 21; x <= 24; x++) block(x, 6, x, 8, (x - 20) * 0.25, 'stair', 'stair');
    carve(25, 3, 33, 11, 'brk'); block(27, 8, 30, 8, 1.95, 'counter', 'counter');
    door(21, 13, 'locked', 'corr', 2.8); door(21, 14, 'locked', 'corr', 2.8);
    carve(22, 13, 25, 14, 'corr');
    carve(26, 13, 37, 20, 'server');
    block(29, 15, 34, 18, -0.4, 'grate', 'tech'); block(30, 16, 33, 17, -0.8, 'pitGlow', 'tech');
    for (const y of [15, 17, 19]) block(27, y, 27, y, 2.3, 'partTop', 'rack');
    for (const y of [14, 16, 18]) block(36, y, 36, y, 2.3, 'partTop', 'rack');
    door(31, 21, 'door', 'server', 3.0); door(32, 21, 'door', 'server', 3.0);
    carve(24, 22, 44, 32, 'boss');
    solid(28, 24, 29, 25); solid(28, 29, 29, 30); solid(38, 24, 39, 25); solid(38, 29, 39, 30);
    block(41, 26, 43, 28, 0.5, 'concrete', 'stair');
    door(45, 27, 'exit', 'exit', 2.8);
    carve(46, 26, 48, 28, 'exit');

    const L = (x, y, h, c, r) => lights.push({ x, y, h, c, r });
    [[4, 25], [8, 25], [4, 30], [8, 30]].forEach(p => L(p[0], p[1], 3, [1.0, 0.78, 0.5], 5));
    L(5.5, 19, 2.5, [0.8, 0.85, 1.0], 4.5);
    for (const x of [3, 8, 13, 18]) for (const y of [6, 11.5]) L(x, y, 3, [0.55, 0.6, 0.72], 4.5);
    L(8, 1.5, 2, [0.3, 1.2, 0.4], 4);
    L(23, 7, 3.5, [1, 0.9, 0.6], 4); L(27, 5, 3.5, [1, 0.85, 0.5], 5); L(31, 5, 3.5, [1, 0.85, 0.5], 5); L(29, 10, 3.5, [1, 0.8, 0.5], 4.5); L(33, 3.6, 2, [1.2, 0.3, 0.3], 3);
    L(23.5, 13.5, 2.5, [1.3, 0.2, 0.2], 4.5);
    [[28, 14], [35, 14], [28, 19.5], [35, 19.5]].forEach(p => L(p[0], p[1], 3, [0.2, 0.8, 1.1], 5)); L(31.5, 16.5, -0.5, [0.2, 1.1, 0.9], 4);
    L(26, 23, 5, [1.1, 0.5, 0.2], 7); L(42, 23, 5, [0.75, 0.3, 1.1], 7); L(26, 31, 5, [0.75, 0.3, 1.1], 7); L(42, 31, 5, [1.1, 0.5, 0.2], 7); L(34, 27.5, 5, [1, 0.9, 0.7], 6);
    L(47.5, 27.5, 2.5, [0.3, 1.2, 0.3], 4);

    const Dc = (cx, cy, side, name, y, k) => decals.push({ cx, cy, side, name, y, k: k || 1 / 24 });
    Dc(8, 24, 'N', 'welcome', 2.1, 1 / 26); Dc(2, 28, 'W', 'poster', 1.7); Dc(20, 5, 'E', 'arrowBreak', 1.9, 1 / 28);
    Dc(20, 12, 'E', 'server', 1.9, 1 / 28); Dc(33, 20, 'S', 'copy', 2.2, 1 / 26); Dc(44, 27, 'E', 'exitSign', 3.3, 1 / 18);
    Dc(1, 8, 'W', 'whiteboard', 1.7, 1 / 28); Dc(33, 7, 'E', 'fridgeNote', 2.6, 1 / 30);

    const E = (t, x, y) => ents.push({ t, x: x + 0.5, y: y + 0.5 });
    E('player', 6, 30);
    E('jam', 5, 19);
    E('jam', 4, 8); E('jam', 12, 12); E('jam', 17, 7); E('jam', 10, 5); E('imp', 2, 12); E('imp', 16, 12);
    E('imp', 28, 4); E('imp', 32, 10); E('imp', 26, 10); E('jam', 30, 6);
    E('blob', 30, 16); E('blob', 33, 17); E('blob', 34, 19); E('imp', 35, 15); E('imp', 28, 20);
    E('boss', 42, 27);
    E('cup', 3, 25); E('notepad', 9, 30);
    E('gunSpread', 19, 13); E('cup', 2, 5); E('bands', 12, 7); E('snack', 19, 4); E('notepad', 10, 13);
    E('gunCannon', 8, 1); E('poppers', 7, 2); E('snack', 9, 2);
    E('keycard', 32, 4); E('cup', 26, 4); E('bands', 29, 10); E('notepad', 33, 11);
    E('snack', 23, 14);
    E('bands', 37, 20); E('cup', 37, 13); E('notepad', 26, 20);
    E('snack', 25, 23); E('snack', 43, 31); E('bands', 25, 31); E('notepad', 43, 23); E('bands', 34, 32); E('cup', 34, 22);
    E('d_plant', 2, 24); E('d_plant', 10, 24); E('d_plant', 2, 31); E('d_cooler', 1, 14); E('d_printerSmall', 20, 4); E('d_vending', 33, 3); E('d_plant', 24, 32); E('d_plant', 48, 26);
    E('exitpad', 47, 27);
  }

  // ---------- lighting ----------
  function blocksLight(c){ return !c || c.solid || (c.door && c.door.t < 0.5); }
  function lineClear2D(ax, ay, bx, by){ // in cell units
    const dx = bx - ax, dy = by - ay, n = Math.ceil(Math.hypot(dx, dy) * 3);
    for (let i = 1; i < n; i++){ const c = cell(Math.floor(ax + dx * i / n), Math.floor(ay + dy * i / n)); if (!c || c.solid || c.doorKind === 'secret') return false; }
    return true;
  }
  function bake(){
    for (const c of cells){ if (c.solid) continue; const a = REG[c.reg].amb; c.light = [a[0], a[1], a[2]]; }
    for (const l of lights){ const r = l.r;
      for (let y = Math.floor(l.y - r); y <= l.y + r; y++) for (let x = Math.floor(l.x - r); x <= l.x + r; x++){
        const c = cell(x, y); if (!c || c.solid) continue; const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y); if (d > r) continue;
        if (!lineClear2D(l.x, l.y, x + 0.5, y + 0.5)) continue; const f = Math.pow(1 - d / r, 1.6) * 1.05;
        c.light[0] += l.c[0] * f; c.light[1] += l.c[1] * f; c.light[2] += l.c[2] * f; } }
    for (const c of cells){ if (c.solid) continue; for (let i = 0; i < 3; i++) c.light[i] = Math.min(1.55, c.light[i]); }
  }
  const tmpL = [0, 0, 0];
  function lightAt(wx, wz, out){ out = out || tmpL;
    const gx = wx / S - 0.5, gz = wz / S - 0.5, i0 = Math.floor(gx), j0 = Math.floor(gz), fx = gx - i0, fz = gz - j0;
    let r = 0, g = 0, b = 0, wsum = 0;
    for (let k = 0; k < 4; k++){ const i = i0 + (k & 1), j = j0 + (k >> 1); const c = cell(i, j); if (!c || c.solid) continue;
      const w = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fz : 1 - fz) + 1e-4; r += c.light[0] * w; g += c.light[1] * w; b += c.light[2] * w; wsum += w; }
    if (wsum === 0){ out[0] = out[1] = out[2] = 0.3; return out; }
    out[0] = r / wsum; out[1] = g / wsum; out[2] = b / wsum; return out;
  }
  function aoAt(vx, vz){ // vertex at cell corner (cell units): darken by solid neighbours
    let n = 0; for (let k = 0; k < 4; k++){ const c = cell(vx - 1 + (k & 1), vz - 1 + (k >> 1)); if (!c || c.solid) n++; } return 1 - n * 0.11; }

  // ---------- geometry ----------
  let group = null; const doorList = [];
  function buildMeshes(scene){
    const buckets = {};
    const B = name => buckets[name] || (buckets[name] = { p: [], u: [], c: [] });
    const col = [0, 0, 0];
    function quad(tex, P, UV, C){ const b = B(tex); const idx = [0, 1, 2, 0, 2, 3];
      for (const i of idx){ b.p.push(P[i][0], P[i][1], P[i][2]); b.u.push(UV[i][0], UV[i][1]); b.c.push(C[i][0], C[i][1], C[i][2]); } }
    function vcol(wx, wz, k){ lightAt(wx, wz, col); return [col[0] * k, col[1] * k, col[2] * k]; }
    const dirs = [[0, -1, 'N'], [1, 0, 'E'], [0, 1, 'S'], [-1, 0, 'W']];
    for (const c of cells){ if (c.solid) continue; const x0 = c.x * S, z0 = c.y * S, x1 = x0 + S, z1 = z0 + S;
      // floor & ceiling
      const fc = [[c.x, c.y], [c.x + 1, c.y], [c.x + 1, c.y + 1], [c.x, c.y + 1]];
      const P = fc.map(v => [v[0] * S, c.floor, v[1] * S]); const UV = fc.map(v => [v[0], -v[1]]);
      const Cc = fc.map(v => vcol(v[0] * S + (v[0] === c.x ? 0.3 : -0.3), v[1] * S + (v[1] === c.y ? 0.3 : -0.3), aoAt(v[0], v[1])));
      quad(c.ftex, P, UV, Cc);
      quad(c.ctex, fc.map(v => [v[0] * S, c.ceil, v[1] * S]), UV, Cc.map(q => [q[0] * 0.62, q[1] * 0.62, q[2] * 0.68]));
      for (const [dx, dz, side] of dirs){ const n = cell(c.x + dx, c.y + dz);
        // edge endpoints
        let ax, az, bx, bz; if (side === 'N'){ ax = x0; az = z0; bx = x1; bz = z0; } else if (side === 'S'){ ax = x1; az = z1; bx = x0; bz = z1; } else if (side === 'E'){ ax = x1; az = z0; bx = x1; bz = z1; } else { ax = x0; az = z1; bx = x0; bz = z0; }
        const ox = -dx * 0.4, oz = -dz * 0.4; const ua = (side === 'N' || side === 'S') ? ax / S : az / S, ub = (side === 'N' || side === 'S') ? bx / S : bz / S;
        const wall = (y0, y1, tex, vfn) => { if (y1 - y0 < 0.01) return;
          const ca = vcol(ax + ox, az + oz, 1), cb = vcol(bx + ox, bz + oz, 1);
          const k0 = y0 <= c.floor + 0.01 ? 0.7 : 0.92, k1 = 1.0;
          quad(tex, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [[ua, vfn(y0)], [ub, vfn(y0)], [ub, vfn(y1)], [ua, vfn(y1)]],
            [ca.map(v => v * k0), cb.map(v => v * k0), cb.map(v => v * k1), ca.map(v => v * k1)]); };
        if (!n || n.solid){ const h = c.ceil - c.floor, reps = Math.max(1, Math.round(h / 2.6)); wall(c.floor, c.ceil, c.wtex, y => (y - c.floor) / h * reps); }
        else {
          if (n.floor > c.floor + 0.01){ const top = Math.min(n.floor, c.ceil); wall(c.floor, top, n.stex, y => 1 - (n.floor - y) / S); }
          if (n.ceil < c.ceil - 0.01){ const bot = Math.max(n.ceil, c.floor); wall(bot, c.ceil, c.wtex, y => 1 - (c.ceil - y) / S); }
        }
      }
    }
    group = new THREE.Group();
    for (const k in buckets){ const b = buckets[k]; const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      const m = new THREE.MeshBasicMaterial({ map: ART.tex[k], vertexColors: true, side: THREE.DoubleSide }); m.userData.flash = true;
      group.add(new THREE.Mesh(g, m)); }
    // doors
    doorList.length = 0; const seen = new Set();
    for (const c of doorDefs){ if (seen.has(c)) continue;
      const grp = { kind: c.doorKind, cells: [], t: 0, target: 0, meshes: [] };
      const stack = [c]; while (stack.length){ const d = stack.pop(); if (seen.has(d)) continue; seen.add(d); grp.cells.push(d); d.door = grp;
        for (const [dx, dz] of dirs){ const n = cell(d.x + dx, d.y + dz); if (n && n.doorKind === d.doorKind && !seen.has(n)) stack.push(n); } }
      const texName = { door: 'door', locked: 'doorRed', exit: 'doorExit', secret: 'cubicleNote' }[grp.kind];
      for (const d of grp.cells){ const nOpen = (a, b) => { const q = cell(a, b); return q && !q.solid && !q.doorKind; };
        const alongZ = nOpen(d.x, d.y - 1) || nOpen(d.x, d.y + 1); const h = d.ceil - d.floor; const thick = grp.kind === 'secret' ? S : 0.35;
        const geo = new THREE.BoxGeometry(alongZ ? S : thick, h, alongZ ? thick : S);
        const m = new THREE.MeshBasicMaterial({ map: ART.tex[texName] }); if (grp.kind === 'secret') lightAt((d.x + 0.5) * S, (d.y + 1.5) * S, col); else lightAt((d.x + 0.5) * S, (d.y + 0.5) * S, col); m.color.setRGB(col[0] * 1.1, col[1] * 1.1, col[2] * 1.1); m.userData.flash = true; m.userData.base = m.color.clone();
        const mesh = new THREE.Mesh(geo, m); mesh.position.set((d.x + 0.5) * S, d.floor + h / 2, (d.y + 0.5) * S); mesh.userData.baseY = mesh.position.y; mesh.userData.h = h;
        group.add(mesh); grp.meshes.push(mesh); }
      doorList.push(grp); }
    // decals
    for (const d of decals){ const info = ART.decal[d.name]; const w = info.w * d.k, h = info.h * d.k;
      const m = new THREE.MeshBasicMaterial({ map: info.tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
      const cx = (d.cx + 0.5) * S, cz = (d.cy + 0.5) * S; let px = cx, pz = cz, ry = 0; const off = S / 2 - 0.03;
      if (d.side === 'N'){ pz = cz - off; ry = 0; } else if (d.side === 'S'){ pz = cz + off; ry = Math.PI; } else if (d.side === 'E'){ px = cx + off; ry = -Math.PI / 2; } else { px = cx - off; ry = Math.PI / 2; }
      lightAt(cx, cz, col); m.color.setRGB(col[0] * 1.15, col[1] * 1.15, col[2] * 1.15); m.userData.flash = true; m.userData.base = m.color.clone();
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.set(px, cell(d.cx, d.cy).floor + d.y, pz); mesh.rotation.y = ry; group.add(mesh); }
    scene.add(group);
    return group;
  }

  // ---------- queries ----------
  function cellW(wx, wz){ return cell(Math.floor(wx / S), Math.floor(wz / S)); }
  function doorClosed(c){ return c.door && c.door.t < 0.85; }
  function passable(c, fromFloor){ return c && !c.solid && !doorClosed(c) && c.floor - fromFloor <= STEP && c.ceil - c.floor >= 1.6; }
  function lineOfSight(ax, ay, az, bx, by, bz){
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz), n = Math.ceil(len / 0.25);
    for (let i = 1; i < n; i++){ const t = i / n; const x = ax + dx * t, y = ay + dy * t, z = az + dz * t; const c = cellW(x, z);
      if (!c || c.solid || doorClosed(c) || y < c.floor || y > c.ceil) return false; }
    return true;
  }
  // A* over cells
  function findPath(sx, sz, tx, tz, canEnter){
    const a = cellW(sx, sz), b = cellW(tx, tz); if (!a || !b) return null; if (a === b) return [b];
    const key = c => c.y * W + c.x; const open = [a]; const g = new Map([[key(a), 0]]), came = new Map(), f = new Map([[key(a), 0]]);
    const h = c => { const dx = Math.abs(c.x - b.x), dy = Math.abs(c.y - b.y); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const closed = new Set(); let guard = 0;
    while (open.length && guard++ < 4000){
      let bi = 0; for (let i = 1; i < open.length; i++) if (f.get(key(open[i])) < f.get(key(open[bi]))) bi = i;
      const cur = open.splice(bi, 1)[0]; if (cur === b){ const path = [cur]; let k = key(cur); while (came.has(k)){ const p = came.get(k); path.unshift(p); k = key(p); } path.shift(); return path; }
      closed.add(key(cur));
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){ if (!dx && !dz) continue; const n = cell(cur.x + dx, cur.y + dz); if (!n || closed.has(key(n))) continue;
        if (!canEnter(cur, n)) continue; if (dx && dz && (!canEnter(cur, cell(cur.x + dx, cur.y)) || !canEnter(cur, cell(cur.x, cur.y + dz)))) continue;
        const ng = g.get(key(cur)) + (dx && dz ? 1.414 : 1); if (ng < (g.has(key(n)) ? g.get(key(n)) : 1e9)){ came.set(key(n), cur); g.set(key(n), ng); f.set(key(n), ng + h(n)); if (!open.includes(n)) open.push(n); } }
    }
    return null;
  }
  return { W, H, S, STEP, REG, cells, cell, cellW, design, bake, buildMeshes, lightAt, lineOfSight, findPath, passable, doorClosed, doors: doorList, ents, get group(){ return group; } };
})();
