// Menus, settings, HUD and screen effects.
window.UI = (function(){
  const $ = id => document.getElementById(id);
  const scr = { title: $('screen-title'), pick: $('screen-pick'), pause: $('screen-pause'), end: $('screen-end'), help: $('screen-help'), settings: $('screen-settings') };
  let overlayReturn = null, toastT = null, rotateDismissed = false;
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  if (isTouchDevice) GAME.setTouch(true);
  function show(name){ for (const k in scr) scr[k].classList.toggle('hidden', k !== name); }
  function hideAll(){ for (const k in scr) scr[k].classList.add('hidden'); }
  function playingUI(on){ $('hud').classList.toggle('hidden', !on); $('touch').classList.toggle('hidden', !(on && GAME.isTouch())); onResize(); }
  function tryFullscreen(){ if (!isTouchDevice) return; const el = document.documentElement; const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)){ try { const r = fn.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch(e){} }
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch(e){} }
  function play(){ SFX.init(); tryFullscreen(); hideAll(); GAME.start(); playingUI(true); }
  function pause(){ if (GAME.state !== 'play') return; GAME.setState('pause'); INPUT.resetTouch(); playingUI(false); $('hud').classList.remove('hidden'); show('pause'); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
  function resume(){ hideAll(); GAME.setState('play'); playingUI(true); }
  function restart(){ hideAll(); GAME.start(); playingUI(true); }
  function quit(){ GAME.setState('title'); GAME.resetWorld(); playingUI(false); show('title'); }
  function openOverlay(name, from){ overlayReturn = from; show(name); if (name === 'settings') loadSettings(); }
  function closeOverlay(){ show(overlayReturn || 'title'); }

  // Pip's Workshop: pick a surveyor before level 1 (tints your hands and the HUD).
  const LOOKS = { nib: { base: '#5aa848', hi: '#7ad65a', lo: '#2e6b26', hud: '#7ad65a' }, tansy: { base: '#e0a030', hi: '#ffd060', lo: '#9a6414', hud: '#ffc44a' }, quill: { base: '#9a7ad0', hi: '#c4a8f4', lo: '#5e4390', hud: '#c4a8f4' } };
  function applyLook(id){ const L = LOOKS[id] || LOOKS.nib; ART.setLook(L); document.getElementById('app').style.setProperty('--look', L.hud); document.getElementById('app').dataset.look = LOOKS[id] ? id : 'nib'; try { localStorage.setItem('gremlinOvertimeLook', LOOKS[id] ? id : 'nib'); } catch(e){} }
  let lastLook = 'nib'; try { lastLook = localStorage.getItem('gremlinOvertimeLook') || 'nib'; } catch(e){}
  document.querySelectorAll('[data-look-pick]').forEach(b => { b.onclick = () => { applyLook(b.dataset.lookPick); play(); }; });
  $('btn-pick-back').onclick = () => show('title');
  $('btn-play').onclick = () => { show('pick'); const b = document.querySelector('[data-look-pick="' + lastLook + '"]') || document.querySelector('[data-look-pick]'); if (b) b.focus(); }; $('btn-resume').onclick = resume; $('btn-restart-p').onclick = restart; $('btn-restart-e').onclick = restart;
  $('btn-quit').onclick = quit; $('btn-quit-e').onclick = quit; $('btn-pause').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pause(); });
  $('btn-settings-t').onclick = () => openOverlay('settings', 'title'); $('btn-settings-p').onclick = () => openOverlay('settings', 'pause');
  $('btn-help-t').onclick = () => openOverlay('help', 'title'); $('btn-help-p').onclick = () => openOverlay('help', 'pause');
  document.querySelectorAll('.close').forEach(b => b.onclick = closeOverlay);
  $('rotate-ok').onclick = () => { rotateDismissed = true; onResize(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ----- settings -----
  const st = GAME.settings;
  function loadSettings(){ document.querySelectorAll('input[name=scheme]').forEach(r => r.checked = r.value === st.scheme);
    $('set-sens').value = st.sens; $('out-sens').textContent = (+st.sens).toFixed(1); $('set-aim').value = st.aim; $('set-autofire').value = st.autofire;
    $('set-gyro').checked = st.gyro; $('set-invert').checked = st.invert; $('set-diff').value = st.diff; $('set-vol').value = st.vol; $('out-vol').textContent = Math.round(st.vol * 100) + '%';
    $('set-res').value = st.res; $('set-fps').checked = st.fps; }
  function changed(){ GAME.saveSettings(); SFX.setVolume(st.vol); $('fps').classList.toggle('hidden', !st.fps); GAME.resize(); }
  document.querySelectorAll('input[name=scheme]').forEach(r => r.onchange = () => { st.scheme = r.value; INPUT.resetTouch(); changed(); });
  $('set-sens').oninput = e => { st.sens = +e.target.value; $('out-sens').textContent = st.sens.toFixed(1); changed(); };
  $('set-aim').onchange = e => { st.aim = e.target.value; changed(); };
  $('set-autofire').onchange = e => { st.autofire = e.target.value; changed(); };
  $('set-gyro').onchange = async e => { if (e.target.checked){ const ok = await INPUT.enableGyro(); if (!ok){ e.target.checked = false; toast('Tilt look needs motion permission.', 2); } st.gyro = e.target.checked; } else st.gyro = false; changed(); };
  $('set-invert').onchange = e => { st.invert = e.target.checked; changed(); };
  $('set-diff').onchange = e => { st.diff = e.target.value; changed(); };
  $('set-vol').oninput = e => { st.vol = +e.target.value; $('out-vol').textContent = Math.round(st.vol * 100) + '%'; changed(); };
  $('set-res').onchange = e => { st.res = e.target.value; changed(); };
  $('set-fps').onchange = e => { st.fps = e.target.checked; changed(); };
  if (st.gyro){ st.gyro = false; } // permission must be re-granted by a tap each visit on iOS

  // ----- HUD -----
  let lastHud = {};
  function hud(h){ if (h.hp !== lastHud.hp){ $('hp').textContent = h.hp; $('hp').style.color = h.hp <= 25 ? '#ff5a7a' : ''; }
    if (h.ammo !== lastHud.ammo) $('ammo').textContent = h.ammo; if (h.wname !== lastHud.wname) $('wname').textContent = h.wname;
    if (h.key !== lastHud.key) $('keyico').classList.toggle('off', !h.key); lastHud = h; }
  setInterval(() => { if (GAME.state === 'play') $('crosshair').classList.toggle('lock', !!GAME.player.lockOn); }, 100);
  function toast(msg, secs){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), (secs || 2) * 1000); }
  function fx(flash, hurt){ $('flash').style.opacity = flash; $('hurt').style.opacity = hurt; }
  let hdT = null; function hurtDir(rel){ const el = $('hurt-dir'); el.style.transform = 'rotate(' + rel + 'rad)'; el.classList.remove('hidden'); el.style.opacity = 1; clearTimeout(hdT); hdT = setTimeout(() => { el.style.opacity = 0; }, 600); }
  function bossBar(on){ $('bossbar').classList.toggle('hidden', !on); if (on) bossFill(1); }
  function bossFill(f){ $('bossfill').style.width = Math.max(0, f * 100) + '%'; }
  function fpsShow(f, h){ if (st.fps) $('fps').textContent = f + ' fps · ' + h + 'p'; }
  function end(won, s){ playingUI(false); INPUT.resetTouch(); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    $('end-title').textContent = won ? 'CLOCKED OUT!' : 'YOU GOT FILED!';
    $('end-text').textContent = won ? 'The Mega-Copier is unplugged and the office is quiet again. Nice work.' : 'The paperwork won this round. Grab a coffee and try again.';
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    $('end-stats').innerHTML = '<span>Time</span><b>' + m + ':' + String(sec).padStart(2, '0') + '</b><span>Monsters popped</span><b>' + s.kills + ' / ' + s.total + '</b><span>Secrets</span><b>' + s.secrets + ' / 1</b>' + (won ? '<span>Health left</span><b>' + s.hp + '</b>' : '');
    show('end'); }
  function onResize(){ const portrait = window.innerHeight > window.innerWidth; $('rotate-hint').classList.toggle('hidden', !(portrait && isTouchDevice && GAME.state === 'play' && !rotateDismissed)); }
  $('fps').classList.toggle('hidden', !st.fps); SFX.setVolume(st.vol);
  return { hurtDir, toast, hud, fx, bossBar, bossFill, fps: fpsShow, end, pause, resume, onResize, show, play, isTouchDevice };
})();
GAME.init();
