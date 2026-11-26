/* Client intake & waiver flows + Explore account switcher (local preview).
   Nothing on the iPad form is saved or sent. Upload & Quick pre-form run in
   mock mode unless window.DESKS_ENTRY_CONFIG.USE_LIVE_SUPABASE is true. */
(function () {
  "use strict";

  var CFG = window.DESKS_ENTRY_CONFIG || { USE_LIVE_SUPABASE: false };


  function loadSupabase() {
    return new Promise(function (ok, bad) {
      var C = window.DESKS_ACCESS || {};
      if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) {
        bad(new Error("Live connection is not configured on this page."));
        return;
      }
      function make() { ok(window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY)); }
      if (window.supabase) return make();
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.async = true;
      s.onload = make;
      s.onerror = function () { bad(new Error("Could not load the live connection library.")); };
      document.head.appendChild(s);
    });
  }

  function ymdToday() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  var MAX_PDF_BYTES = 10 * 1024 * 1024; /* ~10 MB */

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ */
  /* 1. Signature pads (In the office / iPad)                           */
  /* ------------------------------------------------------------------ */
  var sigPads = [];

  function initSigPad(canvas) {
    if (!canvas) return null;
    var ctx = canvas.getContext("2d");
    var drawing = false;
    var pointerId = null;
    var hasStroke = false;
    var last = null;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(rect.width * dpr);
      var h = Math.round(rect.height * dpr);
      if (canvas.width === w && canvas.height === h) return;
      /* Save existing drawing if any */
      var snap = hasStroke ? canvas.toDataURL() : null;
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#1A1A18";
      if (snap) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
        img.src = snap;
      }
    }

    function pt(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      resize();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      pointerId = e.pointerId;
      last = pt(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x + 0.01, last.y + 0.01);
      ctx.stroke();
      hasStroke = true;
    });

    canvas.addEventListener("pointermove", function (e) {
      if (!drawing || e.pointerId !== pointerId) return;
      e.preventDefault();
      var p = pt(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });

    function syncPrint() {
      var wrap = canvas.parentElement;
      if (!wrap) return;
      var pimg = wrap.querySelector('.sig-print-img');
      if (!pimg) {
        pimg = document.createElement('img');
        pimg.className = 'sig-print-img';
        pimg.alt = '';
        wrap.insertBefore(pimg, canvas);
      }
      pimg.src = hasStroke ? canvas.toDataURL('image/png') : '';
    }
    function end(e) {
      if (!drawing || e.pointerId !== pointerId) return;
      drawing = false;
      pointerId = null;
      last = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      syncPrint();
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    function clear() {
      var rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width || canvas.width, rect.height || canvas.height);
      hasStroke = false;
      syncPrint();
    }

    function drawTyped(name) {
      resize();
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      var size = Math.min(56, Math.max(30, rect.height * 0.46));
      ctx.font = "600 " + size + 'px "Dancing Script", "Segoe Script", cursive';
      ctx.fillStyle = "#1A1A18";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText(name, 16, rect.height * 0.7);
      hasStroke = true;
      syncPrint();
    }

    var pad = { canvas: canvas, resize: resize, clear: clear, syncPrint: syncPrint, drawTyped: drawTyped, hasStroke: function () { return hasStroke; }, resetAll: clear };
    sigPads.push(pad);
    return pad;
  }

  function todayStamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getMonth() + 1) + "/" + p(d.getDate()) + "/" + d.getFullYear();
  }
  function stampDate(block) {
    var id = block && block.getAttribute("data-date");
    var input = id && $(id);
    if (input && !String(input.value || "").trim()) input.value = todayStamp();
  }

  function initSigBlock(block) {
    var canvas = block.querySelector(".sig-canvas");
    if (!canvas) return;
    var pad = initSigPad(canvas);
    var fingerBtn = block.querySelector('[data-mode="finger"]');
    var typeBtn = block.querySelector('[data-mode="type"]');
    var fingerPanel = block.querySelector(".sig-finger");
    var typePanel = block.querySelector(".sig-type");
    var typeInput = block.querySelector(".sig-type-input");
    var preview = block.querySelector(".sig-type-preview");
    var clearBtn = block.querySelector(".sig-clear");
    var mode = "finger";

    function setMode(m, keep) {
      mode = m;
      if (fingerBtn) fingerBtn.setAttribute("aria-pressed", m === "finger" ? "true" : "false");
      if (typeBtn) typeBtn.setAttribute("aria-pressed", m === "type" ? "true" : "false");
      if (fingerPanel) fingerPanel.hidden = m !== "finger";
      if (typePanel) typePanel.hidden = m !== "type";
      if (m === "finger") {
        if (!keep) {
          pad.clear();
          if (typeInput) typeInput.value = "";
          if (preview) preview.textContent = "";
        }
        window.requestAnimationFrame(function () { pad.resize(); });
      } else {
        renderTyped();
      }
    }

    function renderTyped() {
      var name = String((typeInput && typeInput.value) || "").trim();
      if (preview) preview.textContent = name;
      if (!name) {
        pad.clear();
        return;
      }
      function draw() {
        pad.drawTyped(name);
        stampDate(block);
      }
      if (document.fonts && document.fonts.load) {
        document.fonts.load('48px "Dancing Script"').then(draw).catch(draw);
      } else draw();
    }

    if (fingerBtn) fingerBtn.addEventListener("click", function () { setMode("finger", false); });
    if (typeBtn) typeBtn.addEventListener("click", function () {
      setMode("type", true);
      if (typeInput) typeInput.focus();
    });
    if (typeInput) typeInput.addEventListener("input", renderTyped);
    if (clearBtn) clearBtn.addEventListener("click", function () {
      pad.clear();
    });

    /* After a finger stroke ends, stamp today's date if the date field is empty. */
    canvas.addEventListener("pointerup", function () {
      if (pad.hasStroke()) stampDate(block);
    });

    pad.resetAll = function () {
      if (typeInput) typeInput.value = "";
      if (preview) preview.textContent = "";
      pad.clear();
      setMode("finger", true);
    };
    pad.block = block;
  }

  function padsIn(form) {
    return sigPads.filter(function (p) { return form && form.contains(p.canvas); });
  }

  function setupPrintableForm(formId, printId, clearId, statusId) {
    var form = $(formId);
    if (!form) return;
    var printBtn = $(printId);
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        padsIn(form).forEach(function (p) { p.syncPrint && p.syncPrint(); });
        window.print();
      });
    }
    var clearBtn = $(clearId);
    var clearStatus = statusId && $(statusId);
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        form.reset();
        padsIn(form).forEach(function (p) { p.resetAll ? p.resetAll() : p.clear(); });
        if (clearStatus) {
          clearStatus.textContent = "Form cleared. Nothing was saved or sent.";
          window.setTimeout(function () { clearStatus.textContent = ""; }, 4000);
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  function setupSignatures() {
    document.querySelectorAll(".sig-block").forEach(initSigBlock);
    setupPrintableForm("ipad-form", "ipad-print", "ipad-clear", "ipad-clear-status");
    setupPrintableForm("waiver-form", "waiver-print", "waiver-clear", "waiver-clear-status");
    window.addEventListener("beforeprint", function () {
      sigPads.forEach(function (p) { p.syncPrint && p.syncPrint(); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 2. Download forms + Upload filled PDF (honeypot only)             */
  /* ------------------------------------------------------------------ */

  function checkPdfMagic(file) {
    return new Promise(function (resolve) {
      if (!file || !file.slice) { resolve(false); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var bytes = new Uint8Array(reader.result || []);
        resolve(bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
      };
      reader.onerror = function () { resolve(false); };
      reader.readAsArrayBuffer(file.slice(0, 5));
    });
  }

  function setupUploadForm() {
    var form = $("upload-form"), fileInput = $("upload-pdf"), err = $("upload-err");
    var fileInfo = $("upload-file-info"), okBox = $("upload-success"), another = $("upload-another");
    if (!form || !fileInput) return;

    fileInput.addEventListener("change", function () {
      err.textContent = "";
      var f = fileInput.files && fileInput.files[0];
      if (!f) { fileInfo.textContent = ""; return; }
      var mb = (f.size / (1024 * 1024)).toFixed(2);
      fileInfo.textContent = "Selected: " + f.name + " (" + mb + " MB)";
    });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      err.textContent = "";

      var hp = $("hp-upload-website");
      if (hp && hp.value.trim()) {
        /* Silently treat bot honeypot hits as finished without sending. */
        form.hidden = true;
        okBox.hidden = false;
        return;
      }

      var f = fileInput.files && fileInput.files[0];
      if (!f) {
        err.textContent = "Please choose a filled PDF file to upload.";
        fileInput.focus();
        return;
      }
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
        err.textContent = "PDF files only, please (.pdf).";
        fileInput.focus();
        return;
      }
      if (f.size > MAX_PDF_BYTES) {
        err.textContent = "That PDF is larger than 10 MB. Please choose a smaller file.";
        fileInput.focus();
        return;
      }
      var isPdf = await checkPdfMagic(f);
      if (!isPdf) {
        err.textContent = "That file does not look like a valid PDF. Please choose a real PDF file.";
        fileInput.focus();
        return;
      }
      if (!CFG.USE_LIVE_SUPABASE) {
        form.hidden = true;
        okBox.hidden = false;
        return;
      }

      try {
        var c = await loadSupabase();
        var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {
            var r = Math.random() * 16 | 0;
            return (ch === "x" ? r : (r & 0x3 | 0x8)).toString(16);
          })
        );
        var path = "submissions/" + ymdToday() + "/" + id + ".pdf";
        var email = ($("upload-email") && $("upload-email").value || "").trim();
        var opts = { contentType: "application/pdf", upsert: false };
        if (email) opts.metadata = { email: email };
        var up = await c.storage.from("intake-uploads").upload(path, f, opts);
        if (up.error) throw up.error;
        form.hidden = true;
        okBox.hidden = false;
      } catch (ex) {
        err.textContent = (ex && ex.message) ? ex.message : "The upload could not be sent. Please try again, or bring a printed copy.";
      }
    });

    if (another) {
      another.addEventListener("click", function () {
        form.reset();
        fileInfo.textContent = "";
        err.textContent = "";
        form.hidden = false;
        okBox.hidden = true;
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 3. Quick pre-form (online)                                         */
  /* ------------------------------------------------------------------ */
  function setupPreform() {
    var form = $("preform"), err = $("preform-err"), okBox = $("preform-success"), again = $("preform-another");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      err.textContent = "";

      var hp = $("hp-preform-website");
      if (hp && hp.value.trim()) {
        form.hidden = true;
        okBox.hidden = false;
        return;
      }

      var fn = ($("pf-first").value || "").trim();
      var why = ($("pf-why").value || "").trim();
      if (!fn) {
        err.textContent = "Please enter your first name.";
        $("pf-first").focus();
        return;
      }
      if (!why) {
        err.textContent = "Please tell Bryan briefly what brings you in.";
        $("pf-why").focus();
        return;
      }

      if (!CFG.USE_LIVE_SUPABASE) {
        form.hidden = true;
        okBox.hidden = false;
        return;
      }

      try {
        var c = await loadSupabase();
        var ins = await c.from("intake_preform").insert({
          first_name: fn,
          brings_you_in: why,
          conditions_surgeries: ($("pf-cond") && $("pf-cond").value || "").trim(),
          hardware: ($("pf-hw") && $("pf-hw").value || "").trim(),
          medications_history: ($("pf-meds") && $("pf-meds").value || "").trim(),
          allergies: ($("pf-allergy") && $("pf-allergy").value || "").trim()
        });
        if (ins.error) throw ins.error;
        form.hidden = true;
        okBox.hidden = false;
      } catch (ex) {
        err.textContent = (ex && ex.message) ? ex.message : "That note could not be sent. Please try again, or tell Bryan in person.";
      }
    });

    if (again) {
      again.addEventListener("click", function () {
        form.reset();
        err.textContent = "";
        form.hidden = false;
        okBox.hidden = true;
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. Explore door: Explore as guest vs Make an account               */
  /* ------------------------------------------------------------------ */
  var ACCT_PREVIEW_KEY = "desksExploreAccount.preview.v1";

  function setupExploreModes() {
    var tabGuest = $("exp-tab-guest"), tabAcct = $("exp-tab-acct");
    var panelGuest = $("exp-panel-guest"), panelAcct = $("exp-panel-acct");
    var acctForm = $("exp-acct-form"), acctErr = $("exp-acct-err"), acctOk = $("exp-acct-success");
    var acctReset = $("exp-acct-reset"), guestBanner = $("exp-guest-name");
    if (!tabGuest || !tabAcct) return;

    function refreshGuestLine() {
      if (!guestBanner) return;
      var name = "";
      try {
        var g = JSON.parse(localStorage.getItem("desksGuest.v1") || "null");
        if (g && g.name) name = g.name;
      } catch (e) {}
      guestBanner.textContent = name
        ? ("Exploring as guest (" + name + "). No account needed — pick any open tile below.")
        : "Exploring as guest. No account needed — pick any open tile below.";
    }

    function setMode(mode) {
      var isAcct = mode === "acct";
      tabGuest.setAttribute("aria-pressed", isAcct ? "false" : "true");
      tabAcct.setAttribute("aria-pressed", isAcct ? "true" : "false");
      panelGuest.hidden = isAcct;
      panelAcct.hidden = !isAcct;
      refreshGuestLine();
    }

    tabGuest.addEventListener("click", function () { setMode("guest"); });
    tabAcct.addEventListener("click", function () { setMode("acct"); });

    if (acctForm) {
      acctForm.addEventListener("submit", function (e) {
        e.preventDefault();
        acctErr.textContent = "";

        var hp = $("hp-acct-website");
        if (hp && hp.value.trim()) {
          acctForm.hidden = true;
          acctOk.hidden = false;
          return;
        }

        var name = ($("ea-name").value || "").trim();
        var email = ($("ea-email").value || "").trim();
        var pw = $("ea-pw").value || "";
        var note = ($("ea-note").value || "").trim();
        var bizLead = !!($("ea-biz") && $("ea-biz").checked);

        if (!name) {
          acctErr.textContent = "Please enter your name.";
          $("ea-name").focus();
          return;
        }
        if (!email || email.indexOf("@") < 1 || email.indexOf(".") < 3) {
          acctErr.textContent = "Please enter a valid email address.";
          $("ea-email").focus();
          return;
        }
        if (pw.length < 12) {
          acctErr.textContent = "Please choose a password of at least 12 characters.";
          $("ea-pw").focus();
          return;
        }

        var thanks = bizLead
          ? ("Thanks, " + name + ". Your account request is waiting for Bryan's approval, and your interest in business tools has been flagged so Bryan can review and grant permissions.")
          : ("Thanks, " + name + ". Your account request is waiting for Bryan's approval. You can keep exploring as a guest in the meantime.");

        function showOk(extra) {
          var msg = $("exp-acct-summary");
          if (msg) msg.textContent = extra || thanks;
          acctForm.hidden = true;
          acctOk.hidden = false;
        }

        if (!CFG.USE_LIVE_SUPABASE) {
          try {
            localStorage.setItem(ACCT_PREVIEW_KEY, JSON.stringify({
              name: name,
              email: email,
              note: note,
              business_tools_interest: bizLead,
              status: "pending",
              created_at: new Date().toISOString()
            }));
          } catch (err) {}
          showOk();
          return;
        }

        (async function () {
          try {
            if (!(window.DesksAccess && DesksAccess.api && DesksAccess.api.signUp)) {
              throw new Error("Sign-up is not available on this page. Please use the Sign in link.");
            }
            var r = await DesksAccess.api.signUp(name, email, pw, note, bizLead);
            if (r && r.needsConfirm) {
              showOk(thanks + " Please check your email to confirm the account before Bryan can approve it.");
            } else {
              showOk();
            }
          } catch (ex) {
            acctErr.textContent = (ex && ex.message) ? ex.message : "The account could not be created. Please try again, or use Sign in.";
          }
        })();
      });
    }

    if (acctReset) {
      acctReset.addEventListener("click", function () {
        try { localStorage.removeItem(ACCT_PREVIEW_KEY); } catch (err) {}
        acctForm.reset();
        acctErr.textContent = "";
        acctForm.hidden = false;
        acctOk.hidden = true;
      });
    }

    document.addEventListener("desks-entry-stage", function (ev) {
      if (ev && ev.detail && ev.detail.stage === "explore") refreshGuestLine();
    });
    refreshGuestLine();
  }

  /* ------------------------------------------------------------------ */
  /* 5. Stage activation hooks                                          */
  /* ------------------------------------------------------------------ */
  function setupStageHooks() {
    document.addEventListener("desks-entry-stage", function (ev) {
      var st = ev && ev.detail && ev.detail.stage;
      if (st === "client-ipad" || st === "client-waiver") {
        window.requestAnimationFrame(function () {
          sigPads.forEach(function (p) { p.resize(); });
        });
      }
    });
  }

  function bindAll() {
    setupSignatures();
    setupUploadForm();
    setupPreform();
    setupExploreModes();
    setupStageHooks();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindAll);
  else bindAll();
})();
