/* Alibaba — игровая логика. Без DOM, чтобы её можно было проверять автотестами. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  var E = {};

  E.POINTS = { 1: 10, 2: 15, 3: 20 };
  E.TEAM_COLORS = ['#FF3D68', '#2FB8FF', '#8BE04E', '#FFC23D'];
  E.TEAM_NAMES = ['Ньютоны', 'Кванты', 'Атомы', 'Протоны', 'Галилейцы', 'Паскали', 'Джоули', 'Молекулы', 'Ракеты', 'Магниты', 'Импульсы', 'Электроны'];
  /* Аватарки-животные (картинки в img/av) */
  E.AVATARS = ['dragon', 'lion', 'tiger', 'giraffe', 'fox', 'panda', 'monkey', 'unicorn', 'frog', 'penguin', 'koala', 'cat',
    'dog', 'rabbit', 'bear', 'elephant', 'owl', 'shark', 'octopus', 'turtle', 'hamster', 'zebra', 'wolf', 'dino',
    'chick', 'pig', 'cow', 'horse', 'butterfly', 'bee', 'ladybug', 'crab', 'whale', 'dolphin', 'flamingo', 'peacock'];
  E.AVATAR_NAMES = { dragon: 'Дракон', lion: 'Лев', tiger: 'Тигр', giraffe: 'Жираф', fox: 'Лиса', panda: 'Панда', monkey: 'Обезьяна',
    unicorn: 'Единорог', frog: 'Лягушка', penguin: 'Пингвин', koala: 'Коала', cat: 'Кот', dog: 'Пёс', rabbit: 'Кролик', bear: 'Медведь',
    elephant: 'Слон', owl: 'Сова', shark: 'Акула', octopus: 'Осьминог', turtle: 'Черепаха', hamster: 'Хомяк', zebra: 'Зебра', wolf: 'Волк', dino: 'Динозавр',
    chick: 'Цыплёнок', pig: 'Поросёнок', cow: 'Корова', horse: 'Лошадь', butterfly: 'Бабочка', bee: 'Пчела', ladybug: 'Божья коровка', crab: 'Краб',
    whale: 'Кит', dolphin: 'Дельфин', flamingo: 'Фламинго', peacock: 'Павлин' };
  E.FREQ = { low: 0.15, mid: 0.25, high: 0.35 };
  E.TILE_COLORS = 8;
  E.THEMES = ['violet', 'space', 'ocean', 'sunset', 'blueprint'];

  /* 15 бонусов. Бонусы спрятаны за отдельными плитками поля: открыл плитку — бонус срабатывает сразу.
     rnd — случайное количество очков 5…25, target — команда выбирает соперника (если команд больше двух). */
  E.POWERUPS = [
    { id: 'double', icon: '⭐', name: 'Double points' },
    { id: 'jackpot', icon: '💰', name: 'Win 50 points' },
    { id: 'gift', icon: '🎁', name: 'Win 5–25 points', fmt: 'Win {n} points', rnd: true },
    { id: 'rocket', icon: '🚀', name: 'Go to first place' },
    { id: 'magnet', icon: '🧲', name: 'Take 5–25 points', fmt: 'Take {n} points', rnd: true, target: true },
    { id: 'zap', icon: '⚡', name: 'Others lose 5–25', fmt: 'Others lose {n} points', rnd: true },
    { id: 'swap', icon: '🔄', name: 'Swap points', target: true },
    { id: 'heart', icon: '💖', name: 'Other team wins 5–25', fmt: 'Other team wins {n} points', rnd: true, target: true },
    { id: 'ghost', icon: '👻', name: 'Give 5–25 points', fmt: 'Give {n} points', rnd: true, target: true },
    { id: 'trap', icon: '🪤', name: 'No points' },
    { id: 'boom', icon: '💥', name: 'Lose 50 points' },
    { id: 'croc', icon: '🐊', name: 'Lose 5–25 points', fmt: 'Lose {n} points', rnd: true },
    { id: 'banana', icon: '🍌', name: 'Go to last place' },
    { id: 'eraser', icon: '🧽', name: 'Reset your score' },
    { id: 'virus', icon: '🦠', name: 'Reset all scores' }
  ];
  E.POWERUPS.forEach(function (p) { p.img = 'img/power/' + p.id + '.webp'; });
  /* Название бонуса с конкретным числом очков: «Take 15 points» */
  E.powerLabel = function (id, amt) {
    var p = E.POWER[id];
    return p.fmt && amt ? p.fmt.replace('{n}', amt) : p.name;
  };
  E.POWER = {};
  E.POWERUPS.forEach(function (p) { E.POWER[p.id] = p; });
  E.PRESETS = {
    all: E.POWERUPS.map(function (p) { return p.id; }),
    kind: ['double', 'jackpot', 'gift', 'rocket', 'magnet', 'zap', 'swap'],
    classic: ['double', 'jackpot', 'gift', 'rocket', 'magnet', 'zap', 'swap', 'heart', 'ghost', 'trap', 'boom', 'croc', 'banana']
  };

  E.random = Math.random;
  function rnd(n) { return Math.floor(E.random() * n); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  E.shuffle = shuffle;
  function clamp0(x) { return x < 0 ? 0 : x; }
  function q(name) { return '«' + name + '»'; }

  E.cleanName = function (s, max) {
    s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    return s.slice(0, max || 20);
  };

  /* ---------- Подбор вопросов ---------- */
  E.collect = function (topicKeys) {
    var out = [];
    (topicKeys || []).forEach(function (key) {
      var f = FB.findTopic(key);
      if (!f) return;
      f.topic.q.forEach(function (qq) {
        out.push({ d: qq.d, text: qq.text, opts: qq.opts, topic: f.topic.title, subject: f.subject.title, key: key });
      });
    });
    return out;
  };
  E.availableCount = function (topicKeys) { return E.collect(topicKeys).length; };

  /* Берёт count вопросов: примерно 35% лёгких, 35% средних, 30% сложных, поровну из выбранных тем. */
  E.pickQuestions = function (topicKeys, count) {
    var all = E.collect(topicKeys);
    if (count >= all.length) return shuffle(all.slice());
    var byKeyD = {};
    all.forEach(function (x) {
      var k = x.key + '|' + x.d;
      (byKeyD[k] = byKeyD[k] || []).push(x);
    });
    Object.keys(byKeyD).forEach(function (k) { shuffle(byKeyD[k]); });
    var keys = topicKeys.filter(function (k) { return all.some(function (x) { return x.key === k; }); });
    var want = { 3: Math.round(count * 0.3), 1: Math.round(count * 0.35) };
    want[2] = count - want[1] - want[3];
    var chosen = [];
    var used = new Set();
    [1, 2, 3].forEach(function (d) {
      var n = want[d], guard = 0, ki = rnd(keys.length || 1);
      while (n > 0 && guard < 10000) {
        guard++;
        var anyLeft = keys.some(function (k) { return (byKeyD[k + '|' + d] || []).length; });
        if (!anyLeft) break;
        var list = byKeyD[keys[ki % keys.length] + '|' + d] || [];
        ki++;
        if (list.length) { var item = list.pop(); chosen.push(item); used.add(item); n--; }
      }
    });
    if (chosen.length < count) {
      var rest = shuffle(all.filter(function (x) { return !used.has(x); }));
      while (chosen.length < count && rest.length) chosen.push(rest.pop());
    }
    return shuffle(chosen);
  };

  function makeTiles(cfg) {
    var qs = E.pickQuestions(cfg.topicKeys, cfg.count);
    var tiles = qs.map(function (x) {
      var order = shuffle([0, 1, 2, 3]);
      return {
        kind: 'q', text: x.text, d: x.d, pts: E.POINTS[x.d], topic: x.topic,
        opts: order.map(function (o) { return x.opts[o]; }),
        correct: order.indexOf(0)
      };
    });
    var p = cfg.powerups;
    if (p && p.on && p.ids && p.ids.length && tiles.length) {
      var k = Math.max(1, Math.round(tiles.length * (E.FREQ[p.freq] || E.FREQ.mid)));
      var bag = [];
      for (var i = 0; i < k; i++) {
        if (!bag.length) bag = shuffle(p.ids.slice());
        var id = bag.pop();
        tiles.push({ kind: 'p', power: { id: id, amt: E.POWER[id].rnd ? 5 * (1 + rnd(5)) : 0 } });
      }
    }
    shuffle(tiles);
    tiles.forEach(function (t, i) { t.n = i + 1; t.used = false; t.by = null; t.ok = null; t.c = rnd(E.TILE_COLORS); });
    // соседние плитки не одного цвета
    for (var j = 1; j < tiles.length; j++) if (tiles[j].c === tiles[j - 1].c) tiles[j].c = (tiles[j].c + 1 + rnd(E.TILE_COLORS - 1)) % E.TILE_COLORS;
    return tiles;
  }

  /* ---------- Создание игры ---------- */
  E.createGame = function (cfg, now) {
    now = now || Date.now();
    var names = (cfg.teams || []).slice(0, 4);
    while (names.length < 2) names.push('Команда ' + (names.length + 1));
    var c = {
      mode: cfg.mode === 'phones' ? 'phones' : 'screen',
      topicKeys: (cfg.topicKeys || []).slice(),
      count: Math.max(1, cfg.count | 0 || 20),
      timer: Math.max(0, cfg.timer | 0),
      theme: E.THEMES.indexOf(cfg.theme) >= 0 ? cfg.theme : E.THEMES[0],
      powerups: {
        on: !!(cfg.powerups && cfg.powerups.on),
        freq: (cfg.powerups && cfg.powerups.freq) || 'mid',
        ids: ((cfg.powerups && cfg.powerups.ids) || []).filter(function (id) { return E.POWER[id]; })
      },
      winVideo: String(cfg.winVideo || '').trim().slice(0, 400),
      title: cfg.title || 'Викторина',
      subtitle: cfg.subtitle || ''
    };
    if (!c.powerups.ids.length) c.powerups.on = false;
    var s = {
      id: Math.random().toString(36).slice(2, 10),
      created: now, v: 1,
      cfg: c, mode: c.mode, code: cfg.code || null,
      teams: names.map(function (n, i) {
        return { name: E.cleanName(n, 24) || ('Команда ' + (i + 1)), color: E.TEAM_COLORS[i], score: 0, correct: 0, answered: 0 };
      }),
      players: {},
      tiles: makeTiles(c),
      turn: 0,
      phase: c.mode === 'phones' ? 'lobby' : 'board',
      cur: null
    };
    return s;
  };

  /* ---------- Вспомогательные ---------- */
  E.teamMembers = function (s, team, onlineOnly) {
    return Object.keys(s.players).map(function (k) { return s.players[k]; }).filter(function (p) {
      return p.team === team && (!onlineOnly || p.online);
    });
  };
  E.tally = function (s) {
    var t = [0, 0, 0, 0];
    if (!s.cur) return t;
    Object.keys(s.cur.votes).forEach(function (pid) { var o = s.cur.votes[pid].o; if (o >= 0 && o < 4) t[o]++; });
    return t;
  };
  E.majority = function (s) {
    if (!s.cur) return null;
    var votes = s.cur.votes, best = null, bestN = 0, bestT = Infinity;
    var cnt = {}, first = {};
    Object.keys(votes).forEach(function (pid) {
      var v = votes[pid];
      cnt[v.o] = (cnt[v.o] || 0) + 1;
      first[v.o] = Math.min(first[v.o] == null ? Infinity : first[v.o], v.t);
    });
    Object.keys(cnt).forEach(function (o) {
      var n = cnt[o], t = first[o];
      if (n > bestN || (n === bestN && t < bestT)) { best = Number(o); bestN = n; bestT = t; }
    });
    return best;
  };
  E.leftTiles = function (s) { return s.tiles.filter(function (t) { return !t.used; }).length; };

  function finalize(s, opt, now, ev, reason) {
    var cur = s.cur, tile = s.tiles[cur.tile], team = s.teams[s.turn];
    cur.chosen = (opt === 0 || opt === 1 || opt === 2 || opt === 3) ? opt : null;
    cur.ok = cur.chosen === tile.correct;
    cur.timeUp = reason === 'timeout';
    cur.deadline = null;
    team.answered++;
    tile.ok = cur.ok;
    if (cur.ok) {
      team.score += tile.pts; team.correct++; cur.earned = tile.pts;
      ev.push({ type: 'correct', team: s.turn, pts: tile.pts });
    } else {
      cur.earned = 0;
      ev.push({ type: cur.timeUp ? 'timeup' : 'wrong', team: s.turn });
    }
    s.phase = 'reveal';
  }

  function maybeAutoFinalize(s, now, ev) {
    if (s.phase !== 'question' || s.mode !== 'phones') return;
    var members = E.teamMembers(s, s.turn, true);
    if (!members.length) return;
    var all = members.every(function (p) { return s.cur.votes[p.id]; });
    if (all) finalize(s, E.majority(s), now, ev, 'votes');
  }

  function endTurn(s, ev) {
    s.cur = null;
    if (E.leftTiles(s) === 0) { s.phase = 'end'; ev.push({ type: 'end' }); return; }
    s.turn = (s.turn + 1) % s.teams.length;
    s.phase = 'board';
    ev.push({ type: 'turn', team: s.turn });
  }

  /* Применяет бонус. Очки никогда не уходят ниже нуля. */
  E.applyPower = function (s, box, target) {
    var me = s.turn, T = s.teams, t = T[me], o = target == null ? null : T[target];
    var before = T.map(function (x) { return x.score; });
    var amt = box.amt, text = '', id = box.id;
    var others = T.filter(function (_, i) { return i !== me; }).map(function (x) { return x.score; });
    switch (id) {
      case 'double': t.score *= 2; text = 'Double points!'; break;
      case 'jackpot': t.score += 50; text = 'Win 50 points!'; break;
      case 'gift': t.score += amt; text = 'Win ' + amt + ' points!'; break;
      case 'rocket':
        var mx = Math.max.apply(null, others);
        t.score = Math.max(t.score + 5, mx + 5);
        text = 'Go to first place!'; break;
      case 'magnet':
        var take = Math.min(amt, o.score); o.score -= take; t.score += take;
        text = 'Take ' + take + ' points from ' + q(o.name) + '!'; break;
      case 'zap':
        T.forEach(function (x, i) { if (i !== me) x.score = clamp0(x.score - amt); });
        text = 'Other teams lose ' + amt + ' points!'; break;
      case 'swap':
        var tmp = t.score; t.score = o.score; o.score = tmp;
        text = 'Swap points with ' + q(o.name) + '!'; break;
      case 'heart': o.score += amt; text = q(o.name) + ' wins ' + amt + ' points!'; break;
      case 'ghost':
        var give = Math.min(amt, t.score); t.score -= give; o.score += give;
        text = 'Give ' + give + ' points to ' + q(o.name) + '!'; break;
      case 'trap': text = 'No points!'; break;
      case 'boom':
        var l3 = Math.min(50, t.score); t.score -= l3;
        text = 'Lose 50 points!'; break;
      case 'croc':
        var l4 = Math.min(amt, t.score); t.score -= l4;
        text = 'Lose ' + amt + ' points!'; break;
      case 'banana':
        var mn = Math.min.apply(null, others);
        t.score = clamp0(Math.min(t.score, mn - 5));
        text = 'Go to last place!'; break;
      case 'eraser': t.score = 0; text = 'Reset your score!'; break;
      case 'virus': T.forEach(function (x) { x.score = 0; }); text = 'Reset all scores!'; break;
    }
    var after = T.map(function (x) { return x.score; });
    return {
      id: id, icon: E.POWER[id].icon, name: E.powerLabel(id, amt), amt: amt, text: text,
      target: target == null ? null : target, before: before, after: after,
      delta: after.map(function (a, i) { return a - before[i]; })
    };
  };

  function doPower(s, target, ev) {
    var box = s.cur.power;
    var eff = E.applyPower(s, box, target);
    s.cur.effect = eff;
    s.phase = 'bonusReveal';
    var mine = eff.delta[s.turn], sumOthers = 0;
    eff.delta.forEach(function (d, i) { if (i !== s.turn) sumOthers += d; });
    var mood = mine > 0 || sumOthers < 0 ? 1 : (mine < 0 || sumOthers > 0 ? -1 : 0);
    if (box.id === 'virus') mood = 0;
    ev.push({ type: 'power', id: box.id, mood: mood, team: s.turn });
  }

  /* ---------- Главная функция: применяет действие к состоянию ---------- */
  E.act = function (s, a, now) {
    now = now || Date.now();
    var ev = [];
    var ok = (function () {
      switch (a.type) {
        case 'join': {
          var name = E.cleanName(a.name, 20);
          var team = a.team | 0;
          if (!a.pid || !name || team < 0 || team >= s.teams.length) return false;
          var p = s.players[a.pid];
          var isNew = !p;
          if (!p) p = s.players[a.pid] = { id: a.pid, joined: now };
          p.name = name; p.av = E.AVATARS.indexOf(a.av) >= 0 ? a.av : E.AVATARS[rnd(E.AVATARS.length)];
          if (isNew || s.phase === 'lobby' || p.team == null) p.team = team;
          p.online = true; p.last = now;
          if (isNew) ev.push({ type: 'join', name: name });
          maybeAutoFinalize(s, now, ev);
          return true;
        }
        case 'setTeam': {
          var pl = s.players[a.pid];
          if (!pl || a.team < 0 || a.team >= s.teams.length) return false;
          if (!a.byHost && s.phase !== 'lobby') return false;
          if (pl.team === a.team) return false;
          pl.team = a.team;
          if (s.cur && s.cur.votes[a.pid]) delete s.cur.votes[a.pid];
          maybeAutoFinalize(s, now, ev);
          return true;
        }
        case 'kick': {
          if (!s.players[a.pid]) return false;
          delete s.players[a.pid];
          if (s.cur && s.cur.votes[a.pid]) delete s.cur.votes[a.pid];
          maybeAutoFinalize(s, now, ev);
          return true;
        }
        case 'online': {
          var po = s.players[a.pid];
          if (!po) return false;
          po.last = now;
          if (po.online === !!a.on) return false;
          po.online = !!a.on;
          maybeAutoFinalize(s, now, ev);
          return true;
        }
        case 'shuffleTeams': {
          var ids = shuffle(Object.keys(s.players));
          if (!ids.length) return false;
          var off = rnd(s.teams.length);
          ids.forEach(function (id, i) { s.players[id].team = (i + off) % s.teams.length; });
          return true;
        }
        case 'start':
          if (s.phase !== 'lobby') return false;
          s.phase = 'board'; ev.push({ type: 'start' }); ev.push({ type: 'turn', team: s.turn });
          return true;
        case 'pick': {
          if (s.phase !== 'board') return false;
          if (a.team != null && a.team !== s.turn) return false;
          var ti = a.tile | 0, tile = s.tiles[ti];
          if (!tile || tile.used) return false;
          tile.used = true;
          tile.by = s.turn;
          if (tile.kind === 'p') {
            s.cur = { tile: ti, kind: 'p', power: tile.power, effect: null, votes: {} };
            ev.push({ type: 'openPower', tile: ti });
            var pw = E.POWER[tile.power.id];
            if (pw.target && s.teams.length > 2) { s.phase = 'target'; ev.push({ type: 'needTarget' }); }
            else doPower(s, pw.target ? (s.turn + 1) % s.teams.length : null, ev);
            return true;
          }
          s.cur = {
            tile: ti, kind: 'q', votes: {}, chosen: null, ok: null, earned: 0, timeUp: false,
            deadline: s.cfg.timer ? now + s.cfg.timer * 1000 : null, effect: null
          };
          s.phase = 'question';
          ev.push({ type: 'open', tile: ti });
          return true;
        }
        case 'vote': {
          if (s.phase !== 'question') return false;
          var pv = s.players[a.pid];
          if (!pv || pv.team !== s.turn) return false;
          var o = a.opt | 0;
          if (o < 0 || o > 3) return false;
          var prev = s.cur.votes[a.pid];
          if (prev && prev.o === o) return false;
          s.cur.votes[a.pid] = { o: o, t: now };
          ev.push({ type: 'vote' });
          maybeAutoFinalize(s, now, ev);
          return true;
        }
        case 'answer':
          if (s.phase !== 'question') return false;
          if (!(a.opt >= 0 && a.opt <= 3)) return false;
          finalize(s, a.opt | 0, now, ev, 'host');
          return true;
        case 'reveal':
          if (s.phase !== 'question') return false;
          finalize(s, s.mode === 'phones' ? E.majority(s) : null, now, ev, 'reveal');
          return true;
        case 'timeout':
          if (s.phase !== 'question' || !s.cur.deadline || now < s.cur.deadline - 30) return false;
          finalize(s, s.mode === 'phones' ? E.majority(s) : null, now, ev, 'timeout');
          return true;
        case 'next':
          if (s.phase === 'reveal' || s.phase === 'bonusReveal') { endTurn(s, ev); return true; }
          return false;
        case 'target': {
          if (s.phase !== 'target') return false;
          if (a.team != null && a.team !== s.turn) return false;
          var tg = a.target | 0;
          if (tg < 0 || tg >= s.teams.length || tg === s.turn) return false;
          doPower(s, tg, ev);
          return true;
        }
        case 'adjust': {
          var at = s.teams[a.team];
          if (!at || !a.delta) return false;
          at.score = clamp0(at.score + (a.delta | 0));
          ev.push({ type: 'adjust', team: a.team });
          return true;
        }
        case 'skip':
          if (s.phase !== 'board') return false;
          s.turn = (s.turn + 1) % s.teams.length;
          ev.push({ type: 'turn', team: s.turn });
          return true;
        case 'end':
          if (s.phase === 'end') return false;
          s.phase = 'end'; s.cur = null; ev.push({ type: 'end' });
          return true;
        case 'restart': {
          s.tiles = makeTiles(s.cfg);
          s.teams.forEach(function (t) { t.score = 0; t.correct = 0; t.answered = 0; });
          s.turn = 0; s.cur = null;
          s.phase = s.mode === 'phones' ? 'lobby' : 'board';
          s.id = Math.random().toString(36).slice(2, 10);
          ev.push({ type: 'restart' });
          return true;
        }
      }
      return false;
    })();
    if (ok) s.v++;
    return { ok: ok, events: ev };
  };

  /* Ранжирование: одинаковые очки — одно место. */
  E.ranking = function (teams) {
    var arr = teams.map(function (t, i) { return { i: i, t: t }; }).sort(function (a, b) { return b.t.score - a.t.score; });
    var place = 0, last = null;
    arr.forEach(function (x, k) { if (x.t.score !== last) { place = k + 1; last = x.t.score; } x.place = place; });
    return arr;
  };

  /* То, что видят экран и телефоны: без правильного ответа до раскрытия и без скрытых бонусов. */
  E.view = function (s, now) {
    now = now || Date.now();
    var c = s.cur, tile = c ? s.tiles[c.tile] : null;
    var cnt = s.teams.map(function () { return 0; });
    var players = Object.keys(s.players).map(function (k) { return s.players[k]; })
      .sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); })
      .map(function (p) {
        if (p.team != null && cnt[p.team] != null) cnt[p.team]++;
        return { id: p.id, name: p.name, team: p.team, av: p.av, on: !!p.online };
      });
    var revealed = s.phase !== 'question';
    var cur = null;
    if (c && tile.kind === 'p') {
      cur = { kind: 'p', tile: c.tile, n: tile.n, power: { id: tile.power.id, amt: tile.power.amt }, effect: c.effect };
    } else if (c) {
      cur = {
        kind: 'q', tile: c.tile, n: tile.n, text: tile.text, opts: tile.opts, pts: tile.pts, d: tile.d, topic: tile.topic,
        tally: E.tally(s), voters: Object.keys(c.votes),
        need: E.teamMembers(s, s.turn, true).length,
        chosen: c.chosen, correct: revealed ? tile.correct : null, ok: c.ok, earned: c.earned, timeUp: c.timeUp,
        remain: c.deadline ? Math.max(0, c.deadline - now) : null, total: s.cfg.timer * 1000
      };
    }
    return {
      v: s.v, id: s.id, mode: s.mode, code: s.code, phase: s.phase, turn: s.turn,
      title: s.cfg.title, subtitle: s.cfg.subtitle,
      cfg: { timer: s.cfg.timer, powerOn: s.cfg.powerups.on, theme: s.cfg.theme || E.THEMES[0] },
      teams: s.teams.map(function (t, i) {
        return { name: t.name, color: t.color, score: t.score, correct: t.correct, answered: t.answered, players: cnt[i] };
      }),
      players: players,
      left: E.leftTiles(s),
      tiles: s.tiles.map(function (t) {
        return {
          n: t.n, c: t.c, used: t.used, by: t.by, ok: t.ok,
          kind: t.used ? t.kind : null,
          icon: t.used && t.kind === 'p' ? t.power.id : null
        };
      }),
      cur: cur
    };
  };

  FB.Engine = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
