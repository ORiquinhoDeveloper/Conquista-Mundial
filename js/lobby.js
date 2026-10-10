window.CM = window.CM || {};

// Escolha de dificuldade, início de partida e tela de resultado.
CM.Lobby = (function () {
  'use strict';

  const DIFF_NAMES = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };
  let difficulty = 'normal';

  function $(id) { return document.getElementById(id); }

  function startMatch() {
    CM.UI.show('game');
    CM.Game.start(difficulty);
  }

  function statBox(label, value) {
    const d = document.createElement('div');
    d.className = 'stat';
    const s = document.createElement('small');
    s.textContent = label;
    const b = document.createElement('b');
    b.textContent = value;
    d.appendChild(s);
    d.appendChild(b);
    return d;
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function showResult(r, gains) {
    $('result-card').className = 'result-card ' + (r.won ? 'win' : 'lose');
    $('result-title').textContent = r.won ? '🏆 Vitória!' : '💀 Derrota';
    $('result-sub').textContent = (r.won ? 'Você dominou o arquipélago!' : 'Você ficou sem territórios.') +
      ' · Dificuldade: ' + (DIFF_NAMES[r.difficulty] || r.difficulty);

    const box = $('result-stats');
    box.textContent = '';
    box.appendChild(statBox('Duração', fmtTime(r.duration)));
    box.appendChild(statBox('Territórios conquistados', String(r.conquered)));
    box.appendChild(statBox('Soldados enviados', String(r.sent)));
    box.appendChild(statBox('Soldados perdidos', String(r.lost)));
    box.appendChild(statBox('Inimigos derrotados', String(r.kills)));
    box.appendChild(statBox('Ilhas ao final', String(r.islands)));

    let g = '+' + gains.xpGain + ' XP · ' + (gains.scoreGain >= 0 ? '+' : '') + gains.scoreGain + ' pontos';
    if (gains.leveledUp) g += ' · Nível ' + gains.level + '! 🎉';
    $('result-gains').textContent = g;

    CM.UI.show('result');
  }

  function init() {
    document.querySelectorAll('#difficulty-list .diff-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        difficulty = btn.dataset.diff;
        document.querySelectorAll('#difficulty-list .diff-card').forEach(function (o) {
          o.classList.toggle('selected', o === btn);
        });
      });
    });
    $('btn-start').addEventListener('click', startMatch);
    $('btn-again').addEventListener('click', startMatch);
    $('btn-result-lobby').addEventListener('click', function () { CM.UI.show('lobby'); });
  }

  return { init: init, showResult: showResult };
})();