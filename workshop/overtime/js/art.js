// All art is drawn in code: pixel textures for walls/floors, sprite frames for monsters,
// pickups, projectiles and the first-person gadgets. No image files, no copied assets.
window.ART = (function(){
  let seed = 1234;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  function cv(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
  function shade(hex, k){ // k<1 darker, >1 lighter
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, Math.max(0, r * k | 0)); g = Math.min(255, Math.max(0, g * k | 0)); b = Math.min(255, Math.max(0, b * k | 0));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function speckle(x, w, h, base, amt, n){ x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++){ x.fillStyle = shade(base, 1 + (rnd() - 0.5) * amt); x.fillRect(rnd() * w | 0, rnd() * h | 0, 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0)); } }
  function R(x, c, a, b, w, h){ x.fillStyle = c; x.fillRect(a, b, w, h); }
  function txt(x, s, a, b, col, size, align){ x.font = 'bold ' + (size || 8) + 'px monospace'; x.textAlign = align || 'center'; x.textBaseline = 'middle'; x.fillStyle = '#000'; x.fillText(s, a + 1, b + 1); x.fillStyle = col; x.fillText(s, a, b); }

  // ---------- surface textures (64x64) ----------
  const T = {};
  T.carpetRed = x => { speckle(x, 64, 64, '#7a2a35', 0.5, 900); for (let i = 0; i < 64; i += 16) for (let j = 0; j < 64; j += 16){ R(x, '#93424a', i + 6, j + 6, 4, 4); R(x, '#5a1d26', i + 7, j + 7, 2, 2); } };
  T.carpetBlue = x => { speckle(x, 64, 64, '#3f4b63', 0.45, 1100); for (let j = 0; j < 64; j += 8) for (let i = (j / 8 % 2) * 4; i < 64; i += 8) R(x, 'rgba(255,255,255,0.04)', i, j, 4, 4); };
  T.tile = x => { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++){ R(x, (i + j) % 2 ? '#d8d0b8' : '#5c8a6a', i * 16, j * 16, 16, 16); R(x, 'rgba(0,0,0,0.18)', i * 16, j * 16 + 15, 16, 1); R(x, 'rgba(0,0,0,0.18)', i * 16 + 15, j * 16, 1, 16); }
    for (let i = 0; i < 160; i++){ R(x, 'rgba(0,0,0,0.07)', rnd() * 64 | 0, rnd() * 64 | 0, 1, 1); } };
  T.concrete = x => { speckle(x, 64, 64, '#5d5a62', 0.35, 1400); R(x, '#4a474f', 0, 31, 64, 2); R(x, '#4a474f', 31, 0, 2, 64); for (let i = 0; i < 6; i++) R(x, '#d9b73a', 0, 60 + (i % 2), 0, 0); };
  T.grate = x => { R(x, '#2a3038', 0, 0, 64, 64); for (let i = 0; i < 64; i += 8){ R(x, '#4b5562', i, 0, 3, 64); R(x, '#4b5562', 0, i, 64, 3); R(x, '#6c7888', i, i % 16 ? 0 : 1, 1, 64); } };
  T.pitGlow = x => { R(x, '#06222a', 0, 0, 64, 64); for (let i = 0; i < 64; i += 8){ R(x, '#0d3a44', i, 0, 3, 64); R(x, '#0d3a44', 0, i, 64, 3); } for (let i = 0; i < 40; i++) R(x, '#3ff', rnd() * 64 | 0, rnd() * 64 | 0, 1, 1); };
  T.wood = x => { for (let i = 0; i < 64; i += 16){ R(x, i % 32 ? '#7b4f2c' : '#6d4425', i, 0, 16, 64); for (let k = 0; k < 18; k++){ R(x, 'rgba(40,20,5,0.35)', i + 2 + rnd() * 12 | 0, rnd() * 64 | 0, 1, 4 + rnd() * 10 | 0); } R(x, '#3d2512', i + 15, 0, 1, 64); }
    R(x, '#4a2c15', 0, 0, 64, 4); R(x, '#a07040', 0, 1, 64, 1); R(x, '#3d2512', 0, 56, 64, 8); R(x, '#5b3a1e', 0, 57, 64, 1); };
  T.cubicle = x => { speckle(x, 64, 64, '#6f7f96', 0.3, 1500); R(x, '#9aa3ad', 0, 0, 64, 5); R(x, '#c8cdd2', 0, 1, 64, 1); R(x, '#596577', 0, 5, 64, 1);
    R(x, '#4b5566', 0, 60, 64, 4); R(x, '#596577', 31, 6, 1, 54); };
  T.cubicleNote = x => { T.cubicle(x); R(x, '#000', 25, 25, 15, 15); R(x, '#ffd84a', 24, 24, 15, 15); R(x, '#e8b820', 24, 36, 15, 3); txt(x, 'psst', 31, 30, '#7a3', 6); R(x, '#333', 27, 33, 9, 1); };
  T.brick = x => { R(x, '#3b2a2a', 0, 0, 64, 64); for (let j = 0; j < 8; j++) for (let i = -1; i < 4; i++){ const ox = (j % 2) * 8; R(x, shade('#b0583e', 0.8 + rnd() * 0.35), i * 16 + ox + 1, j * 8 + 1, 15, 7); } };
  T.painted = x => { speckle(x, 64, 64, '#c9b98a', 0.12, 500); R(x, '#5c8a6a', 0, 40, 64, 24); R(x, '#3e6b4d', 0, 40, 64, 2); R(x, '#4e7c5c', 0, 62, 64, 2); };
  T.tech = x => { R(x, '#252b36', 0, 0, 64, 64); R(x, '#323a48', 2, 2, 28, 60); R(x, '#323a48', 34, 2, 28, 60); R(x, '#151a22', 30, 0, 4, 64);
    for (let j = 6; j < 60; j += 8){ R(x, '#1a1f28', 5, j, 22, 5); R(x, '#1a1f28', 37, j, 22, 5); R(x, rnd() < 0.5 ? '#3f9' : '#0cf', 6 + (rnd() * 18 | 0), j + 1, 2, 2); R(x, rnd() < 0.3 ? '#f55' : '#0cf', 38 + (rnd() * 18 | 0), j + 1, 2, 2); } };
  T.rack = x => { R(x, '#111419', 0, 0, 64, 64); R(x, '#2a2f38', 0, 0, 3, 64); R(x, '#2a2f38', 61, 0, 3, 64);
    for (let j = 2; j < 64; j += 6){ R(x, '#1f242c', 5, j, 54, 5); R(x, '#2f3540', 5, j, 54, 1); for (let k = 0; k < 4; k++) R(x, ['#3f9', '#0cf', '#fc3', '#3f9'][(rnd() * 4) | 0], 8 + k * 4, j + 2, 2, 1); R(x, '#0a0c10', 32, j + 2, 24, 2); } };
  T.concreteWall = x => { speckle(x, 64, 64, '#4f4a58', 0.3, 1300); R(x, '#3a3542', 0, 0, 64, 2); for (let i = 0; i < 64; i += 8){ R(x, i % 16 ? '#e0b030' : '#111', i, 52, 8, 8); } R(x, '#2d2934', 0, 50, 64, 2); R(x, '#2d2934', 0, 60, 64, 4); };
  T.ceilTile = x => { speckle(x, 64, 64, '#bdb8a8', 0.12, 700); R(x, '#8c8878', 0, 0, 64, 2); R(x, '#8c8878', 0, 0, 2, 64); R(x, '#8c8878', 32, 0, 1, 64); R(x, '#8c8878', 0, 32, 64, 1);
    R(x, '#fffbe8', 36, 6, 22, 52); R(x, '#e8e4d0', 36, 6, 22, 2); for (let j = 10; j < 56; j += 6) R(x, '#d8d3bd', 38, j, 18, 1); };
  T.ceilDark = x => { speckle(x, 64, 64, '#2a2730', 0.3, 800); R(x, '#1a181f', 0, 0, 64, 3); R(x, '#1a181f', 0, 0, 3, 64); for (let i = 8; i < 64; i += 16) R(x, '#3a3542', i, 3, 2, 61); };
  T.door = x => { R(x, '#6b7480', 0, 0, 64, 64); R(x, '#838c98', 3, 3, 58, 58); R(x, '#5a626d', 31, 3, 2, 58); R(x, '#24303c', 10, 10, 16, 20); R(x, '#24303c', 38, 10, 16, 20); R(x, '#4a7a9a', 11, 11, 6, 6); R(x, '#4a7a9a', 39, 11, 6, 6);
    for (let j = 40; j < 58; j += 4) R(x, '#6b7480', 6, j, 52, 1); R(x, '#ffd84a', 28, 34, 8, 3); };
  T.doorRed = x => { R(x, '#5a1f24', 0, 0, 64, 64); for (let i = -64; i < 64; i += 12){ x.fillStyle = '#c23a3a'; x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 6, 64); x.lineTo(i + 70, 0); x.lineTo(i + 64, 0); x.fill(); }
    R(x, '#222', 22, 18, 20, 28); R(x, '#e33', 25, 21, 14, 9); txt(x, 'KEY', 32, 37, '#fff', 7); R(x, '#f44', 29, 41, 6, 2); R(x, '#000', 0, 0, 64, 2); R(x, '#000', 0, 62, 64, 2); };
  T.doorExit = x => { R(x, '#1d3a24', 0, 0, 64, 64); R(x, '#2c5a36', 4, 4, 56, 56); R(x, '#0a1a0f', 8, 20, 48, 22); txt(x, 'EXIT', 32, 31, '#5f5', 10); R(x, '#5f5', 10, 46, 44, 2); };
  T.partTop = x => { R(x, '#8a929c', 0, 0, 64, 64); R(x, '#a9b0b8', 0, 0, 64, 2); R(x, '#6e7680', 0, 62, 64, 2); };
  T.counter = x => { R(x, '#d6cbb0', 0, 0, 64, 64); R(x, '#bfb396', 0, 0, 64, 6); R(x, '#8a7f66', 0, 6, 64, 2); for (let i = 0; i < 64; i += 32){ R(x, '#a8977a', i + 2, 12, 28, 48); R(x, '#cbbd9e', i + 13, 30, 6, 2); } };
  T.desk = x => { R(x, '#8a5a32', 0, 0, 64, 64); R(x, '#a06c3e', 0, 0, 64, 6); R(x, '#5b3a1e', 0, 6, 64, 2); for (let i = 0; i < 30; i++) R(x, 'rgba(40,20,5,0.3)', rnd() * 64 | 0, 10 + rnd() * 50 | 0, 6, 1); };
  T.stair = x => { speckle(x, 64, 64, '#7d7a72', 0.2, 600); R(x, '#d9b73a', 0, 0, 64, 4); R(x, '#2b2a28', 0, 4, 64, 1); };

  // ---------- decals (posters / signs) ----------
  const D = {};
  D.welcome = x => { R(x, '#1d2b4a', 0, 0, 64, 32); R(x, '#ffd84a', 2, 2, 60, 28); R(x, '#1d2b4a', 4, 4, 56, 24); txt(x, 'WELCOME TO', 32, 11, '#ffd84a', 7); txt(x, 'GREMLIN OFFICE', 32, 21, '#fff', 7); };
  D.poster = x => { R(x, '#f1e6c8', 0, 0, 32, 44); R(x, '#7ad65a', 3, 3, 26, 24); R(x, '#2b5', 9, 9, 14, 14); R(x, '#fff', 11, 13, 3, 3); R(x, '#fff', 18, 13, 3, 3); R(x, '#000', 12, 14, 1, 1); R(x, '#000', 19, 14, 1, 1); R(x, '#000', 13, 19, 6, 1);
    txt(x, 'FILE IT', 16, 33, '#333', 6); txt(x, 'OR PILE IT', 16, 40, '#333', 5); };
  D.arrowBreak = x => { R(x, '#1d2b4a', 0, 0, 64, 24); txt(x, 'BREAK ROOM', 26, 12, '#fff', 7); x.fillStyle = '#ffd84a'; x.beginPath(); x.moveTo(52, 6); x.lineTo(62, 12); x.lineTo(52, 18); x.fill(); };
  D.server = x => { R(x, '#3a0f12', 0, 0, 64, 24); R(x, '#e33', 1, 1, 62, 22); R(x, '#3a0f12', 3, 3, 58, 18); txt(x, 'SERVER ROOM', 32, 9, '#fff', 6); txt(x, 'RED CARD ONLY', 32, 17, '#f88', 5); };
  D.copy = x => { R(x, '#222', 0, 0, 64, 24); txt(x, 'COPY CENTER', 32, 9, '#ffd84a', 7); txt(x, 'DO NOT FEED', 32, 17, '#f66', 6); };
  D.exitSign = x => { R(x, '#111', 0, 0, 32, 14); txt(x, 'EXIT', 16, 7, '#5f5', 8); };
  D.whiteboard = x => { R(x, '#ccc', 0, 0, 64, 40); R(x, '#fafafa', 2, 2, 60, 36); txt(x, 'Q4 GOALS:', 20, 9, '#22a', 6); txt(x, '1. survive', 22, 18, '#a22', 6); txt(x, '2. more snacks', 28, 26, '#2a2', 6); R(x, '#888', 4, 37, 56, 3); };
  D.fridgeNote = x => { R(x, '#fff6d8', 0, 0, 40, 28); txt(x, 'LABEL YOUR', 20, 9, '#333', 6); txt(x, 'LUNCH!!', 20, 19, '#c33', 7); };

  // ---------- sprites ----------
  function eyes(x, a, b, col, angry){ R(x, '#fff', a, b, 4, 4); R(x, '#fff', a + 7, b, 4, 4); R(x, col || '#000', a + 2, b + 1, 2, 2); R(x, col || '#000', a + 9, b + 1, 2, 2);
    if (angry){ R(x, '#000', a - 1, b - 2, 5, 1); R(x, '#000', a + 7, b - 2, 5, 1); R(x, '#000', a + 3, b - 1, 1, 1); R(x, '#000', a + 7, b - 1, 1, 1); } }
  const SP = {};
  SP.jam = (x, f) => { // crumpled paper gremlin, 32x32
    const bob = f === 1 ? 1 : 0; const by = 4 + bob;
    R(x, '#000', 7, by + 2, 18, 20); R(x, '#f4f0e4', 8, by + 1, 16, 20); R(x, '#f4f0e4', 6, by + 4, 20, 14);
    R(x, '#d6d0c0', 10, by + 3, 3, 2); R(x, '#d6d0c0', 19, by + 15, 4, 2); R(x, '#d6d0c0', 8, by + 10, 2, 4); R(x, '#c9c2b0', 15, by + 7, 1, 6); R(x, '#c9c2b0', 21, by + 5, 1, 4);
    R(x, '#7aa7e0', 8, by + 13, 16, 1); R(x, '#7aa7e0', 7, by + 17, 18, 1);
    eyes(x, 10, by + 7, '#000', true);
    if (f === 2){ R(x, '#000', 11, by + 13, 10, 5); R(x, '#fff', 12, by + 13, 2, 2); R(x, '#fff', 18, by + 13, 2, 2); R(x, '#f57', 13, by + 16, 6, 2); }
    else { R(x, '#000', 12, by + 14, 8, 2); R(x, '#fff', 13, by + 14, 2, 1); R(x, '#fff', 17, by + 14, 2, 1); }
    const l = f === 1 ? 2 : 0; R(x, '#222', 10, 26, 3, 5 - l); R(x, '#222', 19, 26 - l, 3, 5); R(x, '#222', 8, 30 - l, 5, 2); R(x, '#222', 19, 30, 5, 2);
    R(x, '#222', 4, by + 10 - l, 3, 2); R(x, '#222', 25, by + 10 + l, 3, 2);
  };
  SP.imp = (x, f) => { // little purple gremlin with a coffee mug, 32x32
    const by = f === 1 ? 1 : 0;
    R(x, '#000', 7, 6 + by, 18, 18); R(x, '#8b5fd6', 8, 7 + by, 16, 16); R(x, '#a37cf0', 9, 8 + by, 6, 3);
    R(x, '#8b5fd6', 5, 3 + by, 4, 6); R(x, '#8b5fd6', 23, 3 + by, 4, 6); R(x, '#5e3aa0', 6, 3 + by, 2, 2); R(x, '#5e3aa0', 24, 3 + by, 2, 2);
    eyes(x, 10, 11 + by, '#c00', f === 2);
    R(x, '#000', 12, 18 + by, 8, 2); R(x, '#fff', 13, 18 + by, 1, 1); R(x, '#fff', 18, 18 + by, 1, 1);
    R(x, '#6b47b0', 9, 23, 14, 4); R(x, '#222', 10, 27, 4, 4); R(x, '#222', 18, 27, 4, 4);
    if (f === 2){ R(x, '#8b5fd6', 23, 4, 4, 10); R(x, '#fff', 24, 0, 7, 6); R(x, '#6b3a1a', 25, 1, 5, 2); R(x, '#fff', 30, 2, 2, 3); }
    else { R(x, '#8b5fd6', 23, 15 + by, 4, 4); R(x, '#fff', 25, 13 + by, 6, 7); R(x, '#6b3a1a', 26, 14 + by, 4, 2); R(x, '#fff', 30, 15 + by, 2, 3); R(x, '#d33', 26, 17 + by, 4, 1); }
    R(x, '#8b5fd6', 4, 15 + by, 4, 4);
  };
  SP.blob = (x, f) => { // toner blob, 32x32
    const s = f === 1 ? 1 : 0; const top = 8 + s;
    R(x, '#000', 4, top + 1, 24, 24 - s); R(x, '#1d2430', 5, top, 22, 24 - s); R(x, '#1d2430', 3, top + 6, 26, 17 - s);
    R(x, '#37d4e8', 7, top + 2, 6, 2); R(x, '#2aa', 22, top + 8, 3, 3); R(x, '#2aa', 6, top + 14, 2, 4);
    eyes(x, 10, top + 6, '#0cf', f === 2);
    if (f === 2){ R(x, '#000', 10, top + 13, 12, 6); R(x, '#0cf', 12, top + 17, 8, 2); } else { R(x, '#000', 12, top + 14, 8, 2); }
    R(x, '#1d2430', 2, 30, 4, 2); R(x, '#1d2430', 26, 30, 4, 2); R(x, '#37d4e8', 15, 30, 3, 2);
  };
  SP.boss = (x, f) => { // the Mega-Copier, 64x64
    const by = f === 1 ? 1 : 0;
    R(x, '#000', 4, 14 + by, 56, 48 - by); R(x, '#d8d4c8', 6, 16 + by, 52, 44 - by); R(x, '#b8b4a8', 6, 40, 52, 4);
    R(x, '#3a3a44', 8, 10 + by, 48, 8); R(x, '#55556a', 10, 8 + by, 44, 4); // lid
    R(x, '#222', 12, 22 + by, 40, 14); // face screen
    const ec = f === 2 ? '#ff3' : '#f33'; R(x, ec, 16, 25 + by, 8, 5); R(x, ec, 40, 25 + by, 8, 5); R(x, '#000', 15, 23 + by, 10, 1); R(x, '#000', 39, 23 + by, 10, 1);
    R(x, '#000', 20, 22 + by, 6, 2); R(x, '#000', 38, 22 + by, 6, 2);
    if (f === 2){ R(x, '#111', 18, 44, 28, 10); R(x, '#fff', 20, 45, 24, 3); R(x, '#fff', 20, 50, 24, 2); }
    else { R(x, '#111', 18, 46, 28, 4); R(x, '#fff', 20, 46, 24, 2); }
    R(x, '#ffd84a', 50, 20 + by, 4, 3); R(x, '#3f9', 50, 25 + by, 4, 3); R(x, '#0cf', 50, 30 + by, 4, 3);
    R(x, '#888', 8, 60, 8, 4); R(x, '#888', 48, 60, 8, 4); R(x, '#222', 9, 61, 6, 3); R(x, '#222', 49, 61, 6, 3);
    R(x, '#b8b4a8', 0, 34, 6, 14); R(x, '#b8b4a8', 58, 34, 6, 14); // paper trays as arms
    R(x, '#fff', 0, 30, 6, 4); R(x, '#fff', 58, 30, 6, 4);
  };
  SP.coffee = x => { R(x, '#000', 2, 2, 12, 12); R(x, '#6b3a1a', 3, 3, 10, 10); R(x, '#a0602a', 4, 4, 5, 4); R(x, '#fff', 5, 5, 2, 2); };
  SP.plane = x => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(1, 8); x.lineTo(15, 3); x.lineTo(15, 13); x.fill(); R(x, '#aaa', 4, 8, 11, 1); R(x, '#000', 1, 8, 1, 1); };
  SP.note = x => { R(x, '#000', 3, 3, 11, 11); R(x, '#ffd84a', 2, 2, 11, 11); R(x, '#e8b820', 2, 10, 11, 3); R(x, '#a88', 4, 5, 6, 1); };
  SP.band = x => { R(x, '#e33', 2, 6, 12, 2); R(x, '#e33', 2, 8, 2, 2); R(x, '#e33', 12, 8, 2, 2); R(x, '#e33', 4, 10, 8, 1); };
  SP.ball = x => { R(x, '#000', 3, 3, 10, 10); R(x, '#ff5a7a', 2, 2, 10, 10); R(x, '#3cf', 4, 4, 3, 3); R(x, '#ffd84a', 8, 7, 3, 3); R(x, '#7ad65a', 5, 9, 2, 2); };
  SP.puff = x => { R(x, 'rgba(255,255,255,0.8)', 4, 4, 8, 8); R(x, 'rgba(255,255,255,0.5)', 2, 6, 12, 4); R(x, 'rgba(255,255,255,0.5)', 6, 2, 4, 12); };
  // pickups 16x16 / 24x24
  SP.cup = x => { R(x, '#000', 4, 4, 10, 12); R(x, '#fff', 4, 5, 9, 10); R(x, '#7ad65a', 4, 8, 9, 3); R(x, '#fff', 13, 7, 3, 5); R(x, '#000', 14, 8, 1, 3); R(x, 'rgba(255,255,255,0.6)', 6, 1, 1, 3); R(x, 'rgba(255,255,255,0.6)', 9, 0, 1, 3); };
  SP.snack = x => { R(x, '#000', 2, 6, 20, 16); R(x, '#ff5a7a', 2, 5, 19, 15); R(x, '#fff', 9, 8, 5, 9); R(x, '#fff', 7, 10, 9, 5); R(x, '#c23a55', 2, 5, 19, 2); R(x, '#ffd84a', 6, 2, 11, 3); };
  SP.notepad = x => { R(x, '#000', 3, 5, 18, 16); R(x, '#ffd84a', 2, 4, 18, 16); R(x, '#e8b820', 2, 16, 18, 4); R(x, '#ffb3c8', 5, 2, 12, 3); R(x, '#8cf', 7, 0, 10, 3); txt(x, '+N', 11, 11, '#a60', 7); };
  SP.bands = x => { R(x, '#000', 4, 8, 16, 12); R(x, '#c9a36a', 3, 7, 16, 12); for (let i = 0; i < 4; i++) R(x, ['#e33', '#36f', '#3c3', '#fc3'][i], 4 + i * 4, 8, 2, 10); };
  SP.poppers = x => { for (let i = 0; i < 3; i++){ const a = 3 + i * 6; R(x, '#000', a, 6, 6, 16); R(x, i % 2 ? '#3cf' : '#ff5a7a', a, 5, 5, 15); R(x, '#ffd84a', a + 1, 3, 3, 3); } };
  SP.keycard = x => { R(x, '#000', 3, 6, 20, 14); R(x, '#e33', 2, 5, 20, 13); R(x, '#fff', 4, 7, 6, 6); R(x, '#222', 5, 8, 4, 4); R(x, '#fff', 12, 8, 8, 1); R(x, '#fff', 12, 11, 6, 1); R(x, '#ffd84a', 2, 15, 20, 2); };
  SP.gunSpread = x => { R(x, '#000', 1, 9, 23, 8); R(x, '#8a5a32', 1, 8, 22, 7); R(x, '#5b3a1e', 1, 13, 22, 2); R(x, '#e33', 14, 7, 2, 9); R(x, '#36f', 18, 7, 2, 9); R(x, '#5b3a1e', 2, 14, 6, 8); };
  SP.gunCannon = x => { R(x, '#000', 2, 6, 21, 13); x.fillStyle = '#ff5a7a'; x.beginPath(); x.moveTo(2, 9); x.lineTo(22, 4); x.lineTo(22, 20); x.lineTo(2, 15); x.fill(); R(x, '#3cf', 8, 7, 3, 10); R(x, '#ffd84a', 15, 6, 3, 12); R(x, '#fff', 21, 5, 2, 14); };
  SP.plant = x => { R(x, '#000', 9, 22, 14, 10); R(x, '#c46a3a', 10, 22, 12, 9); R(x, '#a0522d', 10, 22, 12, 2);
    for (let i = 0; i < 9; i++){ const a = 6 + rnd() * 18 | 0, b = 3 + rnd() * 16 | 0; R(x, '#2f8a3a', a, b, 4, 6); R(x, '#4bb85a', a + 1, b, 2, 3); } R(x, '#2f8a3a', 15, 14, 2, 8); };
  SP.cooler = x => { R(x, '#000', 9, 0, 14, 32); R(x, '#8fd3ff', 10, 1, 12, 11); R(x, '#c8ecff', 12, 2, 3, 6); R(x, '#eee', 9, 12, 14, 20); R(x, '#36f', 12, 15, 3, 2); R(x, '#e33', 17, 15, 3, 2); R(x, '#bbb', 9, 30, 14, 2); };
  SP.vending = x => { R(x, '#000', 2, 0, 28, 32); R(x, '#c23a3a', 3, 1, 26, 30); R(x, '#123', 5, 3, 16, 22); for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) R(x, ['#ffd84a', '#7ad65a', '#3cf', '#ff8'][(i + j) % 4], 6 + i * 5, 4 + j * 5, 3, 3);
    R(x, '#222', 23, 6, 4, 8); R(x, '#ffd84a', 24, 7, 2, 2); R(x, '#111', 5, 27, 16, 3); };
  SP.printerSmall = x => { R(x, '#000', 4, 14, 24, 18); R(x, '#d8d4c8', 5, 15, 22, 16); R(x, '#333', 8, 18, 16, 3); R(x, '#fff', 9, 11, 14, 5); R(x, '#3f9', 22, 24, 2, 2); };
  SP.exitpad = x => { R(x, 'rgba(0,0,0,0)', 0, 0, 32, 32); x.strokeStyle = '#5f5'; x.lineWidth = 2; x.strokeRect(3, 3, 26, 26); x.strokeRect(8, 8, 16, 16); R(x, 'rgba(90,255,90,0.35)', 4, 4, 24, 24); };
  SP.ring = x => { x.strokeStyle = '#7ad65a'; x.lineWidth = 2; x.beginPath(); x.arc(16, 16, 12, 0, 7); x.stroke(); x.beginPath(); x.arc(16, 16, 5, 0, 7); x.stroke(); };

  // ---------- first-person gadgets, drawn into 120x80 boxes ----------
  // Pip's Workshop: the surveyor you pick tints your hands (base, highlight, shadow).
  const LOOK = { base: '#5aa848', hi: '#7ad65a', lo: '#2e6b26' };
  function hand(x, a, b){ R(x, '#000', a - 1, b - 1, 18, 20); R(x, LOOK.base, a, b, 16, 18); R(x, LOOK.hi, a + 2, b + 1, 6, 4); R(x, LOOK.lo, a, b + 14, 16, 4);
    for (let i = 0; i < 3; i++){ R(x, LOOK.base, a + 2 + i * 5, b - 4, 4, 5); R(x, '#ddd', a + 3 + i * 5, b - 6, 2, 2); } }
  const GUN = {};
  GUN.notes = (x, fire) => {
    R(x, '#000', 38, 30, 44, 52); R(x, '#ff9a2a', 40, 32, 40, 48); R(x, '#ffbd5a', 42, 34, 10, 44); R(x, '#d96f10', 72, 32, 8, 48);
    R(x, '#000', 46, 18, 28, 16); R(x, '#ffd84a', 47, 14 - (fire ? 4 : 0), 26, 6); R(x, '#ffb3c8', 47, 20, 26, 5); R(x, '#8cf', 47, 25, 26, 5); R(x, '#ffd84a', 47, 30, 26, 3);
    R(x, '#222', 52, 28, 16, 6); R(x, '#444', 54, 24, 12, 4);
    R(x, '#000', 54, 34, 12, 10); R(x, '#3a3a44', 55, 35, 10, 8); R(x, '#7ad65a', 57, 37, 6, 4); // sight window
    R(x, '#d96f10', 40, 50, 40, 2); R(x, '#d96f10', 40, 62, 40, 2); R(x, '#fff', 44, 54, 10, 6); R(x, '#2b5', 46, 55, 2, 2); R(x, '#2b5', 50, 55, 2, 2); // gremlin sticker
    hand(x, 30, 58); hand(x, 74, 62);
    if (fire){ R(x, '#fff6a0', 50, 4, 20, 10); R(x, '#ffd84a', 44, 8, 32, 4); R(x, '#fff', 56, 0, 8, 16); }
  };
  GUN.spread = (x, fire) => {
    R(x, '#000', 30, 30, 60, 54); R(x, '#8a5a32', 32, 32, 56, 50); R(x, '#a06c3e', 34, 34, 8, 46); R(x, '#5b3a1e', 80, 32, 8, 50);
    R(x, '#000', 34, 22, 14, 12); R(x, '#000', 72, 22, 14, 12); R(x, '#8a5a32', 36, 20, 10, 12); R(x, '#8a5a32', 74, 20, 10, 12);
    const by = fire ? 12 : 0; ['#e33', '#36f', '#3c3'].forEach((c, i) => { R(x, c, 38, 24 + i * 3 + by, 44, 2); });
    R(x, '#ccc', 56, 34, 8, 20); R(x, '#888', 58, 52, 4, 6);
    hand(x, 26, 60); hand(x, 78, 60);
    if (fire){ for (let i = 0; i < 6; i++) R(x, ['#e33', '#36f', '#3c3'][i % 3], 30 + i * 11, 2 + (i % 2) * 6, 7, 2); }
  };
  GUN.cannon = (x, fire) => {
    x.fillStyle = '#000'; x.beginPath(); x.moveTo(34, 82); x.lineTo(24, 18); x.lineTo(96, 18); x.lineTo(86, 82); x.fill();
    x.fillStyle = '#ff5a7a'; x.beginPath(); x.moveTo(37, 80); x.lineTo(28, 21); x.lineTo(92, 21); x.lineTo(83, 80); x.fill();
    for (let i = 0; i < 4; i++){ x.fillStyle = i % 2 ? '#3cf' : '#ffd84a'; x.beginPath(); const y0 = 28 + i * 13; x.moveTo(28 + i * 1.5, y0); x.lineTo(92 - i * 1.5, y0); x.lineTo(91 - i * 1.5, y0 + 5); x.lineTo(29 + i * 1.5, y0 + 5); x.fill(); }
    R(x, '#000', 24, 16, 72, 6); R(x, '#fff', 26, 17, 68, 3); R(x, '#222', 34, 21, 52, 4);
    hand(x, 22, 60); hand(x, 82, 60);
    if (fire){ for (let i = 0; i < 40; i++) R(x, ['#ff5a7a', '#3cf', '#ffd84a', '#7ad65a', '#fff'][i % 5], 20 + rnd() * 80 | 0, rnd() * 18 | 0, 3, 3); }
  };

  // ---------- builders ----------
  function canvasTex(c, repeat){
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
    t.colorSpace = THREE.SRGBColorSpace; if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; } else { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = THREE.NearestFilter; }
    return t;
  }
  const tex = {}, decal = {}, sprite = {}, gun = {};
  function build(){
    for (const k in T){ const [c, x] = cv(64, 64); seed = 1000 + k.length * 77; T[k](x); tex[k] = canvasTex(c, true); }
    const dsz = { welcome: [64, 32], poster: [32, 44], arrowBreak: [64, 24], server: [64, 24], copy: [64, 24], exitSign: [32, 14], whiteboard: [64, 40], fridgeNote: [40, 28] };
    for (const k in D){ const [w, h] = dsz[k]; const [c, x] = cv(w, h); D[k](x); decal[k] = { tex: canvasTex(c, false), w, h }; }
    const ss = (name, fn, size, frames) => { for (let f = 0; f < (frames || 1); f++){ const [c, x] = cv(size, size); seed = 500 + f; fn(x, f); sprite[name + (frames ? f : '')] = canvasTex(c, false); } };
    ss('jam', SP.jam, 32, 3); ss('imp', SP.imp, 32, 3); ss('blob', SP.blob, 32, 3); ss('boss', SP.boss, 64, 3);
    ['coffee', 'plane', 'note', 'band', 'ball', 'puff'].forEach(n => ss(n, SP[n], 16));
    ['cup'].forEach(n => ss(n, SP[n], 16));
    ['snack', 'notepad', 'bands', 'poppers', 'keycard', 'gunSpread', 'gunCannon'].forEach(n => ss(n, SP[n], 24));
    ['plant', 'cooler', 'vending', 'printerSmall', 'exitpad', 'ring'].forEach(n => ss(n, SP[n], 32));
    for (const k in GUN){ gun[k] = []; for (let f = 0; f < 2; f++){ const [c, x] = cv(120, 84); seed = 99; GUN[k](x, f === 1); gun[k].push(c); } }
  }
  function setLook(l){ Object.assign(LOOK, l || {});
    for (const k in gun){ gun[k].forEach((c, f) => { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); seed = 99; GUN[k](x, f === 1); }); } }
  return { build, tex, decal, sprite, gun, setLook };
})();
