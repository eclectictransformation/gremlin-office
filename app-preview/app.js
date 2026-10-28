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
  checkin: { label: "Daily check-in", k: "How are you arriving?", go: "checkin" },
  library: { label: "Library", k: "Bryan's shelf of writing", go: "library" },
  workshops: { label: "Workshops", k: "Gather and learn", go: "workshops" },
  winddown: { label: "Wind down", k: "For sleep", go: "winddown" },
  myspace: { label: "My space", k: "Saved things and journal", go: "myspace" },
  pay: { label: "Book & pay", k: "Services and sessions", go: "pay", quiet: true }
};
const tiles = () => store.get("tiles", null) || ["checkin", "ground", "meditations", "library", "sauna", "board", "workshops", "winddown", "myspace", "pay"];

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
  ${D.services.map(s => `<div class="card svc"><p class="small">${esc(s.type)}</p><h3>${esc(s.name)}</h3><p>${esc(s.desc)}</p><div class="row">${s.options.map(o => `<a class="btn quiet" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.label)} · ${esc(o.price)}</a>`).join("")}</div></div>`).join("")}
  <div class="card soon"><h3>More services coming</h3><p class="small">${D.comingSoon.map(esc).join(" · ")}. Sample slot.</p></div>
  <div class="row"><button class="btn quiet" data-care="before">Prepare for your massage</button><button class="btn quiet" data-care="after">After your massage</button></div>
  <p class="small">Opens Stripe's secure checkout. Want to talk first? <a href="${esc(D.booking[0].url)}" target="_blank" rel="noopener">Book a free consultation</a>.</p>`;

