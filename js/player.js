/* Alibaba — экран игрока на телефоне. */
(function (root) {
  'use strict';
  var FB = root.FB, E = FB.Engine, UI = FB.UI, FX = FB.FX;
  var esc = UI.esc;
  var P = FB.Player = {};
  var ANS_COLORS = ['#6A4DFF', '#008F7A', '#E06A00', '#E0337F'];

  var net = null, code = null, pid = null, view = null, prof = null;
  var status = 'connecting', joinedSent = 0, myVote = null, picking = null;
  var shellBuilt = false, bodyKey = null, raf = 0, recvAt = 0, lastFxKey = null, changingTeam = false;

  P.savedSession = function () {
    var x = UI.store.get('alibaba.player', null);
    if (!x || !x.code || !x.pid) return null;
    if (Date.now() - (x.t || 0) > 8 * 3600 * 1000) return null;
    return x;
  };
  function saveSession() {
    UI.store.set('alibaba.player', { code: code, pid: pid, name: prof.name, av: prof.av, t: Date.now() });
  }
  P.active = function () { return !!net; };

  P.start = function (c) {
    P.stop(true);
    code = String(c);
    var sess = P.savedSession();
    var same = sess && sess.code === code;
    pid = same ? sess.pid : 'p' + FB.Net.rid(11);
    prof = {
      name: same ? sess.name : (UI.store.get('alibaba.lastName', '') || ''),
      av: same && sess.av ? sess.av : E.AVATARS[Math.floor(Math.random() * E.AVATARS.length)]
    };
    view = null; status = 'connecting'; joinedSent = 0; myVote = null; picking = null;
    shellBuilt = false; bodyKey = null; changingTeam = false;
    try { history.replaceState(null, '', location.pathname + '?code=' + code); } catch (e) { }
    simple('connecting', '<div class="spinner" aria-hidden="true"></div><h2>Ищем игру ' + esc(UI.fmtCode(code)) + '…</h2><p class="muted">Это занимает пару секунд.</p>');
    FB.Net.ready().then(function (libs) {
      if (code !== String(c)) return;
      if (!libs.mqtt && !libs.peer) { failScreen('Не удалось загрузить модули связи. Проверьте интернет и обновите страницу.'); return; }
      net = new FB.Net.ClientNet(code, pid, { onMsg: onMsg, onStatus: onStatus });
      net.connect();
    });
    FX._wantAwake = true; FX.keepAwake();
    root.addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', onVis);
  };
  P.stop = function (silent) {
    if (net) { if (!silent) net.send({ t: 'bye' }); net.stop(); net = null; }
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    root.removeEventListener('pagehide', bye);
    document.removeEventListener('visibilitychange', onVis);
    FX._wantAwake = false;
  };
  function bye() { if (net) net.send({ t: 'bye' }); }
  function onVis() {
    if (document.visibilityState === 'visible' && net && !net.isOnline()) net.connect();
  }
  function leave() {
    P.stop(false);
    UI.store.del('alibaba.player');
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    UI.home();
  }

  function simple(name, inner, actions) {
    shellBuilt = false; bodyKey = null;
    UI.screen('player', '<div class="ph ph-simple"><div class="ph-simple-in">' + UI.wordmark('wordmark-sm') + '<div class="ph-msg ph-' + name + '">' + inner + '</div>' + (actions || '') + '</div></div>');
  }
  function failScreen(text, retry) {
    simple('fail', '<h2>' + esc(text) + '</h2>',
      '<div class="ph-actions">' + (retry ? '<button class="btn btn-yellow btn-lg" id="retryBtn" type="button">Попробовать снова</button>' : '') +
      '<button class="btn btn-ghost" id="otherBtn" type="button">Ввести другой код</button></div>');
    var r = UI.$('#retryBtn');
    if (r) r.addEventListener('click', function () { P.start(code); });
    UI.$('#otherBtn').addEventListener('click', function () {
      P.stop(true);
      try { history.replaceState(null, '', location.pathname); } catch (e) { }
      UI.home();
    });
  }

  function onStatus(st) {
    status = st;
    if (st === 'notfound') {
      failScreen('Игра с кодом ' + UI.fmtCode(code) + ' не найдена. Проверьте код на экране организатора — или игра ещё не создана.', true);
      if (net) { net.stop(); net = null; }
      return;
    }
    if (st === 'nolibs') { failScreen('Не удалось загрузить модули связи. Обновите страницу.', true); return; }
    var b = UI.$('#phBanner');
    if (b) b.hidden = st === 'online';
  }

  function onMsg(m) {
    if (m.t === 'welcome' || m.t === 'state') {
      var s = m.s;
      if (!s || !s.teams) return;
      if (view && s.id === view.id && s.v < view.v) return;
      view = s; recvAt = Date.now();
      if (s.cfg && s.cfg.theme) UI.applyTheme(s.cfg.theme);
      render();
      return;
    }
    if (m.t === 'kicked') {
      P.stop(true); UI.store.del('alibaba.player');
      simple('kicked', '<h2>Организатор удалил вас из игры</h2>', '<div class="ph-actions"><button class="btn btn-yellow" id="homeBtn" type="button">На главную</button></div>');
      UI.$('#homeBtn').addEventListener('click', function () { try { history.replaceState(null, '', location.pathname); } catch (e) { } UI.home(); });
      return;
    }
    if (m.t === 'closed') {
      P.stop(true); UI.store.del('alibaba.player');
      simple('closed', '<h2>Организатор закрыл игру</h2><p class="muted">Спасибо за игру!</p>', '<div class="ph-actions"><button class="btn btn-yellow" id="homeBtn" type="button">На главную</button></div>');
      UI.$('#homeBtn').addEventListener('click', function () { try { history.replaceState(null, '', location.pathname); } catch (e) { } UI.home(); });
    }
  }

  function me() {
    if (!view) return null;
    for (var i = 0; i < view.players.length; i++) if (view.players[i].id === pid) return view.players[i];
    return null;
  }

  /* ---------- Рендер ---------- */
  function render() {
    if (!view) return;
    var my = me();
    if (!my) {
      if (joinedSent && Date.now() - joinedSent < 5000) return; // ждём подтверждения
      profileScreen();
      return;
    }
    prof.team = my.team;
    saveSession();
    buildShell();
    updateShell(my);
    var key = bodyKeyFor(my);
    var main = UI.$('#phMain');
    if (key !== bodyKey) {
      bodyKey = key;
      main.className = 'ph-main k-' + key.split(':')[0];
      main.innerHTML = '';
      main._html = null;
      if (key.indexOf('q:') === 0) myVote = myVote && myVote.tile === view.cur.tile ? myVote : null;
      if (key.indexOf('board:') !== 0) picking = null;
    }
    UI.patch(main, bodyHtml(my));
    fxFor(my);
  }

  function sendJoin(team) {
    joinedSent = Date.now();
    prof.team = team;
    UI.store.set('alibaba.lastName', prof.name);
    net.send({ t: 'join', name: prof.name, team: team, av: prof.av });
    setTimeout(function () { if (view && !me() && joinedSent && Date.now() - joinedSent >= 4900) { joinedSent = 0; render(); } }, 5000);
  }

  function profileScreen() {
    shellBuilt = false; bodyKey = null;
    var started = view.phase !== 'lobby';
    var existing = UI.$('.ph-profile');
    var teamsHtml = view.teams.map(function (t, i) {
      return '<button type="button" class="ph-team-btn" data-team="' + i + '" style="--tc:' + t.color + '">' +
        '<span class="dot"></span><b>' + esc(t.name) + '</b><span class="n">' + t.players + '</span></button>';
    }).join('');
    if (existing) { UI.patch(UI.$('#phTeams'), teamsHtml); return; }
    UI.screen('player',
      '<div class="ph ph-profile"><div class="ph-simple-in">' + UI.wordmark('wordmark-sm') +
        '<p class="ph-game">Игра <b>' + esc(UI.fmtCode(code)) + '</b>: ' + esc(view.title) + '</p>' +
        (started ? '<p class="ph-note">Игра уже идёт — можно присоединиться к команде.</p>' : '') +
        '<label class="lbl" for="nameInput">Как тебя зовут?</label>' +
        '<div class="name-row"><button type="button" class="av-btn" id="avBtn" aria-label="Сменить значок">' + esc(prof.av) + '</button>' +
        '<input id="nameInput" maxlength="20" autocomplete="nickname" placeholder="Имя" value="' + esc(prof.name) + '"></div>' +
        '<p class="form-err" id="nameErr" role="alert"></p>' +
        '<p class="lbl">Выбери команду</p>' +
        '<div class="ph-teams" id="phTeams">' + teamsHtml + '</div>' +
      '</div></div>');
    UI.$('#avBtn').addEventListener('click', function () {
      var i = E.AVATARS.indexOf(prof.av);
      prof.av = E.AVATARS[(i + 1) % E.AVATARS.length];
      this.textContent = prof.av;
    });
    UI.$('#phTeams').addEventListener('click', function (e) {
      var b = e.target.closest('[data-team]');
      if (!b) return;
      FX.unlock();
      var name = E.cleanName(UI.$('#nameInput').value, 20);
      if (!name) { UI.$('#nameErr').textContent = 'Сначала напиши своё имя'; UI.$('#nameInput').focus(); return; }
      prof.name = name;
      sendJoin(Number(b.getAttribute('data-team')));
      simple('joining', '<div class="spinner" aria-hidden="true"></div><h2>Присоединяемся…</h2>');
    });
  }

  function buildShell() {
    if (shellBuilt && UI.$('.ph-game-shell')) return;
    shellBuilt = true; bodyKey = null;
    UI.screen('player',
      '<div class="ph ph-game-shell">' +
        '<header class="ph-top"><span class="ph-team" id="phTeam"></span><span class="ph-score" id="phScore" data-val="0">0</span>' +
          '<button type="button" class="ph-menu" id="phMenu" aria-label="Меню">⋯</button></header>' +
        '<div class="ph-banner" id="phBanner"' + (status === 'online' ? ' hidden' : '') + '>Связь прервалась, переподключаемся…</div>' +
        '<div class="ph-timer" id="phTimer" hidden><i></i></div>' +
        '<main class="ph-main" id="phMain"></main>' +
      '</div>');
    UI.$('#phMenu').addEventListener('click', function () {
      UI.confirm('Выйти из игры? Твоя команда продолжит без тебя.', 'Выйти').then(function (ok) { if (ok) leave(); });
    });
    UI.$('#phMain').addEventListener('click', onMainClick);
    if (!raf) raf = requestAnimationFrame(timerFrame);
  }
  function updateShell(my) {
    var t = view.teams[my.team];
    var shell = UI.$('.ph-game-shell');
    shell.style.setProperty('--tc', t.color);
    UI.patch(UI.$('#phTeam'), '<span class="av">' + esc(my.av) + '</span><span><b>' + esc(my.name) + '</b><small>' + esc(t.name) + '</small></span>');
    FX.countTo(UI.$('#phScore'), t.score);
  }

  function timerFrame() {
    raf = requestAnimationFrame(timerFrame);
    var el = UI.$('#phTimer');
    if (!el) return;
    var c = view && view.cur;
    var on = view && view.phase === 'question' && c && c.remain != null && c.total;
    el.hidden = !on;
    if (!on) return;
    var remain = Math.max(0, c.remain - (Date.now() - recvAt));
    el.firstChild.style.transform = 'scaleX(' + (remain / c.total).toFixed(4) + ')';
    el.classList.toggle('low', remain <= 5000);
  }

  function bodyKeyFor(my) {
    var ph = view.phase;
    if (ph === 'lobby') return 'lobby:' + (changingTeam ? 1 : 0);
    if (ph === 'board') return 'board:' + view.turn + ':' + (view.turn === my.team ? 'me' : 'other');
    if (ph === 'question' || ph === 'reveal') return 'q:' + view.cur.tile;
    if (ph === 'target' || ph === 'bonusReveal') return 'b:' + view.cur.tile;
    if (ph === 'end') return 'end:' + view.id;
    return ph;
  }

  function scoreboard() {
    return '<div class="ph-scores">' + E.ranking(view.teams).map(function (x) {
      return '<span class="ph-sc" style="--tc:' + x.t.color + '"><span class="dot"></span><b>' + esc(x.t.name) + '</b><span>' + x.t.score + '</span></span>';
    }).join('') + '</div>';
  }

  function bodyHtml(my) {
    var ph = view.phase, mine = view.turn === my.team, turnTeam = view.teams[view.turn];
    var tname = '<b style="color:' + turnTeam.color + '">' + esc(turnTeam.name) + '</b>';
    if (ph === 'lobby') {
      var mates = view.players.filter(function (p) { return p.team === my.team; });
      if (changingTeam) {
        return '<h2 class="ph-h">Выбери команду</h2><div class="ph-teams">' + view.teams.map(function (t, i) {
          return '<button type="button" class="ph-team-btn' + (i === my.team ? ' on' : '') + '" data-switch="' + i + '" style="--tc:' + t.color + '"><span class="dot"></span><b>' + esc(t.name) + '</b><span class="n">' + t.players + '</span></button>';
        }).join('') + '</div><button type="button" class="btn btn-ghost" data-cancel="1">Отмена</button>';
      }
      return '<div class="ph-wait">' +
        '<div class="ph-big-av">' + esc(my.av) + '</div>' +
        '<h2 class="ph-h">Ты в команде <span style="color:' + view.teams[my.team].color + '">' + esc(view.teams[my.team].name) + '</span></h2>' +
        '<p class="muted">Ждём, пока организатор начнёт игру. Смотри на большой экран!</p>' +
        '<div class="ph-mates">' + mates.map(function (p) { return '<span class="chip' + (p.on ? '' : ' off') + '"><span class="av">' + esc(p.av) + '</span>' + esc(p.name) + '</span>'; }).join('') + '</div>' +
        '<button type="button" class="btn btn-ghost" data-change="1">Сменить команду</button></div>';
    }
    if (ph === 'board') {
      if (mine) {
        return '<h2 class="ph-h">Ваш ход! Выберите плитку</h2>' +
          '<div class="ph-board">' + view.tiles.map(function (t, i) {
            if (t.used) return '<span class="ph-tile used">' + (t.kind === 'p' ? UI.powerImg(t.icon) : t.n) + '</span>';
            var busy = picking != null;
            return '<button type="button" class="ph-tile c' + t.c + (picking === i ? ' picking' : '') + '" data-tile="' + i + '"' + (busy ? ' disabled' : '') + '>' + t.n + '</button>';
          }).join('') + '</div>' +
          '<p class="muted center">Кто первым нажмёт — тот и выбрал. Договоритесь!</p>';
      }
      return '<div class="ph-watch"><p class="ph-big">Ходит команда ' + tname + '</p><p class="muted">Следи за большим экраном.</p>' + scoreboard() + '</div>';
    }
    if (ph === 'question' || ph === 'reveal') {
      var c = view.cur, open = ph === 'question';
      var votedHere = view.cur.voters.indexOf(pid) >= 0;
      var head = '<div class="ph-qhead"><span class="q-pts d' + c.d + '">' + c.pts + ' очков</span>' +
        '<span class="ph-qwho">' + (mine ? 'Отвечает твоя команда' : 'Отвечает ' + tname) + '</span></div>';
      var answers = '<div class="ph-answers' + (mine && open ? ' live' : '') + '">' + c.opts.map(function (o, i) {
        var cls = '';
        if (!open) cls = c.correct === i ? ' right' : (c.chosen === i ? ' wrong' : ' dim');
        else if (myVote && myVote.opt === i) cls = ' mine';
        var votes = mine && c.tally[i] ? '<span class="ph-votes">' + c.tally[i] + '</span>' : '';
        return '<button type="button" class="ph-ans' + cls + '" data-opt="' + i + '" style="--ac:' + ANS_COLORS[i] + '"' + (mine && open ? '' : ' disabled') + '>' +
          '<span class="ans-l">' + UI.LETTERS[i] + '</span><span class="ans-t">' + esc(o) + '</span>' + votes + '</button>';
      }).join('') + '</div>';
      var foot = '';
      if (open) {
        if (mine) foot = '<p class="ph-foot">' + (myVote || votedHere ? 'Голос принят. Можно передумать, пока не проголосовали все.' : 'Выбери ответ — победит вариант большинства в команде') + '<br><b>Голосов: ' + c.voters.length + ' из ' + c.need + '</b></p>';
        else foot = '<p class="ph-foot">Думай вместе со всеми — может, следующий вопрос ваш!</p>';
      } else {
        var r;
        if (c.ok) r = '<span class="res-ok">' + (mine ? 'Верно! +' + c.earned : 'Команда ' + esc(turnTeam.name) + ' ответила верно') + '</span>';
        else r = '<span class="res-bad">' + (c.timeUp ? 'Время вышло' : (c.chosen == null ? 'Ответа нет' : (mine ? 'Неверно' : 'Команда ' + esc(turnTeam.name) + ' ошиблась'))) + '</span>';
        foot = '<p class="ph-result"><img class="ph-stamp" src="img/ui/' + (c.ok ? 'correct' : (c.timeUp ? 'timeup' : 'wrong')) + '.webp" alt="">' + r + '</p>';
      }
      return head + '<h2 class="ph-q">' + esc(c.text) + '</h2>' + answers + foot;
    }
    if (ph === 'target' || ph === 'bonusReveal') {
      var cb = view.cur;
      var out = '<h2 class="ph-h">' + (mine ? 'Бонус для твоей команды!' : 'Бонус для команды ' + tname) + '</h2>' +
        '<div class="ph-power">' + UI.powerImg(cb.power.id, 'pw-big') + '<b>' + esc(E.powerLabel(cb.power.id, cb.power.amt)) + '</b></div>';
      if (ph === 'target') {
        if (mine) out += '<p class="ph-h2">Кого выбираете?</p><div class="ph-teams">' + view.teams.map(function (t, i) {
          if (i === view.turn) return '';
          return '<button type="button" class="ph-team-btn" data-target="' + i + '" style="--tc:' + t.color + '"><span class="dot"></span><b>' + esc(t.name) + '</b><span class="n">' + t.score + '</span></button>';
        }).join('') + '</div>';
        else out += '<p class="muted center">Команда выбирает соперника…</p>';
      }
      if (ph === 'bonusReveal' && cb.effect) out += (cb.effect.target != null ? '<p class="ph-effect">' + esc(cb.effect.text) + '</p>' : '') + scoreboard();
      return out;
    }
    if (ph === 'end') {
      var rk = E.ranking(view.teams);
      var mineR = rk.filter(function (x) { return x.i === my.team; })[0];
      var tie = rk.filter(function (x) { return x.place === mineR.place; }).length > 1;
      var title = mineR.place === 1 ? (tie ? 'Ничья на первом месте!' : 'Твоя команда победила!') : 'Твоя команда на ' + mineR.place + '-м месте';
      var art = mineR.place === 1 ?
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/trophy.webp" alt=""><div class="cel-dancers small">' +
          ['dance1', 'party', 'monkey', 'dance2'].map(function (n, i) { return '<img src="img/ui/' + n + '.webp" alt="" style="--i:' + i + '">'; }).join('') + '</div></div>' :
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/' + (mineR.place <= 3 ? 'medal' + mineR.place : 'clap') + '.webp" alt=""></div>';
      return '<div class="ph-end">' + art + '<h2 class="ph-h">' + title + '</h2>' + scoreboard() +
        '<p class="muted center">Организатор может начать новую игру — не закрывай страницу.</p>' +
        '<button type="button" class="btn btn-ghost" data-leave="1">Выйти</button></div>';
    }
    return '<p class="muted">Ждём…</p>';
  }

  function onMainClick(e) {
    var t;
    if ((t = e.target.closest('[data-tile]')) && view.phase === 'board' && picking == null) {
      picking = Number(t.getAttribute('data-tile'));
      net.send({ t: 'pick', tile: picking });
      FX.vibrate(15);
      render();
      setTimeout(function () { if (picking != null && view && view.phase === 'board') { picking = null; render(); } }, 3000);
      return;
    }
    if ((t = e.target.closest('[data-opt]')) && view.phase === 'question') {
      var opt = Number(t.getAttribute('data-opt'));
      myVote = { tile: view.cur.tile, opt: opt };
      net.send({ t: 'vote', opt: opt });
      FX.vibrate(15);
      render();
      return;
    }
    if ((t = e.target.closest('[data-target]')) && view.phase === 'target') { net.send({ t: 'target', target: Number(t.getAttribute('data-target')) }); return; }
    if (e.target.closest('[data-change]')) { changingTeam = true; render(); return; }
    if (e.target.closest('[data-cancel]')) { changingTeam = false; render(); return; }
    if ((t = e.target.closest('[data-switch]'))) {
      changingTeam = false;
      var team = Number(t.getAttribute('data-switch'));
      net.send({ t: 'team', team: team });
      render(); return;
    }
    if (e.target.closest('[data-leave]')) leave();
  }

  function fxFor(my) {
    var c = view.cur, key = null;
    if (view.phase === 'reveal' && c) key = 'r' + c.tile;
    else if (view.phase === 'bonusReveal' && c) key = 'p' + c.tile;
    else if (view.phase === 'end') key = 'e' + view.id;
    else if (view.phase === 'board' && view.turn === my.team) key = 't' + view.left;
    if (!key || key === lastFxKey) return;
    var first = lastFxKey === null;
    lastFxKey = key;
    if (first) return; // не шумим при входе в уже идущую игру
    var mine = view.turn === my.team;
    if (key[0] === 'r' && mine) {
      if (c.ok) { FX.play('correct'); FX.vibrate([30, 40, 30]); FX.confetti({ count: 60, y: innerHeight * 0.4 }); }
      else { FX.play('wrong'); FX.vibrate(200); }
    } else if (key[0] === 'p' && c.effect) {
      var d = c.effect.delta[my.team];
      if (d > 0) { FX.play('good'); FX.vibrate([30, 40, 30]); } else if (d < 0) { FX.play('bad'); FX.vibrate(200); }
    } else if (key[0] === 'e') {
      var rk = E.ranking(view.teams);
      if (rk.filter(function (x) { return x.i === my.team; })[0].place === 1) { FX.play('win'); FX.confetti({ count: 150, rain: true }); }
    } else if (key[0] === 't') { FX.vibrate(60); }
  }
})(window);
