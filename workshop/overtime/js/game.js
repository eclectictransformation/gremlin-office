// Core game: renderer, player, monsters, gadgets, pickups, confetti and the main loop.
window.GAME = (function(){
  const S = LEVEL.S, V3 = THREE.Vector3;
  const DEFAULTS = { scheme: 'tap', sens: 1, aim: 'touch', autofire: 'touch', gyro: false, invert: false, diff: 'normal', vol: 0.7, res: 'auto', fps: false };
  const settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('gremlinOvertimeSettings') || '{}')); } catch(e){}
  function saveSettings(){ try { localStorage.setItem('gremlinOvertimeSettings', JSON.stringify(settings)); } catch(e){} }

  let renderer, scene, camera, wcv, wctx;
  let state = 'title';
  const flashMats = [];
  const player = {};
  let enemies = [], projectiles = [], pickups = [], decor = [], stuck = [];
  let boss = null, bossActive = false, bossDead = false, exitPad = null;
  let time = 0, levelTime = 0, shakeT = 0, shakeAmp = 0, flashT = 0, hurtT = 0;
  let toastTimer = 0, lastLockedMsg = 0, regionName = '';
  let totalEnemies = 0, kills = 0, secretsFound = 0;
  const stats = { frames: 0, acc: 0, fps: 0, avgMs: 16.7, resH: 288, samples: [] };
  let lastTouchInput = false;
  let fireBurst = 0, forcedAim = null;

  const WEAP = {
    notes:  { name: 'STICKY NOTES', ammo: 'notes',   rate: 0.13, proj: 'note', speed: 38, dmg: 9,  spread: 0.025, count: 1, size: 0.28, sfx: 'note',   life: 1.2, shake: 0.02 },
    spread: { name: 'SNAP SPREADER', ammo: 'bands',  rate: 0.75, proj: 'band', speed: 40, dmg: 8,  spread: 0.10,  count: 7, size: 0.25, sfx: 'snap',   life: 0.45, shake: 0.12 },
    cannon: { name: 'CONFETTI CANNON', ammo: 'poppers', rate: 0.95, proj: 'ball', speed: 19, dmg: 45, spread: 0.0, count: 1, size: 0.45, sfx: 'cannon', life: 3, splash: 3.0, splashDmg: 60, shake: 0.3 },
  };
  const ORDER = ['notes', 'spread', 'cannon'];
  const AMMO_MAX = { notes: 200, bands: 50, poppers: 20 };
  const EDEF = {
    jam:  { tex: 'jam',  w: 1.1, h: 1.1, hp: 25,  speed: 3.4, r: 0.38, melee: 6,  rate: 0.9, sight: 18, pal: 'paper' },
    imp:  { tex: 'imp',  w: 1.2, h: 1.2, hp: 35,  speed: 2.6, r: 0.38, ranged: true, proj: 'coffee', pdmg: 9, pspeed: 9, rate: 2.1, sight: 20, pal: 'party' },
    blob: { tex: 'blob', w: 1.5, h: 1.5, hp: 80,  speed: 1.8, r: 0.5,  melee: 14, rate: 1.0, sight: 14, pal: 'ink' },
    boss: { tex: 'boss', w: 3.6, h: 3.6, hp: 700, speed: 1.0, r: 1.2,  boss: true, sight: 40, pal: 'boss' },
  };
  const PAL = { paper: [0xffffff, 0xfff6d8, 0x7aa7e0, 0xffd84a], party: [0xff5a7a, 0x3cc8ff, 0xffd84a, 0x7ad65a, 0xb07cff], ink: [0x111111, 0x1d2430, 0x37d4e8, 0x0a0a0a], boss: [0xff5a7a, 0x3cc8ff, 0xffd84a, 0x7ad65a, 0xffffff, 0xb07cff] };
  const PICK = {
    cup:      { tex: 'cup',      s: 0.5, msg: 'Coffee! +15',            f: p => heal(15) },
    snack:    { tex: 'snack',    s: 0.6, msg: 'Snack Pack! +40',        f: p => heal(40) },
    notepad:  { tex: 'notepad',  s: 0.55, msg: 'Sticky notes +40',      f: p => addAmmo('notes', 40) },
    bands:    { tex: 'bands',    s: 0.55, msg: 'Rubber bands +12',      f: p => addAmmo('bands', 12) },
    poppers:  { tex: 'poppers',  s: 0.55, msg: 'Party poppers +4',      f: p => addAmmo('poppers', 4) },
    keycard:  { tex: 'keycard',  s: 0.55, msg: 'Got the RED ACCESS CARD!', f: p => { player.key = true; SFX.play('key'); return true; } },
    gunSpread:{ tex: 'gunSpread',s: 0.7, msg: 'SNAP SPREADER! Press 2 or SWAP', f: p => giveWeapon('spread', 'bands', 16) },
    gunCannon:{ tex: 'gunCannon',s: 0.7, msg: 'CONFETTI CANNON! Press 3 or SWAP', f: p => giveWeapon('cannon', 'poppers', 6) },
  };
  function heal(n){ if (player.hp >= 100) return false; player.hp = Math.min(100, player.hp + n); SFX.play('health'); return true; }
  function addAmmo(k, n){ if (player.ammo[k] >= AMMO_MAX[k]) return false; player.ammo[k] = Math.min(AMMO_MAX[k], player.ammo[k] + n); SFX.play('pickup'); return true; }
  function giveWeapon(w, k, n){ const had = player.has[w]; player.has[w] = true; player.ammo[k] = Math.min(AMMO_MAX[k], player.ammo[k] + n); SFX.play('key'); if (!had) switchWeapon(w); return true; }
  function diffMul(){ return settings.diff === 'chill' ? 0.5 : settings.diff === 'spicy' ? 1.5 : 1; }

  // ---------- setup ----------
  function init(){
    ART.build(); LEVEL.design(); LEVEL.bake();
    const canvas = document.getElementById('view');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    renderer.setPixelRatio(1);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0812); scene.fog = new THREE.Fog(0x0b0812, 9, 40);
    camera = new THREE.PerspectiveCamera(65, 1, 0.05, 90); camera.rotation.order = 'YXZ';
    LEVEL.buildMeshes(scene); window.__sceneRef = scene;
    LEVEL.group.traverse(o => { if (o.material && o.material.userData.flash) flashMats.push(o.material); });
    wcv = document.getElementById('weapon'); wctx = wcv.getContext('2d');
    initParticles();
    resize(); window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    resetWorld();
    requestAnimationFrame(loop);
  }
  let resScale = 1;
  function targetRes(){ const ch = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (settings.res === 'chunky') return 160;
    const maxH = settings.res === 'sharp' ? Math.min(ch * dpr, 600) : Math.min(ch * dpr, 400);
    const minH = settings.res === 'sharp' ? 240 : 180;
    return Math.round(Math.max(minH, Math.min(maxH, maxH * resScale))); }
  function resize(){
    const cw = window.innerWidth, ch = window.innerHeight; const ih = targetRes(), iw = Math.round(ih * cw / ch);
    renderer.setSize(iw, ih, false); stats.resH = ih;
    const aspect = cw / ch; camera.aspect = aspect;
    const hf = 95 * Math.PI / 180; let vf = 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI; camera.fov = Math.min(82, Math.max(50, vf)); camera.updateProjectionMatrix();
    const short = 180; if (cw >= ch){ wcv.height = short; wcv.width = Math.round(short * aspect); } else { wcv.width = short; wcv.height = Math.round(short / aspect); }
    wctx.imageSmoothingEnabled = false;
    if (window.UI) UI.onResize();
  }

  function sprite(tex, w, h, center){ const m = new THREE.SpriteMaterial({ map: ART.sprite[tex], fog: true, alphaTest: 0.5, transparent: false });
    const s = new THREE.Sprite(m); if (center) s.center.set(0.5, 0.5); else s.center.set(0.5, 0); s.scale.set(w, h, 1); scene.add(s); return s; }
  function tint(spr, x, z, k){ const l = LEVEL.lightAt(x, z); spr.material.color.setRGB(Math.min(1.6, l[0] * (k || 1.25)), Math.min(1.6, l[1] * (k || 1.25)), Math.min(1.6, l[2] * (k || 1.25))); }
  function floorAt(x, z){ const c = LEVEL.cellW(x, z); return c && !c.solid ? c.floor : 0; }

  function clearWorld(){ for (const a of [enemies, projectiles, pickups, decor, stuck]) for (const e of a){ if (e.spr) scene.remove(e.spr); } enemies = []; projectiles = []; pickups = []; decor = []; stuck = []; if (exitPad){ scene.remove(exitPad); exitPad = null; } }
  function resetWorld(){
    clearWorld(); resetParticles();
    for (const d of LEVEL.doors){ d.t = 0; d.target = 0; d.sounded = false; for (const m of d.meshes) m.position.y = m.userData.baseY; }
    Object.assign(player, { x: 0, z: 0, y: 1.3, yaw: 0, pitch: 0, hp: 100, key: false, has: { notes: true, spread: false, cannon: false }, ammo: { notes: 60, bands: 0, poppers: 0 }, cur: 'notes',
      cool: 0, bob: 0, vx: 0, vz: 0, path: null, stuckT: 0, swapT: 0, fireT: 0, regen: 0, dead: false, lastStep: 0 });
    boss = null; bossActive = false; bossDead = false; kills = 0; secretsFound = 0; levelTime = 0; totalEnemies = 0; regionName = '';
    const dm = settings.diff === 'chill' ? 0.8 : settings.diff === 'spicy' ? 1.2 : 1;
    for (const e of LEVEL.ents){ const x = e.x * S, z = e.y * S;
      if (e.t === 'player'){ player.x = x; player.z = z; player.y = floorAt(x, z) + 1.3; player.yaw = 0; continue; }
      if (EDEF[e.t]){ const d = EDEF[e.t]; const en = { type: e.t, d, x, z, hp: d.hp * (d.boss ? 1 : dm), maxHp: d.hp * (d.boss ? 1 : dm), state: 'idle', cool: 1 + Math.random(), anim: Math.random() * 2, atkT: 0, flashT: 0,
          wanderT: 0, wx: x, wz: z, path: null, pathT: 0, losT: Math.random() * 0.2, los: false, homeX: x, homeZ: z, strafe: Math.random() < 0.5 ? 1 : -1 };
        en.spr = sprite(d.tex + '0', d.w, d.h); enemies.push(en); totalEnemies++; if (d.boss){ boss = en; en.spawnT = 6; } continue; }
      if (PICK[e.t]){ const p = PICK[e.t]; const spr = sprite(p.tex, p.s, p.s); pickups.push({ type: e.t, x, z, spr, ph: Math.random() * 6 }); continue; }
      if (e.t.startsWith('d_')){ const n = e.t.slice(2); const sz = n === 'vending' ? 1.9 : n === 'cooler' ? 1.5 : n === 'printerSmall' ? 1.2 : 1.3; const spr = sprite(n, sz, sz); spr.position.set(x, floorAt(x, z), z); tint(spr, x, z); decor.push({ spr }); continue; }
      if (e.t === 'exitpad'){ const m = new THREE.MeshBasicMaterial({ map: ART.sprite.exitpad, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        exitPad = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), m); exitPad.rotation.x = -Math.PI / 2; exitPad.position.set(x, floorAt(x, z) + 0.03, z); exitPad.userData = { x, z }; scene.add(exitPad); }
    }
    updateHUD(); if (window.UI) UI.bossBar(false);
  }

  // ---------- particles ----------
  const PN = 900; let pts, pPos, pCol, pVel, pLife, pNext = 0;
  function initParticles(){ const g = new THREE.BufferGeometry(); pPos = new Float32Array(PN * 3); pCol = new Float32Array(PN * 3); pVel = new Float32Array(PN * 3); pLife = new Float32Array(PN);
    for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999;
    g.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); g.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true, fog: true })); pts.frustumCulled = false; scene.add(pts); }
  function resetParticles(){ if (!pLife) return; pLife.fill(0); for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999; pts.geometry.attributes.position.needsUpdate = true; }
  const tmpC = new THREE.Color();
  function burst(x, y, z, n, pal, spd, up){ const P = PAL[pal] || PAL.party;
    for (let k = 0; k < n; k++){ const i = pNext; pNext = (pNext + 1) % PN; tmpC.setHex(P[(Math.random() * P.length) | 0]);
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 0.3, s = spd * (0.4 + Math.random() * 0.8);
      pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = (up || 3) * (0.5 + Math.random()) + e; pVel[i * 3 + 2] = Math.sin(a) * s; pLife[i] = 2.5 + Math.random() * 2.5; }
    pts.geometry.attributes.color.needsUpdate = true; }
  function updParticles(dt){ for (let i = 0; i < PN; i++){ if (pLife[i] <= 0) continue; pLife[i] -= dt; const j = i * 3;
      if (pLife[i] <= 0){ pPos[j + 1] = -999; continue; }
      pVel[j + 1] -= 9 * dt; if (pVel[j + 1] < -2.2) pVel[j + 1] = -2.2; // paper flutters
      pVel[j] *= 1 - 1.2 * dt; pVel[j + 2] *= 1 - 1.2 * dt;
      let nx = pPos[j] + pVel[j] * dt, nz = pPos[j + 2] + pVel[j + 2] * dt; const c = LEVEL.cellW(nx, nz);
      if (!c || c.solid || LEVEL.doorClosed(c)){ pVel[j] *= -0.4; pVel[j + 2] *= -0.4; nx = pPos[j]; nz = pPos[j + 2]; }
      pPos[j] = nx; pPos[j + 2] = nz; let ny = pPos[j + 1] + pVel[j + 1] * dt; const f = floorAt(nx, nz) + 0.02;
      if (ny < f){ ny = f; pVel[j] = 0; pVel[j + 1] = 0; pVel[j + 2] = 0; } pPos[j + 1] = ny; }
    pts.geometry.attributes.position.needsUpdate = true; }

  // ---------- helpers ----------
  function collides(x, z, r, fromFloor){ const x0 = Math.floor((x - r) / S), x1 = Math.floor((x + r) / S), z0 = Math.floor((z - r) / S), z1 = Math.floor((z + r) / S);
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++){ const c = LEVEL.cell(i, j); if (!LEVEL.passable(c, fromFloor)) return true; } return false; }
  function moveActor(a, dx, dz, r){ const ff = floorAt(a.x, a.z); let moved = false;
    if (dx && !collides(a.x + dx, a.z, r, ff)){ a.x += dx; moved = true; }
    if (dz && !collides(a.x, a.z + dz, r, ff)){ a.z += dz; moved = true; } return moved; }
  function eyePos(){ return new V3(player.x, player.y, player.z); }
  function enemyCenter(e){ return new V3(e.x, floorAt(e.x, e.z) + e.d.h * 0.5, e.z); }
  function forward(){ return new V3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch)); }
  function toast(msg, secs){ if (window.UI) UI.toast(msg, secs || 2.2); }
  function shake(a, t){ shakeAmp = Math.max(shakeAmp, a); shakeT = Math.max(shakeT, t || 0.2); }
  function isTouch(){ return lastTouchInput; }
  function aimHelpOn(){ return settings.aim === 'always' || (settings.aim === 'touch' && isTouch()); }
  function autoFireOn(){ return settings.autofire === 'always' || (settings.autofire === 'touch' && isTouch()); }
  function findTarget(coneRad, maxD){ const eye = eyePos(), f = forward(); let best = null, bestA = coneRad;
    for (const e of enemies){ if (e.dead || (e.d.boss && !bossActive)) continue; const c = enemyCenter(e); const v = c.clone().sub(eye); const d = v.length(); if (d > maxD) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(f) / d))); const slack = Math.atan2(Math.max(e.d.w, e.d.h) * 0.5, d); const eff = ang - slack - (d < 3 ? 0.3 : 0);
      if (eff < bestA && LEVEL.lineOfSight(eye.x, eye.y, eye.z, c.x, c.y, c.z)){ bestA = eff; best = { e, c, d, ang: eff }; } }
    return best; }

  // ---------- doors ----------
  function doorDist(d){ let m = 1e9; for (const c of d.cells){ m = Math.min(m, Math.hypot((c.x + 0.5) * S - player.x, (c.y + 0.5) * S - player.z)); } return m; }
  function openDoor(d){ if (d.target === 1) return; d.target = 1; SFX.play('door'); }
  function updDoors(dt){
    for (const d of LEVEL.doors){
      if (d.target === 0){ const dist = doorDist(d);
        if (d.kind === 'door' && dist < 2.4) openDoor(d);
        else if (d.kind === 'locked' && dist < 2.2){ if (player.key){ openDoor(d); toast('Red card accepted. Beep boop.'); } else if (time - lastLockedMsg > 2.5){ lastLockedMsg = time; SFX.play('locked'); toast('Locked! You need the RED ACCESS CARD.'); } }
        else if (d.kind === 'exit' && dist < 2.2){ if (bossDead) openDoor(d); else if (time - lastLockedMsg > 2.5){ lastLockedMsg = time; SFX.play('locked'); toast('Elevator jammed. Unplug the Mega-Copier first!'); } }
        else if (d.kind === 'secret' && dist < 1.75){ const f = forward(); const c = d.cells[0]; const vx = (c.x + 0.5) * S - player.x, vz = (c.y + 0.5) * S - player.z; if ((vx * f.x + vz * f.z) / Math.hypot(vx, vz) > 0.5 && (player.moving || player.use)) findSecret(d); }
        else if (d.kind === 'secret' && player.use && dist < 2.6) findSecret(d);
      }
      if (d.t < d.target){ d.t = Math.min(1, d.t + dt * 1.4); for (const m of d.meshes) m.position.y = m.userData.baseY + d.t * (m.userData.h - 0.08); }
    }
    player.use = false;
  }
  function findSecret(d){ if (d.target === 1) return; openDoor(d); secretsFound++; SFX.play('secret'); toast('SECRET FOUND: the Supply Closet!', 3); }

  // ---------- weapons ----------
  function switchWeapon(w){ if (!player.has[w] || player.cur === w) return; player.cur = w; player.swapT = 0.25; SFX.play('swap'); updateHUD(); }
  function cycleWeapon(dir){ let i = ORDER.indexOf(player.cur); for (let k = 0; k < 3; k++){ i = (i + (dir || 1) + 3) % 3; if (player.has[ORDER[i]]){ switchWeapon(ORDER[i]); return; } } }
  function fire(){ const w = WEAP[player.cur];
    if (player.ammo[w.ammo] <= 0){ if (player.cool <= 0){ SFX.play('empty'); player.cool = 0.3; if (player.cur !== 'notes') { toast('Out of ammo. Swapping gadgets.', 1.5); cycleWeapon(1); } } return; }
    player.ammo[w.ammo]--; player.cool = w.rate; player.fireT = 0.09; flashT = 0.06; shake(w.shake, 0.1); SFX.play(w.sfx);
    const eye = eyePos(); const f = forward(); const right = new V3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    let dir = f.clone(); const tgt = findTarget(aimHelpOn() ? 0.14 : 0.035, 40); if (tgt) dir = tgt.c.clone().sub(eye).normalize();
    const origin = eye.clone().add(right.multiplyScalar(0.1)).add(new V3(0, -0.15, 0)).addScaledVector(dir, 0.55);
    for (let k = 0; k < w.count; k++){ const d = dir.clone(); d.x += (Math.random() - 0.5) * w.spread * 2; d.y += (Math.random() - 0.5) * w.spread * 1.2; d.z += (Math.random() - 0.5) * w.spread * 2; d.normalize();
      spawnProj('player', w.proj, origin.clone(), d.multiplyScalar(w.speed), w.dmg, w.size, w.life, w.splash, w.splashDmg); }
    // gremlin office noise wakes up nearby monsters
    for (const e of enemies){ if (!e.dead && e.state === 'idle' && Math.hypot(e.x - player.x, e.z - player.z) < 10) wake(e); }
    updateHUD(); }
  function spawnProj(owner, kind, pos, vel, dmg, size, life, splash, splashDmg){ const spr = sprite(kind, size, size, true); spr.position.copy(pos); projectiles.push({ owner, kind, pos, vel, dmg, spr, life, splash, splashDmg }); }
  function explode(pos, splash, dmg){ burst(pos.x, pos.y, pos.z, 120, 'party', 6, 4); SFX.play('pop'); shake(0.25, 0.25); flashT = 0.1;
    for (const e of enemies){ if (e.dead) continue; const c = enemyCenter(e); const d = c.distanceTo(pos); if (d < splash + e.d.r) hurtEnemy(e, dmg * (1 - d / (splash + e.d.r) * 0.6)); }
    const c = LEVEL.cellW(pos.x, pos.z); }
  function updProjectiles(dt){
    for (let i = projectiles.length - 1; i >= 0; i--){ const p = projectiles[i]; p.life -= dt; let dead = p.life <= 0;
      const steps = Math.max(1, Math.ceil(p.vel.length() * dt / 0.2));
      for (let s = 0; s < steps && !dead; s++){ p.pos.addScaledVector(p.vel, dt / steps); const c = LEVEL.cellW(p.pos.x, p.pos.z);
        if (!c || c.solid || LEVEL.doorClosed(c) || p.pos.y < c.floor || p.pos.y > c.ceil){
          if (c && c.door && c.door.kind === 'secret' && p.owner === 'player') findSecret(c.door);
          p.pos.addScaledVector(p.vel, -dt / steps * 0.9);
          if (p.kind === 'ball') explode(p.pos, p.splash, p.splashDmg);
          else if (p.kind === 'note' && stuck.length < 40){ const st = sprite('note', 0.24, 0.24, true); st.position.copy(p.pos); tint(st, p.pos.x, p.pos.z); stuck.push({ spr: st, life: 6 }); }
          else burst(p.pos.x, p.pos.y, p.pos.z, 6, p.kind === 'coffee' ? 'ink' : 'paper', 1.5, 1.5);
          dead = true; break; }
        if (p.owner === 'player'){ for (const e of enemies){ if (e.dead || (e.d.boss && !bossActive && e.state === 'idle' && false)) continue; const fy = floorAt(e.x, e.z);
            if (Math.hypot(e.x - p.pos.x, e.z - p.pos.z) < e.d.r + 0.15 && p.pos.y > fy - 0.1 && p.pos.y < fy + e.d.h){
              if (p.kind === 'ball') explode(p.pos, p.splash, p.splashDmg); else { hurtEnemy(e, p.dmg); burst(p.pos.x, p.pos.y, p.pos.z, 4, e.d.pal, 2, 1.5); }
              dead = true; break; } } }
        else if (!player.dead && Math.hypot(player.x - p.pos.x, player.z - p.pos.z) < 0.45 && p.pos.y > player.y - 1.4 && p.pos.y < player.y + 0.3){ hurtPlayer(p.dmg, p.pos); burst(p.pos.x, p.pos.y, p.pos.z, 10, p.kind === 'coffee' ? 'ink' : 'paper', 2, 2); dead = true; }
      }
      if (dead){ scene.remove(p.spr); projectiles.splice(i, 1); continue; }
      p.spr.position.copy(p.pos); if (p.kind !== 'ball') tint(p.spr, p.pos.x, p.pos.z, 1.4); else p.spr.material.color.setRGB(1.3, 1.3, 1.3);
      if (p.kind === 'ball' && Math.random() < 0.6) burst(p.pos.x, p.pos.y, p.pos.z, 1, 'party', 0.5, 0.5);
    }
    for (let i = stuck.length - 1; i >= 0; i--){ stuck[i].life -= dt; if (stuck[i].life <= 0){ scene.remove(stuck[i].spr); stuck.splice(i, 1); } }
  }

  // ---------- player ----------
  function hurtPlayer(dmg, from){ if (player.dead || state !== 'play' || player.godMode) return; dmg *= diffMul(); player.hp -= dmg; hurtT = 0.35; shake(0.18, 0.2); SFX.play('hurt');
    if (from && window.UI){ const a = Math.atan2(-(from.x - player.x), -(from.z - player.z)); let rel = a - player.yaw; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2; UI.hurtDir(-rel); }
    if (player.hp <= 0){ player.hp = 0; player.dead = true; SFX.play('lose'); setTimeout(() => endGame(false), 900); } updateHUD(); }
  function playerCanEnter(a, b){ if (!b || b.solid) return false; if (b.floor - a.floor > LEVEL.STEP || b.ceil - b.floor < 1.6) return false;
    if (b.door && b.door.t < 0.85){ const k = b.door.kind; if (k === 'door') return true; if (k === 'locked') return player.key; if (k === 'exit') return bossDead; return false; } return true; }
  function clearAt(x0, z0, x1, z1){ const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.3); let prev = floorAt(x0, z0);
    for (let i = 1; i <= n; i++){ const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (collides(x, z, 0.3, prev)) return false; prev = floorAt(x, z); } return true; }
  function updPlayer(dt){
    const inp = window.INPUT || { moveF: 0, moveS: 0 };
    let mf = inp.moveF, ms = inp.moveS; if (mf || ms) player.path = null;
    const sp = 5.6; let wx = 0, wz = 0;
    if (mf || ms){ const len = Math.max(1, Math.hypot(mf, ms)); mf /= len; ms /= len; const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      wx = (-sy * mf + cy * ms) * sp; wz = (-cy * mf - sy * ms) * sp; }
    else if (player.path && player.path.length){ // tap-to-walk
      while (player.path.length > 1 && clearAt(player.x, player.z, player.path[1].x, player.path[1].z)) player.path.shift();
      const t = player.path[0]; const dx = t.x - player.x, dz = t.z - player.z, d = Math.hypot(dx, dz);
      if (d < 0.2){ player.path.shift(); if (!player.path.length) player.path = null; }
      else { const s = Math.min(sp * 0.95, d / dt); wx = dx / d * s; wz = dz / d * s; } }
    const k = Math.min(1, dt * 14); player.vx += (wx - player.vx) * k; player.vz += (wz - player.vz) * k;
    const ox = player.x, oz = player.z; moveActor(player, player.vx * dt, player.vz * dt, 0.3);
    const moved = Math.hypot(player.x - ox, player.z - oz); player.moving = (wx || wz) ? true : false;
    if (player.path && player.moving && moved < 0.2 * sp * dt){ player.stuckT += dt; if (player.stuckT > 0.8){ player.path = null; player.stuckT = 0; } } else player.stuckT = 0;
    player.bob += moved * 2.6; if (moved > 0.001 && time - player.lastStep > 0.36){ player.lastStep = time; SFX.play('step'); }
    const target = floorAt(player.x, player.z) + 1.3; player.y += (target - player.y) * Math.min(1, dt * 12);
    // pickups
    for (let i = pickups.length - 1; i >= 0; i--){ const p = pickups[i]; if (Math.hypot(p.x - player.x, p.z - player.z) < 0.95 && Math.abs(floorAt(p.x, p.z) + 1.3 - player.y) < 1){
        const def = PICK[p.type]; if (def.f(p) !== false){ toast(def.msg, 1.8); scene.remove(p.spr); pickups.splice(i, 1); updateHUD(); } } }
    // regions
    const c = LEVEL.cellW(player.x, player.z); if (c && c.reg && c.reg !== regionName){ regionName = c.reg;
      if (c.reg === 'boss' && boss && !bossActive && !bossDead){ bossActive = true; wake(boss); SFX.play('boss'); shake(0.35, 0.8); toast('THE MEGA-COPIER WAKES UP!', 3); UI.bossBar(true); } }
    if (exitPad && Math.hypot(exitPad.userData.x - player.x, exitPad.userData.z - player.z) < 0.9 && bossDead) endGame(true);
    // weapons
    player.cool -= dt; player.swapT = Math.max(0, player.swapT - dt); player.fireT = Math.max(0, player.fireT - dt);
    player.regen += dt; if (player.regen > 1){ player.regen = 0; if (player.ammo.notes < 25){ player.ammo.notes++; updateHUD(); } }
    let want = inp.fireHeld || fireBurst > 0; fireBurst = Math.max(0, fireBurst - dt);
    const tgt = findTarget(0.16, 30); player.lockOn = !!(tgt && tgt.ang < 0.06);
    if (tgt && aimHelpOn() && (want || autoFireOn()) && tgt.ang < 0.16 && time - (player.lookT || 0) > 0.3){ // gentle snap toward the target
      const v = tgt.c.clone().sub(eyePos()); const ty = Math.atan2(-v.x, -v.z), tp = Math.atan2(v.y, Math.hypot(v.x, v.z));
      let dy = ty - player.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const r = Math.min(1, dt * 5); player.yaw += dy * r; player.pitch += (tp - player.pitch) * r; }
    if (forcedAim){ let dy = forcedAim.yaw - player.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; const r = Math.min(1, dt * 14); player.yaw += dy * r; player.pitch += (forcedAim.pitch - player.pitch) * r; forcedAim.t -= dt; if (forcedAim.t <= 0) forcedAim = null; }
    if (!want && autoFireOn() && player.lockOn) want = true;
    if (want && player.cool <= 0 && player.swapT <= 0) fire();
  }

  // ---------- monsters ----------
  function wake(e){ if (e.state === 'idle'){ e.state = 'chase'; if (!e.d.boss) SFX.play('alert'); } }
  function hurtEnemy(e, dmg){ if (e.dead) return; if (e.d.boss && !bossActive) return; e.hp -= dmg; e.flashT = 0.08; wake(e); SFX.play('hit');
    if (e.hp <= 0) killEnemy(e); else if (e.d.boss) UI.bossFill(e.hp / e.maxHp); }
  function killEnemy(e){ e.dead = true; kills++; const c = enemyCenter(e); scene.remove(e.spr);
    if (e.d.pal === 'ink'){ SFX.play('squish'); burst(c.x, c.y, c.z, 70, 'ink', 4, 3); }
    else { SFX.play('pop'); burst(c.x, c.y, c.z, e.d.boss ? 400 : 70, e.d.pal, e.d.boss ? 9 : 4.5, e.d.boss ? 6 : 3.5); }
    if (e.d.boss){ bossDead = true; UI.bossBar(false); shake(0.5, 1.2); SFX.play('win'); toast('MEGA-COPIER UNPLUGGED! The elevator is open.', 4);
      for (let k = 0; k < 4; k++) setTimeout(() => burst(c.x + (Math.random() - 0.5) * 3, c.y + Math.random() * 2, c.z + (Math.random() - 0.5) * 3, 80, 'boss', 6, 4), 200 + k * 250);
      for (const d of LEVEL.doors) if (d.kind === 'exit') openDoor(d); }
    updateHUD(); }
  function enemyCanEnter(a, b){ if (!b || b.solid) return false; if (b.floor - a.floor > LEVEL.STEP || b.ceil - b.floor < 1.6) return false; if (b.door && b.door.t < 0.85) return b.door.kind === 'door'; return true; }
  function steer(e, tx, tz, spd, dt){ const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz); if (d < 0.05) return true; const s = Math.min(spd * dt, d);
    const moved = moveActor(e, dx / d * s, dz / d * s, e.d.r); // open plain doors in the way
    const c = LEVEL.cellW(e.x + dx / d * 0.8, e.z + dz / d * 0.8); if (c && c.door && c.door.kind === 'door' && c.door.target === 0) openDoor(c.door);
    return moved; }
  function updEnemies(dt){
    const eye = eyePos();
    for (const e of enemies){ if (e.dead) continue; const d = e.d; e.anim += dt; e.cool -= dt; e.atkT = Math.max(0, e.atkT - dt); e.flashT = Math.max(0, e.flashT - dt);
      const fy = floorAt(e.x, e.z); const dist = Math.hypot(player.x - e.x, player.z - e.z);
      e.losT -= dt; if (e.losT <= 0){ e.losT = 0.2; e.los = LEVEL.lineOfSight(e.x, fy + d.h * 0.7, e.z, eye.x, eye.y, eye.z); }
      if (d.boss){ updBoss(e, dt, dist); }
      else if (e.state === 'idle'){
        e.wanderT -= dt; if (e.wanderT <= 0){ e.wanderT = 2 + Math.random() * 2; const a = Math.random() * 6.28; e.wx = e.homeX + Math.cos(a) * 2.5; e.wz = e.homeZ + Math.sin(a) * 2.5; }
        steer(e, e.wx, e.wz, d.speed * 0.3, dt);
        if (e.los && dist < d.sight) wake(e);
      } else if (!player.dead){
        let tx = player.x, tz = player.z, spd = d.speed;
        if (d.ranged && e.los){ if (dist < 5){ tx = e.x - (player.x - e.x); tz = e.z - (player.z - e.z); spd *= 0.8; }
          else if (dist < 10){ const px = -(player.z - e.z) / dist, pz = (player.x - e.x) / dist; tx = e.x + px * e.strafe * 2; tz = e.z + pz * e.strafe * 2; spd *= 0.5; if (Math.random() < dt * 0.5) e.strafe *= -1; } }
        if (e.los || dist < 2){ if (!(d.melee && dist < d.r + 0.75)) { if (!steer(e, tx, tz, spd, dt) && d.ranged) e.strafe *= -1; } e.path = null; }
        else { e.pathT -= dt; if (e.pathT <= 0 || !e.path){ e.pathT = 0.6 + Math.random() * 0.3; const p = LEVEL.findPath(e.x, e.z, player.x, player.z, enemyCanEnter); e.path = p ? p.map(c => ({ x: (c.x + 0.5) * S, z: (c.y + 0.5) * S })) : null; }
          if (e.path && e.path.length){ const w = e.path[0]; if (Math.hypot(w.x - e.x, w.z - e.z) < 0.4) e.path.shift(); else steer(e, w.x, w.z, spd, dt); } }
        if (d.melee && dist < d.r + 0.95 && Math.abs(fy + 1.3 - player.y) < 1.2 && e.cool <= 0){ e.cool = d.rate; e.atkT = 0.3; hurtPlayer(d.melee, new V3(e.x, 0, e.z)); }
        if (d.ranged && e.los && dist < 22 && e.cool <= 0){ e.cool = d.rate * (0.8 + Math.random() * 0.5); e.atkT = 0.35; SFX.play('throwit');
          const from = new V3(e.x, fy + d.h * 0.75, e.z); const lead = new V3(player.x + player.vx * 0.3, player.y - 0.25, player.z + player.vz * 0.3);
          spawnProj('enemy', d.proj, from, lead.sub(from).normalize().multiplyScalar(d.pspeed), d.pdmg, 0.38, 5); }
      }
      // separation
      for (const o of enemies){ if (o === e || o.dead) continue; const dx = e.x - o.x, dz = e.z - o.z, dd = Math.hypot(dx, dz), m = e.d.r + o.d.r; if (dd > 0.001 && dd < m){ moveActor(e, dx / dd * (m - dd) * 0.5, dz / dd * (m - dd) * 0.5, e.d.r); } }
      const pdx = e.x - player.x, pdz = e.z - player.z, pd = Math.hypot(pdx, pdz), pm = e.d.r + 0.3; if (pd > 0.001 && pd < pm) moveActor(e, pdx / pd * (pm - pd), pdz / pd * (pm - pd), e.d.r);
      // sprite
      const frame = e.atkT > 0 ? 2 : (Math.floor(e.anim * (e.state === 'idle' ? 3 : 6)) % 2);
      const tex = ART.sprite[d.tex + frame]; if (e.spr.material.map !== tex){ e.spr.material.map = tex; }
      const hop = d.tex === 'jam' && e.state !== 'idle' ? Math.abs(Math.sin(e.anim * 9)) * 0.12 : 0;
      e.spr.position.set(e.x, floorAt(e.x, e.z) + hop, e.z);
      if (e.flashT > 0) e.spr.material.color.setRGB(3, 3, 3); else tint(e.spr, e.x, e.z, d.boss ? 1.5 : 1.3);
    }
  }
  function updBoss(e, dt, dist){ if (!bossActive || player.dead) return;
    e.t2 = (e.t2 || 0) + dt; const enraged = e.hp < e.maxHp * 0.5;
    const tz = (27.5 + Math.sin(e.t2 * (enraged ? 0.9 : 0.55)) * 3.2) * S, tx = (40.5 + Math.sin(e.t2 * 0.31) * 3) * S; steer(e, tx, tz, enraged ? 2.4 : 1.6, dt);
    if (e.cool <= 0){ e.cool = enraged ? 1.5 : 2.3; e.atkT = 0.45; SFX.play('bossShot'); const fy = floorAt(e.x, e.z); const from = new V3(e.x, fy + 2.0, e.z);
      const to = new V3(player.x, player.y - 0.3, player.z).sub(from).normalize(); const n = enraged ? 7 : 5;
      for (let k = 0; k < n; k++){ const a = (k - (n - 1) / 2) * 0.13; const dv = new V3(to.x * Math.cos(a) - to.z * Math.sin(a), to.y, to.x * Math.sin(a) + to.z * Math.cos(a)).normalize();
        spawnProj('enemy', 'plane', from.clone(), dv.multiplyScalar(enraged ? 11 : 9), 8, 0.55, 6); } }
    e.spawnT -= dt; if (e.spawnT <= 0){ e.spawnT = enraged ? 7 : 10; const alive = enemies.filter(o => !o.dead && o.type === 'jam' && o.spawned).length;
      if (alive < 4){ for (let k = 0; k < 2; k++){ const x = e.x - 2.2, z = e.z + (k ? 1.6 : -1.6); const c = LEVEL.cellW(x, z); if (!c || c.solid) continue;
          const d = EDEF.jam; const en = { type: 'jam', d, x, z, hp: d.hp, maxHp: d.hp, state: 'chase', cool: 1, anim: 0, atkT: 0, flashT: 0, wanderT: 0, path: null, pathT: 0, losT: 0, los: true, homeX: x, homeZ: z, strafe: 1, spawned: true };
          en.spr = sprite('jam0', d.w, d.h); enemies.push(en); totalEnemies++; burst(x, 1, z, 30, 'paper', 3, 3); } SFX.play('bossShot'); toast('It printed more Paper Jams!', 1.6); } }
  }

  // ---------- tap input (tap-to-walk / tap-to-shoot) ----------
  function tapAt(sx, sy){ if (state !== 'play' || player.dead) return null;
    const ndc = new THREE.Vector2(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    // 1) a monster under (or near) the finger: turn and shoot
    let best = null, bestD = 1e9; const eye = eyePos();
    for (const e of enemies){ if (e.dead) continue; const c = enemyCenter(e); const p = c.clone().project(camera); if (p.z > 1) continue;
      const px = (p.x + 1) / 2 * window.innerWidth, py = (1 - p.y) / 2 * window.innerHeight; const rad = Math.max(48, e.d.h / c.distanceTo(eye) * window.innerHeight * 0.6);
      const dd = Math.hypot(px - sx, py - sy); if (dd < rad && dd < bestD && LEVEL.lineOfSight(eye.x, eye.y, eye.z, c.x, c.y, c.z)){ bestD = dd; best = { e, c }; } }
    if (best){ const v = best.c.clone().sub(eye); forcedAim = { yaw: Math.atan2(-v.x, -v.z), pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)), t: 0.25 }; fireBurst = WEAP[player.cur].count > 1 ? 0.1 : 0.45; return 'shoot'; }
    // 2) otherwise walk to the spot on the floor
    const dir = new V3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const p = camera.position.clone(); let last = null, hit = null;
    for (let i = 0; i < 400; i++){ p.addScaledVector(dir, 0.1); const c = LEVEL.cellW(p.x, p.z);
      if (!c || c.solid || (c.door && c.door.t < 0.85 && !playerCanEnter(c, c)) || p.y > c.ceil){ hit = last; break; }
      if (p.y <= c.floor){ hit = { x: p.x, z: p.z }; break; } last = { x: p.x, z: p.z }; }
    if (!hit) return null;
    const path = LEVEL.findPath(player.x, player.z, hit.x, hit.z, playerCanEnter);
    if (!path){ toast("Can't get there from here.", 1.2); return 'nopath'; }
    const pts = path.map(c => ({ x: (c.x + 0.5) * S, z: (c.y + 0.5) * S })); const endC = LEVEL.cellW(hit.x, hit.z);
    if (pts.length && endC && endC === path[path.length - 1]){ const cx = (endC.x + 0.5) * S, cz = (endC.y + 0.5) * S; pts[pts.length - 1] = { x: cx + Math.max(-0.6, Math.min(0.6, hit.x - cx)), z: cz + Math.max(-0.6, Math.min(0.6, hit.z - cz)) }; }
    if (!pts.length) pts.push({ x: hit.x, z: hit.z });
    player.path = pts; return 'walk'; }

  // ---------- view & HUD ----------
  function updateHUD(){ if (window.UI) UI.hud({ hp: Math.ceil(player.hp), ammo: player.ammo[WEAP[player.cur].ammo], wname: WEAP[player.cur].name, key: player.key, lock: player.lockOn }); }
  function drawWeapon(){ const w = wcv.width, h = wcv.height; wctx.clearRect(0, 0, w, h); if (state !== 'play' && state !== 'pause') return; if (player.dead) return;
    const img = ART.gun[player.cur][player.fireT > 0 ? 1 : 0]; const bx = Math.sin(player.bob) * 5, by = Math.abs(Math.cos(player.bob)) * 4;
    const rec = player.fireT > 0 ? 5 : 0, sw = player.swapT * 200; const sc = h < w ? 1 : Math.min(1.3, w / 130);
    const iw = Math.round(120 * sc), ih = Math.round(84 * sc);
    wctx.drawImage(img, Math.round((w - iw) / 2 + bx + w * 0.06), Math.round(h - ih + 8 + by + rec + sw), iw, ih); }
  function setFlash(k){ for (const m of flashMats){ if (m.userData.base){ m.color.copy(m.userData.base).multiplyScalar(k); } else m.color.setRGB(k, k, k); } }
  let lastFlashK = 1;
  function render(dt){
    camera.position.set(player.x, player.y + (state === 'play' ? Math.sin(player.bob * 2) * 0.03 : 0), player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    if (shakeT > 0){ shakeT -= dt; camera.position.x += (Math.random() - 0.5) * shakeAmp; camera.position.y += (Math.random() - 0.5) * shakeAmp; camera.rotation.z = (Math.random() - 0.5) * shakeAmp * 0.2; } else shakeAmp = 0;
    flashT = Math.max(0, flashT - dt); const fk = 1 + (flashT > 0 ? 0.35 : 0); if (fk !== lastFlashK){ setFlash(fk); lastFlashK = fk; }
    hurtT = Math.max(0, hurtT - dt); if (window.UI) UI.fx(flashT > 0 ? 1 : 0, hurtT / 0.35);
    for (const p of pickups){ p.ph += dt * 3; p.spr.position.set(p.x, floorAt(p.x, p.z) + 0.15 + Math.sin(p.ph) * 0.08, p.z); tint(p.spr, p.x, p.z, 1.5); }
    if (exitPad) exitPad.material.opacity = bossDead ? 0.6 + Math.sin(time * 5) * 0.4 : 0.15;
    renderer.render(scene, camera); drawWeapon();
  }
  function titleCam(dt){ const t = time * 0.12; player.x = (6.5 + Math.sin(t) * 1.5) * S; player.z = 29.5 * S; player.y = 1.5; player.yaw = Math.sin(t * 0.7) * 0.5; player.pitch = 0.05; }

  // ---------- loop ----------
  let last = performance.now(), lowT = 0, highT = 0;
  function loop(now){ requestAnimationFrame(loop); let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; if (dt <= 0) return; time += dt;
    // frame stats & dynamic resolution
    const ms = dt * 1000; stats.avgMs += (ms - stats.avgMs) * 0.05; stats.frames++; stats.acc += dt; if (stats.samples.length < 2000) stats.samples.push(ms);
    if (stats.acc >= 1){ stats.fps = Math.round(stats.frames / stats.acc); stats.frames = 0; stats.acc = 0; if (window.UI) UI.fps(stats.fps, stats.resH);
      if (settings.res !== 'chunky' && state === 'play'){ if (stats.avgMs > 19){ lowT++; highT = 0; if (lowT >= 1 && resScale > 0.3){ resScale = Math.max(0.3, resScale * 0.85); resize(); lowT = 0; } }
        else if (stats.avgMs < 17.4){ highT++; lowT = 0; if (highT >= 3 && resScale < 1){ resScale = Math.min(1, resScale * 1.1); resize(); highT = 0; } } else { lowT = highT = 0; } } }
    if (state === 'play'){ levelTime += dt; updPlayer(dt); updDoors(dt); updEnemies(dt); updProjectiles(dt); updParticles(dt); }
    else if (state === 'title'){ titleCam(dt); updParticles(dt); }
    else if (state === 'end'){ updParticles(dt); }
    render(dt);
  }
  function setState(s){ state = s; }
  function start(){ resetWorld(); state = 'play'; updateHUD(); toast('Find the RED ACCESS CARD.', 3); }
  function endGame(won){ if (state !== 'play') return; state = 'end'; if (won) SFX.play('win');
    UI.end(won, { time: levelTime, kills, total: totalEnemies, secrets: secretsFound, hp: Math.ceil(player.hp) }); }
  function look(dyaw, dpitch){ if (state !== 'play') return; player.yaw += dyaw; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch + dpitch)); if (dyaw || dpitch){ forcedAim = null; player.lookT = time; } }
  window.__game = { // debug hooks used by the automated smoke test
    get state(){ return state; }, player, get enemies(){ return enemies; }, get pickups(){ return pickups; }, stats, LEVEL, settings,
    teleport(cx, cy, yaw){ player.x = (cx + 0.5) * S; player.z = (cy + 0.5) * S; player.y = floorAt(player.x, player.z) + 1.3; if (yaw !== undefined) player.yaw = yaw; player.path = null; },
    killAll(type){ for (const e of enemies) if (!e.dead && (!type || e.type === type)){ if (e.d.boss) bossActive = true; killEnemy(e); } },
    hurtBoss(n){ if (boss && !boss.dead){ bossActive = true; hurtEnemy(boss, n); } },
    god(on){ player.godMode = on; }, doors: LEVEL.doors, tapAt, get bossDead(){ return bossDead; }, get bossActive(){ return bossActive; }, setResScale(s){ resScale = s; resize(); },
    camera: () => camera, renderer: () => renderer, fire, cycleWeapon, kills: () => kills, secrets: () => secretsFound,
  };
  const origHurt = hurtPlayer;
  return { init, start, setState, get state(){ return state; }, settings, saveSettings, look, tapAt, cycleWeapon, switchWeapon, resize, resetWorld, endGame,
    use(){ player.use = true; }, setTouch(v){ lastTouchInput = v; }, isTouch, player, stats };
})();
