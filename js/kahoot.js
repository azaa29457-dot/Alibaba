/* Alibaba — режим «Телефоны: каждый за себя» (как в Kahoot).
   Все игроки отвечают одновременно на своих телефонах, очки зависят от скорости:
   очки = округление( (1 − (время ответа / таймер) / 2) × 1000 ), ответ быстрее 0,5 с — сразу 1000. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  var E = FB.Engine;
  var K = {};
  K.MAX = 1000;
  K.GET_READY = 3000; // «Приготовьтесь» перед каждым вопросом, мс
  K.AUTO_NEXT = 3000; // через сколько мс результаты и таблица лидеров листаются сами

  K.points = function (ms, timerSec) {
    if (ms < 500) return K.MAX;
    var T = timerSec * 1000;
    var f = 1 - (Math.min(ms, T) / T) / 2;
    return Math.round(f * K.MAX);
  };

  K.create = function (cfg, now) {
    now = now || Date.now();
    var qs = E.pickQuestions(cfg.topicKeys || [], Math.max(1, cfg.count | 0 || 20)).map(function (x) {
      var order = E.shuffle([0, 1, 2, 3]);
      return { text: x.text, d: x.d, topic: x.topic, opts: order.map(function (o) { return x.opts[o]; }), correct: order.indexOf(0) };
    });
    var timer = cfg.timer | 0;
    if (timer < 5) timer = 20;
    return {
      kind: 'kahoot', mode: 'kahoot', id: Math.random().toString(36).slice(2, 10), v: 1, created: now,
      code: cfg.code || null,
      cfg: {
        topicKeys: (cfg.topicKeys || []).slice(), count: qs.length, timer: timer,
        title: cfg.title || 'Викторина', subtitle: cfg.subtitle || '', theme: cfg.theme || 'violet', winVideo: cfg.winVideo || ''
      },
      qs: qs, qi: -1, phase: 'lobby', players: {}, cur: null, until: null
    };
  };

  function list(s) { return Object.keys(s.players).map(function (k) { return s.players[k]; }); }
  K.ranking = function (s) {
    return list(s).sort(function (a, b) { return b.score - a.score || (a.joined || 0) - (b.joined || 0); })
      .map(function (p, i, arr) {
        var place = i + 1;
        if (i > 0 && arr[i - 1].score === p.score) place = arr[i - 1]._place;
        p._place = place;
        return p;
      });
  };
  function online(s) { return list(s).filter(function (p) { return p.online; }); }

  function openQuestion(s, now, ev) {
    s.phase = 'q';
    s.cur.start = now;
    s.cur.deadline = now + s.cfg.timer * 1000;
    ev.push({ type: 'kq' });
  }
  function close(s, now, ev) {
    var q = s.qs[s.qi], c = s.cur;
    var before = {};
    K.ranking(s).forEach(function (p) { before[p.id] = p._place; });
    list(s).forEach(function (p) {
      var a = c.ans[p.id];
      var ok = !!a && a.o === q.correct;
      var pts = ok ? K.points(a.t, s.cfg.timer) : 0;
      p.streak = ok ? (p.streak || 0) + 1 : 0;
      p.score += pts;
      p.lastRes = { qi: s.qi, opt: a ? a.o : null, ok: ok, pts: pts, t: a ? a.t : null };
    });
    K.ranking(s).forEach(function (p) { p.lastRes.prev = before[p.id] || null; p.lastRes.place = p._place; });
    s.phase = 'res';
    s.cur.deadline = null;
    s.until = now + K.AUTO_NEXT;
    ev.push({ type: 'kres' });
  }

  K.act = function (s, a, now) {
    now = now || Date.now();
    var ev = [];
    var ok = (function () {
      switch (a.type) {
        case 'join': {
          var name = E.cleanName(a.name, 20);
          if (!a.pid || !name) return false;
          var p = s.players[a.pid], isNew = !p;
          if (!p) p = s.players[a.pid] = { id: a.pid, joined: now, score: 0, streak: 0, lastRes: null };
          p.name = name;
          p.av = E.AVATARS.indexOf(a.av) >= 0 ? a.av : E.AVATARS[Math.floor(Math.random() * E.AVATARS.length)];
          p.team = 0; p.online = true; p.last = now;
          if (isNew) ev.push({ type: 'join', name: name });
          return true;
        }
        case 'kick':
          if (!s.players[a.pid]) return false;
          delete s.players[a.pid];
          if (s.cur && s.cur.ans) delete s.cur.ans[a.pid];
          maybeClose(s, now, ev);
          return true;
        case 'online': {
          var po = s.players[a.pid];
          if (!po) return false;
          po.last = now;
          if (po.online === !!a.on) return false;
          po.online = !!a.on;
          return true;
        }
        case 'start':
          if (s.phase !== 'lobby') return false;
          return nextQuestion(s, now, ev);
        case 'tick':
          if (s.phase === 'get' && now >= s.until) { openQuestion(s, now, ev); return true; }
          if (s.phase === 'q' && now >= s.cur.deadline) { close(s, now, ev); return true; }
          if ((s.phase === 'res' || s.phase === 'board') && s.until && now >= s.until) return goNext(s, now, ev);
          return false;
        case 'answer': {
          if (s.phase !== 'q') return false;
          var pl = s.players[a.pid];
          var o = a.opt | 0;
          if (!pl || o < 0 || o > 3 || s.cur.ans[a.pid]) return false; // ответ меняется нельзя, как в Kahoot
          s.cur.ans[a.pid] = { o: o, t: Math.max(0, now - s.cur.start) };
          ev.push({ type: 'kanswer' });
          maybeClose(s, now, ev);
          return true;
        }
        case 'close':
          if (s.phase !== 'q') return false;
          close(s, now, ev);
          return true;
        case 'next':
          return goNext(s, now, ev);
        case 'end':
          if (s.phase === 'end') return false;
          s.phase = 'end'; s.cur = null; ev.push({ type: 'end' });
          return true;
        case 'restart': {
          var fresh = K.create({ topicKeys: s.cfg.topicKeys, count: s.cfg.count, timer: s.cfg.timer, title: s.cfg.title, subtitle: s.cfg.subtitle, theme: s.cfg.theme, winVideo: s.cfg.winVideo, code: s.code }, now);
          s.qs = fresh.qs; s.qi = -1; s.phase = 'lobby'; s.cur = null; s.id = fresh.id;
          list(s).forEach(function (p) { p.score = 0; p.streak = 0; p.lastRes = null; });
          ev.push({ type: 'restart' });
          return true;
        }
      }
      return false;
    })();
    if (ok) s.v++;
    return { ok: ok, events: ev };
  };
  function nextQuestion(s, now, ev) {
    if (s.qi >= s.qs.length - 1) { s.phase = 'end'; s.cur = null; ev.push({ type: 'end' }); return true; }
    s.qi++;
    s.phase = 'get';
    s.until = now + K.GET_READY;
    s.cur = { qi: s.qi, ans: {}, start: null, deadline: null };
    ev.push({ type: 'kget' });
    return true;
  }
  // Вопрос заканчивается, только когда ответили ВСЕ игроки, или по таймеру, или когда ведущий нажал «Завершить вопрос»
  function goNext(s, now, ev) {
    if (s.phase === 'res') {
      if (s.qi >= s.qs.length - 1) { s.phase = 'end'; s.cur = null; s.until = null; ev.push({ type: 'end' }); return true; }
      s.phase = 'board'; s.until = now + K.AUTO_NEXT; ev.push({ type: 'kboard' }); return true;
    }
    if (s.phase === 'board') return nextQuestion(s, now, ev);
    if (s.phase === 'get') { openQuestion(s, now, ev); return true; }
    return false;
  }
  function maybeClose(s, now, ev) {
    if (s.phase !== 'q') return;
    var all = list(s);
    if (all.length && all.every(function (p) { return s.cur.ans[p.id]; })) close(s, now, ev);
  }

  K.left = function (s) { return Math.max(0, s.qs.length - Math.max(0, s.qi + (s.phase === 'lobby' ? 0 : 1))); };

  K.view = function (s, now) {
    now = now || Date.now();
    var rk = K.ranking(s);
    var q = s.qi >= 0 ? s.qs[s.qi] : null;
    var showQ = q && (s.phase === 'get' || s.phase === 'q' || s.phase === 'res');
    var counts = null;
    if (q && s.phase === 'res') {
      counts = [0, 0, 0, 0];
      Object.keys(s.cur.ans).forEach(function (k) { counts[s.cur.ans[k].o]++; });
    }
    return {
      kind: 'kahoot', mode: 'kahoot', v: s.v, id: s.id, code: s.code, phase: s.phase,
      title: s.cfg.title, subtitle: s.cfg.subtitle, cfg: { theme: s.cfg.theme, timer: s.cfg.timer },
      qi: s.qi, total: s.qs.length,
      auto: (s.phase === 'res' || s.phase === 'board') && s.until ? Math.max(0, s.until - now) : null,
      q: showQ ? {
        text: q.text, d: q.d, topic: q.topic,
        opts: s.phase === 'get' ? null : q.opts,
        correct: s.phase === 'res' ? q.correct : null,
        counts: counts,
        answered: s.cur ? Object.keys(s.cur.ans).length : 0,
        need: list(s).length,
        remain: s.phase === 'q' ? Math.max(0, s.cur.deadline - now) : (s.phase === 'get' ? Math.max(0, s.until - now) : null),
        total: s.phase === 'get' ? K.GET_READY : s.cfg.timer * 1000
      } : null,
      players: rk.map(function (p) {
        var lr = p.lastRes && p.lastRes.qi === s.qi && (s.phase === 'res' || s.phase === 'board' || s.phase === 'end') ? p.lastRes : null;
        return {
          id: p.id, name: p.name, av: p.av, score: p.score, on: !!p.online, place: p._place, streak: p.streak || 0,
          answered: !!(s.cur && s.cur.ans && s.cur.ans[p.id]),
          last: lr ? { ok: lr.ok, pts: lr.pts, opt: lr.opt, prev: lr.prev, place: lr.place, t: lr.t } : null
        };
      })
    };
  };

  FB.Kahoot = K;
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
})(typeof window !== 'undefined' ? window : globalThis);
