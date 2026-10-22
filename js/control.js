/* ==========================================================================
   THE EXCHANGE — show control ("the 1 caller").
   Edits the show state and pushes every change to the LED wall — over the
   same browser and, when paired to a session, over the network.
   ========================================================================== */
(function () {
  "use strict";
  var EX = window.EX, M = EX.Model;
  var st = EX.load();
  var session = null;
  var $ = function (id) { return document.getElementById(id); };

  var SCENE_LABEL = {
    home: "HOME LOOK", preopen: "MC · PRE-OPEN", bell: "BELL", countdown: "COUNTDOWN", entry: "ENTRY",
    board: "LIVE MARKET", perform: "PERFORMING", vote: "LIVE VOTE", merger: "STOCK MERGER", finale: "FINAL ACT", standby: "STANDBY"
  };

  function push() { EX.publish(st); render(); }
  function short(side) { return M.short(st[side]); }
  function title(side) { var s = short(side).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- actions -----------------------------------------------------------
  function cue(scene, side) {
    if (scene === "merger") M.merge(st);        // fuses both prices into the composite
    else if (scene === "finale") M.finale(st);
    else M.cue(st, scene, side);
    push();
  }

  function call(side) {
    if (st.market !== "open") { toast("Open the market first"); return; }
    if (st.round >= M.rounds(st)) { toast("All " + M.rounds(st) + " rounds are called"); return; }
    M.callResult(st, side);
    push();
    var btn = $(side === "groom" ? "callG" : "callB");
    btn.classList.remove("flash"); void btn.offsetWidth; btn.classList.add("flash");
    toast("Round " + st.round + " → +" + M.points(st) + " " + short(side) + " · " + M.last(st[side]).toFixed(2));
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
    toast("Market open · " + short("groom") + " " + M.last(st.groom).toFixed(2) + " · " + short("bride") + " " + M.last(st.bride).toFixed(2));
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

  // Names & setup: every field writes straight into the state, debounced.
  var setupT = 0;
  function setField(input) {
    var path = input.dataset.f.split("."), obj = st[path[0]], key = path[1], v = input.value;
    if (input.type === "number") {
      v = parseInt(v, 10);
      if (!isFinite(v)) return;
      if (key === "rounds") v = Math.max(Math.max(1, st.round), Math.min(EX.MODEL.maxRounds, v));
      if (key === "winPoints") v = Math.max(1, Math.min(1000, v));
    } else if (!input.classList.contains("keepcase")) {
      v = v.toUpperCase();
    }
    obj[key] = v;
    labels(); render();
    clearTimeout(setupT);
    setupT = setTimeout(function () { EX.publish(st); }, 250);
  }

  // ---- render ------------------------------------------------------------
  function labels() {
    var map = {
      "groom.name": st.groom.name, "groom.label": st.groom.label, "groom.short": short("groom"), "groom.title": title("groom"),
      "bride.name": st.bride.name, "bride.label": st.bride.label, "bride.short": short("bride"), "bride.title": title("bride"),
      "pts": "+" + M.points(st)
    };
    document.querySelectorAll("[data-n]").forEach(function (n) { n.textContent = map[n.dataset.n] || ""; });
  }

  function fillSetup() {
    document.querySelectorAll("[data-f]").forEach(function (i) {
      if (i === document.activeElement) return;
      var p = i.dataset.f.split(".");
      i.value = st[p[0]] && st[p[0]][p[1]] != null ? st[p[0]][p[1]] : "";
    });
  }

  function render() {
    var R = M.rounds(st);
    $("onAir").textContent = (SCENE_LABEL[st.scene] || st.scene.toUpperCase()) + (st.side ? " · " + short(st.side) : "");
    var cues = document.querySelectorAll(".cue");
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i], sameSide = (c.dataset.side || null) === (st.side || null);
      c.classList.toggle("live", c.dataset.cue === st.scene && (sameSide || !c.dataset.side));
    }

    var open = st.market === "open";
    $("mktState").textContent = open ? "OPEN" : "CLOSED";
    stock("g", st.groom); stock("b", st.bride);
    $("rnd").textContent = st.round + "/" + R;
    var pips = "";
    for (var r = 0; r < R; r++) {
      var e = st.log[r];
      pips += '<i class="' + (e ? (e.winner === "groom" ? "g" : "b") : "") + '"></i>';
    }
    $("pips").innerHTML = pips;

    var capped = st.round >= R;
    $("callG").disabled = $("callB").disabled = !open || capped;
    $("btnUndo").disabled = st.round <= 0;
    $("callHint").textContent = !open ? "Set the opening prices to open the market."
      : capped ? "All rounds called — cue the Stock Merger."
      : "Next: round " + (st.round + 1) + " of " + R + ".";

    var rows = "", g = st.groom.series, b = st.bride.series;
    for (var k = st.log.length - 1; k >= 0; k--) {
      var en = st.log[k], w = en.winner === "groom" ? "g" : "b";
      rows += '<div><span class="r">R' + en.round + '</span><span class="w ' + w + '">+' + M.points(st) + ' ' + short(en.winner) +
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
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  function fillTape() {
    var tp = st.tape || EX.defaultState().tape;
    $("tapeText").value = (tp.items || []).join("\n");
    $("tapeQuotes").checked = tp.quotes !== false;
    $("tapeSpeed").value = tp.speed || 48;
    $("tapeSpeedV").textContent = (tp.speed || 48) + "s";
  }

  function refreshAll() {
    var typing = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
    if (!typing) fillTape();
    fillSetup(); labels(); render();
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
    if (!confirm("Reset the show? Prices and rounds go back to the start. Names and the marquee are kept.")) return;
    var keep = { cfg: st.cfg, couple: st.couple, tape: st.tape, groom: st.groom, bride: st.bride };
    st = EX.defaultState();
    st.cfg = keep.cfg; st.couple = keep.couple; st.tape = keep.tape;
    ["groom", "bride"].forEach(function (k) { ["name", "code", "label"].forEach(function (f) { st[k][f] = keep[k][f]; }); });
    push(); refreshAll(); toast("Show reset");
  });
  document.querySelectorAll("[data-nudge]").forEach(function (b) {
    b.addEventListener("click", function () { M.nudge(st, b.dataset.nudge, parseFloat(b.dataset.d)); push(); });
  });
  ["tapeText", "tapeQuotes", "tapeSpeed"].forEach(function (id) { $(id).addEventListener("input", setTape); });
  document.querySelectorAll("[data-f]").forEach(function (i) { i.addEventListener("input", function () { setField(i); }); });

  function wallURL() { return "output.html" + (session ? "?s=" + session.sid + (session.key ? "#k=" + encodeURIComponent(session.key) : "") : ""); }
  $("btnOutput").addEventListener("click", function () { window.open(wallURL(), "exchange_wall"); });
  $("btnWall").addEventListener("click", function () { window.open(wallURL(), "exchange_wall"); });
  $("btnCopy").addEventListener("click", function () {
    if (!session || !session.key) return;
    var url = EX.pairURL(session);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      function () { toast("Pairing link copied — send it only to the crew"); },
      function () { window.prompt("Pairing link", url); });
  });

  if (st.groom.series.length) { $("openG").value = st.groom.series[0]; $("openB").value = st.bride.series[0]; }

  var KEYS = {
    "1": ["home"], "2": ["preopen"], "3": ["bell", "groom"], "4": ["countdown", "groom"], "5": ["entry", "groom"],
    "6": ["bell", "bride"], "7": ["countdown", "bride"], "8": ["entry", "bride"], l: ["board"],
    a: ["perform", "groom"], s: ["perform", "bride"], v: ["vote"], m: ["merger"], f: ["finale"], "0": ["standby"]
  };
  document.addEventListener("keydown", function (e) {
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if ($("gate").classList.contains("show")) return;
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
  EX.onState(function (s) { st = s; refreshAll(); });
  EX.on("offline", function () { toast("No connection — retrying…"); });
  EX.on("auth", function () { toast("This device lost its pairing — scan the wall's QR again"); gate(true); });

  // ---- sessions ------------------------------------------------------------
  function gate(on) { $("gate").classList.toggle("show", !!on); }

  function showPairing() {
    if (!session) return;
    $("sessCode").textContent = "SESSION " + session.sid;
    $("sync").textContent = "SESSION " + session.sid;
    $("sync").classList.add("on");
    if (session.key && window.qrcode) {
      var qr = window.qrcode(0, "M"); qr.addData(EX.pairURL(session)); qr.make();
      $("qrMini").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }
  }

  function join(s, firstScan) {
    session = s;
    showPairing();
    if (firstScan) EX.pair(s).then(function (j) { if (j.status === 200) toast("Paired · session " + s.sid); });
    EX.connect("control", s, function (online, server) {
      if (online && server) { st = server; refreshAll(); }
      else EX.publish(st); // brand-new session: seed it with this console's show
    });
  }

  $("btnNew").addEventListener("click", function () {
    EX.createSession().then(function (s) {
      gate(false);
      join(s, true);
      toast("New show · session " + s.sid + " — open the LED wall from the setup panel");
    }, function () { toast("Couldn't reach the server — check the connection"); });
  });

  refreshAll();
  // Is there a server to sync through? (none on a local file / python server)
  fetch("/api/state?s=AAAAAA", { cache: "no-store" }).then(function (r) {
    if (r.status !== 200) throw new Error("no api");
    var s = EX.sessionFromURL() || EX.getSession();
    if (s && s.key) join(s, !!s.fresh);
    else gate(true);
  }).catch(function () {
    $("sync").textContent = "THIS LAPTOP ONLY";
    $("pairCard").style.display = "none";
    EX.publish(st);
  });
})();
