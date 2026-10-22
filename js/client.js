/* ==========================================================================
   THE EXCHANGE — client preview: the wall plus one row of show steps,
   and a "play full show" run-through of the whole evening.
   ========================================================================== */
(function () {
  "use strict";
  var EX = window.EX, M = EX.Model;
  var st = EX.load();
  var $ = function (id) { return document.getElementById(id); };

  var LABEL = { home: "HOME LOOK", preopen: "MC · PRE-OPEN", bell: "OPENING BELL", countdown: "COUNTDOWN", entry: "ENTRY",
    board: "LIVE MARKET", perform: "PERFORMANCE", vote: "LIVE VOTE", merger: "STOCK MERGER", finale: "FINAL ACT", standby: "STANDBY" };

  function title(side) { var x = M.short(st[side]).toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); }
  function cap(x) { x = String(x || "").toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); }

  // [group, [[label, action id, side?], …]] — names come from the show setup
  function steps() {
    var g = title("groom"), b = title("bride"), pts = "+" + M.points(st);
    return [
      ["01 · OPENING", [["Home look", "home"], ["MC sets the context", "preopen"]]],
      [st.groom.name, [["Bell", "bell", "groom"], ["Countdown", "countdown", "groom"], [cap(st.groom.label) + " entry", "entry", "groom"]]],
      [st.bride.name, [["Bell", "bell", "bride"], ["Countdown", "countdown", "bride"], [cap(st.bride.label) + " entry", "entry", "bride"]]],
      ["05 · MARKET", [["Open market", "open"], ["Live board", "board"]]],
      ["06–07 · EACH ROUND", [[g + " performs", "perform", "groom"], [b + " performs", "perform", "bride"], ["Live vote", "vote"],
        [pts + " " + g, "call", "groom"], [pts + " " + b, "call", "bride"]]],
      ["08–09 · FINALE", [["Stock merger", "merger"], ["Final act", "finale"], ["Reset", "reset"]]]
    ];
  }
  function esc(x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function act(id, side) {
    if (id === "open") M.setOpening(st, 80, 60);
    else if (id === "call") { if (st.market !== "open") M.setOpening(st, 80, 60); M.callResult(st, side); }
    else if (id === "merger") { if (!st.groom.series.length) M.setOpening(st, 80, 60); M.merge(st); }
    else if (id === "finale") { if (!st.groom.series.length) M.setOpening(st, 80, 60); M.finale(st); }
    else if (id === "reset") { st = fresh(); }
    else M.cue(st, id, side);
    EX.publish(st);
    render();
  }

  // a clean show that keeps the names and the marquee
  function fresh() {
    var d = EX.defaultState();
    d.cfg = st.cfg; d.couple = st.couple; d.tape = st.tape;
    ["groom", "bride"].forEach(function (k) { ["name", "code", "label"].forEach(function (f) { d[k][f] = st[k][f]; }); });
    return d;
  }

  var builtFor = "";
  function build() {
    var sig = [st.groom.name, st.bride.name, st.groom.label, st.bride.label, st.cfg.winPoints].join("|");
    if (sig === builtFor) return;
    builtFor = sig;
    $("steps").innerHTML = steps().map(function (g) {
      return '<div class="grp"><h3>' + esc(g[0]) + '</h3><div>' + g[1].map(function (s) {
        var cls = "st" + (s[2] === "groom" ? " g" : s[2] === "bride" ? " b" : "") + (s[1] === "call" ? " call" : "");
        return '<button class="' + cls + '" data-act="' + s[1] + '"' + (s[2] ? ' data-side="' + s[2] + '"' : "") + '>' + esc(s[0]) + '</button>';
      }).join("") + '</div></div>';
    }).join("");
    document.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { stop(); act(b.dataset.act, b.dataset.side); });
    });
  }

  function render() {
    build();
    $("couple").textContent = st.couple.a + " & " + st.couple.b + "'s " + cap(st.couple.event).toUpperCase() + " · LED WALL PREVIEW";
    $("now").textContent = (LABEL[st.scene] || st.scene.toUpperCase()) + (st.side ? " · " + M.short(st[st.side]) : "");
    $("score").textContent = st.groom.series.length
      ? M.short(st.groom) + " " + M.last(st.groom).toFixed(2) + "  ·  ROUND " + st.round + "/" + M.rounds(st) + "  ·  " + M.short(st.bride) + " " + M.last(st.bride).toFixed(2)
      : "MARKET NOT YET OPEN";
    document.querySelectorAll("[data-act]").forEach(function (b) {
      var a = b.dataset.act, side = b.dataset.side || null;
      b.classList.toggle("live", a === st.scene && (!side || side === st.side));
      if (a === "call") b.disabled = st.round >= M.rounds(st);
    });
  }

  // ---- the whole evening, end to end ------------------------------------
  var RUN = [];
  function script() {
    RUN = [
      ["home", null, 5000], ["preopen", null, 4000],
      ["bell", "groom", 4500], ["countdown", "groom", 7600], ["entry", "groom", 5000],
      ["bell", "bride", 4500], ["countdown", "bride", 7600], ["entry", "bride", 5000],
      ["open", null, 5000]
    ];
    var pattern = ["groom", "bride", "groom", "bride", "bride", "groom"];
    for (var r = 0; r < M.rounds(st); r++) {
      RUN.push(["perform", "groom", 4200], ["perform", "bride", 4200], ["vote", null, 4000], ["call", pattern[r % pattern.length], 6200]);
    }
    RUN.push(["merger", null, 8000], ["finale", null, 9000]);
  }

  var timer = 0, idx = 0;
  function stop() { clearTimeout(timer); timer = 0; $("play").classList.remove("on"); $("play").textContent = "▶ PLAY FULL SHOW"; }
  function next() {
    if (idx >= RUN.length) { stop(); return; }
    var r = RUN[idx++];
    act(r[0], r[1]);
    timer = setTimeout(next, r[2]);
  }
  $("play").addEventListener("click", function () {
    if (timer) { stop(); return; }
    st = fresh();
    script(); idx = 0;
    $("play").classList.add("on"); $("play").textContent = "■ STOP";
    next();
  });

  EX.onState(function (s) { st = s; render(); }); // stay in sync if the console is open too
  EX.publish(st);
  render();
})();
