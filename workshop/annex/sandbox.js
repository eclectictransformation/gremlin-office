// Pip's Workshop: guest sandbox for two Annex places (The Mine and The Training Closet).
// Reuses the Office's own 3D code as-is. Storage and network are fenced off in index.html before this runs.
const PLAYS = {
  mine: { title: "The Mine", pitch: "The Gently Declining Grotto: a short, moody cave crawl that starts at the Mine Mouth outpost. Riddles, a campfire, and something large at the bottom.", go: (rpg) => rpg.enterGrotto() },
  training: { title: "The Training Room", pitch: "The Training Closet: a practice room with a dummy, a gear rack and friendly tips. Nothing here counts, so try every button.", go: (rpg) => rpg.enterTraining() },
};
const q = new URLSearchParams(location.search), key = PLAYS[q.get("play")] ? q.get("play") : "mine", PLAY = PLAYS[key];
const $ = (id) => document.getElementById(id);
document.title = `${PLAY.title} · Pip's Workshop · The Gremlin Desks`;
$("ws-title").textContent = PLAY.title; $("ws-pitch").textContent = PLAY.pitch;
const fail = (msg) => { const e = $("ws-err"); e.hidden = false; e.textContent = msg; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = fn(); if (v) return v; } catch {} await wait(120); } return null; }

const me = { id: "workshop-guest", display_name: "Guest", login_id: null, is_admin: false, active: true };
const noop = async () => true;
let office = null;
window.__workshop = { play: key, office: () => office, rpg: () => office?.annex?.rpg };

async function boot() {
  const mod = await import("../../desks-preview-q7m4/office3d.js");
  if (!mod.webglOK()) return fail("This device or browser can't show 3D right now (WebGL is off). Try another browser, or play Gremlin Overtime instead.");
  const annex = await fetch("data/elsewhere-annex.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!annex) return fail("The Annex didn't load. Please refresh.");
  document.body.classList.add("in-office");
  office = mod.startOffice($("o3root"), {
    floor: [{ user_id: me.id, display_name: me.display_name, nickname: "Guest", theme: "sage", locked: false, sign_text: "Just visiting", photos: [] }],
    myDesk: { nickname: "Guest", sign_text: "Just visiting", theme: "sage", locked: false, photos: [] },
    notes: [], notices: [], art: [], online: new Set([me.id]), me, demo: false, annex, annexShowAll: false,
    api: { exit: () => (location.href = "../workshop/"), sb: null, photoUrls: null, artUrls: null, setLocked: noop, leaveNote: noop, deleteNote: noop },
  });
  // Guests have no office desk to go back to, and no teammates online: hide those two bits of HUD (the Workshop pill is the way out).
  document.querySelectorAll("#o3root .o3-tr .o3-btn").forEach((b) => { if (b.textContent.startsWith("\u2190 Back")) b.classList.add("ws-hide"); });
  const A = office.annex; if (!A) return fail("The Annex didn't start. Please refresh.");
  A.arrive("print-arrival");
  const rpg = A.rpg; await rpg.ready();
  if (!rpg.loaded()) return fail("The Annex rules didn't load. Please refresh.");
  const go = $("ws-go"), fresh = $("ws-fresh"), has = rpg.state().hasChar;
  go.disabled = false; go.textContent = has ? "Carry on" : "Make my character"; fresh.hidden = !has;
  fresh.onclick = () => { localStorage.clear(); localStorage.setItem("desks.o3.howto.v3", "1"); location.reload(); };
  go.onclick = async () => {
    $("intro").hidden = true;
    if (!rpg.state().hasChar) rpg.openCreator(); else rpg.transform();
    const ok = await until(() => rpg.state().transformed, 15 * 60 * 1000);
    if (!ok) return;
    await wait(400);
    if (!rpg.state().inInstance) PLAY.go(rpg);
  };
  go.focus();
}
boot().catch((e) => { console.error(e); fail("Something went wrong starting the sandbox. Please refresh."); });
