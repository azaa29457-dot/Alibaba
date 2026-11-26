/* Alibaba — экран организатора: лобби, игровое поле, вопрос, бонусы, итоги. */
(function (root) {
  'use strict';
  var FB = root.FB, E = FB.Engine, UI = FB.UI, FX = FB.FX;
  var esc = UI.esc;
  var H = FB.Host = {};
  var ANS_COLORS = ['#6A4DFF', '#008F7A', '#E06A00', '#E0337F'];

  var s = null;          // состояние игры (движок)
  function G() { return s && s.kind === 'kahoot' ? FB.Kahoot : E; }
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
    if (!g || !g.s || g.s.phase === 'end') return null;
    if (Date.now() - (g.t || 0) > 12 * 3600 * 1000) return null;
    if (g.s.kind === 'kahoot') return g.s.qs ? { title: g.s.cfg.title, left: FB.Kahoot.left(g.s) } : null;
    return g.s.tiles ? { title: g.s.cfg.title, left: E.leftTiles(g.s) } : null;
  };
  H.clearSave = function () { UI.store.del('alibaba.host'); };
  function save() { if (s) UI.store.set('alibaba.host', { t: Date.now(), s: s }); }

  /* ---------- Запуск ---------- */
  H.create = function (cfg) {
    if (UI.isPhone()) { UI.home(); return; }
    H.stop();
    if (cfg.mode === 'phones' || cfg.mode === 'kahoot') cfg.code = FB.Net.makeCode();
    s = cfg.mode === 'kahoot' ? FB.Kahoot.create(cfg, Date.now()) : E.createGame(cfg, Date.now());
    save();
    begin(false);
  };
  H.resume = function () {
    if (UI.isPhone()) { UI.home(); return; }
    var g = UI.store.get('alibaba.host', null);
    if (!g || !g.s) { UI.home(); return; }
    H.stop();
    s = g.s;
    Object.keys(s.players || {}).forEach(function (k) { s.players[k].online = false; });
    if (s.kind === 'kahoot') { if (s.phase === 'q' || s.phase === 'get') { s.phase = 'get'; s.until = Date.now() + FB.Kahoot.GET_READY; s.cur.ans = {}; } }
    else if (s.cur && s.cur.deadline) s.cur.deadline = Date.now() + s.cfg.timer * 1000; // время на вопрос заново
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
    if (s.mode === 'phones' || s.mode === 'kahoot') startNet(resumed);
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
    var r = G().act(s, a, Date.now());
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
    FX.play('win');
    FX.confetti({ count: 240, rain: true });
    setTimeout(function () { FX.confetti({ count: 140, y: innerHeight * 0.35, power: 13 }); }, 900);
    setTimeout(function () { FX.confetti({ count: 110, x: innerWidth * 0.15, y: innerHeight * 0.55, power: 11 }); FX.confetti({ count: 110, x: innerWidth * 0.85, y: innerHeight * 0.55, power: 11 }); }, 1800);
  }
  function closePlayers() { if (net) net.broadcast({ t: 'closed' }); }
  function broadcast() {
    if (net && s) net.broadcast({ t: 'state', s: G().view(s) });
  }

  function onMsg(pid, m, via) {
    if (!s) return;
    var p = s.players[pid];
    if (m.t === 'hello') {
      net.reply(via, pid, { t: 'welcome', s: G().view(s) });
      if (p) touch(pid);
      return;
    }
    if (p) touch(pid);
    switch (m.t) {
      case 'join':
        H.act({ type: 'join', pid: pid, name: m.name, team: Number(m.team), av: m.av });
        net.sendTo(pid, { t: 'state', s: G().view(s) });
        break;
      case 'team': H.act({ type: 'setTeam', pid: pid, team: Number(m.team) }); break;
      case 'pick': if (p) H.act({ type: 'pick', tile: Number(m.tile), team: p.team }); break;
      case 'vote': H.act({ type: 'vote', pid: pid, opt: Number(m.opt) }); break;
      case 'answer': H.act({ type: 'answer', pid: pid, opt: Number(m.opt) }); break;
      case 'target': if (p) H.act({ type: 'target', target: Number(m.target), team: p.team }); break;
      case 'bye': H.act({ type: 'online', pid: pid, on: false }); break;
      case 'sync': net.sendTo(pid, { t: 'state', s: G().view(s) }); break;
    }
  }
  function touch(pid) {
    var p = s.players[pid];
    if (!p) return;
    p.last = Date.now();
    if (!p.online) H.act({ type: 'online', pid: pid, on: true });
  }
  function presence() {
    if (!s || (s.mode !== 'phones' && s.mode !== 'kahoot')) return;
    var now = Date.now();
    Object.keys(s.players).forEach(function (k) {
      var p = s.players[k];
      if (p.online && now - (p.last || 0) > 15000) H.act({ type: 'online', pid: k, on: false });
    });
  }
  function tick() {
    if (s && s.kind === 'kahoot') {
      if (s.phase === 'get' && Date.now() >= s.until) { H.act({ type: 'tick' }); return; }
      if ((s.phase === 'res' || s.phase === 'board') && s.until && Date.now() >= s.until) { H.act({ type: 'tick' }); return; }
      if (s.phase === 'q') {
        var rk = s.cur.deadline - Date.now();
        if (rk <= 0) { H.act({ type: 'tick' }); return; }
        var sk = Math.ceil(rk / 1000);
        if (sk <= 5 && sk !== lastTickSec) { lastTickSec = sk; FX.play('tick'); }
      }
      return;
    }
    if (!s || s.phase !== 'question' || !s.cur || !s.cur.deadline) { lastTickSec = null; return; }
    var remain = s.cur.deadline - Date.now();
    if (remain <= 0) { H.act({ type: 'timeout' }); return; }
    var sec = Math.ceil(remain / 1000);
    if (sec <= 5 && sec !== lastTickSec) { lastTickSec = sec; FX.play('tick'); }
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    if (s && s.kind === 'kahoot') { kFrame(); return; }
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
        case 'kq': FX.play('open'); break;
        case 'kanswer': FX.play('vote'); break;
        case 'kres': FX.play('bonus'); break;
        case 'kget': FX.play('join'); break;
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
    if (s.kind === 'kahoot') {
      if ((k === ' ' || k === 'Enter') && (s.phase === 'res' || s.phase === 'board' || s.phase === 'get')) { H.act({ type: 'next' }); e.preventDefault(); }
      return;
    }
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
    if (s.kind === 'kahoot') { renderK(force); return; }
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
    if (s.kind === 'kahoot' && s.phase === 'q') items.push(['close', 'Завершить вопрос']);
    if (s.kind !== 'kahoot' && s.phase === 'board') items.push(['skip', 'Передать ход следующей команде']);
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
      else if (k === 'close') H.act({ type: 'close' });
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
            UI.avImg(p.av) + esc(p.name) +
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

  /* ---------- Игровое поле (как в Baamboozle: команды сверху, синие плитки) ---------- */
  function tools(v) {
    return '<div class="bz-tools">' +
      '<button class="bz-btn" data-act="menu" type="button" aria-label="Меню" title="Меню">✕</button>' +
      '<button class="bz-btn" data-act="sound" type="button" aria-label="' + (FX.isMuted() ? 'Включить звук' : 'Выключить звук') + '" title="Звук (M)">' + soundIcon() + '</button>' +
      '<button class="bz-btn" data-act="full" type="button" aria-label="Во весь экран" title="Во весь экран (F)">⛶</button>' +
      (v.mode === 'phones' || v.mode === 'kahoot' ? '<button class="bz-btn" data-act="code" type="button" aria-label="Код для входа" title="Код для входа">#</button>' : '') +
    '</div>';
  }
  function buildGame(v) {
    var n = v.tiles.length;
    var cols = n <= 9 ? 3 : (n <= 24 ? 4 : (n <= 30 ? 5 : 6));
    var rows = Math.ceil(n / cols);
    UI.screen('game',
      '<div class="game bz">' +
        '<header class="bz-head" style="--n:' + v.teams.length + '">' +
          v.teams.map(function (t, i) {
            return '<div class="bz-team" data-team="' + i + '" style="--tc:' + t.color + '">' +
              '<span class="bz-name">' + esc(t.name) + '</span>' +
              '<span class="bz-score" data-val="' + t.score + '">' + t.score + '</span>' +
              '<span class="bz-adj"><button type="button" data-adj="-5" aria-label="Минус 5 очков">−5</button><button type="button" data-adj="5" aria-label="Плюс 5 очков">+5</button></span>' +
            '</div>';
          }).join('') +
        '</header>' +
        tools(v) +
        '<main class="bz-main"><div class="board" id="board" style="--cols:' + cols + ';--rows:' + rows + '"></div></main>' +
        '<div id="overlay"></div>' +
      '</div>');
    var g = UI.$('.game');
    bindTop(g.querySelector('.bz-tools'));
    UI.$('#board').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tile]');
      if (t && s.phase === 'board') { FX.unlock(); H.act({ type: 'pick', tile: Number(t.getAttribute('data-tile')) }); }
    });
    g.querySelector('.bz-head').addEventListener('click', function (e) {
      var b = e.target.closest('[data-adj]');
      if (!b) return;
      H.act({ type: 'adjust', team: Number(b.closest('[data-team]').getAttribute('data-team')), delta: Number(b.getAttribute('data-adj')) });
    });
    UI.$('#overlay').addEventListener('click', onOverlayClick);
  }

  function updateGame(v) {
    v.teams.forEach(function (t, i) {
      var el = document.querySelector('.bz-team[data-team="' + i + '"]');
      if (!el) return;
      el.classList.toggle('turn', v.turn === i);
      FX.countTo(el.querySelector('.bz-score'), t.score);
    });
    var cols = Number(getComputedStyle(UI.$('#board')).getPropertyValue('--cols')) || 5;
    var boardHtml = v.tiles.map(function (t, i) {
      var dark = ((Math.floor(i / cols) + (i % cols)) % 2) === 1;
      if (t.used) {
        var tc = t.by != null && v.teams[t.by] ? v.teams[t.by].color : '#ccc';
        var cur = v.cur && v.cur.tile === i;
        var res = '';
        if (t.kind === 'p') res = '<span class="tile-ico">' + UI.powerImg(t.icon) + '</span>';
        else if (!(cur && t.ok == null)) res = '<span class="tile-res' + (t.ok ? ' ok' : '') + '">' + (t.ok ? '✓' : '✗') + '</span>';
        return '<div class="tile used" style="--tc:' + tc + '"><span class="tile-n">' + t.n + '</span>' + res + '</div>';
      }
      return '<button type="button" class="tile ' + (dark ? 'dk' : 'lt') + '" data-tile="' + i + '" aria-label="Плитка ' + t.n + '" style="animation-delay:' + Math.min(i * 20, 600) + 'ms">' +
        '<span class="tile-n">' + t.n + '</span></button>';
    }).join('');
    UI.patch(UI.$('#board'), boardHtml);
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

  /* ---------- Окно победы ---------- */
  function buildEnd(v) {
    var rk = E.ranking(v.teams), top = rk[0];
    var tie = rk.length > 1 && rk[1].t.score === top.t.score;
    var medals = ['medal1', 'medal2', 'medal3'];
    UI.screen('end',
      '<div class="bz-end">' +
        tools(v) +
        '<div class="win-card" role="dialog" aria-label="Итоги игры">' +
          '<img class="win-trophy" src="img/ui/trophy.webp" alt="">' +
          '<h1 class="win-title">' + (tie ? 'Ничья!' : 'Победила команда <span style="--tc:' + top.t.color + '">' + esc(top.t.name) + '</span>') + '</h1>' +
          '<div class="win-video" id="winVideo"></div>' +
          '<ol class="win-list">' + rk.map(function (x) {
            return '<li style="--tc:' + x.t.color + '">' +
              (x.place <= 3 ? '<img class="win-medal" src="img/ui/' + medals[x.place - 1] + '.webp" alt="' + x.place + ' место">' : '<span class="win-place">' + x.place + '</span>') +
              '<span class="win-name">' + esc(x.t.name) + '</span><span class="win-score">' + x.t.score + '</span></li>';
          }).join('') + '</ol>' +
          '<div class="win-actions">' +
            '<button class="btn bz-primary btn-lg" type="button" id="againBtn">Играть ещё раз</button>' +
            '<button class="btn bz-secondary" type="button" id="newBtn">Новая игра</button>' +
            '<button class="btn bz-secondary" type="button" id="homeBtn">На главную</button>' +
          '</div>' +
        '</div>' +
      '</div>');
    bindTop(UI.$('.bz-end .bz-tools'));
    UI.winVideo(UI.$('#winVideo'), s.cfg.winVideo);
    UI.$('#againBtn').addEventListener('click', function () { H.act({ type: 'restart' }); });
    UI.$('#newBtn').addEventListener('click', function () { H.clearSave(); closePlayers(); s = null; H.stop(); UI.setup(); });
    UI.$('#homeBtn').addEventListener('click', function () { H.clearSave(); closePlayers(); s = null; H.stop(); UI.home(); });
  }

  /* ================= Режим «каждый за себя» (как в Kahoot) ================= */
  var SHAPES = ['▲', '◆', '●', '■'];
  var KCOL = ['#E21B3C', '#1368CE', '#D89E00', '#26890C'];
  function renderK(force) {
    var v = FB.Kahoot.view(s);
    var want = v.phase === 'lobby' ? 'k-lobby' : (v.phase === 'end' ? 'k-end' : 'k-game');
    if (force || built !== want) {
      built = want;
      if (want === 'k-lobby') buildKLobby(v);
      else if (want === 'k-end') buildKEnd(v);
      else buildKGame(v);
    }
    if (want === 'k-lobby') updateKLobby(v);
    else if (want === 'k-game') updateKGame(v);
  }
  function buildKLobby(v) {
    var url = UI.joinUrl(v.code);
    var host = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
    UI.screen('k-lobby',
      '<div class="kh kh-lobby">' + tools(v) +
        '<header class="kh-pinbar">' +
          '<div class="kh-join"><span>Заходи на</span><b>' + esc(host) + '</b></div>' +
          '<div class="kh-pin"><span>PIN игры:</span><b>' + esc(UI.fmtCode(v.code)) + '</b></div>' +
          '<div class="kh-qr">' + UI.qrSvg(url) + '</div>' +
        '</header>' +
        '<div class="kh-bar">' +
          '<div class="kh-count"><b id="kCount">0</b><span id="kCountL">игроков</span></div>' +
          '<div class="kh-name">' + UI.wordmark('wordmark-sm') + '<span>' + esc(v.title) + '</span></div>' +
          '<button class="btn kh-start" type="button" id="kStart">Старт</button>' +
        '</div>' +
        '<div class="kh-players" id="kPlayers"></div>' +
        '<div class="net kh-net" id="netStatus"></div>' +
      '</div>');
    bindTop(UI.$('.kh .bz-tools'));
    UI.$('#kStart').addEventListener('click', function () {
      FX.unlock();
      if (!Object.keys(s.players).length) { UI.toast('Подождите, пока зайдёт хотя бы один игрок'); return; }
      H.act({ type: 'start' });
    });
    UI.$('#kPlayers').addEventListener('click', function (e) {
      var c = e.target.closest('[data-pid]');
      if (!c) return;
      var pid = c.getAttribute('data-pid'), p = s.players[pid];
      if (!p) return;
      UI.confirm('Удалить игрока «' + p.name + '»?', 'Удалить').then(function (ok) {
        if (ok && s.players[pid]) { if (net) net.sendTo(pid, { t: 'kicked' }); H.act({ type: 'kick', pid: pid }); }
      });
    });
    renderNet();
  }
  function updateKLobby(v) {
    var n = v.players.length;
    UI.$('#kCount').textContent = String(n);
    UI.$('#kCountL').textContent = UI.plural(n, 'игрок', 'игрока', 'игроков');
    UI.patch(UI.$('#kPlayers'), n ? v.players.slice().reverse().map(function (p) {
      return '<button type="button" class="kh-chip' + (p.on ? '' : ' off') + '" data-pid="' + esc(p.id) + '" title="Нажмите, чтобы удалить">' + UI.avImg(p.av) + '<span>' + esc(p.name) + '</span></button>';
    }).join('') : '<p class="kh-wait">Ждём игроков…</p>');
  }

  function buildKGame(v) {
    UI.screen('k-game',
      '<div class="kh kh-game">' + tools(v) +
        '<div class="kh-qbar"><span class="kh-num" id="kNum"></span><h1 id="kText"></h1></div>' +
        '<div class="kh-mid" id="kMid"></div>' +
        '<div class="kh-ans" id="kAns"></div>' +
        '<div class="kh-ctl" id="kCtl"></div>' +
      '</div>');
    bindTop(UI.$('.kh .bz-tools'));
    UI.$('#kCtl').addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      if (b) H.act({ type: b.getAttribute('data-k') });
    });
  }
  var ICO_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICO_NO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  function ansHtml(q, res) {
    return q.opts.map(function (o, i) {
      var ok = res && i === q.correct;
      var cls = res ? (ok ? ' right' : ' dim') : '';
      return '<div class="kh-a' + cls + '" style="--kc:' + KCOL[i] + ';--i:' + i + '"><span class="kh-shape">' + SHAPES[i] + '</span><span class="kh-at">' + esc(o) + '</span>' +
        (res ? '<span class="kh-mark">' + (ok ? ICO_OK : ICO_NO) + '</span>' : '') + '</div>';
    }).join('');
  }
  // «Дальше» сам нажмётся через несколько секунд — полоска на кнопке показывает, сколько осталось
  function autoNext(v, label) {
    if (v.auto == null) return '<button class="btn kh-next" data-k="next" type="button">' + label + '</button>';
    return '<button class="btn kh-next kh-auto" data-k="next" type="button"><i class="kh-auto-fill" id="kAutoFill"></i><span>' + label + '</span></button>';
  }
  function fmtSec(ms) { return (Math.round(ms / 100) / 10).toFixed(1).replace('.', ',') + ' с'; }
  function resHtml(v) {
    var q = v.q, total = 0, max = 1;
    q.counts.forEach(function (n) { total += n; if (n > max) max = n; });
    var right = q.counts[q.correct] || 0;
    var pct = total ? Math.round(right / total * 100) : 0;
    var fast = null;
    v.players.forEach(function (p) {
      if (p.last && p.last.ok && p.last.t != null && (!fast || p.last.t < fast.last.t)) fast = p;
    });
    var chart = '<div class="kr-chart">' + q.counts.map(function (n, i) {
      var ok = i === q.correct;
      return '<div class="kr-col' + (ok ? ' right' : '') + '" style="--kc:' + KCOL[i] + ';--h:' + (n / max).toFixed(3) + ';--i:' + i + '">' +
        '<span class="kr-n">' + (ok ? '<i class="kr-ok">' + ICO_OK + '</i>' : '') + '<b>' + n + '</b></span>' +
        '<span class="kr-bar"></span>' +
        '<span class="kr-base">' + SHAPES[i] + '</span></div>';
    }).join('') + '</div>';
    var stat = '<div class="kr-card kr-stat">' +
        '<div class="kr-ring" style="--p:' + pct + '"><b>' + pct + '%</b></div>' +
        '<p><b>' + right + ' из ' + total + '</b>' + (total ? 'ответили верно' : 'никто не ответил') + '</p>' +
      '</div>';
    var quick = fast
      ? '<div class="kr-card kr-fast">' + UI.avImg(fast.av) + '<p><span>Быстрее всех</span><b>' + esc(fast.name) + '</b><em>' + fmtSec(fast.last.t) + ' · +' + fast.last.pts + '</em></p></div>'
      : '<div class="kr-card kr-fast kr-none"><p><span>Быстрее всех</span><b>—</b><em>верных ответов нет</em></p></div>';
    return '<div class="kr">' + stat + chart + quick + '</div>';
  }
  function updateKGame(v) {
    var q = v.q, ph = v.phase;
    UI.$('.kh-game').setAttribute('data-ph', ph);
    UI.$('#kNum').textContent = ph === 'board' ? 'Таблица лидеров' : 'Вопрос ' + (v.qi + 1) + ' из ' + v.total;
    UI.patch(UI.$('#kText'), ph === 'board' ? '' : esc(q ? q.text : ''));
    var mid = '', ans = '', ctl = '';
    if (ph === 'get') {
      mid = '<div class="kh-ready"><div class="kh-ring"><span id="kCount3">3</span></div><p>Приготовьтесь!</p></div>';
      ctl = '<button class="btn kh-next" data-k="next" type="button">Показать ответы</button>';
    } else if (ph === 'q') {
      mid = '<div class="kh-timer"><span id="kTimer">' + Math.ceil((q.remain || 0) / 1000) + '</span></div>' +
        '<div class="kh-answered"><b>' + q.answered + '</b><span>' + UI.plural(q.answered, 'ответ', 'ответа', 'ответов') + ' из ' + q.need + '</span></div>';
      ans = ansHtml(q, false);
      ctl = '<button class="btn kh-skip" data-k="close" type="button">Завершить вопрос</button>';
    } else if (ph === 'res') {
      mid = resHtml(v);
      ans = ansHtml(q, true);
      ctl = autoNext(v, v.qi >= v.total - 1 ? 'Итоги' : 'Дальше');
    } else if (ph === 'board') {
      mid = '<ol class="kh-board">' + v.players.slice(0, 5).map(function (p, i) {
        var up = p.last && p.last.prev && p.last.prev > p.place ? '<span class="kh-up">▲ ' + (p.last.prev - p.place) + '</span>' : '';
        return '<li style="--i:' + i + '"><span class="kh-pl">' + p.place + '</span>' + UI.avImg(p.av) + '<span class="kh-bn">' + esc(p.name) + '</span>' + up +
          (p.streak >= 2 ? '<span class="kh-streak">🔥' + p.streak + '</span>' : '') + '<b>' + p.score + '</b></li>';
      }).join('') + '</ol>';
      ctl = autoNext(v, 'Дальше');
    }
    UI.patch(UI.$('#kMid'), mid);
    UI.patch(UI.$('#kAns'), ans);
    UI.patch(UI.$('#kCtl'), ctl);
  }
  function kFrame() {
    if (!s) return;
    if (s.phase === 'q' && s.cur && s.cur.deadline) {
      var el = document.getElementById('kTimer');
      var t = String(Math.max(0, Math.ceil((s.cur.deadline - Date.now()) / 1000)));
      if (el && el.textContent !== t) el.textContent = t;
    } else if ((s.phase === 'res' || s.phase === 'board') && s.until) {
      var fill = document.getElementById('kAutoFill');
      if (fill) fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, 1 - (s.until - Date.now()) / FB.Kahoot.AUTO_NEXT)).toFixed(3) + ')';
    } else if (s.phase === 'get') {
      var c3 = document.getElementById('kCount3');
      var t3 = String(Math.max(1, Math.ceil((s.until - Date.now()) / 1000)));
      if (c3 && c3.textContent !== t3) c3.textContent = t3;
    }
  }
  function buildKEnd(v) {
    var P = v.players;
    var pod = [P[1], P[0], P[2]].map(function (p, k) {
      if (!p) return '<div class="kp empty"></div>';
      var place = [2, 1, 3][k];
      return '<div class="kp kp' + place + '">' + UI.avImg(p.av, 'av kp-av') + '<span class="kp-name">' + esc(p.name) + '</span><span class="kp-score">' + p.score + '</span>' +
        '<div class="kp-bar"><img src="img/ui/medal' + place + '.webp" alt="' + place + ' место"></div></div>';
    }).join('');
    UI.screen('k-end',
      '<div class="kh kh-end">' + tools(v) +
        '<h1 class="kh-end-title">' + (P[0] ? 'Победитель: ' + esc(P[0].name) + '!' : 'Игра окончена') + '</h1>' +
        '<div class="kh-end-row">' +
          '<div class="kh-podium">' + pod + '</div>' +
          '<div class="win-video" id="winVideo"></div>' +
        '</div>' +
        (P.length > 3 ? '<ol class="kh-rest" start="4">' + P.slice(3, 15).map(function (p) { return '<li>' + UI.avImg(p.av) + '<span>' + esc(p.name) + '</span><b>' + p.score + '</b></li>'; }).join('') + '</ol>' : '') +
        '<div class="win-actions">' +
          '<button class="btn bz-primary btn-lg" type="button" id="againBtn">Играть ещё раз</button>' +
          '<button class="btn bz-secondary" type="button" id="newBtn">Новая игра</button>' +
          '<button class="btn bz-secondary" type="button" id="homeBtn">На главную</button>' +
        '</div>' +
      '</div>');
    bindTop(UI.$('.kh .bz-tools'));
    UI.winVideo(UI.$('#winVideo'), s.cfg.winVideo);
    UI.$('#againBtn').addEventListener('click', function () { H.act({ type: 'restart' }); });
    UI.$('#newBtn').addEventListener('click', function () { H.clearSave(); closePlayers(); s = null; H.stop(); UI.setup(); });
    UI.$('#homeBtn').addEventListener('click', function () { H.clearSave(); closePlayers(); s = null; H.stop(); UI.home(); });
  }
})(window);
