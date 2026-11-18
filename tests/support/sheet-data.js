// A made-up but realistic Piggy sheet: about five years of entries (Jan 2022 up to "today"), the yearly
// spending grids, the "app budget" tab, trips, recurring bills, saved settings and goals.
// Everything is generated from a fixed seed, so every run sees exactly the same data.
'use strict';

function rng(seed) {                       // mulberry32: small, fast, repeatable
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// category, group, monthly budget, how many entries a month, typical amount, vendors
var CATS = [
  ['rent', 'bills', 1850, 1, [1850, 1850], ['Oak Street Apartments']],
  ['utilities', 'bills', 160, 2, [40, 120], ['City Power', 'Water Dept', 'Gas Co']],
  ['phone', 'bills', 65, 1, [65, 65], ['Mint Mobile']],
  ['internet', 'bills', 70, 1, [70, 70], ['Fiber One']],
  ['insurance', 'bills', 140, 1, [140, 140], ['State Mutual']],
  ['subscriptions', 'bills', 45, 3, [6, 18], ['Netflix', 'Spotify', 'iCloud', 'NYT']],
  ['tithing', 'giving', 520, 2, [260, 260], ['Church']],
  ['groceries', 'daily living', 650, 11, [18, 140], ['Trader Joe’s', 'Costco', 'Safeway', 'Whole Foods', 'Farmers market']],
  ['gas', 'daily living', 180, 5, [28, 62], ['Shell', 'Costco Gas', 'Chevron']],
  ['health', 'daily living', 90, 1, [15, 120], ['CVS', 'Dr. Patel', 'Walgreens']],
  ['car', 'daily living', 60, 1, [20, 180], ['Jiffy Lube', 'Car wash', 'DMV']],
  ['restaurants', 'going out', 260, 7, [14, 85], ['Chipotle', 'Sushi Zen', 'Pho 99', 'Taqueria', 'Olive Garden', 'Thai Basil']],
  ['coffee', 'going out', 45, 6, [4, 9], ['Starbucks', 'Blue Bottle', 'Local Grind']],
  ['entertainment', 'going out', 80, 2, [12, 60], ['AMC', 'Steam', 'Concert', 'Bowling']],
  ['shopping', 'one-time', 150, 3, [15, 140], ['Amazon', 'Target', 'REI', 'IKEA', 'Uniqlo']],
  ['gifts', 'one-time', 60, 1, [20, 90], ['Etsy', 'Amazon', 'Flowers']],
  ['travel', 'one-time', 120, 1, [80, 420], ['Delta', 'Airbnb', 'Hertz', 'Marriott']],
  ['savings', 'savings', 500, 1, [500, 500], ['Transfer to savings']]
];
var INCOME = [['paycheck', 2, [2600, 2600], ['Employer payroll']], ['side gigs', 1, [80, 420], ['Upwork', 'Etsy shop']]];
var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var NOTES = ['', '', '', '', '', 'split w/ Sam', 'birthday', 'work trip', 'refund pending', 'weekly shop'];

function pad(n) { return (n < 10 ? '0' : '') + n; }
function r2(n) { return Math.round(n * 100) / 100; }

// opts.today: the date the sheet is "as of" (default 2026-11-18). opts.from: first year (default 2022).
// opts.scale: multiply the entries per month (1 = about 3,200 rows over five years).
function build(opts) {
  opts = opts || {};
  var today = opts.today ? new Date(opts.today) : new Date('2026-11-18T12:00:00');
  var from = opts.from || 2022, scale = opts.scale || 1, rand = rng(opts.seed || 42);
  var ty = today.getFullYear(), tm = today.getMonth(), td = today.getDate();
  var logs = {};                               // 'e2024' -> [{m, v, c, a, n, d, tr, fs, ow, pb}] newest month first
  var trips = [
    ['Tahoe ski weekend', '2023-02-10', '2023-02-13', 900, 'cabin with friends', 'lodging: 450; food: 200'],
    ['Japan', '2024-04-02', '2024-04-16', 5200, 'tokyo + kyoto', 'travel: 2400; lodging: 1600; food: 900'],
    ['Portland', '2025-07-18', '2025-07-21', 800, '', ''],
    ['Mexico City', '2026-03-05', '2026-03-12', 2200, 'spring break', 'travel: 900; food: 600'],
    ['Thanksgiving at Mom’s', '2026-11-25', '2026-11-30', 600, '', '']
  ];
  function tripOn(day) {
    for (var i = 0; i < trips.length; i++) if (day >= trips[i][1] && day <= trips[i][2]) return trips[i][0];
    return '';
  }
  function add(k, y, m, e) { var key = k + y; (logs[key] = logs[key] || []).push(e); }
  for (var y = from; y <= ty; y++) {
    for (var m = 0; m < 12; m++) {
      if (y === ty && m > tm) break;
      var last = y === ty && m === tm ? td : new Date(y, m + 1, 0).getDate();
      var infl = Math.pow(1.035, y - from);
      CATS.forEach(function (c) {
        var n = Math.max(0, Math.round(c[3] * scale * (0.7 + rand() * 0.6)));
        if (c[3] === 1 && scale >= 1) n = rand() < 0.85 || c[1] === 'bills' ? 1 : 0;
        for (var i = 0; i < n; i++) {
          var day = 1 + Math.floor(rand() * last);
          var ds = y + '-' + pad(m + 1) + '-' + pad(day);
          var a = r2((c[4][0] + rand() * (c[4][1] - c[4][0])) * (c[1] === 'bills' ? 1 : infl));
          add('e', y, m, { m: m, v: c[5][Math.floor(rand() * c[5].length)], c: c[0], a: a, n: NOTES[Math.floor(rand() * NOTES.length)], d: ds,
            tr: c[0] === 'travel' || c[0] === 'restaurants' ? tripOn(ds) : '', fs: c[0] === 'travel' && rand() < 0.3 ? 'travel fund' : '',
            ow: c[0] === 'restaurants' && rand() < 0.05 ? r2(a / 2) : 0, pb: '' });
        }
      });
      INCOME.forEach(function (c) {
        var n = c[0] === 'paycheck' ? 2 : rand() < 0.6 ? 1 : 0;
        for (var i = 0; i < n; i++) {
          var day = c[0] === 'paycheck' ? (i ? 15 : 1) : 1 + Math.floor(rand() * last);
          if (day > last) continue;
          add('i', y, m, { m: m, v: c[3][Math.floor(rand() * c[3].length)], c: c[0], a: r2((c[2][0] + rand() * (c[2][1] - c[2][0])) * Math.pow(1.04, y - from)),
            n: '', d: y + '-' + pad(m + 1) + '-' + pad(day), tr: '', fs: '', ow: 0, pb: '' });
        }
      });
    }
  }
  // logs are newest-first by month, as the script expects; within a month, newest day first
  Object.keys(logs).forEach(function (k) { logs[k].sort(function (a, b) { return b.m - a.m || (a.d < b.d ? 1 : a.d > b.d ? -1 : 0); }); });

  var budget = [], row = 2;
  CATS.forEach(function (c) {
    budget.push([from * 12, c[1], c[0], c[2], row++, 'from 2022 budget']);
    if (c[1] !== 'bills') budget.push([2024 * 12, c[1], c[0], r2(c[2] * 1.08), row++, '']);
    if (c[0] === 'groceries') budget.push([2026 * 12 + 2, c[1], c[0], 720, row++, 'changed in app']);
  });
  INCOME.forEach(function (c) { budget.push([from * 12, 'income', c[0], c[0] === 'paycheck' ? 5200 : 200, row++, '']); });

  var recur = [
    ['Rent', 'rent', 1850, 1, false, '', 2, 1, 'm', ''],
    ['Power', 'utilities', 85, 12, false, 'varies', 3, 1, 'm', ''],
    ['Phone', 'phone', 65, 5, false, '', 4, 1, 'm', ''],
    ['Internet', 'internet', 70, 8, false, '', 5, 1, 'm', ''],
    ['Car insurance', 'insurance', 140, 20, false, '', 6, 1, 'm', ''],
    ['Netflix', 'subscriptions', 15.49, 14, false, '', 7, 1, 'm', ''],
    ['Spotify', 'subscriptions', 11.99, 3, false, '', 8, 1, 'm', ''],
    ['iCloud', 'subscriptions', 2.99, 9, false, '', 9, 1, 'm', ''],
    ['Amazon Prime', 'subscriptions', 139, 15, false, 'yearly', 10, 1, 'y', '2027-03-15'],
    ['Gym', 'health', 35, 1, false, '', 11, 1, 'm', '']
  ];
  var goals = [
    ['Emergency fund', 15000, 2027 * 12 + 5, 'savings', 4000, 2024 * 12, 'six months', 2],
    ['New car', 8000, 2028 * 12, '', 0, 2025 * 12 + 6, '', 3],
    ['Japan again', 6000, 2027 * 12 + 9, 'travel', 500, 2026 * 12, '', 4]
  ];
  var prefs = {
    cfg: { pal: 'coastline', mode: 'auto', style: 'classic', corners: 'soft', cards: 'outline', density: 'comfy', icon: 'piggy', iconc: 'gold', appname: 'Piggy', fsize: 'm', launchAdd: false },
    order: { groups: [], cats: {} }, catGroup: {}, alerts: { on: false }, yearly: {}, roll: {}, hideV: {}, pay: null, up: [],
    // hu: the month the "heads up" popup was last shown; this month, so tests aren't greeted by it (opts.headsUp brings it back)
    hu: opts.headsUp ? 0 : ty * 12 + tm, bc: 0, bm: {}, bl: {}, dv: {}, sp: {}, ck: {}, co: {}, ds: {}, bmo: 0, td: {}, ap: {}, at: Date.UTC(2026, 9, 1)
  };
  return { logs: logs, budget: budget, trips: trips, recur: recur, goals: goals, prefs: prefs, from: from };
}

// The yearly grids are worked out from the logs, the way the sheet's own SUMIFS formulas do.
function grids(sheet) {
  var byYear = {};
  Object.keys(sheet.logs).forEach(function (key) {
    var k = key[0], y = +key.slice(1);
    var g = byYear[y] = byYear[y] || {};
    sheet.logs[key].forEach(function (e) {
      var sec = k === 'i' ? 'income' : groupOf(e.c);
      var id = sec + '|' + e.c;
      (g[id] = g[id] || [sec, e.c, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])[2][e.m] += e.a;
    });
  });
  return Object.keys(byYear).map(function (y) {
    var rows = Object.keys(byYear[y]).map(function (id) { var r = byYear[y][id]; return [r[0], r[1], r[2].map(r2)]; });
    return { y: +y, rows: rows };
  });
}
function groupOf(c) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === c) return CATS[i][1]; return 'one-time'; }

