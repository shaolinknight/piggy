// A stand-in for the Apps Script web app (script version 19), answered through Playwright routing.
// It keeps an in-memory sheet and answers the same request and response shapes as the real script:
//   GET  ?action=pull|ping&pass=…           -> pull_() / ping
//   POST {action, pass, oid, …} as text/plain -> add, update, delete, budget, budgets, prefs, …
// and it can be slow or fail on purpose:
//   mock.latency = 1500                      every answer waits 1.5 s (or { pull: 4000, add: 0 } per action)
//   mock.fail('offline' | 'timeout' | 'http500' | 'lost' | {error:'bad_entry'}, { action: 'add', times: 1 })
//   ('lost': the sheet makes the change but the answer never gets back to the phone, so the app will retry it)
//   new MockSheet({ v: 20 })                 script v20: a stamp that moves on every change, and "same as before" answers
//   mock.touch()                             (v20) someone edited the sheet by hand
//   mock.watch = false                       (v20) the hand-edit watcher isn't installed yet: every pull reads everything
'use strict';
var data = require('./sheet-data');

var URL_BASE = 'https://script.google.com/macros/s/MOCK-DEPLOYMENT/exec';
var PASS = 'test-pass';

function MockSheet(opts) {
  opts = opts || {};
  this.sheet = data.build(opts);
  this.v = opts.v || 19;
  this.latency = opts.latency || 0;
  this.failures = [];             // [{ mode, action, times }]
  this.log = [];                  // every request: { action, oid, at, status }
  this.applied = [];              // changes actually made to the sheet: { action, oid }
  this.done = {};                 // oids already made (the script's "piggy.ops" list)
  this.held = [];                 // requests left hanging by the 'timeout' failure
  this.stamp = '';                // v20: moves whenever the sheet changes
  this.watch = true;              // v20: the hand-edit watcher is installed
}
MockSheet.prototype.touch = function () { this.stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); return this; };

MockSheet.prototype.fail = function (mode, o) {
  o = o || {};
  this.failures.push({ mode: mode, action: o.action || '*', times: o.times == null ? Infinity : o.times });
  return this;
};
MockSheet.prototype.heal = function () { this.failures = []; this.held.forEach(function (h) { h(); }); this.held = []; return this; };
MockSheet.prototype.count = function (action) { return this.log.filter(function (l) { return !action || l.action === action; }).length; };
MockSheet.prototype.pullPayload = function () { return data.pullPayload(this.sheet, this.v); };
MockSheet.prototype.rows = function () { return data.count(this.sheet); };

MockSheet.prototype.failureFor = function (action) {
  for (var i = 0; i < this.failures.length; i++) {
    var f = this.failures[i];
    if ((f.action === '*' || f.action === action) && f.times > 0) { f.times--; return f.mode; }
  }
  return null;
};
MockSheet.prototype.delayFor = function (action) {
  var l = this.latency;
  return typeof l === 'number' ? l : (l[action] != null ? l[action] : l['*'] || 0);
};

