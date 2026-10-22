/* ==========================================================================
   THE EXCHANGE — LED wall renderer.
   One 16:9 wall, eleven looks, each taken from the deck's render series.
   Never mutates state; it only listens to the console.
   ========================================================================== */
(function () {
  "use strict";

  var EX = window.EX, CFG = EX.MODEL, M = EX.Model;
  var BOARD_SCENES = { home: 1, preopen: 1, board: 1 };
  var RESULT_HOLD = 2900; // ms the +50 callout owns the wall before the line moves
  var GROW_MS = 1500;

  var el = {}, state = null, seen = { fx: 0, ringFor: 0, cdReveal: 0, cdTick: -1, cdStart: 0 };
  var preview = /[?&]preview=1/.test(location.search);

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function fmt(n) { return n.toFixed(2); }

  // ---- monogram: S over P with a scroll flourish (render 0 crest) --------
  function monogram(id) {
    return '<svg class="mono" viewBox="0 0 220 180" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fff3c8"/><stop offset=".42" stop-color="#ecc966"/>' +
      '<stop offset=".7" stop-color="#b3862a"/><stop offset="1" stop-color="#f3d684"/></linearGradient></defs>' +
      '<text x="84" y="108" text-anchor="middle" font-family="Cinzel, serif" font-weight="600" font-size="128" fill="url(#' + id + ')">S</text>' +
      '<text x="134" y="140" text-anchor="middle" font-family="Cinzel, serif" font-weight="600" font-size="108" fill="url(#' + id + ')">P</text>' +
      '<path d="M18 160 C48 160 58 146 80 150 C96 153 94 168 81 166 C70 164 73 151 89 155 L131 155 C147 151 150 164 139 166 C126 168 124 153 140 150 C162 146 172 160 202 160" ' +
      'fill="none" stroke="url(#' + id + ')" stroke-width="3.2" stroke-linecap="round"/>' +
      '<circle cx="110" cy="155" r="4" fill="url(#' + id + ')"/></svg>';
  }

  function stockHTML(side) {
    var k = side === "groom" ? "G" : "B";
    return '<article class="stock stock--' + side + '">' +
      '<div class="stock__chart"><canvas id="chart' + k + '"></canvas></div>' +
      '<div class="stock__name" id="name' + k + '"></div>' +
      '<div class="stock__quote"><span class="q-arrow" id="arr' + k + '">▲</span>' +
      '<span class="q-price" id="price' + k + '">0.00</span><span class="q-chg" id="chg' + k + '"></span></div>' +
      '</article>';
  }

  function build(root) {
    root.innerHTML =
      '<div class="stage"><div class="wall" id="wall" data-scene="home">' +

      // ---- render 0: the stock-runner board -----------------------------
      '<section class="board" id="board">' +
        '<div class="tape"><div class="tape__track" id="tapeTop"></div></div>' +
        '<div class="main">' + stockHTML("groom") +
          '<div class="crest"><div class="crest__frame">' + monogram("mgBoard") +
            '<div class="crest__names"><span id="cA"></span><span class="amp">&amp;</span><span id="cB"></span></div>' +
            '<div class="crest__event"><i></i><span id="cEv"></span><i></i></div>' +
          '</div></div>' + stockHTML("bride") +
        '</div>' +
        '<div class="tape"><div class="tape__track tape__track--rev" id="tapeBot"></div></div>' +
      '</section>' +

      // ---- render 2A/2B: gong station LED sign ---------------------------
      '<section class="scene sc-bell" id="scBell">' +
        '<div class="bell__eyebrow">OPENING BELL</div>' +
        '<div class="ledframe"><div class="led">' +
          '<div class="led__line" id="bellL1"></div><div class="led__line led__line--blink">MARKET OPENING SOON</div>' +
        '</div></div>' +
        '<div class="plaque"><small>THE</small>EXCHANGE</div>' +
      '</section>' +

      // ---- 3A: countdown — a gold ring sweeps each second ----------------
      '<section class="scene sc-count" id="scCount">' +
        '<div class="cd" id="cd"><svg class="cd__ring" viewBox="0 0 200 200"><circle class="cd__track" cx="100" cy="100" r="94"/>' +
          '<circle class="cd__arc" id="cdArc" cx="100" cy="100" r="94"/></svg><div class="cd__num" id="cdNum"></div></div>' +
        '<div class="reveal" id="cdReveal"><span class="hair"></span>' +
          '<span class="mask"><span class="eyebrow">Now trading</span></span>' +
          '<span class="mask"><span class="cd__name" id="cdName"></span></span><span class="hair"></span></div>' +
      '</section>' +

      // ---- 3B/4B: entry — the wall parts on a gold seam -------------------
      '<section class="scene sc-entry" id="scEntry">' +
        '<div class="en__half en__half--l"></div><div class="en__half en__half--r"></div><div class="en__seam"></div>' +
        '<div class="reveal reveal--entry"><span class="mask"><span class="eyebrow">Now entering</span></span>' +
          '<span class="mask"><span class="en__name" id="entName"></span></span><span class="hair"></span>' +
          '<span class="mask"><span class="en__quote" id="entQuote"></span></span></div>' +
      '</section>' +

      // ---- 6: performance — this stock's own line, full wall ---------------
      '<section class="scene sc-perform" id="scPerform">' +
        '<svg class="pf__chart" viewBox="0 0 1600 900" preserveAspectRatio="none"><defs>' +
          '<linearGradient id="pfFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pf__s0"/><stop offset="1" class="pf__s1"/></linearGradient></defs>' +
          '<path class="pf__area" id="pfArea"/><path class="pf__line" id="pfLine" pathLength="1"/></svg>' +
        '<div class="pf__card"><span class="mask"><span class="eyebrow" id="pfRound"></span></span>' +
          '<span class="mask"><span class="pf__name" id="pfName"></span></span>' +
          '<span class="mask"><span class="pf__quote" id="pfQuote"></span></span></div>' +
      '</section>' +

      // ---- 7: live vote ----------------------------------------------------
      '<section class="scene sc-vote" id="scVote">' +
        '<div class="reveal"><span class="mask"><span class="eyebrow">Live vote</span></span>' +
          '<span class="mask"><span class="vt__round gold" id="vtRound"></span></span><span class="hair"></span>' +
          '<div class="vt__sides"><div class="vt__side vt__side--g"><i></i><b>Red band</b><span id="vtG"></span></div>' +
            '<div class="vt__div"></div>' +
            '<div class="vt__side vt__side--b"><i></i><b>Green band</b><span id="vtB"></span></div></div></div>' +
      '</section>' +

      // ---- round result: the +50 call --------------------------------------
      '<section class="scene sc-result" id="scResult">' +
        '<div class="reveal"><span class="mask"><span class="eyebrow" id="resK"></span></span>' +
          '<span class="mask"><span class="rs__pts gold" id="resPts">+50</span></span><span class="hair"></span>' +
          '<span class="mask"><span class="rs__name" id="resName"></span></span></div>' +
      '</section>' +

      // ---- 8: stock merger -------------------------------------------------
      '<section class="scene sc-merger" id="scMerger">' +
        '<div class="mg__track"><span class="mg__co mg__co--l" id="mgL"></span><span class="mg__co mg__co--r" id="mgR"></span></div>' +
        '<div class="reveal reveal--merger"><span class="mg__mono">' + monogram("mgMerger") + '</span>' +
          '<span class="mask"><span class="mg__title gold">Stock Merger</span></span><span class="hair"></span>' +
          '<span class="mask"><span class="mg__val"><span>SP COMPOSITE</span><b id="mgVal">0.00</b></span></span></div>' +
      '</section>' +

      // ---- 9: final act ----------------------------------------------------
      '<section class="scene sc-finale" id="scFinale">' +
        '<img class="fn__photo" src="media/couple.jpg" alt="" onerror="this.remove()">' +
        '<div class="reveal reveal--finale"><span class="fn__mono">' + monogram("mgFinale") + '</span>' +
          '<span class="mask"><span class="fn__names gold" id="fnNames"></span></span>' +
          '<span class="mask"><span class="fn__sub">the two sides, now one</span></span><span class="hair"></span>' +
          '<span class="mask"><span class="eyebrow" id="fnEv"></span></span></div>' +
      '</section>' +

      // ---- standby / handed to VJ ----------------------------------------
      '<section class="scene sc-standby" id="scStandby"><div class="plaque plaque--lg"><small>THE</small>EXCHANGE</div></section>' +

      '</div></div>';

    ["wall", "board", "tapeTop", "tapeBot", "chartG", "chartB", "nameG", "nameB", "arrG", "arrB", "priceG", "priceB",
     "chgG", "chgB", "cA", "cB", "cEv", "bellL1", "cd", "cdArc", "cdNum", "cdReveal", "cdName", "entName", "entQuote",
     "pfRound", "pfName", "pfQuote", "pfArea", "pfLine",
     "vtRound", "vtG", "vtB", "resK", "resPts", "resName", "mgL", "mgR", "mgVal", "fnNames", "fnEv",
     "scBell", "scCount", "scEntry", "scPerform", "scVote", "scResult", "scMerger", "scFinale", "scStandby"
    ].forEach(function (id) { el[id] = document.getElementById(id); });
  }

  // ---- ticker -------------------------------------------------------------
  // Render 0 order: GROOM CO quote · message · BRIDE CO quote · message …
  function tapeHTML(s) {
    var tape = s.tape || {}, items = (tape.items || []).filter(function (x) { return x && x.trim(); });
    var gv = series(s, "groom"), bv = series(s, "bride");
    function quote(code, sv, cls) {
      var v = sv.length ? sv[sv.length - 1] : 0, d = sv.length ? v - sv[0] : 0;
      var arrow = d > 0 ? "▲" : d < 0 ? "▼" : "◆";
      return '<span class="tk ' + cls + '">' + esc(code) + ' ' + arrow + ' ' + v.toFixed(1) + '</span>';
    }
    function msg(i) { return items.length ? '<span class="tk tk--gold">' + esc(items[i % items.length].toUpperCase()) + '</span>' : ""; }
    var one = "";
    if (tape.quotes !== false) {
      one = quote(s.groom.code, gv, "tk--red") + msg(0) + quote(s.bride.code, bv, "tk--green") + msg(1);
      for (var i = 2; i < items.length; i++) one += msg(i);
    } else {
      for (var j = 0; j < Math.max(1, items.length); j++) one += msg(j) + '<span class="tk tk--gold tk--sep">◆</span>';
    }
    if (s.round > 0 && tape.quotes !== false) one += '<span class="tk tk--gold">ROUND ' + s.round + ' OF ' + CFG.rounds + '</span>';
    return one + one + one + one;
  }

  // Swap ticker content without restarting the crawl from zero.
  var tapeEpoch = performance.now(), lastTape = "";
  function setTape(s) {
    var html = tapeHTML(s), dur = Math.max(12, (s.tape && s.tape.speed) || 48);
    var key = html + dur;
    if (key === lastTape) return;
    lastTape = key;
    var el0 = (performance.now() - tapeEpoch) / 1000;
    [[el.tapeTop, dur], [el.tapeBot, dur * 1.12]].forEach(function (p) {
      p[0].innerHTML = html;
      p[0].style.animationDuration = p[1] + "s";
      p[0].style.animationDelay = -(el0 % p[1]) + "s";
    });
  }

  // Home shows the attract curves until the real market opens.
  function series(s, side) {
    var real = s[side].series;
    if (real.length) return real;
    if (s.scene === "home") return EX.demoSeries(side === "groom" ? 0 : 1.4);
    return [];
  }

  // ---- state -> DOM -------------------------------------------------------
  function apply(s) {
    state = s;
    var sc = s.scene;
    el.wall.setAttribute("data-scene", sc);
    el.wall.setAttribute("data-side", s.side || "");

    el.nameG.textContent = s.groom.name; el.nameB.textContent = s.bride.name;
    el.cA.textContent = s.couple.a; el.cB.textContent = s.couple.b; el.cEv.textContent = s.couple.event;
    setTape(s);

    var co = s.side ? s[s.side] : s.groom;
    el.bellL1.textContent = co.name.replace(/\.$/, "") + " — 0.0";
    el.cdName.textContent = co.name;
    el.entName.textContent = co.name;
    el.entQuote.innerHTML = co.series.length ? quoteLine(co) : co.code + " · LISTING TONIGHT";
    el.pfName.textContent = co.name;
    el.pfRound.textContent = "Round " + Math.min(CFG.rounds, s.round + 1) + " · On stage";
    el.pfQuote.innerHTML = co.series.length ? quoteLine(co) : "";
    if (sc === "perform") perfChart(co);
    el.vtRound.textContent = "Round " + Math.min(CFG.rounds, s.round + 1);
    el.vtG.textContent = s.groom.name; el.vtB.textContent = s.bride.name;
    el.mgL.textContent = s.groom.name; el.mgR.textContent = s.bride.name;
    el.fnNames.textContent = s.couple.a + " & " + s.couple.b;
    el.fnEv.textContent = s.couple.event;

    toggle(el.board, !!BOARD_SCENES[sc]);
    toggle(el.scBell, sc === "bell");
    toggle(el.scCount, sc === "countdown");
    toggle(el.scEntry, sc === "entry");
    toggle(el.scPerform, sc === "perform");
    toggle(el.scVote, sc === "vote");
    toggle(el.scMerger, sc === "merger");
    toggle(el.scFinale, sc === "finale");
    toggle(el.scStandby, sc === "standby");

    // one-shot moments
    if (s.fx && s.fx.seq !== seen.fx) {
      seen.fx = s.fx.seq;
      var fresh = EX.now() - (s.fx.ts || 0) < 4000;
      if (fresh && s.fx.type === "result") playResult(s);
    }
    if (sc === "merger" && s.fused != null && seen.mgFrom !== s.fx.seq) { seen.mgFrom = s.fx.seq; countUp(el.mgVal, s.fused, 2400, 2600); }
  }

  function quoteLine(co) {
    var sv = co.series, v = sv[sv.length - 1], d = v - sv[0];
    var cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
    return '<span class="pq__code">' + esc(co.code) + '</span> <span class="pq__v">' + fmt(v) + '</span> ' +
      '<span class="pq__d ' + cls + '">' + (d > 0 ? "▲ +" : d < 0 ? "▼ " : "◆ ") + fmt(d) + '</span>';
  }

  // The performing family's own chart, drawn across the whole wall.
  function perfChart(co) {
    var sv = co.series.length > 1 ? co.series.slice() : EX.demoSeries(co === state.groom ? 0 : 1.4);
    var n = sv.length, lo = Math.min.apply(null, sv), hi = Math.max.apply(null, sv), span = Math.max(1, hi - lo);
    var pts = sv.map(function (v, i) { return [80 + (1440 * i) / Math.max(1, n - 1), 780 - ((v - lo) / span) * 470]; });
    var d = "M" + pts[0][0] + " " + pts[0][1];
    for (var i = 1; i < n; i++) { // smooth: horizontal-tangent cubic between closes
      var a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2;
      d += " C" + mx + " " + a[1] + " " + mx + " " + b[1] + " " + b[0] + " " + b[1];
    }
    if (d === seen.pfPath) return;
    seen.pfPath = d;
    el.pfLine.setAttribute("d", d);
    el.pfArea.setAttribute("d", d + " L" + pts[n - 1][0] + " 900 L" + pts[0][0] + " 900 Z");
    // restart the draw-on
    var svg = el.pfLine.ownerSVGElement;
    svg.classList.remove("draw"); void svg.getBoundingClientRect(); svg.classList.add("draw");
  }

  function countUp(node, to, ms, delay) {
    var t0 = performance.now() + (delay || 0);
    node.textContent = "0.00";
    requestAnimationFrame(function step(now) {
      var k = Math.max(0, Math.min(1, (now - t0) / ms));
      node.textContent = (to * (1 - Math.pow(1 - k, 4))).toFixed(2);
      if (k < 1) requestAnimationFrame(step);
    });
  }

  function toggle(node, on) { node.classList.toggle("show", !!on); }

  function playResult(s) {
    var side = s.fx.side, co = s[side];
    el.scResult.setAttribute("data-side", side);
    el.resK.textContent = "Round " + s.round + " · Result called";
    el.resPts.textContent = "+" + CFG.winPoints;
    el.resName.textContent = co.name;
    el.scResult.classList.remove("play"); void el.scResult.offsetWidth; el.scResult.classList.add("play");
  }

  // ---- per-frame ----------------------------------------------------------
  var t = 0, lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0; lastTs = ts; t += dt;
    if (!state) return;
    var s = state, now = EX.now();

    if (BOARD_SCENES[s.scene]) drawBoard(s, now);
    if (s.scene === "countdown") drawCountdown(s, now);
  }

  function drawBoard(s, now) {
    var gs = series(s, "groom"), bs = series(s, "bride");
    var maxV = 0; gs.concat(bs).forEach(function (v) { if (v > maxV) maxV = v; });
    var scale = window.EXChart.scaleFor(maxV);

    // after a +50 call: hold the old close, then run the line up
    var grow = 1, growing = null;
    if (s.fx && s.fx.type === "result" && s.fx.seq === seen.fx) {
      var e = now - (s.fx.ts || 0) - RESULT_HOLD;
      grow = Math.max(0, Math.min(1, e / GROW_MS));
      growing = s.fx.side;
    }
    var gold = s.scene === "merger" || s.scene === "finale";
    var live = s.market === "open";
    window.EXChart.draw(el.chartG, { series: gs, side: "groom", scale: scale, rounds: CFG.rounds, grow: growing === "groom" ? grow : 1, gold: gold, t: t, live: live });
    window.EXChart.draw(el.chartB, { series: bs, side: "bride", scale: scale, rounds: CFG.rounds, grow: growing === "bride" ? grow : 1, gold: gold, t: t, live: live });
    quote("G", gs, growing === "groom" ? grow : 1);
    quote("B", bs, growing === "bride" ? grow : 1);
  }

  function quote(k, sv, grow) {
    var arr = el["arr" + k], price = el["price" + k], chg = el["chg" + k];
    if (!sv.length) {
      arr.textContent = "◆"; arr.className = "q-arrow flat";
      price.textContent = "0.00"; chg.textContent = "PRE-OPEN"; chg.className = "q-chg flat";
      return;
    }
    var v = sv[sv.length - 1];
    if (sv.length > 1 && grow < 1) { var p = sv[sv.length - 2]; v = p + (v - p) * (1 - Math.pow(1 - grow, 3)); }
    var d = v - sv[0], pct = sv[0] ? (d / sv[0]) * 100 : 0;
    var cls = d > 0.004 ? "up" : d < -0.004 ? "down" : "flat";
    arr.textContent = cls === "up" ? "▲" : cls === "down" ? "▼" : "◆"; arr.className = "q-arrow " + cls;
    price.textContent = fmt(v);
    chg.textContent = (d >= 0 ? "+" : "") + fmt(d) + " (" + (d >= 0 ? "+" : "") + pct.toFixed(2) + "%)";
    chg.className = "q-chg " + cls;
  }

  function drawCountdown(s, now) {
    var from = CFG.countdownFrom, start = (s.cd && s.cd.start) || now;
    if (seen.cdStart !== start) { seen.cdStart = start; seen.cdReveal = 0; seen.cdTick = -1; } // every cue restarts 5→1
    var e = (now - start) / 1000;
    var n = from - Math.floor(Math.max(0, e));
    if (n >= 1) {
      if (seen.cdTick !== n) {
        seen.cdTick = n;
        el.cdNum.textContent = n;
        el.cd.classList.remove("tick", "out"); void el.cd.offsetWidth; el.cd.classList.add("tick");
        el.cdReveal.classList.remove("show");
      }
    } else if (!seen.cdReveal) {
      seen.cdReveal = 1;
      el.cd.classList.remove("tick"); el.cd.classList.add("out");
      el.cdReveal.classList.add("show");
    }
  }

  function init(root) {
    build(root);
    var s = EX.load();
    seen.fx = s.fx ? s.fx.seq : 0; // don't replay an old call on reload…
    if (s.fx && EX.now() - s.fx.ts < 4000) seen.fx = -1; // …unless it just happened
    apply(s);
    EX.onState(apply);
    requestAnimationFrame(loop);
    if (!preview) { EX.hello(); setInterval(EX.hello, 1500); EX.connect("wall", function (on, st) { if (st) apply(st); }); }
  }

  window.EXBoard = { init: init, preview: preview };
})();
