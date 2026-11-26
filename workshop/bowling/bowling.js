// Gremlin Bowling: the game screen (drawing, lane physics, touch and mouse input).
// Scoring and rules live in ./rules/ and are only ever asked "what's the state after these rolls?".
import { getRules } from "./rules/index.js";
import { GREMLINS, byId, drawGremlin } from "./gremlins.js";

const params = new URLSearchParams(location.search);
const RULES = getRules(params.get("rules"));
const $ = (id) => document.getElementById(id);

// ---------- lane geometry (metres) ----------
const HALF = 0.527, GUTTER = 0.235, WALL = HALF + GUTTER;
const HEAD_Z = 18.29, ROW = 0.264, SPACE = 0.3048, PIT_Z = HEAD_Z + 3 * ROW + 0.45;
const BALL_R = 0.108, PIN_R = 0.06, PIN_DOWN_R = 0.075, PIN_H = 0.38;
const BALL_M = 7, PIN_M = 1.5;
const PIN_SPOTS = (() => { const a = []; let n = 1;
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) a.push({ n: n++, x: (i - r / 2) * SPACE, z: HEAD_Z + r * ROW }); return a; })();

// ---------- camera: fixed, behind and a little above the bowler ----------
const CAM = { d: 2.2, k: 0.25, h: 1.6 };
let W = 0, H = 0, DPR = 1, F = 1, HY = 0, CX = 0;
const depth = (z) => CAM.d + (z >= 0 ? z * CAM.k : z * 0.6);
function P(x, z, y = 0) { const d = depth(z); return [CX + (F * x) / d, HY + (F * (CAM.h - y)) / d, F / d]; }

// ---------- state ----------
const S = {
  who: null, rolls: [], pins: [], ball: null, bowlerX: 0, phase: "pick", // pick | ready | rolling | settling | result | over
  settleT: 0, rollT: 0, standingAtStart: 0, pose: "ready", poseT: 0, t: 0, sound: true, rngSeed: 1, lastCount: 0,
};
function rng() { S.rngSeed = (S.rngSeed * 1103515245 + 12345) & 0x7fffffff; return S.rngSeed / 0x7fffffff; }

function rack() { S.pins = PIN_SPOTS.map((p) => ({ n: p.n, x: p.x, z: p.z, vx: 0, vz: 0, down: false, gone: false, fall: 0, fallDir: 1, wob: 0 })); }
function sweep() { S.pins = S.pins.filter((p) => !p.down && !p.gone).map((p) => ({ ...p, vx: 0, vz: 0, wob: 0 })); }
const standingPins = () => S.pins.filter((p) => !p.down && !p.gone);

// ---------- audio (one soft pin clack, optional) ----------
let AC = null;
function clack(strength) {
  if (!S.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const n = AC.sampleRate * 0.06, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = "bandpass"; f.frequency.value = 1700 + Math.random() * 600; f.Q.value = 2.5;
    g.gain.value = Math.min(0.35, 0.08 + strength * 0.05);
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
  } catch (e) { /* no sound, no problem */ }
}
let clackBudget = 0;

// ---------- physics ----------
function bowl({ aim = 0, power = 0.75, spin = 0 }) {
  if (S.phase !== "ready") return false;
  const speed = 4.6 + 4.4 * Math.max(0, Math.min(1, power));
  const a = Math.max(-1, Math.min(1, aim)) * 0.042;
  S.ball = { x: S.bowlerX, z: 0.1, vx: speed * Math.sin(a), vz: speed * Math.cos(a), spin: Math.max(-1, Math.min(1, spin)), gutter: false, roll: 0, done: false };
  S.standingAtStart = standingPins().length;
  S.phase = "rolling"; S.rollT = 0; S.settleT = 0; S.pose = "throw"; S.poseT = 0; clackBudget = 0;
  hint("Rolling…"); return true;
}

