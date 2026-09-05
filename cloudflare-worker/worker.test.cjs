const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, 'worker.js'), 'utf8');

function handler(fetch) {
  const sandbox = { Request, Response, Headers, URL, AbortSignal, fetch, addEventListener() {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.handleRequest;
}

test('worker liveness works independently; health still checks the backend', async () => {
  const handle = handler(async () => { throw new Error('connection refused'); });
  const live = await handle(new Request('https://example.test/health/live'));
  assert.equal(live.status, 200);
  assert.equal((await live.json()).scope, 'worker');
  const health = await handle(new Request('https://example.test/health'));
  assert.equal(health.status, 502);
  assert.equal((await health.json()).error, 'upstream_unreachable');
});

test('validation keeps Japanese address, query parameters and backend verdict', async () => {
  const handle = handler(async (url, init) => {
    assert.equal(url.host, 'japanaddrdb-origin.temazero.ai:3000');
    assert.equal(url.pathname, '/validate');
    assert.equal(url.searchParams.get('address'), '東京都千代田区紀尾井町1-3');
    assert.equal(init.redirect, 'manual');
    assert.ok(init.signal);
    return Response.json({ exists: true, exact: true, status: 'exact_match' });
  });
  const result = await handle(new Request('https://example.test/validate?address=' + encodeURIComponent('東京都千代田区紀尾井町1-3')));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).exists, true);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), '*');
});

test('a protocol-relative path cannot override the origin hostname', async () => {
  const handle = handler(async (url) => {
    assert.equal(url.hostname, 'japanaddrdb-origin.temazero.ai');
    return new Response('ok');
  });
  await handle(new Request('https://example.test//attacker.example/validate'));
});

test('upstream failures are errors, never an address-not-found verdict', async () => {
  const handle = handler(async () => new Response('origin is down', { status: 522 }));
  const result = await handle(new Request('https://example.test/validate?address=test'));
  assert.equal(result.status, 502);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  const body = await result.json();
  assert.equal(body.status, 'unavailable');
  assert.equal(body.upstream_status, 522);
  assert.equal(Object.hasOwn(body, 'exists'), false);
});
