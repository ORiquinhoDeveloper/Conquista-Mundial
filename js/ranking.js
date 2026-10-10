window.CM = window.CM || {};

CM.Ranking = (function () {
  'use strict';

  // DADOS DE DEMONSTRAÇÃO (fictícios). Não é um ranking global real.
  const DEMO = [
    { name: 'Almirante Vega', avatar: '🐉', wins: 142, losses: 38, score: 1840 },
    { name: 'Capitã Maré', avatar: '🦈', wins: 120, losses: 55, score: 1520 },
    { name: 'Lorde Atol', avatar: '🦁', wins: 98, losses: 40, score: 1210 },
    { name: 'Rainha Coral', avatar: '🐙', wins: 77, losses: 49, score: 940 },
    { name: 'Capitão Brisa', avatar: '🦅', wins: 61, losses: 44, score: 720 },
    { name: 'Navegante Sul', avatar: '🐺', wins: 45, losses: 41, score: 510 },
    { name: 'Pirata Névoa', avatar: '🦊', wins: 30, losses: 36, score: 340 },
    { name: 'Marujo Ágil', avatar: '🐻', wins: 18, losses: 27, score: 190 }
  ];

  function rate(w, l) {
    const g = w + l;
    return g ? Math.round((w / g) * 100) + '%' : '0%';
  }

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function render() {
    const p = CM.Profile.get();
    const list = DEMO.map(function (d) { return Object.assign({ me: false }, d); });
    list.push({ name: p.name + ' (você)', avatar: p.avatar, wins: p.wins, losses: p.losses, score: p.score, me: true });
    list.sort(function (a, b) { return b.score - a.score || b.wins - a.wins; });

    const body = document.getElementById('ranking-body');
    body.textContent = '';
    list.forEach(function (row, i) {
      const tr = document.createElement('tr');
      if (row.me) tr.className = 'me';
      tr.appendChild(cell(String(i + 1)));
      const tdName = document.createElement('td');
      const wrap = document.createElement('span');
      wrap.className = 'pname';
      const av = document.createElement('span');
      av.className = 'mini';
      av.textContent = row.avatar;
      const nm = document.createElement('span');
      nm.textContent = row.name;
      wrap.appendChild(av);
      wrap.appendChild(nm);
      tdName.appendChild(wrap);
      tr.appendChild(tdName);
      tr.appendChild(cell(String(row.wins)));
      tr.appendChild(cell(String(row.losses)));
      tr.appendChild(cell(String(row.score)));
      tr.appendChild(cell(rate(row.wins, row.losses)));
      body.appendChild(tr);
    });
  }

  return { render: render };
})();