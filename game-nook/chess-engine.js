/* Gremlin Chess engine: a small homemade negamax + alpha-beta with a quiescence search, piece-square tables and
   per-gremlin personalities. Runs as a classic Web Worker (importScripts chess.js) and also loads in Node for tests.
   Message in:  { id, fen, who, hint }   Message out: { id, move: {from,to,promotion}, depth, nodes, ms } */
(function (root) {
  "use strict";
  if (typeof root.ChessJS === "undefined" && typeof importScripts === "function") importScripts("vendor/chess.js");
  var Chess = root.ChessJS.Chess;
  var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // piece-square tables from white's point of view, rank 8 first (index 0 = a8)
  var PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };
  // personalities: depth = full-width plies, q = quiescence on, noise = random centipawns added at the root,
  // slip = chance of picking a random decent move instead of the best, time = think cap (ms)
  var WHO = {
    noodle:  { depth: 0, random: true },
    pip:     { depth: 1, q: false, noise: 120, slip: 0.25, attack: 1.6, time: 600 },
    dot:     { depth: 2, q: false, noise: 40, slip: 0.12, guard: 1.4, time: 900 },
    moth:    { depth: 2, q: true, noise: 60, slip: 0.15, time: 1000 },
    vesper:  { depth: 3, q: true, noise: 12, slip: 0.03, book: true, time: 1400 },
    grimble: { depth: 4, q: true, noise: 0, slip: 0, book: true, time: 1600 }
  };
  var BOOK = { // a few classic first replies (FEN without move counters -> SAN choices)
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e4", "d4", "Nf3", "c4"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -": ["e5", "c5", "e6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -": ["d5", "Nf6"],
    "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -": ["e5", "Nf6"],
    "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -": ["d5", "Nf6"]
  };
  var IDX = {}; "abcdefgh".split("").forEach(function (f, x) { for (var r = 1; r <= 8; r++) IDX[f + r] = (8 - r) * 8 + x; });

  function evaluate(g, P) {   // from the side to move's view
    var b = g.board(), s = 0, i, j, sq, v, idx;
    for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) {
      sq = b[i][j]; if (!sq) continue;
      idx = sq.color === "w" ? i * 8 + j : (7 - i) * 8 + j;
      v = VAL[sq.type] + PST[sq.type][idx];
      s += sq.color === "w" ? v : -v;
    }
    return g.turn() === "w" ? s : -s;
  }
  function order(moves) {
    return moves.sort(function (a, b) { return score(b) - score(a); });
    function score(m) { return (m.captured ? 10 * VAL[m.captured] - VAL[m.piece] + 1000 : 0) + (m.promotion ? 800 : 0); }
  }
  var MATE = 100000, deadline = 0, nodes = 0, stop = false;
  function quiesce(g, alpha, beta, P, d) {
    nodes++; if ((nodes & 127) === 0 && Date.now() > deadline) stop = true; if (stop) return 0;
    var stand = evaluate(g, P);
    if (stand >= beta) return beta; if (alpha < stand) alpha = stand; if (d > 4) return alpha;
    var caps = order(g.moves({ verbose: true }).filter(function (m) { return m.captured || m.promotion; }));
    for (var i = 0; i < caps.length; i++) {
      g.move(caps[i]); var sc = -quiesce(g, -beta, -alpha, P, d + 1); g.undo();
      if (stop) return 0; if (sc >= beta) return beta; if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function search(g, depth, alpha, beta, P, ply) {
    nodes++;
    if ((nodes & 255) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    var moves = g.moves({ verbose: true });
    if (!moves.length) return g.inCheck() ? -MATE + ply : 0;
    if (g.isDraw()) return 0;
    if (depth <= 0) return P.q ? quiesce(g, alpha, beta, P, 0) : evaluate(g, P);
    order(moves);
    for (var i = 0; i < moves.length; i++) {
      g.move(moves[i]); var sc = -search(g, depth - 1, -beta, -alpha, P, ply + 1); g.undo();
      if (stop) return 0;
      if (sc >= beta) return beta; if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function pick(m) { return { from: m.from, to: m.to, promotion: m.promotion }; }

  function think(fen, who, opts) {
    opts = opts || {}; var P = WHO[who] || WHO.moth, t0 = Date.now(), g = new Chess(fen), moves = g.moves({ verbose: true }), rnd = opts.random || Math.random;
    if (!moves.length) return { move: null };
    if (opts.hint) P = { depth: 3, q: true, noise: 0, slip: 0, time: 1200 };
    if (P.random) {   // Noodle: random, but captures look like snacks half the time
      var caps = moves.filter(function (m) { return m.captured; });
      var m = caps.length && rnd() < 0.5 ? caps[Math.floor(rnd() * caps.length)] : moves[Math.floor(rnd() * moves.length)];
      return { move: pick(m), depth: 0, nodes: 0, ms: Date.now() - t0 };
    }
    if (P.book) {
      var key = fen.split(" ").slice(0, 4).join(" "), bk = BOOK[key];
      if (bk) { var san = bk[Math.floor(rnd() * bk.length)], bm = moves.filter(function (m) { return m.san === san; })[0]; if (bm) return { move: pick(bm), depth: "book", nodes: 0, ms: Date.now() - t0 }; }
    }
    deadline = t0 + (P.time || 1200); nodes = 0; stop = false;
    order(moves);
    var scored = moves.map(function (m) { return { m: m, s: 0 }; }), done = 0;
    for (var d = 1; d <= P.depth; d++) {   // iterative deepening; keep the last fully finished depth
      var cur = [], alpha = -MATE - 1;
      for (var i = 0; i < scored.length; i++) {
        var mv = scored[i].m; g.move(mv);
        var s = -search(g, d - 1, -MATE - 1, -alpha + (P.noise || 0) + 1, P, 1); g.undo();
        if (stop) break;
        if (P.attack && mv.captured) s += 25 * P.attack;           // Pip loves a capture
        if (P.attack && /\+/.test(mv.san)) s += 30 * P.attack;     // and a check
        cur.push({ m: mv, s: s }); if (s > alpha) alpha = s;
      }
      if (stop) { if (d === 1 && cur.length) { cur.sort(function (a, b) { return b.s - a.s; }); scored = cur; done = 1; } break; }
      cur.sort(function (a, b) { return b.s - a.s; }); scored = cur; done = d;
    }
    if (!done) scored = moves.map(function (m) { return { m: m, s: 0 }; });
    // personality: noise and the occasional slip, but never miss a mate in one and never slip into a lost-king score
    var best = scored[0];
    if (P.noise) {
      var noisy = scored.map(function (x) { return { m: x.m, s: x.s + (x.s > MATE / 2 ? 0 : (rnd() * 2 - 1) * P.noise) }; });
      noisy.sort(function (a, b) { return b.s - a.s; }); if (best.s < MATE / 2) best = noisy[0];
    }
    if (P.slip && best.s < MATE / 2 && rnd() < P.slip) {
      var ok = scored.filter(function (x) { return x.s > -MATE / 2; }).slice(0, Math.max(2, Math.ceil(scored.length / 2)));
      if (ok.length) best = ok[Math.floor(rnd() * ok.length)];
    }
    return { move: pick(best.m), depth: done, nodes: nodes, ms: Date.now() - t0 };
  }
  root.GremlinChessEngine = { think: think, WHO: WHO };
  if (typeof module !== "undefined" && module.exports) module.exports = root.GremlinChessEngine;
  if (typeof importScripts === "function" && typeof onmessage !== "undefined") {
    root.onmessage = function (e) { var d = e.data || {}; var r; try { r = think(d.fen, d.who, { hint: d.hint }); } catch (err) { r = { move: null, error: String(err) }; } r.id = d.id; postMessage(r); };
  }
})(typeof self !== "undefined" ? self : globalThis);
