window.CM = window.CM || {};

// Geração do mapa e desenho no Canvas.
CM.Map = (function () {
  'use strict';

  const COLORS = { 0: '#b9ae8f', 1: '#3da5ff', 2: '#ff5d6c', 3: '#b07cff', 4: '#ff9a3d' };
  const DARK = { 0: '#7d745c', 1: '#1d6fb8', 2: '#b8323f', 3: '#6e45b8', 4: '#b8651b' };
  const POINTS = 40;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // Forma irregular da ilha (pontos relativos ao centro)
  function makeShape(r) {
    const p1 = Math.random() * 6.28, p2 = Math.random() * 6.28, p3 = Math.random() * 6.28;
    const a2 = rand(0.06, 0.16), a3 = rand(0.04, 0.1), a5 = rand(0.02, 0.06);
    const pts = [];
    for (let i = 0; i < POINTS; i++) {
      const th = (i / POINTS) * Math.PI * 2;
      const k = 1 + a2 * Math.sin(2 * th + p1) + a3 * Math.sin(3 * th + p2) + a5 * Math.sin(5 * th + p3);
      pts.push([Math.cos(th) * r * k * 0.9, Math.sin(th) * r * k * 0.9 * 0.9]);
    }
    return pts;
  }

  function makeIsland(id, x, y, r) {
    const k = (r - 34) / 26; // 0 (pequena) a 1 (grande)
    return {
      id: id, x: x, y: y, r: r, shape: makeShape(r),
      owner: 0, soldiers: 0, acc: 0, flash: 0,
      prod: 0.6 + k * 0.6,          // soldados por segundo
      def: 1.1 + k * 0.4,           // multiplicador de defesa
      cap: Math.round(60 + r * 2.2) // limite de soldados na ilha
    };
  }

  // Cria as ilhas sem sobreposição. Retorna null se não conseguir.
  function generate(W, H, count) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const islands = [];
      let gap = 44, tries = 0;
      while (islands.length < count && tries < 3000) {
        tries++;
        if (tries % 800 === 0) gap = Math.max(16, gap - 10);
        const r = rand(34, 60);
        const m = r * 1.2 + 24;
        if (W < 2 * m || H < 2 * m) continue;
        const x = rand(m, W - m), y = rand(m, H - m);
        let ok = true;
        for (let i = 0; i < islands.length; i++) {
          const o = islands[i];
          if (Math.hypot(o.x - x, o.y - y) < (o.r + r) * 1.2 + gap) { ok = false; break; }
        }
        if (ok) islands.push(makeIsland(islands.length, x, y, r));
      }
      if (islands.length >= Math.max(8, count - 2)) return islands;
    }
    return null;
  }

  // Escolhe n ilhas bem afastadas entre si (a primeira é aleatória)
  function pickSeeds(islands, n) {
    const seeds = [islands[Math.floor(Math.random() * islands.length)]];
    while (seeds.length < n) {
      let best = null, bd = -1;
      for (let i = 0; i < islands.length; i++) {
        const isl = islands[i];
        if (seeds.indexOf(isl) >= 0) continue;
        let md = Infinity;
        for (let j = 0; j < seeds.length; j++) md = Math.min(md, dist(isl, seeds[j]));
        if (md > bd) { bd = md; best = isl; }
      }
      seeds.push(best);
    }
    return seeds;
  }

  // Ilha sob o ponto (x, y); tol = tolerância extra em unidades do mapa
  function islandAt(islands, x, y, tol) {
    let best = null, bd = Infinity;
    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      const d = Math.hypot(isl.x - x, isl.y - y) - isl.r * 1.1;
      if (d <= tol && d < bd) { bd = d; best = isl; }
    }
    return best;
  }

  function polyPath(ctx, shape, s) {
    ctx.beginPath();
    for (let i = 0; i < shape.length; i++) {
      const px = shape[i][0] * s, py = shape[i][1] * s;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function label(ctx, text, x, y, px, scale, color) {
    ctx.font = 'bold ' + (px / scale) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4 / scale;
    ctx.strokeStyle = 'rgba(0,20,35,.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(text, x, y);
  }

  // Cria a "câmera" do mapa ligada ao canvas
  function createView(canvas) {
    const ctx = canvas.getContext('2d');
    const view = { W: 1600, H: 900, scale: 1, offX: 0, offY: 0, cw: 1, ch: 1, dpr: 1 };

    view.resize = function () {
      view.dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.cw = canvas.clientWidth || 1;
      view.ch = canvas.clientHeight || 1;
      canvas.width = Math.round(view.cw * view.dpr);
      canvas.height = Math.round(view.ch * view.dpr);
      view.scale = Math.min(view.cw / view.W, view.ch / view.H);
      view.offX = (view.cw - view.W * view.scale) / 2;
      view.offY = (view.ch - view.H * view.scale) / 2;
    };

    // Define o tamanho do mundo conforme o formato da tela (horizontal ou vertical)
    view.measure = function () {
      const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
      if (cw >= ch) { view.H = 900; view.W = Math.round(900 * cw / ch); }
      else { view.W = 700; view.H = Math.round(700 * ch / cw); }
      view.resize();
    };

    view.toWorld = function (clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return { x: (clientX - rect.left - view.offX) / view.scale, y: (clientY - rect.top - view.offY) / view.scale };
    };

    view.tol = function (px) { return px / view.scale; };

    function drawOcean(t) {
      const g = ctx.createLinearGradient(0, 0, 0, view.ch);
      g.addColorStop(0, '#0f6a99');
      g.addColorStop(1, '#0a3d5c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.cw, view.ch);
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 10; k++) {
        const base = (view.ch * (k + 1)) / 11;
        ctx.beginPath();
        for (let x = 0; x <= view.cw; x += 20) {
          const y = base + Math.sin(x * 0.012 + t * 0.8 + k) * 6;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function drawIsland(isl, state, t) {
      ctx.save();
      ctx.translate(isl.x, isl.y);
      polyPath(ctx, isl.shape, 1.22);
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fill();
      polyPath(ctx, isl.shape, 1);
      ctx.fillStyle = DARK[isl.owner];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.stroke();
      polyPath(ctx, isl.shape, 0.82);
      ctx.fillStyle = COLORS[isl.owner];
      ctx.fill();
      polyPath(ctx, isl.shape, 0.45);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fill();
      ctx.restore();

      if (state.selected === isl.id) {
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -t * 30;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.arc(isl.x, isl.y, isl.r * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (isl.flash > 0) {
        ctx.save();
        ctx.globalAlpha = isl.flash;
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.arc(isl.x, isl.y, isl.r * (1 + (1 - isl.flash) * 1.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      label(ctx, String(Math.floor(isl.soldiers)), isl.x, isl.y, 16, view.scale, '#fff');
      label(ctx, '🛡' + isl.def.toFixed(1), isl.x, isl.y + isl.r * 1.2 + 8 / view.scale, 11, view.scale, '#cfe8f7');
    }

    function drawFleet(f) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS[f.owner];
      ctx.beginPath();
      ctx.moveTo(f.sx, f.sy);
      ctx.lineTo(f.ex, f.ey);
      ctx.stroke();
      ctx.restore();

      const px = f.sx + (f.ex - f.sx) * f.t, py = f.sy + (f.ey - f.sy) * f.t;
      const dx = f.ex - f.sx, dy = f.ey - f.sy, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const n = Math.min(8, Math.ceil(f.count / 6));
      for (let i = 0; i < n; i++) {
        const off = i - (n - 1) / 2;
        const bx = px + nx * off * 7 - ux * Math.abs(off) * 4;
        const by = py + ny * off * 7 - uy * Math.abs(off) * 4;
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[f.owner];
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      label(ctx, String(f.count), px, py - 16 / view.scale, 13, view.scale, '#fff');
    }

    view.render = function (state) {
      const t = performance.now() / 1000;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      drawOcean(t);
      ctx.save();
      ctx.translate(view.offX, view.offY);
      ctx.scale(view.scale, view.scale);

      state.islands.forEach(function (isl) { drawIsland(isl, state, t); });
      state.fleets.forEach(drawFleet);

      state.effects.forEach(function (e) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - e.t);
        ctx.lineWidth = 4;
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 8 + e.t * e.maxR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      if (state.drag && state.drag.active) {
        const from = state.islands[state.drag.from];
        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(state.drag.x, state.drag.y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    };

    return view;
  }

  return { COLORS: COLORS, generate: generate, pickSeeds: pickSeeds, islandAt: islandAt, createView: createView };
})();
