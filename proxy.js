/**
 * WSS ↔ xmrig-proxy bridge — Northflank edition
 * Northflank inject PORT tự động, TLS do Northflank lo
 */

const WebSocket = require('ws');
const net       = require('net');
const http      = require('http');
const os        = require('os');

const WS_PORT    = parseInt(process.env.PORT || process.env.WS_PORT || 8080);
const XMRIG_HOST = process.env.XMRIG_HOST || '127.0.0.1';
const XMRIG_PORT = parseInt(process.env.XMRIG_PORT || 3333);
const STATS_PORT = parseInt(process.env.STATS_PORT || 9000);

const stats = {
  startTime   : Date.now(),
  connections : 0,
  active      : 0,
  bytesIn     : 0,
  bytesOut    : 0,
  errors      : 0,
  clients     : new Map(),
};
let connId = 0;

// ── HTTP server (Northflank terminate TLS bên ngoài) ────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws, req) => {
  const ip = (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  ).replace('::ffff:', '');

  const id = ++connId;
  stats.connections++;
  stats.active++;
  stats.clients.set(id, { ip, connectedAt: Date.now(), bytesIn: 0, bytesOut: 0 });

  log('WS', `[#${id}] ${ip} connected`);

  const tcp = net.createConnection({ host: XMRIG_HOST, port: XMRIG_PORT }, () => {
    log('TCP', `[#${id}] upstream ok`);
  });

  let buf = '';

  ws.on('message', (data) => {
    try {
      const str = data.toString();
      const msg = str.endsWith('\n') ? str : str + '\n';
      if (tcp.writable) {
        tcp.write(msg);
        const b = Buffer.byteLength(msg);
        stats.bytesIn += b;
        stats.clients.get(id) && (stats.clients.get(id).bytesIn += b);
        dbg(`WS→TCP [#${id}]`, str.trim());
      }
    } catch (e) { stats.errors++; log('ERR', e.message); }
  });

  tcp.on('data', (data) => {
    try {
      buf += data.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(line);
          const b = Buffer.byteLength(line + '\n');
          stats.bytesOut += b;
          stats.clients.get(id) && (stats.clients.get(id).bytesOut += b);
          dbg(`TCP→WS [#${id}]`, line);
        }
      }
    } catch (e) { stats.errors++; log('ERR', e.message); }
  });

  const cleanup = () => {
    if (stats.clients.has(id)) {
      stats.active--;
      stats.clients.delete(id);
      log('WS', `[#${id}] ${ip} disconnected`);
    }
  };

  ws.on('close',  () => { cleanup(); tcp.destroy(); });
  tcp.on('close', () => { cleanup(); if (ws.readyState === WebSocket.OPEN) ws.close(); });
  ws.on('error',  (e) => { stats.errors++; log('ERR-WS',  `[#${id}] ${e.message}`); });
  tcp.on('error', (e) => { stats.errors++; log('ERR-TCP', `[#${id}] ${e.message}`); tcp.destroy(); });
});

httpServer.listen(WS_PORT, '0.0.0.0', () => {
  log('SYS', `WS proxy :${WS_PORT} → ${XMRIG_HOST}:${XMRIG_PORT}`);
});

// ── Stats API (internal) ────────────────────────────────────
const statsServer = http.createServer((req, res) => {
  if (req.url !== '/stats' && req.url !== '/') return (res.writeHead(404), res.end());
  const payload = {
    uptime_sec  : Math.floor((Date.now() - stats.startTime) / 1000),
    connections : { total: stats.connections, active: stats.active },
    traffic     : { bytes_in: stats.bytesIn, bytes_out: stats.bytesOut },
    errors      : stats.errors,
    upstream    : `${XMRIG_HOST}:${XMRIG_PORT}`,
    clients     : [...stats.clients.entries()].map(([cid, c]) => ({
      id: cid, ip: c.ip,
      connected_sec: Math.floor((Date.now() - c.connectedAt) / 1000),
      bytes_in: c.bytesIn, bytes_out: c.bytesOut,
    })),
    system: {
      hostname   : os.hostname(),
      load       : os.loadavg()[0].toFixed(2),
      mem_free_mb: Math.floor(os.freemem() / 1024 / 1024),
    },
  };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(payload, null, 2));
});
statsServer.listen(STATS_PORT, '127.0.0.1', () => {
  log('SYS', `Stats API :${STATS_PORT}/stats`);
});

const DEBUG = process.env.DEBUG === '1';
const ts    = () => new Date().toISOString();
function log(tag, ...a) { console.log(`${ts()} [${tag}]`, ...a); }
function dbg(...a)       { if (DEBUG) console.log(ts(), ...a); }

process.on('SIGTERM', () => { log('SYS', 'SIGTERM'); process.exit(0); });
process.on('SIGINT',  () => { log('SYS', 'SIGINT');  process.exit(0); });