function collide(a, ra, ma, b, rb, mb, e) {
  const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = ra + rb;
  if (dist >= min || dist === 0) return 0;
  const nx = dx / dist, nz = dz / dist;
  const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  const overlap = min - dist, im = 1 / ma + 1 / mb;
  a.x -= nx * overlap * (1 / ma) / im; a.z -= nz * overlap * (1 / ma) / im;
  b.x += nx * overlap * (1 / mb) / im; b.z += nz * overlap * (1 / mb) / im;
  if (rel <= 0) return 0;
  const j = ((1 + e) * rel) / im;
  a.vx -= (j / ma) * nx; a.vz -= (j / ma) * nz;
  b.vx += (j / mb) * nx; b.vz += (j / mb) * nz;
  // a little scatter so racks don't fall the same way every time
  const tw = (rng() - 0.5) * 0.25 * (j / mb);
  b.vx += -nz * tw; b.vz += nx * tw;
  return j;
}
function knock(p, j) {
  if (p.down || p.gone) return;
  if (j / PIN_M < 0.28) { p.wob = 0.5; p.vx = 0; p.vz = 0; return; } // a graze: it wobbles and stays up
  p.down = true; p.fallDir = p.vx >= 0 ? 1 : -1;
  if (clackBudget < 6) { clack(j / PIN_M); clackBudget++; }
}

function step(dt) {
  const b = S.ball;
  if (b && !b.done) {
    if (!b.gutter) {
      const oil = Math.max(0, Math.min(1, (b.z - 7) / 8));
      b.vx += b.spin * 1.05 * oil * dt;
    }
    b.x += b.vx * dt; b.z += b.vz * dt; b.roll += Math.hypot(b.vx, b.vz) * dt / BALL_R;
    if (!b.gutter && Math.abs(b.x) > HALF && b.z < PIT_Z) { b.gutter = true; b.vx = 0; b.x = Math.sign(b.x) * (HALF + 0.11); b.vz *= 0.92; }
    if (b.z > PIT_Z + 0.4) b.done = true;
    if (!b.gutter) for (const p of S.pins) {
      if (p.gone) continue;
      const j = collide(b, BALL_R, BALL_M, p, p.down ? PIN_DOWN_R : PIN_R, PIN_M, 0.7);
      if (j > 0) knock(p, j);
    }
  }
  const live = S.pins.filter((p) => !p.gone);
  for (let i = 0; i < live.length; i++) for (let k = i + 1; k < live.length; k++) {
    const p = live[i], q = live[k];
    if (!p.down && !q.down) continue; // two standing pins never push each other
    const j = collide(p, p.down ? PIN_DOWN_R : PIN_R, PIN_M, q, q.down ? PIN_DOWN_R : PIN_R, PIN_M, 0.55);
    if (j > 0) { if (!p.down) knock(p, j); if (!q.down) knock(q, j); }
  }
  for (const p of live) {
    if (p.wob > 0) p.wob = Math.max(0, p.wob - dt);
    if (!p.down) continue;
    p.fall = Math.min(1, p.fall + dt * 4);
    p.x += p.vx * dt; p.z += p.vz * dt;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0) { const ns = Math.max(0, sp - 1.6 * dt); p.vx *= ns / sp; p.vz *= ns / sp; }
    if (Math.abs(p.x) > WALL) { p.x = Math.sign(p.x) * WALL; p.vx *= -0.5; }
    if (p.z > PIT_Z || (Math.abs(p.x) > HALF + 0.05 && p.fall >= 1)) p.gone = true;
    if (p.z < HEAD_Z - 1.2) { p.z = HEAD_Z - 1.2; p.vz = Math.abs(p.vz) * 0.3; }
  }
}

function update(dt) {
  S.t += dt; S.poseT += dt;
  if (S.phase === "rolling" || S.phase === "settling") {
    S.rollT += dt;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) step(dt / n);
    const b = S.ball;
    if (S.phase === "rolling" && b.done) S.phase = "settling";
    if (S.phase === "settling") {
      const moving = S.pins.some((p) => !p.gone && p.down && Math.hypot(p.vx, p.vz) > 0.05);
      S.settleT = moving ? S.settleT * 0.5 : S.settleT + dt;
      if (S.settleT > 0.45 || S.rollT > 9) finishRoll();
    }
  } else if (S.phase === "result" && S.poseT > 1.5) nextBall();
}

