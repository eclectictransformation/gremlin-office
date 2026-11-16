/* Elsewhere Annex MIDI player
 * Tiny Web Audio GM-ish synth. No soundfont.
 * Sine bass/bells, saw or square leads, triangle or filtered-saw pads,
 * noise+sine drums. 5–20 ms attack on every note (pads slower). Global
 * lowpass ~3–4 kHz. About 6 pitched voices. Loops are seamless (no fade);
 * track changes crossfade 1–2 bars on a bar line.
 */
(function (root, factory) {
  if (typeof document !== "undefined") { root.AnnexMidiPlayer = factory(); }
  else { module.exports = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_VOICES = 6;
  var LP_HZ = 3600;

  function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function family(prog, ch) {
    if (ch === 9) return "drum";
    if (prog == null) return "tri";
    if (prog >= 0 && prog <= 7) return "piano";
    if (prog >= 8 && prog <= 15) return (prog === 12 || prog === 13) ? "pluck" : "bell";
    if (prog >= 32 && prog <= 39) return "bass";
    if (prog === 45) return "pizz";
    if (prog >= 48 && prog <= 52 || prog >= 42 && prog <= 47) return "strings";
    if (prog >= 56 && prog <= 63) return "brass";
    if (prog >= 64 && prog <= 71) return "reed";
    if (prog >= 80 && prog <= 87) return "lead";
    if (prog >= 88 && prog <= 95) return "pad";
    if (prog === 108 || (prog >= 104 && prog <= 111)) return "pluck";
    return "tri";
  }

  function vlq(v, i) {
    var c, n = 0;
    do { c = v[i++]; n = (n << 7) | (c & 127); } while (c & 128);
    return [n, i];
  }

  function parseMidi(buf) {
    var u = new Uint8Array(buf);
    function u32(i) { return (u[i] << 24) | (u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]; }
    function u16(i) { return (u[i] << 8) | u[i + 1]; }
    if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== "MThd") throw new Error("not a MIDI file");
    var fmt = u16(8), ntr = u16(10), ppq = u16(12);
    var i = 8 + u32(4);
    var tracks = [];
    for (var t = 0; t < ntr && i < u.length; t++) {
      if (String.fromCharCode(u[i], u[i + 1], u[i + 2], u[i + 3]) !== "MTrk") break;
      var len = u32(i + 4); i += 8;
      var end = i + len, ev = [], tick = 0, run = 0;
      while (i < end) {
        var r = vlq(u, i); tick += r[0]; i = r[1];
        var st = u[i];
        if (st < 128) { st = run; } else { i++; run = st; }
        if (st === 0xff) {
          var typ = u[i++], lr = vlq(u, i); i = lr[1];
          var data = u.subarray(i, i + lr[0]); i += lr[0];
          var text = typ >= 1 && typ <= 7 ? new TextDecoder().decode(data) : "";
          if (typ === 0x51) ev.push({ tick: tick, type: "tempo", us: (data[0] << 16) | (data[1] << 8) | data[2] });
          else if (typ === 0x58) ev.push({ tick: tick, type: "timesig", num: data[0], den: Math.pow(2, data[1]) });
          else if (typ === 0x06) ev.push({ tick: tick, type: "marker", text: text });
        } else if ((st & 0xf0) === 0x90 || (st & 0xf0) === 0x80) {
          var n = u[i++], v = u[i++], ch = st & 15, on = (st & 0xf0) === 0x90 && v;
          ev.push({ tick: tick, type: on ? "on" : "off", ch: ch, note: n, vel: v });
        } else if ((st & 0xf0) === 0xc0) {
          ev.push({ tick: tick, type: "program", ch: st & 15, program: u[i++] });
        } else if ((st & 0xf0) === 0xb0) {
          ev.push({ tick: tick, type: "cc", ch: st & 15, cc: u[i++], val: u[i++] });
        } else if ((st & 0xf0) === 0xe0) { i += 2; }
        else if ((st & 0xf0) === 0xa0 || (st & 0xf0) === 0xd0) { i += ((st & 0xf0) === 0xd0) ? 1 : 2; }
        else if (st === 0xf0 || st === 0xf7) { var sr = vlq(u, i); i = sr[1] + sr[0]; }
        else { i++; }
      }
      tracks.push(ev);
    }
    // merge
    var all = [];
    tracks.forEach(function (ev) { ev.forEach(function (e) { all.push(e); }); });
    all.sort(function (a, b) { return a.tick - b.tick; });
    var tempo = 500000, num = 4, den = 4, prog = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var cc74 = 64, cc91 = 0, markers = {}, notes = [], ons = {}, tsec = 0, last = 0, usPerTick = tempo / ppq;
    all.forEach(function (e) {
      tsec += (e.tick - last) * usPerTick / 1e6;
      last = e.tick;
      if (e.type === "tempo") { tempo = e.us; usPerTick = tempo / ppq; }
      else if (e.type === "timesig") { num = e.num; den = e.den; }
      else if (e.type === "marker") markers[e.text] = { tick: e.tick, time: tsec };
      else if (e.type === "program") prog[e.ch] = e.program;
      else if (e.type === "cc") { if (e.cc === 74) cc74 = e.val; if (e.cc === 91) cc91 = e.val; }
      else if (e.type === "on") ons[e.ch + ":" + e.note] = { t: tsec, tick: e.tick, vel: e.vel, prog: prog[e.ch] };
      else if (e.type === "off") {
        var k = e.ch + ":" + e.note, o = ons[k];
        if (o) {
          notes.push({ t0: o.t, t1: tsec, tick0: o.tick, tick1: e.tick, ch: e.ch, note: e.note, vel: o.vel, prog: o.prog });
          delete ons[k];
        }
      }
    });
    var endTick = last, endTime = tsec;
    var beatsPerBar = num;
    var secPerBeat = (tempo / 1e6) * (4 / den) / (4 / den);
    // seconds per quarter * quarters per bar
    var secPerBar = (tempo / 1e6) * (4 / den) * num;
    return {
      ppq: ppq, notes: notes, markers: markers, tempo: tempo, num: num, den: den,
      endTick: endTick, endTime: endTime, secPerBar: secPerBar, cc74: cc74, cc91: cc91
    };
  }

  function create(opts) {
    opts = opts || {};
    var ctx = null, master = null, music = null, lp = null, echo = null, delay = null, fb = null;
    var muted = !!opts.muted, volume = opts.volume == null ? 0.6 : opts.volume;
    var current = null, nextJob = null, voices = [], drumNodes = 0;
    var running = false, startAt = 0, origin = 0, loopStart = 0, loopEnd = 0, looping = true;
    var filterHz = LP_HZ, echoAmt = 0, parsed = null, trackInfo = null;
    var schedTimer = 0, scheduledUntil = 0;

    function ensure() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = filterHz; lp.Q.value = 0.7;
      music = ctx.createGain(); music.gain.value = 0.22;
      delay = ctx.createDelay(1.2); delay.delayTime.value = 0.38;
      fb = ctx.createGain(); fb.gain.value = 0;
      echo = ctx.createGain(); echo.gain.value = 0;
      music.connect(lp);
      echo.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(lp);
      lp.connect(master);
      return ctx;
    }

    function setFilter(hz, echoVal) {
      filterHz = Math.max(1800, Math.min(4000, hz || LP_HZ));
      echoAmt = echoVal || 0;
      if (lp) lp.frequency.setTargetAtTime(filterHz, ctx.currentTime, 0.05);
      if (echo) echo.gain.setTargetAtTime(echoAmt, ctx.currentTime, 0.08);
      if (fb) fb.gain.setTargetAtTime(Math.min(0.4, echoAmt * 0.7), ctx.currentTime, 0.08);
    }

    function steal() {
      if (voices.length < MAX_VOICES) return;
      // drop the quietest / oldest pad-like voice first
      voices.sort(function (a, b) { return a.pri - b.pri || a.t - b.t; });
      var v = voices.shift();
      try { v.g.gain.cancelScheduledValues(ctx.currentTime); v.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02); v.o.stop(ctx.currentTime + 0.05); } catch (e) {}
    }

    function toneAt(type, hz, t, dur, amp, atk, dec, sus, rel, pri) {
      steal();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = hz;
      var a = Math.max(0.005, atk), r = Math.max(0.03, rel);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + a);
      if (dec > 0) g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * sus), t + a + dec);
      var off = t + dur;
      g.gain.setValueAtTime(Math.max(0.0002, amp * sus), Math.max(t + a + dec, off));
      g.gain.exponentialRampToValueAtTime(0.0001, off + r);
      o.connect(g); g.connect(music);
      if (echoAmt > 0) { var eg = ctx.createGain(); eg.gain.value = 0.8; g.connect(eg); eg.connect(echo); }
      o.start(t); o.stop(off + r + 0.02);
      var rec = { o: o, g: g, t: t, pri: pri };
      voices.push(rec);
      o.onended = function () { voices = voices.filter(function (x) { return x !== rec; }); };
      return o;
    }

    function noiseAt(t, dur, amp, freq, q, type) {
      var n = Math.max(1, Math.floor(ctx.sampleRate * Math.max(dur, 0.02)));
      var b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), i;
      for (i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var s = ctx.createBufferSource(); s.buffer = b;
      var f = ctx.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(music);
      s.start(t); s.stop(t + dur + 0.02);
    }

    function drumAt(note, vel, t) {
      var v = vel / 100;
      if (note === 35 || note === 36) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * v, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g); g.connect(music); o.start(t); o.stop(t + 0.22);
        noiseAt(t, 0.05, 0.08 * v, 200, 1, "lowpass");
      } else if (note === 38 || note === 40) {
        noiseAt(t, 0.14, 0.28 * v, 2000, 0.8, "bandpass");
        toneAt("sine", 180, t, 0.08, 0.12 * v, 0.005, 0.03, 0.3, 0.06, 1);
      } else if (note === 41 || note === 43 || note === 45 || note === 47) {
        var hz = note === 41 ? 90 : note === 43 ? 115 : note === 45 ? 145 : 175;
        var o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = "sine"; o2.frequency.setValueAtTime(hz, t); o2.frequency.exponentialRampToValueAtTime(hz * 0.7, t + 0.16);
        g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.008);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o2.connect(g2); g2.connect(music); o2.start(t); o2.stop(t + 0.28);
      } else if (note === 42 || note === 44) {
        noiseAt(t, 0.04, 0.1 * v, 7000, 0.6, "highpass");
      } else {
        noiseAt(t, 0.3, 0.08 * v, 4000, 0.5, "highpass");
      }
    }

    function playNote(ev, t) {
      if (ev.ch === 9) { drumAt(ev.note, ev.vel, t); return; }
      var fam = family(ev.prog, ev.ch), hz = midiHz(ev.note), dur = Math.max(0.03, ev.t1 - ev.t0);
      var type = "triangle", atk = 0.014, dec = 0.08, sus = 0.7, rel = 0.08, amp = 0.18 * ev.vel / 100, pri = 2;
      if (fam === "bass") { type = "sine"; atk = 0.016; sus = 0.85; amp = 0.28 * ev.vel / 100; pri = 5; }
      else if (fam === "bell") { type = "sine"; atk = 0.008; dec = 0.25; sus = 0.25; rel = 0.45; amp = 0.16 * ev.vel / 100; pri = 3; }
      else if (fam === "pluck") { type = "sine"; atk = 0.008; dec = 0.16; sus = 0.2; rel = 0.16; amp = 0.18 * ev.vel / 100; pri = 2; }
      else if (fam === "piano") { type = "triangle"; atk = 0.012; dec = 0.22; sus = 0.4; rel = 0.14; amp = 0.18 * ev.vel / 100; pri = 4; }
      else if (fam === "pizz") { type = "triangle"; atk = 0.006; dec = 0.07; sus = 0.15; rel = 0.08; amp = 0.16 * ev.vel / 100; pri = 2; }
      else if (fam === "pad") { type = "triangle"; atk = 0.14; dec = 0.18; sus = 0.7; rel = 0.2; amp = 0.14 * ev.vel / 100; pri = 1; }
      else if (fam === "strings") { type = "sawtooth"; atk = 0.09; sus = 0.65; rel = 0.16; amp = 0.1 * ev.vel / 100; pri = 1; }
      else if (fam === "brass") { type = "sawtooth"; atk = 0.02; sus = 0.7; amp = 0.14 * ev.vel / 100; pri = 3; }
      else if (fam === "reed") { type = "square"; atk = 0.016; amp = 0.13 * ev.vel / 100; pri = 4; }
      else if (fam === "lead") { type = "square"; atk = 0.012; dec = 0.06; sus = 0.6; amp = 0.14 * ev.vel / 100; pri = 4; }
      toneAt(type, hz, t, dur, amp, atk, dec, sus, rel, pri);
      // quiet fifth partial on bells, never shrill (already lowpassed)
      if (fam === "bell") toneAt("sine", hz * 2, t, dur * 0.6, amp * 0.15, atk, 0.2, 0.15, 0.3, 0);
    }

    function songTime(at) {
      // map context time -> position in the parsed piece, accounting for looping
      var local = at - origin;
      if (!looping || local < loopEnd) return local;
      var body = loopEnd - loopStart;
      if (body <= 0) return local;
      return loopStart + ((local - loopStart) % body);
    }

    function scheduleTo(upto) {
      if (!parsed || !running) return;
      var now = ctx.currentTime;
      var look = upto;
      var notes = parsed.notes;
      var body = loopEnd - loopStart;
      // schedule a window of song times, expanding loops
      function when(songT, cycle) {
        // first playthrough includes intro; subsequent cycles start at loopStart
        if (cycle === 0) return origin + songT;
        return origin + loopEnd + (cycle - 1) * body + (songT - loopStart);
      }
      // determine which cycles overlap [scheduledUntil, look] in context time
      var maxCycle = 0;
      if (looping && body > 0) {
        maxCycle = Math.ceil(Math.max(0, (look - origin - loopStart) / body)) + 1;
      }
      for (var c = 0; c <= maxCycle; c++) {
        for (var i = 0; i < notes.length; i++) {
          var ev = notes[i];
          if (looping && c > 0 && ev.t0 < loopStart - 1e-4) continue; // skip intro after first time
          if (looping && ev.t0 >= loopEnd - 1e-4) continue;
          var t = when(ev.t0, c);
          if (t < scheduledUntil - 0.001 || t > look) continue;
          if (t < now - 0.02) continue;
          playNote(ev, t);
        }
      }
      scheduledUntil = look;
    }

    function pump() {
      if (!running || !ctx) return;
      scheduleTo(ctx.currentTime + 0.35);
    }

    function stopVoices(fade) {
      var t = ctx ? ctx.currentTime : 0;
      voices.forEach(function (v) {
        try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0.0001, t, fade || 0.04); v.o.stop(t + (fade || 0.04) * 4); } catch (e) {}
      });
      voices = [];
    }

    function startParsed(info, p, fromStart) {
      parsed = p; trackInfo = info;
      var ls = (p.markers.loopStart && p.markers.loopStart.time) || 0;
      var le = (p.markers.loopEnd && p.markers.loopEnd.time) || p.endTime;
      loopStart = ls; loopEnd = le; looping = !!(info && info.loop !== false) && (le > ls);
      var hz = (info && info.filter_hz) || LP_HZ;
      if (p.cc74 < 64) hz = hz * (0.7 + 0.3 * (p.cc74 / 64));
      var ech = (info && (info.echo != null ? info.echo : (info.layers && info.layers.echo))) || 0;
      setFilter(hz, ech);
      var now = ctx.currentTime;
      origin = now + 0.06;
      startAt = fromStart ? 0 : 0;
      scheduledUntil = now;
      running = true;
      current = info;
      pump();
      clearInterval(schedTimer);
      schedTimer = setInterval(pump, 50);
    }

    function crossfadeTo(info, p) {
      // Wait for a bar line, then overlap 1–2 bars.
      var bars = (info && info.loop_points && info.loop_points.crossfade_bars) || 2;
      var spb = (parsed && parsed.secPerBar) || 2;
      var fade = Math.max(spb, Math.min(spb * bars, 4));
      var now = ctx.currentTime;
      var pos = now - origin;
      var body = loopEnd - loopStart;
      var nextBar;
      if (!parsed) nextBar = now + 0.05;
      else if (pos < loopStart) {
        var b = Math.ceil((pos + 0.001) / spb) * spb;
        nextBar = origin + b;
      } else if (looping && body > 0) {
        var into = (pos - loopStart) % body;
        var toBar = Math.ceil((into + 0.001) / spb) * spb;
        if (toBar >= body) toBar = body;
        nextBar = now + (toBar - into);
      } else {
        nextBar = now + 0.05;
      }
      if (nextBar < now + 0.04) nextBar = now + 0.04;
      // fade out current music bus slightly early, fade in new
      var oldMusic = music, oldEcho = echo, oldDelay = delay, oldFb = fb, oldLp = lp;
      // new bus
      lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filterHz; lp.Q.value = 0.7;
      music = ctx.createGain(); music.gain.value = 0.0001;
      delay = ctx.createDelay(1.2); delay.delayTime.value = 0.38;
      fb = ctx.createGain(); fb.gain.value = 0;
      echo = ctx.createGain(); echo.gain.value = 0;
      music.connect(lp); echo.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(lp); lp.connect(master);
      oldMusic.gain.cancelScheduledValues(now);
      oldMusic.gain.setValueAtTime(oldMusic.gain.value, nextBar);
      oldMusic.gain.linearRampToValueAtTime(0.0001, nextBar + fade);
      music.gain.setValueAtTime(0.0001, nextBar);
      music.gain.linearRampToValueAtTime(0.22, nextBar + fade);
      stopVoicesOn(oldMusic, nextBar + fade + 0.05);
      // switch scheduler to the new piece starting at nextBar
      clearInterval(schedTimer);
      running = false;
      // start new so origin = nextBar - 0 (piece starts at 0, including intro)
      startParsed(info, p, true);
      origin = nextBar;
      scheduledUntil = nextBar;
      startAt = nextBar;
      running = true;
      pump();
      schedTimer = setInterval(pump, 50);
    }

    function stopVoicesOn(bus, t) {
      setTimeout(function () { try { bus.disconnect(); } catch (e) {} }, (t - ctx.currentTime + 0.1) * 1000);
    }

    return {
      prime: function () { if (ensure()) ctx.resume && ctx.resume(); },
      setMuted: function (m) {
        muted = !!m;
        if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
      },
      setVolume: function (v) {
        volume = Math.max(0, Math.min(1, v));
        if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      },
      get muted() { return muted; },
      get volume() { return volume; },
      get current() { return current; },
      get running() { return running; },
      parse: parseMidi,
      playParsed: function (info, p, mode) {
        if (!ensure()) return;
        ctx.resume && ctx.resume();
        if (running && parsed && mode !== "cut") { crossfadeTo(info, p); return; }
        stopVoices(0.04);
        startParsed(info, p, true);
      },
      playBuffer: function (info, buf, mode) {
        var p = parseMidi(buf);
        // v6: a track record may be a variant of another file (tempo_scale < 1 = slower, transpose in semitones; drums untouched)
        if (info && (info.tempo_scale || info.transpose)) { var k = 1 / (info.tempo_scale || 1), tr = info.transpose || 0;
          p.notes.forEach(function (n) { n.t0 *= k; n.t1 *= k; if (n.ch !== 9) n.note = Math.max(12, Math.min(115, n.note + tr)); });
          Object.keys(p.markers).forEach(function (m) { p.markers[m] = { tick: p.markers[m].tick, time: p.markers[m].time * k }; });
          p.endTime *= k; p.secPerBar *= k; }
        this.playParsed(info, p, mode);
        return p;
      },
      stop: function () {
        running = false; clearInterval(schedTimer); current = null;
        if (ctx) stopVoices(0.05);
      },
      /* Play a short sting once on top of (or instead of) the loop, then resume. */
      playStingBuffer: function (info, buf) {
        if (!ensure()) return;
        ctx.resume && ctx.resume();
        var p = parseMidi(buf);
        var now = ctx.currentTime + 0.03;
        p.notes.forEach(function (ev) { playNote(ev, now + ev.t0); });
        return p;
      }
    };
  }

  return { create: create, parseMidi: parseMidi, family: family };
});
