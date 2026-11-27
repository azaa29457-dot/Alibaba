/* Alibaba — журнал игр и админ-панель.
   Журнал (FB.Log): каждая игра, созданная на этом компьютере, записывается в браузер (localStorage):
   когда, какой режим и тема, кто зашёл по коду (ник, аватарка, время входа), счёт и победитель.
   Ничего не уходит в интернет; IP-адреса и местоположение не собираются.
   Админ-панель (FB.Admin): открывается только по адресу сайта с #admin и только по паролю. */
(function (root) {
  'use strict';
  var FB = root.FB, UI = FB.UI, esc = UI.esc;

  /* ================= Журнал ================= */
  var L = FB.Log = {};
  var KEY = 'alibaba.log', MAX = 300, pending = null, timer = null;

  L.all = function () { var a = UI.store.get(KEY, []); return Array.isArray(a) ? a : []; };
  function kindOf(s) { return s.kind || (s.mode === 'phones' ? 'phones' : 'screen'); }
  function scoreOf(s, p) { return s.kind === 'traitor' ? (p.coins || 0) : (p.score || 0); }

  /* Кто победил: id игроков (и названия команд в Baamboozle) */
  function winners(s, rec) {
    var k = rec.kind;
    if (k === 'traitor') {
      if (!s.winner) return [];
      return Object.keys(s.players).filter(function (id) {
        var p = s.players[id];
        return p.role && ((s.winner === 'traitors') === (p.role === 'traitor'));
      });
    }
    if (k === 'screen' || k === 'phones') {
      var best = Math.max.apply(null, s.teams.map(function (t) { return t.score; }));
      var teams = [];
      s.teams.forEach(function (t, i) { if (t.score === best) teams.push(i); });
      rec.winTeams = teams.map(function (i) { return s.teams[i].name; });
      return Object.keys(s.players).filter(function (id) { return teams.indexOf(s.players[id].team) >= 0; });
    }
    var ids = Object.keys(s.players);
    if (!ids.length) return [];
    var top = Math.max.apply(null, ids.map(function (id) { return scoreOf(s, s.players[id]); }));
    return ids.filter(function (id) { return scoreOf(s, s.players[id]) === top; });
  }

  L.record = function (s) {
    if (!s || !s.id) return;
    var now = Date.now(), list = L.all();
    var i = -1;
    for (var j = 0; j < list.length; j++) if (list[j].id === s.id) { i = j; break; }
    var r = i >= 0 ? list[i] : { id: s.id, t0: s.created || now, players: {} };
    r.kind = kindOf(s);
    r.game = s.kind === 'blooket' ? s.game : null;
    r.title = s.cfg.title || ''; r.subtitle = s.cfg.subtitle || '';
    r.code = s.code || null;
    r.t1 = now; r.phase = s.phase; r.ended = s.phase === 'end';
    if (r.ended && !r.tEnd) r.tEnd = now;
    if (s.kind === 'traitor') { r.day = s.day; r.winSide = s.winner || null; }
    if (s.kind === 'kahoot') r.q = s.qs ? s.qs.length : 0;
    else if (s.kind === 'blooket' || s.kind === 'traitor') r.q = s.pool ? s.pool.length : 0;
    else if (s.tiles) r.q = s.tiles.filter(function (t) { return t.kind === 'q'; }).length;
    if (s.teams && !s.kind) r.teams = s.teams.map(function (t) { return { name: t.name, score: t.score, color: t.color }; });
    var seen = {};
    Object.keys(s.players || {}).forEach(function (id) {
      var p = s.players[id], o = r.players[id] || {};
      seen[id] = 1;
      o.name = p.name; o.av = p.av; o.joined = p.joined || o.joined || now;
      o.score = scoreOf(s, p);
      if (p.right != null) { o.right = p.right; o.wrong = p.wrong || 0; }
      if (p.team != null && s.teams) o.team = s.teams[p.team] ? s.teams[p.team].name : null;
      // роль в «Предателе» записывается только после конца игры — чтобы админка не помогала жульничать
      if (s.kind === 'traitor') { o.role = r.ended ? p.role : null; o.alive = r.ended ? !!p.alive : null; }
      o.left = false;
      r.players[id] = o;
    });
    Object.keys(r.players).forEach(function (id) { if (!seen[id]) r.players[id].left = true; });
    r.win = r.ended ? winners(s, r) : [];
    if (i >= 0) list.splice(i, 1);
    list.unshift(r);
    if (list.length > MAX) list.length = MAX;
    UI.store.set(KEY, list);
  };
  /* Записывать не чаще раза в 3 секунды; конец игры — сразу */
  L.touch = function (s) {
    pending = s;
    if (s && s.phase === 'end') { L.flush(); return; }
    if (!timer) timer = setTimeout(L.flush, 3000);
  };
  L.flush = function () {
    clearTimeout(timer); timer = null;
    if (pending) { var s = pending; pending = null; try { L.record(s); } catch (e) { } }
  };
  L.clear = function () { UI.store.del(KEY); };
  root.addEventListener('pagehide', L.flush);

  /* ================= Админ-панель ================= */
  var A = FB.Admin = {};
  var PASS = 'alibaba.adminPass', SESS = 'alibaba.adminOk';
  var MODES = { screen: 'Baamboozle', phones: 'Baamboozle', kahoot: 'Kahoot', blooket: 'Blooket', traitor: 'Предатель' };
  var BGAMES = { gold: 'Золотая лихорадка', hack: 'Кибер-хак', fish: 'Рыбалка' };
  var ROLES = { traitor: 'Предатель', medic: 'Медик', sheriff: 'Шериф', civ: 'Мирный житель' };
  var st = { tab: 'games', q: '', mode: '', open: null };

  function sess(v) {
    try { if (v === undefined) return sessionStorage.getItem(SESS) === '1'; if (v) sessionStorage.setItem(SESS, '1'); else sessionStorage.removeItem(SESS); } catch (e) { return false; }
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function hashPass(salt, pass) {
    var text = salt + '|' + pass;
    if (root.crypto && root.crypto.subtle && root.TextEncoder) {
      return root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
    }
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return Promise.resolve('d' + (h >>> 0).toString(16));
  }
  function randSalt() {
    var a = new Uint8Array(12);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0;
    return hex(a);
  }

  A.open = function () {
    if (FB.Host && FB.Host.active && FB.Host.active()) return;
    if (FB.FX && FB.FX.clearConfetti) FB.FX.clearConfetti();
    UI.applyTheme('space');
    if (!UI.store.get(PASS, null)) { lockScreen('new'); return; }
    if (!sess()) { lockScreen('enter'); return; }
    render();
  };
  function leave() {
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    UI.home();
  }

  function lockScreen(kind) {
    var isNew = kind === 'new';
    UI.screen('admin',
      '<div class="adm adm-lock"><form class="adm-lockcard" id="admLock" autocomplete="off">' +
        UI.wordmark('wordmark-sm') +
        '<h1>Админ-панель</h1>' +
        '<p>' + (isNew ? 'Придумайте пароль. Без него админ-панель никто не откроет. Запишите его — восстановить нельзя.' : 'Введите пароль.') + '</p>' +
        '<input type="password" id="admP1" placeholder="Пароль" aria-label="Пароль" minlength="4" required>' +
        (isNew ? '<input type="password" id="admP2" placeholder="Повторите пароль" aria-label="Повторите пароль" required>' : '') +
        '<p class="adm-err" id="admErr" role="alert"></p>' +
        '<button class="btn btn-yellow btn-lg" type="submit">' + (isNew ? 'Сохранить пароль' : 'Войти') + '</button>' +
        '<button class="btn btn-ghost btn-small" type="button" id="admBack">На сайт</button>' +
        (isNew ? '' : '<button class="adm-link" type="button" id="admForgot">Забыли пароль?</button>') +
      '</form></div>');
    var p1 = UI.$('#admP1'); p1.focus();
    UI.$('#admBack').addEventListener('click', leave);
    var fg = UI.$('#admForgot');
    if (fg) fg.addEventListener('click', function () {
      UI.confirm('Сбросить пароль можно только вместе со всей историей игр. Удалить историю и задать новый пароль?', 'Удалить и сбросить').then(function (ok) {
        if (!ok) return;
        L.clear(); UI.store.del(PASS); sess(false); lockScreen('new');
      });
    });
    UI.$('#admLock').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = UI.$('#admErr'), v = p1.value;
      if (isNew) {
        if (v.length < 4) { err.textContent = 'Пароль — хотя бы 4 символа'; p1.focus(); return; }
        if (v !== UI.$('#admP2').value) { err.textContent = 'Пароли не совпадают'; UI.$('#admP2').focus(); return; }
        var salt = randSalt();
        hashPass(salt, v).then(function (h) { UI.store.set(PASS, { salt: salt, hash: h }); sess(true); render(); });
        return;
      }
      var saved = UI.store.get(PASS, null);
      hashPass(saved.salt, v).then(function (h) {
        if (h === saved.hash) { sess(true); render(); }
        else { err.textContent = 'Неверный пароль'; p1.value = ''; p1.focus(); }
      });
    });
  }

  /* ---------- данные ---------- */
  function fmtDate(t) {
    if (!t) return '—';
    var d = new Date(t);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtTime(t) { return t ? new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'; }
  function fmtDur(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч ' + (m % 60) + ' мин';
  }
  function modeName(r) { return MODES[r.kind] + (r.game && BGAMES[r.game] ? ': ' + BGAMES[r.game] : ''); }
  function players(r) {
    return Object.keys(r.players || {}).map(function (id) { var p = r.players[id]; p.id = id; return p; })
      .sort(function (a, b) { return b.score - a.score || (a.joined || 0) - (b.joined || 0); });
  }
  function status(r) {
    if (r.ended) return ['done', 'Закончена'];
    if (Date.now() - (r.t1 || 0) < 15 * 60000) return ['live', 'Идёт'];
    return ['stop', 'Не доиграна'];
  }
  function winText(r) {
    if (!r.ended) return '—';
    if (r.kind === 'traitor') return r.winSide === 'town' ? 'Мирные жители' : (r.winSide === 'traitors' ? 'Предатели' : '—');
    if (r.winTeams && r.winTeams.length) return r.winTeams.join(', ');
    var ps = players(r).filter(function (p) { return (r.win || []).indexOf(p.id) >= 0; });
    return ps.length ? ps.map(function (p) { return p.name; }).join(', ') : '—';
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
  function filtered(list) {
    var q = norm(st.q);
    return list.filter(function (r) {
      if (st.mode && r.kind !== st.mode && !(st.mode === 'screen' && r.kind === 'phones')) return false;
      if (!q) return true;
      if (norm(r.title + ' ' + r.subtitle + ' ' + modeName(r)).indexOf(q) >= 0) return true;
      return players(r).some(function (p) { return norm(p.name).indexOf(q) >= 0; });
    });
  }
  function byPlayer(list) {
    var m = {};
    list.forEach(function (r) {
      players(r).forEach(function (p) {
        var k = norm(p.name);
        if (!k) return;
        var x = m[k] || (m[k] = { name: p.name, av: p.av, games: 0, wins: 0, right: 0, wrong: 0, last: 0, modes: {} });
        x.games++;
        if ((r.win || []).indexOf(p.id) >= 0) x.wins++;
        if (p.right != null) { x.right += p.right; x.wrong += p.wrong || 0; }
        if ((p.joined || 0) > x.last) { x.last = p.joined; x.av = p.av; x.name = p.name; }
        x.modes[MODES[r.kind]] = 1;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.games - a.games || b.last - a.last; });
  }

  /* ---------- отрисовка ---------- */
  function render() {
    L.flush();
    var list = L.all(), pl = byPlayer(list);
    var week = Date.now() - 7 * 86400000;
    var lastWeek = list.filter(function (r) { return r.t0 >= week; }).length;
    var cnt = {};
    list.forEach(function (r) { var k = MODES[r.kind]; cnt[k] = (cnt[k] || 0) + 1; });
    var fav = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '—';
    var joins = list.reduce(function (a, r) { return a + Object.keys(r.players || {}).length; }, 0);
    UI.screen('admin',
      '<div class="adm">' +
        '<header class="adm-top">' + UI.wordmark('wordmark-sm') + '<h1>Админ-панель</h1>' +
          '<span class="adm-tools">' +
            '<button class="btn btn-ghost btn-small" type="button" data-a="csv"' + (list.length ? '' : ' disabled') + '>Скачать таблицу</button>' +
            '<button class="btn btn-ghost btn-small" type="button" data-a="lock">Закрыть</button>' +
            '<button class="btn btn-yellow btn-small" type="button" data-a="home">На сайт</button>' +
          '</span></header>' +
        '<section class="adm-stats" aria-label="Итого">' +
          stat(list.length, UI.plural(list.length, 'игра', 'игры', 'игр'), 'всего') +
          stat(lastWeek, UI.plural(lastWeek, 'игра', 'игры', 'игр'), 'за 7 дней') +
          stat(pl.length, UI.plural(pl.length, 'игрок', 'игрока', 'игроков'), 'разных ников') +
          stat(joins, UI.plural(joins, 'вход', 'входа', 'входов'), 'по коду') +
          '<div class="adm-stat"><b class="sm">' + esc(fav) + '</b><span>любимый режим</span></div>' +
        '</section>' +
        '<nav class="adm-tabs" role="tablist">' +
          '<button type="button" role="tab" aria-selected="' + (st.tab === 'games') + '" data-tab="games">Игры</button>' +
          '<button type="button" role="tab" aria-selected="' + (st.tab === 'players') + '" data-tab="players">Игроки</button>' +
        '</nav>' +
        '<div class="adm-filter">' +
          '<input type="search" id="admQ" placeholder="' + (st.tab === 'games' ? 'Поиск по нику или теме' : 'Поиск по нику') + '" value="' + esc(st.q) + '" aria-label="Поиск">' +
          (st.tab === 'games' ? '<select id="admMode" aria-label="Режим"><option value="">Все режимы</option>' +
            ['screen', 'kahoot', 'blooket', 'traitor'].map(function (k) { return '<option value="' + k + '"' + (st.mode === k ? ' selected' : '') + '>' + MODES[k] + '</option>'; }).join('') + '</select>' : '') +
        '</div>' +
        '<main class="adm-body" id="admBody">' + (st.tab === 'games' ? gamesHtml(list) : playersHtml(pl)) + '</main>' +
        '<footer class="adm-foot">' +
          '<p>Здесь видны игры, созданные на этом компьютере. Записываются ники, время входа и счёт — без IP-адресов и местоположения. Данные хранятся только в этом браузере.</p>' +
          '<span><button class="adm-link" type="button" data-a="pass">Сменить пароль</button>' +
          '<button class="adm-link danger" type="button" data-a="clear"' + (list.length ? '' : ' disabled') + '>Очистить историю</button></span>' +
        '</footer>' +
      '</div>');
    bind();
  }
  function stat(n, unit, sub) { return '<div class="adm-stat"><b>' + n + '</b><span>' + unit + ' ' + sub + '</span></div>'; }

  function gamesHtml(list) {
    var rows = filtered(list);
    if (!list.length) return '<p class="adm-empty">Пока ни одной игры. Создайте игру на этом компьютере — она появится здесь.</p>';
    if (!rows.length) return '<p class="adm-empty">Ничего не нашлось.</p>';
    return '<ol class="adm-games">' + rows.map(function (r) {
      var ps = players(r), stt = status(r), open = st.open === r.id;
      var dur = (r.tEnd || r.t1 || r.t0) - r.t0;
      return '<li class="adm-game' + (open ? ' open' : '') + '">' +
        '<button type="button" class="adm-row" data-open="' + esc(r.id) + '" aria-expanded="' + open + '">' +
          '<span class="adm-when">' + fmtDate(r.t0) + '</span>' +
          '<span class="adm-mode m-' + r.kind + '">' + esc(modeName(r)) + '</span>' +
          '<span class="adm-title"><b>' + esc(r.title) + '</b><small>' + esc(r.subtitle) + '</small></span>' +
          '<span class="adm-n">' + ps.length + ' ' + UI.plural(ps.length, 'игрок', 'игрока', 'игроков') + '</span>' +
          '<span class="adm-win">' + esc(winText(r)) + '</span>' +
          '<span class="adm-st s-' + stt[0] + '">' + stt[1] + '</span>' +
        '</button>' +
        (open ? detailHtml(r, ps, dur) : '') +
      '</li>';
    }).join('') + '</ol>';
  }
  function detailHtml(r, ps, dur) {
    var tr = r.kind === 'traitor', hasTeam = ps.some(function (p) { return p.team; }), hasRight = ps.some(function (p) { return p.right != null; });
    var meta = [
      'Начало: ' + fmtDate(r.t0),
      'Длилась: ' + fmtDur(dur),
      r.code ? 'Код: ' + String(r.code).slice(0, 3) + ' ' + String(r.code).slice(3) : '',
      r.q ? 'Вопросов: ' + r.q : '',
      tr && r.day ? 'Дней: ' + r.day : ''
    ].filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
    var teams = r.teams && r.teams.length ? '<p class="adm-teams">' + r.teams.slice().sort(function (a, b) { return b.score - a.score; }).map(function (t) {
      return '<span style="--tc:' + esc(t.color) + '"><i></i>' + esc(t.name) + ' <b>' + t.score + '</b></span>';
    }).join('') + '</p>' : '';
    var table = ps.length ? '<table class="adm-table"><thead><tr><th>#</th><th>Ник</th><th>Зашёл</th>' + (hasTeam ? '<th>Команда</th>' : '') +
      (tr ? '<th>Роль</th>' : '') + (hasRight ? '<th>Верно</th>' : '') + '<th>' + (tr ? 'Монеты' : 'Счёт') + '</th></tr></thead><tbody>' +
      ps.map(function (p, i) {
        var won = (r.win || []).indexOf(p.id) >= 0;
        return '<tr class="' + (won ? 'won' : '') + (p.left ? ' left' : '') + '"><td>' + (i + 1) + '</td>' +
          '<td class="adm-nick">' + UI.avImg(p.av) + '<span>' + esc(p.name) + (p.left ? ' <small>вышел или удалён</small>' : '') + (won ? ' <small class="w">победа</small>' : '') + '</span></td>' +
          '<td>' + fmtTime(p.joined) + '</td>' + (hasTeam ? '<td>' + esc(p.team || '—') + '</td>' : '') +
          (tr ? '<td>' + (p.role ? esc(ROLES[p.role] || p.role) + (p.alive === false ? ' <small>выбыл</small>' : '') : '<small>после конца игры</small>') + '</td>' : '') +
          (hasRight ? '<td>' + (p.right != null ? p.right + ' из ' + (p.right + (p.wrong || 0)) : '—') + '</td>' : '') +
          '<td><b>' + p.score + '</b></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="adm-empty sm">' + (r.kind === 'screen' ? 'Игра на одном экране — без телефонов.' : 'Никто не зашёл.') + '</p>';
    return '<div class="adm-detail"><p class="adm-meta">' + meta + '</p>' + teams + table +
      '<button class="adm-link danger" type="button" data-del="' + esc(r.id) + '">Удалить эту игру из истории</button></div>';
  }
  function playersHtml(pl) {
    var q = norm(st.q);
    var rows = pl.filter(function (x) { return !q || norm(x.name).indexOf(q) >= 0; });
    if (!pl.length) return '<p class="adm-empty">Пока никто не заходил по коду.</p>';
    if (!rows.length) return '<p class="adm-empty">Ничего не нашлось.</p>';
    return '<table class="adm-table wide"><thead><tr><th>Ник</th><th>Игр</th><th>Побед</th><th>Верных ответов</th><th>Режимы</th><th>Последний раз</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var tot = x.right + x.wrong;
        return '<tr><td class="adm-nick">' + UI.avImg(x.av) + '<span>' + esc(x.name) + '</span></td><td><b>' + x.games + '</b></td><td>' + x.wins + '</td>' +
          '<td>' + (tot ? x.right + ' из ' + tot + ' (' + Math.round(x.right / tot * 100) + '%)' : '—') + '</td>' +
          '<td>' + esc(Object.keys(x.modes).join(', ')) + '</td><td>' + fmtDate(x.last) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function bind() {
    var el = UI.$('.adm');
    el.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-tab]'))) { st.tab = t.getAttribute('data-tab'); st.q = ''; render(); return; }
      if ((t = e.target.closest('[data-open]'))) { var id = t.getAttribute('data-open'); st.open = st.open === id ? null : id; rerender(); return; }
      if ((t = e.target.closest('[data-del]'))) {
        var did = t.getAttribute('data-del');
        UI.confirm('Удалить эту игру из истории?', 'Удалить').then(function (ok) {
          if (!ok) return;
          UI.store.set(KEY, L.all().filter(function (r) { return r.id !== did; }));
          render();
        });
        return;
      }
      if (!(t = e.target.closest('[data-a]'))) return;
      switch (t.getAttribute('data-a')) {
        case 'home': leave(); break;
        case 'lock': sess(false); leave(); break;
        case 'csv': csv(); break;
        case 'pass': UI.store.del(PASS); sess(false); lockScreen('new'); break;
        case 'clear':
          UI.confirm('Удалить всю историю игр? Это нельзя отменить.', 'Удалить').then(function (ok) { if (ok) { L.clear(); render(); } });
          break;
      }
    });
    var q = UI.$('#admQ');
    q.addEventListener('input', function () { st.q = q.value; rerender(); });
    var md = UI.$('#admMode');
    if (md) md.addEventListener('change', function () { st.mode = md.value; rerender(); });
  }
  function rerender() {
    var list = L.all();
    UI.$('#admBody').innerHTML = st.tab === 'games' ? gamesHtml(list) : playersHtml(byPlayer(list));
  }

  /* Таблица для Excel: одна строка — один игрок в одной игре */
  function csv() {
    var rows = [['Дата', 'Режим', 'Тема', 'Предмет', 'Ник', 'Зашёл', 'Команда', 'Роль', 'Верно', 'Неверно', 'Счёт', 'Победа']];
    L.all().forEach(function (r) {
      var ps = players(r);
      if (!ps.length) rows.push([fmtDate(r.t0), modeName(r), r.title, r.subtitle, '', '', '', '', '', '', '', '']);
      ps.forEach(function (p) {
        rows.push([fmtDate(r.t0), modeName(r), r.title, r.subtitle, p.name, fmtTime(p.joined), p.team || '', p.role ? ROLES[p.role] || p.role : '',
          p.right != null ? p.right : '', p.right != null ? p.wrong || 0 : '', p.score, (r.win || []).indexOf(p.id) >= 0 ? 'да' : '']);
      });
    });
    var text = '﻿' + rows.map(function (row) {
      return row.map(function (c) { c = String(c == null ? '' : c); return /[";\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'alibaba-igry-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
})(window);
