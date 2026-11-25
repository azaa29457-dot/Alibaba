/* Alibaba — звуки (синтезируются в браузере, без файлов), конфетти и мелкие эффекты. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  var FX = {};
  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem('alibaba.muted') === '1'; } catch (e) { }

  FX.isMuted = function () { return muted; };
  FX.setMuted = function (m) {
    muted = !!m;
    try { localStorage.setItem('alibaba.muted', muted ? '1' : '0'); } catch (e) { }
  };
  FX.unlock = function () {
    try {
      if (!ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { }
  };

  function tone(freq, start, dur, type, vol, slideTo) {
    var t0 = ctx.currentTime + start;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  var SOUNDS = {
    click: function () { tone(660, 0, 0.07, 'triangle', 0.12); },
    open: function () { tone(392, 0, 0.12, 'triangle', 0.16); tone(587, 0.08, 0.18, 'triangle', 0.16); },
    join: function () { tone(880, 0, 0.12, 'sine', 0.14); tone(1320, 0.07, 0.16, 'sine', 0.1); },
    vote: function () { tone(520, 0, 0.06, 'square', 0.05); },
    tick: function () { tone(1000, 0, 0.05, 'square', 0.06); },
    correct: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.22, 'triangle', 0.2); });
    },
    wrong: function () { tone(311, 0, 0.25, 'sawtooth', 0.12, 220); tone(233, 0.22, 0.35, 'sawtooth', 0.12, 150); },
    timeup: function () { tone(880, 0, 0.12, 'square', 0.1); tone(880, 0.18, 0.12, 'square', 0.1); tone(587, 0.36, 0.4, 'square', 0.1, 400); },
    bonus: function () { for (var i = 0; i < 8; i++) tone(700 + i * 120, i * 0.045, 0.1, 'sine', 0.1); },
    good: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, i * 0.07, 0.3, 'sine', 0.16); }); },
    bad: function () { tone(392, 0, 0.3, 'triangle', 0.18, 370); tone(370, 0.3, 0.3, 'triangle', 0.18, 349); tone(330, 0.6, 0.6, 'triangle', 0.18, 260); },
    neutral: function () { tone(440, 0, 0.15, 'sine', 0.15); tone(440, 0.18, 0.15, 'sine', 0.15); },
    win: function () {
      // фанфары
      var seq = [523, 523, 523, 659, 784, 659, 784, 1047];
      var tms = [0, 0.12, 0.24, 0.36, 0.6, 0.78, 0.9, 1.05];
      seq.forEach(function (f, i) { brass(f, tms[i], i === 7 ? 1.1 : 0.2); });
      [523, 659, 784].forEach(function (f) { brass(f, 1.05, 1.1, 0.07); });
      // дудки-пищалки
      horn(1.3); horn(1.75);
      // толпа «Ура!» и аплодисменты
      cheer(0.9, 2.6);
      applause(0.95, 3.6);
    },
    stamp: function () { tone(180, 0, 0.12, 'sine', 0.3, 60); tone(1200, 0.02, 0.08, 'triangle', 0.08); }
  };
  function noise(sec) {
    var len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function brass(freq, start, dur, vol) {
    var t0 = ctx.currentTime + start;
    var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t0);
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.linearRampToValueAtTime(2800, t0 + 0.06);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.03);
    g.gain.setValueAtTime(vol || 0.12, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function horn(start) {
    var t0 = ctx.currentTime + start;
    var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t0); o.frequency.exponentialRampToValueAtTime(700, t0 + 0.25);
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + 0.45);
  }
  function cheer(start, dur) {
    var t0 = ctx.currentTime + start;
    var src = ctx.createBufferSource(); src.buffer = noise(dur + 0.2);
    var f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(700, t0); f.frequency.linearRampToValueAtTime(1300, t0 + 0.6); f.frequency.linearRampToValueAtTime(1000, t0 + dur);
    f2.type = 'peaking'; f2.frequency.value = 2600; f2.gain.value = 6;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.5);
    g.gain.setValueAtTime(0.22, t0 + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(f2); f2.connect(g); g.connect(ctx.destination); src.start(t0); src.stop(t0 + dur + 0.1);
  }
  function applause(start, dur) {
    var buf = noise(0.05);
    for (var i = 0; i < 140; i++) {
      var tt = start + Math.pow(Math.random(), 1.4) * dur;
      var t0 = ctx.currentTime + tt;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 1800; f.Q.value = 1.2;
      var v = (0.05 + Math.random() * 0.12) * (1 - (tt - start) / (dur * 1.15));
      g.gain.setValueAtTime(Math.max(0.0001, v), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t0); src.stop(t0 + 0.05);
    }
  }
  FX.play = function (name) {
    if (muted || !ctx || !SOUNDS[name]) return;
    try { if (ctx.state === 'suspended') ctx.resume(); SOUNDS[name](); } catch (e) { }
  };

  /* ---------- Конфетти ---------- */
  var canvas = null, cctx = null, parts = [], raf = 0;
  var COLORS = ['#FFD23F', '#FF3D68', '#2FB8FF', '#8BE04E', '#7B61FF', '#FF8A00', '#ffffff'];
  function reduced() {
    return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    cctx = canvas.getContext('2d');
    function size() { canvas.width = root.innerWidth * (root.devicePixelRatio || 1); canvas.height = root.innerHeight * (root.devicePixelRatio || 1); }
    size();
    root.addEventListener('resize', size);
  }
  function loop() {
    var dpr = root.devicePixelRatio || 1;
    cctx.clearRect(0, 0, canvas.width, canvas.height);
    parts = parts.filter(function (p) { return p.y < root.innerHeight + 40 && p.life > 0; });
    parts.forEach(function (p) {
      p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      cctx.save();
      cctx.translate(p.x * dpr, p.y * dpr);
      cctx.rotate(p.rot);
      cctx.fillStyle = p.c;
      cctx.fillRect(-p.w * dpr / 2, -p.h * dpr / 2, p.w * dpr, p.h * dpr * Math.abs(Math.cos(p.rot * 2)));
      cctx.restore();
    });
    if (parts.length) raf = root.requestAnimationFrame(loop);
    else { raf = 0; cctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  FX.confetti = function (opts) {
    if (reduced()) return;
    opts = opts || {};
    ensureCanvas();
    var n = opts.count || 120;
    var x = opts.x != null ? opts.x : root.innerWidth / 2;
    var y = opts.y != null ? opts.y : root.innerHeight / 3;
    var colors = opts.colors || COLORS;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (opts.power || 9) * (0.4 + Math.random());
      parts.push({
        x: opts.rain ? Math.random() * root.innerWidth : x,
        y: opts.rain ? -20 - Math.random() * root.innerHeight * 0.5 : y,
        vx: opts.rain ? (Math.random() - 0.5) * 2 : Math.cos(a) * sp,
        vy: opts.rain ? Math.random() * 2 : Math.sin(a) * sp - 6,
        w: 6 + Math.random() * 7, h: 8 + Math.random() * 8,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        c: colors[Math.floor(Math.random() * colors.length)], life: 400
      });
    }
    if (!raf) raf = root.requestAnimationFrame(loop);
  };

  /* Плавный счётчик очков */
  FX.countTo = function (el, to) {
    if (!el) return;
    var from = Number(el.getAttribute('data-val'));
    if (!isFinite(from)) from = to;
    el.setAttribute('data-val', String(to));
    if (from === to || reduced()) { el.textContent = String(to); return; }
    var t0 = performance.now(), dur = 900;
    if (el._raf) cancelAnimationFrame(el._raf);
    function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
  };

  FX.vibrate = function (p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } };

  /* Не даём экрану погаснуть во время игры (где поддерживается). */
  var lock = null;
  FX.keepAwake = function () {
    try {
      if (!navigator.wakeLock || lock) return;
      navigator.wakeLock.request('screen').then(function (l) {
        lock = l;
        l.addEventListener('release', function () { lock = null; });
      }).catch(function () { });
    } catch (e) { }
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && FX._wantAwake) FX.keepAwake();
  });

  FB.FX = FX;
})(window);
