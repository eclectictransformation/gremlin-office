// Input: three touch schemes (tap & drag, hold to walk, classic sticks), optional tilt look,
// plus keyboard and mouse with pointer lock on desktop.
window.INPUT = (function(){
  const I = { moveF: 0, moveS: 0, fireHeld: false };
  const keys = {}; let kbF = 0, kbS = 0; let touchF = 0, touchS = 0;
  const layer = document.getElementById('touch-layer'), view = document.getElementById('view');
  const stickBase = document.getElementById('stick-base'), stickKnob = document.getElementById('stick-knob'), walkDot = document.getElementById('walk-dot'), ring = document.getElementById('tap-ring');
  const ptrs = new Map(); let walkId = null, walkOrigin = null;
  const set = () => GAME.settings;
  const TOUCH_LOOK = 0.0062, MOUSE_LOOK = 0.0024;
  function lookPx(dx, dy, k){ const s = set().sens * k; GAME.look(-dx * s, (set().invert ? dy : -dy) * s); }
  function recompute(){ I.moveF = Math.max(-1, Math.min(1, kbF + touchF)); I.moveS = Math.max(-1, Math.min(1, kbS + touchS)); }

  // ----- touch layer -----
  function onDown(e){ if (e.pointerType === 'mouse') return; e.preventDefault(); GAME.setTouch(true); SFX.init(); if (GAME.state !== 'play') return;
    layer.setPointerCapture && layer.setPointerCapture(e.pointerId);
    const scheme = set().scheme; const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), drag: false, role: 'look' };
    if ((scheme === 'hold' || scheme === 'stick') && e.clientX < window.innerWidth * 0.5 && walkId === null){ p.role = 'walk'; walkId = e.pointerId; walkOrigin = { x: e.clientX, y: e.clientY };
      if (scheme === 'stick'){ stickBase.style.left = e.clientX + 'px'; stickBase.style.top = e.clientY + 'px'; stickKnob.style.transform = ''; stickBase.classList.remove('hidden'); }
      else { walkDot.style.left = e.clientX + 'px'; walkDot.style.top = e.clientY + 'px'; walkDot.classList.remove('hidden'); touchF = 1; touchS = 0; recompute(); } }
    ptrs.set(e.pointerId, p); }
  function onMove(e){ if (e.pointerType === 'mouse') return; const p = ptrs.get(e.pointerId); if (!p) return; e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 12) p.drag = true;
    if (p.role === 'look'){ if (p.drag) lookPx(dx, dy, TOUCH_LOOK); }
    else { const ox = e.clientX - walkOrigin.x, oy = e.clientY - walkOrigin.y;
      if (set().scheme === 'stick'){ const r = 55, d = Math.hypot(ox, oy), k = d > r ? r / d : 1; stickKnob.style.transform = 'translate(' + ox * k + 'px,' + oy * k + 'px)';
        const dz = d < 8 ? 0 : 1; touchF = dz * -oy * k / r; touchS = dz * ox * k / r; }
      else { touchS = Math.abs(ox) < 14 ? 0 : Math.max(-1, Math.min(1, (ox - Math.sign(ox) * 14) / 55)); touchF = oy < 20 ? 1 : Math.max(-1, 1 - (oy - 20) / 45); }
      recompute(); } }
  function onUp(e){ if (e.pointerType === 'mouse') return; const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    if (p.role === 'walk'){ walkId = null; touchF = touchS = 0; recompute(); stickBase.classList.add('hidden'); walkDot.classList.add('hidden'); return; }
    if (e.type === 'pointerup' && set().scheme === 'tap' && !p.drag && performance.now() - p.t < 350){ const r = GAME.tapAt(e.clientX, e.clientY);
      if (r === 'walk'){ ring.classList.add('hidden'); void ring.offsetWidth; ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.style.borderColor = ''; ring.classList.remove('hidden'); }
      else if (r === 'shoot'){ ring.classList.add('hidden'); void ring.offsetWidth; ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.style.borderColor = '#ff5a7a'; ring.classList.remove('hidden'); } } }
  layer.addEventListener('pointerdown', onDown, { passive: false }); layer.addEventListener('pointermove', onMove, { passive: false });
  layer.addEventListener('pointerup', onUp); layer.addEventListener('pointercancel', onUp);
  function resetTouch(){ ptrs.clear(); walkId = null; touchF = touchS = 0; recompute(); stickBase.classList.add('hidden'); walkDot.classList.add('hidden'); I.fireHeld = false; }

  // ----- buttons -----
  const fireBtn = document.getElementById('btn-fire');
  const fireOn = e => { e.preventDefault(); e.stopPropagation(); GAME.setTouch(e.pointerType !== 'mouse'); SFX.init(); I.fireHeld = true; fireBtn.classList.add('on'); };
  const fireOff = e => { I.fireHeld = false; fireBtn.classList.remove('on'); };
  fireBtn.addEventListener('pointerdown', fireOn); fireBtn.addEventListener('pointerup', fireOff); fireBtn.addEventListener('pointercancel', fireOff); fireBtn.addEventListener('pointerleave', fireOff);
  document.getElementById('btn-weapon').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); GAME.cycleWeapon(1); });

  // ----- keyboard -----
  function kb(){ kbF = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0); kbS = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); recompute(); }
  window.addEventListener('keydown', e => { if (e.repeat && keys[e.code]) return; keys[e.code] = true; SFX.init();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)){ GAME.setTouch(false); if (GAME.state === 'play') e.preventDefault(); }
    if (GAME.state === 'play'){ if (e.code === 'Digit1') GAME.switchWeapon('notes'); if (e.code === 'Digit2') GAME.switchWeapon('spread'); if (e.code === 'Digit3') GAME.switchWeapon('cannon');
      if (e.code === 'KeyE') GAME.use(); if (e.code === 'Space'){ I.fireHeld = true; } if (e.code === 'KeyQ') GAME.cycleWeapon(1); }
    if ((e.code === 'Escape' || e.code === 'KeyP') && window.UI){ if (GAME.state === 'play') UI.pause(); else if (GAME.state === 'pause' && e.code === 'KeyP') UI.resume(); }
    kb(); });
  window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') I.fireHeld = false; kb(); });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; kb(); resetTouch(); });

  // ----- mouse -----
  let mouseDown = false;
  view.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || GAME.state !== 'play') return; GAME.setTouch(false); SFX.init();
    if (document.pointerLockElement !== view && view.requestPointerLock){ try { const r = view.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch(_){} }
    if (e.button === 0){ mouseDown = true; I.fireHeld = true; } });
  layer.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse'){ view.dispatchEvent(new PointerEvent('pointerdown', e)); } });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && mouseDown){ mouseDown = false; I.fireHeld = false; } });
  window.addEventListener('mousemove', e => { if (document.pointerLockElement === view && GAME.state === 'play') lookPx(e.movementX, e.movementY, MOUSE_LOOK); });
  window.addEventListener('wheel', e => { if (GAME.state === 'play'){ GAME.cycleWeapon(e.deltaY > 0 ? 1 : -1); } }, { passive: true });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== view && GAME.state === 'play' && !GAME.isTouch() && window.UI) UI.pause(); });

  // ----- tilt look (gyro) -----
  let gyroOn = false, lastG = 0;
  function onMotion(e){ if (!set().gyro || GAME.state !== 'play' || !e.rotationRate) return; const now = performance.now(); const dt = lastG ? Math.min(0.05, (now - lastG) / 1000) : 0; lastG = now; if (!dt) return;
    const r = e.rotationRate, ang = (screen.orientation && screen.orientation.angle !== undefined) ? screen.orientation.angle : (window.orientation || 0);
    let yawR, pitchR; if (ang === 90){ yawR = r.beta; pitchR = -r.gamma; } else if (ang === -90 || ang === 270){ yawR = -r.beta; pitchR = r.gamma; } else { yawR = r.gamma; pitchR = r.beta; }
    const k = Math.PI / 180 * dt * set().sens; GAME.look((yawR || 0) * k, (set().invert ? -1 : 1) * (pitchR || 0) * k); }
  async function enableGyro(){ try { if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){ const res = await DeviceMotionEvent.requestPermission(); if (res !== 'granted') return false; }
      if (!gyroOn){ window.addEventListener('devicemotion', onMotion); gyroOn = true; } return true; } catch(e){ return false; } }

  // block iOS zoom / scroll gestures
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  I.resetTouch = resetTouch; I.enableGyro = enableGyro;
  return I;
})();
