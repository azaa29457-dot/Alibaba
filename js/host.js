/* Alibaba — экран организатора: лобби, игровое поле, вопрос, бонусы, итоги. */
(function (root) {
  'use strict';
  var FB = root.FB, E = FB.Engine, UI = FB.UI, FX = FB.FX;
  var esc = UI.esc;
  var H = FB.Host = {};
  var ANS_COLORS = ['#6A4DFF', '#008F7A', '#E06A00', '#E0337F'];

  var s = null;          // состояние игры (движок)
  var net = null;        // сеть (только режим с телефонами)
  var netStatus = null;
  var timers = [];
  var raf = 0;
  var built = null;      // какой экран сейчас построен
  var ovKey = null;      // какой оверлей построен
  var lastTickSec = null;

  /* ---------- Сохранение ---------- */
  H.savedGame = function () {
    var g = UI.store.get('alibaba.host', null);
    if (!g || !g.s || !g.s.tiles || g.s.phase === 'end') return null;
    if (Date.now() - (g.t || 0) > 12 * 3600 * 1000) return null;
    return { title: g.s.cfg.title, left: E.leftTiles(g.s) };
  };
  H.clearSave = function () { UI.store.del('alibaba.host'); };
  function save() { if (s) UI.store.set('alibaba.host', { t: Date.now(), s: s }); }

  /* ---------- Запуск ---------- */
  H.create = function (cfg) {
    H.stop();
    if (cfg.mode === 'phones') cfg.code = FB.Net.makeCode();
    s = E.createGame(cfg, Date.now());
    save();
    begin(false);
  };
  H.resume = function () {
    var g = UI.store.get('alibaba.host', null);
    if (!g || !g.s) { UI.home(); return; }
    H.stop();
    s = g.s;
    Object.keys(s.players || {}).forEach(function (k) { s.players[k].online = false; });
    if (s.cur && s.cur.deadline) s.cur.deadline = Date.now() + s.cfg.timer * 1000; // время на вопрос заново
    s.v++;
    save();
    begin(true);
  };
  H.stop = function () {
    timers.forEach(function (t) { clearInterval(t); });
    timers = [];
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (net) { var n = net; net = null; setTimeout(function () { n.stop(); }, 400); }
    netStatus = null;
    built = null; ovKey = null;
    removeCelebration();
    root.onbeforeunload = null;
    document.removeEventListener('keydown', onKey);
    FX._wantAwake = false;
  };
  H.active = function () { return !!s && built !== null; };

  function begin(resumed) {
    UI.applyTheme(s.cfg.theme);
    FX._wantAwake = true;
    FX.keepAwake();
    if (s.mode === 'phones') startNet(resumed);
    timers.push(setInterval(tick, 200));
    timers.push(setInterval(presence, 3000));
    timers.push(setInterval(function () { broadcast(); }, 5000));
    document.addEventListener('keydown', onKey);
    root.onbeforeunload = function (e) {
      if (s && s.phase !== 'end') { e.preventDefault(); e.returnValue = ''; return ''; }
    };
    render(true);
    raf = requestAnimationFrame(frame);
  }

  function startNet(resumed) {
    netStatus = { peer: 'connecting', mqtt: [], loading: true };
    FB.Net.ready().then(function (libs) {
      if (!s) return;
      if (!libs.mqtt && !libs.peer) { netStatus = { failed: true, peer: 'error', mqtt: [] }; render(); return; }
      net = new FB.Net.HostNet(s.code, {
        onMsg: onMsg,
        onStatus: function (st) { netStatus = st; renderNet(); },
        onChannelUp: function () { broadcast(); },
        onCodeTaken: function () {
          s.code = FB.Net.makeCode(); s.v++; save();
          net = null; startNet(false); render();
        }
      }, { strictCode: !resumed });
      net.start();
    });
  }

  /* ---------- Действия ---------- */
  H.act = function (a) {
    if (!s) return false;
    var r = E.act(s, a, Date.now());
    if (r.ok) {
      save();
      broadcast();
      render();
      fxEvents(r.events);
    }
    return r.ok;
  };
  /* ---------- Праздник победы ---------- */
  var celT = null;
  function removeCelebration() {
    clearTimeout(celT);
    var el = document.getElementById('celebrate');
    if (el) el.remove();
  }
  function celebrate() {
    if (!s || s.phase !== 'end') return;
    removeCelebration();
    var rk = E.ranking(s.teams), top = rk[0];
    var tie = rk.length > 1 && rk[1].t.score === top.t.score;
    var vid = UI.videoEmbed(s.cfg.winVideo);
    var el = document.createElement('div');
    el.id = 'celebrate';
    el.className = 'celebrate' + (vid ? ' with-video' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Победа');
    el.style.setProperty('--tc', top.t.color);
    var dancers = ['dance1', 'party', 'monkey', 'robot', 'unicorn', 'cool', 'dance2'];
    var pops = ['fireworks', 'confetti', 'clap', 'hundred', 'fireworks', 'starstruck'];
    el.innerHTML = '<div class="cel-rays" aria-hidden="true"></div>' +
      pops.map(function (n, i) { return '<img class="cel-pop p' + i + '" src="img/ui/' + n + '.webp" alt="" aria-hidden="true">'; }).join('') +
      '<div class="cel-in">' +
        '<img class="cel-trophy" src="img/ui/trophy.webp" alt="">' +
        '<h2 class="cel-title">' + (tie ? 'Ничья!' : 'Победа!') + '</h2>' +
        (tie ? '' : '<p class="cel-team"><span>' + esc(top.t.name) + '</span></p>') +
        (vid ? '<div class="cel-video">' + vid + '</div>' :
          '<div class="cel-dancers" aria-hidden="true">' + dancers.map(function (n, i) { return '<img src="img/ui/' + n + '.webp" alt="" style="--i:' + i + '">'; }).join('') + '</div>') +
        '<button class="btn btn-yellow btn-lg" type="button" id="celClose">Итоги</button>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#celClose').addEventListener('click', removeCelebration);
    FX.play('win');
    FX.confetti({ count: 240, rain: true });
    setTimeout(function () { FX.confetti({ count: 140, y: innerHeight * 0.35, power: 13 }); }, 900);
    setTimeout(function () { FX.confetti({ count: 120, x: innerWidth * 0.2, y: innerHeight * 0.5, power: 11 }); FX.confetti({ count: 120, x: innerWidth * 0.8, y: innerHeight * 0.5, power: 11 }); }, 1800);
    if (!vid) celT = setTimeout(removeCelebration, 10000);
  }
  function closePlayers() { if (net) net.broadcast({ t: 'closed' }); }
  function broadcast() {
    if (net && s) net.broadcast({ t: 'state', s: E.view(s) });
  }

  function onMsg(pid, m, via) {
    if (!s) return;
    var p = s.players[pid];
    if (m.t === 'hello') {
      net.reply(via, pid, { t: 'welcome', s: E.view(s) });
      if (p) touch(pid);
      return;
    }
    if (p) touch(pid);
    switch (m.t) {
      case 'join':
        H.act({ type: 'join', pid: pid, name: m.name, team: Number(m.team), av: m.av });
        net.sendTo(pid, { t: 'state', s: E.view(s) });
        break;
      case 'team': H.act({ type: 'setTeam', pid: pid, team: Number(m.team) }); break;
      case 'pick': if (p) H.act({ type: 'pick', tile: Number(m.tile), team: p.team }); break;
      case 'vote': H.act({ type: 'vote', pid: pid, opt: Number(m.opt) }); break;
      case 'target': if (p) H.act({ type: 'target', target: Number(m.target), team: p.team }); break;
      case 'bye': H.act({ type: 'online', pid: pid, on: false }); break;
      case 'sync': net.sendTo(pid, { t: 'state', s: E.view(s) }); break;
    }
  }
  function touch(pid) {
    var p = s.players[pid];
    if (!p) return;
    p.last = Date.now();
    if (!p.online) H.act({ type: 'online', pid: pid, on: true });
  }
  function presence() {
    if (!s || s.mode !== 'phones') return;
    var now = Date.now();
    Object.keys(s.players).forEach(function (k) {
      var p = s.players[k];
      if (p.online && now - (p.last || 0) > 15000) H.act({ type: 'online', pid: k, on: false });
    });
  }
  function tick() {
    if (!s || s.phase !== 'question' || !s.cur || !s.cur.deadline) { lastTickSec = null; return; }
    var remain = s.cur.deadline - Date.now();
    if (remain <= 0) { H.act({ type: 'timeout' }); return; }
    var sec = Math.ceil(remain / 1000);
    if (sec <= 5 && sec !== lastTickSec) { lastTickSec = sec; FX.play('tick'); }
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    var fill = document.querySelector('.ov-q .ruler-fill');
    if (!fill || !s || !s.cur) return;
    var secEl = document.querySelector('.ov-q .ruler-sec');
    if (s.phase === 'question' && s.cur.deadline) {
      var total = s.cfg.timer * 1000, remain = Math.max(0, s.cur.deadline - Date.now());
      fill.style.transform = 'scaleX(' + (remain / total).toFixed(4) + ')';
      var sec = Math.ceil(remain / 1000);
      if (secEl && secEl.textContent !== String(sec)) secEl.textContent = String(sec);
      fill.parentNode.classList.toggle('low', remain <= 5000);
    }
  }

  function fxEvents(evs) {
    evs.forEach(function (e) {
      switch (e.type) {
        case 'open': FX.play('open'); break;
        case 'correct':
          FX.play('correct');
          setTimeout(function () {
            var card = document.querySelector('.team-card[data-team="' + e.team + '"]');
            var r = card ? card.getBoundingClientRect() : null;
            FX.confetti({ count: 70, x: r ? r.left + r.width / 2 : innerWidth / 2, y: r ? r.top + r.height / 3 : innerHeight / 2, power: 8 });
          }, 60);
          break;
        case 'wrong': FX.play('wrong'); break;
        case 'timeup': FX.play('timeup'); break;
        case 'openPower': FX.play('bonus'); break;
        case 'power':
          setTimeout(function () {
            FX.play(e.mood > 0 ? 'good' : (e.mood < 0 ? 'bad' : 'neutral'));
            if (e.mood > 0) FX.confetti({ count: 100, y: innerHeight * 0.35 });
          }, 1000);
          break;
        case 'join': FX.play('join'); break;
        case 'vote': FX.play('vote'); break;
        case 'end':
          setTimeout(celebrate, 250);
          break;
        case 'restart': removeCelebration(); break;
      }
    });
  }

  function onKey(e) {
    if (!s) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.modal-wrap')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.getElementById('celebrate') && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) { removeCelebration(); e.preventDefault(); return; }
    var k = e.key;
    if (k === 'f' || k === 'F' || k === 'а' || k === 'А') { toggleFull(); return; }
    if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') { toggleSound(); return; }
    if (s.phase === 'question' && /^[1-4]$/.test(k)) { H.act({ type: 'answer', opt: Number(k) - 1 }); e.preventDefault(); return; }
    if ((k === ' ' || k === 'Enter') && (s.phase === 'reveal' || s.phase === 'bonusReveal')) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && k === 'Enter') return;
      H.act({ type: 'next' }); e.preventDefault();
    }
  }
  function toggleFull() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { });
    } catch (e) { }
  }
  function toggleSound() {
    FX.setMuted(!FX.isMuted());
    UI.$$('[data-act="sound"]').forEach(function (b) { b.innerHTML = soundIcon(); b.setAttribute('aria-label', FX.isMuted() ? 'Включить звук' : 'Выключить звук'); });
  }
  function soundIcon() { return FX.isMuted() ? '🔇' : '🔊'; }

  /* ================= Рендер ================= */
  function render(force) {
    if (!s) return;
    var v = E.view(s);
    var want = v.phase === 'lobby' ? 'lobby' : (v.phase === 'end' ? 'end' : 'game');
    if (force || built !== want) {
      built = want; ovKey = null;
      if (want === 'lobby') buildLobby(v);
      else if (want === 'end') buildEnd(v);
      else buildGame(v);
    }
    if (want === 'lobby') updateLobby(v);
    else if (want === 'game') updateGame(v);
  }

  function topBar(v, extra) {
    return '<header class="g-top">' +
      '<div class="g-brand">' + UI.wordmark('wordmark-sm') + '<span class="g-title"><b>' + esc(v.title) + '</b>' +
        (v.subtitle ? '<span>' + esc(v.subtitle) + '</span>' : '') + '</span></div>' +
      (extra || '') +
      '<div class="g-tools">' +
        (v.mode === 'phones' && v.phase !== 'lobby' ? '<button class="chip-btn" data-act="code" type="button" aria-label="Показать код для входа">Код <b>' + esc(UI.fmtCode(v.code)) + '</b></button>' : '') +
        '<button class="icon-btn" data-act="sound" type="button" aria-label="' + (FX.isMuted() ? 'Включить звук' : 'Выключить звук') + '" title="Звук (M)">' + soundIcon() + '</button>' +
        '<button class="icon-btn" data-act="full" type="button" aria-label="Во весь экран" title="Во весь экран (F)">⛶</button>' +
        '<button class="icon-btn" data-act="menu" type="button" aria-label="Меню" title="Меню">☰</button>' +
      '</div></header>';
  }
  function bindTop(el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'sound') toggleSound();
      else if (a === 'full') toggleFull();
      else if (a === 'code') showCode();
      else if (a === 'menu') showMenu(b);
    });
  }
  function showMenu(anchor) {
    var old = document.querySelector('.menu-pop');
    if (old) { old.remove(); return; }
    var m = document.createElement('div');
    m.className = 'menu-pop';
    m.setAttribute('role', 'menu');
    var items = [];
    if (s.phase === 'board') items.push(['skip', 'Передать ход следующей команде']);
    if (s.phase !== 'end' && s.phase !== 'lobby') items.push(['end', 'Завершить игру и показать итоги']);
    items.push(['home', 'Выйти на главную']);
    m.innerHTML = items.map(function (i) { return '<button role="menuitem" type="button" data-m="' + i[0] + '">' + i[1] + '</button>'; }).join('');
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 8) + 'px';
    m.style.right = Math.max(8, innerWidth - r.right) + 'px';
    m.querySelector('button').focus();
    function close() { m.remove(); document.removeEventListener('click', outside, true); }
    function outside(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
    setTimeout(function () { document.addEventListener('click', outside, true); }, 0);
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]');
      if (!b) return;
      var k = b.getAttribute('data-m');
      close();
      if (k === 'skip') H.act({ type: 'skip' });
      else if (k === 'end') UI.confirm('Завершить игру сейчас и показать итоги?', 'Завершить').then(function (ok) { if (ok) H.act({ type: 'end' }); });
      else if (k === 'home') {
        var msg = s.phase === 'end' ? 'Выйти на главную?' : 'Выйти на главную? Игру можно будет продолжить с главной страницы.';
        UI.confirm(msg, 'Выйти').then(function (ok) {
          if (!ok) return;
          if (s.phase === 'end') { H.clearSave(); closePlayers(); }
          s = null; H.stop(); UI.home();
        });
      }
    });
  }
  function showCode() {
    var w = document.createElement('div');
    w.className = 'modal-wrap';
    var url = UI.joinUrl(s.code);
    w.innerHTML = '<div class="modal modal-code" role="dialog" aria-modal="true" aria-label="Код для входа">' +
      '<p class="lbl">Код игры</p><div class="big-code">' + esc(UI.fmtCode(s.code)) + '</div>' +
      '<div class="qr">' + UI.qrSvg(url) + '</div><p class="url">' + esc(url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')) + '</p>' +
      '<button class="btn btn-yellow" type="button">Закрыть</button></div>';
    document.body.appendChild(w);
    w.querySelector('button').focus();
    w.addEventListener('click', function (e) { if (e.target === w || e.target.tagName === 'BUTTON') w.remove(); });
  }

  /* ---------- Лобби ---------- */
  function buildLobby(v) {
    var url = UI.joinUrl(v.code);
    var isFile = location.protocol === 'file:';
    UI.screen('lobby',
      '<div class="lobby">' + topBar(v) +
        '<div class="lobby-main">' +
          '<section class="join-info">' +
            '<p class="lbl">Откройте на телефоне</p>' +
            '<p class="url">' + esc(url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')) + '</p>' +
            '<p class="lbl">и введите код</p>' +
            '<div class="big-code" aria-label="Код игры ' + esc(v.code) + '">' + esc(UI.fmtCode(v.code)) + '</div>' +
            '<div class="qr" aria-label="QR-код для входа">' + UI.qrSvg(url) + '</div>' +
            '<p class="lbl small">или наведите камеру на QR-код</p>' +
            (isFile ? '<p class="warn">Сайт открыт как файл с компьютера. Телефоны смогут зайти, только когда сайт опубликован в интернете (например, на GitHub Pages).</p>' : '') +
            '<div class="net" id="netStatus"></div>' +
          '</section>' +
          '<section class="lobby-teams" id="lobbyTeams"></section>' +
        '</div>' +
        '<footer class="lobby-bar">' +
          '<span id="lobbyCount" class="lobby-count"></span>' +
          '<span class="row-gap">' +
            '<button class="btn btn-ghost" type="button" id="shuffleBtn">Перемешать команды</button>' +
            '<button class="btn btn-yellow btn-lg" type="button" id="startBtn">Начать игру</button>' +
          '</span>' +
        '</footer>' +
      '</div>');
    var root_ = UI.app();
    bindTop(root_.querySelector('.g-top'));
    UI.$('#shuffleBtn').addEventListener('click', function () {
      if (!H.act({ type: 'shuffleTeams' })) UI.toast('Пока некого перемешивать');
    });
    UI.$('#startBtn').addEventListener('click', function () {
      var n = Object.keys(s.players).length;
      var go = function () { FX.unlock(); H.act({ type: 'start' }); };
      if (!n) UI.confirm('Ещё никто не зашёл с телефона. Начать без игроков? Отвечать можно будет и с этого экрана.', 'Начать').then(function (ok) { if (ok) go(); });
      else go();
    });
    UI.$('#lobbyTeams').addEventListener('click', function (e) {
      var k = e.target.closest('[data-kick]');
      if (k) {
        var pid = k.getAttribute('data-kick');
        var p = s.players[pid];
        if (!p) return;
        UI.confirm('Удалить игрока «' + p.name + '» из игры?', 'Удалить').then(function (ok) {
          if (ok && s.players[pid]) { if (net) net.sendTo(pid, { t: 'kicked' }); H.act({ type: 'kick', pid: pid }); }
        });
        return;
      }
      var c = e.target.closest('[data-pid]');
      if (c) {
        var pl = s.players[c.getAttribute('data-pid')];
        if (pl) H.act({ type: 'setTeam', pid: pl.id, team: (pl.team + 1) % s.teams.length, byHost: true });
      }
    });
    renderNet();
  }
  function updateLobby(v) {
    var html = v.teams.map(function (t, i) {
      var ps = v.players.filter(function (p) { return p.team === i; });
      return '<div class="lt" style="--tc:' + t.color + '">' +
        '<h3><span class="dot"></span>' + esc(t.name) + '<span class="lt-n">' + ps.length + '</span></h3>' +
        '<div class="chips">' + (ps.length ? ps.map(function (p) {
          return '<span class="chip' + (p.on ? '' : ' off') + '" data-pid="' + esc(p.id) + '" title="Нажмите, чтобы перевести в другую команду">' +
            '<span class="av" aria-hidden="true">' + esc(p.av) + '</span>' + esc(p.name) +
            '<button type="button" class="chip-x" data-kick="' + esc(p.id) + '" aria-label="Удалить ' + esc(p.name) + '">×</button></span>';
        }).join('') : '<span class="chips-empty">Пока никого</span>') + '</div></div>';
    }).join('');
    UI.patch(UI.$('#lobbyTeams'), html);
    var n = v.players.length;
    var lc = UI.$('#lobbyCount');
    if (lc) lc.textContent = n ? ('В игре ' + n + ' ' + UI.plural(n, 'игрок', 'игрока', 'игроков') + '. Нажмите на имя, чтобы перевести в другую команду.') : 'Ждём игроков…';
  }
  function renderNet() {
    var el = UI.$('#netStatus');
    if (!el) return;
    var st = netStatus || {};
    if (st.failed) { el.innerHTML = '<span class="net-bad">Не удалось загрузить модули связи. Обновите страницу.</span>'; return; }
    var chans = [['Канал 1', st.peer]].concat((st.mqtt || []).map(function (m, i) { return ['Канал ' + (i + 2), m]; }));
    var up = chans.some(function (c) { return c[1] === 'ok'; });
    var allBad = chans.length > 1 && chans.every(function (c) { return c[1] === 'error'; });
    el.innerHTML = '<span class="net-line">' + (up ? 'Связь для телефонов готова' : (allBad ? 'Нет связи с серверами. Проверьте интернет — или играйте на одном экране.' : 'Подключаемся к серверам связи…')) + '</span>' +
      '<span class="net-dots">' + chans.map(function (c) {
        var cls = c[1] === 'ok' ? 'ok' : (c[1] === 'error' ? 'bad' : 'wait');
        return '<i class="' + cls + '" title="' + c[0] + ': ' + (cls === 'ok' ? 'работает' : cls === 'bad' ? 'недоступен' : 'подключается') + '"></i>';
      }).join('') + '</span>';
  }

  /* ---------- Игровое поле ---------- */
  function buildGame(v) {
    var n = v.tiles.length;
    var cols = n <= 4 ? n : (n <= 12 ? 4 : (n <= 25 ? 5 : 6));
    var rows = Math.ceil(n / cols);
    var two = v.teams.length === 2;
    var teamCards = v.teams.map(function (t, i) {
      return '<div class="team-card" data-team="' + i + '" style="--tc:' + t.color + ';grid-area:t' + i + '">' +
        '<div class="tc-name">' + esc(t.name) + '</div>' +
        '<div class="tc-score" data-val="' + t.score + '">' + t.score + '</div>' +
        '<div class="tc-turn">Ваш ход</div>' +
        '<div class="tc-meta"></div>' +
        '<div class="tc-adj"><button type="button" data-adj="-5" aria-label="Минус 5 очков команде ' + esc(t.name) + '">−5</button>' +
        '<button type="button" data-adj="5" aria-label="Плюс 5 очков команде ' + esc(t.name) + '">+5</button></div>' +
      '</div>';
    }).join('');
    UI.screen('game',
      '<div class="game">' + topBar(v, '<div class="g-progress" id="progress"></div>') +
        '<div class="g-main ' + (two ? 'two' : 'many') + '" data-n="' + v.teams.length + '">' +
          teamCards +
          '<div class="board-wrap" style="grid-area:board">' +
            '<div class="board" id="board" style="--cols:' + cols + ';--rows:' + rows + '"></div>' +
            '<p class="board-hint" id="boardHint"></p>' +
          '</div>' +
        '</div>' +
        '<div id="overlay"></div>' +
      '</div>');
    var g = UI.$('.game');
    bindTop(g.querySelector('.g-top'));
    UI.$('#board').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tile]');
      if (t && s.phase === 'board') { FX.unlock(); H.act({ type: 'pick', tile: Number(t.getAttribute('data-tile')) }); }
    });
    g.querySelector('.g-main').addEventListener('click', function (e) {
      var b = e.target.closest('[data-adj]');
      if (!b) return;
      var team = Number(b.closest('[data-team]').getAttribute('data-team'));
      H.act({ type: 'adjust', team: team, delta: Number(b.getAttribute('data-adj')) });
    });
    UI.$('#overlay').addEventListener('click', onOverlayClick);
  }

  function updateGame(v) {
    var pr = UI.$('#progress');
    if (pr) pr.textContent = 'Осталось ' + v.left + ' из ' + v.tiles.length;
    v.teams.forEach(function (t, i) {
      var card = document.querySelector('.team-card[data-team="' + i + '"]');
      if (!card) return;
      card.classList.toggle('turn', v.turn === i);
      FX.countTo(card.querySelector('.tc-score'), t.score);
      var meta = 'Верно ' + t.correct + ' из ' + t.answered;
      if (v.mode === 'phones') meta += '<br>' + t.players + ' ' + UI.plural(t.players, 'игрок', 'игрока', 'игроков');
      UI.patch(card.querySelector('.tc-meta'), meta);
    });
    var boardHtml = v.tiles.map(function (t, i) {
      if (t.used) {
        var tc = t.by != null && v.teams[t.by] ? v.teams[t.by].color : '#fff';
        var cur = v.cur && v.cur.tile === i;
        var res = '';
        if (t.kind === 'p') res = '<span class="tile-ico" aria-label="бонус">' + UI.powerImg(t.icon) + '</span>';
        else if (!(cur && t.ok == null)) res = '<span class="tile-res" aria-label="' + (t.ok ? 'верно' : 'неверно') + '">' + (t.ok ? '✓' : '✗') + '</span>';
        return '<div class="tile used' + (t.kind === 'p' ? ' pw' : (t.ok ? ' ok' : ' no')) + (cur ? ' current' : '') + '" style="--tc:' + tc + '">' +
          '<span class="tile-n">' + t.n + '</span>' + res + '</div>';
      }
      return '<button type="button" class="tile c' + t.c + '" data-tile="' + i + '" aria-label="Плитка ' + t.n + '" style="animation-delay:' + Math.min(i * 22, 700) + 'ms">' +
        '<span class="tile-n">' + t.n + '</span></button>';
    }).join('');
    UI.patch(UI.$('#board'), boardHtml);
    var hint = '';
    if (v.phase === 'board') {
      var tn = v.teams[v.turn];
      hint = 'Ход команды <b style="color:' + tn.color + '">' + esc(tn.name) + '</b>: ' +
        (v.mode === 'phones' && tn.players ? 'выберите плитку на телефоне' + (tn.players > 1 ? ' (любой игрок команды)' : '') + ' или здесь' : 'выберите плитку');
    }
    UI.patch(UI.$('#boardHint'), hint);
    updateOverlay(v);
  }

  /* ---------- Оверлей: вопрос и бонус ---------- */
  function updateOverlay(v) {
    var ov = UI.$('#overlay');
    if (!ov) return;
    var c = v.cur, key = null;
    if (c && c.kind === 'q' && (v.phase === 'question' || v.phase === 'reveal')) key = 'q' + c.tile;
    else if (c && c.kind === 'p' && (v.phase === 'target' || v.phase === 'bonusReveal')) key = 'p' + c.tile;
    if (key !== ovKey) {
      ovKey = key;
      if (!key) { ov.innerHTML = ''; ov.className = ''; return; }
      ov.className = 'on';
      ov.innerHTML = key[0] === 'q' ? qHtml(v) : pHtml(v);
      if (key[0] === 'p') setTimeout(function () { var f = UI.$('.ov-p .pflip'); if (f) f.classList.add('flipped'); }, 500);
    }
    if (!key) return;
    if (key[0] === 'q') updateQ(v); else updateP(v);
  }

  function qHtml(v) {
    var c = v.cur, team = v.teams[v.turn];
    var dl = { 1: 'лёгкий', 2: 'средний', 3: 'сложный' }[c.d];
    var len = c.text.length;
    var size = len > 140 ? 'q-long' : (len > 80 ? 'q-mid' : '');
    return '<div class="ov-q" style="--tc:' + team.color + '">' +
      '<div class="qcard" role="dialog" aria-modal="true" aria-label="Вопрос ' + c.n + '">' +
        '<img class="q-stamp" alt="" hidden>' +
        '<div class="q-head">' +
          '<span class="q-num">Плитка ' + c.n + '</span>' +
          '<span class="q-pts d' + c.d + '">' + c.pts + ' очков, ' + dl + '</span>' +
          '<span class="q-team">Отвечает <b>' + esc(team.name) + '</b></span>' +
        '</div>' +
        '<p class="q-topic">' + esc(c.topic) + '</p>' +
        '<h2 class="q-text ' + size + '">' + esc(c.text) + '</h2>' +
        (v.cfg.timer ? '<div class="ruler" aria-hidden="true"><div class="ruler-fill"></div><span class="ruler-sec">' + Math.ceil((c.remain || 0) / 1000) + '</span></div>' : '') +
        '<div class="answers">' + c.opts.map(function (o, i) {
          return '<button type="button" class="ans" data-opt="' + i + '" style="--ac:' + ANS_COLORS[i] + '">' +
            '<span class="ans-l">' + UI.LETTERS[i] + '</span><span class="ans-t">' + esc(o) + '</span>' +
            '<span class="ans-votes" aria-hidden="true"></span></button>';
        }).join('') + '</div>' +
        '<div class="q-foot">' +
          '<span class="q-info" id="qInfo"></span>' +
          '<span class="q-result" id="qResult" role="status"></span>' +
          '<span class="row-gap">' +
            '<button type="button" class="btn btn-ghost-dark" data-q="reveal">Показать ответ</button>' +
            '<button type="button" class="btn btn-yellow btn-lg" data-q="next" hidden>Дальше</button>' +
          '</span>' +
        '</div>' +
      '</div></div>';
  }
  function updateQ(v) {
    var c = v.cur, open = v.phase === 'question';
    var card = UI.$('.ov-q');
    card.classList.toggle('revealed', !open);
    UI.$$('.ov-q .ans').forEach(function (b, i) {
      b.disabled = !open;
      b.classList.toggle('right', !open && c.correct === i);
      b.classList.toggle('wrong', !open && c.chosen === i && c.correct !== i);
      b.classList.toggle('dim', !open && c.correct !== i && c.chosen !== i);
      b.classList.toggle('chosen', !open && c.chosen === i);
      var vc = b.querySelector('.ans-votes');
      var n = c.tally[i];
      vc.textContent = v.mode === 'phones' && n ? String(n) : '';
    });
    var info = '';
    if (open) {
      if (v.mode === 'phones') {
        info = c.need ? 'Голосов: ' + c.voters.length + ' из ' + c.need : 'В команде никого нет онлайн — выберите ответ здесь';
      } else info = 'Нажмите ответ команды или клавиши 1–4';
    }
    UI.patch(UI.$('#qInfo'), esc(info));
    var res = '';
    if (!open) {
      if (c.ok) res = '<span class="res-ok">Верно! +' + c.earned + '</span>';
      else if (c.timeUp) res = '<span class="res-bad">Время вышло</span>';
      else if (c.chosen == null) res = '<span class="res-bad">Ответа нет</span>';
      else res = '<span class="res-bad">Неверно</span>';
    }
    UI.patch(UI.$('#qResult'), res);
    var rv = card.querySelector('[data-q="reveal"]'), nx = card.querySelector('[data-q="next"]');
    rv.hidden = !open; nx.hidden = open;
    if (!open && document.activeElement !== nx) setTimeout(function () { if (!nx.hidden) nx.focus({ preventScroll: true }); }, 30);
    var ruler = card.querySelector('.ruler');
    if (ruler) ruler.classList.toggle('stopped', !open);
    if (!open && !card.classList.contains('shown')) {
      card.classList.add('shown');
      var st = card.querySelector('.q-stamp');
      st.src = c.ok ? 'img/ui/correct.webp' : (c.timeUp ? 'img/ui/timeup.webp' : 'img/ui/wrong.webp');
      st.hidden = false;
      FX.play('stamp');
      if (!c.ok) { var q = card.querySelector('.qcard'); q.classList.remove('shake'); void q.offsetWidth; q.classList.add('shake'); }
    }
  }

  function pHtml(v) {
    var team = v.teams[v.turn], c = v.cur;
    return '<div class="ov-p" style="--tc:' + team.color + '">' +
      '<div class="pcard" role="dialog" aria-modal="true" aria-label="Бонус">' +
        '<h2 class="b-title">Плитка ' + c.n + ': бонус для команды <span>«' + esc(team.name) + '»</span></h2>' +
        '<div class="pflip"><div class="pflip-inner">' +
          '<div class="pf-front" aria-hidden="true"><span class="box-q">?</span></div>' +
          '<div class="pf-back"><span class="rays" aria-hidden="true"></span>' + UI.powerImg(c.power.id, 'pw-big') + '<b class="pw-name">' + esc(E.powerLabel(c.power.id, c.power.amt)) + '</b></div>' +
        '</div></div>' +
        '<p class="b-sub" id="bSub"></p>' +
        '<div class="b-target" id="bTarget" hidden></div>' +
        '<div class="b-effect" id="bEffect" role="status"></div>' +
        '<div class="b-foot"><button type="button" class="btn btn-yellow btn-lg" data-q="next" hidden>Дальше</button></div>' +
      '</div></div>';
  }
  function updateP(v) {
    var c = v.cur, team = v.teams[v.turn];
    var sub = v.phase === 'target' ? (v.mode === 'phones' && team.players ? 'Кого выбирает команда? Можно на телефоне или здесь' : 'Кого выбирает команда?') : '';
    UI.patch(UI.$('#bSub'), esc(sub));
    var tg = UI.$('#bTarget');
    if (v.phase === 'target') {
      tg.hidden = false;
      UI.patch(tg, v.teams.map(function (t, i) {
        if (i === v.turn) return '';
        return '<button type="button" class="btn target-btn" data-target="' + i + '" style="--tc:' + t.color + '">' + esc(t.name) + ' <span>' + t.score + '</span></button>';
      }).join(''));
    } else { tg.hidden = true; UI.patch(tg, ''); }
    var ef = UI.$('#bEffect');
    if (v.phase === 'bonusReveal' && c.effect) {
      var e = c.effect;
      UI.patch(ef, (e.target != null || e.id === 'zap' ? '<p class="eff-text">' + esc(e.text) + '</p>' : '') + '<div class="eff-scores">' + v.teams.map(function (t, i) {
        var d = e.delta[i];
        return '<span class="eff-team" style="--tc:' + t.color + '"><b>' + esc(t.name) + '</b><span class="eff-sc">' + e.after[i] + '</span>' +
          (d ? '<span class="eff-d ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + Math.abs(d) + '</span>' : '<span class="eff-d">±0</span>') + '</span>';
      }).join('') + '</div>');
      ef.classList.add('on');
    } else { UI.patch(ef, ''); ef.classList.remove('on'); }
    var nx = UI.$('.ov-p [data-q="next"]');
    nx.hidden = v.phase !== 'bonusReveal';
    if (!nx.hidden) setTimeout(function () { if (!nx.hidden) nx.focus({ preventScroll: true }); }, 1300);
  }

  function onOverlayClick(e) {
    var t;
    if ((t = e.target.closest('.ans')) && s.phase === 'question') { H.act({ type: 'answer', opt: Number(t.getAttribute('data-opt')) }); return; }
    if ((t = e.target.closest('[data-q]'))) {
      var a = t.getAttribute('data-q');
      if (a === 'reveal') H.act({ type: 'reveal' });
      else if (a === 'next') H.act({ type: 'next' });
      return;
    }
    if ((t = e.target.closest('[data-target]')) && s.phase === 'target') { H.act({ type: 'target', target: Number(t.getAttribute('data-target')) }); return; }
  }

  /* ---------- Итоги ---------- */
  function buildEnd(v) {
    var rk = E.ranking(v.teams);
    var top = rk[0];
    var tie = rk.length > 1 && rk[1].t.score === top.t.score;
    var title = tie ? 'Ничья!' : 'Победила команда';
    var podOrder = rk.length >= 3 ? [rk[1], rk[0], rk[2]] : (rk.length === 2 ? [rk[1], rk[0]] : rk);
    var podium = podOrder.map(function (x) {
      return '<div class="pod place' + x.place + '" style="--tc:' + x.t.color + '">' +
        '<span class="pod-name">' + esc(x.t.name) + '</span>' +
        '<span class="pod-score">' + x.t.score + '</span>' +
        '<span class="pod-bar"><span class="pod-place">' + x.place + '</span></span></div>';
    }).join('');
    var rows = rk.map(function (x) {
      return '<tr style="--tc:' + x.t.color + '"><td class="pl">' + x.place + '</td><td class="nm"><span class="dot"></span>' + esc(x.t.name) + '</td>' +
        '<td class="sc">' + x.t.score + '</td><td class="st">верно ' + x.t.correct + ' из ' + x.t.answered + '</td></tr>';
    }).join('');
    UI.screen('end',
      '<div class="end">' + topBar(v) +
        '<div class="end-main">' +
          '<h1 class="end-title">' + title + (tie ? '' : ' <span style="color:' + top.t.color + '">' + esc(top.t.name) + '</span>') + '</h1>' +
          '<div class="podium podium-' + Math.min(3, rk.length) + '">' + podium + '</div>' +
          '<table class="end-table"><caption class="sr-only">Итоги</caption><tbody>' + rows + '</tbody></table>' +
          '<div class="end-actions">' +
            '<button class="btn btn-yellow btn-lg" type="button" id="againBtn">Сыграть ещё раз</button>' +
            '<button class="btn btn-ghost" type="button" id="newBtn">Новая игра</button>' +
            '<button class="btn btn-ghost" type="button" id="homeBtn">На главную</button>' +
          '</div>' +
          '<p class="hint center">«Сыграть ещё раз» — те же темы и команды, вопросы перемешаются заново' + (v.mode === 'phones' ? ', игроки останутся в игре' : '') + '.</p>' +
        '</div>' +
      '</div>');
    bindTop(UI.$('.end .g-top'));
    UI.$('#againBtn').addEventListener('click', function () { H.act({ type: 'restart' }); });
    UI.$('#newBtn').addEventListener('click', function () { H.clearSave(); closePlayers(); s = null; H.stop(); UI.setup(); });
    UI.$('#homeBtn').addEventListener('click', function () { H.clearSave(); closePlayers(); s = null; H.stop(); UI.home(); });
  }
})(window);
