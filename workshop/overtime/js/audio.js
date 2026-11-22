// Tiny WebAudio synth. Every sound is generated in code (no audio files).
window.SFX = (function(){
  let ctx = null, master = null, noiseBuf = null, vol = 0.7;
  function init(){
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // iOS unlock: play a silent blip
    const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.01);
  }
  function setVolume(v){ vol = v; if (master) master.gain.value = v; }
  function tone(f0, f1, dur, type, v, delay){
    if (!ctx || vol <= 0) return; const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, v, ftype, f0, f1, delay){
    if (!ctx || vol <= 0) return; const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter(); f.type = ftype || 'lowpass'; f.frequency.setValueAtTime(f0 || 2000, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1 || f0 || 2000), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const S = {
    note(){ tone(900, 1500, 0.06, 'square', 0.08); noise(0.05, 0.08, 'highpass', 3000); },
    snap(){ noise(0.18, 0.35, 'bandpass', 1800, 300); tone(220, 70, 0.15, 'sawtooth', 0.12); },
    cannon(){ tone(160, 40, 0.35, 'sawtooth', 0.25); noise(0.4, 0.4, 'lowpass', 1200, 100); },
    pop(){ tone(500 + Math.random()*300, 1400, 0.08, 'square', 0.12); noise(0.12, 0.2, 'highpass', 2500); tone(1200, 2400, 0.05, 'triangle', 0.08, 0.05); },
    squish(){ tone(180, 60, 0.25, 'sine', 0.25); noise(0.2, 0.2, 'lowpass', 600, 120); },
    hit(){ tone(300, 180, 0.05, 'square', 0.06); },
    hurt(){ tone(220, 110, 0.18, 'sawtooth', 0.18); },
    pickup(){ tone(660, 660, 0.07, 'square', 0.1); tone(990, 990, 0.1, 'square', 0.1, 0.07); },
    health(){ tone(520, 780, 0.12, 'triangle', 0.15); tone(780, 1040, 0.12, 'triangle', 0.12, 0.1); },
    key(){ [660, 880, 1100, 1320].forEach((f, i) => tone(f, f, 0.09, 'square', 0.1, i * 0.08)); },
    door(){ noise(0.7, 0.25, 'lowpass', 400, 120); tone(90, 60, 0.6, 'sawtooth', 0.06); },
    locked(){ tone(160, 150, 0.12, 'square', 0.12); tone(120, 110, 0.18, 'square', 0.12, 0.13); },
    secret(){ [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.13, i * 0.07)); },
    alert(){ tone(400, 700, 0.12, 'square', 0.07); },
    throwit(){ noise(0.15, 0.12, 'bandpass', 900, 400); },
    boss(){ tone(70, 50, 1.2, 'sawtooth', 0.25); noise(1.2, 0.2, 'lowpass', 300, 80); tone(140, 90, 0.8, 'square', 0.08, 0.3); },
    bossShot(){ noise(0.3, 0.2, 'bandpass', 1400, 600); tone(300, 200, 0.2, 'square', 0.08); },
    win(){ [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'square', 0.1, i * 0.14)); },
    lose(){ [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.98, 0.25, 'triangle', 0.15, i * 0.22)); },
    swap(){ tone(300, 500, 0.06, 'square', 0.07); },
    empty(){ tone(120, 100, 0.05, 'square', 0.08); },
    step(){ noise(0.05, 0.03, 'lowpass', 500); },
  };
  return { init, setVolume, play(n){ try { S[n] && S[n](); } catch(e){} } };
})();