// Sheet rows as the script numbers them: a header block, then one row per entry.
var FIRST_ROW = 4;
function rowsOf(list) { return list.map(function (e, i) { return i + FIRST_ROW; }); }

// The "pull" answer, in exactly the shape pull_() in the script returns.
function pullPayload(sheet, v) {
  var tx = [];
  Object.keys(sheet.logs).sort().forEach(function (key) {
    var k = key[0], y = +key.slice(1);
    sheet.logs[key].forEach(function (e, i) {
      tx.push([k, y, e.m, i + FIRST_ROW, e.v, e.c, e.a, e.n, e.d, e.tr, e.fs, e.ow, e.pb]);
    });
  });
  return {
    ok: true, v: v || 19, at: Date.now(), tx: tx, grids: grids(sheet),
    budget: sheet.budget.map(function (b) { return b.slice(); }),
    seed: { from: ['2022 budget'], tabs: ['2022 budget'], stale: false },
    trips: sheet.trips.map(function (t, i) { return [t[0], t[1], t[2], t[3], t[4], i + 2, t[5]]; }),
    recur: sheet.recur.map(function (b) { return b.slice(); }),
    prefs: sheet.prefs ? JSON.parse(JSON.stringify(sheet.prefs)) : null,
    goals: sheet.goals.map(function (g) { return g.slice(); })
  };
}

function count(sheet) { return Object.keys(sheet.logs).reduce(function (n, k) { return n + sheet.logs[k].length; }, 0); }

module.exports = { build: build, pullPayload: pullPayload, count: count, FIRST_ROW: FIRST_ROW, MON: MON, rowsOf: rowsOf };
