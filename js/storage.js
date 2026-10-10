window.CM = window.CM || {};

// Salvamento local seguro: se o navegador bloquear o localStorage,
// o jogo continua funcionando (só não guarda os dados ao fechar).
CM.Storage = (function () {
  'use strict';
  const PREFIX = 'conquistaMundial.';
  const memory = {};

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return key in memory ? memory[key] : fallback;
      return JSON.parse(raw);
    } catch (e) {
      return key in memory ? memory[key] : fallback;
    }
  }

  function set(key, value) {
    memory[key] = value;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignora */ }
  }

  return { get: get, set: set, remove: remove };
})();