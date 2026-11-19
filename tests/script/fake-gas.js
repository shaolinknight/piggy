// A tiny stand-in for the Google Apps Script services the sheet script's pull uses, so its caching can be tested in
// Node. Only what pull_ touches is here; anything else throws, so a missing piece shows up loudly.
'use strict';
function Range(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
Range.prototype.getValues = function () {
  var out = [];
  for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) { var v = (this.sheet.vals[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); }
  this.sheet.reads++;
  return out;
};
Range.prototype.getValue = function () { return this.getValues()[0][0]; };
Range.prototype.getDisplayValues = Range.prototype.getValues;
function Sheet(name, id, vals) { this.name = name; this.id = id; this.vals = vals; this.reads = 0; }
Sheet.prototype.getName = function () { return this.name; };
Sheet.prototype.getSheetId = function () { return this.id; };
Sheet.prototype.getLastRow = function () { return this.vals.length; };
Sheet.prototype.getLastColumn = function () { return this.vals.reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
Sheet.prototype.getMaxRows = Sheet.prototype.getLastRow;
Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); };
Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };

function install(sheets) {
  var props = {}, cache = {}, triggers = [{ getHandlerFunction: function () { return 'piggyChanged'; } }];
  var ss = {
    getSheets: function () { return sheets; },
    getSheetByName: function (n) { return sheets.filter(function (s) { return s.name === n; })[0] || null; },
    getName: function () { return 'Fake budget'; },
    getSpreadsheetTimeZone: function () { return 'America/Denver'; },
    getId: function () { return 'fake'; }
  };
  var g = {
    SpreadsheetApp: { getActive: function () { return ss; }, getActiveSpreadsheet: function () { return ss; } },
    PropertiesService: { getScriptProperties: function () { return {
      getProperty: function (k) { return k in props ? props[k] : null; },
      setProperty: function (k, v) { props[k] = String(v); },
      deleteProperty: function (k) { delete props[k]; },
      getProperties: function () { return Object.assign({}, props); }
    }; } },
    CacheService: { getScriptCache: function () { return {
      get: function (k) { return k in cache ? cache[k] : null; },
      getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (k in cache) o[k] = cache[k]; }); return o; },
      put: function (k, v) { cache[k] = v; },
      putAll: function (o) { Object.keys(o).forEach(function (k) { cache[k] = o[k]; }); }
    }; } },
    ScriptApp: { getProjectTriggers: function () { return triggers; } },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
    Session: { getScriptTimeZone: function () { return 'America/Denver'; } },
    Logger: { log: function () {} },
    Utilities: { formatDate: function (d) { return d.toISOString().slice(0, 10); }, parseDate: function (s) { return new Date(s); } },
    ContentService: { createTextOutput: function (t) { return { setMimeType: function () { return t; } }; }, MimeType: { JSON: 'json' } }
  };
  return { globals: g, props: props, cache: cache };
}
module.exports = { Sheet: Sheet, install: install };
