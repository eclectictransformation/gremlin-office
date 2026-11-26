// The five bowlers: placeholder cartoon art drawn with plain canvas shapes (Moth does the real art later).
// drawGremlin(ctx, id, cx, footY, h, opts) draws one gremlin standing on footY, h pixels tall.
// opts.view: "front" (character select) or "back" (at the line, camera behind them)
// opts.pose: "ready" | "throw" | "cheer" | "slump"

export const GREMLINS = [
  { id: "pip", name: "Pip", line: "Ideas guy. Has a plan for every pin.", body: "#E0913A", dark: "#B86A22", ball: "#3D6FB6", w: 0.9,
    quips: { strike: ["I KNEW that would work!", "Idea number 47: knock them all down."], spare: ["Plan B, nailed it.", "Cleaned up, like I meant it."], gutter: ["That was a test ball.", "Noted. Dropping that idea."], open: ["Some of them listened.", "Partial credit!"] } },
  { id: "noodle", name: "Noodle", line: "Runs the place on rollers. Spins everything.", body: "#4FA3A5", dark: "#2F7476", ball: "#D9503F", w: 0.78,
    quips: { strike: ["Wheee! Clean sweep!", "Operations: complete."], spare: ["Tidied up the leftovers.", "All squared away."], gutter: ["Took the scenic route.", "The gutter needed checking anyway."], open: ["Close enough for a Tuesday.", "I'll file the rest later."] } },
  { id: "moth", name: "Moth", line: "Quiet. Draws the pins before knocking them.", body: "#9C8FB8", dark: "#6F6390", ball: "#2E2E36", w: 0.86,
    quips: { strike: ["...oh. All of them.", "That made a nice shape."], spare: ["A gentle finish.", "Two strokes. Done."], gutter: ["I was sketching the gutter.", "Smudged it."], open: ["A loose sketch.", "Some negative space left."] } },
  { id: "dot", name: "Dot", line: "Small, round, smells faintly of toner.", body: "#E58FA6", dark: "#B9627A", ball: "#F2C744", w: 0.95, small: true,
    quips: { strike: ["Printed it perfectly!", "Full page, no streaks."], spare: ["Second copy came out right.", "Reprint: success."], gutter: ["Paper jam.", "Out of toner, sorry."], open: ["A bit faded.", "Draft quality."] } },
  { id: "grimble", name: "Grimble", line: "Compliance, risk, and a very careful throw.", body: "#6F8F4E", dark: "#4B6633", ball: "#7A4A8C", w: 1.0,
    quips: { strike: ["All pins accounted for.", "Fully compliant. Hmph."], spare: ["Risk addressed.", "Corrective action taken."], gutter: ["I'll be writing myself up.", "Please don't put that in the minutes."], open: ["Within acceptable limits.", "Room for improvement."] } },
];
export const byId = (id) => GREMLINS.find((g) => g.id === id) || GREMLINS[0];

const INK = "#1A1A18";

function blob(ctx, x, y, rx, ry, fill, lw) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
}
function ear(ctx, x, y, dir, s, g, lw, inner) {
  ctx.beginPath();
  ctx.moveTo(x, y - 0.06 * s); ctx.quadraticCurveTo(x + dir * 0.32 * s, y - 0.2 * s, x + dir * 0.5 * s, y - 0.3 * s);
  ctx.quadraticCurveTo(x + dir * 0.3 * s, y + 0.02 * s, x, y + 0.1 * s); ctx.closePath();
  ctx.fillStyle = g.body; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  if (inner) {
    ctx.beginPath(); ctx.moveTo(x + dir * 0.05 * s, y - 0.03 * s);
    ctx.quadraticCurveTo(x + dir * 0.28 * s, y - 0.14 * s, x + dir * 0.4 * s, y - 0.22 * s);
    ctx.quadraticCurveTo(x + dir * 0.25 * s, y, x + dir * 0.05 * s, y + 0.05 * s); ctx.closePath();
    ctx.fillStyle = "#F2B8B0"; ctx.fill();
  }
}
function ballAt(ctx, x, y, r, color, lw) {
  blob(ctx, x, y, r, r, color, lw);
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fill();
}

