(() => {
const C = window.APP_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fill = s => s.replaceAll("{Community}", C.community).replaceAll("{Host}", C.host);
const store = {
  get(k, d) { try { const v = localStorage.getItem("et_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem("et_" + k, JSON.stringify(v)); }
};
let D = null;
const PORTRAIT = {};
const pic = (key, extra = "") => { const p = PORTRAIT[key]; return `<picture>${p ? `<source media="(orientation: portrait)" srcset="${esc(p)}">` : ""}<img src="${esc(C[key])}" alt="" ${extra}></picture>`; };

// White-label config -> CSS variables and brand
const map = { bg:"--bg", surface:"--paper", divider:"--border", text:"--ink", muted:"--muted", primary:"--forest", secondary:"--sage", clay:"--clay" };
if (!matchMedia("(prefers-color-scheme: dark)").matches)
  for (const [k, v] of Object.entries(C.colors || {})) if (map[k]) document.documentElement.style.setProperty(map[k], v);
$("#brandName").textContent = C.community;
$("#logo").innerHTML = C.logoImage ? `<img src="${esc(C.logoImage)}" alt="">` : esc(C.logoText);
$("#wlNote").textContent = `${C.community} app preview. The name, colors, and logo come from one config file, so partner businesses can run it under their own name.`;

const TILES = {
  meditations: { label: "Meditations", k: "Listen now or save for offline", go: "meditations" },
  ground: { label: "The Ground of Being", k: "Your saved meditation", play: "ground" },
  music: { label: "Music & playlists", k: `${C.host}'s own music`, go: "music" },
  sauna: { label: "Sauna room", k: "Warm, slow sound", go: "sauna" },
  board: { label: "Community board", k: "What's happening", go: "board" },
  events: { label: "Classes & Events", k: "Opens the website", href: C.eventsUrl },
  pay: { label: "Book & pay", k: "Services and sessions", go: "pay", quiet: true }
};
const tiles = () => store.get("tiles", null) || ["ground", "meditations", "music", "sauna", "board", "events", "pay"].filter(k => k !== "music");

// ---------- Audio player with fades and resume ----------
const audio = new Audio(); audio.preload = "none";
let current = null, fadeRAF = 0;
function fade(to, ms, done) {
  cancelAnimationFrame(fadeRAF);
  const from = audio.volume, t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / ms); audio.volume = from + (to - from) * p; p < 1 ? fadeRAF = requestAnimationFrame(step) : done && done(); };
  fadeRAF = requestAnimationFrame(step);
}
function setPBtn() { const playing = !audio.paused; $("#pBtn").textContent = playing ? "❚❚" : "▶"; $("#pBtn").setAttribute("aria-label", playing ? "Pause" : "Play"); const b = $("#bigPlay"); if (b) { b.textContent = $("#pBtn").textContent; b.setAttribute("aria-label", $("#pBtn").getAttribute("aria-label")); } }
function play(track) {
  if (!current || current.id !== track.id) {
    if (current) store.set("pos_" + current.id, audio.currentTime);
    current = track; audio.src = track.src;
    const pos = store.get("pos_" + track.id, 0);
    audio.addEventListener("loadedmetadata", () => { if (pos && pos < audio.duration - 1) audio.currentTime = pos; }, { once: true });
  }
  $("#player").hidden = false; $("#pTitle").textContent = track.title;
  $("#pMeta").textContent = `${track.length} · sample audio`;
  audio.volume = 0; audio.play().then(() => fade(1, 1000)).catch(() => {});
}
function toggle() { if (!current) return; if (audio.paused) { audio.volume = 0; audio.play().then(() => fade(1, 1000)); } else fade(0, 600, () => audio.pause()); }
audio.addEventListener("play", setPBtn); audio.addEventListener("pause", setPBtn);
audio.addEventListener("timeupdate", () => current && store.set("pos_" + current.id, audio.currentTime));
audio.addEventListener("ended", () => { store.set("pos_" + current.id, 0); $("#pMeta").textContent = "Done. Take a breath before you move on."; const d = $("#doneMsg"); if (d) d.hidden = false; });
$("#pBtn").onclick = toggle;
const findTrack = id => [...D.meditations, ...D.music, ...D.sauna].find(t => t.id === id);

// ---------- Offline saving ----------
const saved = () => new Set([...store.get("saved", []), ...D.meditations.filter(m => m.preloaded).map(m => m.id)]);
function saveOffline(m) {
  const s = store.get("saved", []); if (!s.includes(m.id)) s.push(m.id); store.set("saved", s);
  if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: "save", url: m.src });
  render();
}

// ---------- Sign-in (demo only) ----------
const profile = () => store.get("profile", null);
function sheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; }
function closeSheet() { $("#sheet").hidden = true; }
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
function needSignIn(why, then) {
  if (profile()) return then();
  sheet(`<h2>Sign in to ${esc(why)}</h2><p>Everything else works without an account.</p>
    <button class="btn" id="gBtn">Continue with Google</button>
    <p class="small" style="margin-top:12px">Demo only: this just creates a local sample profile on this device. Nothing is sent anywhere.</p>
    <button class="btn link" id="notNow">Not now</button>`);
  $("#notNow").onclick = closeSheet;
  $("#gBtn").onclick = () => { store.set("profile", { name: "", via: "google-demo" }); questions(then); };
}
function questions(then) {
  sheet(`<h2>A few quick questions</h2><p class="small">All optional. Skip any of them.</p>
    <div class="q"><label for="qName">What should we call you?</label><input type="text" id="qName" autocomplete="nickname"></div>
    <div class="q"><label for="qWant">What would you like here?</label><input type="text" id="qWant" placeholder="Rest, music, community..."></div>
    <div class="q"><label><input type="checkbox" id="qNear" checked> Show events near me</label></div>
    <div class="row"><button class="btn" id="qSave">Done</button><button class="btn quiet" id="qSkip">Skip</button></div>`);
  const finish = save => { const p = profile(); if (save) { p.name = $("#qName").value.trim(); p.want = $("#qWant").value.trim(); p.nearby = $("#qNear").checked; } store.set("profile", p); closeSheet(); then && then(); render(); };
  $("#qSave").onclick = () => finish(true); $("#qSkip").onclick = () => finish(false);
}

