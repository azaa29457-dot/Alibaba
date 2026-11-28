/* © 2026 azaa29457-dot. Все права защищены. Копирование без разрешения автора запрещено (см. LICENSE). */
/* Alibaba — экран игрока на телефоне. */
(function (root) {
  'use strict';
  var FB = root.FB, E = FB.Engine, UI = FB.UI, FX = FB.FX;
  var esc = UI.esc;
  var P = FB.Player = {};
  var ANS_COLORS = ['#6A4DFF', '#008F7A', '#E06A00', '#E0337F'];

  var net = null, code = null, pid = null, view = null, prof = null;
  var status = 'connecting', joinedSent = 0, myVote = null, picking = null;
  var shellBuilt = false, bodyKey = null, raf = 0, recvAt = 0, lastFxKey = null, changingTeam = false, kSent = null;
  var KCOL = ['#E21B3C', '#1368CE', '#D89E00', '#26890C'], SHAPES = ['▲', '◆', '●', '■'];
  // Blooket: mine — личная часть (свой вопрос, свой ход), view — общая (таймер, лидеры)
  var mine = null, meAt = 0, bkPend = null, lastAlert = null, castT = null, lastStKey = null;

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
  P.debugState = function () { return { pid: pid, mine: mine, view: view, pend: bkPend, status: status }; }; // для тестов

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
    mine = null; bkPend = null; lastAlert = null; lastStKey = null; clearTimeout(castT);
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
    if (m.t === 'me') { if (takeMe(m.s) && view) render(); return; }
    if (m.t === 'welcome' || m.t === 'state') {
      var s = m.s;
      if (!s || (!s.teams && s.kind !== 'kahoot' && s.kind !== 'blooket' && s.kind !== 'traitor')) return;
      if (m.me !== undefined) takeMe(m.me);
      if (view && s.id === view.id && s.v < view.v) { if (m.me) render(); return; }
      view = s; recvAt = Date.now();
      if (s.cfg && s.cfg.theme) UI.applyTheme(s.cfg.theme);
      render();
      return;
    }
    if (m.t === 'kicked') {
      if (m.to && m.to !== pid) return; // это про другого игрока
      var kc = code;
      P.stop(true); UI.store.del('alibaba.player');
      simple('kicked', '<h2>Организатор удалил вас из игры</h2><p class="muted">Можно войти снова с новым ником.</p>',
        '<div class="ph-actions"><button class="btn btn-yellow btn-lg" id="againBtn" type="button">Войти снова</button>' +
        '<button class="btn btn-ghost" id="homeBtn" type="button">На главную</button></div>');
      UI.$('#againBtn').addEventListener('click', function () { FX.unlock(); P.start(kc); });
      UI.$('#homeBtn').addEventListener('click', function () { try { history.replaceState(null, '', location.pathname); } catch (e) { } UI.home(); });
      return;
    }
    if (m.t === 'closed') {
      P.stop(true); UI.store.del('alibaba.player');
      simple('closed', '<h2>Организатор закрыл игру</h2><p class="muted">Спасибо за игру!</p>', '<div class="ph-actions"><button class="btn btn-yellow" id="homeBtn" type="button">На главную</button></div>');
      UI.$('#homeBtn').addEventListener('click', function () { try { history.replaceState(null, '', location.pathname); } catch (e) { } UI.home(); });
    }
  }

  function takeMe(x) {
    if (!x || x.id !== pid) return false;
    // старые данные отбрасываем, но если игрок заново вошёл (после удаления), счёт версий начинается сначала
    if (mine && x.jn === mine.jn && x.pv < mine.pv) return false;
    if (bkPend && x.step !== bkPend.step) bkPend = null;
    mine = x; meAt = Date.now();
    return true;
  }
  function me() {
    if (!view) return null;
    for (var i = 0; i < view.players.length; i++) if (view.players[i].id === pid) return view.players[i];
    return null;
  }

  /* ---------- Рендер ---------- */
  function render() {
    if (!view) return;
    if (view.kind === 'kahoot') { renderK(); return; }
    if (view.kind === 'blooket') { renderB(); return; }
    if (view.kind === 'traitor') { renderT(); return; }
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
    var wv = UI.$('#phWinVideo');
    if (wv && !wv.firstChild) UI.winVideo(wv);
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
    if (E.AVATARS.indexOf(prof.av) < 0) prof.av = E.AVATARS[Math.floor(Math.random() * E.AVATARS.length)];
    var isK = view.kind === 'kahoot' || view.kind === 'blooket' || view.kind === 'traitor';
    var teamsHtml = isK ? '<button type="button" class="btn btn-yellow btn-lg k-join" data-team="0">Войти в игру</button>' : view.teams.map(function (t, i) {
      return '<button type="button" class="ph-team-btn" data-team="' + i + '" style="--tc:' + t.color + '">' +
        '<span class="dot"></span><b>' + esc(t.name) + '</b><span class="n">' + t.players + '</span></button>';
    }).join('');
    if (existing) { UI.patch(UI.$('#phTeams'), teamsHtml); return; }
    UI.screen('player',
      '<div class="ph ph-profile"><div class="ph-simple-in">' + UI.wordmark('wordmark-sm') +
        '<p class="ph-game">Игра <b>' + esc(UI.fmtCode(code)) + '</b>: ' + esc(view.title) + '</p>' +
        (started ? '<p class="ph-note">' + (isK ? 'Игра уже идёт — можно присоединиться.' : 'Игра уже идёт — можно присоединиться к команде.') + '</p>' : '') +
        (view.kind === 'traitor' ? '<p class="ph-note bk-pgame"><img src="img/tr/traitor.svg" alt=""><span><b>Предатель</b>Среди вас прячется предатель. Отвечай на вопросы, собирай улики и вычисли его!</span></p>' : '') +
        (view.kind === 'blooket' ? '<p class="ph-note bk-pgame"><img src="img/bk/' + FB.Blooket.GAMES[view.game].img + '.webp" alt=""><span><b>' + esc(FB.Blooket.GAMES[view.game].name) + '</b>' + esc(FB.Blooket.GAMES[view.game].about) + '</span></p>' : '') +
        '<label class="lbl" for="nameInput">Твой ник</label>' +
        '<div class="name-row"><span class="av-cur" id="avCur">' + UI.avImg(prof.av) + '</span>' +
        '<input id="nameInput" maxlength="20" autocomplete="nickname" placeholder="Придумай ник" value="' + esc(prof.name) + '"></div>' +
        '<p class="form-err" id="nameErr" role="alert"></p>' +
        '<p class="lbl">Выбери аватарку</p>' +
        '<div class="av-grid" id="avGrid" role="radiogroup">' + E.AVATARS.map(function (a) {
          var on = a === prof.av;
          return '<button type="button" role="radio" aria-checked="' + on + '" class="av-opt' + (on ? ' on' : '') + '" data-av="' + a + '" aria-label="' + esc(E.AVATAR_NAMES[a]) + '">' + UI.avImg(a) + '</button>';
        }).join('') + '</div>' +
        (isK ? '' : '<p class="lbl">Выбери команду</p>') +
        '<div class="ph-teams" id="phTeams">' + teamsHtml + '</div>' +
      '</div></div>');
    UI.$('#avGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-av]');
      if (!b) return;
      prof.av = b.getAttribute('data-av');
      UI.$$('#avGrid .av-opt').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      UI.$('#avCur').innerHTML = UI.avImg(prof.av);
      FX.unlock(); FX.play('click');
    });
    UI.$('#phTeams').addEventListener('click', function (e) {
      var b = e.target.closest('[data-team]');
      if (!b) return;
      FX.unlock();
      var name = E.cleanName(UI.$('#nameInput').value, 20);
      if (!name) { UI.$('#nameErr').textContent = 'Сначала придумай ник'; UI.$('#nameInput').focus(); return; }
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
    UI.patch(UI.$('#phTeam'), UI.avImg(my.av, 'av ph-av') + '<span><b>' + esc(my.name) + '</b><small>' + esc(t.name) + '</small></span>');
    FX.countTo(UI.$('#phScore'), t.score);
  }

  function timerFrame() {
    raf = requestAnimationFrame(timerFrame);
    var el = UI.$('#phTimer');
    if (!el) return;
    if (view && view.kind === 'blooket') { bTimer(el); return; }
    if (view && view.kind === 'traitor') { tTimer(el); return; }
    var c = view && (view.kind === 'kahoot' ? view.q : view.cur);
    var on = view && (view.phase === 'question' || (view.kind === 'kahoot' && view.phase === 'q')) && c && c.remain != null && c.total;
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
        '<div class="ph-big-av">' + UI.avImg(my.av, 'big-av') + '</div>' +
        '<h2 class="ph-h">Ты в команде <span style="color:' + view.teams[my.team].color + '">' + esc(view.teams[my.team].name) + '</span></h2>' +
        '<p class="muted">Ждём, пока организатор начнёт игру. Смотри на большой экран!</p>' +
        '<div class="ph-mates">' + mates.map(function (p) { return '<span class="chip' + (p.on ? '' : ' off') + '">' + UI.avImg(p.av) + esc(p.name) + '</span>'; }).join('') + '</div>' +
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
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/trophy.webp" alt=""><div class="win-video ph-win-video" id="phWinVideo"></div></div>' :
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/' + (mineR.place <= 3 ? 'medal' + mineR.place : 'clap') + '.webp" alt=""></div>';
      return '<div class="ph-end">' + art + '<h2 class="ph-h">' + title + '</h2>' + scoreboard() +
        '<p class="muted center">Организатор может начать новую игру — не закрывай страницу.</p>' +
        '<button type="button" class="btn btn-ghost" data-leave="1">Выйти</button></div>';
    }
    return '<p class="muted">Ждём…</p>';
  }

  function onMainClick(e) {
    var t;
    if (view && view.kind === 'blooket') { onBClick(e); return; }
    if (view && view.kind === 'traitor') { onTClick(e); return; }
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

  /* ================= Режим «каждый за себя» ================= */
  function renderK() {
    var my = me();
    if (!my) {
      if (joinedSent && Date.now() - joinedSent < 5000) return;
      profileScreen();
      return;
    }
    prof.team = 0;
    saveSession();
    buildShell();
    var shell = UI.$('.ph-game-shell');
    shell.style.setProperty('--tc', '#FFD23F');
    UI.patch(UI.$('#phTeam'), UI.avImg(my.av, 'av ph-av') + '<span><b>' + esc(my.name) + '</b><small>' + (view.phase !== 'lobby' ? my.place + '-е место' : 'в игре') + '</small></span>');
    FX.countTo(UI.$('#phScore'), my.score);
    var key = 'k:' + view.phase + ':' + view.qi;
    var main = UI.$('#phMain');
    if (key !== bodyKey) { bodyKey = key; main.className = 'ph-main k-' + view.phase; main.innerHTML = ''; main._html = null; }
    var res = view.phase === 'res' && my.last;
    shell.classList.toggle('k-good', !!(res && my.last.ok));
    shell.classList.toggle('k-bad', !!(view.phase === 'res' && !(my.last && my.last.ok)));
    UI.patch(main, kBody(my));
    var wv = UI.$('#phWinVideo');
    if (wv && !wv.firstChild) UI.winVideo(wv);
    kFx(my);
  }
  function kBody(my) {
    var ph = view.phase, q = view.q;
    if (ph === 'lobby') {
      return '<div class="ph-wait"><div class="ph-big-av">' + UI.avImg(my.av, 'big-av') + '</div>' +
        '<h2 class="ph-h">Ты в игре!</h2><p class="muted">Найди свой ник на большом экране. Игра скоро начнётся.</p></div>';
    }
    if (ph === 'get') {
      return '<div class="k-get"><p class="k-qn">Вопрос ' + (view.qi + 1) + ' из ' + view.total + '</p><h2 class="ph-q">' + esc(q.text) + '</h2><p class="k-ready">Приготовься!</p></div>';
    }
    if (ph === 'q') {
      if (my.answered || kSent === view.qi) {
        return '<div class="k-wait"><div class="spinner" aria-hidden="true"></div><h2 class="ph-h">Ответ принят!</h2><p class="muted">Ждём остальных…</p></div>';
      }
      return '<h2 class="ph-q k-q">' + esc(q.text) + '</h2><div class="k-grid">' + q.opts.map(function (o, i) {
        return '<button type="button" class="k-btn" data-kopt="' + i + '" style="--kc:' + KCOL[i] + '"><span class="kh-shape">' + SHAPES[i] + '</span><span>' + esc(o) + '</span></button>';
      }).join('') + '</div>';
    }
    if (ph === 'res') {
      var L = my.last, out;
      if (L && L.ok) out = '<div class="k-res"><div class="k-res-ico">✓</div><h2>Верно!</h2><p class="k-pts">+' + L.pts + '</p>' + (my.streak >= 2 ? '<p class="k-streak">🔥 Серия ' + my.streak + '</p>' : '') + '</div>';
      else out = '<div class="k-res"><div class="k-res-ico">✗</div><h2>' + (L && L.opt != null ? 'Неверно' : 'Время вышло') + '</h2><p class="k-right">Правильно: ' + esc(q.opts[q.correct]) + '</p></div>';
      return out + '<p class="k-place">Ты на ' + my.place + '-м месте</p>';
    }
    if (ph === 'board') {
      var above = null;
      view.players.forEach(function (p) { if (p.place === my.place - 1) above = p; });
      return '<div class="k-res plain"><div class="ph-big-av">' + UI.avImg(my.av, 'big-av') + '</div><h2>' + my.place + '-е место</h2><p class="k-pts">' + my.score + ' очков</p>' +
        (above ? '<p class="muted">До ' + esc(above.name) + ' — ' + (above.score - my.score) + ' очков</p>' : (my.place === 1 ? '<p class="muted">Ты лидер! Так держать!</p>' : '')) + '</div>';
    }
    if (ph === 'end') {
      var top = my.place <= 3;
      return '<div class="ph-end">' + (my.place === 1 ? '<div class="ph-win"><img class="ph-trophy" src="img/ui/trophy.webp" alt=""><div class="win-video ph-win-video" id="phWinVideo"></div></div>' :
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/' + (top ? 'medal' + my.place : 'clap') + '.webp" alt=""></div>') +
        '<h2 class="ph-h">' + (my.place === 1 ? 'Ты победил!' : 'Ты на ' + my.place + '-м месте') + '</h2><p class="k-pts center">' + my.score + ' очков</p>' +
        '<p class="muted center">Организатор может начать новую игру — не закрывай страницу.</p>' +
        '<button type="button" class="btn btn-ghost" data-leave="1">Выйти</button></div>';
    }
    return '';
  }
  function kFx(my) {
    var key = null;
    if (view.phase === 'res') key = 'r' + view.qi;
    else if (view.phase === 'end') key = 'e' + view.id;
    else if (view.phase === 'q') key = 'q' + view.qi;
    if (!key || key === lastFxKey) return;
    var first = lastFxKey === null;
    lastFxKey = key;
    if (first) return;
    if (key[0] === 'r') {
      if (my.last && my.last.ok) { FX.play('correct'); FX.vibrate([30, 40, 30]); FX.confetti({ count: 60, y: innerHeight * 0.35 }); }
      else { FX.play('wrong'); FX.vibrate(200); }
    } else if (key[0] === 'e' && my.place === 1) { FX.play('win'); FX.confetti({ count: 150, rain: true }); }
    else if (key[0] === 'q') FX.vibrate(40);
  }
  /* ================= Режим Blooket ================= */
  var BCOL = { gold: '#FFC83D', hack: '#2BE27A', fish: '#38B6FF' };
  var castStep = null;
  function bImg(name, cls) { return '<img class="' + (cls || 'bk-img') + '" src="img/bk/' + name + '.webp" alt="" draggable="false">'; }
  function bUnit() { return view.game === 'hack' ? 'крипты' : (view.game === 'fish' ? 'кг' : 'золота'); }
  function chestSvg(i) {
    var id = 'chc' + i;
    return '<svg viewBox="0 0 120 100" aria-hidden="true"><defs><clipPath id="' + id + '"><path d="M8 94V34Q8 8 60 8Q112 8 112 34V94Z"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')"><rect x="0" y="0" width="120" height="100" fill="#A9611F"/><path d="M8 46V34Q8 8 60 8Q112 8 112 34V46Z" fill="#C4782F"/>' +
      '<rect x="0" y="44" width="120" height="7" fill="#7A4317"/><rect x="22" y="0" width="12" height="100" fill="#F2B632"/><rect x="86" y="0" width="12" height="100" fill="#F2B632"/>' +
      '<rect x="0" y="88" width="120" height="6" fill="#7A4317"/></g>' +
      '<rect x="47" y="36" width="26" height="28" rx="6" fill="#FFD23F" stroke="#B88600" stroke-width="3"/><circle cx="60" cy="47" r="4" fill="#7A4317"/><rect x="58" y="49" width="4" height="8" fill="#7A4317"/></svg>';
  }
  function serverSvg() {
    return '<svg viewBox="0 0 120 100" aria-hidden="true"><rect x="14" y="6" width="92" height="88" rx="10" fill="#14213D"/><rect x="22" y="14" width="76" height="22" rx="4" fill="#0B1427"/>' +
      '<rect x="22" y="42" width="76" height="22" rx="4" fill="#0B1427"/><rect x="22" y="70" width="76" height="16" rx="4" fill="#0B1427"/>' +
      '<circle cx="32" cy="25" r="4" fill="#2BE27A"/><circle cx="32" cy="53" r="4" fill="#2BE27A"/><circle cx="32" cy="78" r="3.5" fill="#FFC83D"/>' +
      '<text x="68" y="62" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="900" font-size="44" fill="#2BE27A">?</text></svg>';
  }
  function renderB() {
    // организатор удалил игрока, а сообщение об этом не дошло: игрока нет в общем списке — показываем вход заново
    if (mine && !(joinedSent && Date.now() - joinedSent < 5000) &&
        !view.players.some(function (x) { return x.id === pid; })) { mine = null; bkPend = null; }
    if (!mine) {
      if (joinedSent && Date.now() - joinedSent < 5000) return;
      profileScreen();
      return;
    }
    prof.name = mine.name; prof.av = mine.av; prof.team = 0;
    saveSession();
    buildShell();
    var shell = UI.$('.ph-game-shell');
    shell.style.setProperty('--tc', BCOL[view.game]);
    shell.setAttribute('data-game', view.game);
    UI.patch(UI.$('#phTeam'), UI.avImg(mine.av, 'av ph-av') + '<span><b>' + esc(mine.name) + '</b><small>' + (view.phase === 'lobby' || mine.st === 'wait' ? 'в игре' : mine.place + '-е место из ' + mine.of) + '</small></span>');
    var sc = UI.$('#phScore');
    sc.classList.add('bk-score');
    FX.countTo(sc, mine.score);
    var key = 'b:' + view.phase + ':' + mine.st + ':' + mine.step;
    var main = UI.$('#phMain');
    var same = key === bodyKey;
    if (!same) { bodyKey = key; main.className = 'ph-main bk-ph b-' + mine.st; main.innerHTML = ''; main._html = null; }
    shell.classList.toggle('k-bad', view.phase === 'play' && mine.st === 'wrong');
    shell.classList.remove('k-good');
    // пока ход отправлен и ответа ещё нет, экран не перерисовываем: на нём уже видно, что выбрал игрок
    if (!(same && bkPend && bkPend.step === mine.step)) UI.patch(main, bBody());
    var wv = UI.$('#phWinVideo');
    if (wv && !wv.firstChild) UI.winVideo(wv);
    bFx();
  }
  function nextBtn(dis) { return '<button type="button" class="btn btn-yellow btn-lg bk-next" data-bnext="1"' + dis + '>Дальше</button>'; }
  function frenzyOn() { return view.frenzy && view.frenzy - (Date.now() - recvAt) > 0; }
  function bBody() {
    var G = FB.Blooket.GAMES[view.game], st = mine.st;
    var dis = bkPend && bkPend.step === mine.step ? ' disabled' : '';
    if (view.phase === 'end') {
      var pl = mine.place, top3 = pl <= 3;
      return '<div class="ph-end">' + (pl === 1 ? '<div class="ph-win"><img class="ph-trophy" src="img/ui/trophy.webp" alt=""><div class="win-video ph-win-video" id="phWinVideo"></div></div>' :
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/' + (top3 ? 'medal' + pl : 'clap') + '.webp" alt=""></div>') +
        '<h2 class="ph-h">' + (pl === 1 ? 'Первое место!' : 'Ты на ' + pl + '-м месте') + '</h2>' +
        '<p class="k-pts center">' + mine.score + ' ' + bUnit() + '</p>' +
        '<p class="muted center">Верных ответов: ' + mine.right + ' из ' + (mine.right + mine.wrong) + '</p>' +
        '<p class="muted center">Организатор может начать новую игру — не закрывай страницу.</p>' +
        '<button type="button" class="btn btn-ghost" data-leave="1">Выйти</button></div>';
    }
    if (view.phase === 'lobby' || st === 'wait') {
      return '<div class="ph-wait"><div class="ph-big-av">' + UI.avImg(mine.av, 'big-av') + '</div><h2 class="ph-h">Ты в игре!</h2>' +
        '<div class="bk-rules">' + bImg(G.img) + '<p><b>' + esc(G.name) + '</b>' + esc(G.about) + '</p></div>' +
        '<p class="muted">Найди свой ник на большом экране. Игра скоро начнётся.</p></div>';
    }
    var top = repassHtml();
    switch (st) {
      case 'pass':
        return '<div class="bk-center">' + bImg('lock', 'bk-hero') + '<h2 class="ph-h">Выбери пароль</h2>' +
          '<p class="muted center">Соперники будут угадывать его, чтобы украсть твою крипту. Никому не показывай!</p>' +
          '<div class="bk-opts">' + mine.passOpts.map(function (w) {
            return '<button type="button" class="bk-opt" data-bpass="' + esc(w) + '"' + dis + '>' + bImg('key', 'bk-oi') + '<span>' + esc(w) + '</span></button>';
          }).join('') + '</div></div>';
      case 'q':
        return top + (view.game === 'hack' && mine.pass ? '<p class="bk-mypass">' + bImg('key', 'bk-oi') + 'Твой пароль: <b>' + esc(mine.pass) + '</b></p>' : '') +
          '<p class="bk-topic">' + esc(mine.q.topic) + '</p><h2 class="ph-q k-q">' + esc(mine.q.text) + '</h2><div class="k-grid">' + mine.q.opts.map(function (o, i) {
            return '<button type="button" class="k-btn" data-bopt="' + i + '" style="--kc:' + KCOL[i] + '"' + dis + '><span class="kh-shape">' + SHAPES[i] + '</span><span>' + esc(o) + '</span></button>';
          }).join('') + '</div>';
      case 'wrong': {
        var wl = Math.max(1, Math.ceil(waitLeft() / 1000));
        return '<div class="k-res"><div class="k-res-ico">✗</div><h2>Неверно</h2><p class="k-right">Правильно: ' + esc(mine.q.opts[mine.q.correct]) + '</p></div>' +
          '<div class="bk-wait" aria-live="off"><div class="bk-wait-ring" id="bkWaitRing" style="--p:' + (waitLeft() / (mine.waitTotal || 3000)).toFixed(3) + '"><b id="bkWaitN">' + wl + '</b></div>' +
          '<p>Следующий вопрос через несколько секунд</p></div>';
      }
      case 'chest':
        return top + '<div class="bk-center"><div class="k-res-ico bk-ok">✓</div><h2 class="ph-h">' + (view.game === 'hack' ? 'Верно! Выбери сервер' : 'Верно! Выбери сундук') + '</h2></div>' +
          '<div class="bk-chests">' + [0, 1, 2].map(function (i) {
            return '<button type="button" class="bk-chest" data-bpick="' + i + '" style="--i:' + i + '"' + dis + ' aria-label="' + (view.game === 'hack' ? 'Сервер ' : 'Сундук ') + (i + 1) + '">' +
              (view.game === 'hack' ? serverSvg() : chestSvg(i)) + '</button>';
          }).join('') + '</div>';
      case 'reveal': return top + revealHtml() + nextBtn(dis);
      case 'target': {
        var a = mine.ask || {};
        var title = a.k === 'steal' ? 'У кого украсть ' + a.n + '%?' : (a.k === 'swap' ? 'С кем поменяться золотом?' : 'Кого взломать?');
        return '<h2 class="ph-h bk-th">' + bImg(a.k === 'steal' ? 'ninja' : (a.k === 'swap' ? 'swap' : 'unlock'), 'bk-oi') + esc(title) + '</h2>' +
          '<div class="bk-targets">' + (mine.targets || []).map(function (t) {
            return '<button type="button" class="bk-target" data-btarget="' + esc(t.id) + '"' + dis + '>' + UI.avImg(t.av) + '<b>' + esc(t.name) + '</b><span>' + t.score + '</span></button>';
          }).join('') + '</div>';
      }
      case 'guess': {
        var g = mine.guess;
        return '<div class="bk-center">' + bImg('coder', 'bk-hero') + '<h2 class="ph-h">Угадай пароль</h2>' +
          '<p class="bk-who">' + (g.av ? UI.avImg(g.av) : '') + '<b>' + esc(g.name) + '</b></p><p class="muted center">Один из этих паролей — настоящий.</p>' +
          '<div class="bk-opts">' + g.opts.map(function (w) {
            return '<button type="button" class="bk-opt" data-bword="' + esc(w) + '"' + dis + '>' + bImg('key', 'bk-oi') + '<span>' + esc(w) + '</span></button>';
          }).join('') + '</div></div>';
      }
      case 'cast': {
        var fz = frenzyOn() ? '<p class="bk-fz">' + bImg('frenzy', 'bk-oi') + '<b>Клёв!</b> Сейчас улов ×2</p>' : '';
        if (castStep === mine.step) return fz + '<div class="bk-cast waiting">' + bImg('rod', 'bk-hero swing') + '<div class="bk-water"><i class="bk-bob"></i></div><h2 class="ph-h">Ждём поклёвку…</h2></div>';
        return fz + '<div class="bk-cast"><div class="k-res-ico bk-ok">✓</div><h2 class="ph-h">Верно!</h2>' + bImg('rod', 'bk-hero') +
          '<button type="button" class="btn btn-yellow btn-lg bk-castbtn" data-bcast="1"' + dis + '>Закинуть удочку</button>' + lureHtml() + '</div>';
      }
      case 'catch': return catchHtml() + nextBtn(dis);
    }
    return '<p class="muted">Ждём…</p>';
  }
  function waitLeft() { return mine && mine.wait != null ? Math.max(0, mine.wait - (Date.now() - meAt)) : 0; }
  function lureHtml() {
    var L = mine.lure | 0, w = '';
    for (var i = 0; i <= FB.Blooket.LURE_MAX; i++) w += '<i class="' + (i <= L ? 'on' : '') + '"></i>';
    return '<p class="bk-lure"><span>Наживка: уровень ' + (L + 1) + ' из ' + (FB.Blooket.LURE_MAX + 1) + '</span><span class="bk-lv" aria-hidden="true">' + w + '</span></p>';
  }
  function repassHtml() {
    if (view.game !== 'hack' || !mine.repass || mine.st === 'pass') return '';
    return '<div class="bk-repass"><p>' + bImg('lock', 'bk-oi') + '<span><b>Тебя взломали!</b> Выбери новый пароль:</span></p><div class="bk-opts row">' + mine.repass.map(function (w) {
      return '<button type="button" class="bk-opt sm" data-brepass="' + esc(w) + '">' + esc(w) + '</button>';
    }).join('') + '</div></div>';
  }
  function revealHtml() {
    var r = mine.res || {}, b = mine.box, out = '', unit = bUnit(), nm = r.who ? r.who.name : '';
    if (b && r.k !== 'hackok' && r.k !== 'hackfail') {
      out += '<div class="bk-open">' + b.items.map(function (it, i) {
        return '<div class="bk-prize' + (i === b.pick ? ' on' : '') + '">' + bImg(it.img) + '<b>' + esc(it.t) + '</b><small>' + esc(it.s) + '</small></div>';
      }).join('') + '</div>';
    }
    var head = '', sub = '', mood = r.delta > 0 ? 'good' : (r.delta < 0 ? 'bad' : '');
    switch (r.k) {
      case 'add': head = '+' + r.delta + ' ' + unit; break;
      case 'pct': case 'mul':
        if (r.delta > 0) head = '+' + r.delta + ' ' + unit;
        else { head = 'Пока нечего умножать'; sub = 'Сначала заработай немного ' + unit; }
        break;
      case 'lose': head = r.delta < 0 ? '−' + (-r.delta) + ' ' + unit : 'Нечего терять!'; if (view.game === 'hack' && r.delta < 0) sub = 'Вирус съел часть крипты'; break;
      case 'none': head = view.game === 'hack' ? 'Сбой системы' : 'Пусто'; sub = 'Повезёт в следующий раз'; break;
      case 'steal':
        if (r.delta > 0) { head = '+' + r.delta + ' ' + unit; sub = 'Ты крадёшь ' + r.n + '% у игрока ' + nm; mood = 'good'; }
        else { head = 'Красть нечего'; sub = 'У игрока ' + nm + ' пока нет золота'; }
        break;
      case 'swap': head = 'Обмен с игроком ' + nm; sub = (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta) + ' ' + unit; break;
      case 'hackok': out += bImg('unlock', 'bk-hero'); head = 'Взлом удался!';
        sub = r.delta > 0 ? '+' + r.delta + ' крипты у игрока ' + nm + ' (пароль «' + r.word + '»)' : 'Но у игрока ' + nm + ' пока нет крипты. Пароль — «' + r.word + '»';
        mood = 'good'; break;
      case 'hackfail': out += bImg('lock', 'bk-hero'); head = 'Пароль не подошёл'; sub = 'Игрок ' + nm + ' узнает о попытке взлома'; mood = 'bad'; break;
      case 'alone': head = 'Соперников пока нет'; sub = 'Этот приз сработает, когда в игре будут другие игроки'; break;
    }
    return out + '<div class="bk-result ' + mood + '"><h2>' + esc(head) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function catchHtml() {
    var r = mine.res || {}, f = FB.Blooket.FISH_BY[r.id] || FB.Blooket.FISH_BY.boot;
    if (f.special === 'lure') return '<div class="bk-catch">' + bImg('worm', 'bk-fish') + '<h2>Наживка!</h2><p class="bk-csub">Теперь уровень ' + (r.lure + 1) + ' — крупная рыба клюёт чаще</p></div>';
    if (f.special === 'frenzy') return '<div class="bk-catch">' + bImg('frenzy', 'bk-fish') + '<h2>Клёв!</h2><p class="bk-csub">20 секунд все ловят вдвое больше</p></div>';
    return '<div class="bk-catch t' + f.tier + '"><span class="bk-ray" aria-hidden="true"></span>' + bImg(f.id, 'bk-fish') + '<p class="bk-tier">' + FB.Blooket.TIERS[f.tier] + '</p><h2>' + esc(f.name) + '</h2>' +
      '<p class="k-pts">+' + (r.kg || 0) + ' кг' + (r.x2 ? ' <span class="bk-x2">×2</span>' : '') + '</p></div>';
  }
  function bk(a, extra, nostep) {
    if (!net || !mine) return;
    var msg = { t: 'bk', a: a };
    Object.keys(extra || {}).forEach(function (k) { msg[k] = extra[k]; });
    if (!nostep) { msg.step = mine.step; bkPend = { step: mine.step, msg: JSON.parse(JSON.stringify(msg)), t: Date.now(), tries: 1 }; }
    net.send(msg);
    FX.unlock(); FX.vibrate(15);
  }
  /* Сразу показываем выбор: нажатая кнопка выделяется (сундук трясётся и открывается), остальные гаснут */
  function chosen(t, sel) {
    var main = UI.$('#phMain');
    UI.$$(sel, main).forEach(function (b) { b.disabled = true; if (b !== t) b.classList.add('dim'); });
    t.classList.add('chosen');
  }
  function onBClick(e) {
    var t = e.target.closest('button');
    if (!t || t.disabled || !mine) return;
    if (t.hasAttribute('data-leave')) { leave(); return; }
    if (t.hasAttribute('data-brepass')) { chosen(t, '[data-brepass]'); bk('setpass', { word: t.getAttribute('data-brepass') }, true); return; }
    if (bkPend && bkPend.step === mine.step) return;
    if (t.hasAttribute('data-bopt')) { chosen(t, '[data-bopt]'); bk('answer', { opt: Number(t.getAttribute('data-bopt')) }); }
    else if (t.hasAttribute('data-bpass')) { chosen(t, '[data-bpass]'); bk('setpass', { word: t.getAttribute('data-bpass') }); }
    else if (t.hasAttribute('data-bpick')) { chosen(t, '[data-bpick]'); FX.play('open'); bk('pick', { i: Number(t.getAttribute('data-bpick')) }); }
    else if (t.hasAttribute('data-btarget')) { chosen(t, '[data-btarget]'); bk('target', { target: t.getAttribute('data-btarget') }); }
    else if (t.hasAttribute('data-bword')) { chosen(t, '[data-bword]'); bk('guess', { word: t.getAttribute('data-bword') }); }
    else if (t.hasAttribute('data-bnext')) { chosen(t, '[data-bnext]'); bk('next', {}); }
    else if (t.hasAttribute('data-bcast')) {
      var stepNow = mine.step;
      castStep = stepNow;
      FX.unlock(); FX.play('click'); FX.vibrate(20);
      renderB();
      clearTimeout(castT);
      castT = setTimeout(function () { if (mine && mine.st === 'cast' && mine.step === stepNow) bk('cast', {}); }, 1100);
    }
  }
  /* Полоска времени игры сверху и повторная отправка хода, если ответ от организатора не пришёл */
  function bTimer(el) {
    var on = view.phase === 'play' && view.left != null && view.total;
    el.hidden = !on;
    if (on) {
      var remain = Math.max(0, view.left - (Date.now() - recvAt));
      el.firstChild.style.transform = 'scaleX(' + (remain / view.total).toFixed(4) + ')';
      el.classList.toggle('low', remain <= 10000);
    }
    if (mine && mine.st === 'wrong') {
      var ring = document.getElementById('bkWaitRing'), nEl = document.getElementById('bkWaitN');
      if (ring) {
        var left = waitLeft();
        ring.style.setProperty('--p', (left / (mine.waitTotal || 3000)).toFixed(3));
        var t = String(Math.max(1, Math.ceil(left / 1000)));
        if (nEl.textContent !== t) nEl.textContent = t;
      }
    }
    resendPending(renderB);
  }
  function resendPending(rerender) {
    if (bkPend && mine && net) {
      if (mine.step !== bkPend.step) bkPend = null;
      else if (Date.now() - bkPend.t > 2500) {
        if (bkPend.tries < 4) { bkPend.t = Date.now(); bkPend.tries++; net.send(JSON.parse(JSON.stringify(bkPend.msg))); }
        else { bkPend = null; bodyKey = null; net.send({ t: 'sync' }); rerender(); }
      }
    }
  }
  function showAlert(a) {
    var old = document.querySelector('.bk-alert');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'bk-alert ' + (a.mood < 0 ? 'bad' : 'good');
    el.setAttribute('role', 'alert');
    el.textContent = a.txt;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 400); }, 4200);
    if (a.mood < 0) { FX.play('bad'); FX.vibrate([80, 60, 160]); } else { FX.play('neutral'); FX.vibrate(40); }
  }
  function bFx() {
    var al = mine.alerts || [], last = al.length ? al[al.length - 1].n : 0;
    if (lastAlert === null) lastAlert = last;
    else if (last > lastAlert) { lastAlert = last; showAlert(al[al.length - 1]); }
    var key = view.phase === 'end' ? 'end:' + view.id : mine.st + ':' + mine.step;
    if (key === lastStKey) return;
    var first = lastStKey === null;
    lastStKey = key;
    if (first) return;
    var r = mine.res || {};
    if (view.phase === 'end') { if (mine.place === 1) { FX.play('win'); FX.confetti({ count: 150, rain: true }); } return; }
    switch (mine.st) {
      case 'wrong': FX.play('wrong'); FX.vibrate(200); break;
      case 'chest': case 'cast': FX.play('correct'); FX.vibrate([30, 40, 30]); break;
      case 'reveal':
        if (r.delta > 0 || r.k === 'hackok') { FX.play('good'); FX.confetti({ count: 50, y: innerHeight * 0.35 }); }
        else if (r.delta < 0 || r.k === 'hackfail') FX.play('bad');
        else FX.play('neutral');
        break;
      case 'catch': {
        var f = FB.Blooket.FISH_BY[r.id] || {};
        if (f.special || f.tier >= 3) { FX.play('good'); FX.confetti({ count: f.tier >= 4 ? 120 : 60, y: innerHeight * 0.35 }); }
        else if (f.tier === 0) FX.play('neutral');
        else FX.play('bonus');
        break;
      }
      case 'q': castStep = null; break;
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-kopt]');
    if (!b || !view || view.kind !== 'kahoot' || view.phase !== 'q' || !net) return;
    kSent = view.qi;
    net.send({ t: 'answer', opt: Number(b.getAttribute('data-kopt')) });
    FX.vibrate(20);
    renderK();
  });
  /* ================= Режим «Предатель» ================= */
  var roleShow = false, roleT = null, cluesOpen = false, tPick = null, trLastPh = null;
  function trImg(name, cls) { return '<img class="' + (cls || 'tr-i') + '" src="img/tr/' + name + '.svg" alt="" draggable="false">'; }
  function roleOf(r) { return FB.Traitor.ROLES[r] || { name: '', img: 'civ', about: '' }; }
  var T_LBL = { roles: 'Роли', day: 'День', night: 'Ночь', morning: 'Утро', vote: 'Голосование', verdict: 'Голосование', end: 'Итоги' };
  function renderT() {
    if (mine && !(joinedSent && Date.now() - joinedSent < 5000) &&
        !view.players.some(function (x) { return x.id === pid; })) { mine = null; bkPend = null; }
    if (!mine) {
      if (joinedSent && Date.now() - joinedSent < 5000) return;
      profileScreen();
      return;
    }
    prof.name = mine.name; prof.av = mine.av; prof.team = 0;
    saveSession();
    buildShell();
    var shell = UI.$('.ph-game-shell'), ph = mine.ph;
    if (trLastPh !== ph + mine.day) { trLastPh = ph + mine.day; roleShow = ph === 'roles' ? roleShow : false; tPick = null; cluesOpen = false; }
    shell.style.setProperty('--tc', '#FFD23F');
    shell.setAttribute('data-tr', ph);
    shell.classList.toggle('tr-dead', !mine.alive && ph !== 'lobby');
    UI.patch(UI.$('#phTeam'), UI.avImg(mine.av, 'av ph-av') + '<span><b>' + esc(mine.name) + '</b><small>' +
      (ph === 'lobby' ? 'в игре' : (!mine.alive && ph !== 'end' ? 'призрак' : (T_LBL[ph] || '') + (mine.day && (ph === 'day' || ph === 'night') ? ' ' + mine.day : ''))) + '</small></span>');
    var sc = UI.$('#phScore');
    sc.classList.add('tr-score');
    FX.countTo(sc, mine.coins);
    var key = 't:' + ph + ':' + mine.day + ':' + mine.st + ':' + mine.step + ':' + (mine.alive ? 1 : 0);
    var main = UI.$('#phMain');
    var same = key === bodyKey;
    if (!same) { bodyKey = key; main.className = 'ph-main bk-ph tr-ph t-' + ph + ' ts-' + mine.st; main.innerHTML = ''; main._html = null; }
    shell.classList.toggle('k-good', ph === 'day' && mine.st === 'res' && !!(mine.res && mine.res.ok));
    shell.classList.toggle('k-bad', ph === 'day' && mine.st === 'res' && !!(mine.res && !mine.res.ok));
    if (!(same && bkPend && bkPend.step === mine.step)) UI.patch(main, tBody());
    var wv = UI.$('#phWinVideo');
    if (wv && !wv.firstChild) UI.winVideo(wv);
    tFx();
  }
  function roleBar() {
    if (!mine.role) return '';
    var r = roleOf(mine.role), n = mine.clues.length;
    return '<div class="tr-bar">' +
      '<button type="button" class="tr-rolebtn' + (roleShow ? ' on' : '') + '" data-trole="1">' +
        (roleShow ? trImg(r.img, 'tr-rbi') + '<span>' + esc(r.name) + '</span>' : '<span class="tr-eye">👁</span><span>Моя роль</span>') + '</button>' +
      (n ? '<button type="button" class="tr-cluebtn' + (cluesOpen ? ' on' : '') + '" data-tclues="1">' + trImg('clue', 'tr-rbi') + '<span>Улики: ' + n + '</span></button>' : '') +
    '</div>' + (cluesOpen && n ? '<ul class="tr-clues">' + mine.clues.map(clueLi).join('') + '</ul>' : '');
  }
  function clueLi(c) {
    return '<li>' + UI.avImg(c.av) + '<span><b>' + esc(c.name) + '</b> — ' + (c.k === 'civ' ? 'обычный мирный житель (не медик и не шериф)' : 'точно не предатель') + '</span></li>';
  }
  function roleCard() {
    var r = roleOf(mine.role);
    if (!roleShow) {
      return '<button type="button" class="tr-card hidden" data-trole="1"><span class="tr-card-q">?</span><b>Нажми, чтобы увидеть свою роль</b><small>Закрой экран рукой — никто не должен видеть!</small></button>';
    }
    return '<button type="button" class="tr-card r-' + mine.role + '" data-trole="1">' + trImg(r.img, 'tr-card-i') + '<b>' + esc(r.name) + '</b><span>' + esc(r.about) + '</span>' +
      (mine.mates && mine.mates.length ? '<span class="tr-mates">Твой напарник: ' + mine.mates.map(function (m) { return UI.avImg(m.av) + '<b>' + esc(m.name) + '</b>'; }).join(', ') + '</span>' : '') +
      '<small>Нажми ещё раз, чтобы спрятать</small></button>';
  }
  function ghostHtml(txt) {
    return '<div class="tr-ghost">' + trImg('ghost', 'tr-ghost-i') + '<h2 class="ph-h">Ты призрак</h2><p>' + esc(txt) + '</p>' +
      '<p class="muted">Твоя роль: <b>' + esc(roleOf(mine.role).name) + '</b></p></div>';
  }
  function newsHtml(list) {
    return '<ul class="tr-pnews">' + (list || []).map(function (n) {
      var r = n.role ? roleOf(n.role) : null, t = '', img = 'sleep';
      switch (n.k) {
        case 'out': img = 'traitor'; t = 'Жертва предателя этой ночью: <b>' + esc(n.p.name) + '</b>. Роль: ' + esc(r.name.toLowerCase()) + '.'; break;
        case 'saved': img = 'saved'; t = 'Предатель напал, но медик спас: <b>' + esc(n.p.name) + '</b> остаётся в игре!'; break;
        case 'clean': img = 'clean'; t = 'Проверка шерифа: <b>' + esc(n.p.name) + '</b> — не предатель.'; break;
        case 'shot': img = 'sheriff'; t = 'Шериф вычислил предателя: <b>' + esc(n.p.name) + '</b>!'; break;
        default: t = 'Ночь прошла спокойно.';
      }
      return '<li class="n-' + n.k + '">' + trImg(img, 'tr-pni') + '<span>' + t + '</span></li>';
    }).join('') + '</ul>';
  }
  function winHtml() {
    if (!mine.winner) return '';
    var town = mine.winner === 'town';
    return '<div class="tr-pwin ' + (town ? 'good' : 'bad') + '">' + trImg(town ? 'civ' : 'traitor', 'tr-pni') + '<b>' + (town ? 'Мирные жители победили!' : 'Предатель победил!') + '</b><span>Смотри итоги на большом экране</span></div>';
  }
  var PICK_T = {
    kill: ['Кого выбить этой ночью?', 'Выбери жертву. Утром все узнают, кто выбыл.'],
    heal: ['Кого вылечить этой ночью?', 'Если предатель нападёт именно на него — он останется в игре. Можно себя. Одного и того же — не две ночи подряд.'],
    check: ['Кого проверить?', 'Если это предатель — он выбывает. Если нет — утром все узнают, что он не предатель.'],
    suspect: ['Кого ты подозреваешь?', 'Пока город спит, отметь подозреваемого — так никто не поймёт, у кого какая роль.'],
    vote: ['Кого выгнать?', 'Больше всех голосов — выбывает. Можно пропустить.']
  };
  function pickHtml() {
    var mode = mine.mode, t = PICK_T[mode] || PICK_T.suspect;
    var cur = tPick && tPick.ph === mine.ph ? tPick.id : mine.pick;
    var list = (mine.targets || []).map(function (o) {
      var on = cur === o.id;
      return '<button type="button" class="tr-pick' + (on ? ' on' : '') + '" data-tpick="' + esc(o.id) + '"' + (o.ok ? '' : ' disabled') + '>' +
        UI.avImg(o.av) + '<b>' + esc(o.name) + '</b>' +
        (o.mate ? '<small>напарник</small>' : (o.me ? '<small>это ты</small>' : (!o.ok ? '<small>' + (mode === 'heal' ? 'лечил прошлой ночью' : 'уже проверен') + '</small>' : ''))) +
        (on ? '<span class="tr-tick">✓</span>' : '') + '</button>';
    }).join('');
    if (mode === 'vote') list += '<button type="button" class="tr-pick skip' + (cur === 'skip' ? ' on' : '') + '" data-tpick="skip"><span class="tr-skipi">⏭</span><b>Пропустить</b>' + (cur === 'skip' ? '<span class="tr-tick">✓</span>' : '') + '</button>';
    var mates = mode === 'kill' && mine.mates && mine.mates.length ? '<p class="tr-note">Цель у вас с напарником общая: ' + mine.mates.map(function (m) { return esc(m.name); }).join(', ') + ' видит твой выбор.</p>' : '';
    return '<h2 class="ph-h">' + t[0] + '</h2><p class="tr-note">' + t[1] + '</p>' + mates +
      '<div class="tr-picks">' + list + '</div>' +
      (cur ? '<p class="tr-ok">Выбор принят. Можно поменять, пока время не вышло.</p>' : '');
  }
  function boardHtml() {
    var left = mine.perDay - mine.dayN, b = mine.board || [], d = mine.d || [];
    var full = left <= 0;
    var clue = mine.clueDay ? '<span class="tr-cl done">' + trImg('clue', 'tr-cli') + 'Улика за сегодня получена</span>' :
      '<span class="tr-cl">' + trImg('clue', 'tr-cli') + 'До улики: ' + Math.max(0, mine.clueAt - mine.dayOk) + ' ' + UI.plural(Math.max(0, mine.clueAt - mine.dayOk), 'верный', 'верных', 'верных') + '</span>';
    var tiles = '';
    for (var i = 0; i < b.length; i++) {
      var st = b[i], n = i + 1;
      tiles += '<button type="button" class="tr-tile d' + (d[i] || 1) + (st === 1 ? ' ok' : (st === -1 ? ' bad' : '')) + '" data-tn="' + n + '"' +
        (st !== 0 || full ? ' disabled' : '') + ' aria-label="Вопрос ' + n + '">' + (st === 1 ? '✓' : (st === -1 ? '✗' : n)) + '</button>';
    }
    return '<div class="tr-dayh"><b>' + (full ? 'На сегодня всё!' : 'Осталось ' + left + ' ' + UI.plural(left, 'вопрос', 'вопроса', 'вопросов')) + '</b>' + clue + '</div>' +
      (full ? '<p class="tr-note">Жди ночи. Подумай, кто ведёт себя подозрительно.</p>' : '<p class="tr-note">Чем больше номер — тем труднее и дороже: №' + 37 + ' = 370 монет. Ошибка — минус половина.</p>') +
      '<div class="tr-board">' + tiles + '</div>';
  }
  function tBody() {
    var m = mine, ph = m.ph, dis = bkPend && bkPend.step === m.step ? ' disabled' : '';
    if (ph === 'end') {
      var r = roleOf(m.role), won = m.won;
      return '<div class="ph-end">' + (m.place === 1 ? '<div class="ph-win"><img class="ph-trophy" src="img/ui/trophy.webp" alt=""><div class="win-video ph-win-video" id="phWinVideo"></div></div>' :
        '<div class="ph-win"><img class="ph-trophy" src="img/ui/' + (m.place <= 3 ? 'medal' + m.place : 'clap') + '.webp" alt=""></div>') +
        (m.winner ? '<h2 class="ph-h">' + (won ? 'Твоя сторона победила!' : 'Твоя сторона проиграла') + '</h2>' : '<h2 class="ph-h">Игра окончена</h2>') +
        (m.role ? '<p class="tr-endrole">' + trImg(r.img, 'tr-pni') + '<span>Твоя роль: <b>' + esc(r.name) + '</b></span></p>' : '') +
        '<p class="k-pts center">' + m.coins + ' монет' + (m.bonus ? ' <small>(+' + m.bonus + ' за победу)</small>' : '') + '</p>' +
        '<p class="muted center">' + m.place + '-е место из ' + m.of + '. Верных ответов: ' + m.right + ' из ' + (m.right + m.wrong) + '</p>' +
        '<p class="muted center">Организатор может начать новую игру — не закрывай страницу.</p>' +
        '<button type="button" class="btn btn-ghost" data-leave="1">Выйти</button></div>';
    }
    if (ph === 'lobby' || !m.role) {
      return '<div class="ph-wait"><div class="ph-big-av">' + UI.avImg(m.av, 'big-av') + '</div><h2 class="ph-h">Ты в игре!</h2>' +
        '<div class="bk-rules">' + trImg('traitor', 'bk-img') + '<p><b>Предатель</b>Скоро ты узнаешь свою роль. Никому не показывай телефон!</p></div>' +
        '<p class="muted">Найди свой ник на большом экране. Игра скоро начнётся.</p></div>';
    }
    switch (ph) {
      case 'roles':
        return roleCard() + '<p class="muted center">Скоро наступит день 1.</p>';
      case 'day':
        if (!m.alive) return roleBar() + ghostHtml('Призраки молчат и не отвечают на вопросы. Смотри, что будет дальше!');
        if (m.st === 'q' && m.q) {
          return '<p class="tr-qh"><span class="tr-qn d' + m.q.d + '">№' + m.q.n + '</span><span class="tr-qv">+' + m.q.value + ' / −' + m.q.pen + '</span></p>' +
            '<p class="bk-topic">' + esc(m.q.topic) + '</p><h2 class="ph-q k-q">' + esc(m.q.text) + '</h2><div class="k-grid">' + m.q.opts.map(function (o, i) {
              return '<button type="button" class="k-btn" data-topt="' + i + '" style="--kc:' + KCOL[i] + '"' + dis + '><span class="kh-shape">' + SHAPES[i] + '</span><span>' + esc(o) + '</span></button>';
            }).join('') + '</div>';
        }
        if (m.st === 'res' && m.res) {
          var R = m.res;
          return '<div class="k-res"><div class="k-res-ico">' + (R.ok ? '✓' : '✗') + '</div><h2>' + (R.ok ? 'Верно!' : 'Неверно') + '</h2>' +
            '<p class="k-pts">' + (R.delta > 0 ? '+' + R.delta : (R.delta < 0 ? '−' + (-R.delta) : '0')) + ' монет</p>' +
            (R.ok ? '' : '<p class="k-right">Правильно: ' + esc(R.opts[R.correct]) + '</p>') + '</div>' +
            (R.clue ? '<div class="tr-newclue">' + trImg('clue', 'tr-pni') + '<span><small>Новая улика!</small>' + clueLi(R.clue).replace(/^<li>|<\/li>$/g, '') + '</span></div>' : '') +
            '<button type="button" class="btn btn-yellow btn-lg bk-next" data-tback="1"' + dis + '>' + (m.dayN >= m.perDay ? 'Готово' : 'К вопросам') + '</button>';
        }
        return roleBar() + boardHtml();
      case 'night':
        if (!m.alive) return ghostHtml('Ночью призраки спят.');
        return roleBar() + pickHtml();
      case 'morning':
        return roleBar() + '<h2 class="ph-h">Что случилось ночью</h2>' + newsHtml(m.news) + winHtml() +
          (m.winner ? '' : '<p class="tr-note center">Смотри на большой экран и обсуждай с классом, кто предатель.</p>');
      case 'vote':
        if (!m.alive) return ghostHtml('Призраки не голосуют.');
        return roleBar() + pickHtml();
      case 'verdict': {
        var d = m.verdict || {}, txt;
        if (d.out) txt = '<b>' + esc(d.out.name) + '</b> выбывает. ' + (d.role === 'traitor' ? 'Это предатель!' : 'Это не предатель. Роль: ' + esc(roleOf(d.role).name.toLowerCase()) + '.');
        else txt = ({ none: 'Никто не проголосовал.', tie: 'Голоса разделились — никто не выбывает.', skip: 'Большинство решило пропустить.' })[d.why] || '';
        return roleBar() + '<div class="tr-verdict">' + trImg('vote', 'tr-ghost-i') + (d.out ? UI.avImg(d.out.av, 'big-av') : '') + '<p>' + txt + '</p></div>' + winHtml();
      }
    }
    return '<p class="muted">Ждём…</p>';
  }
  function onTClick(e) {
    var t = e.target.closest('button');
    if (!t || t.disabled || !mine) return;
    if (t.hasAttribute('data-leave')) { leave(); return; }
    if (t.hasAttribute('data-trole')) {
      roleShow = !roleShow; FX.unlock(); FX.vibrate(15);
      clearTimeout(roleT);
      if (roleShow && mine.ph !== 'roles') roleT = setTimeout(function () { roleShow = false; if (view && view.kind === 'traitor') { bodyKey = null; renderT(); } }, 4000);
      bodyKey = null; renderT(); return;
    }
    if (t.hasAttribute('data-tclues')) { cluesOpen = !cluesOpen; bodyKey = null; renderT(); return; }
    if (t.hasAttribute('data-tpick')) {
      var id = t.getAttribute('data-tpick');
      tPick = { ph: mine.ph, id: id };
      bk(mine.ph === 'vote' ? 'vote' : 'choose', { target: id }, true);
      FX.play('click');
      bodyKey = null; renderT(); return;
    }
    if (bkPend && bkPend.step === mine.step) return;
    if (t.hasAttribute('data-tn')) { chosen(t, '[data-tn]'); FX.play('open'); bk('open', { n: Number(t.getAttribute('data-tn')) }); }
    else if (t.hasAttribute('data-topt')) { chosen(t, '[data-topt]'); bk('answer', { opt: Number(t.getAttribute('data-topt')) }); }
    else if (t.hasAttribute('data-tback')) { chosen(t, '[data-tback]'); bk('back', {}); }
  }
  function tTimer(el) {
    var on = view && view.left != null && view.total && ['day', 'night', 'vote'].indexOf(view.phase) >= 0 && !view.winner;
    el.hidden = !on;
    if (on) {
      var remain = Math.max(0, view.left - (Date.now() - recvAt));
      el.firstChild.style.transform = 'scaleX(' + Math.min(1, remain / view.total).toFixed(4) + ')';
      el.classList.toggle('low', remain <= 10000);
    }
    resendPending(renderT);
  }
  function tFx() {
    var al = mine.alerts || [], last = al.length ? al[al.length - 1].n : 0;
    if (lastAlert === null) lastAlert = last;
    else if (last > lastAlert) { lastAlert = last; showAlert(al[al.length - 1]); }
    var key = mine.ph + ':' + mine.day + ':' + mine.st + ':' + mine.step;
    if (key === lastStKey) return;
    var first = lastStKey === null, prevPh = lastStKey ? lastStKey.split(':')[0] : null;
    lastStKey = key;
    if (first) return;
    if (mine.ph === 'day' && mine.st === 'res' && mine.res) {
      if (mine.res.ok) { FX.play('correct'); FX.vibrate([30, 40, 30]); if (mine.res.clue) FX.confetti({ count: 50, y: innerHeight * 0.35 }); }
      else { FX.play('wrong'); FX.vibrate(200); }
      return;
    }
    if (prevPh === mine.ph) return;
    switch (mine.ph) {
      case 'roles': FX.play('open'); FX.vibrate([40, 60, 40]); break;
      case 'night': FX.play('neutral'); FX.vibrate(60); break;
      case 'day': case 'vote': FX.vibrate(40); break;
      case 'morning': FX.play('bonus'); break;
      case 'end': if (mine.won) { FX.play('win'); FX.confetti({ count: 150, rain: true }); } break;
    }
  }
})(window);
