// Runs in the page before any of the app's code (as an init script). It times what the app does without
// changing the app, so the same measurements keep working in every later phase:
//   - boot() starts:            the app's first read of its saved data (localStorage 'runway.v1')
//   - a render() wrote #view:   every write to #view.innerHTML (render() draws the whole tab that way)
//   - sync / pull:              the app's fetch calls to the sheet, when each was sent, answered and parsed
//   - long tasks, frames:       where the browser supports them
// Everything is in performance.now() milliseconds from the start of the page load.
/* global window, document, performance, Storage, Element, PerformanceObserver */
module.exports = function instrument(opts) {
  var T = window.__perf = { getItem: null, setItems: [], view: [], fetch: [], hero: null, longtasks: [], down: [], marks: {} };
  var now = function () { return performance.now(); };

  // a fixed date that still moves (Playwright's clock would also freeze timers and performance.now)
  if (opts && opts.today) {
    var D = window.Date, off = new D(opts.today).getTime() - D.now();
    var PD = function () {
      if (!(this instanceof PD)) return new D(D.now() + off).toString();
      return arguments.length ? Reflect.construct(D, Array.prototype.slice.call(arguments), PD) : Reflect.construct(D, [D.now() + off], PD);
    };
    PD.prototype = D.prototype; PD.now = function () { return D.now() + off; }; PD.UTC = D.UTC; PD.parse = D.parse;
    window.Date = PD;
  }

  var gi = Storage.prototype.getItem, si = Storage.prototype.setItem;
  Storage.prototype.getItem = function (k) {
    if (k === 'runway.v1' && T.getItem === null) T.getItem = now();
    return gi.apply(this, arguments);
  };
  Storage.prototype.setItem = function (k, v) {
    var t0 = now(), r = si.apply(this, arguments);
    if (k === 'runway.v1') T.setItems.push({ at: t0, ms: now() - t0, len: String(v).length });
    return r;
  };

  var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true, get: desc.get,
    set: function (v) {
      desc.set.call(this, v);
      if (this.id !== 'view') return;
      var t = now(), hero = !!this.querySelector('.card.hero');
      T.view.push({ at: t, hero: hero, skel: !!this.querySelector('.skel'), len: String(v).length });
      if (hero && T.hero === null) T.hero = t;
    }
  });

  var f = window.fetch;
  window.fetch = function (u, o) {
    var url = String((u && u.url) || u), e = { start: now(), action: '' };
    var m = /[?&]action=([a-z]+)/.exec(url);
    if (m) e.action = m[1];
    else if (o && typeof o.body === 'string') { try { e.action = JSON.parse(o.body).action || ''; } catch (x) {} }
    if (/fonts\.|\.woff|sw\.js/.test(url) || (!e.action && !/exec/.test(url))) return f.apply(this, arguments);
    T.fetch.push(e);
    return f.apply(this, arguments).then(function (r) {
      e.headers = now();
      // the body has arrived (the app reads it as JSON, or from 2.49 the pull as text, to fingerprint it)
      var j = r.json, tx = r.text;
      r.json = function () { return j.call(r).then(function (d) { e.json = now(); return d; }); };
      r.text = function () { return tx.call(r).then(function (d) { e.json = now(); return d; }); };
      return r;
    }, function (err) { e.failed = now(); throw err; });
  };

  // when a finger went down (click/submit as a fallback: a tap on the sheet's Save button doesn't always show a touch event)
  ['touchstart', 'pointerdown', 'mousedown', 'click', 'submit'].forEach(function (ev) {
    window.addEventListener(ev, function () { var t = now(); if (!T.down.length || t - T.down[T.down.length - 1] > 50) T.down.push(t); }, true);
  });

  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) { T.longtasks.push({ at: e.startTime, ms: e.duration }); });
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
};
