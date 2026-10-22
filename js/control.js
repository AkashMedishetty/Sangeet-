/* ==========================================================================
   THE EXCHANGE — show control ("the 1 caller").
   Owns the authoritative state and pushes every change to the LED wall.
   ========================================================================== */
(function () {
  "use strict";
  var EX = window.EX, M = EX.Model, CFG = EX.MODEL;
  var st = EX.load();
  var $ = function (id) { return document.getElementById(id); };

  var SCENE_LABEL = {
    home: "HOME LOOK", preopen: "MC · PRE-OPEN", bell: "BELL", countdown: "COUNTDOWN", entry: "ENTRY",
    board: "LIVE MARKET", perform: "PERFORMING", vote: "LIVE VOTE", merger: "STOCK MERGER", finale: "FINAL ACT", standby: "STANDBY"
  };

  function push() { EX.publish(st); render(); }
  function short(side) { return side === "groom" ? "TAPADIA" : "MUNDADA"; }

  // ---- actions -----------------------------------------------------------
  function cue(scene, side) {
    if (scene === "merger") M.merge(st);        // fuses both prices into the SP composite
    else if (scene === "finale") M.finale(st);
    else M.cue(st, scene, side);
    push();
  }

  function call(side) {
    if (st.market !== "open") { toast("Open the market first"); return; }
    if (st.round >= CFG.rounds) { toast("All " + CFG.rounds + " rounds are called"); return; }
    M.callResult(st, side);
    push();
    var btn = $(side === "groom" ? "callG" : "callB");
    btn.classList.remove("flash"); void btn.offsetWidth; btn.classList.add("flash");
    toast("Round " + st.round + " → +" + CFG.winPoints + " " + short(side) + " · " + M.last(st[side]).toFixed(2));
  }

  function undo() {
    if (st.round <= 0) return;
    var r = st.round;
    M.undoRound(st);
    if (st.scene !== "board") M.cue(st, "board");
    push();
    toast("Round " + r + " undone");
  }

  function openMarket() {
    if (st.round > 0 && !confirm("Re-opening resets all " + st.round + " called rounds. Continue?")) return;
    M.setOpening(st, $("openG").value, $("openB").value);
    push();
    toast("Market open · TAPADIA " + M.last(st.groom).toFixed(2) + " · MUNDADA " + M.last(st.bride).toFixed(2));
  }

  function setTape() {
    st.tape = {
      items: $("tapeText").value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean),
      quotes: $("tapeQuotes").checked,
      speed: parseInt($("tapeSpeed").value, 10) || 48
    };
    $("tapeSpeedV").textContent = st.tape.speed + "s";
    EX.publish(st);
  }

  // ---- render ------------------------------------------------------------
  function render() {
    $("onAir").textContent = (SCENE_LABEL[st.scene] || st.scene.toUpperCase()) + (st.side ? " · " + short(st.side) : "");
    var cues = document.querySelectorAll(".cue");
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i], sameSide = (c.dataset.side || null) === (st.side || null);
      c.classList.toggle("live", c.dataset.cue === st.scene && (sameSide || !c.dataset.side));
    }

    var open = st.market === "open";
    $("mktState").textContent = open ? "OPEN" : "CLOSED";
    stock("g", st.groom); stock("b", st.bride);
    $("rnd").textContent = st.round + "/" + CFG.rounds;
    var pips = "";
    for (var r = 0; r < CFG.rounds; r++) {
      var e = st.log[r];
      pips += '<i class="' + (e ? (e.winner === "groom" ? "g" : "b") : "") + '"></i>';
    }
    $("pips").innerHTML = pips;

    var capped = st.round >= CFG.rounds;
    $("callG").disabled = $("callB").disabled = !open || capped;
    $("btnUndo").disabled = st.round <= 0;
    $("callHint").textContent = !open ? "Set the opening prices to open the market."
      : capped ? "All rounds called — cue the Stock Merger."
      : "Next: round " + (st.round + 1) + " of " + CFG.rounds + ".";

    // round log, newest first, with running prices
    var rows = "", g = st.groom.series, b = st.bride.series;
    for (var k = st.log.length - 1; k >= 0; k--) {
      var en = st.log[k], w = en.winner === "groom" ? "g" : "b";
      rows += '<div><span class="r">R' + en.round + '</span><span class="w ' + w + '">+' + CFG.winPoints + ' ' + short(en.winner) +
        '</span><span class="s">' + (g[k + 1] != null ? g[k + 1].toFixed(0) : "–") + ' · ' + (b[k + 1] != null ? b[k + 1].toFixed(0) : "–") + '</span></div>';
    }
    $("log").innerHTML = rows;
  }

  function stock(k, s) {
    var sv = s.series;
    $(k + "Wins").textContent = s.wins;
    if (!sv.length) { $(k + "Px").textContent = "—"; $(k + "Chg").textContent = "PRE-OPEN"; return; }
    var v = sv[sv.length - 1], d = v - sv[0];
    $(k + "Px").textContent = v.toFixed(2);
    $(k + "Chg").textContent = (d >= 0 ? "▲ +" : "▼ ") + d.toFixed(2);
  }

  var toastT = 0;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // ---- wiring ------------------------------------------------------------
  document.querySelectorAll(".cue").forEach(function (b) {
    b.addEventListener("click", function () { cue(b.dataset.cue, b.dataset.side); });
  });
  $("callG").addEventListener("click", function () { call("groom"); });
  $("callB").addEventListener("click", function () { call("bride"); });
  $("btnUndo").addEventListener("click", undo);
  $("btnOpen").addEventListener("click", openMarket);
  $("btnReset").addEventListener("click", function () {
    if (!confirm("Reset the whole show? Prices, rounds and the marquee go back to the start.")) return;
    st = EX.defaultState(); push(); fillTape(); toast("Show reset");
  });
  document.querySelectorAll("[data-nudge]").forEach(function (b) {
    b.addEventListener("click", function () { M.nudge(st, b.dataset.nudge, parseFloat(b.dataset.d)); push(); });
  });
  $("btnOutput").addEventListener("click", function () { window.open("output.html", "exchange_wall"); });
  ["tapeText", "tapeQuotes", "tapeSpeed"].forEach(function (id) { $(id).addEventListener("input", setTape); });

  function fillTape() {
    var tp = st.tape || EX.defaultState().tape;
    $("tapeText").value = (tp.items || []).join("\n");
    $("tapeQuotes").checked = tp.quotes !== false;
    $("tapeSpeed").value = tp.speed || 48;
    $("tapeSpeedV").textContent = (tp.speed || 48) + "s";
  }
  if (st.groom.series.length) { $("openG").value = st.groom.series[0]; $("openB").value = st.bride.series[0]; }

  var KEYS = {
    "1": ["home"], "2": ["preopen"], "3": ["bell", "groom"], "4": ["countdown", "groom"], "5": ["entry", "groom"],
    "6": ["bell", "bride"], "7": ["countdown", "bride"], "8": ["entry", "bride"], l: ["board"],
    a: ["perform", "groom"], s: ["perform", "bride"], v: ["vote"], m: ["merger"], f: ["finale"], "0": ["standby"]
  };
  document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var k = e.key.toLowerCase();
    if (KEYS[k]) { e.preventDefault(); cue(KEYS[k][0], KEYS[k][1]); }
    else if (k === "g") call("groom");
    else if (k === "b") call("bride");
    else if (k === "u") undo();
    else if (k === "o") openMarket();
  });

  // wall heartbeat
  var lastHello = 0;
  EX.onHello(function () { lastHello = Date.now(); });
  setInterval(function () {
    var on = Date.now() - lastHello < 4000;
    $("link").classList.toggle("on", on);
    $("link").lastElementChild.textContent = on ? "WALL LINKED" : "WALL NOT OPEN";
    var d = new Date();
    $("clock").textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, "0"); }).join(":");
  }, 500);

  // Another console (laptop ⇄ phone) changed the show: adopt it.
  EX.onState(function (s) {
    st = s;
    var typing = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
    if (!typing) fillTape();
    render();
  });

  // Wrong or missing PIN: ask once, remember it on this device, resend.
  EX.on("auth", function (pending) {
    var pin = window.prompt("Enter the show control PIN");
    if (!pin) { toast("Not sent — PIN needed to control the wall"); return; }
    localStorage.setItem(EX.PIN_KEY, pin.trim());
    EX.publish(pending);
  });
  EX.on("offline", function () { toast("No connection — retrying…"); });

  fillTape();
  render();
  // Pull the live show first so a fresh phone never overwrites it.
  EX.connect("control", function (online, server) {
    if (online && server) { st = server; fillTape(); render(); }
    else EX.publish(st);
    $("sync").textContent = online ? "ONLINE · PHONE READY" : "THIS LAPTOP ONLY";
    $("sync").classList.toggle("on", online);
  });
})();
