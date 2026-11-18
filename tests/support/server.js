// A small static server for site files, close enough to Cloudflare's asset serving for tests:
//  - gzip or brotli when the browser asks (Cloudflare compresses text the same way)
//  - an ETag on every file and a 304 when it matches, which is what the service worker's
//    `cache: 'no-cache'` fetch relies on to notice (or not notice) a new deploy
//  - "/index.html" redirects to "/", like Cloudflare does
//  - `deploy(path, text)` swaps a file's content in memory, so a test can ship a "new version"
//    without touching the real files
//  - `transform(path, buffer)` (optional) rewrites a file as it's served; perf uses it to add timing marks
// Run on its own: `node support/server.js [port] [dir]`.
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');

var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8'
};
var TEXTY = /^(text\/|application\/(json|manifest\+json)|image\/svg)/;

function start(opts) {
  opts = opts || {};
  var dir = path.resolve(opts.dir || path.join(__dirname, '..', '..', 'public'));
  var overrides = {};           // url path -> Buffer
  var hits = [];                // what was asked for, for tests that care
  var packed = {};              // compressed bodies by encoding + ETag

  function read(p) {
    if (overrides[p]) return overrides[p];
    var file = path.join(dir, p);
    if (file.indexOf(dir) !== 0) return null;
    try { return fs.statSync(file).isFile() ? fs.readFileSync(file) : null; } catch (e) { return null; }
  }

  var server = http.createServer(function (req, res) {
    var u = new URL(req.url, 'http://x');
    var p = decodeURIComponent(u.pathname);
    hits.push(p);
    if (p === '/index.html') { res.writeHead(307, { Location: '/' + u.search }); return res.end(); }
    if (p === '/' || p === '') p = '/index.html';
    var body = read(p);
    if (!body) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    if (opts.transform) body = Buffer.from(opts.transform(p, body));
    var type = TYPES[path.extname(p)] || 'application/octet-stream';
    var etag = '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    var head = { 'Content-Type': type, 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: etag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
    var ae = String(req.headers['accept-encoding'] || '');
    if (opts.compress !== false && TEXTY.test(type) && body.length > 1024) {
      // compressed once per version of a file, as a CDN would (brotli at full strength takes ~1 s on 750 KB)
      var enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : '';
      if (enc) {
        var ck = enc + etag;
        if (!packed[ck]) packed[ck] = enc === 'br' ? zlib.brotliCompressSync(body) : zlib.gzipSync(body);
        head['Content-Encoding'] = enc; body = packed[ck];
      }
    }
    head['Content-Length'] = body.length;
    res.writeHead(200, head);
    res.end(req.method === 'HEAD' ? undefined : body);
  });

  return new Promise(function (resolve) {
    server.listen(opts.port || 0, '127.0.0.1', function () {
      var port = server.address().port;
      resolve({
        port: port,
        url: 'http://127.0.0.1:' + port + '/',
        hits: hits,
        deploy: function (p, text) { overrides[p] = Buffer.from(text); },
        original: function (p) { return fs.readFileSync(path.join(dir, p), 'utf8'); },
        close: function () { return new Promise(function (r) { server.closeAllConnections(); server.close(function () { r(); }); }); }
      });
    });
  });
}

module.exports = { start: start };

if (require.main === module) {
  start({ port: +process.argv[2] || 4173, dir: process.argv[3] }).then(function (s) { console.log('Piggy site on ' + s.url); });
}
