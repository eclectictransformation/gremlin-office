// Elsewhere Annex audio: an original tiny chiptune loop + fluorescent hum + small cues.
// Everything is synthesized with Web Audio in code (no samples, no borrowed melodies). Only runs inside the Annex.
const MUTE_KEY = "et-desks-annex-mute";
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// 8 bars of 8th notes, tiptoe-mischief in E minor with a few chromatic "gremlin" steps. Original composition.
const LEAD = [
  76, 0, 79, 78, 76, 0, 71, 0,
  72, 71, 72, 0, 74, 0, 71, 0,
  76, 0, 79, 78, 76, 0, 83, 82,
  81, 0, 79, 0, 78, 79, 76, 0,
  69, 0, 72, 71, 69, 0, 64, 0,
  65, 64, 65, 0, 67, 0, 70, 71,
  72, 74, 76, 74, 72, 0, 71, 70,
  71, 0, 0, 83, 0, 0, 64, 0,
];
const ROOTS = [40, 36, 40, 35, 45, 41, 36, 35]; // E C E B A F C B
const BPM = 138, STEP = 60 / BPM / 2;

export function createAnnexAudio() {
  let ctx = null, master = null, musicBus = null, humBus = null, sched = 0, nextT = 0, step = 0, running = false, steps = 0;
  let muted = false; try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch {}
  const humNodes = []; let pendingGesture = null, wantRun = false;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.11; musicBus.connect(master);
    humBus = ctx.createGain(); humBus.gain.value = 0.0; humBus.connect(master);
    return ctx;
  }
  function tone(type, f, t, dur, vol, bus = musicBus, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02); return o;
  }
  function noise(t, dur, vol, freq = 6000, q = 1, bus = musicBus) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02); return { s, f };
  }
  function playStep(t) {
    const i = step % LEAD.length, bar = Math.floor(i / 8), k = i % 8, n = LEAD[i];
    if (n) { tone("square", midi(n), t, STEP * 0.55, 0.22, musicBus, 9); if (k === 7 && bar % 2) tone("square", midi(n + 12), t + STEP * 0.5, STEP * 0.3, 0.1, musicBus, -8); }
    if (k === 0 || k === 4) tone("triangle", midi(ROOTS[bar] + (k === 4 ? 7 : 0)), t, STEP * 0.9, 0.5);
    if (k === 2 || k === 6) noise(t, 0.03, 0.12, 7000, 0.8);
    if (k === 3 && bar === 7) { const o = tone("square", midi(88), t, 0.18, 0.06); o.frequency.exponentialRampToValueAtTime(midi(100), t + 0.16); } // a tiny giggle
    step++; steps++;
  }
  function pump() { if (!running || !ctx) return; while (nextT < ctx.currentTime + 0.2) { playStep(nextT); nextT += STEP; } }
  function startHum() {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.connect(humBus);
    [[120, "sawtooth", 0.35], [240, "sawtooth", 0.12], [60, "sine", 0.6], [121.3, "sawtooth", 0.2]].forEach(([f, ty, v]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = ty; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(lp); o.start(); humNodes.push(o); });
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 0.006; lfo.connect(lg); lg.connect(humBus.gain); lfo.start(); humNodes.push(lfo);
    humBus.gain.setTargetAtTime(0.03, ctx.currentTime, 0.6);
  }
  return {
    prime() { if (navigator.userActivation && !navigator.userActivation.isActive && !navigator.userActivation.hasBeenActive) return; if (ensure()) ctx.resume?.(); }, // call inside a click / key handler so the browser allows sound
    start() {
      if (running) return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) { // no click/key yet (e.g. a demo deep link): wait for one
        if (!pendingGesture) { pendingGesture = () => { removeEventListener("pointerdown", pendingGesture); removeEventListener("keydown", pendingGesture); const go = wantRun; pendingGesture = null; if (go) this.start(); };
          addEventListener("pointerdown", pendingGesture); addEventListener("keydown", pendingGesture); }
        wantRun = true; return; }
      if (!ensure()) return; ctx.resume?.(); running = true; step = 0; nextT = ctx.currentTime + 0.12;
      startHum(); sched = setInterval(pump, 40); pump();
    },
    stop() {
      wantRun = false; running = false; clearInterval(sched); if (!ctx) return;
      humNodes.splice(0).forEach((o) => { try { o.stop(); } catch {} }); humBus.gain.cancelScheduledValues(ctx.currentTime); humBus.gain.value = 0;
    },
    setMuted(m) { muted = !!m; try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch {} if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.05); },
    get muted() { return muted; },
    // little cues (all quiet, nothing harsh)
    sfx(name) {
      if (muted || (navigator.userActivation && !navigator.userActivation.hasBeenActive) || !ensure()) return; const t = ctx.currentTime + 0.01;
      if (name === "zip") { const n = noise(t, 0.55, 0.35, 900, 3, master); n.f.frequency.exponentialRampToValueAtTime(5200, t + 0.5); }
      else if (name === "chime") { [1318.5, 1975.5, 2637].forEach((f, i) => tone("sine", f, t + i * 0.07, 1.1, 0.12, master)); }
      else if (name === "flump") { const o = tone("sine", 180, t, 0.35, 0.4, master); o.frequency.exponentialRampToValueAtTime(55, t + 0.3); noise(t, 0.2, 0.15, 400, 1, master); }
      else if (name === "blip") { [0, 1, 2].forEach((i) => tone("square", 300 + Math.random() * 500, t + i * 0.06, 0.05, 0.05, master)); }
      else if (name === "nope") { tone("square", 196, t, 0.12, 0.08, master); tone("square", 185, t + 0.13, 0.22, 0.08, master); }
      else if (name === "pick") { tone("triangle", 880, t, 0.1, 0.15, master); tone("triangle", 1320, t + 0.08, 0.18, 0.12, master); }
    },
    state: () => ({ running, waitingForGesture: !!pendingGesture, muted, ctx: ctx?.state || "none", steps, gain: master ? master.gain.value : null }),
  };
}