// ---- the script's route_(): one request in, one JSON object out
MockSheet.prototype.handle = function (p) {
  if (String(p.pass || '') !== PASS) return { ok: false, error: 'bad_passcode' };
  var self = this;
  function locked(fn) {                                  // locked_(): a retried change is never made twice
    if (p.oid && self.done[p.oid]) return { ok: true, dup: true };
    var r = fn();
    if (r && r.ok) self.touch();
    if (p.oid && r && r.ok) { self.done[p.oid] = 1; self.applied.push({ action: p.action, oid: p.oid }); }
    return r;
  }
  try {
    switch (p.action) {
      case 'ping': return { ok: true, v: this.v, name: 'Piggy test sheet' };
      case 'pull':
        if (this.v < 20) return this.pullPayload();
        if (p.since && this.stamp && p.since === this.stamp && this.watch) return { ok: true, v: this.v, same: true, stamp: this.stamp, ms: 3 };
        if (!this.stamp) this.touch();
        return Object.assign(this.pullPayload(), { stamp: this.stamp, ms: 40, t: { logs: 30, grids: 5 }, watch: this.watch ? 'on' : 'needs_auth' });
      case 'add': return locked(function () { return self.add(p.tx); });
      case 'update': return locked(function () { return self.update(p.ref, p.tx); });
      case 'delete': return locked(function () { return self.remove(p.ref); });
      case 'budget': return locked(function () { return self.setBudget(p.b); });
      case 'budgets': return locked(function () { (p.list || []).forEach(function (b) { self.setBudget(b); }); return { ok: true, n: (p.list || []).length }; });
      case 'budgetundo': return locked(function () { return { ok: true, n: 0 }; });
      case 'rebuild': return locked(function () { return { ok: true, n: self.sheet.budget.length, kept: 0, tabs: ['2022 budget'] }; });
      case 'trip': return locked(function () { return self.upsert(self.sheet.trips, p.trip && p.trip.name, p.old, p.trip && [p.trip.name, p.trip.start || '', p.trip.end || '', +p.trip.budget || 0, p.trip.notes || '', '']); });
      case 'tripdel': return locked(function () { return self.drop(self.sheet.trips, p.name); });
      case 'recur': return locked(function () { var b = p.bill || {}; return self.upsert(self.sheet.recur, b.name, p.old, [b.name, b.c || '', +b.a || 0, +b.day || 1, false, b.notes || '', 0, +b.every || 1, b.unit || 'm', b.start || '']); });
      case 'recurdel': return locked(function () { return self.drop(self.sheet.recur, p.name); });
      case 'goal': return locked(function () { var g = p.goal || {}; return self.upsert(self.sheet.goals, g.name, p.old, [g.name, +g.target || 0, g.by, g.c || '', +g.base || 0, g.start, g.notes || '', 0]); });
      case 'goaldel': return locked(function () { return self.drop(self.sheet.goals, p.name); });
      case 'tag': return locked(function () { return { ok: true, n: (p.refs || []).length + (p.untag || []).length, missed: 0 }; });
      case 'regroup': return locked(function () { return { ok: true, n: 0 }; });
      case 'yeartab': return locked(function () { return { ok: true, made: '' }; });
      case 'prefs': return locked(function () { return self.savePrefs(p.prefs); });
      default: return { ok: false, error: 'unknown_action' };
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
};

function check(t) {                                      // check_()
  if (!t || (t.k !== 'e' && t.k !== 'i')) throw new Error('bad_entry');
  if (!(+t.y > 2000) || !(+t.m >= 0 && +t.m <= 11) || isNaN(Number(t.a))) throw new Error('bad_entry');
}
function entry(t) { return { m: +t.m, v: String(t.v || ''), c: String(t.c || ''), a: Number(t.a), n: String(t.n || ''), d: String(t.d || ''), tr: String(t.tr || ''), fs: String(t.fs || ''), ow: +t.ow || 0, pb: String(t.pb || '') }; }
MockSheet.prototype.logOf = function (k, y, create) {
  var key = k + y;
  if (!this.sheet.logs[key] && create) this.sheet.logs[key] = [];
  return this.sheet.logs[key] || null;
};
MockSheet.prototype.add = function (t) {                 // add_(): top of its month's block
  check(t);
  var log = this.logOf(t.k, +t.y, true), i = 0;
  while (i < log.length && log[i].m > +t.m) i++;
  log.splice(i, 0, entry(t));
  return { ok: true, row: i + data.FIRST_ROW };
};
MockSheet.prototype.locate = function (log, ref) {        // locate_(): the row if it still matches, else the nearest match
  var fp = ref.fp || {};
  function same(e) { return e && e.m === +fp.m && e.v === String(fp.v || '') && e.c === String(fp.c || '') && Math.abs(e.a - Number(fp.a)) < 0.005; }
  var i0 = +ref.r - data.FIRST_ROW;
  if (same(log[i0])) return i0;
  var best = -1;
  log.forEach(function (e, i) { if (same(e) && (best < 0 || Math.abs(i - i0) < Math.abs(best - i0))) best = i; });
  if (best < 0) throw new Error('not_found');
  return best;
};
MockSheet.prototype.update = function (ref, t) {
  check(t);
  var log = this.logOf(ref.k, +ref.y, false);
  if (!log) throw new Error('not_found');
  var i = this.locate(log, ref);
  if (t.k !== ref.k || +t.y !== +ref.y || +t.m !== +ref.m) { log.splice(i, 1); return this.add(t); }
  log[i] = entry(t);
  return { ok: true, row: i + data.FIRST_ROW };
};
MockSheet.prototype.remove = function (ref) {
  var log = this.logOf(ref.k, +ref.y, false);
  if (!log) throw new Error('not_found');
  log.splice(this.locate(log, ref), 1);
  return { ok: true };
};
MockSheet.prototype.setBudget = function (b) {
  if (!b || !String(b.c || '').trim() || isNaN(Number(b.a)) || isNaN(Number(b.s))) throw new Error('bad_entry');
  var row = this.sheet.budget.length + 2;
  this.sheet.budget.push([+b.s, b.g || 'one-time', b.c, b.remove ? 0 : Number(b.a), row, b.remove ? 'removed' : (b.note || '')]);
  return { ok: true, row: row };
};
MockSheet.prototype.upsert = function (list, name, old, rowVals) {
  if (!name || !String(name).trim()) throw new Error('bad_entry');
  var want = String(old || name).toLowerCase();
  for (var i = 0; i < list.length; i++) if (String(list[i][0]).toLowerCase() === want) { list[i] = rowVals; return { ok: true, row: i + 2 }; }
  list.push(rowVals);
  return { ok: true, row: list.length + 1 };
};
MockSheet.prototype.drop = function (list, name) {
  var want = String(name || '').toLowerCase();
  for (var i = list.length - 1; i >= 0; i--) if (String(list[i][0]).toLowerCase() === want) list.splice(i, 1);
  return { ok: true };
};
MockSheet.prototype.savePrefs = function (prefs) {        // savePrefs_() with keepUnchanged_(): only listed settings change
  if (!prefs || typeof prefs !== 'object') throw new Error('bad_prefs');
  var was = this.sheet.prefs, chg = prefs.chg; delete prefs.chg;
  prefs.at = prefs.at || Date.now();
  if (was && Array.isArray(chg)) {
    var c = {}; chg.forEach(function (k) { c[k] = 1; });
    Object.keys(was).forEach(function (k) {
      if (/^(at|hu|bc|bmo|dv|bm|bl|ck|co|ds|sp)$/.test(k)) return;
      if (k === 'cfg') { var nc = prefs.cfg || {}; Object.keys(was.cfg || {}).forEach(function (x) { if (!c['cfg.' + x]) nc[x] = was.cfg[x]; }); prefs.cfg = nc; return; }
      if (!c[k]) prefs[k] = was[k];
    });
  }
  if (was && +was.at >= +prefs.at) prefs.at = +was.at + 1;
  this.sheet.prefs = prefs;
  return { ok: true, at: prefs.at };
};

// ---- Playwright side: answer every request to the script's URL
MockSheet.prototype.attach = function (target) {
  var self = this;
  return target.route(/^https:\/\/script\.google(usercontent)?\.com\//, function (route) {
    var req = route.request(), p;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    if (req.method() === 'GET') {
      var q = new URL(req.url()).searchParams; p = {};
      q.forEach(function (v, k) { p[k] = v; });
    } else {
      try { p = JSON.parse(req.postData() || ''); } catch (e) { p = {}; }
    }
    var entry = { action: p.action, oid: p.oid || '', since: p.since || '', fresh: p.fresh === '1', at: Date.now(), status: 'pending', bytes: 0 };
    self.log.push(entry);
    var mode = self.failureFor(p.action);
    return wait(self.delayFor(p.action)).then(function () {
      if (mode === 'offline') { entry.status = 'offline'; return route.abort('internetdisconnected'); }
      if (mode === 'timeout') {                            // never answers (until heal()), so the app's own timer fires
        entry.status = 'held';
        return new Promise(function (r) { self.held.push(r); }).then(function () { return route.abort('timedout').catch(function () {}); });
      }
      if (mode === 'http500') { entry.status = 500; return route.fulfill({ status: 500, headers: cors(), contentType: 'text/html', body: '<html>Error</html>' }); }
      if (mode === 'lost') { entry.status = 'lost:' + JSON.stringify(self.handle(p)); return route.abort('connectionreset'); }
      var res = mode && typeof mode === 'object' ? { ok: false, error: mode.error } : self.handle(p);
      var body = JSON.stringify(res);
      entry.status = res.same ? 'same' : res.ok ? 'ok' : res.error; entry.bytes = body.length;
      return route.fulfill({ status: 200, headers: cors(), contentType: 'application/json', body: body });
    }).catch(function () {});                              // the page may have gone away mid-request
  });
};
// ---- the same mock as a real HTTP server on localhost. Needed whenever the service worker is on: in WebKit, a page
// the worker controls sends its requests past Playwright's routing, straight to the network. Point the app's sheet URL
// at `mock.url` instead of the Google one.
MockSheet.prototype.listen = function () {
  var self = this, http = require('http');
  return new Promise(function (resolve) {
    self.server = http.createServer(function (req, res) {
      var chunks = [];
      req.on('data', function (c) { chunks.push(c); });
      req.on('end', function () {
        var p = {};
        if (req.method === 'GET') new URL(req.url, 'http://x').searchParams.forEach(function (v, k) { p[k] = v; });
        else { try { p = JSON.parse(Buffer.concat(chunks).toString() || ''); } catch (e) { p = {}; } }
        if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
        var entry = { action: p.action, oid: p.oid || '', since: p.since || '', fresh: p.fresh === '1', at: Date.now(), status: 'pending', bytes: 0 };
        self.log.push(entry);
        var mode = self.failureFor(p.action);
        wait(self.delayFor(p.action)).then(function () {
          if (mode === 'offline') { entry.status = 'offline'; return req.socket.destroy(); }
          if (mode === 'timeout') { entry.status = 'held'; return self.held.push(function () { req.socket.destroy(); }); }
          if (mode === 'http500') { entry.status = 500; res.writeHead(500, cors()); return res.end('error'); }
          if (mode === 'lost') { entry.status = 'lost:' + JSON.stringify(self.handle(p)); return req.socket.destroy(); }
          var out = mode && typeof mode === 'object' ? { ok: false, error: mode.error } : self.handle(p), body = JSON.stringify(out);
          entry.status = out.same ? 'same' : out.ok ? 'ok' : out.error; entry.bytes = body.length;
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors()));
          res.end(body);
        });
      });
    });
    self.server.listen(0, '127.0.0.1', function () {
      self.url = 'http://127.0.0.1:' + self.server.address().port + '/macros/s/MOCK-DEPLOYMENT/exec';
      resolve(self.url);
    });
  });
};
MockSheet.prototype.close = function () {
  this.heal();
  var s = this.server; if (!s) return Promise.resolve();
  return new Promise(function (r) { s.closeAllConnections(); s.close(function () { r(); }); });
};

function cors() { return { 'Access-Control-Allow-Origin': '*' }; }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

module.exports = { MockSheet: MockSheet, URL: URL_BASE, PASS: PASS };
