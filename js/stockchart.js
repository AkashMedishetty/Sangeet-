/* ==========================================================================
   THE EXCHANGE — multi-pane stock chart engine.
   Anatomy follows a real financial chart component:
     PRICE pane    : candlesticks + Bollinger band overlay + moving average
     VOLUME pane   : per-tick volume columns
     MOMENTUM pane : MACD-style histogram + signal line
     NAVIGATOR     : full-session overview with the active round windowed
   Annotation layers: crosshair, final-value tag, and callouts (+50 wins).
   ========================================================================== */
(function () {
  "use strict";

  var C = {
    up: "#2fd08a", down: "#f2565f",
    upFill: "rgba(47,208,138,0.30)", downFill: "rgba(242,86,95,0.28)",
    gold: "#d9b64e", goldBright: "#ecce7d",
    grid: "rgba(255,255,255,0.045)", gridMajor: "rgba(255,255,255,0.09)",
    axis: "rgba(237,232,220,0.42)", faint: "rgba(255,255,255,0.055)",
    ink: "#ede8dc", muted: "rgba(237,232,220,0.5)", bg: "#0a0b0d"
  };

  // ---- indicator maths ---------------------------------------------------
  function sma(a, w) {
    var o = [];
    for (var i = 0; i < a.length; i++) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - w + 1); j <= i; j++) { s += a[j]; n++; }
      o.push(s / n);
    }
    return o;
  }
  function ema(a, w) {
    var k = 2 / (w + 1), o = [], prev = a[0];
    for (var i = 0; i < a.length; i++) { prev = a[i] * k + prev * (1 - k); o.push(prev); }
    return o;
  }
  function stddev(a, w) {
    var m = sma(a, w), o = [];
    for (var i = 0; i < a.length; i++) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - w + 1); j <= i; j++) { s += (a[j] - m[i]) * (a[j] - m[i]); n++; }
      o.push(Math.sqrt(s / n));
    }
    return o;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // A "nice" tick step (1/2/2.5/5/10 × 10^k) for a target interval.
  function niceStep(target) {
    var exp = Math.floor(Math.log(Math.max(target, 1e-6)) / Math.LN10);
    var mag = Math.pow(10, exp), f = target / mag;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * mag;
  }

  // Price axis scales to the DATA RANGE (not from zero) — as a real chart does.
  function priceScale(candles) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < candles.length; i++) {
      if (candles[i].l < lo) lo = candles[i].l;
      if (candles[i].h > hi) hi = candles[i].h;
    }
    if (!isFinite(lo)) { lo = 0; hi = 160; }
    var span = Math.max(hi - lo, 4), pad = span * 0.14;
    lo = Math.max(0, lo - pad); hi = hi + pad;
    var step = niceStep((hi - lo) / 4);
    lo = Math.max(0, Math.floor(lo / step) * step);
    hi = Math.ceil(hi / step) * step;
    return { lo: lo, hi: hi, step: step };
  }

  function paneLabel(ctx, x, y, text, size) {
    ctx.font = "600 " + size + "px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(237,232,220,0.34)";
    ctx.fillText(text, x, y);
  }

  /**
   * @param opts { gold, growSession, grow, live, breathe, perSession, callouts }
   *   callouts: [{session, text}] — annotation pinned to that session's last candle
   */
  function draw(canvas, data, opts) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var candles = data.candles, vols = data.vols, PER = opts.perSession || 9;
    var gold = !!opts.gold;

    // ---- geometry -------------------------------------------------------
    var padT = h * 0.055, padB = h * 0.02, padL = w * 0.02, padR = w * 0.155;
    var plotW = w - padL - padR, usable = h - padT - padB, gap = usable * 0.028;
    var priceH = usable * 0.50, volH = usable * 0.125, indH = usable * 0.145, navH = usable * 0.115;
    var priceTop = padT;
    var volTop = priceTop + priceH + gap;
    var indTop = volTop + volH + gap;
    var navTop = indTop + indH + gap;
    var uu = h * 0.026; // base text unit

    if (!candles.length) { emptyState(ctx, w, h, padL, padR, plotW, priceTop, priceH, uu); return; }

    var N = candles.length, slot = plotW / N, bodyW = Math.min(slot * 0.6, Math.max(2, slot - 2));
    function X(i) { return padL + slot * i + slot / 2; }

    // ---- scales ---------------------------------------------------------
    var maxVol = 0.001;
    for (var m = 0; m < N; m++) { if (vols[m] > maxVol) maxVol = vols[m]; }
    // A shared scale may be supplied so both family stocks are directly comparable.
    var sc = opts.scale || priceScale(candles);
    function Y(v) { return priceTop + priceH - ((v - sc.lo) / (sc.hi - sc.lo)) * priceH; }

    var closes = candles.map(function (c) { return c.c; });

    // ================= PRICE PANE =======================================
    // horizontal gridlines + right price axis
    ctx.font = (uu * 0.92) + "px 'IBM Plex Mono', monospace";
    ctx.textBaseline = "middle";
    var dec = sc.step < 1 ? 2 : sc.step < 5 ? 1 : 0;
    for (var g = sc.lo; g <= sc.hi + 1e-6; g += sc.step) {
      var yy = Y(g);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
      ctx.fillStyle = C.axis; ctx.textAlign = "left";
      ctx.fillText(g.toFixed(dec), padL + plotW + w * 0.014, yy);
    }

    // session dividers through price/vol/momentum + round labels
    ctx.textAlign = "center";
    for (var s = 1; s <= data.sessions; s++) {
      var xd = padL + slot * PER * s;
      if (s < data.sessions) {
        ctx.strokeStyle = C.faint; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xd, priceTop); ctx.lineTo(xd, indTop + indH); ctx.stroke();
      }
      ctx.fillStyle = "rgba(237,232,220,0.3)";
      ctx.font = "600 " + (uu * 0.8) + "px 'Inter', system-ui, sans-serif";
      ctx.textBaseline = "bottom";
      ctx.fillText("R" + s, padL + slot * PER * (s - 0.5), priceTop - h * 0.008);
    }

    // Bollinger band overlay
    var bw = Math.min(14, Math.max(4, Math.floor(N / 4)));
    var mid = sma(closes, bw), sd = stddev(closes, bw);
    var upper = [], lower = [];
    for (var b = 0; b < N; b++) { upper.push(mid[b] + sd[b] * 2); lower.push(Math.max(0, mid[b] - sd[b] * 2)); }
    ctx.beginPath();
    for (var u = 0; u < N; u++) { var px = X(u), py = Y(upper[u]); if (u === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    for (var l = N - 1; l >= 0; l--) ctx.lineTo(X(l), Y(lower[l]));
    ctx.closePath();
    ctx.fillStyle = gold ? "rgba(217,182,78,0.09)" : "rgba(255,255,255,0.045)";
    ctx.fill();
    ctx.strokeStyle = gold ? "rgba(217,182,78,0.3)" : "rgba(255,255,255,0.13)";
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    strokePath(ctx, upper, X, Y, N); strokePath(ctx, lower, X, Y, N);
    ctx.setLineDash([]);

    // moving average (gold)
    var maArr = sma(closes, Math.min(8, Math.max(3, Math.floor(N / 6))));
    ctx.beginPath();
    for (var q = 0; q < N; q++) { var qx = X(q), qy = Y(maArr[q]); if (q === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy); }
    ctx.strokeStyle = gold ? C.goldBright : C.gold; ctx.lineWidth = Math.max(1.4, h * 0.005);
    ctx.globalAlpha = 0.92; ctx.shadowColor = C.gold; ctx.shadowBlur = h * 0.018;
    ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // candles
    var lastClose = 0, lastOpen = 0;
    for (var i = 0; i < N; i++) {
      var cd = candles[i], grow = 1;
      if (opts.growSession && cd.session === opts.growSession) grow = opts.grow;
      var oo = cd.o;
      var cc = cd.o + (cd.c - cd.o) * grow;
      var hh = cd.o + (cd.h - cd.o) * grow, ll = cd.o + (cd.l - cd.o) * grow;
      if (i === N - 1 && opts.live) { cc += opts.breathe || 0; hh = Math.max(hh, cc); ll = Math.min(ll, cc); }
      var up = cc >= oo, x = X(i);
      var col = gold ? C.gold : (up ? C.up : C.down);
      // wick
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, bodyW * 0.16);
      ctx.beginPath(); ctx.moveTo(x, Y(hh)); ctx.lineTo(x, Y(ll)); ctx.stroke();
      // body — hollow for up, filled for down (real terminal convention)
      var yO = Y(oo), yC = Y(cc), top = Math.min(yO, yC), bh = Math.max(1.6, Math.abs(yO - yC));
      if (up) {
        ctx.fillStyle = C.bg; ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
        ctx.strokeStyle = gold ? C.goldBright : C.up; ctx.lineWidth = Math.max(1.2, bodyW * 0.16);
        ctx.strokeRect(x - bodyW / 2, top, bodyW, bh);
      } else {
        ctx.fillStyle = gold ? "rgba(217,182,78,0.75)" : C.down;
        ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
      }
      if (i === N - 1) { lastClose = cc; lastOpen = oo; }
    }

    // ---- annotation: crosshair + final value tag ------------------------
    var ly = Y(lastClose), lx = X(N - 1);
    ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + plotW, ly); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx, priceTop); ctx.lineTo(lx, priceTop + priceH); ctx.stroke();
    ctx.setLineDash([]);

    var tagH = uu * 1.6, tagW = padR * 0.86, tagX = padL + plotW + w * 0.006;
    ctx.fillStyle = gold ? C.gold : (lastClose >= lastOpen ? C.up : C.down);
    roundRect(ctx, tagX, ly - tagH / 2, tagW, tagH, 3); ctx.fill();
    // fit the price text inside the tag
    var priceTxt = lastClose.toFixed(2), fs = uu * 1.0;
    ctx.font = "600 " + fs + "px 'IBM Plex Mono', monospace";
    while (ctx.measureText(priceTxt).width > tagW * 0.86 && fs > 6) {
      fs -= 0.5; ctx.font = "600 " + fs + "px 'IBM Plex Mono', monospace";
    }
    ctx.fillStyle = "#08090b"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(priceTxt, tagX + tagW / 2, ly);

    // ---- annotation: callout layer (+50 round wins) ---------------------
    if (opts.callouts && opts.callouts.length) {
      var placed = [];
      for (var k = 0; k < opts.callouts.length; k++) {
        var co = opts.callouts[k];
        var ci = co.session * PER - 1;
        if (ci < 0 || ci >= N) continue;
        var cxp = X(ci), cyp = Y(candles[ci].h) - h * 0.022;
        var lbl = co.text, lf = uu * 0.82;
        ctx.font = "700 " + lf + "px 'Inter', system-ui, sans-serif";
        var lw = ctx.measureText(lbl).width + uu * 0.85, lh = uu * 1.28;
        var bx = Math.min(Math.max(cxp - lw / 2, padL), padL + plotW - lw);
        var by = Math.max(cyp - lh, priceTop + 1);
        // lift the pill until it clears any already-placed one
        for (var gpass = 0; gpass < 8; gpass++) {
          var hit = false;
          for (var pz = 0; pz < placed.length; pz++) {
            var pb = placed[pz];
            if (bx < pb.x + pb.w + 2 && bx + lw + 2 > pb.x && by < pb.y + pb.h + 2 && by + lh + 2 > pb.y) { hit = true; break; }
          }
          if (!hit) break;
          by -= lh * 1.2;
        }
        if (by < priceTop + 1) by = priceTop + 1;
        placed.push({ x: bx, y: by, w: lw, h: lh });
        // leader line
        ctx.strokeStyle = "rgba(217,182,78,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cxp, Y(candles[ci].h)); ctx.lineTo(cxp, by + lh); ctx.stroke();
        // pill
        ctx.fillStyle = "rgba(217,182,78,0.16)";
        roundRect(ctx, bx, by, lw, lh, lh / 2); ctx.fill();
        ctx.strokeStyle = "rgba(217,182,78,0.55)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.goldBright; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(lbl, bx + lw / 2, by + lh / 2);
      }
    }

    // ================= VOLUME PANE ======================================
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, volTop + volH); ctx.lineTo(padL + plotW, volTop + volH); ctx.stroke();
    for (var v = 0; v < N; v++) {
      var vh = (vols[v] / maxVol) * volH * 0.92;
      ctx.fillStyle = gold ? "rgba(217,182,78,0.4)" : (candles[v].up ? "rgba(47,208,138,0.42)" : "rgba(242,86,95,0.4)");
      ctx.fillRect(X(v) - bodyW / 2, volTop + volH - vh, bodyW, vh);
    }
    paneLabel(ctx, padL + w * 0.006, volTop + h * 0.004, "VOL", uu * 0.78);

    // ================= MOMENTUM PANE (MACD-style) =======================
    var f = ema(closes, Math.max(3, Math.round(N / 9)));
    var sl = ema(closes, Math.max(6, Math.round(N / 4)));
    var macd = [], sig;
    for (var d0 = 0; d0 < N; d0++) macd.push(f[d0] - sl[d0]);
    sig = ema(macd, Math.max(3, Math.round(N / 12)));
    var mAbs = 0.001;
    for (var d1 = 0; d1 < N; d1++) { mAbs = Math.max(mAbs, Math.abs(macd[d1]), Math.abs(sig[d1])); }
    var zeroY = indTop + indH / 2;
    function MY(v) { return zeroY - (v / mAbs) * (indH / 2) * 0.86; }
    // zero line
    ctx.strokeStyle = "rgba(255,255,255,0.11)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + plotW, zeroY); ctx.stroke();
    // histogram
    for (var d2 = 0; d2 < N; d2++) {
      var hv = macd[d2] - sig[d2], hy = MY(hv), zy = MY(0);
      ctx.fillStyle = gold ? "rgba(217,182,78,0.5)" : (hv >= 0 ? "rgba(47,208,138,0.55)" : "rgba(242,86,95,0.52)");
      ctx.fillRect(X(d2) - bodyW / 2, Math.min(hy, zy), bodyW, Math.max(1, Math.abs(hy - zy)));
    }
    // signal line
    ctx.beginPath();
    for (var d3 = 0; d3 < N; d3++) { var sx = X(d3), sy = MY(sig[d3]); if (d3 === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); }
    ctx.strokeStyle = gold ? C.goldBright : "rgba(237,232,220,0.6)"; ctx.lineWidth = Math.max(1.1, h * 0.0035); ctx.stroke();
    paneLabel(ctx, padL + w * 0.006, indTop + h * 0.004, "MOMENTUM", uu * 0.78);

    // ================= NAVIGATOR ========================================
    var nLo = Infinity, nHi = -Infinity;
    for (var nz = 0; nz < N; nz++) { if (closes[nz] < nLo) nLo = closes[nz]; if (closes[nz] > nHi) nHi = closes[nz]; }
    var nSpan = Math.max(nHi - nLo, 1);
    function NY(v) { return navTop + navH * 0.92 - ((v - nLo) / nSpan) * navH * 0.84; }
    ctx.fillStyle = "rgba(255,255,255,0.028)";
    ctx.fillRect(padL, navTop, plotW, navH);
    // full-session area
    var ng = ctx.createLinearGradient(0, navTop, 0, navTop + navH);
    ng.addColorStop(0, gold ? "rgba(217,182,78,0.4)" : "rgba(237,232,220,0.24)");
    ng.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath(); ctx.moveTo(X(0), NY(closes[0]));
    for (var n1 = 1; n1 < N; n1++) ctx.lineTo(X(n1), NY(closes[n1]));
    ctx.lineTo(X(N - 1), navTop + navH); ctx.lineTo(X(0), navTop + navH); ctx.closePath();
    ctx.fillStyle = ng; ctx.fill();
    ctx.beginPath(); ctx.moveTo(X(0), NY(closes[0]));
    for (var n2 = 1; n2 < N; n2++) ctx.lineTo(X(n2), NY(closes[n2]));
    ctx.strokeStyle = gold ? C.goldBright : "rgba(237,232,220,0.5)"; ctx.lineWidth = 1.2; ctx.stroke();
    // active-round window
    if (data.sessions > 0) {
      var wx0 = padL + slot * PER * (data.sessions - 1), wx1 = padL + slot * PER * data.sessions;
      ctx.fillStyle = "rgba(217,182,78,0.13)"; ctx.fillRect(wx0, navTop, wx1 - wx0, navH);
      ctx.strokeStyle = "rgba(217,182,78,0.6)"; ctx.lineWidth = 1;
      ctx.strokeRect(wx0 + 0.5, navTop + 0.5, wx1 - wx0 - 1, navH - 1);
      // grip handles
      ctx.fillStyle = C.gold;
      ctx.fillRect(wx0 - 1, navTop + navH * 0.28, 2.5, navH * 0.44);
      ctx.fillRect(wx1 - 1.5, navTop + navH * 0.28, 2.5, navH * 0.44);
    }
    ctx.strokeStyle = C.faint; ctx.lineWidth = 1; ctx.strokeRect(padL + 0.5, navTop + 0.5, plotW - 1, navH - 1);
  }

  function strokePath(ctx, arr, X, Y, N) {
    ctx.beginPath();
    for (var i = 0; i < N; i++) { var x = X(i), y = Y(arr[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
  }

  function emptyState(ctx, w, h, padL, padR, plotW, priceTop, priceH, uu) {
    var yMax = 160;
    ctx.font = (uu * 0.92) + "px 'IBM Plex Mono', monospace"; ctx.textBaseline = "middle";
    for (var g = 0; g <= yMax; g += 40) {
      var yy = priceTop + priceH - (g / yMax) * priceH;
      ctx.strokeStyle = g === 0 ? C.gridMajor : C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
      ctx.fillStyle = C.axis; ctx.textAlign = "left"; ctx.fillText(String(g), padL + plotW + w * 0.014, yy);
    }
    ctx.fillStyle = "rgba(237,232,220,0.25)";
    ctx.font = "600 " + (uu * 1.1) + "px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("AWAITING OPENING BELL", padL + plotW / 2, priceTop + priceH / 2);
  }

  window.EXChart = { draw: draw, priceScale: priceScale };
})();
