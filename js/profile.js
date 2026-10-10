window.CM = window.CM || {};

CM.Profile = (function () {
  'use strict';
  const KEY = 'perfil';
  const AVATARS = ['🦅', '🐺', '🦁', '🐙', '🦈', '🐉', '🦊', '🐻'];
  const DIFF_MULT = { facil: 1, normal: 1.5, dificil: 2 };
  const DEFAULT = { name: 'Comandante', avatar: AVATARS[0], xp: 0, wins: 0, losses: 0, score: 0 };

  function num(v) {
    v = Number(v);
    return isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  function sanitize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 14) : '';
    return {
      name: name || DEFAULT.name,
      avatar: AVATARS.indexOf(raw.avatar) >= 0 ? raw.avatar : DEFAULT.avatar,
      xp: num(raw.xp), wins: num(raw.wins), losses: num(raw.losses), score: num(raw.score)
    };
  }

  let data = sanitize(CM.Storage.get(KEY, null));

  function save() { CM.Storage.set(KEY, data); }

  // Nível 1 = 0 XP, nível 2 = 50 XP, nível 3 = 200 XP, nível 4 = 450 XP...
  function levelFromXp(xp) { return 1 + Math.floor(Math.sqrt(xp / 50)); }

  function get() {
    const games = data.wins + data.losses;
    const level = levelFromXp(data.xp);
    const base = 50 * (level - 1) * (level - 1);
    const next = 50 * level * level;
    return {
      name: data.name, avatar: data.avatar, xp: data.xp,
      wins: data.wins, losses: data.losses, score: data.score,
      games: games,
      winRate: games ? Math.round((data.wins / games) * 100) : 0,
      level: level, xpIntoLevel: data.xp - base, xpForNext: next - base
    };
  }

  // Chamado UMA vez, só quando a partida termina de verdade (vitória ou derrota).
  // r = { won, difficulty, conquered }
  function recordMatch(r) {
    const mult = DIFF_MULT[r.difficulty] || 1;
    const conquered = num(r.conquered);
    const levelBefore = levelFromXp(data.xp);
    let xpGain, scoreGain;
    if (r.won) {
      xpGain = Math.round(60 * mult + conquered * 5);
      scoreGain = Math.round(100 * mult + conquered * 10);
      data.wins += 1;
    } else {
      xpGain = Math.round(15 + conquered * 5);
      scoreGain = -Math.min(data.score, 20);
      data.losses += 1;
    }
    data.xp += xpGain;
    data.score = Math.max(0, data.score + scoreGain);
    save();
    const levelAfter = levelFromXp(data.xp);
    return { xpGain: xpGain, scoreGain: scoreGain, leveledUp: levelAfter > levelBefore, level: levelAfter };
  }

  function setName(name) {
    data.name = sanitize({ name: name }).name;
    save();
    refreshLobbyCard();
  }

  function setAvatar(avatar) {
    if (AVATARS.indexOf(avatar) < 0) return;
    data.avatar = avatar;
    save();
    render();
    refreshLobbyCard();
  }

  function $(id) { return document.getElementById(id); }

  function refreshLobbyCard() {
    const p = get();
    $('lobby-avatar').textContent = p.avatar;
    $('lobby-name').textContent = p.name;
    $('lobby-level').textContent = 'Nível ' + p.level;
  }

  function render() {
    const p = get();
    $('profile-avatar').textContent = p.avatar;
    $('profile-name-input').value = p.name;
    $('profile-level').textContent = 'Nível ' + p.level;
    $('xp-text').textContent = p.xpIntoLevel + ' / ' + p.xpForNext + ' XP';
    $('xp-bar-fill').style.width = Math.min(100, (p.xpIntoLevel / p.xpForNext) * 100) + '%';
    $('stat-wins').textContent = p.wins;
    $('stat-losses').textContent = p.losses;
    $('stat-games').textContent = p.games;
    $('stat-score').textContent = p.score;
    $('stat-rate').textContent = p.winRate + '%';
    $('stat-xp').textContent = p.xp;
    const buttons = $('avatar-picker').children;
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('selected', buttons[i].textContent === p.avatar);
    }
  }

  function init() {
    const picker = $('avatar-picker');
    picker.textContent = '';
    AVATARS.forEach(function (a) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a;
      b.addEventListener('click', function () { setAvatar(a); });
      picker.appendChild(b);
    });
    const input = $('profile-name-input');
    input.addEventListener('change', function () { setName(input.value); render(); });
    refreshLobbyCard();
    render();
  }

  return { init: init, get: get, render: render, recordMatch: recordMatch, refreshLobbyCard: refreshLobbyCard };
})();