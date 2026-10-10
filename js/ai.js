window.CM = window.CM || {};

// Inteligência artificial dos adversários.
// A dificuldade muda o comportamento: velocidade de decisão, quanto enviam,
// quanta margem exigem, se defendem, se juntam tropas e quanto miram no jogador.
CM.AI = (function () {
  'use strict';

  const PARAMS = {
    facil: {
      interval: [4, 6], actions: 1, sendFrac: 0.5, safety: 1.6, aggression: 0.35,
      defends: 0.3, pool: false, prodMult: 0.85, reserve: 10, neutralBias: 1.3, humanBias: 1.0, noise: 0.8
    },
    normal: {
      interval: [2.4, 3.4], actions: 1, sendFrac: 0.65, safety: 1.25, aggression: 0.65,
      defends: 0.7, pool: false, prodMult: 1.0, reserve: 8, neutralBias: 1.2, humanBias: 1.0, noise: 0.3
    },
    dificil: {
      interval: [1.2, 1.8], actions: 2, sendFrac: 0.8, safety: 1.1, aggression: 1.0,
      defends: 1.0, pool: true, prodMult: 1.2, reserve: 5, neutralBias: 1.0, humanBias: 1.4, noise: 0.08
    }
  };

  function rand(a, b) { return a + Math.random() * (b - a); }

  function create(owner, difficulty) {
    const p = PARAMS[difficulty] || PARAMS.normal;
    return { owner: owner, p: p, timer: rand(1, 3) };
  }

  // Soma dos soldados em movimento para uma ilha, filtrando pelo dono da frota
  function incoming(state, islandId, pred) {
    let sum = 0;
    state.fleets.forEach(function (f) { if (f.to === islandId && pred(f.owner)) sum += f.count; });
    return sum;
  }

  // Soldados que a ilha pode enviar agora
  function avail(isl, p) {
    return Math.max(0, Math.min(Math.floor(isl.soldiers * p.sendFrac), isl.soldiers - p.reserve));
  }

  function islandCounts(state) {
    const c = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    state.islands.forEach(function (i) { c[i.owner]++; });
    return c;
  }

  // Reforça ilhas ameaçadas por frotas inimigas
  function defend(brain, state, api, mine) {
    const me = brain.owner, p = brain.p;
    for (let k = 0; k < mine.length; k++) {
      const isl = mine[k];
      const threat = incoming(state, isl.id, function (o) { return o !== me; });
      if (threat <= 0) continue;
      const covering = incoming(state, isl.id, function (o) { return o === me; });
      const missing = threat / isl.def - isl.soldiers - covering;
      if (missing <= 1) continue;
      const donors = mine.filter(function (d) { return d.id !== isl.id && d.soldiers - p.reserve >= 3; })
        .sort(function (a, b) { return api.dist(a, isl) - api.dist(b, isl); });
      if (!donors.length) continue;
      const d = donors[0];
      const n = Math.min(d.soldiers - p.reserve, Math.ceil(missing));
      if (n >= 1 && api.send(d.id, isl.id, me, n)) return 1;
    }
    return 0;
  }

  // Escolhe o melhor alvo (mais valioso e viável) e ataca
  function attack(brain, state, api, mine) {
    const me = brain.owner, p = brain.p;
    const sources = mine.filter(function (i) { return avail(i, p) >= 4; });
    if (!sources.length) return false;
    const counts = islandCounts(state);
    let best = null;

    state.islands.forEach(function (t) {
      if (t.owner === me) return;
      if (t.owner !== 0 && Math.random() > p.aggression) return;
      const cost = t.soldiers * t.def + 1;
      const needed = cost * p.safety - incoming(state, t.id, function (o) { return o === me; });
      if (needed <= 0) return;
      let src = null, sd = Infinity;
      sources.forEach(function (s) {
        if (avail(s, p) >= needed) {
          const d = api.dist(s, t);
          if (d < sd) { sd = d; src = s; }
        }
      });
      if (!src) return;
      let score = (t.prod * 10 / cost) / (1 + sd / 600);
      if (t.owner === 0) score *= p.neutralBias;
      else if (t.owner === 1) score *= p.humanBias;
      if (t.owner !== 0 && counts[t.owner] <= 1) score *= 1.3; // quem está quase eliminado
      score *= 1 + (Math.random() * 2 - 1) * p.noise;
      if (!best || score > best.score) best = { score: score, src: src, t: t, needed: needed };
    });

    if (best) {
      const n = Math.min(avail(best.src, p), Math.ceil(best.needed * 1.1) + 1);
      return api.send(best.src.id, best.t.id, me, n);
    }
    if (p.pool) return pooled(brain, state, api, sources);
    return false;
  }

  // Dificil: junta tropas de várias ilhas para atacar um mesmo alvo
  function pooled(brain, state, api, sources) {
    const me = brain.owner, p = brain.p;
    let target = null, tc = Infinity;
    state.islands.forEach(function (t) {
      if (t.owner === me) return;
      let nearest = Infinity;
      sources.forEach(function (s) { nearest = Math.min(nearest, api.dist(s, t)); });
      const c = (t.soldiers * t.def + 1) * (1 + nearest / 800);
      if (c < tc) { tc = c; target = t; }
    });
    if (!target) return false;
    const need = (target.soldiers * target.def + 1) * p.safety -
      incoming(state, target.id, function (o) { return o === me; });
    if (need <= 0) return false;
    const sorted = sources.slice().sort(function (a, b) { return api.dist(a, target) - api.dist(b, target); });
    let total = 0;
    sorted.forEach(function (s) { total += avail(s, p); });
    if (total < need) return false;
    let left = Math.ceil(need) + 1, sent = false;
    for (let i = 0; i < sorted.length && left > 0; i++) {
      const n = Math.min(avail(sorted[i], p), left);
      if (n >= 1 && api.send(sorted[i].id, target.id, me, n)) { left -= n; sent = true; }
    }
    return sent;
  }

  function think(brain, state, api) {
    const me = brain.owner, p = brain.p;
    const mine = state.islands.filter(function (i) { return i.owner === me; });
    if (!mine.length) return;
    let actions = p.actions;
    if (Math.random() < p.defends) actions -= defend(brain, state, api, mine);
    while (actions > 0 && attack(brain, state, api, mine)) actions--;
  }

  function update(brain, state, dt, api) {
    brain.timer -= dt;
    if (brain.timer > 0) return;
    brain.timer = rand(brain.p.interval[0], brain.p.interval[1]);
    think(brain, state, api);
  }

  return { PARAMS: PARAMS, create: create, update: update };
})();