// Elsewhere Annex scene music (v5d2). Small original MIDI loops played by annex-midi-player.js (classic script,
// window.AnnexMidiPlayer). Wraps the existing Annex audio object: the same 🔊 button (audio.setMuted, localStorage
// et-desks-annex-mute) mutes MIDI, the hum and the cues together. No second button.
// Rules: nothing plays before a real user gesture (iOS), nothing plays while muted (the scene is remembered and starts
// on unmute), and scene changes wait for the next bar line, then crossfade 1–2 bars (the player does that).

export const SCENE = {
  // overworld
  station: "annex-station",
  annex: "annex-station",
  office: "office-theme",
  cathouse: "cathouse-play",
  "backrooms-arrival": "backrooms-arrival", // first steps past the Station threshold (the start section)
  "backrooms-explore": "backrooms-explore", // the rest of the calm Backrooms
  "beyond-explore": "backrooms-explore",    // past a weird door (a zone may name its own track)
  "backrooms-battle": "mailroom-battle",    // a scuffle past a weird door
  stable: "annex-station",                   // v6: a place that stays put (settled chord; reuses the Station bed until a new cue exists)
  dreary: "annex-dreary",                    // v6: high intensity: the explore bed, slower, lower and darker
  // instances
  "starter-explore": "mailroom-explore",
  "starter-battle": "mailroom-battle",
  "starter-boss": "mailroom-battle", // no dedicated mailroom-boss cue yet
  "grotto-explore": "grotto-explore",
  "grotto-battle": "grotto-battle",
  "grotto-boss": "grotto-boss",
  "deep-boss": "deep-boss",
  // other rooms fall back to the station bed / a generic scuffle
  "training-explore": "annex-station",
  "training-battle": "mailroom-battle",
  "training-boss": "mailroom-battle",
  "records-explore": "annex-station",
  "records-battle": "mailroom-battle",
  "control-explore": "annex-station",
  "gate-turn-explore": "annex-station",
  "gate-turn-battle": "mailroom-battle",
  "gate-turn-boss": "mailroom-battle",
};

export function sceneFor({ instanceId, kind, isBoss }) {
  if (kind === "victory") return "victory-jingle";
  if (kind === "snorble") return "snorble-theme";
  if (!instanceId) return SCENE[kind] || SCENE.station;
  const k = isBoss || kind === "boss" ? "boss" : (kind || "explore");
  return SCENE[`${instanceId}-${k}`] || (k !== "explore" ? SCENE["starter-battle"] : null) || SCENE[`${instanceId}-explore`] || SCENE.station;
}

export function attachSceneMusic(audio, opts) {
  const base = (opts && opts.base) || "./";
  const Player = (opts && opts.Player) || (typeof window !== "undefined" ? window.AnnexMidiPlayer : null);
  const state = { scene: null, wanted: null, gestured: false, plays: 0, stings: 0, ready: !!Player, lastError: null };
  audio.musicState = () => ({ ...state, running: !!(player && player.running), muted: !!audio.muted, scoreOn: audio.scoreOn });
  audio.SCENE = SCENE;
  if (!Player) { // never break the game over music
    audio.setScene = (name) => { state.wanted = SCENE[name] || name; }; audio.playSting = () => {}; audio.stopScene = () => { state.wanted = null; };
    return audio;
  }
  const player = Player.create({ muted: audio.muted, volume: 0.6 });
  const cache = new Map();
  let db = null, dbP = null;
  const hasUA = () => typeof navigator !== "undefined" && navigator.userActivation;
  state.gestured = !!(hasUA() && navigator.userActivation.hasBeenActive);

  function loadDb() { if (db) return Promise.resolve(db); if (!dbP) dbP = fetch(base + "data/annex-music.json").then((r) => r.json()).then((d) => (db = d)); return dbP; }
  async function midOf(id) {
    if (cache.has(id)) return cache.get(id);
    const rec = (await loadDb()).tracks.find((t) => t.id === id);
    if (!rec) throw new Error("no track " + id);
    const r = await fetch(base + rec.file.replace(/^\.\//, ""));
    const pair = { rec, buf: await r.arrayBuffer() };
    cache.set(id, pair); return pair;
  }
  async function begin(id) { // actually start / crossfade to `id` (only after a gesture, only when unmuted)
    try {
      const { rec, buf } = await midOf(id);
      if (state.wanted !== id || audio.muted || !state.gestured) return;
      if (state.scene === id && player.running) return;
      try { audio.setScore && audio.setScore(false); } catch (e) {}
      player.playBuffer(rec, buf); state.scene = id; state.plays++;
    } catch (e) { state.lastError = String(e && e.message || e); }
  }
  // one-time gesture unlock: create/resume the context INSIDE the gesture (iOS), then start whatever is wanted
  function onGesture() {
    state.gestured = true;
    if (audio.muted || !state.wanted) return;
    player.prime(); // resume() inside the gesture; a no-op once the context is running
    if (state.scene !== state.wanted || !player.running) begin(state.wanted);
  }
  if (typeof addEventListener === "function") ["pointerdown", "touchend", "keydown"].forEach((ev) => addEventListener(ev, onGesture, { capture: true, passive: true }));

  const origMute = audio.setMuted.bind(audio);
  audio.setMuted = function (m) {
    origMute(m); player.setMuted(m);
    if (m) { player.stop(); state.scene = null; try { audio.setScore && audio.setScore(true); } catch (e) {} } // muted: no scheduling at all (keeps the synth light)
    else if (state.wanted) { if (state.gestured) player.prime(); begin(state.wanted); }
  };
  audio.setScene = function (name) {
    const id = SCENE[name] || name;
    if (state.wanted === id && (state.scene === id || audio.muted || !state.gestured)) return;
    state.wanted = id;
    if (audio.muted || !state.gestured) return; // remembered; starts on the first tap / unmute
    loadDb().catch(() => {}); begin(id);
  };
  audio.playSting = async function (name) {
    const id = SCENE[name] || name;
    if (audio.muted || !state.gestured) return;
    try { const { rec, buf } = await midOf(id); player.playStingBuffer(rec, buf); state.stings++; } catch (e) { state.lastError = String(e && e.message || e); }
  };
  audio.stopScene = function () {
    player.stop(); state.scene = state.wanted = null;
    try { audio.setScore && audio.setScore(true); } catch (e) {}
  };
  audio.music = player;
  return audio;
}