// ---------- Screens ----------
const V = {};
V.welcome = () => `
  <section class="scene" style="--scene-l:url('${esc(C.heroImage)}');--scene-p:url('${esc(PORTRAIT.heroImage || C.heroImage)}')"><div class="cloud" aria-hidden="true"></div>
    <div class="inner"><p class="small">${esc(C.community)}</p><h1>How are you feeling?</h1>
    <div class="chips">${D.moods.map(m => `<button class="chip" data-mood="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>
    <button class="btn link" data-go="home">Just let me wander</button></div></section>
  <div id="moodResults"></div>
  <div class="card"><p>${esc(fill("Welcome to {Community}. You made it here, and that counts for something."))}</p>
  <p style="margin:0">This is your space: your meditations, your music, your people. Make it yours.</p></div>`;
V.home = () => {
  const p = profile(), list = tiles(), editing = store.get("editing", false);
  const removed = Object.keys(TILES).filter(k => !list.includes(k));
  return `<h1>${p && p.name ? "Hi, " + esc(p.name) : "Welcome in"}</h1>
  <p class="small">Long-press a tile, or tap Edit, to move or remove it.</p>
  <div class="tiles ${editing ? "editing" : ""}" id="tiles">${list.map((k, i) => { const t = TILES[k]; return `
    <div class="tile ${i === 0 ? "focal" : ""} ${t.quiet ? "quiet" : ""}" role="button" tabindex="0" data-tile="${k}">
      ${editing ? `<span class="ctl"><button data-mv="${k}:-1" aria-label="Move ${t.label} earlier">↑</button><button data-mv="${k}:1" aria-label="Move ${t.label} later">↓</button><button data-rm="${k}" aria-label="Remove ${t.label}">✕</button></span>` : ""}
      <span class="k">${esc(t.k)}</span><span>${esc(t.label)}</span></div>`; }).join("")}</div>
  <div class="row"><button class="btn quiet" id="editBtn">${editing ? "Done editing" : "Edit home"}</button>
  ${editing && removed.length ? removed.map(k => `<button class="chip" data-add="${k}">+ ${esc(TILES[k].label)}</button>`).join("") : ""}</div>`;
};
V.unwell = () => `<div class="calm-page">
  <div class="hdr-img calm-bg mist-hdr">${pic("heroImage")}</div>
  <h1>We're here. Let's slow down.</h1><p>Pick whatever feels easiest. There's no wrong choice.</p>
  <div class="list">
    <button class="item" data-go="breathe"><span><span class="t">Breathe with me</span><span class="m">2 min</span></span><span>→</span></button>
    <button class="item" data-play="ground"><span><span class="t">The Ground of Being</span><span class="m">12 min · saved for offline</span></span><span>▶</span></button>
    <button class="item" data-play="m3"><span><span class="t">Calm music</span><span class="m">Low Lantern</span></span><span>▶</span></button>
    <button class="item" data-go="talk"><span><span class="t">Talk to someone</span><span class="m">Book time with ${esc(C.host)} or a partner</span></span><span>→</span></button>
  </div>
  <p class="small">For a medical concern, please contact your doctor or local care.</p>
  <p>If you're in crisis, call or text <a href="tel:988">988</a> anytime.</p></div>`;
