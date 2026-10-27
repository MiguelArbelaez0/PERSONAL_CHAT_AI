const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const extensionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const extensionUrl = `chrome-extension://${extensionId}`;
const workerSender = { id: extensionId, url: `${extensionUrl}/background.js` };
const wrongSender = { id: extensionId, url: `${extensionUrl}/connection.html` };
const bearer = 'synthetic-offscreen-bearer-never-return-this-value';

function createOffscreen({ result = { type: 'RESULT', status: 200, httpOk: true, contentLength: 2, bodyText: '{}' } } = {}) {
  const listeners = [];
  const workers = [];
  const chrome = { runtime: {
    id: extensionId,
    getURL: (file) => `${extensionUrl}/${file}`,
    onMessage: { addListener: (listener) => listeners.push(listener) },
  } };
  class FakeWorker {
    constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
    postMessage(message) {
      if (message.type === 'CANCEL') {
        this.onmessage?.({ data: { type: 'ERROR', requestId: this.requestId, errorCode: 'request_timeout_or_cancelled' } });
      } else {
        this.sent = message;
        this.requestId = message.requestId;
        if (result.type !== 'WAIT') this.onmessage?.({ data: { ...result, requestId: message.requestId } });
      }
    }
    terminate() { this.terminated = true; }
  }
  const context = vm.createContext({ chrome, Worker: FakeWorker, TextEncoder, URL, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'offscreen.js'), 'utf8'), context);
  const listener = listeners[0];
  const request = {
    url: 'http://127.0.0.1:8000/api/suggestions', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: '{"message":"synthetic"}', timeoutMs: 90_000,
  };
  const send = (message, sender = workerSender) => new Promise((resolve) => {
    const keepOpen = listener(message, sender, resolve);
    if (keepOpen !== true) resolve(undefined);
  });
  return { send, workers, request, listener };
}

test('offscreen accepts only the extension service worker and the two bounded local POST routes', async () => {
  const offscreen = createOffscreen();
  const ignored = await offscreen.send({ target: 'pcai-offscreen', type: 'FETCH', requestId: 'x', request: offscreen.request }, wrongSender);
  assert.equal(ignored, undefined);
  const result = await offscreen.send({ target: 'pcai-offscreen', type: 'FETCH', requestId: 'valid-1', request: offscreen.request });
  assert.equal(result.ok, true);
  assert.equal(result.bodyText, '{}');
  assert.equal(offscreen.workers[0].url, `${extensionUrl}/offscreen-fetch-worker.js`);
  assert.equal(offscreen.workers[0].sent.headers.Authorization, `Bearer ${bearer}`);
  assert.equal(offscreen.workers[0].terminated, true);

  for (const badRequest of [
    { ...offscreen.request, url: 'https://example.com/api/suggestions' },
    { ...offscreen.request, url: 'http://127.0.0.1:8000/api/accounts' },
    { ...offscreen.request, method: 'GET' },
    { ...offscreen.request, headers: { ...offscreen.request.headers, 'X-Extra': 'no' } },
    { ...offscreen.request, timeoutMs: 280_001 },
    { ...offscreen.request, body: 'x'.repeat(65 * 1024) },
  ]) {
    const rejected = await offscreen.send({ target: 'pcai-offscreen', type: 'FETCH', requestId: 'invalid', request: badRequest });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.errorCode, 'offscreen_request_rejected');
  }
  assert.equal(offscreen.workers.length, 1);
});

test('offscreen bridge bounds backend responses and does not expose its bearer in bridge errors', async () => {
  const oversized = createOffscreen({ result: { type: 'RESULT', requestId: 'large', status: 200, httpOk: true, contentLength: 600_000, bodyText: '{}'} });
  const result = await oversized.send({ target: 'pcai-offscreen', type: 'FETCH', requestId: 'large', request: oversized.request });
  assert.deepEqual({ ok: result.ok, errorCode: result.errorCode }, { ok: false, errorCode: 'response_too_large' });
  assert.equal(JSON.stringify(result).includes(bearer), false);
});

test('offscreen cancellation is accepted only from the service worker and targets the matching worker', async () => {
  const offscreen = createOffscreen({ result: { type: 'WAIT', status: 0, httpOk: false, bodyText: '' } });
  const invalid = await offscreen.send({ target: 'pcai-offscreen', type: 'CANCEL', requestId: 'cancel-1' }, wrongSender);
  assert.equal(invalid, undefined);
  const promise = offscreen.send({ target: 'pcai-offscreen', type: 'FETCH', requestId: 'cancel-1', request: offscreen.request });
  const acknowledged = await offscreen.send({ target: 'pcai-offscreen', type: 'CANCEL', requestId: 'cancel-1' });
  assert.equal(acknowledged.ok, true);
  const result = await promise;
  assert.equal(result.errorCode, 'request_timeout_or_cancelled');
  assert.equal(offscreen.workers[0].terminated, true);
});

test('dedicated worker uses bounded, credential-free local fetch options and returns only bounded text', async () => {
  let messageHandler;
  const calls = [];
  const self = { postMessage: (value) => calls.push(value) };
  const responseBody = new TextEncoder().encode('{"ok":true}');
  const response = {
    status: 200, ok: true,
    headers: { get: (name) => name === 'content-length' ? String(responseBody.byteLength) : null },
    body: { getReader: () => ({ async read() { if (this.done) return { done: true }; this.done = true; return { done: false, value: responseBody }; }, async cancel() {} }) },
  };
  const fetch = async (url, options) => { calls.push({ url, options }); return response; };
  const context = vm.createContext({ self, fetch, AbortController, TextDecoder, Uint8Array, setTimeout, clearTimeout, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'offscreen-fetch-worker.js'), 'utf8'), context);
  messageHandler = self.onmessage;
  await messageHandler({ data: {
    requestId: 'slow-generation', url: 'http://127.0.0.1:8000/api/suggestions', method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: '{}', timeoutMs: 90_000,
  } });
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls.at(-1).bodyText, '{"ok":true}');
  assert.equal(JSON.stringify(calls.at(-1)).includes(bearer), false);
});
