/* © 2026 azaa29457-dot. Все права защищены. Копирование без разрешения автора запрещено (см. LICENSE). */
/* Alibaba — режим «Предатель»: викторина + игра в мафию. Каждый играет на своём телефоне.
   Роли: предатель (1 или 2), медик, шериф, мирные жители.
   Каждый день: ☀️ вопросы (у каждого поле 1–50, №1 — самый лёгкий, №50 — самый трудный)
              → 🌙 ночь (предатель выбивает, медик лечит, шериф проверяет, мирные отмечают, кого подозревают)
              → 🌅 утро (что случилось ночью, обсуждение) → 🗳️ голосование → итог голосования → следующий день.
   Мирные побеждают, когда выбыли все предатели. Предатели — когда их не меньше, чем остальных (один на один).
   Выбывшие становятся призраками: молчат, не голосуют и не отвечают на вопросы — только смотрят.
   Телефон получает только свою часть (T.me): свою роль, свои вопросы, свой ночной выбор. Общая часть (T.view) — для всех. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  var E = FB.Engine;
  var T = {};

  T.SIZE = 50;              // вопросов на поле у каждого
  T.SUBJECT = 'biology7';   // режим есть только в биологии
  T.PER_DAY = [3, 5, 7, 10]; // сколько вопросов можно открыть за день
  T.MIN_PLAYERS = 4;        // предатель, медик, шериф и хотя бы один мирный
  T.TWO_MIN = 7;            // двое предателей — только если игроков не меньше 7
  T.Q_MS = 30000;           // на каждый вопрос дня — 30 секунд общего времени
  T.NIGHT_MS = 40000;
  T.VOTE_MS = 60000;
  T.ADD_MS = 30000;
  T.CLUE_AT = 3;            // 3 верных ответа за день — улика
  T.WIN_BONUS = 300;        // каждому из победившей стороны

  T.ROLES = {
    traitor: { id: 'traitor', name: 'Предатель', many: 'Предатели', img: 'traitor', bad: true,
      about: 'Каждую ночь выбиваешь одного игрока. Днём веди себя как все, чтобы тебя не выгнали.' },
    medic: { id: 'medic', name: 'Медик', img: 'medic',
      about: 'Каждую ночь лечишь одного игрока. Если предатель нападёт именно на него, тот останется в игре. Одного и того же — не две ночи подряд.' },
    sheriff: { id: 'sheriff', name: 'Шериф', img: 'sheriff',
      about: 'Каждую ночь проверяешь одного игрока. Угадал предателя — он выбывает. Нет — утром все узнают, что он не предатель.' },
    civ: { id: 'civ', name: 'Мирный житель', many: 'Мирные жители', img: 'civ',
      about: 'Отвечай на вопросы, собирай улики и вычисли предателя на голосовании.' }
  };
  T.ORDER = ['traitor', 'medic', 'sheriff', 'civ'];

  T.value = function (n) { return n * 10; };   // монет за верный ответ на вопрос №n
  T.penalty = function (n) { return n * 5; };  // столько снимают за ошибку

  function rnd(n) { return Math.floor(E.random() * n); }
  function rid() { return Math.random().toString(36).slice(2, 10); }

  /* ---------- 50 вопросов: от лёгких к трудным ---------- */
  function sortPool(list) {
    return list.map(function (x) {
      return { text: x.text, d: x.d, topic: x.topic, opts: x.opts.slice(), w: x.text.length + x.opts.join('').length };
    }).sort(function (a, b) { return a.d - b.d || a.w - b.w; }).map(function (x) {
      return { text: x.text, d: x.d, topic: x.topic, opts: x.opts }; // верный ответ — opts[0]
    });
  }
  /* Сначала — вопросы выбранных тем; если их меньше 50, добавляются из остальных тем того же предмета */
  T.makePool = function (topicKeys) {
    var keys = (topicKeys || []).filter(function (k) { return FB.findTopic(k); });
    var first = keys.length ? FB.findTopic(keys[0]) : null;
    var have = Math.min(T.SIZE, E.availableCount(keys));
    var picked = have ? E.pickQuestions(keys, have) : [];
    if (picked.length < T.SIZE && first) {
      var rest = first.subject.topics.map(function (t) { return FB.topicKey(first.subject.id, t.id); })
        .filter(function (k) { return keys.indexOf(k) < 0; });
      var more = Math.min(T.SIZE - picked.length, E.availableCount(rest));
      if (more > 0) picked = picked.concat(E.pickQuestions(rest, more));
    }
    return sortPool(picked);
  };
  /* У каждого игрока за номером — свой вопрос той же сложности (подсказать соседу не выйдет) */
  function makeMap(pool) {
    var map = [], st = 0;
    for (var i = 1; i <= pool.length; i++) {
      if (i === pool.length || pool[i].d !== pool[st].d) {
        var idx = [];
        for (var j = st; j < i; j++) idx.push(j);
        map = map.concat(E.shuffle(idx));
        st = i;
      }
    }
    return map;
  }

  /* ---------- Создание ---------- */
  T.create = function (cfg, now) {
    now = now || Date.now();
    var perDay = T.PER_DAY.indexOf(cfg.perDay | 0) >= 0 ? cfg.perDay | 0 : 5;
    return {
      kind: 'traitor', mode: 'traitor', id: rid(), v: 1, created: now, code: cfg.code || null,
      cfg: {
        topicKeys: (cfg.topicKeys || []).slice(), perDay: perDay, traitors: (cfg.traitors | 0) === 2 ? 2 : 1,
        title: cfg.title || 'Предатель', subtitle: cfg.subtitle || '', theme: cfg.theme || 'violet', winVideo: cfg.winVideo || ''
      },
      pool: T.makePool(cfg.topicKeys), phase: 'lobby', day: 0, until: null, total: null,
      players: {}, attack: null, news: [], verdict: null, winner: null, log: [], sus: {}, nTraitors: 0
    };
  };

  /* ---------- Вспомогательные ---------- */
  function list(s) {
    return Object.keys(s.players).map(function (k) { return s.players[k]; })
      .sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); });
  }
  function inGame(p) { return !!p.role; }
  function alive(s) { return list(s).filter(function (p) { return p.role && p.alive; }); }
  function isBad(p) { return p.role === 'traitor'; }
  function who(p) { return { id: p.id, name: p.name, av: p.av }; }
  function setSt(p, st) { p.st = st; p.step++; p.pv++; }
  function alert(p, text, mood) {
    p.an = (p.an || 0) + 1;
    p.alerts = (p.alerts || []).concat([{ n: p.an, txt: text, mood: mood }]).slice(-3);
    p.pv++;
  }
  function freshPlayer(p) {
    p.coins = 0; p.right = 0; p.wrong = 0; p.alerts = []; p.role = null; p.alive = true; p.out = null;
    p.map = null; p.board = null; p.q = null; p.res = null; p.dayN = 0; p.dayOk = 0; p.clueDay = 0; p.clues = [];
    p.pick = null; p.vote = null; p.lastHeal = null; p.checked = []; p.bonus = 0;
  }
  function giveRole(s, p, role) {
    p.role = role; p.alive = true; p.out = null;
    p.map = makeMap(s.pool); p.board = s.pool.map(function () { return 0; });
  }
  T.ranking = function (s) {
    return list(s).sort(function (a, b) { return b.coins - a.coins || (a.joined || 0) - (b.joined || 0); })
      .map(function (p, i, arr) {
        p._place = i > 0 && arr[i - 1].coins === p.coins ? arr[i - 1]._place : i + 1;
        return p;
      });
  };
  /* Что игрок видит на телефоне в этой фазе */
  function phaseSt(s, p) {
    if (s.phase === 'lobby') return 'wait';
    if (s.phase === 'end') return 'end';
    if (!p.alive && (s.phase === 'day' || s.phase === 'night' || s.phase === 'vote')) return 'ghost';
    if (s.phase === 'day') return 'board';
    return s.phase; // roles, night, morning, vote, verdict
  }
  function allSt(s, touched) {
    list(s).forEach(function (p) {
      if (s.phase === 'day') { p.q = null; p.res = null; }
      setSt(p, phaseSt(s, p));
      touched.push(p.id);
    });
  }
  function kill(s, p, how) {
    p.alive = false;
    p.out = { day: s.day, how: how, role: p.role };
    s.log.push({ day: s.day, how: how, p: who(p), role: p.role });
    p.pick = null; p.vote = null;
    alert(p, how === 'vote' ? 'Тебя выгнали голосованием. Теперь ты призрак: молчи и смотри.' :
      (how === 'shot' ? 'Шериф вычислил тебя! Теперь ты призрак.' : 'Ночью предатель выбил тебя из игры. Теперь ты призрак: молчи и смотри.'), -1);
  }

  /* Кого игрок может выбрать ночью (или за кого голосовать) */
  T.nightMode = function (p) {
    return { traitor: 'kill', medic: 'heal', sheriff: 'check', civ: 'suspect' }[p.role] || 'suspect';
  };
  T.canPick = function (s, p, t) {
    if (!p || !t || !p.alive || !t.alive || !t.role) return false;
    if (s.phase === 'vote') return t.id !== p.id;
    if (s.phase !== 'night') return false;
    switch (p.role) {
      case 'traitor': return !isBad(t);
      case 'medic': return t.id !== p.lastHeal; // себя — можно, одного и того же — не две ночи подряд
      case 'sheriff': return t.id !== p.id && (p.checked || []).indexOf(t.id) < 0;
      default: return t.id !== p.id;
    }
  };

  T.allDone = function (s) {
    var a = alive(s);
    if (s.phase === 'day') return a.every(function (p) { return p.dayN >= s.cfg.perDay && p.st !== 'q'; });
    if (s.phase === 'night') return a.every(function (p) { return !!p.pick; });
    if (s.phase === 'vote') return a.every(function (p) { return !!p.vote; });
    return false;
  };

  /* ---------- Смена фаз ---------- */
  function timed(s, now, ms) { s.total = ms; s.until = now + ms; }
  function toDay(s, now, touched) {
    s.day++; s.phase = 'day'; s.news = []; s.verdict = null; s.attack = null;
    timed(s, now, s.cfg.perDay * T.Q_MS);
    list(s).forEach(function (p) { p.dayN = 0; p.dayOk = 0; p.pick = null; p.vote = null; });
    allSt(s, touched);
  }
  function toNight(s, now, touched) {
    s.phase = 'night'; s.attack = null;
    timed(s, now, T.NIGHT_MS);
    list(s).forEach(function (p) { p.pick = null; });
    allSt(s, touched);
  }
  function resolveNight(s, now, touched, ev) {
    var news = [];
    var sheriff = alive(s).filter(function (p) { return p.role === 'sheriff'; })[0];
    var medic = alive(s).filter(function (p) { return p.role === 'medic'; })[0];
    // мирные отмечали, кого подозревают — пригодится в итогах
    alive(s).forEach(function (p) {
      if ((p.role === 'civ') && p.pick && s.players[p.pick]) s.sus[p.pick] = (s.sus[p.pick] || 0) + 1;
    });
    // 1. Шериф стреляет первым
    if (sheriff && sheriff.pick && T.canPick(s, sheriff, s.players[sheriff.pick])) {
      var t = s.players[sheriff.pick];
      sheriff.checked.push(t.id);
      if (isBad(t)) { kill(s, t, 'shot'); news.push({ k: 'shot', p: who(t), role: t.role }); ev.push({ type: 'tshot' }); }
      else news.push({ k: 'clean', p: who(t) });
    }
    // 2. Нападение предателя (если кто-то из предателей ещё в игре)
    var bad = alive(s).filter(isBad);
    if (bad.length) {
      var victim = s.attack ? s.players[s.attack] : null;
      if (!victim || !victim.alive || isBad(victim)) {
        var opts = alive(s).filter(function (p) { return !isBad(p); });
        victim = opts.length ? opts[rnd(opts.length)] : null;
      }
      if (victim) {
        if (medic && medic.pick === victim.id) {
          news.unshift({ k: 'saved', p: who(victim) });
          s.log.push({ day: s.day, how: 'saved', p: who(victim) });
          alert(victim, 'Ночью на тебя напал предатель, но медик тебя спас!', 1);
          ev.push({ type: 'tsaved' });
        } else {
          kill(s, victim, 'night');
          news.unshift({ k: 'out', p: who(victim), role: victim.role });
          ev.push({ type: 'tout' });
        }
      }
    }
    if (medic) medic.lastHeal = medic.pick || null;
    if (!news.length) news.push({ k: 'quiet' });
    s.news = news;
    s.phase = 'morning'; s.until = null; s.total = null;
    allSt(s, touched);
    checkWin(s);
  }
  function toVote(s, now, touched) {
    s.phase = 'vote';
    timed(s, now, T.VOTE_MS);
    list(s).forEach(function (p) { p.vote = null; });
    allSt(s, touched);
  }
  function resolveVote(s, now, touched, ev) {
    var votes = {}, skip = [], voters = alive(s);
    voters.forEach(function (p) {
      if (!p.vote) return;
      if (p.vote === 'skip') skip.push(p.id);
      else (votes[p.vote] = votes[p.vote] || []).push(p.id);
    });
    var best = null, bestN = 0, tie = false;
    Object.keys(votes).forEach(function (k) {
      var n = votes[k].length;
      if (n > bestN) { best = k; bestN = n; tie = false; }
      else if (n === bestN) tie = true;
    });
    var out = best && !tie && bestN > skip.length ? s.players[best] : null;
    if (out && out.alive) { kill(s, out, 'vote'); ev.push({ type: isBad(out) ? 'tcaught' : 'tout' }); }
    else out = null;
    s.verdict = {
      votes: votes, skip: skip, out: out ? who(out) : null, role: out ? out.role : null,
      why: out ? 'out' : (bestN === 0 && !skip.length ? 'none' : (skip.length >= bestN ? 'skip' : 'tie')), voters: voters.length
    };
    s.phase = 'verdict'; s.until = null; s.total = null;
    allSt(s, touched);
    checkWin(s);
  }
  /* Победа определяется сразу, но на экране сначала видно, что случилось, — итоги по кнопке «Итоги игры» */
  function checkWin(s) {
    var a = alive(s), bad = a.filter(isBad).length, good = a.length - bad;
    if (!s.nTraitors) return;
    if (bad === 0) s.winner = 'town';
    else if (good <= bad) s.winner = 'traitors';
  }
  function finish(s, touched, ev) {
    if (s.winner) {
      list(s).forEach(function (p) {
        if (!p.role) return;
        if ((s.winner === 'traitors') === isBad(p)) { p.bonus = T.WIN_BONUS; p.coins += T.WIN_BONUS; }
      });
    }
    s.phase = 'end'; s.until = null; s.total = null;
    allSt(s, touched);
    ev.push({ type: 'end' });
  }

  /* Следующая фаза (кнопка ведущего или конец времени) */
  function advance(s, now, touched, ev) {
    if (s.phase === 'lobby' || s.phase === 'end') return false;
    if (s.winner) { finish(s, touched, ev); return true; }
    switch (s.phase) {
      case 'roles': case 'verdict': toDay(s, now, touched); ev.push({ type: 'tday' }); return true;
      case 'day': toNight(s, now, touched); ev.push({ type: 'tnight' }); return true;
      case 'night': resolveNight(s, now, touched, ev); ev.push({ type: 'tmorning' }); return true;
      case 'morning': toVote(s, now, touched); ev.push({ type: 'tvote' }); return true;
      case 'vote': resolveVote(s, now, touched, ev); ev.push({ type: 'tverdict' }); return true;
    }
    return false;
  }

  /* ---------- Главная функция ---------- */
  T.act = function (s, a, now) {
    now = now || Date.now();
    var ev = [], touched = [];
    var ok = (function () {
      var p = a.pid ? s.players[a.pid] : null;
      function step() { return a.step == null || Number(a.step) === p.step; }
      switch (a.type) {
        case 'join': {
          var name = E.cleanName(a.name, 20);
          if (!a.pid || !name) return false;
          var isNew = !p;
          if (!p) { p = s.players[a.pid] = { id: a.pid, joined: now, step: 0, pv: 0, an: 0 }; freshPlayer(p); }
          p.name = name;
          p.av = E.AVATARS.indexOf(a.av) >= 0 ? a.av : E.AVATARS[rnd(E.AVATARS.length)];
          p.online = true; p.last = now; p.pv++;
          if (isNew) {
            // опоздавший становится мирным жителем
            if (s.phase !== 'lobby' && s.phase !== 'end') giveRole(s, p, 'civ');
            p.st = phaseSt(s, p);
            ev.push({ type: 'join', name: name });
          }
          touched.push(p.id);
          return true;
        }
        case 'kick':
          if (!p) return false;
          delete s.players[a.pid];
          if (s.attack === a.pid) s.attack = null;
          if (s.phase !== 'lobby' && s.phase !== 'end') checkWin(s);
          return true;
        case 'online':
          if (!p) return false;
          p.last = now;
          if (p.online === !!a.on) return false;
          p.online = !!a.on;
          return true;
        case 'start': {
          if (s.phase !== 'lobby') return false;
          var ps = list(s);
          if (ps.length < T.MIN_PLAYERS) return false;
          var k = s.cfg.traitors === 2 && ps.length >= T.TWO_MIN ? 2 : 1;
          s.nTraitors = k;
          E.shuffle(ps).forEach(function (pl, i) {
            freshPlayer(pl);
            giveRole(s, pl, i < k ? 'traitor' : (i === k ? 'medic' : (i === k + 1 ? 'sheriff' : 'civ')));
          });
          s.phase = 'roles'; s.day = 0; s.winner = null; s.log = []; s.sus = {};
          allSt(s, touched);
          ev.push({ type: 'tstart' });
          return true;
        }
        case 'next':
          return advance(s, now, touched, ev);
        case 'tick':
          if (['day', 'night', 'vote'].indexOf(s.phase) < 0 || s.winner) return false;
          if (now < s.until && !T.allDone(s)) return false;
          return advance(s, now, touched, ev);
        case 'addtime':
          if (['day', 'night', 'vote'].indexOf(s.phase) < 0) return false;
          s.until = Math.max(s.until, now) + T.ADD_MS;
          s.total = (s.total || 0) + T.ADD_MS;
          return true;
        case 'end':
          if (s.phase === 'end') return false;
          if (s.phase === 'lobby') return false;
          finish(s, touched, ev);
          return true;
        case 'restart':
          s.pool = T.makePool(s.cfg.topicKeys);
          s.id = rid();
          s.phase = 'lobby'; s.day = 0; s.until = null; s.total = null; s.attack = null; s.news = []; s.verdict = null;
          s.winner = null; s.log = []; s.sus = {}; s.nTraitors = 0;
          list(s).forEach(function (pl) { freshPlayer(pl); setSt(pl, 'wait'); touched.push(pl.id); });
          ev.push({ type: 'restart' });
          return true;

        /* ---- ходы игрока ---- */
        case 'open': {
          if (!p || !inGame(p) || !p.alive || s.phase !== 'day' || p.st !== 'board' || !step()) return false;
          var n = a.n | 0;
          if (n < 1 || n > s.pool.length || p.board[n - 1] !== 0 || p.dayN >= s.cfg.perDay) return false;
          p.q = { n: n, i: p.map[n - 1], perm: E.shuffle([0, 1, 2, 3]) };
          setSt(p, 'q');
          touched.push(p.id);
          return true;
        }
        case 'answer': {
          if (!p || !p.alive || s.phase !== 'day' || p.st !== 'q' || !p.q || !step()) return false;
          var o = a.opt | 0;
          if (o < 0 || o > 3) return false;
          var qn = p.q.n, right = p.q.perm[o] === 0, delta;
          if (right) { delta = T.value(qn); p.right++; p.dayOk++; }
          else { delta = p.coins > 0 ? -Math.min(p.coins, T.penalty(qn)) : 0; p.wrong++; }
          p.coins += delta;
          p.board[qn - 1] = right ? 1 : -1;
          p.dayN++;
          p.res = { n: qn, ok: right, delta: delta, i: p.q.i, perm: p.q.perm, chosen: o, clue: null };
          if (right && p.alive && p.dayOk >= T.CLUE_AT && p.clueDay !== s.day) {
            var c = makeClue(s, p);
            p.clueDay = s.day;
            if (c) { p.clues.push(c); p.res.clue = c; ev.push({ type: 'tclue' }); }
          }
          p.q = null;
          setSt(p, 'res');
          touched.push(p.id);
          return true;
        }
        case 'back':
          if (!p || s.phase !== 'day' || p.st !== 'res' || !step()) return false;
          setSt(p, 'board');
          touched.push(p.id);
          return true;
        case 'choose': {
          if (!p || s.phase !== 'night' || !p.alive) return false;
          var t = s.players[a.target];
          if (!T.canPick(s, p, t) || p.pick === t.id) return false;
          p.pick = t.id; p.pv++;
          touched.push(p.id);
          if (isBad(p)) {
            s.attack = t.id; // у предателей одна цель на двоих: последняя выбранная
            alive(s).filter(isBad).forEach(function (m) { if (m !== p) { m.pick = t.id; m.pv++; touched.push(m.id); } });
          }
          return true;
        }
        case 'vote': {
          if (!p || s.phase !== 'vote' || !p.alive) return false;
          var target = String(a.target || '');
          if (target !== 'skip' && !T.canPick(s, p, s.players[target])) return false;
          if (p.vote === target) return false;
          p.vote = target; p.pv++;
          touched.push(p.id);
          return true;
        }
      }
      return false;
    })();
    if (ok) s.v++;
    return { ok: ok, events: ev, touched: touched };
  };

  /* Улика: мирным — кто точно не предатель; предателям — кто обычный мирный (не медик и не шериф) */
  function makeClue(s, p) {
    var known = p.clues.map(function (c) { return c.id; });
    var pool = alive(s).filter(function (o) {
      if (o.id === p.id || known.indexOf(o.id) >= 0) return false;
      return isBad(p) ? o.role === 'civ' : !isBad(o);
    });
    if (!pool.length) return null;
    var o = pool[rnd(pool.length)];
    return { id: o.id, name: o.name, av: o.av, k: isBad(p) ? 'civ' : 'good', day: s.day };
  }

  /* ---------- Что видят все: большой экран и телефоны ---------- */
  T.view = function (s, now) {
    now = now || Date.now();
    var rk = T.ranking(s), place = {};
    rk.forEach(function (p) { place[p.id] = p._place; });
    var end = s.phase === 'end';
    var a = alive(s);
    return {
      kind: 'traitor', mode: 'traitor', v: s.v, id: s.id, code: s.code, phase: s.phase, day: s.day,
      title: s.cfg.title, subtitle: s.cfg.subtitle,
      cfg: { theme: s.cfg.theme, perDay: s.cfg.perDay, traitors: s.nTraitors || s.cfg.traitors },
      left: s.until ? Math.max(0, s.until - now) : null, total: s.total,
      players: list(s).map(function (p) {
        var done = s.phase === 'night' ? !!p.pick : (s.phase === 'vote' ? !!p.vote : false);
        return {
          id: p.id, name: p.name, av: p.av, on: !!p.online, coins: p.coins, place: place[p.id], inGame: !!p.role,
          alive: !!p.alive, dayN: p.dayN || 0, done: p.alive && done,
          out: p.out ? { day: p.out.day, how: p.out.how, role: p.out.role } : null,
          role: end ? p.role : null, bonus: end ? p.bonus : 0, right: end ? p.right : null
        };
      }),
      need: a.length, doneN: a.filter(function (p) { return s.phase === 'night' ? !!p.pick : (s.phase === 'vote' ? !!p.vote : false); }).length,
      counts: { traitors: s.nTraitors, total: list(s).filter(inGame).length },
      news: s.phase === 'morning' || s.phase === 'vote' || s.phase === 'verdict' ? s.news : [],
      verdict: s.phase === 'verdict' ? s.verdict : null,
      winner: s.winner,
      log: end ? s.log : null,
      sus: end ? topSus(s) : null
    };
  };
  function topSus(s) {
    var best = null, n = 0;
    Object.keys(s.sus).forEach(function (k) { if (s.sus[k] > n && s.players[k]) { n = s.sus[k]; best = k; } });
    return best ? { p: who(s.players[best]), n: n, role: s.players[best].role } : null;
  }

  /* ---------- Личная часть — только для телефона этого игрока ---------- */
  T.me = function (s, pid, now) {
    var p = s.players[pid];
    if (!p) return null;
    var rk = T.ranking(s);
    var out = {
      id: p.id, sid: s.id, jn: p.joined, pv: p.pv, step: p.step, st: p.st, ph: s.phase, day: s.day,
      name: p.name, av: p.av, coins: p.coins, right: p.right, wrong: p.wrong, place: p._place, of: rk.length,
      role: p.role, alive: !!p.alive, out: p.out, alerts: p.alerts || [], bonus: p.bonus || 0,
      perDay: s.cfg.perDay, dayN: p.dayN || 0, dayOk: p.dayOk || 0, clueAt: T.CLUE_AT, clueDay: p.clueDay === s.day,
      clues: (p.clues || []).map(function (c) { return { name: c.name, av: c.av, k: c.k, day: c.day }; }),
      winner: s.winner
    };
    if (p.board) { out.board = p.board; out.d = s.pool.map(function (q) { return q.d; }); }
    if (isBad(p)) out.mates = list(s).filter(function (o) { return o !== p && isBad(o); }).map(function (o) { return { name: o.name, av: o.av, alive: o.alive }; });
    if (p.st === 'q' && p.q) {
      var q = s.pool[p.q.i];
      out.q = { n: p.q.n, value: T.value(p.q.n), pen: T.penalty(p.q.n), text: q.text, topic: q.topic, d: q.d,
        opts: p.q.perm.map(function (i) { return q.opts[i]; }) };
    }
    if (p.st === 'res' && p.res) {
      var rq = s.pool[p.res.i];
      out.res = { n: p.res.n, ok: p.res.ok, delta: p.res.delta, text: rq.text, opts: p.res.perm.map(function (i) { return rq.opts[i]; }),
        correct: p.res.perm.indexOf(0), chosen: p.res.chosen, clue: p.res.clue ? { name: p.res.clue.name, av: p.res.clue.av, k: p.res.clue.k } : null };
    }
    if ((s.phase === 'night' || s.phase === 'vote') && p.alive) {
      out.pick = s.phase === 'night' ? p.pick : p.vote;
      out.mode = s.phase === 'vote' ? 'vote' : T.nightMode(p);
      out.targets = alive(s).filter(function (o) { return s.phase === 'vote' ? o.id !== p.id : o.id !== p.id || p.role === 'medic'; }).map(function (o) {
        return { id: o.id, name: o.name, av: o.av, ok: T.canPick(s, p, o), mate: isBad(p) && isBad(o), me: o.id === p.id };
      });
      if (p.role === 'sheriff') out.checked = (p.checked || []).length;
    }
    if (s.phase === 'morning' || s.phase === 'vote' || s.phase === 'verdict') out.news = s.news;
    if (s.phase === 'verdict') out.verdict = s.verdict;
    if (s.phase === 'end') out.won = !!s.winner && (s.winner === 'traitors') === isBad(p);
    return out;
  };

  FB.Traitor = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
