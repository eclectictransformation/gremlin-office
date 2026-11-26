/* Talk-to-text for every text box on the Desks. Uses the browser's built-in speech recognition (Web Speech API).
   No extra services: whatever the browser does with audio is the browser's own speech service (some send it to
   their vendor's servers; the room notes say so). Text is inserted at the cursor and never replaces what's there. */
(function () {
  "use strict";
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var TIP = "Use your keyboard's mic to dictate.";
  var active = null; // { rec, field, btn, status }

  var css = ".dz-row{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;margin:.35rem 0 .2rem}" +
    ".dz-mic{display:inline-flex;align-items:center;gap:.35rem;min-height:40px;padding:.4rem .75rem;border:2px solid #1A1A18;border-radius:999px;" +
    "background:#fff;color:#3A4A33;font:600 .9rem/1.2 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;cursor:pointer}" +
    ".dz-mic:hover{background:#E8E4D8}.dz-mic:focus-visible{outline:3px solid #B8775A;outline-offset:2px}" +
    ".dz-mic.dz-on{background:#B8775A;color:#fff;border-color:#1A1A18}" +
    ".dz-mic.dz-on .dz-dot{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;background:#fff;animation:dzp 1s ease-in-out infinite}" +
    ".dz-mic.dz-off{opacity:.5;cursor:help;border-style:dashed}" +
    ".dz-status{font:.85rem/1.3 system-ui,sans-serif;color:#5d5d55}" +
    "@keyframes dzp{50%{opacity:.25}}@media (prefers-reduced-motion:reduce){.dz-mic.dz-on .dz-dot{animation:none}}";
  var st = document.createElement("style"); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  function labelFor(f) {
    var l = (f.id && document.querySelector('label[for="' + f.id + '"]')) || f.closest("label");
    var t = (l && l.textContent) || f.getAttribute("aria-label") || f.placeholder || "this box";
    return t.replace(/\s+/g, " ").trim().slice(0, 60);
  }
  function eligible(f) {
    if (f.dataset.dzDone || f.dataset.noDictate !== undefined) return false;
    if (f.tagName === "TEXTAREA") return true;
    var t = (f.getAttribute("type") || "text").toLowerCase();
    return t === "text" || t === "search";
  }
  function insertAtCursor(f, text, at) {
    var v = f.value, pos = at.pos;
    var before = v.slice(0, pos), after = v.slice(pos);
    var sep = before && !/\s$/.test(before) ? " " : "";
    var add = sep + text.trim();
    if (f.maxLength > 0) add = add.slice(0, Math.max(0, f.maxLength - v.length));
    if (!add) return;
    f.value = before + add + after;
    at.pos = pos + add.length;
    try { f.setSelectionRange(at.pos, at.pos); } catch (e) {}
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function stop() { if (active) { try { active.rec.stop(); } catch (e) {} } }
  function setState(btn, status, on, msg) {
    btn.classList.toggle("dz-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.innerHTML = on ? '<span class="dz-dot" aria-hidden="true"></span> Listening… tap to stop' : '<span aria-hidden="true">🎤</span> Dictate';
    btn.setAttribute("aria-label", (on ? "Stop dictation for " : "Start dictation for ") + btn.dataset.label);
    status.textContent = msg || "";
  }
  function start(f, btn, status) {
    if (active) { var same = active.field === f; stop(); if (same) return; }
    var caret = document.activeElement === f ? f.selectionEnd : f._dzCaret;
    var rec = new SR(), at = { pos: typeof caret === "number" && caret <= f.value.length ? caret : f.value.length };
    rec.lang = navigator.language || "en-US"; rec.continuous = true; rec.interimResults = true;
    active = { rec: rec, field: f, btn: btn, status: status };
    rec.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) insertAtCursor(f, r[0].transcript, at); else interim += r[0].transcript;
      }
      status.textContent = interim ? "Hearing: " + interim : "Listening…";
    };
    rec.onerror = function (e) {
      var m = { "not-allowed": "Microphone access was blocked. " + TIP, "service-not-allowed": "Dictation isn't available here. " + TIP,
                "no-speech": "Didn't catch anything. Tap the mic to try again.", "audio-capture": "No microphone found. " + TIP, network: "The browser's speech service couldn't be reached. " + TIP }[e.error];
      if (m) active && (active.err = m);
    };
    rec.onend = function () { var err = active && active.err; setState(btn, status, false, err || ""); active = null; };
    try { rec.start(); setState(btn, status, true, "Listening…"); f.focus({ preventScroll: true }); }
    catch (e) { active = null; setState(btn, status, false, "Dictation couldn't start. " + TIP); }
  }
  function attach(f) {
    if (!eligible(f)) return;
    f.dataset.dzDone = "1";
    var remember = function () { if (typeof f.selectionEnd === "number") f._dzCaret = f.selectionEnd; };
    ["blur", "keyup", "click", "select", "input"].forEach(function (ev) { f.addEventListener(ev, remember); });
    var row = document.createElement("div"); row.className = "dz-row";
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "dz-mic"; btn.dataset.label = labelFor(f);
    var status = document.createElement("span"); status.className = "dz-status"; status.setAttribute("aria-live", "polite");
    row.appendChild(btn); row.appendChild(status);
    f.insertAdjacentElement("afterend", row);
    if (!SR) {
      btn.classList.add("dz-off"); btn.setAttribute("aria-disabled", "true"); btn.title = TIP;
      btn.innerHTML = '<span aria-hidden="true">🎤</span> Dictate'; btn.setAttribute("aria-label", "Dictation isn't supported in this browser. " + TIP);
      status.textContent = TIP;
      btn.addEventListener("click", function () { status.textContent = TIP; });
      return;
    }
    setState(btn, status, false, "");
    btn.addEventListener("click", function () { if (f.disabled || f.readOnly) { status.textContent = "This box is locked right now."; return; } start(f, btn, status); });
  }
  function scan(root) { (root || document).querySelectorAll("textarea, input").forEach(attach); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && active) stop(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); });
  function boot() {
    scan(document);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches("textarea, input")) attach(n); else if (n.querySelectorAll) scan(n); } }); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
  window.DesksDictate = { scan: scan, supported: !!SR, stop: stop };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
