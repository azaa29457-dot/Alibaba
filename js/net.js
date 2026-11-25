/* Alibaba — связь организатора и телефонов без своего сервера.
   Работает сразу через три канала, какой первым ответит — тот и используется:
   1) PeerJS (прямое соединение WebRTC, бесплатный облачный сервер 0.peerjs.com),
   2) и 3) бесплатные публичные MQTT-брокеры EMQX и HiveMQ (через WebSocket).
   Если один канал заблокирован в школьной сети, остаются другие. */
(function (root) {
  'use strict';
  var FB = root.FB || (root.FB = {});
  var NS = 'alibaba-quiz-v1';

  var DEFAULTS = {
    mqtt: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'],
    peer: {}            // пусто = облачный сервер PeerJS по умолчанию
  };

  function config() {
    var c = { mqtt: DEFAULTS.mqtt.slice(), peer: DEFAULTS.peer };
    try {
      var dev = JSON.parse(localStorage.getItem('alibaba.devnet') || 'null');
      if (dev) {
        if (dev.mqtt) c.mqtt = dev.mqtt;
        if ('peer' in dev) c.peer = dev.peer;
      }
    } catch (e) { /* нет localStorage — используем настройки по умолчанию */ }
    return c;
  }

  function rid(n) {
    var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
    for (var i = 0; i < (n || 10); i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (resolve) {
      var el = document.createElement('script');
      el.src = src; el.async = true;
      el.onload = function () { resolve(true); };
      el.onerror = function () { resolve(false); };
      document.head.appendChild(el);
    });
    return loaded[src];
  }

  var Net = {
    ready: function () {
      return Promise.all([
        root.mqtt ? true : loadScript('vendor/mqtt.min.js'),
        root.Peer ? true : loadScript('vendor/peerjs.min.js')
      ]).then(function () { return { mqtt: !!root.mqtt, peer: !!root.Peer }; });
    },
    makeCode: function () { return String(100000 + Math.floor(Math.random() * 900000)); },
    rid: rid
  };

  function topicBase(code) { return NS + '/' + code; }
  function peerId(code) { return NS + '-' + code; }
  function peerOpts(c) {
    var o = { debug: 0 };
    if (c.peer && typeof c.peer === 'object') Object.keys(c.peer).forEach(function (k) { o[k] = c.peer[k]; });
    return o;
  }
  function parse(payload) {
    try {
      var m;
      if (typeof payload === 'string') m = JSON.parse(payload);
      else if (payload && typeof payload.byteLength === 'number') m = JSON.parse(new TextDecoder().decode(payload)); // MQTT: байты
      else m = payload; // PeerJS (serialization: json): уже объект
      return m && typeof m === 'object' && !Array.isArray(m) ? m : null;
    } catch (e) { return null; }
  }

  /* ================= ОРГАНИЗАТОР ================= */
  function HostNet(code, handlers, opts) {
    this.code = code;
    this.h = handlers || {};
    this.opts = opts || {};
    this.cfg = config();
    this.mq = [];          // MQTT-клиенты
    this.peer = null;
    this.conns = {};       // pid -> DataConnection
    this.via = {};         // pid -> канал, по которому игрок пишет
    this.status = { peer: 'off', mqtt: this.cfg.mqtt.map(function () { return 'off'; }) };
    this.stopped = false;
    this.peerRetries = 0;
  }
  HostNet.prototype._st = function () { if (this.h.onStatus) this.h.onStatus(this.status); };
  HostNet.prototype.start = function () {
    var self = this;
    if (root.mqtt) this.cfg.mqtt.forEach(function (url, i) { self._startMqtt(i, url); });
    if (root.Peer && this.cfg.peer !== false) this._startPeer();
    this._st();
  };
  HostNet.prototype._startMqtt = function (i, url) {
    var self = this, base = topicBase(this.code);
    var c;
    try {
      c = root.mqtt.connect(url, { clientId: 'fbh_' + rid(12), clean: true, connectTimeout: 10000, reconnectPeriod: 4000, keepalive: 30 });
    } catch (e) { self.status.mqtt[i] = 'error'; self._st(); return; }
    self.mq[i] = c;
    self.status.mqtt[i] = 'connecting';
    c.on('connect', function () {
      c.subscribe(base + '/h', { qos: 0 }, function (err) {
        self.status.mqtt[i] = err ? 'error' : 'ok'; self._st();
        if (!err && self.h.onChannelUp) self.h.onChannelUp();
      });
    });
    c.on('message', function (topic, payload) {
      var m = parse(payload);
      if (!m || typeof m.pid !== 'string' || m.pid.length > 40) return;
      self._incoming(m, 'm' + i);
    });
    c.on('reconnect', function () { self.status.mqtt[i] = 'connecting'; self._st(); });
    c.on('offline', function () { self.status.mqtt[i] = 'error'; self._st(); });
    c.on('error', function () { self.status.mqtt[i] = 'error'; self._st(); });
  };
  HostNet.prototype._startPeer = function () {
    var self = this;
    if (this.stopped) return;
    var p;
    try { p = new root.Peer(peerId(this.code), peerOpts(this.cfg)); } catch (e) { this.status.peer = 'error'; this._st(); return; }
    this.peer = p;
    this.status.peer = 'connecting'; this._st();
    p.on('open', function () {
      self.peerRetries = 0;
      self.status.peer = 'ok'; self._st();
      if (self.h.onChannelUp) self.h.onChannelUp();
    });
    p.on('connection', function (conn) {
      var pid = null;
      conn.on('data', function (d) {
        var m = parse(d);
        if (!m || typeof m.pid !== 'string' || m.pid.length > 40) return;
        pid = m.pid;
        if (self.conns[pid] && self.conns[pid] !== conn) { try { self.conns[pid].close(); } catch (e) { } }
        self.conns[pid] = conn;
        self._incoming(m, 'p');
      });
      conn.on('close', function () { if (pid && self.conns[pid] === conn) delete self.conns[pid]; });
      conn.on('error', function () { });
    });
    p.on('disconnected', function () {
      if (self.stopped || p.destroyed) return;
      self.status.peer = 'connecting'; self._st();
      setTimeout(function () { if (!self.stopped && !p.destroyed) { try { p.reconnect(); } catch (e) { } } }, 2000);
    });
    p.on('error', function (err) {
      var type = err && err.type;
      if (type === 'peer-unavailable') return; // к организатору такое не относится
      if (type === 'unavailable-id' && self.opts.strictCode && self.h.onCodeTaken && !self.everOpen) {
        self.stop(); self.h.onCodeTaken(); return;
      }
      self.status.peer = 'error'; self._st();
      if (type === 'unavailable-id' || type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        try { p.destroy(); } catch (e) { }
        self.peerRetries++;
        if (self.peerRetries <= 20 && !self.stopped) setTimeout(function () { self._startPeer(); }, Math.min(20000, 2000 * self.peerRetries));
      }
    });
    p.on('open', function () { self.everOpen = true; });
  };
  HostNet.prototype._incoming = function (m, via) {
    if (m.t !== 'hello') this.via[m.pid] = via;
    if (this.h.onMsg) this.h.onMsg(m.pid, m, via);
  };
  HostNet.prototype._sendVia = function (via, pid, msg) {
    var str = JSON.stringify(msg);
    if (via === 'p') {
      var c = this.conns[pid];
      if (c && c.open) { try { c.send(msg); } catch (e) { } }
    } else if (via && via[0] === 'm') {
      var mc = this.mq[Number(via.slice(1))];
      if (mc && mc.connected) mc.publish(topicBase(this.code) + '/c/' + pid, str, { qos: 0 });
    }
  };
  HostNet.prototype.reply = function (via, pid, msg) { this._sendVia(via, pid, msg); };
  HostNet.prototype.sendTo = function (pid, msg) { this._sendVia(this.via[pid], pid, msg); };
  HostNet.prototype.broadcast = function (msg) {
    var str = JSON.stringify(msg), base = topicBase(this.code), self = this;
    this.mq.forEach(function (c) { if (c && c.connected) c.publish(base + '/a', str, { qos: 0 }); });
    Object.keys(this.conns).forEach(function (pid) {
      var c = self.conns[pid];
      if (c && c.open) { try { c.send(msg); } catch (e) { } }
    });
  };
  HostNet.prototype.anyUp = function () {
    return this.status.peer === 'ok' || this.status.mqtt.some(function (x) { return x === 'ok'; });
  };
  HostNet.prototype.stop = function () {
    this.stopped = true;
    this.mq.forEach(function (c) { try { c && c.end(true); } catch (e) { } });
    this.mq = [];
    var self = this;
    Object.keys(this.conns).forEach(function (k) { try { self.conns[k].close(); } catch (e) { } });
    this.conns = {};
    if (this.peer) { try { this.peer.destroy(); } catch (e) { } this.peer = null; }
  };

  /* ================= ИГРОК (телефон) ================= */
  function ClientNet(code, pid, handlers) {
    this.code = code; this.pid = pid; this.h = handlers || {};
    this.cfg = config();
    this.cands = [];
    this.active = null;
    this.lastRx = 0;
    this.stopped = false;
    this.everConnected = false;
    this.attempt = 0;
    var self = this;
    this.timer = setInterval(function () { self._tick(); }, 2000);
  }
  ClientNet.prototype._status = function (s) { if (this.h.onStatus) this.h.onStatus(s); };
  ClientNet.prototype.connect = function () {
    var self = this;
    if (this.stopped) return;
    this._closeAll();
    this.active = null;
    this.attempt++;
    var myAttempt = this.attempt;
    this.raceStarted = Date.now();
    this._status('connecting');
    var cands = [];
    if (root.Peer && this.cfg.peer !== false) cands.push(this._peerCand());
    if (root.mqtt) this.cfg.mqtt.forEach(function (url) { cands.push(self._mqttCand(url)); });
    this.cands = cands.filter(Boolean);
    if (!this.cands.length) { this._status('nolibs'); return; }
    this.cands.forEach(function (c) {
      c.onMsg = function (m) {
        if (self.stopped || myAttempt !== self.attempt) return;
        if (!self.active) {
          if (m.t !== 'welcome') return;
          self.active = c;
          self.everConnected = true;
          self.cands.forEach(function (o) { if (o !== c) o.close(); });
          self.cands = [c];
          self._status('online');
        }
        if (c !== self.active) return;
        self.lastRx = Date.now();
        if (self.h.onMsg) self.h.onMsg(m);
      };
      c.onClose = function () {
        if (self.stopped || myAttempt !== self.attempt) return;
        if (c === self.active) { self.active = null; self._status('lost'); self._retrySoon(); }
      };
    });
  };
  ClientNet.prototype._retrySoon = function () {
    var self = this;
    if (this.retryT) return;
    this.retryT = setTimeout(function () { self.retryT = null; self.connect(); }, 1500);
  };
  ClientNet.prototype._tick = function () {
    if (this.stopped) return;
    var now = Date.now();
    if (this.active) {
      if (now - (this.lastTx || 0) > 4000) this.send({ t: 'ping' });
      if (now - this.lastRx > 14000) { this._status('lost'); this.active = null; this.connect(); }
    } else if (this.raceStarted && now - this.raceStarted > 12000) {
      if (!this.everConnected) { this._closeAll(); this.raceStarted = 0; this._status('notfound'); }
      else this.connect();
    }
  };
  ClientNet.prototype._mqttCand = function (url) {
    var self = this, base = topicBase(this.code), cand = { closed: false };
    var c;
    try {
      c = root.mqtt.connect(url, { clientId: 'fbc_' + rid(12), clean: true, connectTimeout: 9000, reconnectPeriod: 0, keepalive: 20 });
    } catch (e) { return null; }
    c.on('connect', function () {
      c.subscribe([base + '/a', base + '/c/' + self.pid], { qos: 0 }, function (err) {
        if (!err) cand.send({ t: 'hello' });
      });
    });
    c.on('message', function (topic, payload) { var m = parse(payload); if (m && cand.onMsg) cand.onMsg(m); });
    c.on('close', function () { if (!cand.closed && cand.onClose) cand.onClose(); });
    c.on('error', function () { });
    cand.send = function (msg) {
      msg.pid = self.pid;
      if (c.connected) c.publish(base + '/h', JSON.stringify(msg), { qos: 0 });
    };
    cand.close = function () { cand.closed = true; try { c.end(true); } catch (e) { } };
    return cand;
  };
  ClientNet.prototype._peerCand = function () {
    var self = this, cand = { closed: false }, conn = null, p;
    try { p = new root.Peer(peerOpts(this.cfg)); } catch (e) { return null; }
    var opened = false;
    function dial() {
      if (cand.closed || p.destroyed) return;
      var c = p.connect(peerId(self.code), { reliable: true, serialization: 'json' });
      conn = c;
      c.on('open', function () { opened = true; cand.send({ t: 'hello' }); });
      c.on('data', function (d) { var m = parse(d); if (m && cand.onMsg) cand.onMsg(m); });
      c.on('close', function () { if (c === conn && opened && !cand.closed && cand.onClose) cand.onClose(); });
      c.on('error', function () { });
    }
    p.on('open', dial);
    p.on('error', function (err) {
      // организатор ещё не на связи (например, перезагружает страницу) — пробуем снова
      if (err && err.type === 'peer-unavailable' && !opened && !cand.closed) setTimeout(dial, 2000);
    });
    p.on('disconnected', function () { /* сигнальный сервер нам больше не нужен, канал P2P живёт сам */ });
    cand.send = function (msg) {
      msg.pid = self.pid;
      if (conn && conn.open) { try { conn.send(msg); } catch (e) { } }
    };
    cand.close = function () { cand.closed = true; try { p.destroy(); } catch (e) { } };
    return cand;
  };
  ClientNet.prototype.send = function (msg) {
    if (this.active) { this.lastTx = Date.now(); this.active.send(msg); }
  };
  ClientNet.prototype._closeAll = function () {
    this.cands.forEach(function (c) { try { c.close(); } catch (e) { } });
    this.cands = [];
  };
  ClientNet.prototype.stop = function () {
    this.stopped = true;
    clearInterval(this.timer);
    if (this.retryT) clearTimeout(this.retryT);
    this._closeAll();
    this.active = null;
  };
  ClientNet.prototype.isOnline = function () { return !!this.active; };

  Net.HostNet = HostNet;
  Net.ClientNet = ClientNet;
  FB.Net = Net;
})(window);
