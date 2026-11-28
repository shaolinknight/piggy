// The sheet script's safety (v23), run against fake Google services that enforce Google's real limits:
// - its list of finished changes must fit in one setting (9 KB), however many changes the sheet has seen;
// - a change that was made is never reported as failed (which made the app retry it and write it again);
// - after 20 wrong passcodes in 10 minutes, every request is refused;
// - a read can come as a POST with the passcode in its body.        node tests/script/safety.test.js
'use strict';
var fs = require('fs'), path = require('path'), assert = require('assert');
var fake = require('./fake-gas');
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'script.txt'), 'utf8').replace("var PASSCODE = 'CHANGE-ME';", "var PASSCODE = 'test';");

function load() {
  var sheets = [
    new fake.Sheet('expenses 2026', 2, [['month', 'store', 'category', 'amount', 'notes', 'date'], ['November', 'Safeway', 'groceries', 55.5, '', '']]),
    new fake.Sheet('2026 spending', 4, [['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], ['groceries', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]),
    new fake.Sheet('app budget', 5, [['starting', 'group', 'category', 'monthly amount', 'notes'], [new Date(2026, 0, 1), 'daily living', 'groceries', 600, '']])
  ];
  var env = fake.install(sheets);
  var sp = env.globals.PropertiesService.getScriptProperties;
  env.globals.PropertiesService.getScriptProperties = function () {      // Google: at most 9 KB in one setting
    var o = sp(), set = o.setProperty;
    o.setProperty = function (k, v) { if (String(v).length > 9 * 1024) throw new Error('Argument too large: value'); return set(k, v); };
    return o;
  };
  var names = Object.keys(env.globals);
  var api = new Function(names.join(','), src + '\nreturn { route_: route_, locked_: locked_, setOid: function (o) { CUR_OID = o; CUR_ACTION = "add"; TOUCHED = []; } };')
    .apply(null, names.map(function (n) { return env.globals[n]; }));
  env.props['piggy.watch'] = '1';
  return { env: env, api: api };
}
var checks = 0;
function check(name, fn) { fn(); checks++; console.log('  ok  ' + name); }

var w = load(), seq = 4000, writes = 0;
function oid() { seq++; return 'o' + seq + '_' + (1795000000000 + seq * 1000).toString(36) + 'abcde'; }
function save(o) { w.api.setOid(o); try { return w.api.locked_(function () { writes++; return { ok: true, row: 5 }; }); } catch (e) { return { ok: false, error: String(e.message || e) }; } }

check('600 changes in a row all succeed, and the list of finished changes stays under 9 KB', function () {
  for (var i = 0; i < 600; i++) { var r = save(oid()); assert.ok(r.ok, 'change ' + (i + 1) + ' failed: ' + r.error); }
  assert.strictEqual(writes, 600);
  assert.ok(w.env.props['piggy.ops'].length < 9 * 1024, 'list is ' + w.env.props['piggy.ops'].length + ' bytes');
});
check('a retried recent change is still recognised and not made again', function () {
  var o = oid(), before;
  assert.ok(save(o).ok);
  before = writes;
  var again = save(o);
  assert.ok(again.ok && again.dup, 'the retry should be answered as already made');
  assert.strictEqual(writes, before);
});
check('a change is never reported as failed because its id could not be stored', function () {
  var props = w.env.globals.PropertiesService.getScriptProperties;
  w.env.globals.PropertiesService.getScriptProperties = function () { var o = props(); o.setProperty = function () { throw new Error('Service unavailable'); }; return o; };
  var r = save(oid());
  w.env.globals.PropertiesService.getScriptProperties = props;
  assert.ok(r.ok, 'got ' + JSON.stringify(r));
});

var x = load();
check('a read sent as a POST (fresh as a number) works', function () {
  var r = x.api.route_({ action: 'pull', pass: 'test', fresh: 1 });
  assert.ok(r.ok, r.error);
  assert.ok(Array.isArray(r.tx));
});
check('after 20 wrong passcodes, even the right one is refused for a while', function () {
  for (var i = 0; i < 19; i++) assert.strictEqual(x.api.route_({ action: 'ping', pass: 'guess' + i }).error, 'bad_passcode');
  assert.ok(x.api.route_({ action: 'ping', pass: 'test' }).ok, 'still fine after 19');
  assert.strictEqual(x.api.route_({ action: 'ping', pass: 'guess19' }).error, 'bad_passcode');
  assert.strictEqual(x.api.route_({ action: 'ping', pass: 'test' }).error, 'locked');
  delete x.env.cache['piggy.bad'];                                       // ten minutes later (the cache entry expires)
  assert.ok(x.api.route_({ action: 'ping', pass: 'test' }).ok);
});
console.log(checks + ' checks passed');
