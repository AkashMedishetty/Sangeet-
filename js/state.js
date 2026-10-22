/* ==========================================================================
   THE EXCHANGE — show state, scoring model, sessions and sync.
   Loaded by the console, the LED wall and the client preview.
   Plain browser global: window.EX — no build step.
   ========================================================================== */
(function () {
  "use strict";

  var CHANNEL = "the-exchange-v2";
  var LS_KEY = "the-exchange-state-v2";
  var SESSION_KEY = "the-exchange-session";

  // Defaults follow the deck: opening activity sets each stock's open (up to
  // 100), then every round the winner's stock gets +50. Both are editable.
  var MODEL = { rounds: 6, winPoints: 50, openDefault: 60, openMax: 100, countdownFrom: 5, maxRounds: 12 };

  function demoSeries(seed, rounds) {
    var pts = [], v = 18 + seed * 6, n = rounds || MODEL.rounds;
    for (var i = 0; i <= n; i++) {
      v += 9 + Math.sin(i * 1.7 + seed) * 7 + (i > n / 2 ? 11 : 3);
      pts.push(Math.round(v * 10) / 10);
    }
    return pts;
  }

  function defaultState() {
    return {
      // home | preopen | bell | countdown | entry | board | perform | vote | merger | finale | standby
      scene: "home",
      side: null,
      market: "closed",
      round: 0,
      cfg: { rounds: MODEL.rounds, winPoints: MODEL.winPoints },
      couple: { a: "SHREYASI", b: "PRITHVI", mono: "SP", event: "SANGEET", line: "the two sides, now one" },
      groom: { name: "TAPADIA & CO.", code: "GROOM CO", label: "GROOM", series: [], wins: 0 },
      bride: { name: "MUNDADA & CO.", code: "BRIDE CO", label: "BRIDE", series: [], wins: 0 },
      log: [],
      tape: { items: ["MARKET OPEN – SANGEET NIGHT"], quotes: true, speed: 48 },
      cd: { start: 0 },
      fused: null,
      fx: { type: null, side: null, seq: 0, ts: 0 },
      rev: 0,
      ts: 0
    };
  }

  // Fill any field an older saved state is missing.
  function normalize(st) {
    var d = defaultState();
    st.cfg = Object.assign({}, d.cfg, st.cfg || {});
    st.couple = Object.assign({}, d.couple, st.couple || {});
    st.groom = Object.assign({}, d.groom, st.groom || {});
    st.bride = Object.assign({}, d.bride, st.bride || {});
    st.tape = st.tape || d.tape;
    st.log = st.log || [];
    st.cd = st.cd || d.cd;
    st.fx = st.fx || d.fx;
    return st;
  }

  // Countdown and +50 timing must line up across phone and wall, so every
  // device reads the server's clock (offset learned from each API reply).
  var clockOffset = 0;
  function now() { return Date.now() + clockOffset; }

  function last(s) { return s.series.length ? s.series[s.series.length - 1] : 0; }
  function rounds(st) { return (st.cfg && st.cfg.rounds) || MODEL.rounds; }
  function points(st) { return (st.cfg && st.cfg.winPoints) || MODEL.winPoints; }
  // "TAPADIA & CO." → "TAPADIA"
  function short(co) { return String(co.name || "").replace(/\s*&.*$/, "").replace(/\.$/, "").trim().toUpperCase() || co.label; }
  function fire(st, type, side) {
    st.fx = { type: type, side: side || null, seq: (st.fx.seq || 0) + 1, ts: now() };
  }

  var Model = {
    cfg: MODEL,
    last: last,
    rounds: rounds,
    points: points,
    short: short,

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
      if (st.market !== "open" || st.round >= rounds(st)) return st;
      var loser = winner === "groom" ? "bride" : "groom";
      st.round += 1;
      st[winner].series.push(last(st[winner]) + points(st));
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

  // ---- same-browser bus: BroadcastChannel + localStorage ------------------
  var bc = null;
  try { bc = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null; } catch (e) { bc = null; }

  var listeners = {};
  function on(kind, cb) { (listeners[kind] = listeners[kind] || []).push(cb); }
  function emit(kind, payload) {
    var l = listeners[kind] || [];
    for (var i = 0; i < l.length; i++) { try { l[i](payload); } catch (e) { console.error(e); } }
  }

  function publish(state) {
    state.rev = (state.rev || 0) + 1;
    state.ts = now();
    local(state);
    if (remote.on && remote.role === "control") send(state);
  }

  function local(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    if (bc) { try { bc.postMessage({ kind: "state", state: state }); } catch (e) {} }
  }

  // The wall announces itself so a same-laptop console shows "WALL LINKED".
  function hello() {
    if (bc) { try { bc.postMessage({ kind: "hello", ts: Date.now() }); } catch (e) {} }
  }

  if (bc) {
    bc.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d) return;
      if (d.kind === "state") emit("state", normalize(d.state));
      else if (d.kind === "hello") emit("hello", d.ts);
    };
  }
  window.addEventListener("storage", function (ev) {
    if (ev.key === LS_KEY && ev.newValue) { try { emit("state", normalize(JSON.parse(ev.newValue))); } catch (e) {} }
  });

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && st.groom && st.bride) return normalize(st);
      }
    } catch (e) {}
    return defaultState();
  }

  // ---- sessions: one show = one code + one secret key ---------------------
  // The wall creates the session; a phone gets the key by scanning the
  // wall's QR (…/control?s=CODE#k=KEY). The key never goes in a query string.
  function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; } }
  function setSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
  function clearKey() { var s = getSession(); if (s) { s.key = null; setSession(s); } }

  // Reads ?s= and #k= from the address bar, stores a scanned key, then
  // tidies the URL so the key isn't left on screen or in history.
  function sessionFromURL() {
    var q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
    var sid = (q.get("s") || "").toUpperCase().trim(), key = h.get("k");
    if (!sid) return null;
    if (key) {
      var s = { sid: sid, key: key, fresh: true };
      setSession({ sid: sid, key: key });
      history.replaceState(null, "", location.pathname + "?s=" + sid);
      return s;
    }
    var cur = getSession();
    return cur && cur.sid === sid ? cur : { sid: sid, key: null };
  }

  function pairURL(s) {
    return location.origin + "/control?s=" + s.sid + "#k=" + encodeURIComponent(s.key);
  }

  // ---- remote sync: console ⇄ Vercel function ⇄ wall ----------------------
  var remote = { on: false, role: null, srev: 0, busy: false, pending: null, session: null };

  function api(path, method, payload, qs) {
    var t0 = Date.now();
    return fetch(path + (qs || ""), {
      method: method, cache: "no-store",
      headers: payload ? { "Content-Type": "application/json" } : {},
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (r) {
      return r.json().then(function (j) {
        if (j && j.now) clockOffset = j.now - (t0 + Date.now()) / 2;
        j.status = r.status;
        return j;
      });
    });
  }

  function createSession() {
    return api("/api/session", "POST", { action: "create" }).then(function (j) {
      if (j.status !== 200 || !j.sid) throw new Error("session");
      var s = { sid: j.sid, key: j.key };
      setSession(s);
      return s;
    });
  }

  function pair(s) { return api("/api/session", "POST", { action: "pair", s: s.sid, key: s.key }); }

  function take(j) {
    emit("meta", j);
    if (remote.role === "control" && j.wall && j.now - j.wall < 6000) emit("hello", j.wall);
    var st = j.state;
    if (st && st.srev > remote.srev) {
      remote.srev = st.srev;
      normalize(st);
      local(st);
      emit("state", st);
    }
  }

  function send(state) {
    var s = remote.session;
    if (!s || !s.key) { emit("auth", state); return; }
    if (remote.busy) { remote.pending = state; return; }
    remote.busy = true;
    api("/api/state", "POST", { s: s.sid, key: s.key, state: state }).then(function (j) {
      remote.busy = false;
      if (j.status === 401) { clearKey(); s.key = null; emit("auth", state); return; }
      if (j.status !== 200) throw new Error("relay " + j.status);
      if (j.srev) { remote.srev = Math.max(remote.srev, j.srev); state.srev = j.srev; }
      if (remote.pending) { var p = remote.pending; remote.pending = null; send(p); }
    }).catch(function () {
      remote.busy = false;
      emit("offline");
      setTimeout(function () { var p = remote.pending || state; remote.pending = null; send(p); }, 1200);
    });
  }

  // Joins session `s` and starts polling. cb(online, serverState|null).
  function connect(role, s, cb) {
    remote.role = role;
    remote.session = s;
    var beats = 0, qs = "?s=" + encodeURIComponent(s.sid);
    api("/api/state", "GET", null, qs + (role === "wall" ? "&hb=1" : "")).then(function (j) {
      if (j.status !== 200) throw new Error("no api");
      remote.on = true;
      var st = j.state;
      if (st) { remote.srev = st.srev || 0; normalize(st); local(st); }
      if (cb) cb(true, st || null);
      emit("meta", j);
      if (role === "control" && j.wall && j.now - j.wall < 6000) emit("hello", j.wall);
      (function poll() {
        var wait = role === "wall" ? 450 : 1000;
        if (document.hidden && role !== "wall") return setTimeout(poll, 3000);
        var hb = role === "wall" && (++beats % 4 === 0);
        api("/api/state", "GET", null, qs + (hb ? "&hb=1" : "")).then(function (r) { if (r.status === 200) take(r); })
          .catch(function () { emit("offline"); })
          .then(function () { setTimeout(poll, wait); });
      })();
    }).catch(function () { if (cb) cb(false, null); }); // no API (local file / python server): same-laptop mode
  }

  window.EX = {
    LS_KEY: LS_KEY,
    MODEL: MODEL,
    Model: Model,
    defaultState: defaultState,
    normalize: normalize,
    demoSeries: demoSeries,
    publish: publish,
    hello: hello,
    now: now,
    on: on,
    onState: function (cb) { on("state", cb); },
    onHello: function (cb) { on("hello", cb); },
    load: load,
    // sessions
    getSession: getSession,
    sessionFromURL: sessionFromURL,
    createSession: createSession,
    pair: pair,
    pairURL: pairURL,
    connect: connect,
    remote: remote
  };
})();
