/* ==========================================================================
   THE EXCHANGE — show state, scoring model, and cross-window sync bus.
   Loaded by control.html (authoritative) and output.html (renderer).
   Plain browser global: window.EX — no build step.
   ========================================================================== */
(function () {
  "use strict";

  var CHANNEL = "the-exchange-v2";
  var LS_KEY = "the-exchange-state-v2";

  // Scoring follows the deck literally: the opening-price activity sets each
  // stock's open (up to 100), then every round the winner's stock gets +50.
  var MODEL = {
    rounds: 6,
    winPoints: 50,
    openDefault: 60,
    openMax: 100,
    countdownFrom: 5
  };

  // Rising attract-mode curve for the idle Home look (render 0).
  function demoSeries(seed) {
    var pts = [], v = 18 + seed * 6;
    for (var i = 0; i <= MODEL.rounds; i++) {
      v += 9 + Math.sin(i * 1.7 + seed) * 7 + (i > 3 ? 11 : 3);
      pts.push(Math.round(v * 10) / 10);
    }
    return pts;
  }

  function defaultState() {
    return {
      // home | preopen | bell | countdown | entry | board | perform | vote | merger | finale | standby
      scene: "home",
      side: null, // groom | bride — for bell / countdown / entry / perform
      market: "closed",
      round: 0,
      couple: { a: "SHREYASI", b: "PRITHVI", event: "SANGEET" },
      groom: { name: "TAPADIA & CO.", code: "GROOM CO", series: [], wins: 0 },
      bride: { name: "MUNDADA & CO.", code: "BRIDE CO", series: [], wins: 0 },
      log: [], // [{ round, winner }]
      // top + bottom LED marquee — edited live from the console
      tape: { items: ["MARKET OPEN – SANGEET NIGHT"], quotes: true, speed: 48 },
      cd: { start: 0 }, // countdown start (epoch ms) — both windows share a clock
      fused: null,
      fx: { type: null, side: null, seq: 0, ts: 0 },
      rev: 0,
      ts: 0
    };
  }

  // Countdown and +50 timing must line up across phone and wall, so every
  // device reads the server's clock (offset learned from each API reply).
  var clockOffset = 0;
  function now() { return Date.now() + clockOffset; }

  function last(s) { return s.series.length ? s.series[s.series.length - 1] : 0; }
  function fire(st, type, side) {
    st.fx = { type: type, side: side || null, seq: (st.fx.seq || 0) + 1, ts: now() };
  }

  var Model = {
    cfg: MODEL,
    last: last,

    cue: function (st, scene, side) {
      st.scene = scene;
      st.side = side || null;
      if (scene === "countdown") st.cd = { start: now() };
      return st;
    },

    setOpening: function (st, g, b) {
      st.groom.series = [clampOpen(g)];
      st.bride.series = [clampOpen(b)];
      st.groom.wins = st.bride.wins = 0;
      st.round = 0;
      st.log = [];
      st.fused = null;
      st.market = "open";
      st.scene = "board";
      st.side = null;
      fire(st, "open");
      return st;
    },

    callResult: function (st, winner) {
      if (st.market !== "open" || st.round >= MODEL.rounds) return st;
      var loser = winner === "groom" ? "bride" : "groom";
      st.round += 1;
      st[winner].series.push(last(st[winner]) + MODEL.winPoints);
      st[loser].series.push(last(st[loser]));
      st[winner].wins += 1;
      st.log.push({ round: st.round, winner: winner });
      st.scene = "board";
      st.side = null;
      fire(st, "result", winner);
      return st;
    },

    undoRound: function (st) {
      if (st.round <= 0) return st;
      var entry = st.log.pop();
      if (entry) st[entry.winner].wins = Math.max(0, st[entry.winner].wins - 1);
      st.groom.series.pop();
      st.bride.series.pop();
      st.round -= 1;
      return st;
    },

    nudge: function (st, side, delta) {
      var s = st[side];
      if (!s.series.length) return st;
      s.series[s.series.length - 1] = Math.max(0, last(s) + delta);
      return st;
    },

    merge: function (st) {
      st.fused = last(st.groom) + last(st.bride);
      st.scene = "merger";
      st.side = null;
      fire(st, "merger");
      return st;
    },

    finale: function (st) {
      if (st.fused == null) st.fused = last(st.groom) + last(st.bride);
      st.scene = "finale";
      st.side = null;
      fire(st, "finale");
      return st;
    }
  };

  function clampOpen(v) {
    v = parseFloat(v);
    if (!isFinite(v)) v = MODEL.openDefault;
    return Math.max(0, Math.min(MODEL.openMax, Math.round(v)));
  }

  // ---- Sync bus: BroadcastChannel + localStorage fallback ----------------
  var bc = null;
  try { bc = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null; } catch (e) { bc = null; }

  var listeners = { state: [], hello: [] };

  function publish(state) {
    state.rev = (state.rev || 0) + 1;
    state.ts = now();
    local(state);
    if (remote.on && remote.role === "control") send(state);
  }

  // same-browser fan-out (wall window, preview iframes)
  function local(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    if (bc) { try { bc.postMessage({ kind: "state", state: state }); } catch (e) {} }
  }

  // ---- Remote sync: phone ⇄ Vercel function ⇄ wall ------------------------
  // Only the console and the real wall connect. Preview pages stay local.
  var PIN_KEY = "the-exchange-pin";
  var remote = { on: false, role: null, srev: 0, busy: false, pending: null };

  function api(method, body, qs) {
    var t0 = Date.now();
    return fetch("/api/state" + (qs || ""), {
      method: method, cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) {
        if (j && j.now) clockOffset = j.now - (t0 + Date.now()) / 2;
        j.status = r.status;
        return j;
      });
    });
  }

  function take(j) {
    if (remote.role === "control" && j.wall && j.now - j.wall < 6000) emit("hello", j.wall);
    var st = j.state;
    if (st && st.srev > remote.srev) {
      remote.srev = st.srev;
      if (!st.tape) st.tape = defaultState().tape;
      local(st);
      emit("state", st);
    }
  }

  function send(state) {
    if (remote.busy) { remote.pending = state; return; }
    remote.busy = true;
    api("POST", { pin: localStorage.getItem(PIN_KEY) || "", state: state }).then(function (j) {
      remote.busy = false;
      if (j.status === 401) { emit("auth", state); return; }
      if (j.status !== 200) throw new Error("relay " + j.status);
      if (j.srev) { remote.srev = Math.max(remote.srev, j.srev); state.srev = j.srev; emit("sent", j.srev); }
      if (remote.pending) { var p = remote.pending; remote.pending = null; send(p); }
    }).catch(function () {
      remote.busy = false;
      emit("offline");
      setTimeout(function () { send(remote.pending || state); remote.pending = null; }, 1200);
    });
  }

  // cb(remoteAvailable, serverState|null) — called once after the first pull.
  function connect(role, cb) {
    remote.role = role;
    var beats = 0;
    api("GET", null, role === "wall" ? "?hb=1" : "").then(function (j) {
      if (j.status !== 200) throw new Error("no api");
      remote.on = true;
      var st = j.state;
      if (st) { remote.srev = st.srev || 0; if (!st.tape) st.tape = defaultState().tape; local(st); }
      if (cb) cb(true, st || null);
      if (role === "control" && j.wall && j.now - j.wall < 6000) emit("hello", j.wall);
      (function poll() {
        var wait = role === "wall" ? 450 : 1000;
        if (document.hidden && role !== "wall") return setTimeout(poll, 3000);
        var hb = role === "wall" && (++beats % 4 === 0);
        api("GET", null, hb ? "?hb=1" : "").then(function (r) { if (r.status === 200) take(r); })
          .catch(function () { emit("offline"); })
          .then(function () { setTimeout(poll, wait); });
      })();
    }).catch(function () { if (cb) cb(false, null); }); // local file / python server: same-laptop mode
  }

  // The wall output announces itself so the console can show "WALL LINKED".
  function hello() {
    if (bc) { try { bc.postMessage({ kind: "hello", ts: Date.now() }); } catch (e) {} }
  }

  function on(kind, cb) { (listeners[kind] = listeners[kind] || []).push(cb); }
  function emit(kind, payload) {
    var l = listeners[kind] || [];
    for (var i = 0; i < l.length; i++) { try { l[i](payload); } catch (e) { console.error(e); } }
  }

  if (bc) {
    bc.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d) return;
      if (d.kind === "state") emit("state", d.state);
      else if (d.kind === "hello") emit("hello", d.ts);
    };
  }
  window.addEventListener("storage", function (ev) {
    if (ev.key === LS_KEY && ev.newValue) { try { emit("state", JSON.parse(ev.newValue)); } catch (e) {} }
  });

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && st.groom && st.bride && st.fx) {
          if (!st.tape) st.tape = defaultState().tape;
          return st;
        }
      }
    } catch (e) {}
    return defaultState();
  }

  window.EX = {
    LS_KEY: LS_KEY,
    MODEL: MODEL,
    Model: Model,
    defaultState: defaultState,
    demoSeries: demoSeries,
    publish: publish,
    hello: hello,
    now: now,
    connect: connect,
    remote: remote,
    PIN_KEY: PIN_KEY,
    on: on,
    onState: function (cb) { on("state", cb); },
    onHello: function (cb) { on("hello", cb); },
    load: load
  };
})();
