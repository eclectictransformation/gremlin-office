// Ten-pin rules and scoring. Pure functions, no DOM, no timers, no storage.
// A ruleset is any module with this same shape: meta, describe(rolls), canRoll(rolls, n), addRoll(rolls, n).
// The game screen only ever asks a ruleset "what's the state after these rolls?", so a different
// ruleset (custom house rules, a shorter game, another game entirely) can be swapped in without
// touching the screen.

export const meta = Object.freeze({ id: "tenpin", name: "Ten-pin bowling", pins: 10, frames: 10 });

const P = 10, F = 10;

// Splits a list of roll counts into frames. Each frame: { rolls:[...], marks:[...], score:null|number (running total) }.
// Returns the whole game state the screen needs.
export function describe(rolls) {
  const r = Array.isArray(rolls) ? rolls : [];
  const frames = [];
  let i = 0;
  for (let f = 0; f < F; f++) {
    const fr = { index: f, rolls: [], marks: [], score: null, done: false };
    if (f < F - 1) {
      if (i < r.length) fr.rolls.push(r[i]);
      if (r[i] === P) { fr.done = true; i += 1; }
      else {
        if (i + 1 < r.length) { fr.rolls.push(r[i + 1]); fr.done = true; }
        i += 2;
      }
    } else {
      for (let k = 0; k < 3 && i + k < r.length; k++) fr.rolls.push(r[i + k]);
      const [a, b] = fr.rolls;
      const bonus = fr.rolls.length >= 2 && (a === P || a + b === P);
      fr.done = fr.rolls.length === 3 || (fr.rolls.length === 2 && !bonus);
      i += fr.rolls.length;
    }
    fr.marks = marksFor(fr.rolls, f === F - 1);
    frames.push(fr);
  }
  // Running totals: a frame's score shows once every bonus ball it needs has been thrown.
  let total = 0, run = 0, idx = 0, scoredThrough = -1;
  for (let f = 0; f < F; f++) {
    const fr = frames[f];
    let val = null;
    if (f < F - 1) {
      if (r[idx] === P) { if (idx + 2 < r.length) val = P + r[idx + 1] + r[idx + 2]; idx += 1; }
      else if (idx + 1 < r.length && r[idx] + r[idx + 1] === P) { if (idx + 2 < r.length) val = P + r[idx + 2]; idx += 2; }
      else { if (idx + 1 < r.length) val = r[idx] + r[idx + 1]; idx += 2; }
    } else if (fr.done) val = fr.rolls.reduce((s, x) => s + x, 0);
    if (val === null || scoredThrough !== f - 1) break;
    run += val; fr.score = run; scoredThrough = f;
  }
  total = run;
  // Where the next ball goes, and how many pins it faces.
  const cur = frames.findIndex((fr) => !fr.done);
  const over = cur === -1;
  let ball = 0, standing = P, rerack = true;
  if (!over) {
    const fr = frames[cur];
    ball = fr.rolls.length;
    if (cur < F - 1) { standing = ball === 0 ? P : P - fr.rolls[0]; }
    else {
      const [a, b] = fr.rolls;
      if (ball === 0) standing = P;
      else if (ball === 1) standing = a === P ? P : P - a;
      else standing = (a === P && b === P) || (a !== P && a + b === P) ? P : P - b;
    }
    rerack = standing === P;
  }
  // Pins knocked so far (shown as a live "pinfall" sum, separate from the bonus-aware score).
  const pinfall = r.reduce((s, x) => s + x, 0);
  return { meta, frames, total, pinfall, over, frame: over ? F - 1 : cur, ball, standing: over ? 0 : standing, rerack, rolls: r.slice() };
}

function marksFor(rolls, tenth) {
  const m = [];
  for (let k = 0; k < rolls.length; k++) {
    const x = rolls[k], prev = rolls[k - 1];
    const freshRack = k === 0 || (tenth && (prev === P || (k === 2 && rolls[0] !== P && rolls[0] + rolls[1] === P)) );
    if (x === P && freshRack) m.push("X");
    else if (!freshRack && k > 0 && prev + x === P) m.push("/");
    else m.push(x === 0 ? "-" : String(x));
  }
  return m;
}

export function canRoll(rolls, n) {
  if (!Number.isInteger(n) || n < 0) return false;
  const s = describe(rolls);
  return !s.over && n <= s.standing;
}

export function addRoll(rolls, n) {
  if (!canRoll(rolls, n)) throw new RangeError("That roll isn't possible here: " + n);
  return rolls.concat([n]);
}

// Convenience for tests and future tools: score a whole list of rolls in one go.
export function scoreOf(rolls) {
  let acc = [];
  for (const n of rolls) acc = addRoll(acc, n);
  return describe(acc).total;
}

export default { meta, describe, canRoll, addRoll, scoreOf };
