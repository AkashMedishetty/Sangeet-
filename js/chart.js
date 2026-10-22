/* ==========================================================================
   THE EXCHANGE — stock-runner chart (render 0 anatomy).
   Left price axis, rounds 1st–6th along the base, three stacked area layers
   (gold over side colour over partner colour) with vertex markers.
   ========================================================================== */
(function () {
  "use strict";

  var P = {
    gold: [232, 196, 99], goldHi: [255, 226, 140],
    red: [200, 40, 56], green: [46, 170, 74],
    axis: "rgba(244,236,214,0.62)", label: "rgba(244,236,214,0.82)", grid: "rgba(244,236,214,0.075)"
  };
  var ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }

  // Axis max: at least 160 (as on the render), then grows in clean steps.
  function scaleFor(maxValue) {
    var target = Math.max(160, maxValue * 1.14) / 4;
    var steps = [10, 20, 25, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= target) return { max: steps[i] * 4, step: steps[i] };
    return { max: Math.ceil(target / 100) * 400, step: Math.ceil(target / 100) * 100 };
  }

  function setup(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /**
   * opts: { series, side: "groom"|"bride", scale, rounds, grow (0..1 for the
   *         newest point), gold (merger/finale tint), t (seconds, for pulse), live }
   */
  function draw(canvas, opts) {
    var s = setup(canvas);
    if (!s) return;
    var ctx = s.ctx, w = s.w, h = s.h;
    var rounds = opts.rounds || 6;
    var sc = opts.scale || scaleFor(0);
    var u = h / 100; // type unit

    ctx.font = "500 " + (u * 5.6) + "px 'Barlow', 'Helvetica Neue', Arial, sans-serif";
    var L = ctx.measureText(String(sc.max)).width + u * 5, R = w * 0.035, T = h * 0.07, B = h * 0.14;
    var pw = w - L - R, ph = h - T - B;
    function X(i) { return L + (pw * i) / rounds; }
    function Y(v) { return T + ph - (Math.min(v, sc.max) / sc.max) * ph; }

    // ---- grid + price axis ---------------------------------------------
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var g = 0; g <= sc.max + 1e-6; g += sc.step) {
      var gy = Math.round(Y(g)) + 0.5;
      if (g > 0) { ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(L + pw, gy); ctx.stroke(); }
      ctx.strokeStyle = P.axis; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(L - u * 1.6, gy); ctx.lineTo(L, gy); ctx.stroke();
      ctx.fillStyle = P.label; ctx.fillText(String(g), L - u * 2.6, gy);
    }
    // round labels
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (var r = 1; r <= rounds; r++) {
      var rx = X(r);
      ctx.strokeStyle = P.axis; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(rx, T + ph); ctx.lineTo(rx, T + ph + u * 1.6); ctx.stroke();
      ctx.fillStyle = P.label; ctx.fillText(ORD[r - 1] || r + "th", rx, T + ph + u * 3.2);
    }
    // axes
    ctx.strokeStyle = P.axis; ctx.lineWidth = Math.max(1.4, u * 0.45);
    ctx.beginPath(); ctx.moveTo(L, T - u * 2); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw + R * 0.4, T + ph); ctx.stroke();
    ctx.fillStyle = P.axis; ctx.beginPath(); ctx.arc(L, T + ph, u * 0.9, 0, Math.PI * 2); ctx.fill();

    var series = (opts.series || []).slice(0, rounds + 1);
    if (!series.length) return;

    // animate the newest point up from the previous close
    if (series.length > 1 && opts.grow != null && opts.grow < 1) {
      var n = series.length - 1, k = easeOut(opts.grow);
      series[n] = series[n - 1] + (series[n] - series[n - 1]) * k;
    }

    var side = opts.side === "bride" ? "bride" : "groom";
    var own = side === "groom" ? P.red : P.green;
    var other = side === "groom" ? P.green : P.red;
    var layers = opts.gold
      ? [{ c: P.gold, f: 1 }, { c: [196, 150, 40], f: 0.74 }, { c: [150, 110, 25], f: 0.46 }]
      : [{ c: P.gold, f: 1 }, { c: own, f: 0.74 }, { c: other, f: 0.46 }];

    // ---- single point: opening price only -------------------------------
    if (series.length === 1) {
      var oy = Y(series[0]);
      ctx.setLineDash([u * 1.4, u * 1.2]); ctx.strokeStyle = rgba(P.gold, 0.55); ctx.lineWidth = Math.max(1, u * 0.35);
      ctx.beginPath(); ctx.moveTo(L, oy); ctx.lineTo(L + pw, oy); ctx.stroke(); ctx.setLineDash([]);
      headDot(ctx, L, oy, u, opts.t || 0, opts.live);
      ctx.font = "600 " + (u * 5) + "px 'Barlow', sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillStyle = rgba(P.goldHi, 0.9); ctx.fillText("OPEN " + series[0].toFixed(1), L + u * 2.4, oy - u * 1.4);
      return;
    }

    // ---- stacked areas (back to front) -------------------------------
    for (var li = 0; li < layers.length; li++) {
      var Lr = layers[li];
      var grad = ctx.createLinearGradient(0, T, 0, T + ph);
      grad.addColorStop(0, rgba(Lr.c, li === 0 ? 0.92 : 0.9));
      grad.addColorStop(1, rgba(Lr.c, li === 0 ? 0.45 : 0.55));
      ctx.beginPath(); ctx.moveTo(X(0), T + ph);
      for (var i = 0; i < series.length; i++) ctx.lineTo(X(i), Y(series[i] * Lr.f));
      ctx.lineTo(X(series.length - 1), T + ph); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      // bright top edge
      ctx.beginPath();
      for (var j = 0; j < series.length; j++) { var px = X(j), py = Y(series[j] * Lr.f); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.strokeStyle = rgba(li === 0 ? P.goldHi : Lr.c.map(function (c) { return Math.min(255, c + 60); }), 0.95);
      ctx.lineWidth = Math.max(1.2, u * (li === 0 ? 0.6 : 0.4));
      ctx.lineJoin = "round"; ctx.stroke();
      // vertex markers
      for (var m = 0; m < series.length; m++) {
        ctx.beginPath(); ctx.arc(X(m), Y(series[m] * Lr.f), u * (li === 0 ? 0.95 : 0.7), 0, Math.PI * 2);
        ctx.fillStyle = li === 0 ? "#fff0bf" : rgba(Lr.c.map(function (c) { return Math.min(255, c + 80); }), 1);
        ctx.fill();
      }
    }

    // gold glow along the price line
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = rgba(P.gold, 0.9); ctx.shadowBlur = u * 3;
    ctx.beginPath();
    for (var q = 0; q < series.length; q++) { var qx = X(q), qy = Y(series[q]); q ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
    ctx.strokeStyle = rgba(P.goldHi, 0.5); ctx.lineWidth = Math.max(1, u * 0.5); ctx.stroke();
    ctx.restore();

    var hx = X(series.length - 1), hy = Y(series[series.length - 1]);
    headDot(ctx, hx, hy, u, opts.t || 0, opts.live);
  }

  function headDot(ctx, x, y, u, t, live) {
    var pulse = live ? (Math.sin(t * 3.2) + 1) / 2 : 0.4;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var rg = ctx.createRadialGradient(x, y, 0, x, y, u * (5 + pulse * 3));
    rg.addColorStop(0, "rgba(255,236,170,0.85)"); rg.addColorStop(1, "rgba(255,200,80,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, u * (5 + pulse * 3), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, u * 1.4, 0, Math.PI * 2); ctx.fillStyle = "#fff6d6"; ctx.fill();
  }

  window.EXChart = { draw: draw, scaleFor: scaleFor };
})();
