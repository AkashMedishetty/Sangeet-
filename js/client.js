/* ==========================================================================
   THE EXCHANGE — client preview: the wall plus one row of show steps,
   and a "play full show" run-through of the whole evening.
   ========================================================================== */
(function () {
  "use strict";
  var EX = window.EX, M = EX.Model, CFG = EX.MODEL;
  var st = EX.load();
  var $ = function (id) { return document.getElementById(id); };

  var LABEL = { home: "HOME LOOK", preopen: "MC · PRE-OPEN", bell: "OPENING BELL", countdown: "COUNTDOWN", entry: "ENTRY",
    board: "LIVE MARKET", perform: "PERFORMANCE", vote: "LIVE VOTE", merger: "STOCK MERGER", finale: "FINAL ACT", standby: "STANDBY" };

  // [group, [[label, action id, side?], …]]
  var STEPS = [
    ["01 · OPENING", [["Home look", "home"], ["MC sets the context", "preopen"]]],
    ["TAPADIA & CO.", [["Bell", "bell", "groom"], ["Countdown", "countdown", "groom"], ["Groom entry", "entry", "groom"]]],
    ["MUNDADA & CO.", [["Bell", "bell", "bride"], ["Countdown", "countdown", "bride"], ["Bride entry", "entry", "bride"]]],
    ["05 · MARKET", [["Open market", "open"], ["Live board", "board"]]],
    ["06–07 · EACH ROUND", [["Tapadia performs", "perform", "groom"], ["Mundada performs", "perform", "bride"], ["Live vote", "vote"],
      ["+50 Tapadia", "call", "groom"], ["+50 Mundada", "call", "bride"]]],
    ["08–09 · FINALE", [["Stock merger", "merger"], ["Final act", "finale"], ["Reset", "reset"]]]
  ];

  function act(id, side) {
    if (id === "open") M.setOpening(st, 80, 60);
    else if (id === "call") { if (st.market !== "open") M.setOpening(st, 80, 60); M.callResult(st, side); }
    else if (id === "merger") { if (!st.groom.series.length) M.setOpening(st, 80, 60); M.merge(st); }
    else if (id === "finale") { if (!st.groom.series.length) M.setOpening(st, 80, 60); M.finale(st); }
    else if (id === "reset") { var tape = st.tape; st = EX.defaultState(); st.tape = tape; }
    else M.cue(st, id, side);
    EX.publish(st);
    render();
  }

  function build() {
    $("steps").innerHTML = STEPS.map(function (g) {
      return '<div class="grp"><h3>' + g[0] + '</h3><div>' + g[1].map(function (s) {
        var cls = "st" + (s[2] === "groom" ? " g" : s[2] === "bride" ? " b" : "") + (s[1] === "call" ? " call" : "");
        return '<button class="' + cls + '" data-act="' + s[1] + '"' + (s[2] ? ' data-side="' + s[2] + '"' : "") + '>' + s[0] + '</button>';
      }).join("") + '</div></div>';
    }).join("");
    document.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () { stop(); act(b.dataset.act, b.dataset.side); });
    });
  }

  function render() {
    $("now").textContent = (LABEL[st.scene] || st.scene.toUpperCase()) +
      (st.side ? " · " + (st.side === "groom" ? "TAPADIA" : "MUNDADA") : "");
    $("score").textContent = st.groom.series.length
      ? "TAPADIA " + M.last(st.groom).toFixed(2) + "  ·  ROUND " + st.round + "/" + CFG.rounds + "  ·  MUNDADA " + M.last(st.bride).toFixed(2)
      : "MARKET NOT YET OPEN";
    document.querySelectorAll("[data-act]").forEach(function (b) {
      var a = b.dataset.act, side = b.dataset.side || null;
      b.classList.toggle("live", a === st.scene && (!side || side === st.side));
      if (a === "call") b.disabled = st.round >= CFG.rounds;
    });
  }

  // ---- the whole evening, end to end ------------------------------------
  var RUN = [
    ["home", null, 5000], ["preopen", null, 4000],
    ["bell", "groom", 4500], ["countdown", "groom", 7600], ["entry", "groom", 5000],
    ["bell", "bride", 4500], ["countdown", "bride", 7600], ["entry", "bride", 5000],
    ["open", null, 5000]
  ];
  ["groom", "bride", "groom", "bride", "bride", "groom"].forEach(function (w) {
    RUN.push(["perform", "groom", 4200], ["perform", "bride", 4200], ["vote", null, 4000], ["call", w, 6200]);
  });
  RUN.push(["merger", null, 8000], ["finale", null, 9000]);

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
    var tape = st.tape; st = EX.defaultState(); st.tape = tape;
    idx = 0;
    $("play").classList.add("on"); $("play").textContent = "■ STOP";
    next();
  });

  EX.onState(function (s) { st = s; render(); }); // stay in sync if the console is open too
  build();
  EX.publish(st);
  render();
})();