V.breathe = () => `<h1>Breathe with me</h1><div class="breath-wrap"><div class="breath" aria-hidden="true"></div><p class="breath-label" id="bLabel" aria-live="polite">Breathe in</p></div>
  <p class="small" style="text-align:center">Two minutes. Stop whenever you like.</p>
  <div class="row" style="justify-content:center"><button class="btn quiet" data-go="unwell">Back</button></div>
  <p class="small" style="text-align:center;margin-top:16px">If you're in crisis, call or text 988 anytime.</p>`;
V.talk = () => `<h1>Talk to someone</h1><p>Book time with ${esc(C.host)}. Opens Calendly in a new tab.</p>
  <div class="list">${D.booking.map(b => `<a class="item" href="${esc(b.url)}" target="_blank" rel="noopener"><span class="t">${esc(b.label)}</span><span>↗</span></a>`).join("")}</div>
  <p class="small">This app doesn't handle crisis support. If you're in crisis, call or text <a href="tel:988">988</a> anytime.</p>
  <button class="btn quiet" data-go="unwell">Back</button>`;
V.meditations = () => { const s = saved(); return `
  <div class="hdr-img">${pic("meditationImage")}</div>
  <h1>Meditations</h1><p class="small">All audio here is sample audio for the mock-up.</p>
  <div class="list">${D.meditations.map(m => `<div class="item"><button class="btn link" style="text-align:left;text-decoration:none;color:inherit" data-open="${m.id}"><span class="t">${esc(m.title)}</span><span class="m">${esc(m.length)} · ${esc(m.mood)}</span></button>
    ${s.has(m.id) ? `<span class="saved">Saved for offline</span>` : `<button class="chip" data-save="${m.id}">Save · 0.3 MB</button>`}</div>`).join("")}</div>
  <p class="small">Downloads happen only when you tap Save.</p>`; };
