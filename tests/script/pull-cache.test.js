// The sheet script's pull (public/script.txt), run against fake Google services: remembered tabs must give exactly
// what a full read gives, and must be re-read whenever they may have changed.   node tests/script/pull-cache.test.js
'use strict';
var fs = require('fs'), path = require('path'), assert = require('assert');
var fake = require('./fake-gas');
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'script.txt'), 'utf8').replace("var PASSCODE = 'CHANGE-ME';", "var PASSCODE = 'test';");

function log(name, id, rows) { return new fake.Sheet(name, id, [['month', 'store', 'category', 'amount', 'notes', 'date']].concat(rows)); }
function world() {
  var sheets = [
    log('expenses 2025', 1, [['December', 'Costco', 'groceries', 80, '', ''], ['November', 'Shell', 'gas', 40, '', '']]),
    log('expenses 2026', 2, [['November', 'Safeway', 'groceries', 55.5, '', ''], ['October', 'Chipotle', 'restaurants', 12, '', '']]),
    log('income 2026', 3, [['November', 'Employer', 'paycheck', 2600, '', '']]),
    new fake.Sheet('2026 spending', 4, [['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      ['groceries', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]),
    new fake.Sheet('app budget', 5, [['starting', 'group', 'category', 'monthly amount', 'notes'], [new Date(2026, 0, 1), 'daily living', 'groceries', 600, '']])
  ];
  var env = fake.install(sheets);
  var names = Object.keys(env.globals), run = new Function(names.join(','), src + '\nreturn { route_: route_, onEdit: onEdit, piggyChanged: piggyChanged, changed: function (a, sh) { CUR_ACTION = a; TOUCHED = [sh]; changed_(); } };');
  var api = run.apply(null, names.map(function (n) { return env.globals[n]; }));
  env.props['piggy.watch'] = '1';
  return { sheets: sheets, env: env, api: api };
}
function pull(w, fresh) {
  w.sheets.forEach(function (s) { s.reads = 0; });
  var r = w.api.route_({ action: 'pull', pass: 'test', fresh: fresh ? '1' : '' });
  assert.ok(r.ok, 'pull failed: ' + r.error);
  var read = w.sheets.filter(function (s) { return s.reads; }).map(function (s) { return s.name; });
  ['at', 'ms', 't', 'stamp', 'cached', 'watch'].forEach(function (k) { delete r[k]; });
  return { data: r, read: read };
}
var LOGS_AND_GRID = ['expenses 2025', 'expenses 2026', 'income 2026', '2026 spending'];
var checks = 0;
function check(name, fn) { fn(); checks++; console.log('  ok  ' + name); }

var w = world();
var first = pull(w);
check('a first read reads every tab', function () { LOGS_AND_GRID.concat(['app budget']).forEach(function (n) { assert.ok(first.read.indexOf(n) >= 0, n + ' was not read'); }); });
var second = pull(w);
check('nothing changed: logs, grid and budget come from the cache', function () { LOGS_AND_GRID.concat(['app budget']).forEach(function (n) { assert.ok(second.read.indexOf(n) < 0, n + ' was read again'); }); });
check('…and give exactly what a full read gives', function () { assert.deepStrictEqual(second.data, first.data); });

// the app saves an entry into 2026 expenses
w.sheets[1].vals.splice(1, 0, ['November', 'New Cafe', 'coffee', 4.5, '', '']);
w.api.changed('add', w.sheets[1]);
var afterAdd = pull(w);
check('after the app saves into a tab, only that tab and its year’s grid are read again', function () {
  assert.deepStrictEqual(afterAdd.read.filter(function (n) { return LOGS_AND_GRID.indexOf(n) >= 0; }).sort(), ['2026 spending', 'expenses 2026']);
});
check('…and the answer matches a full read', function () { assert.deepStrictEqual(afterAdd.data, pull(w, true).data); });

// typed in the sheet by hand (even in another year's tab)
w.sheets[0].vals[1][3] = 99;
w.api.onEdit({ range: { getSheet: function () { return w.sheets[0]; } } });
var afterHand = pull(w);
check('after a hand edit, every tab is read again', function () { LOGS_AND_GRID.forEach(function (n) { assert.ok(afterHand.read.indexOf(n) >= 0, n + ' not re-read'); }); });
check('…and the edit is in the answer', function () { assert.ok(afterHand.data.tx.some(function (t) { return t[1] === 2025 && t[6] === 99; })); });

w.api.piggyChanged({ changeType: 'REMOVE_ROW' });
check('rows removed by hand: every tab is read again', function () { var r = pull(w); LOGS_AND_GRID.forEach(function (n) { assert.ok(r.read.indexOf(n) >= 0, n); }); });

pull(w);
check('a refresh you ask for reads every tab', function () { var r = pull(w, true); LOGS_AND_GRID.forEach(function (n) { assert.ok(r.read.indexOf(n) >= 0, n); }); });
w.env.props['piggy.watch'] = '';
check('without the hand-edit watcher, every tab is read', function () { var r = pull(w); LOGS_AND_GRID.forEach(function (n) { assert.ok(r.read.indexOf(n) >= 0, n); }); });
w.env.props['piggy.watch'] = '1';

w.api.changed('prefs', w.sheets[4]);
check('saving settings keeps the remembered tabs', function () { var r = pull(w); assert.deepStrictEqual(r.read.filter(function (n) { return LOGS_AND_GRID.indexOf(n) >= 0; }), []); });
w.api.changed('budget', w.sheets[4]);
check('changing a budget reads everything again', function () { var r = pull(w); assert.ok(r.read.indexOf('app budget') >= 0 && r.read.indexOf('2026 spending') >= 0); });

console.log(checks + ' checks passed');