// ---------- v2: check-in, journal, care, workshops, wind-down, library, my space ----------
const SUGGEST = { stressed: "calm", angry: "rage", anxious: "ground", tired: "sleep", curious: "wonder", okay: "s10" };
V.checkin = () => { const t = store.get("today", ""); const s = t && findTrack(SUGGEST[t]);
  return `<h1>How are you arriving today?</h1><p class="small">Just a check-in. Nothing is scored or counted.</p>
  <div class="chips">${["stressed","tired","anxious","angry","curious","okay"].map(m => `<button class="chip" data-ci="${m}" aria-pressed="${t === m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>
  ${s ? `<div class="card"><h3>One idea for now</h3><button class="item" data-open="${s.id}"><span><span class="t">${esc(s.title)}</span><span class="m">${esc(s.length)}</span></span><span>▶</span></button></div>` : ""}
  <div class="card"><h3>Private journal (optional)</h3><p class="small">Saved only on this phone. No one else sees it.</p>
  <textarea id="jText" aria-label="Journal entry" placeholder="A few words, if you like"></textarea>
  <div class="row" style="margin-top:8px"><button class="btn" id="jSave">Keep this</button><button class="btn link" data-go="myspace">See my journal</button></div></div>`; };
V.care = which => { const c = D.care[which] || D.care.before; return `<h1>${which === "after" ? "After your massage" : "Prepare for your massage"}</h1>
  <p class="small">Sample copy: ${esc(C.host)} will edit this.</p>
  <div class="card"><ul class="care">${c.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
  ${which === "after" ? `<button class="btn quiet" data-open="sleep">A slow rest meditation</button>` : `<div class="card"><h3>An arrival breath</h3><p>Breathe in for four. Out for six. Three times. You're here.</p><button class="btn quiet" data-go="breathe">Breathe with me</button></div>`}
  <div class="row"><button class="btn link" data-care="${which === "after" ? "before" : "after"}">${which === "after" ? "Before your massage" : "After your massage"}</button><button class="btn link" data-go="pay">Back to Book &amp; pay</button></div>`; };
V.workshops = () => `<h1>Workshops</h1><p>Gather, breathe, and learn together. Dates and sign-up live on the website.</p>
  ${D.workshops.map(w => `<div class="card"><h3>${esc(w.title)}</h3><p class="small">${esc(w.length)} · ${esc(w.price)}</p><p>${esc(w.desc)}</p>
  <a class="btn quiet" href="${esc(C.eventsUrl)}" target="_blank" rel="noopener">Reserve on the website ↗</a></div>`).join("")}`;
V.winddown = () => `<div class="calm-page"><h1>Wind down</h1><p>Lights low. Nothing to do. Follow the circle if you like.</p>
  <div class="breath-wrap"><div class="breath slow" aria-hidden="true"></div><p class="breath-label" id="wLabel" aria-live="polite">In, slowly</p></div>
  <div class="list"><button class="item" data-play="sleep"><span class="t">Heavy Eyes, Soft Body</span><span>▶</span></button>
  <button class="item" data-play="m3"><span class="t">Low Lantern</span><span>▶</span></button><button class="item" data-play="m2"><span class="t">Slow River</span><span>▶</span></button></div>
  <p class="small">Your screen stays dim here. Sample audio.</p><button class="btn quiet" data-go="home">Back</button></div>`;
// Library
const readSet = () => new Set(store.get("readBooks", []));
const book = id => D.library.find(b => b.id === id);
const requires = id => { for (const p of D.paths || []) { const i = p.books.indexOf(id); if (i > 0) return p.books[i - 1]; } return null; };
const locked = id => { const r = requires(id); return r && !readSet().has(r); };
function markRead(id) {
  const r = store.get("readBooks", []); if (r.includes(id)) return; const before = giftsOpen().map(g => g.id); r.push(id); store.set("readBooks", r); const e = store.get("earned", []); if (!e.includes(id)) { e.push(id); store.set("earned", e); }
  const next = D.library.find(b => requires(b.id) === id);
  const m = $("#readMsg"); if (m) m.innerHTML = next ? `A new book is ready for you: <button class="btn link" data-book="${next.id}">${esc(next.title)}</button>` : "Thank you for reading.";
  store.set("glow", next ? next.id : ""); const bt = document.querySelector(`[data-read="${id}"]`); if (bt) bt.textContent = "Read ✓ · +" + leafFor(book(id)) + " leaves";
  giftCheck(before);
}
let go2 = "book";
function openBook(id, el) {
  const bk = book(id); if (bk.comingSoon) return alertSoft(`${bk.title} is coming soon. It will appear here when ${C.host} is ready.`);
  if (bk.chapters) id = id, go2 = "chapter"; else go2 = "book";
  if (locked(id)) { const r = book(requires(id)); sheet(`<h2>Not yet</h2><p>This one opens after you read <em>${esc(r.title)}</em>.</p><div class="row"><button class="btn" data-book="${r.id}" id="goReq">Go to it</button><button class="btn link" id="okBtn">Okay</button></div>`); $("#okBtn").onclick = closeSheet; $("#goReq").addEventListener("click", closeSheet); return; }
  if (el && el.classList.contains("spine")) { el.classList.add("out"); setTimeout(() => go(go2, id), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900); } else go(go2, id);
}
V.library = () => { const rs = readSet(), glow = store.get("glow", ""), f = store.get("lenFilter", ""); return `<div class="lib-head"><button class="corner-mini" data-go="corner" aria-label="Design my reading corner">${cornerSVG()}</button>
  <div><h1>Library</h1><p>Sit a while. Tap a book to take it off the shelf. Everything here is free.</p><p class="small">${leafLine()}</p><button class="btn link" data-go="corner">Design my reading corner</button></div></div>
  <div class="chips" role="group" aria-label="Filter by length"><button class="chip" data-len="" aria-pressed="${!f}">Everything</button>${D.lengths.map(l => `<button class="chip" data-len="${l.id}" aria-pressed="${f === l.id}">${esc(l.label)}</button>`).join("")}</div>
  ${D.shelves.map(sh => { const bs = D.library.filter(b => b.shelf === sh.id && (!f || lenOf(b) === f)); if (f && !bs.length) return ""; const isPath = (D.paths || []).some(p => p.books.some(x => book(x) && book(x).shelf === sh.id));
  return `<section class="shelf-block"><h2>${esc(sh.name)}</h2><p class="small">${esc(sh.note)}</p>
  <div class="shelf ${isPath ? "path" : ""}" role="list">${bs.length ? bs.map(b => `<button role="listitem" class="spine ${locked(b.id) ? "locked" : ""} ${rs.has(b.id) ? "read" : ""} ${glow === b.id && !locked(b.id) ? "glow" : ""}" style="--sp:${esc(b.spine)}" data-book="${b.id}" aria-label="${esc(b.title)}, ${b.comingSoon ? "coming soon" : b.readMinutes + " minutes"}${locked(b.id) ? ", opens later" : ""}"><span>${esc(b.title)}</span><small class="rt">${b.comingSoon ? "soon" : b.readMinutes + "m"}</small>${locked(b.id) ? `<i aria-hidden="true">🍃</i>` : ""}</button>`).join("") : `<span class="empty-shelf">Room for more</span>`}</div></section>`; }).join("")}
  <div class="row">${D.browse.map(l => `<a class="btn link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div>`; };
V.book = id => { const b = book(id); store.set("glow", store.get("glow", "") === id ? "" : store.get("glow", "")); const sh = D.shelves.find(s => s.id === b.shelf);
  return `<article class="reader"><p class="small">${esc(sh ? sh.name : "")}${b.sample ? " · sample" : ""}</p><h1>${esc(b.title)}</h1>
  <p class="small">${esc(b.author || C.host)} · ${esc(b.date || "")} · about ${b.readMinutes} min read</p><p class="lead">${esc(b.excerpt)}</p>
  ${b.url ? `<a class="btn quiet" href="${esc(b.url)}" target="_blank" rel="noopener">${b.source ? `From ${esc(b.source)}, read the original ↗` : "Read the full piece on the website ↗"}</a>` : ""}
  <div id="bookEnd" class="book-end"><button class="btn quiet" data-read="${id}">${readSet().has(id) ? "Read ✓" : "I've read this"}</button><p class="small" id="readMsg" aria-live="polite"></p></div>
  <button class="btn link" data-go="library">Back to the shelf</button></article>`; };
V.myspace = () => { const s = saved(), pl = store.get("playlist", []), j = store.get("journal", []), rs = readSet();
  return `<h1>My space</h1><p class="small">Everything here stays on this phone.</p>
  <h2>Saved meditations</h2><div class="list">${D.meditations.filter(m => s.has(m.id)).map(m => `<button class="item" data-open="${m.id}"><span class="t">${esc(m.title)}</span><span>▶</span></button>`).join("")}</div>
  <h2>My playlist</h2>${pl.length ? `<div class="list">${pl.map(id => `<button class="item" data-play="${id}"><span class="t">${esc(findTrack(id).title)}</span><span>▶</span></button>`).join("")}</div>` : `<p class="small">Nothing yet. <button class="btn link" data-go="music">Browse music</button></p>`}
  <h2>Books I've read</h2>${rs.size ? `<div class="list">${[...rs].map(id => book(id)).filter(Boolean).map(b => `<button class="item" data-book="${b.id}"><span class="t">${esc(b.title)}</span><span>→</span></button>`).join("")}</div><button class="btn link" id="resetPath">Start reading paths over (your leaves and gifts stay)</button>` : `<p class="small">None yet.</p>`}
  <h2>Journal</h2>${j.length ? j.map((e, i) => `<div class="card"><p class="small">${esc(e.d)}${e.mood ? " · " + esc(e.mood) : ""}</p><p>${esc(e.t)}</p><button class="btn link small" data-jdel="${i}">Delete</button></div>`).join("") : `<p class="small">Empty. <button class="btn link" data-go="checkin">Write something</button></p>`}
  <p class="small"><a href="https://eclectictransformation.github.io/gremlin-office/world.html" target="_blank" rel="noopener">Feeling playful? Visit Gremlin World ↗</a></p>`; };

// ---------- Library heart: lengths, chapters, leaves, reading corner ----------
const lenOf = b => b.chapters || b.shelf === "books" ? "books" : b.readMinutes <= 3 ? "quick" : b.readMinutes <= 7 ? "five" : "sit";
const leafFor = b => b.chapters ? b.chapters.length * D.leaves.chapter : D.leaves[lenOf(b)] || 0;
const leaves = () => { const rs = new Set([...readSet(), ...store.get("earned", [])]), ch = store.get("chaptersRead", {}); let n = 0;
  D.library.forEach(b => { if (b.chapters) n += (ch[b.id] || []).length * D.leaves.chapter; else if (rs.has(b.id)) n += leafFor(b); }); return n; };
const giftsOpen = () => D.corner.gifts.filter(g => leaves() >= g.leaves);
const nextGift = () => D.corner.gifts.find(g => leaves() < g.leaves);
const cornerCfg = () => Object.assign({ chair: "armchair", rug: D.corner.rugs[0], lamp: "floor lamp", plant: "fern", blanket: D.corner.blankets[0], wall: D.corner.walls[0], view: "forest" }, store.get("corner", {}));
function cornerSVG() { const c = cornerCfg(), g = new Set(giftsOpen().map(x => x.id));
  const sky = { forest: "#C9D6D3", snow: "#ECE4D4", rain: "#9FB0AE", stars: "#2F3A2F" }[c.view];
  const view = c.view === "forest" ? `<path d="M40 110l14-30 14 30zM62 110l12-24 12 24zM84 110l14-34 14 34z" fill="#6F8A6A"/>` : c.view === "snow" ? `<path d="M30 110l30-28 25 18 30-22 15 32z" fill="#FBF8F2"/>` : c.view === "rain" ? `<path d="M45 50l-4 12M70 45l-4 12M95 55l-4 12M60 80l-4 12M100 85l-4 12" stroke="#DCE5E6" stroke-width="2"/>` : `<circle cx="50" cy="55" r="2" fill="#FBF8F2"/><circle cx="85" cy="70" r="1.5" fill="#FBF8F2"/><circle cx="105" cy="50" r="2" fill="#FBF8F2"/><circle cx="95" cy="40" r="7" fill="#E4CCAD"/>`;
  const chair = { "armchair": `<rect x="150" y="120" width="90" height="60" rx="16" fill="#8E6A4C"/><rect x="140" y="140" width="22" height="50" rx="10" fill="#C9A27C"/><rect x="228" y="140" width="22" height="50" rx="10" fill="#C9A27C"/><rect x="160" y="150" width="70" height="25" rx="8" fill="#C9A27C"/>`,
    "floor cushion": `<ellipse cx="195" cy="185" rx="55" ry="16" fill="#8E6A4C"/><ellipse cx="195" cy="178" rx="48" ry="12" fill="#C9A27C"/>`,
    "rocking chair": `<rect x="165" y="110" width="12" height="70" rx="4" fill="#8E6A4C"/><rect x="165" y="150" width="70" height="12" rx="4" fill="#8E6A4C"/><rect x="225" y="160" width="8" height="25" fill="#8E6A4C"/><path d="M150 192q45 14 95 0" stroke="#8E6A4C" stroke-width="6" fill="none"/>`,
    "window seat": `<rect x="20" y="125" width="110" height="30" rx="6" fill="#C9A27C"/><rect x="30" y="115" width="35" height="16" rx="8" fill="#DCE5E6"/>` }[c.chair];
  const lamp = c.lamp === "floor lamp" ? `<rect x="278" y="70" width="4" height="125" fill="#5C6B5A"/><path d="M262 75h36l-8-25h-20z" fill="#E4CCAD"/>` : c.lamp === "table lamp" ? `<rect x="268" y="160" width="30" height="35" fill="#8E6A4C"/><rect x="281" y="140" width="4" height="20" fill="#5C6B5A"/><path d="M270 142h26l-5-18h-16z" fill="#E4CCAD"/>` : `<line x1="283" y1="0" x2="283" y2="45" stroke="#5C6B5A"/><circle cx="283" cy="58" r="15" fill="#FBF8F2"/>`;
  const plant = c.plant === "fern" ? `<rect x="315" y="170" width="24" height="25" rx="3" fill="#B7795A"/><path d="M327 170q-20-30-8-45M327 170q0-35 2-45M327 170q18-28 14-42" stroke="#4F6B52" stroke-width="5" fill="none"/>` : c.plant === "snake plant" ? `<rect x="315" y="170" width="24" height="25" rx="3" fill="#B7795A"/><path d="M320 170l2-45 5 45M328 170l4-55 4 55" fill="#4F6B52"/>` : "";
  const blanket = c.blanket !== "none" && c.chair !== "window seat" ? `<path d="M175 148h40l-6 40h-30z" fill="${c.blanket}" opacity=".95"/>` : "";
  return `<svg viewBox="0 0 360 210" class="corner-svg" role="img" aria-label="Your reading corner"><rect width="360" height="210" fill="${c.wall}"/>
  <rect x="25" y="25" width="100" height="90" rx="4" fill="${sky}" stroke="#FBF8F2" stroke-width="5"/><g clip-path="inset(0)">${view}</g><line x1="75" y1="25" x2="75" y2="115" stroke="#FBF8F2" stroke-width="3"/>
  ${g.has("lights") ? `<path d="M0 12q90 18 180 0t180 0" stroke="#8E6A4C" fill="none"/>${[20,60,100,140,180,220,260,300,340].map((x,i) => `<circle class="fl" cx="${x}" cy="${14 + (i % 2) * 5}" r="3" fill="#E4CCAD"/>`).join("")}` : ""}
  <ellipse cx="195" cy="200" rx="130" ry="12" fill="${c.rug}"/>${chair}${blanket}${lamp}${plant}
  ${g.has("sock") && c.lamp !== "paper lantern" ? `<path d="M${c.lamp === "floor lamp" ? "290 52" : "288 128"}l6 0 0 12 6 4-2 4-10-4z" fill="#B7795A"/>` : ""}
  ${g.has("cat") ? `<ellipse cx="${c.chair === "window seat" ? 100 : 200}" cy="${c.chair === "window seat" ? 120 : c.chair === "floor cushion" ? 168 : 146}" rx="18" ry="9" fill="#5C6B5A"/><path d="M${c.chair === "window seat" ? 112 : 212} ${c.chair === "window seat" ? 113 : c.chair === "floor cushion" ? 161 : 139}l3-6 3 6z" fill="#5C6B5A"/>` : ""}
  ${g.has("tea") ? `<rect x="250" y="186" width="12" height="9" rx="2" fill="#FBF8F2"/><path d="M262 188q4 2 0 5" stroke="#FBF8F2" fill="none"/>` : ""}
  ${g.has("gremlin") ? `<g transform="translate(330 120)"><rect x="-4" y="12" width="26" height="6" fill="#8E6A4C"/><circle cx="9" cy="5" r="8" fill="#6F8A6A"/><circle cx="6" cy="4" r="1.5" fill="#2F3A2F"/><circle cx="12" cy="4" r="1.5" fill="#2F3A2F"/><path d="M2 -1l-3-5M16 -1l3-5" stroke="#6F8A6A" stroke-width="2"/></g>` : ""}</svg>`; }
const leafLine = () => { const n = nextGift(), l = leaves(); return `🍃 ${l} leaves${n ? ` · ${esc(n.name)} at ${n.leaves} leaves` : " · every gift is out"}`; };
V.corner = () => { const c = cornerCfg(), opts = (k, list, label) => `<div class="q"><p class="small">${label}</p><div class="chips">${list.map(v => `<button class="chip ${v.startsWith("#") ? "sw" : ""}" ${v.startsWith("#") ? `style="--sw:${v}" aria-label="${label} ${v}"` : ""} data-cn="${k}:${v}" aria-pressed="${c[k] === v}">${v.startsWith("#") ? "" : esc(v)}</button>`).join("")}</div></div>`;
  return `<h1>My Reading Corner</h1><div class="corner-wrap">${cornerSVG()}</div><p class="small">${leafLine()}</p>
  <div class="corner-opts">${opts("chair", D.corner.chairs, "Chair")}${opts("rug", D.corner.rugs, "Rug")}${opts("lamp", D.corner.lamps, "Lamp")}${opts("plant", D.corner.plants, "Plant")}${opts("blanket", D.corner.blankets, "Blanket")}${opts("wall", D.corner.walls, "Wall")}${opts("view", D.corner.views, "Window")}</div>
  <h2>Little gifts</h2><p class="small">Reading earns leaves. Leaves only bring small things to your corner. Nothing random, nothing to buy, nothing ever taken away.</p>
  <div class="list">${D.corner.gifts.map(g => `<div class="item"><span class="t">${esc(g.name)}</span><span class="m">${leaves() >= g.leaves ? "In your corner" : `at ${g.leaves} leaves`}</span></div>`).join("")}</div>
  <button class="btn link" data-go="library">Back to the Library</button>`; };
function giftCheck(before) { const now = giftsOpen().map(g => g.id); const fresh = D.corner.gifts.filter(g => now.includes(g.id) && !before.includes(g.id));
  if (fresh.length) sheet(`<div class="gift-moment"><div class="corner-wrap">${cornerSVG()}</div><h2>Something new in your corner</h2><p>${esc(fresh.map(f => f.name).join(", "))}. Thank you for reading.</p><div class="row"><button class="btn" id="seeCorner">See my corner</button><button class="btn link" id="okBtn">Later</button></div></div>`), $("#okBtn").onclick = closeSheet, $("#seeCorner").onclick = () => { closeSheet(); go("corner"); }; }
V.chapter = id => { const b = book(id), i = store.get("bm", {})[id] || 0, ch = b.chapters[i], done = (store.get("chaptersRead", {})[id] || []);
  return `<article class="reader"><p class="small">${esc(b.title)} · sample · page ${i + 1} of ${b.chapters.length}</p><h1>${esc(ch.title)}</h1><p class="lead">${esc(ch.text)}</p>
  <div class="book-end"><div class="row">${i > 0 ? `<button class="btn link" data-chap="${id}:${i - 1}">← Previous</button>` : ""}<button class="btn quiet" data-chapdone="${id}:${i}">${done.includes(i) ? "Read ✓" : "I've read this chapter"}</button>${i < b.chapters.length - 1 ? `<button class="btn link" data-chap="${id}:${i + 1}">Next →</button>` : ""}</div>
  <p class="small">Your place is saved on this phone.</p></div><div class="row"><button class="btn link" data-go="library">Back to the shelf</button></div></article>`; };

// ---------- Router ----------
let route = "welcome", arg = null, breathTimer = 0;
function go(r, a = null) { closeSheet(); route = r; arg = a; if (r !== "welcome") store.set("visited", true); render(); window.scrollTo(0, 0); }
function render() {
  clearInterval(breathTimer);
  const v = $("#view"); v.style.animation = "none"; v.offsetHeight; v.style.animation = "";
  v.innerHTML = V[route](arg);
  $("#unwellBtn").hidden = ["unwell", "breathe", "talk", "winddown"].includes(route);
  document.body.classList.toggle("calm-bg", ["unwell", "breathe", "talk"].includes(route));
  $("#menu").hidden = true; $("#menuBtn").setAttribute("aria-expanded", "false");
  if (route === "breathe") { let i = 0, t = 0; const lab = $("#bLabel"); breathTimer = setInterval(() => { t += 2.75; i++; if (t >= 120) { lab.textContent = "That's two minutes. Well done."; clearInterval(breathTimer); return; } lab.textContent = i % 2 ? "Breathe out" : "Breathe in"; }, 2750); }
  if (route === "player") { setPBtn(); $("#bigPlay").onclick = () => current && current.id === arg ? toggle() : play(findTrack(arg)); }
  if (route === "home") bindLongPress();
  document.body.classList.toggle("dim", route === "winddown");
  if (route === "winddown") { let i = 0; const lab = $("#wLabel"); breathTimer = setInterval(() => { i++; lab.textContent = i % 2 ? "Out, slowly" : "In, slowly"; }, 6000); }
  if (route === "book") { const end = $("#bookEnd"); if (end) { const io = new IntersectionObserver(es => { if (es[0].isIntersecting && document.body.scrollHeight > innerHeight + 40) { io.disconnect(); markRead(arg); } }); io.observe(end); } }
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
  if (d.ci) { store.set("today", d.ci); return render(); }
  if (d.book) return openBook(d.book, b);
  if (d.read) { markRead(d.read); return; }
  if (d.len !== undefined) { store.set("lenFilter", d.len); return render(); }
  if (d.cn) { const [k, v] = d.cn.split(/:(.*)/); const c = store.get("corner", {}); c[k] = v; store.set("corner", c); return render(); }
  if (d.chap) { const [id, i] = d.chap.split(":"); const bm = store.get("bm", {}); bm[id] = +i; store.set("bm", bm); return go("chapter", id); }
  if (d.chapdone) { const [id, i] = d.chapdone.split(":"); const before = giftsOpen().map(g => g.id); const c = store.get("chaptersRead", {}); c[id] = c[id] || []; if (!c[id].includes(+i)) c[id].push(+i); store.set("chaptersRead", c); b.textContent = "Read ✓ · +" + D.leaves.chapter + " leaves"; giftCheck(before); return; }
  if (d.care) return go("care", d.care);
  if (b.id === "jSave") { const t = $("#jText").value.trim(); if (!t) return; const j = store.get("journal", []); j.unshift({ d: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }), mood: store.get("today", ""), t }); store.set("journal", j); return render(); }
  if (d.jdel) { const j = store.get("journal", []); j.splice(+d.jdel, 1); store.set("journal", j); return render(); }
  if (b.id === "resetPath") { store.set("readBooks", []); return render(); }
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
  if (d.add) { const l = tiles(); if (l.length >= 10) { alertSoft("Ten tiles max keeps home calm. Remove one first."); return; } const pi = l.indexOf("pay"); pi < 0 ? l.push(d.add) : l.splice(pi, 0, d.add); store.set("tiles", l); return render(); }
});
function alertSoft(msg) { sheet(`<p class="err">${esc(msg)}</p><button class="btn quiet" id="okBtn">Okay</button>`); $("#okBtn").onclick = closeSheet; }
$("#menuBtn").onclick = () => { const m = $("#menu"); m.hidden = !m.hidden; $("#menuBtn").setAttribute("aria-expanded", String(!m.hidden)); };
$("#resetBtn").onclick = () => { Object.keys(localStorage).filter(k => k.startsWith("et_")).forEach(k => localStorage.removeItem(k)); go("welcome"); };

const checks = ["heroImage", "saunaImage", "meditationImage"].map(k => C[k + "Portrait"] ? fetch(C[k + "Portrait"], { method: "HEAD" }).then(r => { if (r.ok) PORTRAIT[k] = C[k + "Portrait"]; }).catch(() => {}) : null);
Promise.all([fetch("data.json").then(r => r.json()), ...checks]).then(([d]) => { D = d; go(store.get("visited", false) ? "home" : "welcome"); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
