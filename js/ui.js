/* Alibaba — общие помощники интерфейса, главная страница и создание игры. */
(function (root) {
  'use strict';
  var FB = root.FB;
  var E = FB.Engine;
  try { E.history = E.makeHistory(localStorage, 'alibaba.seen'); } catch (e) { E.history = null; }
  var UI = FB.UI = {};

  UI.LETTERS = ['А', 'Б', 'В', 'Г'];
  UI.SEARCH_ICO = '<span class="search-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span>';
  UI.app = function () { return document.getElementById('app'); };
  UI.THEMES = [
    { id: 'violet', name: 'Фиолетовый' }, { id: 'space', name: 'Космос' }, { id: 'ocean', name: 'Океан' },
    { id: 'sunset', name: 'Закат' }, { id: 'blueprint', name: 'Тетрадь' }
  ];
  UI.avImg = function (av, cls) {
    var id = E.AVATARS.indexOf(av) >= 0 ? av : 'cat';
    return '<img class="' + (cls || 'av') + '" src="img/av/' + id + '.webp" alt="' + UI.esc(E.AVATAR_NAMES[id] || '') + '" draggable="false">';
  };
  /* Телефон: только вход в игру по коду, создавать игры нельзя */
  UI.isPhone = function () {
    var ua = navigator.userAgent || '';
    var mobileUA = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(ua) && !/iPad|Tablet/i.test(ua);
    var narrow = root.matchMedia && root.matchMedia('(max-width: 700px)').matches;
    return mobileUA || narrow;
  };
  UI.applyTheme = function (t) {
    if (!UI.THEMES.some(function (x) { return x.id === t; })) t = 'violet';
    document.body.setAttribute('data-theme', t);
  };
  /* Ссылка на видео победы: YouTube (любой вид ссылки) или прямой файл .mp4/.webm */
  UI.videoEmbed = function (url) {
    url = String(url || '').trim();
    if (!url) return '';
    var m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/.exec(url);
    if (m) return '<iframe src="https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="Видео победы" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
    if (/^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return '<video src="' + UI.esc(url) + '" autoplay playsinline controls></video>';
    return '';
  };
  /* 20 смешных зацикленных роликов для победы (GIPHY). Каждый раз выбирается случайный. */
  UI.WIN_GIFS = ['125E8v90blHqtr4HrB', 'S9r695TxMZ59xw301A', 'TbRkubcqlgBksEqMv4', '7xqRFGrGcC1UgZ6jUk', 'C3AjhNlO4SAtSNdAmY',
    'FM57qpxeflq5Woi0Bj', 'CLJObmqmzxa1N6GAxB', 'xPSItdDHDPercnHGdx', 'sISX1icp5cE2Q6trd7', 'xCA3qbBcipx6iH3hBt',
    'bOXnd3kig533u93OND', 'c5RzZOHPgry80', 'KCT1Hh7yIOlIxgIZi9', 'Ga0gHvT84m3yTE8lIp', 'd77o7i3tHnKda',
    'yScooNo2jY6vQ8Vx8d', 'A0Zt7yuDULiy4ofmVD', 'oA6DW7rbHZ6hy', 'BMR4cgypuglVu', 'zFy8BA6xYRASTJS1De'];
  UI.dancersHtml = function (list) {
    return '<div class="cel-dancers" aria-hidden="true">' + (list || ['dance1', 'party', 'monkey', 'robot', 'unicorn', 'cool', 'dance2']).map(function (n, i) {
      return '<img src="img/ui/' + n + '.webp" alt="" style="--i:' + i + '">';
    }).join('') + '</div>';
  };
  /* Показывает случайное видео победы по кругу. Если интернета нет — танцующие 3D-персонажи. */
  UI.winVideo = function (box, custom) {
    if (!box) return;
    var emb = UI.videoEmbed(custom);
    if (emb) { box.innerHTML = emb; return; }
    var order = E.shuffle(UI.WIN_GIFS.slice()), k = 0, fails = 0;
    function show() {
      if (fails >= 4) { box.classList.add('no-video'); box.innerHTML = UI.dancersHtml(); return; }
      var id = order[k % order.length]; k++;
      box.classList.remove('no-video');
      box.innerHTML = '<video autoplay loop muted playsinline preload="auto"></video>' +
        '<button class="win-shuffle" type="button" aria-label="Другое видео" title="Другое видео">🔀</button><span class="win-credit">GIPHY</span>';
      var vid = box.querySelector('video'), done = false;
      function fail() { if (done) return; done = true; clearTimeout(to); fails++; show(); }
      var to = setTimeout(function () { if (vid.readyState < 2) fail(); }, 7000);
      vid.addEventListener('error', fail);
      vid.addEventListener('loadeddata', function () { done = true; clearTimeout(to); fails = 0; });
      vid.addEventListener('loadedmetadata', function () {
        if (vid.videoWidth && vid.videoHeight) box.style.setProperty('--var', (vid.videoWidth / vid.videoHeight).toFixed(4));
      });
      vid.src = 'https://media.giphy.com/media/' + id + '/giphy.mp4';
      try { var pr = vid.play(); if (pr && pr.catch) pr.catch(function () { }); } catch (e) { }
      box.querySelector('.win-shuffle').addEventListener('click', function () { done = true; clearTimeout(to); show(); });
    }
    show();
  };
  UI.savedTheme = function () { var c = UI.store.get('alibaba.setup', null); return c && c.theme ? c.theme : 'violet'; };
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.$ = function (sel, el) { return (el || document).querySelector(sel); };
  UI.$$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  UI.plural = function (n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  UI.fmtCode = function (c) { c = String(c || ''); return c.slice(0, 3) + ' ' + c.slice(3); };
  UI.store = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  UI.screen = function (name, html) {
    var app = UI.app();
    app.setAttribute('data-screen', name);
    app.innerHTML = html;
    root.scrollTo(0, 0);
    document.body.setAttribute('data-screen', name);
  };
  UI.patch = function (el, html) {
    if (!el) return;
    if (el._html !== html) { el._html = html; el.innerHTML = html; }
  };
  var toastT = null;
  UI.toast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };
  UI.confirm = function (text, yes, no) {
    return new Promise(function (resolve) {
      var w = document.createElement('div');
      w.className = 'modal-wrap';
      w.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><p class="modal-text">' + UI.esc(text) + '</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost-dark" data-r="0">' + UI.esc(no || 'Отмена') + '</button>' +
        '<button class="btn btn-danger" data-r="1">' + UI.esc(yes || 'Да') + '</button></div></div>';
      document.body.appendChild(w);
      var b = w.querySelector('[data-r="0"]'); b.focus();
      function done(r) { document.removeEventListener('keydown', key, true); w.remove(); resolve(r); }
      function key(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      document.addEventListener('keydown', key, true);
      w.addEventListener('click', function (e) {
        var r = e.target.closest('[data-r]');
        if (r) done(r.getAttribute('data-r') === '1');
        else if (e.target === w) done(false);
      });
    });
  };
  UI.wordmark = function (cls) {
    var letters = 'Alibaba'.split('');
    return '<h1 class="wordmark ' + (cls || '') + '" aria-label="Alibaba">' + letters.map(function (l, i) {
      return '<span aria-hidden="true" style="--i:' + i + '">' + l + '</span>';
    }).join('') + '</h1>';
  };
  UI.norm = function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); };
  UI.qrSvg = function (text) {
    try {
      var q = root.qrcode(0, 'M');
      q.addData(text); q.make();
      return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (e) { return ''; }
  };
  UI.joinUrl = function (code) {
    var u = location.href.split('#')[0].split('?')[0];
    if (/^https?:$/.test(location.protocol)) u = u.replace(/index\.html$/, '');
    return u + '?code=' + code;
  };
  UI.diffBar = function (topic) {
    var c = [0, 0, 0, 0];
    topic.q.forEach(function (x) { c[x.d]++; });
    var n = topic.q.length;
    return '<span class="diffbar" title="Лёгких: ' + c[1] + ', средних: ' + c[2] + ', сложных: ' + c[3] + '">' +
      '<i class="d1" style="flex:' + c[1] + '"></i><i class="d2" style="flex:' + c[2] + '"></i><i class="d3" style="flex:' + c[3] + '"></i></span>' +
      '<span class="sr-only">' + n + '</span>';
  };

  /* ===================== Главная ===================== */
  function heroBoard() {
    var cells = [
      { c: 0, t: '1' }, { c: 5, t: '2' }, { c: 2, t: '3' },
      { c: 3, t: '4' }, { c: 7, t: '?' , big: 1 }, { c: 1, t: '6' },
      { c: 4, t: '7' }, { c: 6, t: '<img src="img/power/gift.webp" alt="">', emo: 1 }, { c: 5, t: '9' }
    ];
    return '<div class="hb" aria-hidden="true">' +
      '<div class="hb-team hb-t1"><span class="hb-dot" style="background:#FF3D68"></span>Ньютоны<b>120</b></div>' +
      '<div class="hb-team hb-t2"><span class="hb-dot" style="background:#2FB8FF"></span>Кванты<b>95</b></div>' +
      '<div class="hb-grid">' + cells.map(function (x, i) {
        return '<span class="tile c' + x.c + (x.emo ? ' hb-emo' : '') + (x.big ? ' hb-q' : '') + '" style="--d:' + i + '"><span class="tile-n">' + x.t + '</span></span>';
      }).join('') + '</div>' +
      '<div class="hb-pop">+20</div>' +
    '</div>';
  }
  UI.GROUPS = [['school', 'Школьная программа'], ['extra', 'Дополнительные курсы']];
  var libSubj = 'all';
  function libChips() {
    return '<div class="lib-chips" id="libChips" role="tablist" aria-label="Предметы">' +
      [['all', 'Все предметы']].concat(FB.subjects.map(function (s) { return [s.id, s.title]; })).map(function (c) {
        return '<button type="button" role="tab" class="lib-chip' + (c[0] === libSubj ? ' on' : '') + '" aria-selected="' + (c[0] === libSubj) + '" data-lib="' + UI.esc(c[0]) + '">' + UI.esc(c[1]) + '</button>';
      }).join('') + '</div>';
  }
  function homeTopicCards(query) {
    if (query && query.trim()) {
      var found = searchTopics(query, null).map(function (r) { return { s: r.s, t: r.t }; });
      if (!found.length) return '<p class="empty">Ничего не нашлось по запросу «' + UI.esc(query) + '». Попробуйте другое слово, например «давление», «Абылай» или «Past Simple».</p>';
      return topicCardsHtml(found);
    }
    var subs = FB.subjects.filter(function (s) { return libSubj === 'all' || s.id === libSubj; });
    return subs.map(function (s) {
      var secs = UI.sectionsOf(s), wrap = function (ts) { return topicCardsHtml(ts.map(function (t) { return { s: s, t: t }; })); };
      return '<h3 class="lib-subj">' + UI.logo(s, 'h-logo') + '<span>' + UI.esc(s.title) + '</span>' + (s.grade ? '<small>' + UI.esc(s.grade) + '</small>' : '') + '</h3>' +
        (secs ? secs.map(function (sec) { return '<h4 class="lib-sec">' + UI.esc(sec.name) + '</h4>' + wrap(sec.topics); }).join('') : wrap(s.topics));
    }).join('');
  }
  function topicCardsHtml(list) {
    return '<div class="lib">' + list.map(function (x, i) {
      var key = FB.topicKey(x.s.id, x.t.id);
      return '<button type="button" class="game-card gc' + (i % 8) + '" data-play="' + UI.esc(key) + '">' +
        '<span class="gc-art">' + UI.logo(x.t, 'gc-logo') + '<span class="gc-n">' + x.t.q.length + ' ' + UI.plural(x.t.q.length, 'вопрос', 'вопроса', 'вопросов') + '</span></span>' +
        '<span class="gc-body"><span class="gc-t">' + UI.esc(x.t.title) + '</span>' +
          '<span class="gc-s">' + UI.esc(x.s.title + (x.s.grade ? ', ' + x.s.grade : '')) + '</span></span>' +
        '<span class="gc-play">Играть</span>' +
      '</button>';
    }).join('') + '</div>';
  }

  UI.home = function (opts) {
    opts = opts || {};
    var hostSave = FB.Host && FB.Host.savedGame();
    var plSave = FB.Player && FB.Player.savedSession();
    var subjCount = FB.subjects.length;
    var topicCount = FB.subjects.reduce(function (a, s) { return a + s.topics.length; }, 0);
    var qCount = FB.subjects.reduce(function (a, s) { return a + s.topics.reduce(function (b, t) { return b + t.q.length; }, 0); }, 0);
    UI.applyTheme(UI.savedTheme());
    var phone = UI.isPhone();
    if (phone) hostSave = null;
    var html =
      '<div class="home' + (phone ? ' is-phone' : '') + '">' +
        '<header class="nav">' +
          '<a class="nav-logo" href="#" data-nav="top" aria-label="Alibaba — на главную">' + UI.wordmark('wordmark-nav') + '</a>' +
          '<nav class="nav-links" aria-label="Разделы">' +
            (phone ? '' : '<a href="#topics" data-nav="topics">Темы</a>') +
            '<a href="#how" data-nav="how">Как играть</a>' +
          '</nav>' +
          '<div class="nav-cta">' +
            '<button type="button" class="btn btn-ghost btn-small" data-nav="code">Ввести код</button>' +
            (phone ? '' : '<button type="button" class="btn btn-yellow btn-small" id="createBtnNav">Создать игру</button>') +
          '</div>' +
        '</header>' +
        (hostSave ? '<div class="resume-bar"><span>У вас есть незаконченная игра «' + UI.esc(hostSave.title) + '» — осталось ' + hostSave.left + ' ' + UI.plural(hostSave.left, 'плитка', 'плитки', 'плиток') + '.</span>' +
          '<span class="resume-btns"><button class="btn btn-small btn-yellow" id="resumeBtn" type="button">Продолжить</button>' +
          '<button class="btn btn-small btn-ghost" id="dropBtn" type="button">Удалить</button></span></div>' : '') +
        '<section class="hero">' +
          '<div class="hero-text">' +
            UI.wordmark('wordmark-xl drop') +
            '<p class="hero-lead">Командная викторина для урока. Делитесь на команды, открывайте плитки, отвечайте и ловите бонусы.</p>' +
            '<form class="joinbar" id="joinForm" autocomplete="off" novalidate>' +
              '<label class="sr-only" for="codeInput">Код игры</label>' +
              '<input id="codeInput" class="code-input" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="Код игры" aria-describedby="joinErr">' +
              '<button class="btn btn-yellow btn-lg" type="submit">Войти</button>' +
            '</form>' +
            '<p class="form-err" id="joinErr" role="alert"></p>' +
            '<div class="hero-actions">' +
              (phone ? '' : '<button class="btn btn-white btn-lg" id="createBtn" type="button">Создать игру</button>') +
              (plSave ? '<button class="btn btn-ghost" type="button" id="rejoinBtn">Вернуться в игру ' + UI.esc(UI.fmtCode(plSave.code)) + '</button>' : '') +
            '</div>' +
            '<ul class="hero-facts">' +
              '<li><b>' + qCount + '</b> ' + UI.plural(qCount, 'вопрос', 'вопроса', 'вопросов') + '</li>' +
              '<li><b>' + topicCount + '</b> ' + UI.plural(topicCount, 'тема', 'темы', 'тем') + '</li>' +
              '<li><b>15</b> бонусов</li>' +
            '</ul>' +
          '</div>' +
          '<div class="hero-art">' + heroBoard() + '</div>' +
        '</section>' +
        (phone ? '' : '<section class="lib-wrap" id="topics">' +
          '<div class="lib-head">' +
            '<h2 class="sec-h">Выберите тему и играйте</h2>' +
            '<div class="search lib-search">' + UI.SEARCH_ICO +
              '<input type="search" id="homeSearch" placeholder="Поиск по темам и вопросам" aria-label="Поиск темы"></div>' +
          '</div>' +
          (subjCount > 1 ? libChips() : '') +
          '<div id="libArea">' + homeTopicCards('') + '</div>' +
        '</section>') +
        '<section class="how-wrap" id="how">' +
          '<h2 class="sec-h">Как играть</h2>' +
          '<ol class="how">' +
            '<li><b>Создайте игру</b><span>Выберите предмет и темы, количество команд, таймер, фон и бонусы.</span></li>' +
            '<li><b>Разделитесь на команды</b><span>Отвечайте вслух у доски — или заходите с телефонов по коду с экрана.</span></li>' +
            '<li><b>Открывайте плитки</b><span>Лёгкий вопрос — 10 очков, средний — 15, сложный — 20. За некоторыми плитками прячутся бонусы.</span></li>' +
          '</ol>' +
        '</section>' +
        '<footer class="foot">Alibaba — командная викторина. В базе: ' +
          FB.subjects.map(function (s) { return UI.esc(s.title + (s.grade ? ' ' + s.grade : '')); }).join(', ') + '.</footer>' +
      '</div>';
    UI.screen('home', html);
    var input = UI.$('#codeInput');
    if (opts.code) input.value = UI.fmtCode(opts.code);
    if (opts.error) { UI.$('#joinErr').textContent = opts.error; }
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 6);
      input.value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
      UI.$('#joinErr').textContent = '';
    });
    UI.$('#joinForm').addEventListener('submit', function (e) {
      e.preventDefault();
      FB.FX.unlock();
      var d = input.value.replace(/\D/g, '');
      if (d.length !== 6) { UI.$('#joinErr').textContent = 'Код состоит из 6 цифр — посмотрите на экран организатора.'; input.focus(); return; }
      FB.Player.start(d);
    });
    var rj = UI.$('#rejoinBtn');
    if (rj) rj.addEventListener('click', function () { FB.FX.unlock(); FB.Player.start(plSave.code); });
    function create() { FB.FX.unlock(); UI.setup(); }
    if (!phone) {
      UI.$('#createBtn').addEventListener('click', create);
      UI.$('#createBtnNav').addEventListener('click', create);
    }
    UI.$('.nav').addEventListener('click', function (e) {
      var a = e.target.closest('[data-nav]');
      if (!a) return;
      e.preventDefault();
      var k = a.getAttribute('data-nav');
      if (k === 'top') root.scrollTo({ top: 0, behavior: 'smooth' });
      else if (k === 'code') { root.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(function () { input.focus(); }, 250); }
      else { var el = document.getElementById(k); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    if (!phone) UI.$('#homeSearch').addEventListener('input', function (e) { UI.$('#libArea').innerHTML = homeTopicCards(e.target.value); });
    var chips = UI.$('#libChips');
    if (chips) chips.addEventListener('click', function (e) {
      var c = e.target.closest('[data-lib]');
      if (!c) return;
      libSubj = c.getAttribute('data-lib');
      UI.$$('.lib-chip', chips).forEach(function (b) { var on = b === c; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      UI.$('#homeSearch').value = '';
      UI.$('#libArea').innerHTML = homeTopicCards('');
    });
    if (!phone) UI.$('#libArea').addEventListener('click', function (e) {
      var c = e.target.closest('[data-play]');
      if (!c) return;
      FB.FX.unlock();
      UI.setup(3, [c.getAttribute('data-play')]);
    });
    var rb = UI.$('#resumeBtn');
    if (rb) rb.addEventListener('click', function () { FB.FX.unlock(); FB.Host.resume(); });
    var db = UI.$('#dropBtn');
    if (db) db.addEventListener('click', function () {
      UI.confirm('Удалить незаконченную игру? Её нельзя будет продолжить.', 'Удалить').then(function (ok) {
        if (ok) { FB.Host.clearSave(); UI.home(); }
      });
    });
  };

  /* ===================== Создание игры ===================== */
  UI.logo = function (item, cls) {
    if (item && item.img) return '<img class="' + (cls || 'logo') + '" src="' + UI.esc(item.img) + '" alt="" draggable="false">';
    return '<span class="' + (cls || 'logo') + ' logo-emo" aria-hidden="true">' + ((item && item.icon) || '📘') + '</span>';
  };
  /* Значок раздела: три картинки его первых тем веером */
  UI.stackLogo = function (topics, cls) {
    return '<span class="' + (cls || 'logo') + ' logo-stack" aria-hidden="true">' + topics.slice(0, 3).map(function (t) {
      return t.img ? '<img src="' + UI.esc(t.img) + '" alt="" draggable="false">' : '<i>' + (t.icon || '📘') + '</i>';
    }).join('') + '</span>';
  };
  UI.powerImg = function (id, cls) {
    var p = E.POWER[id];
    return p ? '<img class="' + (cls || 'pw-img') + '" src="' + p.img + '" alt="" draggable="false">' : '';
  };

  var DEFAULT_CFG = {
    mode: 'screen', teamCount: 2, teams: ['Команда 1', 'Команда 2', 'Команда 3', 'Команда 4'],
    count: 16, timer: 30, theme: 'violet', winVideo: '',
    powerOn: true, freq: 'mid', powerIds: E.PRESETS.classic.slice()
  };
  var S = null;

  function loadCfg() {
    var c = UI.store.get('alibaba.setup', null) || {};
    var out = {};
    Object.keys(DEFAULT_CFG).forEach(function (k) { out[k] = c[k] != null ? c[k] : (Array.isArray(DEFAULT_CFG[k]) ? DEFAULT_CFG[k].slice() : DEFAULT_CFG[k]); });
    if (!Array.isArray(out.teams) || out.teams.length < 4) out.teams = DEFAULT_CFG.teams.slice();
    out.powerIds = (out.powerIds || []).filter(function (id) { return E.POWER[id]; });
    if (!out.powerIds.length) out.powerIds = E.PRESETS.classic.slice();
    if ([2, 3, 4].indexOf(out.teamCount) < 0) out.teamCount = 2;
    if (out.mode !== 'screen') out.mode = 'kahoot';
    return out;
  }
  function saveCfg() { UI.store.set('alibaba.setup', S.cfg); }
  function subjectById(id) { return FB.subjects.filter(function (x) { return x.id === id; })[0] || null; }

  UI.setup = function (startStep, preselect) {
    if (UI.isPhone()) { UI.home(); return; }
    S = {
      step: startStep || 1,
      subjectId: FB.subjects.length === 1 ? FB.subjects[0].id : null,
      query: '', topicQuery: '',
      selected: (preselect || []).filter(function (k) { return FB.findTopic(k); }),
      cfg: loadCfg()
    };
    if (S.selected.length) S.subjectId = S.selected[0].split('/')[0];
    if (S.step === 3 && !S.selected.length) S.step = 1;
    UI.applyTheme(S.cfg.theme);
    renderSetup();
  };

  function stepper() {
    var steps = ['Предмет', 'Тема', 'Настройки'];
    return '<ol class="stepper" aria-label="Шаги">' + steps.map(function (t, i) {
      var n = i + 1, cls = n === S.step ? 'on' : (n < S.step ? 'done' : '');
      return '<li class="' + cls + '"' + (n === S.step ? ' aria-current="step"' : '') + '><span class="num">' + n + '</span><span class="t">' + t + '</span></li>';
    }).join('') + '</ol>';
  }

  function renderSetup() {
    var body = S.step === 1 ? stepSubject() : (S.step === 2 ? stepTopics() : stepSettings());
    UI.screen('setup',
      '<div class="setup step' + S.step + '">' +
        '<header class="setup-top">' +
          '<button class="btn btn-ghost btn-small" id="backBtn" type="button">← Назад</button>' +
          stepper() +
          '<span class="setup-logo">' + UI.wordmark('wordmark-sm') + '</span>' +
        '</header>' +
        '<div class="setup-body" id="setupBody">' + body + '</div>' +
        (S.step === 3 ? '<footer class="setup-bar"><button class="btn btn-yellow btn-lg" id="createGameBtn" type="button">Создать игру</button></footer>' : '') +
      '</div>');
    bindSetup();
  }

  /* ---- поиск тем ---- */
  function searchTopics(query, subjectId) {
    var words = UI.norm(query).split(/[\s,.;:!?«»"()]+/).filter(Boolean).map(function (w) {
      return w.length > 6 ? w.slice(0, -2) : (w.length > 4 ? w.slice(0, -1) : w);
    });
    var res = [];
    FB.subjects.forEach(function (s) {
      if (subjectId && s.id !== subjectId) return;
      s.topics.forEach(function (t) {
        var main = UI.norm(t.title + ' ' + t.tags + ' ' + s.title + ' ' + s.grade);
        var score = 0, okAll = true;
        words.forEach(function (w) {
          if (UI.norm(t.title).indexOf(w) >= 0) score += 3;
          else if (main.indexOf(w) >= 0) score += 2;
          else if (w.length >= 4 && t.q.some(function (x) { return UI.norm(x.text).indexOf(w) >= 0; })) score += 1;
          else okAll = false;
        });
        if (okAll && words.length) res.push({ s: s, t: t, score: score });
      });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  }
  UI.searchTopics = searchTopics;

  function gameCard(attr, i, logoHtml, title, sub, count) {
    return '<button type="button" class="game-card gc' + (i % 8) + '" ' + attr + '>' +
      '<span class="gc-art">' + logoHtml + (count ? '<span class="gc-n">' + count + '</span>' : '') + '</span>' +
      '<span class="gc-body"><span class="gc-t">' + UI.esc(title) + '</span>' + (sub ? '<span class="gc-s">' + UI.esc(sub) + '</span>' : '') + '</span>' +
    '</button>';
  }
  UI.gameCard = gameCard;
  function qn(n) { return n + ' ' + UI.plural(n, 'вопрос', 'вопроса', 'вопросов'); }

  function topicResults(query, subjectId) {
    var res = searchTopics(query, subjectId);
    if (!res.length) return '<p class="empty">Ничего не нашлось по запросу «' + UI.esc(query) + '»</p>';
    return '<div class="lib">' + res.map(function (r, i) {
      return gameCard('data-topic="' + UI.esc(FB.topicKey(r.s.id, r.t.id)) + '"', i, UI.logo(r.t, 'gc-logo'), r.t.title,
        subjectId ? '' : r.s.title + (r.s.grade ? ', ' + r.s.grade : ''), qn(r.t.q.length));
    }).join('') + '</div>';
  }

  /* ---- Шаг 1: предмет ---- */
  function stepSubject() {
    return '<h2 class="setup-h">Предмет</h2>' +
      '<div class="search">' + UI.SEARCH_ICO + '<input type="search" id="globalSearch" placeholder="Поиск темы" value="' + UI.esc(S.query) + '" aria-label="Поиск темы"></div>' +
      '<div id="searchArea">' + subjectArea() + '</div>';
  }
  function subjectArea() {
    if (S.query.trim()) return topicResults(S.query, null);
    var multi = UI.GROUPS.filter(function (g) { return FB.subjects.some(function (s) { return s.group === g[0]; }); }).length > 1;
    return UI.GROUPS.map(function (g) {
      var list = FB.subjects.filter(function (s) { return s.group === g[0]; });
      if (!list.length) return '';
      return (multi ? '<h3 class="grp-h">' + g[1] + '</h3>' : '') + '<div class="lib subjects-lib">' + list.map(function (s) {
        return gameCard('data-subject="' + UI.esc(s.id) + '"', FB.subjects.indexOf(s) + 4, UI.logo(s, 'gc-logo'), s.title, s.grade,
          s.topics.length + ' ' + UI.plural(s.topics.length, 'тема', 'темы', 'тем'));
      }).join('') + '</div>';
    }).join('');
  }

  /* ---- Шаг 2: тема ---- */
  function stepTopics() {
    var s = subjectById(S.subjectId);
    if (!s) { S.step = 1; return stepSubject(); }
    return '<h2 class="setup-h with-logo">' + UI.logo(s, 'h-logo') + UI.esc(s.title) + (s.grade ? ' <span class="grade">' + UI.esc(s.grade) + '</span>' : '') + '</h2>' +
      '<div class="search">' + UI.SEARCH_ICO + '<input type="search" id="topicSearch" placeholder="Поиск темы" value="' + UI.esc(S.topicQuery) + '" aria-label="Поиск темы"></div>' +
      '<div id="topicArea">' + topicArea(s) + '</div>';
  }
  /* Темы, разбитые по разделам учебника (поле section у темы) */
  UI.sectionsOf = function (s) {
    if (!s.topics.some(function (t) { return t.section; })) return null;
    var out = [];
    s.topics.forEach(function (t) {
      var last = out[out.length - 1];
      if (!last || last.name !== t.section) out.push(last = { name: t.section, topics: [] });
      last.topics.push(t);
    });
    return out;
  };
  function topicArea(s) {
    if (S.topicQuery.trim()) return topicResults(S.topicQuery, s.id);
    var total = s.topics.reduce(function (a, t) { return a + t.q.length; }, 0);
    var mix = s.topics.length > 1 ? gameCard('data-mix="' + UI.esc(s.id) + '"', 0, '<img class="gc-logo" src="img/ui/mix.webp" alt="" draggable="false">', 'Все темы', 'Вперемешку', qn(total)) : '';
    var secs = UI.sectionsOf(s);
    if (secs) {
      var n = 0;
      return '<div class="lib">' + mix + '</div>' + secs.map(function (sec, si) {
        var sum = sec.topics.reduce(function (a, t) { return a + t.q.length; }, 0);
        return '<h3 class="sec-h">' + UI.esc(sec.name) + '</h3><div class="lib">' +
          (sec.topics.length > 1 ? gameCard('data-sec="' + UI.esc(s.id) + '|' + si + '"', 0, UI.stackLogo(sec.topics, 'gc-logo'), 'Весь раздел',
            sec.topics.length + ' ' + UI.plural(sec.topics.length, 'тема', 'темы', 'тем') + ' вперемешку', qn(sum)) : '') +
          sec.topics.map(function (t) {
            n++;
            return gameCard('data-topic="' + UI.esc(FB.topicKey(s.id, t.id)) + '"', n, UI.logo(t, 'gc-logo'), t.title, '', qn(t.q.length));
          }).join('') + '</div>';
      }).join('');
    }
    return '<div class="lib">' + mix +
      s.topics.map(function (t, i) {
        return gameCard('data-topic="' + UI.esc(FB.topicKey(s.id, t.id)) + '"', i + 1, UI.logo(t, 'gc-logo'), t.title, '', qn(t.q.length));
      }).join('') + '</div>';
  }

  /* ---- Шаг 3: настройки ---- */
  function seg(name, options, value) {
    return '<div class="seg" role="radiogroup" data-seg="' + name + '">' + options.map(function (o) {
      var on = String(o.v) === String(value);
      return '<button type="button" role="radio" aria-checked="' + on + '" class="' + (on ? 'on' : '') + '" data-v="' + UI.esc(o.v) + '"' + (o.disabled ? ' disabled' : '') + '>' + o.t + '</button>';
    }).join('') + '</div>';
  }
  function row(name, ctl, extraCls) {
    return '<div class="set-row' + (extraCls ? ' ' + extraCls : '') + '"><span class="set-name">' + name + '</span><div class="set-ctl">' + ctl + '</div></div>';
  }
  /* Что выбрано: одна тема, целый раздел учебника или все темы предмета */
  function selectionInfo() {
    var keys = S.selected, first = FB.findTopic(keys[0]);
    if (keys.length === 1) return { kind: 'one', first: first, title: first.topic.title };
    var secs = UI.sectionsOf(first.subject) || [], key = keys.slice().sort().join(',');
    for (var i = 0; i < secs.length; i++) {
      var sk = secs[i].topics.map(function (t) { return FB.topicKey(first.subject.id, t.id); }).sort().join(',');
      if (secs[i].topics.length > 1 && sk === key) return { kind: 'section', first: first, title: secs[i].name, sec: secs[i] };
    }
    return { kind: 'all', first: first, title: 'Все темы' };
  }
  function chosenHeader() {
    var info = selectionInfo(), first = info.first;
    var logo = info.kind === 'one' ? UI.logo(first.topic, 'h-logo') :
      info.kind === 'section' ? UI.stackLogo(info.sec.topics, 'h-logo') : '<img class="h-logo" src="img/ui/mix.webp" alt="">';
    var sub = first.subject.title + (first.subject.grade ? ', ' + first.subject.grade : '') + (info.kind === 'section' ? '. Весь раздел' : '');
    return '<div class="chosen">' + logo + '<span><b>' + UI.esc(info.title) + '</b><small>' + UI.esc(sub) + '</small></span></div>';
  }
  function stepSettings() {
    var c = S.cfg;
    var avail = E.availableCount(S.selected);
    var opts;
    if (c.mode === 'kahoot') {
      opts = [10, 15, 20, 25, 30].filter(function (n) { return n <= avail; });
      if (avail < 30 && opts.indexOf(avail) < 0) opts.push(avail);
      if (opts.indexOf(c.count) < 0) c.count = opts.filter(function (n) { return n <= 20; }).pop() || opts[0];
    } else {
      opts = [16, 24]; // поле 4 × 4 или 4 × 6, как в Baamboozle
      if (opts.indexOf(c.count) < 0) c.count = 16;
    }
    var teamInputs = '';
    for (var i = 0; i < c.teamCount; i++) {
      teamInputs += '<label class="team-input" style="--tc:' + E.TEAM_COLORS[i] + '"><span class="dot" aria-hidden="true"></span>' +
        '<span class="sr-only">Команда ' + (i + 1) + '</span><input type="text" maxlength="24" data-team="' + i + '" value="' + UI.esc(c.teams[i]) + '"></label>';
    }
    var isK = c.mode === 'kahoot';
    var modes = [['screen', 'Baamboozle', 'screen'], ['kahoot', 'Kahoot', 'phones']].map(function (m) {
      var on = c.mode === m[0];
      return '<button type="button" role="radio" aria-checked="' + on + '" class="mode' + (on ? ' on' : '') + '" data-mode="' + m[0] + '">' +
        '<img src="img/ui/' + m[2] + '.webp" alt="" draggable="false"><b>' + m[1] + '</b></button>';
    }).join('');
    var timers = isK ? [10, 20, 30, 60] : [0, 20, 30, 45, 60];
    if (timers.indexOf(c.timer) < 0) c.timer = isK ? 20 : 30;
    var themes = UI.THEMES.map(function (t) {
      var on = c.theme === t.id;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="theme-sw th-' + t.id + (on ? ' on' : '') + '" data-theme-pick="' + t.id + '">' +
        '<span class="sw-prev" aria-hidden="true"><i></i><i></i><i></i></span><span class="sw-name">' + t.name + '</span></button>';
    }).join('');
    var pws = E.POWERUPS.map(function (p) {
      var on = c.powerIds.indexOf(p.id) >= 0;
      return '<button type="button" class="pw' + (on ? ' on' : '') + '" data-pw="' + p.id + '" aria-pressed="' + on + '">' +
        UI.powerImg(p.id) + '<b>' + UI.esc(p.name) + '</b></button>';
    }).join('');
    return chosenHeader() +
      '<div class="settings">' +
        row('Режим', '<div class="modes" role="radiogroup">' + modes + '</div>') +
        (isK ? '' : row('Команды', '<div class="row-gap">' + seg('teamCount', [{ v: 2, t: '2' }, { v: 3, t: '3' }, { v: 4, t: '4' }], c.teamCount) +
          '<button type="button" class="dice-btn" id="randNames" aria-label="Случайные названия" title="Случайные названия"><img src="img/ui/dice.webp" alt=""></button></div>' +
          '<div class="team-inputs">' + teamInputs + '</div>')) +
        row('Вопросы', seg('count', opts.map(function (n) { return { v: n, t: String(n) }; }), c.count)) +
        row('Таймер', seg('timer', timers.map(function (n) { return { v: n, t: n ? n + ' с' : 'Нет' }; }), c.timer)) +
        row('Фон', '<div class="themes" role="radiogroup">' + themes + '</div>') +
        (isK ? '' : row('Бонусы', '<label class="switch"><input type="checkbox" id="powerOn"' + (c.powerOn ? ' checked' : '') + '><span class="sw" aria-hidden="true"></span><span class="sr-only">Бонусы</span></label>') +
        (c.powerOn ?
          row('Частота', seg('freq', [{ v: 'low', t: 'Мало' }, { v: 'mid', t: 'Средне' }, { v: 'high', t: 'Много' }], c.freq)) +
          row('Power-ups', '<div class="pws">' + pws + '</div><button type="button" class="btn btn-ghost btn-small" data-preset="all">Выбрать все</button>', 'tall') : '')) +
      '</div>';
  }

  function bindSetup() {
    var body = UI.$('#setupBody');
    UI.$('#backBtn').addEventListener('click', function () {
      if (S.step === 1) { UI.home(); return; }
      if (S.step === 3 && S.query.trim() && !S.fromSubject) { S.step = 1; renderSetup(); return; }
      S.step -= 1;
      if (S.step === 2 && !subjectById(S.subjectId)) S.step = 1;
      renderSetup();
    });
    var cg = UI.$('#createGameBtn');
    if (cg) cg.addEventListener('click', createGame);
    body.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-subject]'))) {
        S.subjectId = t.getAttribute('data-subject'); S.topicQuery = ''; S.step = 2; FB.FX.play('click'); renderSetup(); return;
      }
      if ((t = e.target.closest('[data-topic]'))) {
        var key = t.getAttribute('data-topic');
        S.selected = [key]; S.subjectId = key.split('/')[0]; S.fromSubject = S.step === 2; S.step = 3;
        FB.FX.play('click'); renderSetup(); return;
      }
      if ((t = e.target.closest('[data-sec]'))) {
        var parts = t.getAttribute('data-sec').split('|'), ss = subjectById(parts[0]), sec = UI.sectionsOf(ss)[+parts[1]];
        S.selected = sec.topics.map(function (tp) { return FB.topicKey(ss.id, tp.id); }); S.subjectId = ss.id; S.fromSubject = true; S.step = 3;
        FB.FX.play('click'); renderSetup(); return;
      }
      if ((t = e.target.closest('[data-mix]'))) {
        var sub = subjectById(t.getAttribute('data-mix'));
        S.selected = sub.topics.map(function (tp) { return FB.topicKey(sub.id, tp.id); }); S.fromSubject = true; S.step = 3;
        FB.FX.play('click'); renderSetup(); return;
      }
      if ((t = e.target.closest('[data-theme-pick]'))) {
        S.cfg.theme = t.getAttribute('data-theme-pick'); UI.applyTheme(S.cfg.theme); saveCfg(); rerenderSettings(); return;
      }
      if ((t = e.target.closest('[data-mode]'))) { S.cfg.mode = t.getAttribute('data-mode'); saveCfg(); rerenderSettings(); return; }
      if ((t = e.target.closest('.seg button'))) {
        var name = t.closest('.seg').getAttribute('data-seg');
        var v = t.getAttribute('data-v');
        S.cfg[name] = (name === 'freq') ? v : Number(v);
        saveCfg(); rerenderSettings(); return;
      }
      if (e.target.closest('#randNames')) {
        var pool = E.shuffle(E.TEAM_NAMES.slice());
        for (var k = 0; k < 4; k++) S.cfg.teams[k] = pool[k];
        FB.FX.play('click'); saveCfg(); rerenderSettings(); return;
      }
      if ((t = e.target.closest('[data-preset]'))) { S.cfg.powerIds = E.PRESETS.all.slice(); saveCfg(); rerenderSettings(); return; }
      if ((t = e.target.closest('[data-pw]'))) {
        var id = t.getAttribute('data-pw');
        var j = S.cfg.powerIds.indexOf(id);
        if (j >= 0) {
          if (S.cfg.powerIds.length === 1) { UI.toast('Нужен хотя бы один бонус'); return; }
          S.cfg.powerIds.splice(j, 1);
        } else S.cfg.powerIds.push(id);
        t.classList.toggle('on', j < 0); t.setAttribute('aria-pressed', String(j < 0));
        saveCfg(); return;
      }
    });
    body.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'globalSearch') { S.query = t.value; UI.$('#searchArea').innerHTML = subjectArea(); return; }
      if (t.id === 'topicSearch') { S.topicQuery = t.value; UI.$('#topicArea').innerHTML = topicArea(subjectById(S.subjectId)); return; }
      if (t.hasAttribute('data-team')) { S.cfg.teams[Number(t.getAttribute('data-team'))] = t.value; saveCfg(); }
      if (t.id === 'winVideo') { S.cfg.winVideo = t.value.trim(); saveCfg(); }
    });
    body.addEventListener('change', function (e) {
      if (e.target.id === 'powerOn') { S.cfg.powerOn = e.target.checked; saveCfg(); rerenderSettings(); }
    });
    var gs = UI.$('#globalSearch') || UI.$('#topicSearch');
    if (gs && gs.value) { gs.focus(); gs.setSelectionRange(gs.value.length, gs.value.length); }
  }
  function rerenderSettings() {
    var y = root.scrollY;
    UI.$('#setupBody').innerHTML = stepSettings();
    root.scrollTo(0, y);
  }

  function createGame() {
    var c = S.cfg;
    if (!S.selected.length) { S.step = 1; renderSetup(); return; }
    var names = [];
    for (var i = 0; i < c.teamCount; i++) names.push(E.cleanName(c.teams[i], 24) || ('Команда ' + (i + 1)));
    var lower = names.map(function (n) { return n.toLowerCase(); });
    if (lower.some(function (n, i) { return lower.indexOf(n) !== i; })) {
      UI.toast('Названия команд повторяются');
      var dupIn = UI.$('[data-team]'); if (dupIn) dupIn.focus();
      return;
    }
    var avail = E.availableCount(S.selected);
    var info = selectionInfo(), first = info.first;
    var title = info.kind === 'all' ? first.subject.title + ': все темы' : info.title;
    var subtitle = first.subject.title + (first.subject.grade ? ', ' + first.subject.grade : '');
    FB.Host.create({
      mode: c.mode, teams: names, topicKeys: S.selected.slice(),
      count: c.mode === 'kahoot' ? Math.min(c.count, avail) : c.count, timer: c.timer, theme: c.theme, winVideo: c.winVideo,
      powerups: { on: c.powerOn, freq: c.freq, ids: c.powerIds.slice() },
      title: title, subtitle: subtitle
    });
  }
})(window);
