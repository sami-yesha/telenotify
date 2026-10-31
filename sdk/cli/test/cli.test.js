const { test } = require('node:test');
const assert = require('node:assert');
const { createServer } = require('node:http');
const { mkdtempSync, statSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Api } = require('../dist/api');
const { listen } = require('../dist/listen');
const { parse, run } = require('../dist/cli');
const { saveSettings, resolve, configPath } = require('../dist/config');

// A tiny HTTP server; returns its base URL and the requests it saw.
async function server(handler) {
  const seen = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) };
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
};

test('parses commands, flags and short options', () => {
  assert.deepStrictEqual(parse(['listen', '-f', 'http://localhost:3000/hook', '--print-json']), {
    command: 'listen',
    args: [],
    flags: { forward: 'http://localhost:3000/hook', 'print-json': true },
  });
  assert.deepStrictEqual(parse(['send', 'test_linked', 'Hello', 'there', '--key=tn_test_x']), {
    command: 'send',
    args: ['test_linked', 'Hello', 'there'],
    flags: { key: 'tn_test_x' },
  });
});

test('listen forwards each event with the exact body and signature, then keeps the cursor', async () => {
  const body = JSON.stringify({ id: 'evt-1', event: 'message.sent', data: { id: 'm1' } });
  const cursors = [];
  const api = await server((req, res) => {
    if (req.url === '/v1/cli/listen') return json(res, 200, { environment: 'sandbox', organization: 'Abebe', webhookUrl: null, cursor: 'c0', renewEverySeconds: 30 });
    const cursor = new URL(req.url, 'http://x').searchParams.get('cursor');
    cursors.push(cursor);
    if (cursor === 'c0') return json(res, 200, { events: [{ id: 'evt-1', event: 'message.sent', createdAt: new Date().toISOString(), body, signature: 't=1,v1=abc' }], cursor: 'c1' });
    return json(res, 200, { events: [], cursor });
  });
  const local = await server((req, res) => json(res, 200, { ok: true }));
  const controller = new AbortController();
  const lines = [];
  const done = listen(new Api(api.url, 'tn_test_key'), { forward: `${local.url}/hooks`, pollMs: 20, log: (l) => lines.push(l), signal: controller.signal });
  while (local.seen.length === 0 || cursors.length < 2) await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await done;

  const [delivery] = local.seen;
  assert.strictEqual(delivery.url, '/hooks');
  assert.strictEqual(delivery.body, body);
  assert.strictEqual(delivery.headers['x-telenotify-signature'], 't=1,v1=abc');
  assert.strictEqual(delivery.headers['x-telenotify-event-id'], 'evt-1');
  assert.strictEqual(api.seen[0].headers['x-api-key'], 'tn_test_key');
  assert.deepStrictEqual(cursors.slice(0, 2), ['c0', 'c1']);
  assert.ok(lines.some((l) => l.includes('message.sent') && l.includes('200')));
  await Promise.all([api.close(), local.close()]);
});

test('listen reports a local server that is down instead of crashing', async () => {
  const api = await server((req, res) => {
    if (req.url === '/v1/cli/listen') return json(res, 200, { environment: 'sandbox', organization: 'Abebe', webhookUrl: null, cursor: null, renewEverySeconds: 30 });
    return json(res, 200, { events: [{ id: 'evt-2', event: 'customer.linked', createdAt: new Date().toISOString(), body: '{}', signature: 't=1,v1=x' }], cursor: 'c1' });
  });
  const controller = new AbortController();
  const lines = [];
  const done = listen(new Api(api.url, 'k'), { forward: 'http://127.0.0.1:9', pollMs: 20, log: (l) => lines.push(l), signal: controller.signal });
  while (!lines.some((l) => l.includes('customer.linked'))) await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await done;
  assert.ok(lines.some((l) => /refused|failed|fetch/i.test(l)));
  await api.close();
});

test('listen stops with a clear error on a bad key', async () => {
  const api = await server((req, res) => json(res, 401, { message: 'Invalid API key' }));
  await assert.rejects(listen(new Api(api.url, 'bad'), { log: () => {} }), /Invalid API key/);
  await api.close();
});

test('login checks the key and saves it readable only by you', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'telenotify-cli-'));
  process.env.TELENOTIFY_CONFIG = join(dir, 'config.json');
  const api = await server((req, res) => json(res, 200, { events: [], cursor: null }));
  const lines = [];
  assert.strictEqual(await run(['login', '--key', 'tn_test_abc', '--api-url', api.url], (l) => lines.push(l)), 0);
  assert.strictEqual(api.seen[0].url, '/v1/cli/events');
  assert.deepStrictEqual(JSON.parse(readFileSync(configPath(), 'utf8')), { apiKey: 'tn_test_abc', apiUrl: api.url });
  assert.strictEqual(statSync(configPath()).mode & 0o777, 0o600);
  assert.strictEqual(resolve({}).apiKey, 'tn_test_abc');
  await assert.rejects(run(['login', '--key', 'not-a-key'], () => {}), /doesn’t look like/);
  delete process.env.TELENOTIFY_CONFIG;
  await api.close();
});

test('flags beat the environment, which beats the saved login', () => {
  const dir = mkdtempSync(join(tmpdir(), 'telenotify-cli-'));
  const env = { TELENOTIFY_CONFIG: join(dir, 'c.json') };
  saveSettings({ apiKey: 'tn_test_saved' }, env);
  assert.strictEqual(resolve({}, env).apiKey, 'tn_test_saved');
  assert.strictEqual(resolve({}, { ...env, TELENOTIFY_API_KEY: 'tn_test_env' }).apiKey, 'tn_test_env');
  assert.strictEqual(resolve({ key: 'tn_test_flag' }, { ...env, TELENOTIFY_API_KEY: 'tn_test_env' }).apiKey, 'tn_test_flag');
  assert.strictEqual(resolve({}, env).apiUrl, 'https://telenotify-api.duckdns.org');
});

test('trigger and send call the API and print the result', async () => {
  const api = await server((req, res, body) => {
    if (req.url === '/v1/cli/trigger') return json(res, 202, { id: 'evt-9', event: JSON.parse(body).event, sentToWebhookUrl: false });
    return json(res, 202, { id: 'msg-1', status: 'UNDELIVERABLE', reason: 'not_linked', to: 'test_not_linked' });
  });
  const lines = [];
  assert.strictEqual(await run(['trigger', 'message.failed', '--key', 'tn_test_k', '--api-url', api.url], (l) => lines.push(l)), 0);
  assert.strictEqual(await run(['send', 'test_not_linked', 'Hi', '**there**', '--markdown', '--key', 'tn_test_k', '--api-url', api.url], (l) => lines.push(l)), 0);
  assert.deepStrictEqual(JSON.parse(api.seen[1].body), { to: 'test_not_linked', text: 'Hi **there**', format: 'markdown' });
  assert.ok(lines[0].includes('message.failed') && lines[1].includes('UNDELIVERABLE') && lines[1].includes('not_linked'));
  await api.close();
});
