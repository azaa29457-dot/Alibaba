/* Alibaba — режим Blooket: каждый играет на своём телефоне в своём темпе, игра идёт на время.
   Три игры:
   • «Золотая лихорадка» — за верный ответ открываешь один из трёх сундуков: золото, ×2, кража, обмен…
   • «Кибер-хак» — добываешь крипту и взламываешь других игроков, угадывая их пароль.
   • «Рыбалка» — за верный ответ закидываешь удочку и ловишь рыбу; счёт — общий вес улова в килограммах.
   Ведущий видит таблицу лидеров и ленту событий, игрок — свой вопрос и свой ход.
   Состояние игрока личное: телефон получает только свою часть (B.me), а общая часть (B.view) — для всех. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  var E = FB.Engine;
  var B = {};

  B.GAMES = {
    gold: { id: 'gold', name: 'Золотая лихорадка', unit: 'золота', img: 'gold',
      about: 'Верный ответ — открываешь сундук: золото, удвоение, кража у соперника или обмен.' },
    hack: { id: 'hack', name: 'Кибер-хак', unit: 'крипты', img: 'hack',
      about: 'Верный ответ — добываешь крипту или взламываешь соперника, угадав его пароль.' },
    fish: { id: 'fish', name: 'Рыбалка', unit: 'кг', img: 'rod',
      about: 'Верный ответ — закидываешь удочку. Ловишь рыбу, у кого улов тяжелее — тот и победил.' }
  };
  B.ORDER = ['gold', 'hack', 'fish'];
  B.MINUTES = [3, 5, 7, 10];
  B.POOL_MAX = 60;          // вопросов в одной игре (каждый игрок проходит их в своём порядке)
  B.FRENZY_MS = 20000;      // «Клёв!»: 20 секунд все ловят вдвое больше
  B.FEED_MAX = 24;
  B.LURE_MAX = 4;
  B.WRONG_MS = 3000;     // после неверного ответа — 3 секунды на правильный ответ, потом сам следующий вопрос

  /* Пароли как в Blooket (Crypto Hack): цифры, «клавиатурные», популярные слабые пароли, смешные длинные слова.
     Плюс к ним каждый раз добавляются случайные наборы букв и цифр. Во всех предметах одинаково. */
  B.PASSWORDS = ['12345678', '123456789', '11111111', '00000000', '87654321', '13579135', '24682468', '1q2w3e4r',
    'qwerty', 'qwerty123', 'asdfghjkl', 'zxcvbnm', 'password', 'password123', 'p4ssw0rd', 'letmein', 'admin',
    'admin2025', 'welcome1', 'abc123', 'abcdefgh', 'aaaaaaaa', 'hello123', 'secret', 'supersecret', 'trustno1',
    'iloveyou', 'sunshine', 'monkey123', 'football', 'h4ck3r', 'ninja007', 'nopassword', 'pizzalover',
    'chickennugget', 'bananaboat', 'purplemonkey', 'hackerman', 'cryptoking', 'superhacker', 'ilovecats',
    'doggo2025', 'xX_gamer_Xx', 'unicorn777', 'potato42', 'cookiemonster'];
  B.randomPassword = function () {
    var abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', len = 7 + rnd(3), out = '';
    for (var i = 0; i < len; i++) out += abc[rnd(abc.length)];
    return out;
  };
  B.PASS_CHOICES = 5;   // из скольких паролей игрок выбирает свой
  B.GUESS_CHOICES = 3;  // из скольких угадывает пароль соперника

  function rnd(n) { return Math.floor(E.random() * n); }
  function rint(a, b) { return a + rnd(b - a + 1); }
  function pickW(list, wf) {
    var sum = 0;
    list.forEach(function (x) { sum += wf(x); });
    var r = E.random() * sum;
    for (var i = 0; i < list.length; i++) { r -= wf(list[i]); if (r < 0) return list[i]; }
    return list[list.length - 1];
  }

  /* ---------- Сундуки ---------- */
  // [вид, число, вес]: add — +N, pct — +N%, mul — ×N, lose — −N%, none — пусто, steal — украсть %, swap — обмен, hack — взлом
  var BOXES = {
    gold: [['add', 10, 12], ['add', 20, 12], ['add', 30, 10], ['add', 40, 8], ['add', 50, 6], ['add', 100, 2],
      ['pct', 25, 5], ['pct', 50, 3], ['mul', 2, 3], ['mul', 3, 1], ['lose', 25, 4], ['lose', 50, 2],
      ['none', 0, 4], ['steal', 0, 8], ['swap', 0, 2]],
    hack: [['add', 10, 10], ['add', 25, 12], ['add', 50, 10], ['add', 75, 7], ['add', 100, 5], ['add', 250, 1],
      ['mul', 2, 3], ['mul', 3, 1], ['hack', 0, 13], ['lose', 25, 3], ['none', 0, 4]]
  };
  var STEAL_PCT = [10, 20, 25, 30, 40, 50];
  // score — сколько у игрока сейчас: пока у него 0, проценты, умножение и потери ничего бы не дали — их нет в сундуках
  B.rollBox = function (game, score) {
    var pool = BOXES[game].filter(function (e) { return score > 0 || ['pct', 'mul', 'lose'].indexOf(e[0]) < 0; }), out = [];
    while (out.length < 3 && pool.length) {
      var x = pickW(pool, function (e) { return e[2]; });
      pool.splice(pool.indexOf(x), 1);
      var it = { k: x[0], n: x[1] };
      if (it.k === 'steal') it.n = STEAL_PCT[rnd(STEAL_PCT.length)];
      out.push(it);
    }
    return out;
  };
  /* Подпись и картинка для содержимого сундука */
  B.label = function (game, it) {
    var g = game === 'hack';
    switch (it.k) {
      case 'add': return { t: '+' + it.n, s: g ? 'крипты' : 'золота', img: g ? 'mine' : (it.n >= 100 ? 'bag' : 'gold') };
      case 'pct': return { t: '+' + it.n + '%', s: 'к золоту', img: 'up' };
      case 'mul': return { t: '×' + it.n, s: it.n === 2 ? 'удвоение' : 'утроение', img: it.n === 2 ? 'x2' : 'x3' };
      case 'lose': return { t: '−' + it.n + '%', s: g ? 'вирус!' : 'потеря', img: g ? 'virus' : 'lose' };
      case 'none': return { t: g ? 'Сбой' : 'Пусто', s: g ? 'ничего не вышло' : 'ничего нет', img: 'web' };
      case 'steal': return { t: 'Кража', s: it.n + '% у соперника', img: 'ninja' };
      case 'swap': return { t: 'Обмен', s: 'золотом с соперником', img: 'swap' };
      case 'hack': return { t: 'Взлом', s: 'угадай пароль соперника', img: 'unlock' };
    }
    return { t: '?', s: '', img: 'web' };
  };

  /* ---------- Рыбалка ---------- */
  // w — вес (вероятность) для уровней наживки 0..4
  B.FISH = [
    { id: 'boot', name: 'Старый ботинок', tier: 0, min: 0, max: 0, w: [8, 6, 5, 4, 3] },
    { id: 'shrimp', name: 'Креветка', tier: 1, min: 1, max: 3, w: [18, 14, 11, 8, 6] },
    { id: 'fish1', name: 'Карась', tier: 1, min: 2, max: 6, w: [20, 16, 13, 10, 8] },
    { id: 'tropic', name: 'Тропическая рыбка', tier: 1, min: 3, max: 8, w: [14, 13, 12, 10, 8] },
    { id: 'crab', name: 'Краб', tier: 2, min: 4, max: 10, w: [10, 11, 11, 10, 9] },
    { id: 'puffer', name: 'Рыба-фугу', tier: 2, min: 6, max: 14, w: [8, 9, 10, 10, 9] },
    { id: 'squid', name: 'Кальмар', tier: 3, min: 10, max: 25, w: [5, 7, 9, 10, 11] },
    { id: 'octopus', name: 'Осьминог', tier: 3, min: 15, max: 35, w: [4, 6, 8, 9, 10] },
    { id: 'turtle', name: 'Черепаха', tier: 3, min: 20, max: 45, w: [3, 4, 6, 8, 9] },
    { id: 'dolphin', name: 'Дельфин', tier: 4, min: 40, max: 80, w: [1.5, 2.5, 4, 5, 7] },
    { id: 'shark', name: 'Акула', tier: 4, min: 60, max: 120, w: [1, 2, 3, 4, 6] },
    { id: 'whale', name: 'Кит', tier: 5, min: 150, max: 300, w: [0.3, 0.5, 1, 1.5, 2.5] },
    { id: 'worm', name: 'Наживка', special: 'lure', w: [6, 5, 4, 3, 0] },
    { id: 'frenzy', name: 'Клёв!', special: 'frenzy', w: [3, 3, 3, 3, 3] }
  ];
  B.FISH_BY = {};
  B.FISH.forEach(function (f) { B.FISH_BY[f.id] = f; });
  B.TIERS = ['мусор', 'обычная', 'необычная', 'редкая', 'эпическая', 'легендарная'];
  B.rollFish = function (lure) {
    var L = Math.max(0, Math.min(B.LURE_MAX, lure | 0));
    return pickW(B.FISH, function (f) { return f.w[L]; });
  };

  /* ---------- Создание ---------- */
  function makePool(topicKeys) {
    var n = Math.min(B.POOL_MAX, E.availableCount(topicKeys || []));
    return E.pickQuestions(topicKeys || [], Math.max(1, n)).map(function (x) {
      return { text: x.text, d: x.d, topic: x.topic, opts: x.opts.slice() }; // верный ответ — opts[0]
    });
  }
  B.create = function (cfg, now) {
    now = now || Date.now();
    var game = B.GAMES[cfg.game] ? cfg.game : 'gold';
    var minutes = B.MINUTES.indexOf(cfg.minutes | 0) >= 0 ? cfg.minutes | 0 : 7;
    return {
      kind: 'blooket', mode: 'blooket', game: game, id: Math.random().toString(36).slice(2, 10), v: 1, created: now,
      code: cfg.code || null,
      cfg: {
        topicKeys: (cfg.topicKeys || []).slice(), minutes: minutes, game: game,
        title: cfg.title || 'Викторина', subtitle: cfg.subtitle || '', theme: cfg.theme || 'violet', winVideo: cfg.winVideo || ''
      },
      pool: makePool(cfg.topicKeys), phase: 'lobby', start: null, ends: null, frenzy: 0,
      players: {}, feed: [], fn: 0
    };
  };

  function list(s) { return Object.keys(s.players).map(function (k) { return s.players[k]; }); }
  B.ranking = function (s) {
    return list(s).sort(function (a, b) { return b.score - a.score || (a.joined || 0) - (b.joined || 0); })
      .map(function (p, i, arr) {
        var place = i + 1;
        if (i > 0 && arr[i - 1].score === p.score) place = arr[i - 1]._place;
        p._place = place;
        return p;
      });
  };
  function who(p) { return { name: p.name, av: p.av }; }
  function feed(s, now, e) {
    s.fn++;
    e.n = s.fn; e.t = now;
    s.feed.push(e);
    if (s.feed.length > B.FEED_MAX) s.feed.splice(0, s.feed.length - B.FEED_MAX);
  }
  function alert(p, text, mood) {
    p.an = (p.an || 0) + 1;
    p.alerts = (p.alerts || []).concat([{ n: p.an, txt: text, mood: mood }]).slice(-3);
    p.pv++;
  }
  function setSt(p, st) { p.st = st; p.step++; p.pv++; }
  // n разных паролей: один — случайный набор букв и цифр, остальные — из готового списка
  function passwords(s, n, except) {
    var list = E.shuffle(B.PASSWORDS.filter(function (w) { return w !== except; })).slice(0, Math.max(0, n - 1));
    return E.shuffle(list.concat([B.randomPassword()])).slice(0, n);
  }

  function nextQ(s, p) {
    if (!p.order || !p.order.length) p.order = E.shuffle(s.pool.map(function (x, i) { return i; }));
    var qi = p.order.shift();
    p.q = { i: qi, perm: E.shuffle([0, 1, 2, 3]) };
    p.box = null; p.res = null; p.guess = null;
    setSt(p, 'q');
  }
  function enter(s, p) {
    // игрок начинает играть: в «Кибер-хаке» сначала выбирает пароль
    if (s.game === 'hack' && !p.pass) { p.passOpts = passwords(s, B.PASS_CHOICES); setSt(p, 'pass'); }
    else nextQ(s, p);
  }

  function addScore(p, d) { p.score = Math.max(0, p.score + d); }

  /* Содержимое сундука сразу (без выбора соперника) */
  function applyBox(s, p, it, now, ev) {
    var d = 0;
    if (it.k === 'add') d = it.n;
    else if (it.k === 'pct') d = Math.round(p.score * it.n / 100);
    else if (it.k === 'mul') d = p.score * (it.n - 1);
    else if (it.k === 'lose') d = -Math.round(p.score * it.n / 100);
    addScore(p, d);
    p.res = { k: it.k, n: it.n, delta: d };
    if ((it.k === 'mul' && it.n === 3 && d > 0) || (it.k === 'add' && it.n >= 100)) {
      feed(s, now, { k: 'big', a: who(p), img: B.label(s.game, it).img, txt: (it.k === 'mul' ? 'утроение: ' : '') + '+' + d + ' ' + B.GAMES[s.game].unit });
      ev.push({ type: 'bbig' });
    }
    setSt(p, 'reveal');
  }
  function others(s, p) { return list(s).filter(function (o) { return o.id !== p.id; }); }

  B.act = function (s, a, now) {
    now = now || Date.now();
    var ev = [], touched = [];
    var ok = (function () {
      var p = a.pid ? s.players[a.pid] : null;
      // ход игрока принимается, только если он относится к текущему шагу (повторно отправленные сообщения не срабатывают дважды)
      function mine(st) {
        if (!p || s.phase !== 'play' || p.st !== st) return false;
        if (a.step != null && Number(a.step) !== p.step) return false;
        touched.push(p.id);
        return true;
      }
      switch (a.type) {
        case 'join': {
          var name = E.cleanName(a.name, 20);
          if (!a.pid || !name) return false;
          var isNew = !p;
          if (!p) p = s.players[a.pid] = { id: a.pid, joined: now, score: 0, right: 0, wrong: 0, step: 0, pv: 0, st: 'wait', lure: 0, alerts: [], an: 0 };
          p.name = name;
          p.av = E.AVATARS.indexOf(a.av) >= 0 ? a.av : E.AVATARS[rnd(E.AVATARS.length)];
          p.online = true; p.last = now; p.pv++;
          if (isNew && s.phase === 'play') enter(s, p);
          if (isNew) ev.push({ type: 'join', name: name });
          touched.push(p.id);
          return true;
        }
        case 'kick':
          if (!p) return false;
          delete s.players[a.pid];
          return true;
        case 'online':
          if (!p) return false;
          p.last = now;
          if (p.online === !!a.on) return false;
          p.online = !!a.on;
          return true;
        case 'start':
          if (s.phase !== 'lobby' || !list(s).length) return false;
          s.phase = 'play'; s.start = now; s.ends = now + s.cfg.minutes * 60000;
          list(s).forEach(function (pl) { enter(s, pl); touched.push(pl.id); });
          ev.push({ type: 'bstart' });
          return true;
        case 'tick': {
          if (s.phase !== 'play') return false;
          if (now >= s.ends) { finish(s, ev, touched); return true; }
          var moved = false;
          list(s).forEach(function (pl) {
            if (pl.st === 'wrong' && now >= (pl.until || 0)) { nextQ(s, pl); touched.push(pl.id); moved = true; }
          });
          return moved;
        }
        case 'addtime':
          if (s.phase !== 'play') return false;
          s.ends = Math.max(s.ends, now) + 60000;
          return true;
        case 'end':
          if (s.phase === 'end') return false;
          finish(s, ev, touched);
          return true;
        case 'restart': {
          s.pool = makePool(s.cfg.topicKeys);
          s.id = Math.random().toString(36).slice(2, 10);
          s.phase = 'lobby'; s.start = null; s.ends = null; s.frenzy = 0; s.feed = [];
          list(s).forEach(function (pl) {
            pl.score = 0; pl.right = 0; pl.wrong = 0; pl.lure = 0; pl.order = null; pl.q = null; pl.box = null; pl.res = null;
            pl.guess = null; pl.pass = null; pl.passOpts = null; pl.repass = null; pl.alerts = [];
            setSt(pl, 'wait'); touched.push(pl.id);
          });
          ev.push({ type: 'restart' });
          return true;
        }

        /* ---- ходы игрока ---- */
        case 'setpass': {
          if (!p || s.phase !== 'play') return false;
          var w = String(a.word || '');
          if (p.st === 'pass' && p.passOpts && p.passOpts.indexOf(w) >= 0) {
            if (a.step != null && Number(a.step) !== p.step) return false;
            p.pass = w; p.passOpts = null; touched.push(p.id);
            nextQ(s, p);
            return true;
          }
          if (p.repass && p.repass.indexOf(w) >= 0) { // смена пароля после взлома — в любой момент
            p.pass = w; p.repass = null; p.pv++; touched.push(p.id);
            return true;
          }
          return false;
        }
        case 'answer': {
          if (!mine('q')) return false;
          var o = a.opt | 0;
          if (o < 0 || o > 3) return false;
          var right = p.q.perm[o] === 0;
          if (right) {
            p.right++;
            if (s.game === 'fish') setSt(p, 'cast');
            else { p.box = { items: B.rollBox(s.game, p.score), pick: null }; setSt(p, 'chest'); }
            ev.push({ type: 'bright' });
          } else {
            p.wrong++;
            p.res = { k: 'wrong', opt: o };
            p.until = now + B.WRONG_MS;
            setSt(p, 'wrong');
          }
          return true;
        }
        case 'next':
          if (!p || s.phase !== 'play' || ['reveal', 'catch'].indexOf(p.st) < 0) return false; // после ошибки — только по таймеру
          if (a.step != null && Number(a.step) !== p.step) return false;
          touched.push(p.id);
          nextQ(s, p);
          return true;
        case 'pick': {
          if (!mine('chest')) return false;
          var i = a.i | 0;
          if (i < 0 || i > 2) return false;
          p.box.pick = i;
          var it = p.box.items[i];
          if (it.k === 'steal' || it.k === 'swap' || it.k === 'hack') {
            if (!others(s, p).length) { p.res = { k: 'alone', n: it.n, delta: 0 }; setSt(p, 'reveal'); return true; }
            setSt(p, 'target');
            return true;
          }
          applyBox(s, p, it, now, ev);
          return true;
        }
        case 'target': {
          if (!mine('target')) return false;
          var t = s.players[a.target], item = p.box.items[p.box.pick];
          if (!t || t.id === p.id) return false;
          if (item.k === 'steal') {
            var amt = Math.round(t.score * item.n / 100);
            addScore(t, -amt); addScore(p, amt);
            p.res = { k: 'steal', n: item.n, delta: amt, who: who(t) };
            if (amt > 0) {
              alert(t, p.name + ' крадёт у тебя ' + amt + ' золота!', -1);
              touched.push(t.id);
              feed(s, now, { k: 'steal', a: who(p), b: who(t), img: 'ninja', txt: 'кража ' + amt + ' золота' });
              ev.push({ type: 'bsteal' });
            }
            setSt(p, 'reveal');
          } else if (item.k === 'swap') {
            var mineScore = p.score;
            p.score = t.score; t.score = mineScore;
            p.res = { k: 'swap', delta: p.score - mineScore, who: who(t) };
            alert(t, p.name + ' меняется с тобой золотом! Теперь у тебя ' + t.score + '.', t.score >= mineScore ? 1 : -1);
            touched.push(t.id);
            feed(s, now, { k: 'swap', a: who(p), b: who(t), img: 'swap', txt: 'обмен золотом' });
            ev.push({ type: 'bswap' });
            setSt(p, 'reveal');
          } else if (item.k === 'hack') {
            var real = t.pass || passwords(s, 1)[0];
            p.guess = { id: t.id, opts: E.shuffle([real].concat(passwords(s, B.GUESS_CHOICES - 1, real))) };
            setSt(p, 'guess');
          }
          return true;
        }
        case 'guess': {
          if (!mine('guess')) return false;
          var tg = s.players[p.guess.id], word = String(a.word || '');
          if (p.guess.opts.indexOf(word) < 0) return false;
          if (!tg) { p.res = { k: 'alone', delta: 0 }; setSt(p, 'reveal'); return true; }
          if (word === tg.pass) {
            var pct = rint(10, 40), got = Math.round(tg.score * pct / 100);
            addScore(tg, -got); addScore(p, got);
            p.res = { k: 'hackok', n: pct, delta: got, who: who(tg), word: word };
            tg.repass = passwords(s, B.PASS_CHOICES, tg.pass);
            alert(tg, got > 0 ? p.name + ' взламывает тебя и крадёт ' + got + ' крипты! Смени пароль.' : p.name + ' узнаёт твой пароль! Смени его, пока не поздно.', -1);
            if (got > 0) {
              feed(s, now, { k: 'hack', a: who(p), b: who(tg), img: 'unlock', txt: 'взлом: ' + got + ' крипты' });
              ev.push({ type: 'bsteal' });
            }
          } else {
            p.res = { k: 'hackfail', delta: 0, who: who(tg), word: word };
            alert(tg, p.name + ' пытается тебя взломать, но не угадывает пароль.', 1);
            ev.push({ type: 'bfail' });
          }
          touched.push(tg.id);
          setSt(p, 'reveal');
          return true;
        }
        case 'cast': {
          if (!mine('cast')) return false;
          var f = B.rollFish(p.lure), res = { k: 'fish', id: f.id, delta: 0 };
          if (f.special === 'lure') {
            if (p.lure < B.LURE_MAX) p.lure++;
            res.lure = p.lure;
          } else if (f.special === 'frenzy') {
            s.frenzy = Math.max(s.frenzy || 0, now) + B.FRENZY_MS;
            feed(s, now, { k: 'frenzy', a: who(p), img: 'frenzy', txt: 'Клёв! 20 секунд все ловят вдвое больше' });
            ev.push({ type: 'bfrenzy' });
          } else {
            var kg = rint(f.min, f.max), x2 = now < (s.frenzy || 0);
            if (x2) kg *= 2;
            res.kg = kg; res.x2 = x2;
            addScore(p, kg);
            if (f.tier >= 4) {
              feed(s, now, { k: 'big', a: who(p), img: f.id, txt: f.name + ', ' + kg + ' кг' });
              ev.push({ type: 'bbig' });
            }
          }
          p.res = res;
          setSt(p, 'catch');
          return true;
        }
      }
      return false;
    })();
    if (ok) s.v++;
    return { ok: ok, events: ev, touched: touched };
  };
  function finish(s, ev, touched) {
    s.phase = 'end';
    list(s).forEach(function (pl) { pl.pv++; touched.push(pl.id); });
    ev.push({ type: 'end' });
  }

  B.left = function (s, now) { return s.phase === 'play' ? Math.max(0, s.ends - (now || Date.now())) : null; };

  /* Общая часть — для большого экрана и всех телефонов */
  B.view = function (s, now) {
    now = now || Date.now();
    var rk = B.ranking(s);
    return {
      kind: 'blooket', mode: 'blooket', game: s.game, v: s.v, id: s.id, code: s.code, phase: s.phase,
      title: s.cfg.title, subtitle: s.cfg.subtitle, cfg: { theme: s.cfg.theme, minutes: s.cfg.minutes },
      left: B.left(s, now), total: s.ends && s.start ? s.ends - s.start : s.cfg.minutes * 60000,
      frenzy: s.frenzy && now < s.frenzy ? s.frenzy - now : 0,
      players: rk.map(function (p) { return { id: p.id, name: p.name, av: p.av, score: p.score, on: !!p.online, place: p._place }; }),
      feed: s.feed.slice(-8)
    };
  };

  /* Личная часть — только для телефона этого игрока (верный ответ сюда не попадает, пока игрок не ответил) */
  B.me = function (s, pid, now) {
    var p = s.players[pid];
    if (!p) return null;
    now = now || Date.now();
    var rk = B.ranking(s);
    var out = {
      id: p.id, sid: s.id, jn: p.joined, pv: p.pv, step: p.step, st: p.st, score: p.score, place: p._place, of: rk.length,
      right: p.right, wrong: p.wrong, lure: p.lure, pass: p.pass || null, repass: p.repass || null,
      alerts: p.alerts || [], name: p.name, av: p.av
    };
    var q = p.q ? s.pool[p.q.i] : null;
    if (q && (p.st === 'q' || p.st === 'wrong')) {
      out.q = { text: q.text, topic: q.topic, opts: p.q.perm.map(function (i) { return q.opts[i]; }) };
      if (p.st === 'wrong') {
        out.q.correct = p.q.perm.indexOf(0); out.q.chosen = p.res ? p.res.opt : null;
        out.wait = Math.max(0, (p.until || now) - now); out.waitTotal = B.WRONG_MS;
      }
    }
    if (p.st === 'pass') out.passOpts = p.passOpts;
    if (p.st === 'reveal' && p.box && p.box.pick != null) {
      out.box = { pick: p.box.pick, items: p.box.items.map(function (it) { return B.label(s.game, it); }) };
    }
    if (p.st === 'target' && p.box) {
      var it = p.box.items[p.box.pick];
      out.ask = { k: it.k, n: it.n };
      out.targets = rk.filter(function (o) { return o.id !== p.id; }).map(function (o) { return { id: o.id, name: o.name, av: o.av, score: o.score }; });
    }
    if (p.st === 'guess' && p.guess) {
      var t = s.players[p.guess.id];
      out.guess = { name: t ? t.name : '—', av: t ? t.av : null, opts: p.guess.opts };
    }
    if (p.res && (p.st === 'reveal' || p.st === 'catch')) out.res = p.res;
    if (s.game === 'fish') out.frenzy = s.frenzy && now < s.frenzy ? s.frenzy - now : 0;
    return out;
  };

  /* Счёт с единицей: «120 золота», «35 кг» */
  B.fmt = function (game, n) {
    if (game === 'fish') return n + ' кг';
    return String(n);
  };

  FB.Blooket = B;
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
