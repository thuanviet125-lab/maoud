const WebSocket = require('ws');
const net = require('net');
const url = require('url');

const TARGET_HOST = process.env.TARGET_HOST;
const TARGET_PORT = process.env.TARGET_PORT;

const AUTH_TOKEN = "abc123";

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', function (ws, req) {
    const q = url.parse(req.url, true).query;

    if (q.token !== AUTH_TOKEN) {
        ws.close();
        return;
    }

    const tcp = net.connect(TARGET_PORT, TARGET_HOST);

    ws.on('message', (msg) => tcp.write(msg));
    tcp.on('data', (data) => ws.send(data));

    ws.on('close', () => tcp.destroy());
    tcp.on('close', () => ws.close());
});
