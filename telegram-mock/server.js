// Tiny Telegram Bot API stand-in: POST /bot<token>/sendMessage answers like Telegram does,
// GET / shows every message received (the "patient's phone"), GET /messages returns them as JSON.
const http = require('http');

const messages = [];
let nextId = 1000;

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function inboxPage() {
  const rows = messages
    .slice()
    .reverse()
    .map(
      (m) => `<div class="msg"><div class="meta">chat_id <b>${esc(m.chat_id)}</b> · message_id ${m.message_id} · ${esc(m.receivedAt)} · token ${esc(m.tokenHint)}</div><div class="text">${esc(m.text)}</div></div>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Telegram mock inbox</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#e6ebee;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}p{color:#555;margin:0 0 16px}
.msg{background:#fff;border-radius:12px;padding:12px 16px;margin:0 0 10px;max-width:900px;box-shadow:0 1px 2px #0002}
.meta{font-size:12px;color:#5b7083;margin-bottom:4px}.text{font-size:15px;white-space:pre-wrap}</style></head>
<body><h1>Telegram Bot API mock – sendMessage inbox</h1><p>${messages.length} message(s) received from the Camunda REST Outbound Connector</p>${rows}</body></html>`;
}

http
  .createServer((req, res) => {
    const match = req.url.match(/^\/bot([^/]+)\/sendMessage/);
    if (req.method === 'POST' && match) {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          return send(res, 400, 'application/json', JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: invalid JSON' }));
        }
        if (body.chat_id === undefined || body.chat_id === null || !body.text) {
          return send(res, 400, 'application/json', JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request: chat_id and text are required' }));
        }
        const token = match[1];
        const msg = {
          message_id: nextId++,
          chat_id: body.chat_id,
          text: body.text,
          receivedAt: new Date().toISOString(),
          tokenHint: token.length > 6 ? token.slice(0, 3) + '…' + token.slice(-3) : token,
        };
        messages.push(msg);
        console.log(`sendMessage chat_id=${msg.chat_id}: ${msg.text}`);
        send(res, 200, 'application/json', JSON.stringify({
          ok: true,
          result: { message_id: msg.message_id, chat: { id: msg.chat_id, type: 'private' }, date: Math.floor(Date.now() / 1000), text: msg.text },
        }));
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/messages') return send(res, 200, 'application/json', JSON.stringify(messages));
    if (req.method === 'GET' && req.url === '/') return send(res, 200, 'text/html; charset=utf-8', inboxPage());
    send(res, 404, 'application/json', JSON.stringify({ ok: false, error_code: 404, description: 'Not Found' }));
  })
  .listen(8081, () => console.log('Telegram mock listening on 8081'));
