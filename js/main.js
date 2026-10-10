window.CM = window.CM || {};

// Navegação entre telas, avisos e tratamento de erros.
CM.UI = (function () {
  'use strict';
  let toastTimer = 0;

  function show(name) {
    const target = document.getElementById('screen-' + name);
    if (!target) return;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    target.classList.add('active');
    if (name === 'ranking') CM.Ranking.render();
    if (name === 'profile') CM.Profile.render();
    if (name === 'lobby') CM.Profile.refreshLobbyCard();
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  return { show: show, toast: toast };
})();

(function () {
  'use strict';

  function init() {
    try {
      document.querySelectorAll('[data-go]').forEach(function (b) {
        b.addEventListener('click', function () { CM.UI.show(b.dataset.go); });
      });
      CM.Profile.init();
      CM.Lobby.init();
      CM.Game.init();
    } catch (e) {
      console.error(e);
      CM.UI.toast('Erro ao iniciar o jogo. Recarregue a página.');
    }
  }

  window.addEventListener('error', function (e) {
    console.error(e.error || e.message);
    CM.UI.toast('Ops! Ocorreu um erro. Tente novamente.');
  });
  window.addEventListener('unhandledrejection', function (e) {
    console.error(e.reason);
    CM.UI.toast('Ops! Ocorreu um erro. Tente novamente.');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();