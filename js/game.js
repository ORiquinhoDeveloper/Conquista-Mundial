window.CM = window.CM || {};

// Regras e laço principal da partida.
CM.Game = (function () {
  'use strict';

  const AI_NAMES = { 2: 'Cmdt. Vega', 3: 'Capitã Maré', 4: 'Lorde Atol' };
  const AI_START = { facil: 26, normal: 30, dificil: 34 };
  const PLAYER_START = 30;
  const FLEET_SPEED = 170; // unidades do mapa por segundo
  const ISLAND_COUNT = 12;

  let canvas = null, view = null, state = null, raf = 0, lastTs = 0;
  let lastDifficulty = 'normal', pct = 50, pointer = null;
  const cache = {};

  function $(id) { return document.getElementById(id); }
  function setText(id, value) {
    if (cache[id] === value) return;
    cache[id] = value;
    $(id).textContent = value;
  }
  function fmtTime(s) {
    s = Math.floor(s);
    const m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* ---------- Início e fim ---------- */

  function start(difficulty) {
    stopLoop();
    state = null;
    lastDifficulty = difficulty;
    $('overlay-pause').classList.add('hidden');
    $('overlay-confirm').classList.add('hidden');
    // espera a tela aparecer para medir o tamanho do canvas
    requestAnimationFrame(function () { begin(difficulty); });
  }

  function begin(difficulty) {
    try {
      view.measure();
      const islands = CM.Map.generate(view.W, view.H, ISLAND_COUNT);
      if (!islands) throw new Error('Não foi possível gerar o mapa');
      const seeds = CM.Map.pickSeeds(islands, 4);

      islands.forEach(function (i) {
        i.soldiers = Math.round(5 + ((i.r - 34) / 26) * 10 + Math.random() * 3);
      });
      seeds.forEach(function (s, idx) {
        s.owner = idx + 1;
        s.soldiers = idx === 0 ? PLAYER_START : AI_START[difficulty] || 30;
      });

      state = {
        difficulty: difficulty, islands: islands, fleets: [], effects: [],
        time: 0, paused: false, wasPaused: false, over: false, speed: 1,
        selected: null, focus: null, drag: null, elim: {},
        aiMult: (CM.AI.PARAMS[difficulty] || CM.AI.PARAMS.normal).prodMult,
        brains: [2, 3, 4].map(function (o) { return CM.AI.create(o, difficulty); }),
        stats: { sent: 0, lost: 0, conquered: 0, kills: 0 }
      };
      state.selected = null;
      setText('btn-speed', '1x');
      setText('btn-pause', '⏸');
      cache['island-info'] = null;
    } catch (e) {
      console.error(e);
      CM.UI.toast('Erro ao criar o mapa. Tente novamente.');
      CM.UI.show('lobby');
      return;
    }
    startLoop();
  }

  function abandon() {
    stopLoop();
    state = null;
    $('overlay-pause').classList.add('hidden');
    $('overlay-confirm').classList.add('hidden');
    CM.UI.show('lobby');
  }

  function finish(won) {
    if (state.over) return;
    state.over = true;
    state.selected = null;
    state.drag = null;
    const s = state;
    const owned = s.islands.filter(function (i) { return i.owner === 1; }).length;
    const result = {
      won: won, difficulty: s.difficulty, duration: Math.round(s.time),
      conquered: s.stats.conquered, sent: s.stats.sent, lost: s.stats.lost,
      kills: s.stats.kills, islands: owned
    };
    // Estatísticas são gravadas UMA vez, só quando a partida termina de verdade
    const gains = CM.Profile.recordMatch({ won: won, difficulty: s.difficulty, conquered: s.stats.conquered });
    setTimeout(function () {
      if (state !== s) return;
      stopLoop();
      state = null;
      CM.Lobby.showResult(result, gains);
    }, 900);
  }

  /* ---------- Laço principal ---------- */

  function startLoop() {
    stopLoop();
    lastTs = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(ts) {
    if (!state) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    try {
      const real = Math.min(0.05, (ts - lastTs) / 1000 || 0);
      lastTs = ts;
      if (!state.paused && !state.over) update(real * state.speed);
      view.render(state);
      updateHud();
    } catch (e) {
      console.error(e);
      stopLoop();
      state = null;
      CM.UI.toast('Ocorreu um erro na partida.');
      CM.UI.show('lobby');
    }
  }

  const api = { dist: dist, send: function (a, b, owner, n) { return sendFleet(a, b, owner, n); } };

  function update(dt) {
    state.time += dt;

    // Produção de soldados
    state.islands.forEach(function (i) {
      if (i.flash > 0) i.flash = Math.max(0, i.flash - dt * 1.4);
      if (i.owner === 0) return;
      if (i.soldiers >= i.cap) { i.acc = 0; return; }
      i.acc += i.prod * (i.owner === 1 ? 1 : state.aiMult) * dt;
      while (i.acc >= 1) { i.soldiers++; i.acc -= 1; }
    });

    // Frotas em movimento
    const arrived = [];
    state.fleets.forEach(function (f) {
      f.t += dt / f.dur;
      if (f.t >= 1) arrived.push(f);
    });
    if (arrived.length) {
      state.fleets = state.fleets.filter(function (f) { return f.t < 1; });
      arrived.forEach(arrive);
    }

    // Efeitos visuais
    state.effects.forEach(function (e) { e.t += dt * 1.6; });
    state.effects = state.effects.filter(function (e) { return e.t < 1; });

    // Inteligência artificial
    state.brains.forEach(function (b) { CM.AI.update(b, state, dt, api); });

    if (state.selected !== null && state.islands[state.selected].owner !== 1) state.selected = null;
    checkEnd();
  }

  /* ---------- Frotas e combate ---------- */

  function sendFleet(fromId, toId, owner, count) {
    const a = state.islands[fromId], b = state.islands[toId];
    if (!a || !b || a === b || a.owner !== owner) return false;
    count = Math.min(Math.floor(count), a.soldiers - 1);
    if (count < 1) return false;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const sx = a.x + ux * a.r * 0.95, sy = a.y + uy * a.r * 0.95;
    const ex = b.x - ux * b.r * 0.8, ey = b.y - uy * b.r * 0.8;
    a.soldiers -= count;
    state.fleets.push({
      from: fromId, to: toId, owner: owner, count: count, t: 0,
      dur: Math.max(0.8, Math.hypot(ex - sx, ey - sy) / FLEET_SPEED),
      sx: sx, sy: sy, ex: ex, ey: ey
    });
    if (owner === 1) state.stats.sent += count;
    return true;
  }

  function addEffect(x, y, color, maxR) {
    state.effects.push({ x: x, y: y, t: 0, color: color, maxR: maxR });
  }

  // Regras de combate:
  //  defesa = soldados da ilha x bônus de defesa
  //  ataque > defesa: conquista; sobram (ataque - defesa) soldados
  //  ataque <= defesa: defensores ficam com (defesa - ataque) / bônus
  function arrive(f) {
    const t = state.islands[f.to];
    const st = state.stats;
    if (t.owner === f.owner) {
      t.soldiers += f.count; // reforço
      addEffect(t.x, t.y, '#ffffff', t.r * 0.9);
      return;
    }
    const defPower = t.soldiers * t.def;
    const attacker = f.owner, defender = t.owner;

    if (f.count > defPower) {
      const killed = t.soldiers;
      const lostAtt = Math.min(f.count, Math.round(defPower));
      t.owner = attacker;
      t.soldiers = Math.max(1, Math.round(f.count - defPower));
      t.acc = 0;
      t.flash = 1;
      addEffect(t.x, t.y, CM.Map.COLORS[attacker], t.r * 1.6);
      if (attacker === 1) { st.conquered++; st.lost += lostAtt; st.kills += killed; }
      if (defender === 1) {
        st.lost += killed;
        CM.UI.toast('Você perdeu uma ilha!');
      }
    } else {
      const remaining = Math.max(1, Math.round((defPower - f.count) / t.def));
      const killed = Math.max(0, t.soldiers - remaining);
      t.soldiers = remaining;
      addEffect(t.x, t.y, '#ffd27a', t.r * 0.9);
      if (attacker === 1) { st.lost += f.count; st.kills += killed; }
      if (defender === 1) st.lost += killed;
    }
  }

  function alive(owner) {
    return state.islands.some(function (i) { return i.owner === owner; }) ||
      state.fleets.some(function (f) { return f.owner === owner; });
  }

  function checkEnd() {
    if (state.over) return;
    [2, 3, 4].forEach(function (o) {
      if (!state.elim[o] && !alive(o)) {
        state.elim[o] = true;
        CM.UI.toast(AI_NAMES[o] + ' foi eliminado!');
      }
    });
    if (!alive(1)) { finish(false); return; }
    if (![2, 3, 4].some(alive)) finish(true);
  }

  /* ---------- HUD ---------- */

  function ownerName(o) {
    if (o === 0) return 'Ilha neutra';
    if (o === 1) return 'Sua ilha';
    return 'Ilha de ' + AI_NAMES[o];
  }

  function sendCount(src) {
    return Math.max(0, Math.min(Math.floor(src.soldiers * pct / 100), src.soldiers - 1));
  }

  function updateHud() {
    let mine = 0, troops = 0;
    state.islands.forEach(function (i) {
      if (i.owner === 1) { mine++; troops += Math.floor(i.soldiers); }
    });
    state.fleets.forEach(function (f) { if (f.owner === 1) troops += f.count; });
    const left = [2, 3, 4].filter(alive).length;
    setText('hud-time', fmtTime(state.time));
    setText('hud-territories', String(mine));
    setText('hud-soldiers', String(troops));
    setText('hud-objective', 'Objetivo: elimine os adversários (' + left + ' restante' + (left === 1 ? '' : 's') + ')');

    let isl = null;
    if (state.selected !== null) isl = state.islands[state.selected];
    else if (state.focus !== null) isl = state.islands[state.focus];
    let text;
    if (!isl) {
      text = 'Toque em uma ilha azul (sua) e depois no destino. Também dá para arrastar até o destino.';
    } else {
      text = ownerName(isl.owner) + ' · 🪖 ' + Math.floor(isl.soldiers) +
        (isl.owner ? ' · ⚙ +' + isl.prod.toFixed(1) + '/s' : '') + ' · 🛡 ×' + isl.def.toFixed(1);
      if (state.selected !== null) {
        text += ' · Enviar ' + sendCount(isl) + ' soldados: toque no destino.';
      }
    }
    setText('island-info', text);
  }

  /* ---------- Controles ---------- */

  function launchPlayer(fromId, toId) {
    const src = state.islands[fromId];
    if (!src || src.owner !== 1) return;
    const n = sendCount(src);
    if (n < 1) { CM.UI.toast('Soldados insuficientes nessa ilha.'); return; }
    sendFleet(fromId, toId, 1, n);
    state.focus = toId;
  }

  function handleTap(isl) {
    if (!isl) { state.selected = null; state.focus = null; return; }
    if (state.selected === null) {
      if (isl.owner === 1) state.selected = isl.id;
      state.focus = isl.id;
      return;
    }
    if (isl.id === state.selected) { state.selected = null; return; }
    if (isl.owner === 1) { state.selected = isl.id; state.focus = isl.id; return; }
    launchPlayer(state.selected, isl.id);
  }

  function onDown(e) {
    if (!state || state.paused || state.over) return;
    e.preventDefault();
    const p = view.toWorld(e.clientX, e.clientY);
    const isl = CM.Map.islandAt(state.islands, p.x, p.y, view.tol(16));
    pointer = { isl: isl, sx: e.clientX, sy: e.clientY, moved: false };
    state.drag = (isl && isl.owner === 1) ? { from: isl.id, x: p.x, y: p.y, active: false } : null;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
  }

  function onMove(e) {
    if (!pointer || !state) return;
    if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 12) pointer.moved = true;
    if (state.drag && pointer.moved) {
      const p = view.toWorld(e.clientX, e.clientY);
      state.drag.x = p.x;
      state.drag.y = p.y;
      state.drag.active = true;
    }
  }

  function onUp(e) {
    if (!pointer || !state) { pointer = null; return; }
    const p = view.toWorld(e.clientX, e.clientY);
    const end = CM.Map.islandAt(state.islands, p.x, p.y, view.tol(16));
    const start = pointer.isl, moved = pointer.moved;
    pointer = null;
    state.drag = null;
    if (state.paused || state.over) return;
    if (moved) {
      if (start && start.owner === 1 && end && end.id !== start.id) {
        state.selected = start.id;
        launchPlayer(start.id, end.id);
      }
      return;
    }
    handleTap(end);
  }

  function onCancel() {
    pointer = null;
    if (state) state.drag = null;
  }

  function setPaused(v) {
    if (!state || state.over) return;
    state.paused = v;
    $('overlay-pause').classList.toggle('hidden', !v);
    setText('btn-pause', v ? '▶' : '⏸');
  }

  function init() {
    canvas = $('map-canvas');
    view = CM.Map.createView(canvas);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);

    $('btn-pause').addEventListener('click', function () { if (state) setPaused(!state.paused); });
    $('btn-resume').addEventListener('click', function () { setPaused(false); });
    $('btn-restart').addEventListener('click', function () { start(lastDifficulty); });

    $('btn-speed').addEventListener('click', function () {
      if (!state || state.over) return;
      state.speed = state.speed >= 3 ? 1 : state.speed + 1;
      setText('btn-speed', state.speed + 'x');
    });

    $('btn-quit').addEventListener('click', function () {
      if (!state || state.over) return;
      state.wasPaused = state.paused;
      state.paused = true;
      $('overlay-confirm').classList.remove('hidden');
    });
    $('btn-quit-no').addEventListener('click', function () {
      $('overlay-confirm').classList.add('hidden');
      if (state) state.paused = state.wasPaused;
    });
    $('btn-quit-yes').addEventListener('click', abandon);

    document.querySelectorAll('.btn-chip[data-pct]').forEach(function (b) {
      b.addEventListener('click', function () {
        pct = Number(b.dataset.pct);
        document.querySelectorAll('.btn-chip[data-pct]').forEach(function (o) {
          o.classList.toggle('selected', o === b);
        });
      });
    });

    window.addEventListener('resize', function () { if (state) view.resize(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { if (state) view.resize(); }, 250);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state && !state.over && !state.paused) setPaused(true);
    });
  }

  return { init: init, start: start };
})();