function finishRoll() {
  const count = S.standingAtStart - standingPins().length;
  const before = RULES.describe(S.rolls);
  const n = Math.max(0, Math.min(before.standing, count));
  recordRoll(n);
}
function recordRoll(n) {
  const before = RULES.describe(S.rolls);
  S.rolls = RULES.addRoll(S.rolls, n);
  S.lastCount = n;
  const after = RULES.describe(S.rolls);
  const fresh = before.standing === RULES.meta.pins;
  let kind = "open", big = n + (n === 1 ? " pin" : " pins");
  if (n === before.standing && fresh) { kind = "strike"; big = "Strike!"; }
  else if (n === before.standing) { kind = "spare"; big = "Spare!"; }
  else if (n === 0) { kind = "gutter"; big = S.ball && S.ball.gutter ? "Gutter ball" : "Missed them all"; }
  const g = byId(S.who), lines = g.quips[kind];
  toast(big, g.name + ": " + lines[Math.floor(rng() * lines.length)]);
  S.pose = kind === "strike" || kind === "spare" ? "cheer" : kind === "gutter" ? "slump" : "ready";
  S.poseT = 0; S.phase = "result"; hint("");
  renderSheet();
  S._after = after;
}
function nextBall() {
  const s = RULES.describe(S.rolls);
  hideToast();
  if (s.over) { S.phase = "over"; S.ball = null; showOver(s); return; }
  if (s.rerack) rack(); else sweep();
  S.ball = null; S.pose = "ready"; S.phase = "ready";
  hint(s.ball === 0 ? "Frame " + (s.frame + 1) + ". Swipe up to bowl" : "Ball " + (s.ball + 1) + ": " + s.standing + " to go");
  renderSheet();
}