export function drawGremlin(ctx, id, cx, footY, h, opts = {}) {
  const g = byId(id), view = opts.view || "front", pose = opts.pose || "ready", t = opts.t || 0;
  const s = h * (g.small ? 0.86 : 1); // height unit
  const lw = Math.max(1.5, s * 0.022);
  const bw = 0.3 * s * g.w, bh = 0.3 * s * (id === "noodle" ? 1.15 : 1);
  const bob = pose === "cheer" ? Math.sin(t * 12) * 0.03 * s : 0;
  const bodyY = footY - 0.08 * s - bh + bob;
  const headY = bodyY - bh * 0.95;
  const headR = 0.21 * s;
  const lean = pose === "throw" ? 0.08 * s : 0;
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // shadow
  ctx.beginPath(); ctx.ellipse(cx, footY, bw * 1.3, 0.05 * s, 0, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fill();
  // feet
  blob(ctx, cx - bw * 0.5, footY - 0.03 * s, 0.11 * s, 0.05 * s, g.dark, lw);
  blob(ctx, cx + bw * 0.5, footY - 0.03 * s, 0.11 * s, 0.05 * s, g.dark, lw);
  // arms (behind body for back view when throwing forward)
  const armR = (side) => {
    const sx = cx + side * bw * 0.85, sy = bodyY - bh * 0.3;
    let ex, ey;
    if (pose === "cheer") { ex = sx + side * 0.12 * s; ey = sy - 0.36 * s + bob; }
    else if (pose === "slump") { ex = sx + side * 0.05 * s; ey = sy + 0.28 * s; }
    else if (pose === "throw" && side === 1) { ex = sx + 0.02 * s; ey = sy - (view === "back" ? 0.25 : 0.1) * s; }
    else { ex = sx + side * 0.1 * s; ey = sy + 0.2 * s; }
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineWidth = 0.075 * s; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 0.075 * s - lw * 2; ctx.strokeStyle = g.body; ctx.stroke();
    blob(ctx, ex, ey, 0.045 * s, 0.045 * s, g.body, lw);
    return [ex, ey];
  };
  const showBall = opts.ball !== false && (pose === "ready");
  const hand = [armR(-1), armR(1)];
  // body
  blob(ctx, cx + lean * 0.3, bodyY, bw, bh, g.body, lw);
  if (id === "dot") { // polka dots
    ctx.fillStyle = "rgba(255,255,255,.55)";
    [[-0.4, -0.2], [0.35, 0.1], [-0.1, 0.45], [0.2, -0.5], [-0.55, 0.35]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(cx + dx * bw, bodyY + dy * bh, 0.03 * s, 0, 7); ctx.fill(); });
  }
  if (id === "moth" && view === "front") { ctx.fillStyle = "rgba(40,40,48,.35)"; ctx.beginPath(); ctx.ellipse(cx + bw * 0.3, bodyY + bh * 0.2, 0.06 * s, 0.03 * s, 0.5, 0, 7); ctx.fill(); }
  if (id === "grimble" && view === "front") { // tie
    ctx.beginPath(); ctx.moveTo(cx, bodyY - bh * 0.85); ctx.lineTo(cx - 0.04 * s, bodyY - bh * 0.1); ctx.lineTo(cx, bodyY + bh * 0.15); ctx.lineTo(cx + 0.04 * s, bodyY - bh * 0.1); ctx.closePath();
    ctx.fillStyle = "#B8775A"; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  }
  if (id === "moth") { // scarf
    ctx.beginPath(); ctx.ellipse(cx, bodyY - bh * 0.85, bw * 0.75, 0.05 * s, 0, 0, 7); ctx.fillStyle = "#C9B26A"; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  }
  // head + ears
  const hx = cx + lean;
  ear(ctx, hx - headR * 0.8, headY - headR * 0.1, -1, s, g, lw, view === "front");
  ear(ctx, hx + headR * 0.8, headY - headR * 0.1, 1, s, g, lw, view === "front");
  blob(ctx, hx, headY, headR * (id === "noodle" ? 0.9 : 1), headR * 0.92, g.body, lw);
  // head extras
  if (id === "noodle") { // curly noodle tuft
    ctx.beginPath(); ctx.moveTo(hx, headY - headR * 0.9);
    ctx.bezierCurveTo(hx + 0.12 * s, headY - headR * 1.7, hx - 0.14 * s, headY - headR * 1.9, hx + 0.02 * s, headY - headR * 2.2);
    ctx.lineWidth = lw * 2.2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = lw; ctx.strokeStyle = "#F2D06B"; ctx.stroke();
  }
  if (id === "moth") { // feathery antennae
    [-1, 1].forEach((d) => {
      ctx.beginPath(); ctx.moveTo(hx + d * headR * 0.3, headY - headR * 0.85);
      ctx.quadraticCurveTo(hx + d * headR * 0.5, headY - headR * 1.6, hx + d * headR * 1.0, headY - headR * 1.9);
      ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
      for (let k = 1; k <= 4; k++) { const tx = hx + d * headR * (0.35 + k * 0.15), ty = headY - headR * (1.0 + k * 0.22);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + d * 0.04 * s, ty + 0.02 * s); ctx.stroke(); }
    });
  }
  if (id === "pip") { // pencil behind the right ear
    ctx.save(); ctx.translate(hx + headR * 0.75, headY - headR * 0.75); ctx.rotate(-0.7);
    ctx.fillStyle = "#F2C744"; ctx.fillRect(-0.015 * s, -0.12 * s, 0.03 * s, 0.2 * s); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = INK; ctx.strokeRect(-0.015 * s, -0.12 * s, 0.03 * s, 0.2 * s);
    ctx.fillStyle = "#E39AA0"; ctx.fillRect(-0.015 * s, -0.15 * s, 0.03 * s, 0.03 * s); ctx.restore();
  }
  if (id === "grimble") { // bushy brows (front) / little bald spot (back)
    if (view === "front") { ctx.fillStyle = "#3A4A33"; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.ellipse(hx + d * headR * 0.38, headY - headR * 0.32, headR * 0.3, headR * 0.1, d * 0.25, 0, 7); ctx.fill(); }); }
    else { ctx.beginPath(); ctx.ellipse(hx, headY - headR * 0.55, headR * 0.28, headR * 0.16, 0, 0, 7); ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fill(); }
  }
  if (view === "front") {
    const eyeY = headY - headR * 0.05, ey = id === "moth" ? headR * 0.13 : headR * 0.2;
    [-1, 1].forEach((d) => {
      blob(ctx, hx + d * headR * 0.38, eyeY, headR * 0.2, ey * (pose === "slump" ? 0.6 : 1), "#FFFDF4", lw * 0.8);
      ctx.beginPath(); ctx.arc(hx + d * headR * 0.38 + headR * 0.04, eyeY + headR * 0.03, headR * 0.09, 0, 7); ctx.fillStyle = INK; ctx.fill();
    });
    if (id === "dot") { ctx.lineWidth = lw; ctx.strokeStyle = INK; [-1, 1].forEach((d) => { ctx.beginPath(); ctx.arc(hx + d * headR * 0.38, eyeY, headR * 0.27, 0, 7); ctx.stroke(); }); ctx.beginPath(); ctx.moveTo(hx - headR * 0.11, eyeY); ctx.lineTo(hx + headR * 0.11, eyeY); ctx.stroke(); }
    // mouth
    ctx.beginPath();
    if (pose === "slump") ctx.arc(hx, headY + headR * 0.62, headR * 0.25, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(hx, headY + headR * 0.3, headR * 0.32, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = lw * 1.2; ctx.strokeStyle = INK; ctx.stroke();
    if (id === "pip" || id === "noodle") { // a tooth
      ctx.fillStyle = "#fff"; ctx.fillRect(hx + headR * 0.05, headY + headR * 0.58, headR * 0.12, headR * 0.12); }
  }
  // the ball, held at the side
  if (showBall) {
    const [bx, by] = hand[1];
    ballAt(ctx, bx + 0.02 * s, by + 0.03 * s, 0.1 * s, g.ball, lw);
  }
  ctx.restore();
}
