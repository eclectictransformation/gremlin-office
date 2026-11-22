/* Gift certificate + business card renderer. Draws Moth's template layer specs (data/templates.json) on a canvas.
   Everything happens in this browser: no uploads, no server. Units: inches in the bleed document (origin top-left of bleed),
   drawn at 300 px per inch and scaled to the canvas. */
(function () {
  "use strict";
  var DPI = 300, PITCH_WRAP = 0.13;
  var FACES = [], ASC = {}, fontsReady = null;
  var mctx = document.createElement("canvas").getContext("2d"); // measuring context (300 dpi px)

  function faceKey(fam, wt, it) { return fam + "|" + wt + "|" + (it ? 1 : 0); }
  function cssFont(T, pt) { return (T.italic ? "italic " : "") + T.font_weight + " " + (pt * DPI / 72).toFixed(3) + 'px "dc-' + T.font_family + '"'; }
  function loadFonts(base, faces) {
    FACES = faces;
    faces.forEach(function (f) { ASC[faceKey(f.family, f.weight, f.italic)] = f.ascent; });
    if (fontsReady) return fontsReady;
    fontsReady = Promise.all(faces.map(function (f) {
      var ff = new FontFace("dc-" + f.family, "url(" + base + f.file + ")", { weight: String(f.weight), style: f.italic ? "italic" : "normal" });
      return ff.load().then(function (x) { document.fonts.add(x); return true; });
    }));
    return fontsReady;
  }

  function shown(T, s) { return T.transform === "uppercase" ? String(s).toUpperCase() : String(s); }
  function width(T, pt, s) {
    mctx.font = cssFont(T, pt);
    var px = pt * DPI / 72, tr = (T.tracking_em || 0) * px;
    if (!tr) return mctx.measureText(s).width / DPI;
    var w = 0; for (var i = 0; i < s.length; i++) w += mctx.measureText(s[i]).width;
    return (w + tr * Math.max(s.length - 1, 0)) / DPI;
  }
  function wrapWords(T, pt, s, w) {
    var words = s.split(/\s+/).filter(Boolean), lines = [], cur = "";
    words.forEach(function (wd) { var t = cur ? cur + " " + wd : wd; if (!cur || width(T, pt, t) <= w) cur = t; else { lines.push(cur); cur = wd; } });
    if (cur) lines.push(cur);
    return lines;
  }
  // Prefer the most balanced break after a comma when both lines fit (keeps "Anytown, ST 00000" together).
  function wrapBalanced(T, pt, s, w) {
    var lines = wrapWords(T, pt, s, w);
    if (lines.length === 2 && s.indexOf(",") > -1) {
      var parts = s.split(","), best = null;
      for (var i = 1; i < parts.length; i++) {
        var l1 = parts.slice(0, i).join(",") + ",", l2 = parts.slice(i).join(",").trim();
        var w1 = width(T, pt, l1), w2 = width(T, pt, l2);
        if (w1 <= w && w2 <= w && (!best || Math.max(w1, w2) < best[0])) best = [Math.max(w1, w2), [l1, l2]];
      }
      if (best) lines = best[1];
    }
    return lines;
  }
  function fits(T, pt, lines, w, max) { return lines.length <= max && lines.every(function (l) { return width(T, pt, l) <= w + 1e-6; }); }

  // Ordinary text fields: shrink 0.5 pt at a time down to min_pt until it fits the box (one line, or max_lines when it wraps).
  function fitText(T, value, w) {
    var s = shown(T, value), pt = T.size_pt, lines, ok;
    for (;;) {
      lines = T.wrap ? wrapWords(T, pt, s, w) : [s];
      ok = fits(T, pt, lines, w, T.wrap ? T.max_lines : 1);
      if (ok || pt <= T.min_pt + 1e-6) break;
      pt = Math.round((pt - 0.5) * 100) / 100;
    }
    return { lines: lines, pt: pt, ok: ok };
  }
  // Phone / address: "wrap" (up to 2 lines at the set size) or "shrink" (one line, 0.5 pt steps, never below 6.5 pt).
  // Shrink that still doesn't fit switches to wrap with a note; wrap past 2 lines is flagged (never clipped).
  function fitContact(L, value, want) {
    var T = L.text, O = L.overflow, s = shown(T, value), res = { want: want, mode: want, note: "" };
    function shrinkTry() {
      var pt = O.shrink.start_pt, w = O.shrink.box[2];
      for (;;) { if (width(T, pt, s) <= w + 1e-6) return { lines: [s], pt: pt, ok: true }; if (pt <= O.shrink.min_pt + 1e-6) return { lines: [s], pt: pt, ok: false }; pt = Math.round((pt - O.shrink.step_pt) * 100) / 100; }
    }
    function wrapTry() { var pt = O.wrap.size_pt, lines = wrapBalanced(T, pt, s, O.wrap.box[2]); return { lines: lines, pt: pt, ok: fits(T, pt, lines, O.wrap.box[2], O.wrap.max_lines) }; }
    var sh = shrinkTry(), wr = wrapTry();
    res.shrinkFits = sh.ok; res.wrapFits = wr.ok;
    if (want === "shrink") {
      if (sh.ok) Object.assign(res, sh);
      else { Object.assign(res, wr); res.mode = "wrap"; res.note = wr.ok ? "auto_wrap" : "auto_wrap_over"; }
    } else {
      Object.assign(res, wr);
      if (!wr.ok) res.note = "wrap_over";
    }
    res.lh = O.wrap.line_height;
    return res;
  }

  /* ---------- layout: where every layer sits for the current values + moves ---------- */
  function layout(tpl, st) {
    var out = [], byId = {}, contact = {};
    var mode = tpl.kind === "gift_certificate" ? st.longMode.cert : st.longMode.card;
    tpl.layers.forEach(function (L) {
      var it = { L: L, id: L.id, type: L.type, box: L.box.slice(), visible: L.visible !== false };
      if (L.id === "phone" || L.id === "address") {
        if (tpl.kind === "gift_certificate") it.visible = !!st.certContact;
        else if (L.id === "address") it.visible = st.cardAddress !== false;
      }
      if (L.type === "text_field") {
        var v = L.slot ? st.value(L.id, L) : L.text.default;
        it.value = v;
        if (!String(v).trim()) it.empty = true;
        if (L.overflow) { it.fit = fitContact(L, v, mode); if (!it.visible || it.empty) it.fit.note = ""; contact[L.id] = it; }
        else it.fit = fitText(L.text, v, L.box[2]);
      }
      out.push(it); byId[L.id] = it;
    });
    // contact positions
    var anyWrap = Object.keys(contact).some(function (k) { var c = contact[k]; return c.visible && !c.empty && c.fit.mode === "wrap"; });
    if (tpl.kind === "gift_certificate") {
      Object.keys(contact).forEach(function (k) { var c = contact[k]; c.box = c.L.overflow[c.fit.mode].box.slice(); });
    } else {
      var blk = anyWrap ? "wrap" : "shrink";
      ["phone", "address"].forEach(function (k) { var c = contact[k]; if (c) c.box = c.L.overflow[blk === "wrap" ? "wrap" : "shrink"].box.slice(); });
      ["email", "website"].forEach(function (k) { var c = byId[k]; if (c && c.L.positions_by_mode) c.box = c.L.positions_by_mode[blk].slice(); });
      if (blk === "wrap" && contact.phone) {
        var ph = contact.phone, nph = ph.empty ? 1 : Math.max(1, ph.fit.lines.length), y0 = ph.box[1];
        if (byId.email) byId.email.box[1] = y0 + nph * PITCH_WRAP;
        if (tpl.contact_layout === "stack") {
          if (byId.website) byId.website.box[1] = byId.email.box[1] + PITCH_WRAP;
          if (contact.address) contact.address.box[1] = byId.website.box[1] + PITCH_WRAP;
        }
      }
      st.blockMode = blk;
    }
    // moves (groups move together)
    var mv = st.movesFor(tpl);
    out.forEach(function (it) {
      var key = it.L.group && it.L.group !== "business_contact" ? "g:" + it.L.group : it.id;
      if (it.L.group === "business_contact") key = "g:business_contact";
      it.moveKey = key;
      var d = mv[key]; if (d) { it.box[0] += d[0]; it.box[1] += d[1]; it.moved = true; }
    });
    // hit boxes (actual ink area for text)
    out.forEach(function (it) {
      if (it.type === "text_field" && it.fit) {
        var T = it.L.text, n = it.fit.lines.length, lh = (it.fit.lh || T.line_height) * it.fit.pt / 72;
        var w = Math.max.apply(null, it.fit.lines.map(function (l) { return width(T, it.fit.pt, l); }).concat([0.05]));
        var x = it.box[0] + (T.align === "center" ? (it.box[2] - w) / 2 : T.align === "right" ? it.box[2] - w : 0);
        it.hit = [x, it.box[1], w, Math.max(lh * n, lh)];
      } else it.hit = it.box.slice();
    });
    return out;
  }

  /* ---------- drawing ---------- */
  function rrPath(c, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    c.beginPath();
    if (!r) { c.rect(x, y, w, h); return; }
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function shapePath(c, shape, b, r) {
    var x = b[0] * DPI, y = b[1] * DPI, w = b[2] * DPI, h = b[3] * DPI;
    if (shape === "circle" || shape === "ellipse") { c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
    if (shape === "arch") { var rr = w / 2; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + rr); c.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 2); c.lineTo(x + w, y + h); c.closePath(); return; }
    rrPath(c, x, y, w, h, (r || 0) * DPI);
  }
  function prim(c, p, dx, dy) {
    var X = function (v) { return (v + dx) * DPI; }, Y = function (v) { return (v + dy) * DPI; };
    c.save();
    if (p.opacity != null && p.opacity < 1) c.globalAlpha = p.opacity;
    c.beginPath();
    if (p.p === "rect") rrPath(c, X(p.x), Y(p.y), p.w * DPI, p.h * DPI, (p.r || 0) * DPI);
    else if (p.p === "ellipse") c.ellipse(X(p.cx), Y(p.cy), p.rx * DPI, p.ry * DPI, 0, 0, Math.PI * 2);
    else if (p.p === "poly" || p.p === "polyline") { p.pts.forEach(function (q, i) { if (i) c.lineTo(X(q[0]), Y(q[1])); else c.moveTo(X(q[0]), Y(q[1])); }); if (p.p === "poly") c.closePath(); }
    else if (p.p === "line") { c.moveTo(X(p.x1), Y(p.y1)); c.lineTo(X(p.x2), Y(p.y2)); }
    if (p.fill && p.p !== "line" && p.p !== "polyline") { c.fillStyle = p.fill; c.fill(); }
    if (p.stroke) {
      c.strokeStyle = p.stroke; c.lineWidth = Math.max(1, (p.sw || 0.01) * DPI); c.lineJoin = "round"; c.lineCap = "round";
      if (p.dash) c.setLineDash([p.dash[0] * DPI, p.dash[1] * DPI]);
      c.stroke();
    }
    c.restore();
  }
  function drawLines(c, T, lines, pt, b, lh, color) {
    var px = pt * DPI / 72, tr = (T.tracking_em || 0) * px, asc = (ASC[faceKey(T.font_family, T.font_weight, T.italic)] || 0.9) * px;
    c.save(); c.font = cssFont(T, pt); c.fillStyle = color || T.color; c.textBaseline = "alphabetic"; c.textAlign = "left";
    lines.forEach(function (line, i) {
      var y = b[1] * DPI + asc + i * pt * lh / 72 * DPI, w = width(T, pt, line) * DPI, x = b[0] * DPI;
      if (T.align === "center") x += (b[2] * DPI - w) / 2; else if (T.align === "right") x += b[2] * DPI - w;
      if (!tr) c.fillText(line, x, y);
      else for (var k = 0; k < line.length; k++) { c.fillText(line[k], x, y); x += c.measureText(line[k]).width + tr; }
    });
    c.restore();
  }
  function placeholder(c, it, card) {
    var L = it.L, ph = L.placeholder, b = it.box, x = b[0], y = b[1], w = b[2], h = b[3], sw = card ? 0.008 : 0.01;
    c.save(); shapePath(c, L.shape, b, L.corner_radius_in); c.fillStyle = ph.fill; c.fill();
    c.strokeStyle = ph.stroke; c.lineWidth = sw * DPI; c.setLineDash(card ? [0.025 * DPI, 0.018 * DPI] : [0.045 * DPI, 0.03 * DPI]); c.stroke(); c.restore();
    var s = Math.min(w, h) * (card ? 0.2 : 0.17), ly;
    if (L.type === "graphic_slot") {
      var cx = x + w / 2, cy = y + h / 2 - s * 0.35, iw = s * 1.3, ih = s, isw = card ? 0.007 : 0.009;
      prim(c, { p: "rect", x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih, r: s * 0.08, stroke: ph.label_color, sw: isw }, 0, 0);
      prim(c, { p: "polyline", pts: [[cx - iw / 2 + s * 0.12, cy + ih / 2 - s * 0.15], [cx - s * 0.15, cy - s * 0.05], [cx + s * 0.1, cy + s * 0.2], [cx + s * 0.28, cy + s * 0.02], [cx + iw / 2 - s * 0.12, cy + ih / 2 - s * 0.15]], stroke: ph.label_color, sw: isw }, 0, 0);
      prim(c, { p: "ellipse", cx: cx + s * 0.3, cy: cy - s * 0.2, rx: s * 0.1, ry: s * 0.1, fill: ph.label_color }, 0, 0);
    }
    var pt = card ? 5 : (h > 0.7 ? 7 : 6.5);
    ly = L.type === "graphic_slot" ? y + h / 2 + s * 0.35 : y + h / 2 - pt / 72 * 0.55;
    drawLines(c, { font_family: "lato", font_weight: 700, italic: false, tracking_em: 0.16, align: "center", color: ph.label_color, transform: "uppercase" }, [ph.label], pt, [x, ly, w, h], 1.2, ph.label_color);
  }
  function drawImage(c, it, img, fit) {
    var b = it.box, W = b[2] * DPI, H = b[3] * DPI, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc, pad = 0.05;
    if (!iw || !ih) return;
    if (fit === "cover") { sc = Math.max(W / iw, H / ih); pad = 0; } else sc = Math.min(W * (1 - 2 * pad) / iw, H * (1 - 2 * pad) / ih);
    var dw = iw * sc, dh = ih * sc;
    c.save(); shapePath(c, it.L.shape, b, it.L.corner_radius_in); c.clip();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    c.drawImage(img, b[0] * DPI + (W - dw) / 2, b[1] * DPI + (H - dh) / 2, dw, dh); c.restore();
  }

  // opts: { print: bool (no placeholders, no guides), selected: moveKey, guides: bool }
  function draw(canvas, tpl, st, opts) {
    opts = opts || {};
    var c = canvas.getContext("2d"), k = canvas.width / (tpl.w * DPI);
    var items = layout(tpl, st), card = tpl.kind === "business_card";
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(k, 0, 0, k, 0, 0);
    items.forEach(function (it) {
      var L = it.L, b = it.box;
      if (!it.visible) return;
      var dx = b[0] - L.box[0], dy = b[1] - L.box[1];
      if (L.type === "background") { c.fillStyle = L.fill; c.fillRect(0, 0, tpl.w * DPI, tpl.h * DPI); return; }
      if (L.type === "shape") {
        c.save(); if (L.opacity != null && L.opacity < 1) c.globalAlpha = L.opacity;
        rrPath(c, b[0] * DPI, b[1] * DPI, b[2] * DPI, b[3] * DPI, (L.corner_radius_in || 0) * DPI);
        if (L.fill) { c.fillStyle = L.fill; c.fill(); }
        if (L.stroke) { c.strokeStyle = L.stroke; c.lineWidth = Math.max(1, (L.stroke_width_in || 0.01) * DPI); c.stroke(); }
        c.restore(); return;
      }
      if (L.type === "decoration") { L.primitives.forEach(function (p) { prim(c, p, dx, dy); }); return; }
      if (L.type === "logo_slot" || L.type === "graphic_slot") {
        var im = st.image(L.id);
        if (im) drawImage(c, it, im.img, L.type === "graphic_slot" ? st.fit(im) : "contain");
        else if (!opts.print) placeholder(c, it, card);
        return;
      }
      if (L.type === "text_field") {
        if (it.empty) return;
        drawLines(c, L.text, it.fit.lines, it.fit.pt, b, it.fit.lh || L.text.line_height);
      }
    });
    if (opts.guides) {
      var bl = tpl.bleed * DPI, sf = (tpl.bleed + tpl.safe) * DPI, W = tpl.w * DPI, H = tpl.h * DPI;
      c.save(); c.fillStyle = "rgba(220,40,90,.16)";
      c.fillRect(0, 0, W, bl); c.fillRect(0, H - bl, W, bl); c.fillRect(0, bl, bl, H - 2 * bl); c.fillRect(W - bl, bl, bl, H - 2 * bl);
      c.strokeStyle = "rgba(0,140,200,.8)"; c.lineWidth = 2 / k; c.setLineDash([10 / k, 8 / k]); c.strokeRect(sf, sf, W - 2 * sf, H - 2 * sf); c.restore();
    }
    if (opts.selected) {
      items.forEach(function (it) {
        if (it.moveKey !== opts.selected || !it.visible) return;
        var h = it.hit; c.save(); c.strokeStyle = "#B8775A"; c.lineWidth = 3 / k; c.setLineDash([8 / k, 6 / k]);
        c.strokeRect(h[0] * DPI - 4 / k, h[1] * DPI - 4 / k, h[2] * DPI + 8 / k, h[3] * DPI + 8 / k); c.restore();
      });
    }
    return items;
  }

  // Pieces a person can drag on the look-over step: text, pictures, motifs, rules. Colour blocks, frames and the background stay put.
  function draggable(it) {
    var L = it.L;
    if (!it.visible || !L.movable) return false;
    if (L.type === "background" || L.role === "color_block" || L.role === "frame") return false;
    if (L.type === "text_field" && it.empty) return false;
    return true;
  }
  function hitTest(items, x, y) {
    var pad = 0.04;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i], h = it.hit; if (!draggable(it)) continue;
      if (x >= h[0] - pad && x <= h[0] + h[2] + pad && y >= h[1] - pad && y <= h[1] + h[3] + pad) return it;
    }
    return null;
  }
  function outsideSafe(tpl, items) {
    var s = tpl.bleed + tpl.safe, W = tpl.w - s, H = tpl.h - s, out = [];
    items.forEach(function (it) {
      if (!it.moved || !it.visible || !draggable(it)) return;
      if (it.L.type !== "text_field" && it.L.type !== "logo_slot" && it.L.type !== "graphic_slot") return;
      var h = it.hit; if (h[0] < s - 0.005 || h[1] < s - 0.005 || h[0] + h[2] > W + 0.005 || h[1] + h[3] > H + 0.005) out.push(it.id);
    });
    return out;
  }

  /* ---------- print files ---------- */
  var CRC = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // Adds a pHYs chunk so print software reads the PNG as 300 dpi.
  function pngWith300dpi(buf) {
    var src = new Uint8Array(buf), ppm = Math.round(DPI / 0.0254);
    var chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    var at = 33, out = new Uint8Array(src.length + 21);   // after the 8-byte signature + 25-byte IHDR chunk
    out.set(src.subarray(0, at), 0); out.set(chunk, at); out.set(src.subarray(at), at + 21);
    return out;
  }
  function printCanvas(tpl, st) {
    var cv = document.createElement("canvas");
    cv.width = Math.round(tpl.w * DPI); cv.height = Math.round(tpl.h * DPI);
    draw(cv, tpl, st, { print: true });
    return cv;
  }
  function toBlob(cv, type, q) { return new Promise(function (ok) { cv.toBlob(ok, type, q); }); }
  async function pngBlob(tpl, st) {
    var cv = printCanvas(tpl, st), b = await toBlob(cv, "image/png");
    return { blob: new Blob([pngWith300dpi(await b.arrayBuffer())], { type: "image/png" }), w: cv.width, h: cv.height };
  }
  // Minimal PDF: one page per piece, page = bleed size, TrimBox 0.125 in inside, image embedded as a high-quality JPEG.
  async function pdfBlob(pages, st) {
    var enc = new TextEncoder(), parts = [], off = 0, offsets = [];
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); off += b.length; }
    var n = 2 + pages.length * 3; add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    var kids = pages.map(function (_, i) { return (3 + i * 3) + " 0 R"; }).join(" ");
    offsets[1] = off; add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offsets[2] = off; add("2 0 obj\n<< /Type /Pages /Kids [" + kids + "] /Count " + pages.length + " >>\nendobj\n");
    for (var i = 0; i < pages.length; i++) {
      var tpl = pages[i], cv = printCanvas(tpl, st), jpg = new Uint8Array(await (await toBlob(cv, "image/jpeg", 0.95)).arrayBuffer());
      var W = +(tpl.w * 72).toFixed(3), H = +(tpl.h * 72).toFixed(3), bl = tpl.bleed * 72, p = 3 + i * 3;
      var content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q\n";
      offsets[p] = off; add(p + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /BleedBox [0 0 " + W + " " + H + "] /TrimBox [" + bl + " " + bl + " " + (W - bl) + " " + (H - bl) + "] /Resources << /XObject << /Im0 " + (p + 1) + " 0 R >> >> /Contents " + (p + 2) + " 0 R >>\nendobj\n");
      offsets[p + 1] = off; add((p + 1) + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + cv.width + " /Height " + cv.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpg.length + " >>\nstream\n"); add(jpg); add("\nendstream\nendobj\n");
      offsets[p + 2] = off; add((p + 2) + " 0 obj\n<< /Length " + content.length + " >>\nstream\n" + content + "endstream\nendobj\n");
    }
    var xref = off, x = "xref\n0 " + (n + 1) + "\n0000000000 65535 f \n";
    for (var j = 1; j <= n; j++) x += String(offsets[j]).padStart(10, "0") + " 00000 n \n";
    add(x + "trailer\n<< /Size " + (n + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }

  window.DesksCardsRender = { DPI: DPI, loadFonts: loadFonts, layout: layout, draw: draw, hitTest: hitTest, draggable: draggable, outsideSafe: outsideSafe,
    pngBlob: pngBlob, pdfBlob: pdfBlob, printCanvas: printCanvas, fitText: fitText, fitContact: fitContact, width: width };
})();