V.player = id => { const m = findTrack(id); return `<div class="hdr-img" style="aspect-ratio:2/1">${pic("meditationImage")}</div>
  <h1>${esc(m.title)}</h1><p class="small">${esc(m.length)} · sample audio · picks up where you stopped</p>
  <button class="big-play" id="bigPlay" aria-label="Play">▶</button>
  <p class="done" id="doneMsg" hidden>Done. Nothing to track, nothing to score. Just notice how you feel.</p>
  <div class="row"><button class="btn quiet" data-fav="${m.id}">Save to my home</button><button class="btn link" data-go="meditations">All meditations</button></div>`; };
V.music = () => { const pl = store.get("playlist", []); return `<h1>Music &amp; playlists</h1><p>${esc(C.host)}'s own music. Placeholder tracks for now.</p>
  <div class="list">${D.music.map(t => `<div class="item wood-panel"><button class="btn link" style="text-decoration:none;color:inherit;text-align:left" data-play="${t.id}"><span class="t">${esc(t.title)}</span><span class="m">${esc(t.length)} · sample audio</span></button>
    <button class="chip" data-pl="${t.id}" aria-pressed="${pl.includes(t.id)}">${pl.includes(t.id) ? "In playlist" : "+ Playlist"}</button></div>`).join("")}</div>
  <h2>My playlist</h2>${pl.length ? `<div class="list">${pl.map(id => { const t = findTrack(id); return `<button class="item" data-play="${id}"><span class="t">${esc(t.title)}</span><span>▶</span></button>`; }).join("")}</div>` : `<p class="small">Tap "+ Playlist" on any track to start one. It's saved on this device.</p>`}`; };
V.sauna = () => `<div class="hdr-img">${pic("saunaImage")}</div>
  <h1>Sauna room</h1><p>Warm, slow sound for the heat. Stay as long as feels good and step out whenever you like.</p>
  <div class="list">${D.sauna.map(s => `<button class="item wood-panel" data-play="${s.id}"><span><span class="t">${esc(s.title)}</span><span class="m">About ${esc(s.length)} · ${esc(s.note)}</span></span><span>▶</span></button>`).join("")}</div>
  <div class="card"><h3>After the heat</h3><p>Sip some water, sit somewhere cool, and let your breath slow down.</p><button class="btn quiet" data-open="calm">Gentle cool-down meditation</button></div>
  <p class="small">Session lengths are only a guide. There's no timer.</p>`;
V.board = () => {
  const likes = store.get("likes", {}), mine = store.get("myComments", {}), paused = store.get("paused", false), log = store.get("modlog", []);
  return `<h1>Community board</h1><p class="small">Posts from ${esc(C.host)}, moderators, and approved sponsors. Newest first.</p>
  ${D.posts.map(p => { const cs = [...p.comments, ...(mine[p.id] || [])]; return `<article class="card post">
    <p class="who">${esc(p.author)}${p.sponsor ? `<span class="tag">From our sponsor</span>` : `<span class="tag">${esc(p.role)}</span>`} · ${esc(p.date)}</p>
    <h3>${esc(p.title)}</h3><p>${esc(p.body)}</p>
    <div class="post-actions"><button class="chip" data-like="${p.id}" aria-pressed="${!!likes[p.id]}">${likes[p.id] ? "Liked" : "Like"}</button></div>
    <details class="comments"><summary>Read comments</summary>
      ${cs.map(c => `<p class="comment"><strong>${esc(c.who)}</strong> ${esc(c.text)}</p>`).join("") || `<p class="small">Be the first to say something kind.</p>`}
      ${paused ? `<div class="note"><p>Your commenting is paused because a comment wasn't constructive. No trouble here, we're adults. Own it or take it back, and you're good to go. You can still read, listen, and take part in everything else.</p>
        <div class="row"><button class="btn" data-restore="own">Own it</button><button class="btn quiet" data-restore="retract">Take it back</button></div></div>`
      : `<p class="small">Kind and constructive, please. We're all healing here.</p><textarea id="c_${p.id}" aria-label="Write a comment"></textarea><div class="row" style="margin-top:8px"><button class="btn" data-comment="${p.id}">Post comment</button><button class="btn link small" data-report="${p.id}">Report</button></div>`}
    </details></article>`; }).join("")}
  <div class="card"><h3>Demo: the pause flow</h3><p class="small">See what a member sees when a moderator pauses commenting.</p>
    <button class="btn quiet" id="pauseDemo" ${paused ? "disabled" : ""}>${paused ? "Commenting is paused (open any comments)" : "Show the pause"}</button>
    ${log.length ? `<h3 style="margin-top:16px">Moderator log (demo)</h3>${log.map(l => `<p class="small">${esc(l)}</p>`).join("")}` : ""}</div>
  <button class="btn link" data-go="rules">Community rules</button>`;
};
V.rules = () => `<h1>Community rules</h1>
  <p>We support each other. That doesn't mean everyone agrees, it means we're honest without being cruel.</p>
  <p>Say what you think and say it to help. Constructive criticism is welcome here; tearing people down isn't.</p>
  <p>If you're mean, your commenting gets paused right away. It's not a ban, just a slap on the wrist. Own it, apologize, or take the comment back, and you're good. We're adults. Just don't do that.</p>
  <p>We protect this space because a lot of us fought hard to find one like it.</p>
  <button class="btn quiet" data-go="board">Back to the board</button>`;
V.pay = () => `<h1>Book &amp; pay</h1><p>Pick a service. Each option opens Stripe's secure checkout in a new tab; this app never sees your card.</p>
  ${D.services.map(s => `<div class="card svc"><h3>${esc(s.name)}</h3><div class="row">${s.options.map(o => `<a class="btn quiet" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.label)} · ${esc(o.price)}</a>`).join("")}</div></div>`).join("")}
  <p class="small">Opens Stripe's secure checkout. Want to talk first? <a href="${esc(D.booking[0].url)}" target="_blank" rel="noopener">Book a free consultation</a>.</p>`;

// ---------- Router ----------
let route = "welcome", arg = null, breathTimer = 0;
function go(r, a = null) { route = r; arg = a; if (r !== "welcome") store.set("visited", true); render(); window.scrollTo(0, 0); }
function render() {
  clearInterval(breathTimer);
  const v = $("#view"); v.style.animation = "none"; v.offsetHeight; v.style.animation = "";
  v.innerHTML = V[route](arg);
  $("#unwellBtn").hidden = ["unwell", "breathe", "talk"].includes(route);
  document.body.classList.toggle("calm-bg", ["unwell", "breathe", "talk"].includes(route));
  $("#menu").hidden = true; $("#menuBtn").setAttribute("aria-expanded", "false");
  if (route === "breathe") { let i = 0, t = 0; const lab = $("#bLabel"); breathTimer = setInterval(() => { t += 2.75; i++; if (t >= 120) { lab.textContent = "That's two minutes. Well done."; clearInterval(breathTimer); return; } lab.textContent = i % 2 ? "Breathe out" : "Breathe in"; }, 2750); }
  if (route === "player") { setPBtn(); $("#bigPlay").onclick = () => current && current.id === arg ? toggle() : play(findTrack(arg)); }
  if (route === "home") bindLongPress();
}
function bindLongPress() {
  document.querySelectorAll(".tile").forEach(el => {
    let t = 0;
    el.addEventListener("pointerdown", () => { t = setTimeout(() => { t = -1; store.set("editing", true); render(); }, 600); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, () => t > 0 && clearTimeout(t)));
    el.addEventListener("contextmenu", e => e.preventDefault());
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest("button, [data-tile]"); if (!b) return;
  const d = b.dataset;
  if (d.go) return go(d.go);
  if (d.mood) {
    const list = D.meditations.filter(m => m.mood === d.mood).slice(0, 3);
    $("#moodResults").innerHTML = `<h2>For when you're ${esc(d.mood)}</h2><div class="list">${list.map(m => `<button class="item" data-open="${m.id}"><span><span class="t">${esc(m.title)}</span><span class="m">${esc(m.length)}</span></span><span>▶</span></button>`).join("")}</div>`;
    return;
  }
  if (d.open) { play(findTrack(d.open)); return go("player", d.open); }
  if (d.play) return play(findTrack(d.play));
  if (d.tile) {
    if (store.get("editing", false) || e.target.closest(".ctl")) return;
    const t = TILES[d.tile]; if (t.play) { play(findTrack(t.play)); return go("player", t.play); }
    if (t.href) return window.open(t.href, "_blank", "noopener");
    return t.go === "pay" ? needSignIn("book and pay", () => go("pay")) : go(t.go);
  }
  if (d.save) return saveOffline(D.meditations.find(m => m.id === d.save));
  if (d.fav) return needSignIn("save to your home", () => { const l = tiles(); if (!l.includes("ground")) l.unshift("ground"); store.set("tiles", l); b.textContent = "Saved to your home"; });
  if (d.pl) { const pl = store.get("playlist", []); const i = pl.indexOf(d.pl); i < 0 ? pl.push(d.pl) : pl.splice(i, 1); store.set("playlist", pl); return render(); }
  if (d.like) return needSignIn("like posts", () => { const l = store.get("likes", {}); l[d.like] = !l[d.like]; store.set("likes", l); render(); });
  if (d.comment) return needSignIn("comment", () => { const box = $("#c_" + d.comment); const txt = box ? box.value.trim() : ""; if (!txt) return; const m = store.get("myComments", {}); (m[d.comment] = m[d.comment] || []).push({ who: (profile().name || "You"), text: txt }); store.set("myComments", m); render(); });
  if (d.report) { b.textContent = "Thanks, a moderator will look"; b.disabled = true; return; }
  if (d.restore) { store.set("paused", false); const log = store.get("modlog", []); log.push(`Commenting restored: member chose "${d.restore === "own" ? "Own it" : "Take it back"}".`); store.set("modlog", log); return render(); }
  if (b.id === "pauseDemo") { store.set("paused", true); const log = store.get("modlog", []); log.push("Comment hidden and commenting paused by moderator (demo)."); store.set("modlog", log); render(); document.querySelector(".comments").open = true; return; }
  if (b.id === "editBtn") { store.set("editing", !store.get("editing", false)); return render(); }
  if (d.mv) { const [k, dir] = d.mv.split(":"); const l = tiles(); const i = l.indexOf(k), j = i + +dir; if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; store.set("tiles", l); return render(); }
  if (d.rm) { store.set("tiles", tiles().filter(k => k !== d.rm)); return render(); }
  if (d.add) { const l = tiles(); if (l.length >= 6) { alertSoft("Six tiles max keeps home calm. Remove one first."); return; } const pi = l.indexOf("pay"); pi < 0 ? l.push(d.add) : l.splice(pi, 0, d.add); store.set("tiles", l); return render(); }
});
function alertSoft(msg) { sheet(`<p class="err">${esc(msg)}</p><button class="btn quiet" id="okBtn">Okay</button>`); $("#okBtn").onclick = closeSheet; }
$("#menuBtn").onclick = () => { const m = $("#menu"); m.hidden = !m.hidden; $("#menuBtn").setAttribute("aria-expanded", String(!m.hidden)); };
$("#resetBtn").onclick = () => { Object.keys(localStorage).filter(k => k.startsWith("et_")).forEach(k => localStorage.removeItem(k)); go("welcome"); };

const checks = ["heroImage", "saunaImage", "meditationImage"].map(k => C[k + "Portrait"] ? fetch(C[k + "Portrait"], { method: "HEAD" }).then(r => { if (r.ok) PORTRAIT[k] = C[k + "Portrait"]; }).catch(() => {}) : null);
Promise.all([fetch("data.json").then(r => r.json()), ...checks]).then(([d]) => { D = d; go(store.get("visited", false) ? "home" : "welcome"); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