// ---------- drawing ----------
const cv = $("lane"), ctx = cv.getContext("2d");
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  // Wide, short screens (phones on their side) get a lower camera so the lane can be drawn bigger.
  CAM.h = W / H > 1.6 ? 0.95 : 1.6;
  const dFar = CAM.d + (PIT_Z + 0.2) * CAM.k;
  F = Math.min(2.15 * W, (0.79 * H) / (CAM.h / CAM.d - (CAM.h - 0.95) / dFar));
  CX = W / 2; HY = H * 0.86 - (F * CAM.h) / CAM.d;
}
function poly(pts, fill, stroke, lw) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawLane() {
  const far = PIT_Z + 0.2, near = -3;
  // wall and back curtain
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#26301f"); g.addColorStop(1, "#3A4A33");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const [hxL, hyT] = P(-WALL - 0.1, far, 0.95), [hxR] = P(WALL + 0.1, far, 0.95), [, hyB] = P(0, far, 0.55);
  poly([[hxL, hyT], [hxR, hyT], [hxR, hyB], [hxL, hyB]], "#B8775A", "#1A1A18", 2);
  ctx.fillStyle = "#F1EDE2"; ctx.font = `700 ${Math.max(9, (hyB - hyT) * 0.5)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("GREMLIN LANES", (hxL + hxR) / 2, (hyT + hyB) / 2);
  // pit (dark) under the curtain
  poly([P(-WALL, far, 0.55).slice(0, 2), P(WALL, far, 0.55).slice(0, 2), P(WALL, far).slice(0, 2), P(-WALL, far).slice(0, 2)], "#12150f");
  // gutters
  const gut = (s) => poly([P(s * HALF, near), P(s * WALL, near), P(s * WALL, far), P(s * HALF, far)].map((p) => p.slice(0, 2)), "#5f6a58", "#1A1A18", 1.5);
  gut(-1); gut(1);
  // side caps
  const cap = (s) => poly([P(s * WALL, near), P(s * (WALL + 0.35), near), P(s * (WALL + 0.35), far), P(s * WALL, far)].map((p) => p.slice(0, 2)), "#54664A", "#1A1A18", 1.5);
  cap(-1); cap(1);
  // the lane (approach + boards)
  const lg = ctx.createLinearGradient(0, P(0, far)[1], 0, P(0, 0)[1]); lg.addColorStop(0, "#c99a5b"); lg.addColorStop(1, "#e7c38c");
  poly([P(-HALF, near), P(HALF, near), P(HALF, far), P(-HALF, far)].map((p) => p.slice(0, 2)), lg, "#1A1A18", 2);
  ctx.strokeStyle = "rgba(120,80,40,.28)"; ctx.lineWidth = 1;
  for (let i = 1; i < 13; i++) { const x = -HALF + (i * 2 * HALF) / 13; const a = P(x, near), b = P(x, far); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  // pin deck tint
  poly([P(-HALF, HEAD_Z - 0.3), P(HALF, HEAD_Z - 0.3), P(HALF, far), P(-HALF, far)].map((p) => p.slice(0, 2)), "rgba(255,240,210,.35)");
  // foul line
  const f1 = P(-HALF, 0), f2 = P(HALF, 0); ctx.strokeStyle = "#B83A2E"; ctx.lineWidth = Math.max(2, f1[2] * 0.02); ctx.beginPath(); ctx.moveTo(f1[0], f1[1]); ctx.lineTo(f2[0], f2[1]); ctx.stroke();
  // target arrows and dots
  ctx.fillStyle = "#6B3B22";
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.135, z = 4.6 + Math.abs(i) * 0.3; const a = P(x, z + 0.35), b = P(x - 0.03, z), c = P(x + 0.03, z);
    poly([a, b, c].map((p) => p.slice(0, 2)), "#6B3B22");
    const d = P(x, 2.1); ctx.beginPath(); ctx.ellipse(d[0], d[1], d[2] * 0.015, d[2] * 0.006, 0, 0, 7); ctx.fill();
  }
}
function pinPath(h, w) {
  // a pin silhouette standing on (0,0), h tall, w belly width
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, 0);
  ctx.bezierCurveTo(-w * 0.6, -h * 0.12, -w * 0.55, -h * 0.42, -w * 0.2, -h * 0.62);
  ctx.bezierCurveTo(-w * 0.1, -h * 0.7, -w * 0.38, -h * 0.86, -w * 0.25, -h * 0.95);
  ctx.bezierCurveTo(-w * 0.15, -h * 1.02, w * 0.15, -h * 1.02, w * 0.25, -h * 0.95);
  ctx.bezierCurveTo(w * 0.38, -h * 0.86, w * 0.1, -h * 0.7, w * 0.2, -h * 0.62);
  ctx.bezierCurveTo(w * 0.55, -h * 0.42, w * 0.6, -h * 0.12, w * 0.22, 0);
  ctx.closePath();
}
function drawPin(p) {
  const [sx, sy, s] = P(p.x, p.z);
  const h = PIN_H * s, w = 0.121 * s * 1.15;
  ctx.save(); ctx.translate(sx, sy);
  ctx.beginPath(); ctx.ellipse(0, 0, w * 0.6, w * 0.22, 0, 0, 7); ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fill();
  const tilt = p.down ? p.fall * 1.45 * p.fallDir : p.wob > 0 ? Math.sin(p.wob * 40) * 0.12 * p.wob : 0;
  ctx.rotate(tilt);
  if (p.down) ctx.scale(1, 1 - p.fall * 0.35);
  pinPath(h, w); ctx.fillStyle = "#FBF8F0"; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.006); ctx.strokeStyle = "#1A1A18"; ctx.stroke();
  ctx.save(); pinPath(h, w); ctx.clip(); ctx.fillStyle = "#C8402F";
  ctx.fillRect(-w, -h * 0.72, w * 2, h * 0.035); ctx.fillRect(-w, -h * 0.66, w * 2, h * 0.035); ctx.restore();
  ctx.restore();
}
function drawBall(b) {
  const y = b.gutter ? -0.04 : 0;
  const [sx, sy, s] = P(b.x, b.z, y);
  const r = BALL_R * s, col = byId(S.who).ball;
  ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.05, r * 0.3, 0, 0, 7); ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fill();
  ctx.beginPath(); ctx.arc(sx, sy - r, r, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = "#1A1A18"; ctx.stroke();
  // finger holes rolling over the top
  const ph = (b.roll % (Math.PI * 2));
  ctx.save(); ctx.beginPath(); ctx.arc(sx, sy - r, r, 0, 7); ctx.clip(); ctx.fillStyle = "rgba(0,0,0,.65)";
  for (const [ox, oa] of [[-0.25, 0], [0.25, 0], [0, 0.5]]) {
    const a = ph + oa; const vy = Math.cos(a); if (vy < 0) continue;
    ctx.beginPath(); ctx.ellipse(sx + ox * r, sy - r - Math.sin(a) * r * 0.7, r * 0.12, r * 0.12 * vy, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(sx - r * 0.35, sy - r * 1.4, r * 0.25, 0, 7); ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fill();
}
function drawAim() {
  if (S.phase !== "ready") return;
  const d = DRAG.mode === "throw" ? DRAG.preview : null;
  const aim = d ? d.aim * 0.042 : 0;
  ctx.save(); ctx.setLineDash([6, 8]); ctx.lineWidth = 2; ctx.strokeStyle = d ? "rgba(251,244,220,.9)" : "rgba(251,244,220,.35)";
  ctx.beginPath();
  for (let z = 0.4, i = 0; z < 12; z += 0.6, i++) {
    const x = S.bowlerX + Math.tan(aim) * z + (d ? d.spin * 0.012 * Math.max(0, z - 6) ** 2 : 0);
    const [sx, sy] = P(x, z); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
  }
  ctx.stroke(); ctx.restore();
}
function drawBowler() {
  const [fx, , s] = P(S.bowlerX, 0);
  const h = Math.min(H * (CAM.h < 1 ? 0.32 : 0.25), s * 0.62);
  const fy = H - Math.max(6, H * 0.02);
  const pose = S.phase === "rolling" || S.phase === "settling" ? (S.poseT < 0.6 ? "throw" : "ready") : S.pose;
  drawGremlin(ctx, S.who, fx + h * 0.08, fy, h, { view: "back", pose, t: S.t, ball: S.phase === "ready" });
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawLane();
  drawAim();
  const things = [];
  for (const p of S.pins) if (!p.gone) things.push({ z: p.z, f: () => drawPin(p) });
  if (S.ball && !S.ball.done) things.push({ z: S.ball.z + 0.01, f: () => drawBall(S.ball) });
  things.sort((a, b) => b.z - a.z).forEach((t) => t.f());
  if (S.who) drawBowler();
}

// ---------- input: slide to step, swipe or pull back to bowl ----------
const DRAG = { id: null, pts: [], mode: null, preview: null };
function lanePxPerMetre() { return P(0, 0)[2]; }
cv.addEventListener("pointerdown", (e) => {
  if (S.phase !== "ready" || DRAG.id !== null) return;
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  DRAG.id = e.pointerId; DRAG.pts = [[e.clientX, e.clientY, performance.now()]]; DRAG.mode = null; DRAG.preview = null; DRAG.x0 = S.bowlerX;
  e.preventDefault();
});
cv.addEventListener("pointermove", (e) => {
  if (e.pointerId !== DRAG.id) return;
  DRAG.pts.push([e.clientX, e.clientY, performance.now()]);
  const [x0, y0] = DRAG.pts[0], dx = e.clientX - x0, dy = e.clientY - y0;
  if (!DRAG.mode && Math.hypot(dx, dy) > 10) DRAG.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? "move" : "throw";
  if (DRAG.mode === "move") { S.bowlerX = clampX(DRAG.x0 + dx / lanePxPerMetre()); }
  else if (DRAG.mode === "throw") { DRAG.preview = readSwipe(); meter(DRAG.preview.power); }
  e.preventDefault();
});
function endDrag(e) {
  if (e.pointerId !== DRAG.id) return;
  const mode = DRAG.mode, sw = mode === "throw" ? readSwipe() : null;
  DRAG.id = null; DRAG.mode = null; DRAG.preview = null; meter(-1);
  if (sw) { if (sw.len < 40) hint("Swipe a little longer to bowl"); else bowl(sw); }
}
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", (e) => { if (e.pointerId === DRAG.id) { DRAG.id = null; DRAG.mode = null; DRAG.preview = null; meter(-1); } });

function readSwipe() {
  const pts = DRAG.pts, [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1];
  let vx = x1 - x0, vy = y1 - y0;
  const pull = vy > 0; // dragged back toward yourself: a slingshot, so it flies the other way
  if (pull) { vx = -vx; vy = -vy; }
  const len = Math.hypot(vx, vy);
  const ref = Math.min(H, 640) * 0.5;
  const power = Math.max(0.15, Math.min(1, len / ref));
  const ang = Math.atan2(vx, -vy); // 0 = straight up the lane
  const aim = Math.max(-1, Math.min(1, ang / 0.4));
  // curve: how far the middle of the swipe bulges off the straight line (sign = which side)
  let bulge = 0;
  if (len > 20) {
    const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (const [px, py] of pts) { const dv = (px - x0) * nx + (py - y0) * ny; if (Math.abs(dv) > Math.abs(bulge)) bulge = dv; }
  }
  // a swipe that bows out to the right ends heading left, so the ball hooks left (and vice versa)
  let spin = Math.max(-1, Math.min(1, (bulge / (0.12 * len || 1)) * (pull ? 1 : 1)));
  if (Math.abs(spin) < 0.15) spin = 0;
  return { aim, power, spin, len };
}
function clampX(x) { return Math.max(-0.4, Math.min(0.4, x)); }
function nudge(d) { if (S.phase === "ready") S.bowlerX = clampX(S.bowlerX + d * 0.05); }
$("left").addEventListener("click", () => nudge(-1));
$("right").addEventListener("click", () => nudge(1));
document.addEventListener("keydown", (e) => {
  if ($("play").hidden || !$("over").hidden) return;
  if (e.key === "ArrowLeft") { nudge(-1); e.preventDefault(); }
  else if (e.key === "ArrowRight") { nudge(1); e.preventDefault(); }
  else if (e.key === " " && e.target === document.body) { bowl({ aim: 0, power: 0.75, spin: 0 }); e.preventDefault(); }
});

// ---------- UI ----------
function meter(p) { const m = $("meter"); if (p < 0) { m.classList.remove("on"); return; } m.classList.add("on"); m.firstElementChild.style.height = Math.round(p * 100) + "%"; }
function hint(t) { $("hint").textContent = t; }
let toastTimer = 0;
function toast(big, small) { const el = $("toast"); el.innerHTML = ""; const b = document.createElement("b"); b.textContent = big; el.append(b); if (small) { const s = document.createElement("span"); s.textContent = small; el.append(s); } el.classList.add("on"); }
function hideToast() { $("toast").classList.remove("on"); }
function renderSheet() {
  const s = RULES.describe(S.rolls), el = $("sheet");
  el.innerHTML = "";
  s.frames.forEach((fr, i) => {
    const d = document.createElement("div"); d.className = "fr" + (i === 9 ? " ten" : "") + (!s.over && i === s.frame ? " cur" : ""); d.setAttribute("role", "cell");
    const n = document.createElement("div"); n.className = "no"; n.textContent = i + 1;
    const bx = document.createElement("div"); bx.className = "bx";
    const boxes = i === 9 ? 3 : 2;
    const marks = i < 9 && fr.marks[0] === "X" ? ["", "X"] : fr.marks;
    for (let k = 0; k < boxes; k++) { const sp = document.createElement("span"); sp.textContent = marks[k] || ""; bx.append(sp); }
    const run = document.createElement("div"); run.className = "run"; run.textContent = fr.score == null ? "" : fr.score;
    d.append(n, bx, run); el.append(d);
  });
  const t = document.createElement("div"); t.className = "fr tot"; t.setAttribute("role", "cell");
  const n = document.createElement("div"); n.className = "no"; n.textContent = "Total";
  const run = document.createElement("div"); run.className = "run"; run.id = "total"; run.textContent = s.total;
  t.append(n, run); el.append(t);
  el.setAttribute("aria-label", "Score sheet. Total " + s.total + (s.over ? ", game over" : ", frame " + (s.frame + 1) + ", ball " + (s.ball + 1)));
}
function showOver(s) {
  const g = byId(S.who);
  $("over-name").textContent = g.name; $("over-score").textContent = s.total;
  $("over-line").textContent = s.total === 300 ? "A perfect game. The pins would like a word." : s.total >= 200 ? "That's a serious score." : s.total >= 100 ? "Solid bowling." : s.total === 0 ? "The gutters thank you for visiting." : "Every frame counts. Go again?";
  $("over").hidden = false; $("again").focus();
}
function startGame(id) {
  S.who = id; S.rolls = []; S.bowlerX = 0; S.ball = null; S.phase = "ready"; S.pose = "ready"; S.rngSeed = 1 + Math.floor(Math.random() * 1e6);
  rack(); $("over").hidden = true; hideToast();
  $("select").hidden = true; $("play").hidden = false;
  resize(); renderSheet(); hint("Frame 1. Swipe up to bowl");
  document.title = byId(id).name + " · Gremlin Bowling · Pip's Workshop";
}
function showPick() { S.phase = "pick"; $("over").hidden = true; $("play").hidden = true; $("select").hidden = false; document.title = "Gremlin Bowling · Pip's Workshop"; }
$("restart").addEventListener("click", () => startGame(S.who));
$("change").addEventListener("click", showPick);
$("again").addEventListener("click", () => startGame(S.who));
$("pick").addEventListener("click", showPick);
$("sound").addEventListener("click", (e) => { S.sound = !S.sound; e.currentTarget.textContent = S.sound ? "Sound on" : "Sound off"; e.currentTarget.setAttribute("aria-pressed", String(S.sound)); });

// roster
const roster = $("roster");
for (const g of GREMLINS) {
  const li = document.createElement("li"), b = document.createElement("button");
  b.type = "button"; b.dataset.who = g.id; b.setAttribute("aria-label", "Bowl as " + g.name);
  const c = document.createElement("canvas"); c.width = 240; c.height = 240;
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = g.name;
  const ln = document.createElement("span"); ln.className = "ln"; ln.textContent = g.line;
  b.append(c, nm, ln); li.append(b); roster.append(li);
  const cx2 = c.getContext("2d"); cx2.fillStyle = "#E8E4D8"; cx2.beginPath(); cx2.arc(120, 130, 105, 0, 7); cx2.fill();
  drawGremlin(cx2, g.id, 120, 222, 210, { view: "front", pose: "ready" });
  b.addEventListener("click", () => startGame(g.id));
}

// loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!$("play").hidden) { update(dt); draw(); }
  requestAnimationFrame(frame);
}
new ResizeObserver(() => { if (!$("play").hidden) resize(); }).observe($("stage"));
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
requestAnimationFrame(frame);
const pre = params.get("bowler"); if (pre && GREMLINS.some((g) => g.id === pre)) startGame(pre);

// Read-only peek for automated checks (no data leaves the page).
window.GremlinBowling = Object.freeze({
  state: () => ({ who: S.who, phase: S.phase, rolls: S.rolls.slice(), total: RULES.describe(S.rolls).total, over: RULES.describe(S.rolls).over, bowlerX: S.bowlerX, standing: standingPins().length, rules: RULES.meta.id }),
});
