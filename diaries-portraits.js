(function () {
  "use strict";
  var ROOT = "", list = window.GREMLINS || [], row = document.getElementById("g-row"), card = document.getElementById("g-bio"), open = null;
  list.forEach(function (g) {
    var li = document.createElement("li"), b = document.createElement("button"), img = document.createElement("img"), n = document.createElement("span");
    b.type = "button"; b.className = "g-btn"; b.id = "g-" + g.id; b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", "g-bio");
    img.src = ROOT + g.portrait; img.alt = ""; img.width = 84; img.height = 84; img.loading = "lazy";
    n.textContent = g.name; b.appendChild(img); b.appendChild(n);
    b.addEventListener("click", function () { show(open === g.id ? null : g); });
    li.appendChild(b); row.appendChild(li);
  });
  function show(g) {
    if (open) document.getElementById("g-" + open).setAttribute("aria-expanded", "false");
    open = g ? g.id : null;
    if (!g) { card.hidden = true; card.textContent = ""; return; }
    document.getElementById("g-" + g.id).setAttribute("aria-expanded", "true");
    card.textContent = "";
    var h = document.createElement("h3"), p = document.createElement("p");
    h.textContent = g.name; p.textContent = g.bio; card.appendChild(h); card.appendChild(p); card.hidden = false;
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && open) { var b = document.getElementById("g-" + open); show(null); b.focus(); }
  });
})();
