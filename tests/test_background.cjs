const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const BackendConfig = require('../extension/backend-config.js');

const extensionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const extensionOrigin = `chrome-extension://${extensionId}`;
const contentUrl = 'https://es.stripchat.com/start-broadcasting';
const contentSender = { id: extensionId, url: contentUrl, origin: 'https://es.stripchat.com', frameId: 0, tab: { id: 7, url: contentUrl } };
const connectionSender = { id: extensionId, url: `${extensionOrigin}/connection.html`, origin: extensionOrigin };
const token = 'synthetic-worker-bearer-never-return-this-value';

function createWorker({ storage = { backendUrl: 'http://127.0.0.1:8000' }, fetchHandler, nativeHandler, nativeLastError, storageAccessFailure = false, fastTimers = false } = {}) {
  const listeners = [];
  const calls = [];
  const bridgeMessages = [];
  const offscreenOptions = [];
  let offscreenExists = false;
  const accessLevels = [];
  const optionsOpened = [];
  const nativeCalls = [];
  const consoleMessages = [];
  const runtime = { lastError: null };
  const local = {
    async setAccessLevel(value) { accessLevels.push(value.accessLevel); if (storageAccessFailure) throw new Error('synthetic storage permission failure'); },
    async get(keys) {
      if (typeof keys === 'string') return Object.hasOwn(storage, keys) ? { [keys]: storage[keys] } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((key) => Object.hasOwn(storage, key)).map((key) => [key, storage[key]]));
      return { ...storage };
    },
    async set(values) { Object.assign(storage, values); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
  };
  const chrome = {
    runtime: {
      id: extensionId,
      get lastError() { return runtime.lastError; },
      getManifest: () => ({ host_permissions: ['http://127.0.0.1/*'] }),
      getURL: (file) => `${extensionOrigin}/${file}`,
      async getContexts() { return offscreenExists ? [{ contextType: 'OFFSCREEN_DOCUMENT', documentUrl: `${extensionOrigin}/offscreen.html` }] : []; },
      sendNativeMessage(host, message, callback) {
        nativeCalls.push({ host, message });
        const response = nativeLastError
          ? Promise.reject(new Error(nativeLastError))
          : Promise.resolve(nativeHandler ? nativeHandler(host, message) : { ok: true, pairingCode: 'N'.repeat(43) });
        if (typeof callback === 'function') {
          response.then((value) => callback(value), (error) => {
            runtime.lastError = { message: nativeLastError || error?.message || 'Native host has exited.' };
            callback(undefined);
            runtime.lastError = null;
          });
          return undefined;
        }
        return response;
      },
      onMessage: { addListener: (listener) => listeners.push(listener) },
      openOptionsPage: async () => { optionsOpened.push(true); },
      async sendMessage(message) {
        bridgeMessages.push(message);
        if (message?.target !== 'pcai-offscreen') return undefined;
        if (message.type === 'CANCEL') return { ok: true };
        const request = message.request;
        const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
        const bodyText = await response.text();
        return {
          ok: true, status: response.status, httpOk: response.ok,
          contentLength: Number(response.headers.get('content-length')) || null, bodyText,
        };
      },
    },
    offscreen: {
      async createDocument(options) { offscreenOptions.push(options); offscreenExists = true; },
    },
    storage: { local },
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options: { ...options, headers: { ...(options.headers || {}) } } });
    if (fetchHandler) return fetchHandler(String(url), options, calls);
    const parsed = new URL(url);
    if (parsed.pathname === '/api/auth/pair') {
      const body = JSON.parse(options.body || '{}');
      if (body.pairing_code === 'expired-' + 'x'.repeat(36)) {
        return new Response(JSON.stringify({ error: { code: 'pairing_code_invalid', message: 'expired' } }), { status: 401, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ token_type: 'Bearer', access_token: token }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (parsed.pathname === '/api/health') return new Response(JSON.stringify({ status: 'ok', service: 'personal-chat-ai' }), { status: 200 });
    if (parsed.pathname === '/api/accounts') return new Response(JSON.stringify({ accounts: [], access_token: token }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const module = { exports: {} };
  const workerSetTimeout = fastTimers
    ? (callback, delay) => setTimeout(callback, Math.min(delay, 12))
    : setTimeout;
  const context = vm.createContext({
    chrome, fetch, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder,
    Response, setTimeout: workerSetTimeout, clearTimeout,
    console: { warn: (...values) => consoleMessages.push(values) }, module,
    PCAIBackendConfig: BackendConfig,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8'), context);
  const listener = listeners[0];
  async function send(message, sender = contentSender) {
    return new Promise((resolve) => listener(message, sender, resolve));
  }
  return { send, calls, bridgeMessages, offscreenOptions, nativeCalls, consoleMessages, storage, accessLevels, optionsOpened, module: module.exports, listener };
}

test('pairing is extension-page-only, stores the bearer privately, and never returns it', async () => {
  const worker = createWorker();
  const reply = await worker.send({ type: 'PAIR', pairingCode: 'p'.repeat(43) }, connectionSender);
  assert.equal(reply.ok, true);
  assert.equal(reply.connected, true);
  assert.equal(worker.storage.pcaiAuthBearer, token);
  assert.deepEqual(worker.accessLevels, ['TRUSTED_CONTEXTS']);
  assert.ok(worker.calls[0].url.endsWith('/api/auth/pair'));
  assert.equal(worker.calls[0].options.headers.Authorization, undefined);
  assert.equal(JSON.stringify(reply).includes(token), false);

  const badSender = await worker.send({ type: 'PAIR', pairingCode: 'p'.repeat(43) }, contentSender);
  assert.equal(badSender.ok, false);
  assert.equal(badSender.error.code, 'operation_not_allowed');
});

test('native pairing is initiated only by the trusted connection page and never exposes its code or bearer', async () => {
  const worker = createWorker();
  const reply = await worker.send({ type: 'NATIVE_PAIR' }, connectionSender);
  assert.equal(reply.ok, true);
  assert.equal(reply.state, 'connected');
  assert.equal(worker.storage.pcaiAuthBearer, token);
  assert.equal(JSON.stringify(worker.nativeCalls), JSON.stringify([{ host: 'com.personalchatai.desktop', message: { type: 'pair' } }]));
  assert.equal(JSON.stringify(reply).includes(token), false);
  assert.equal(JSON.stringify(reply).includes('N'.repeat(43)), false);

  const rejected = await worker.send({ type: 'NATIVE_PAIR' }, contentSender);
  assert.equal(rejected.ok, false);
  assert.equal(worker.nativeCalls.length, 1);
});

test('native messaging lastError is classified safely for startup, authorization, protocol, and disconnect failures', async (t) => {
  const cases = [
    ['Specified native messaging host not found.', 'native_host_not_found'],
    ['Failed to start native messaging host.', 'native_host_start_failed'],
    ['Access to the specified native messaging host is forbidden.', 'native_origin_forbidden'],
    ['Error when communicating with the native messaging host.', 'native_message_invalid'],
    ['Native host has exited.', 'native_host_disconnected'],
  ];
  for (const [nativeLastError, expectedCode] of cases) {
    await t.test(expectedCode, async () => {
      const worker = createWorker({ nativeLastError });
      const reply = await worker.send({ type: 'NATIVE_PAIR' }, connectionSender);
      assert.equal(reply.ok, false);
      assert.equal(reply.error.code, expectedCode);
      assert.equal(reply.error.message.includes(nativeLastError), false);
      assert.deepEqual(worker.consoleMessages, [['[PERSONAL_CHAT_AI] Native Messaging:', expectedCode]]);
      assert.equal(JSON.stringify(reply).includes(token), false);
    });
  }
});

test('invalid native replies and rejected pairing codes produce distinct safe diagnostics', async () => {
  const malformed = createWorker({ nativeHandler: async () => ({ ok: true, pairingCode: 'synthetic-secret-code' }) });
  const badReply = await malformed.send({ type: 'NATIVE_PAIR' }, connectionSender);
  assert.equal(badReply.error.code, 'native_message_invalid');
  assert.equal(JSON.stringify(badReply).includes('synthetic-secret-code'), false);

  const rejected = createWorker({
    nativeHandler: async () => ({ ok: true, pairingCode: 'Q'.repeat(43) }),
    fetchHandler: async (url) => url.endsWith('/api/auth/pair')
      ? new Response(JSON.stringify({ error: { code: 'pairing_code_invalid' } }), { status: 401 })
      : new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
  });
  const denied = await rejected.send({ type: 'NATIVE_PAIR' }, connectionSender);
  assert.equal(denied.error.code, 'pairing_rejected');
  assert.equal(JSON.stringify(denied).includes('Q'.repeat(43)), false);
  assert.equal(JSON.stringify(rejected.consoleMessages).includes('Q'.repeat(43)), false);
});

test('native recovery and disconnect require explicit connection-page operations', async () => {
  const worker = createWorker({ nativeHandler: async (_host, request) => {
    if (request.type === 'revoke') return { ok: true, revoked: true };
    return { ok: true, pairingCode: 'R'.repeat(43) };
  } });
  const connected = await worker.send({ type: 'NATIVE_PAIR', rotate: true }, connectionSender);
  assert.equal(connected.state, 'connected');
  assert.equal(JSON.stringify(worker.nativeCalls[0].message), JSON.stringify({ type: 'rotate' }));
  const disconnected = await worker.send({ type: 'NATIVE_REVOKE' }, connectionSender);
  assert.equal(disconnected.disconnected, true);
  assert.equal(worker.storage.pcaiAuthBearer, undefined);
  const malformed = await worker.send({ type: 'NATIVE_PAIR', rotate: 'yes' }, connectionSender);
  assert.equal(malformed.ok, false);
  assert.equal(worker.nativeCalls.length, 2);
});

test('manifest requests the exact native messaging permission without broadening host access', () => {
  const manifest = JSON.parse(fs.readFileSync(require.resolve('../extension/manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('nativeMessaging'));
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*']);
});

test('protected API calls use the bearer, strip token fields, and survive worker restart', async () => {
  const storage = { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token };
  const worker = createWorker({ storage });
  const first = await worker.send({ type: 'API_REQUEST', requestId: 'request-1', path: '/api/accounts', method: 'GET' });
  assert.equal(first.httpOk, true);
  assert.deepEqual(Array.from(first.body.accounts), []);
  assert.equal(first.body.access_token, undefined);
  assert.equal(worker.calls.at(-1).options.headers.Authorization, `Bearer ${token}`);
  assert.equal(JSON.stringify(first).includes(token), false);

  const restarted = createWorker({ storage });
  const afterRestart = await restarted.send({ type: 'API_REQUEST', requestId: 'request-2', path: '/api/accounts', method: 'GET' });
  assert.equal(afterRestart.httpOk, true);
  assert.equal(restarted.calls.at(-1).options.headers.Authorization, `Bearer ${token}`);
});

test('content scripts cannot read auth storage or issue malformed preference operations', async () => {
  const worker = createWorker({ storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token, mode: 'auto' } });
  const hidden = await worker.send({ type: 'PREFS_GET', keys: ['pcaiAuthBearer'] });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.error.code, 'invalid_preferences_request');
  const valid = await worker.send({ type: 'PREFS_GET', keys: ['mode'] });
  assert.deepEqual(valid.values, { mode: 'auto' });
  const smuggle = await worker.send({ type: 'PREFS_SET', values: { pcaiAuthBearer: 'attacker-token' } });
  assert.equal(smuggle.ok, false);
  assert.equal(worker.storage.pcaiAuthBearer, token);
});

test('onboarding account retry contract accepts the client 32-hex key for persistence and the allowlisted POST', async () => {
  const worker = createWorker({ storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token } });
  const key = 'a'.repeat(32); // 16 random bytes generated by content.js
  const payload = {
    platform: 'stripchat', artist_name: 'Synthetic owner', platform_user_id: null,
    identity_source: 'dom', confirmed: true,
  };

  const saved = await worker.send({
    type: 'PREFS_SET',
    values: { pcaiPendingAccountCreation: { key, payload } },
  });
  assert.equal(saved.ok, true);
  assert.equal(worker.storage.pcaiPendingAccountCreation.key, key);

  const malformedPending = await worker.send({
    type: 'PREFS_SET',
    values: { pcaiPendingAccountCreation: { key: 'c'.repeat(64), payload } },
  });
  assert.equal(malformedPending.ok, false);
  assert.equal(worker.storage.pcaiPendingAccountCreation.key, key, 'invalid retry metadata must not overwrite a valid pending request');

  const created = await worker.send({
    type: 'API_REQUEST', requestId: 'onboarding-create-1', path: '/api/accounts', method: 'POST',
    body: JSON.stringify(payload), idempotencyKey: key,
  });
  assert.equal(created.ok, true);
  assert.equal(created.httpOk, true);
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.calls[0].options.headers['Idempotency-Key'], key);

  const invalid = await worker.send({
    type: 'API_REQUEST', requestId: 'onboarding-create-invalid', path: '/api/accounts', method: 'POST',
    body: JSON.stringify(payload), idempotencyKey: 'b'.repeat(64),
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'operation_not_allowed');
  assert.equal(worker.calls.length, 1, 'invalid keys must be rejected before fetch');
});

test('backend compact UUIDs and canonical UUIDs are accepted for account-scoped onboarding state and routes', async () => {
  const worker = createWorker({ storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token } });
  const compactAccountId = '123e4567e89b42d3a456426614174000';
  const compactProfileId = '123e4567e89b42d3a456426614174001';
  const canonicalAccountId = '123e4567-e89b-42d3-a456-426614174000';

  const compactSaved = await worker.send({ type: 'PREFS_SET', values: {
    pcaiLastAccountId: compactAccountId,
    pcaiSetupProgress: { accountId: compactAccountId, profileId: compactProfileId, step: 3, editing: false, draft: {} },
  } });
  assert.equal(compactSaved.ok, true);

  const compactRoute = await worker.send({
    type: 'API_REQUEST', requestId: 'compact-account-route', path: `/api/accounts/${compactAccountId}/profiles`, method: 'GET',
  });
  assert.equal(compactRoute.ok, true);
  assert.equal(worker.calls.length, 1);
  assert.ok(worker.calls[0].url.endsWith(`/api/accounts/${compactAccountId}/profiles`));

  const canonicalRoute = await worker.send({
    type: 'API_REQUEST', requestId: 'canonical-account-route', path: `/api/accounts/${canonicalAccountId}/profiles`, method: 'GET',
  });
  assert.equal(canonicalRoute.ok, true);
  assert.equal(worker.calls.length, 2);

  const malformed = await worker.send({
    type: 'API_REQUEST', requestId: 'malformed-account-route', path: '/api/accounts/not-a-uuid/profiles', method: 'GET',
  });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, 'operation_not_allowed');
  assert.equal(worker.calls.length, 2);

  const malformedCompact = await worker.send({
    type: 'API_REQUEST', requestId: 'malformed-compact-id', path: `/api/accounts/${'a'.repeat(32)}/profiles`, method: 'GET',
  });
  assert.equal(malformedCompact.ok, false);
  assert.equal(malformedCompact.error.code, 'operation_not_allowed');
  assert.equal(worker.calls.length, 2);
});

test('only allowlisted routes and methods pass; arbitrary URLs, methods and oversized bodies fail', async () => {
  const worker = createWorker({ storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token } });
  const invalid = [
    { path: 'https://attacker.invalid/', method: 'GET' },
    { path: '/api/not-a-route', method: 'GET' },
    { path: '/api/accounts', method: 'DELETE' },
    { path: '/api/accounts', method: 'POST', body: '{"artist_name":"x"}', idempotencyKey: 'not-a-key' },
    { path: '/api/suggestions', method: 'POST', body: 'x'.repeat(70 * 1024) },
  ];
  for (const [index, request] of invalid.entries()) {
    const result = await worker.send({ type: 'API_REQUEST', requestId: `invalid-${index}`, ...request });
    assert.equal(result.ok, false);
    assert.ok(['operation_not_allowed', 'request_too_large'].includes(result.error.code));
  }
  assert.equal(worker.calls.length, 0);
});

test('message sender must be this extension, its top-level Stripchat tab, and a valid frame', async () => {
  const worker = createWorker();
  const messages = [
    [{ type: 'PREFS_GET', keys: ['mode'] }, { url: contentUrl, frameId: 0, tab: { id: 7, url: contentUrl } }],
    [{ type: 'PREFS_GET', keys: ['mode'] }, { ...contentSender, id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
    [{ type: 'PREFS_GET', keys: ['mode'] }, { ...contentSender, frameId: 2 }],
    [{ type: 'PREFS_GET', keys: ['mode'] }, { ...contentSender, tab: { id: 7, url: 'https://example.com/' } }],
  ];
  for (const [message, sender] of messages) {
    const result = await worker.send(message, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'message_forbidden');
  }
});

test('service worker fails closed if Chrome cannot restrict credential storage', async () => {
  const worker = createWorker({ storageAccessFailure: true });
  const result = await worker.send({ type: 'PREFS_GET', keys: ['mode'] });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'secure_storage_unavailable');
  assert.equal(worker.calls.length, 0);
});

test('expired pairing code does not store a token and connection status reports revocation', async () => {
  const worker = createWorker({ fetchHandler: async (url) => {
    if (url.endsWith('/api/auth/pair')) return new Response(JSON.stringify({ error: { code: 'pairing_code_invalid' } }), { status: 401 });
    if (url.endsWith('/api/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    if (url.endsWith('/api/accounts')) return new Response(JSON.stringify({ error: { code: 'authentication_required' } }), { status: 401 });
  } });
  const expired = await worker.send({ type: 'PAIR', pairingCode: 'e'.repeat(43) }, connectionSender);
  assert.equal(expired.ok, false);
  assert.equal(expired.error.code, 'pairing_code_invalid');
  assert.equal(worker.storage.pcaiAuthBearer, undefined);

  worker.storage.pcaiAuthBearer = token;
  const status = await worker.send({ type: 'CONNECTION_STATUS' }, connectionSender);
  assert.equal(status.state, 'token_rejected');
  assert.equal(worker.storage.pcaiAuthBearer, token);
});

test('Stripchat content can request authenticated API operations through the extension worker', async () => {
  const worker = createWorker({ storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token } });
  const result = await worker.send({ type: 'API_REQUEST', requestId: 'route-1', path: '/api/accounts', method: 'GET' }, contentSender);
  assert.equal(result.httpOk, true);
  assert.equal(worker.calls[0].options.headers.Authorization, `Bearer ${token}`);
  // Chrome supplies the extension Origin for service-worker fetches. The backend rejects page-origin calls;
  // that end-to-end Origin enforcement is covered by the isolated FastAPI tests.
});

test('concurrent backend calls keep responses associated with their own request IDs', async () => {
  const worker = createWorker({
    storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token },
    fetchHandler: async (_url, options) => {
      const target = JSON.parse(options.body).target_message;
      await new Promise((resolve) => setTimeout(resolve, target === 'slow-A' ? 35 : 5));
      return new Response(JSON.stringify({ original_response: target, access_token: token }), { status: 200 });
    },
  });
  const [a, b] = await Promise.all([
    worker.send({ type: 'API_REQUEST', requestId: 'concurrent-A', path: '/api/suggestions', method: 'POST', body: '{"target_message":"slow-A"}' }),
    worker.send({ type: 'API_REQUEST', requestId: 'concurrent-B', path: '/api/suggestions', method: 'POST', body: '{"target_message":"fast-B"}' }),
  ]);
  assert.equal(a.body.original_response, 'slow-A');
  assert.equal(b.body.original_response, 'fast-B');
  assert.equal(a.body.access_token, undefined);
  assert.equal(b.body.access_token, undefined);
});

test('long generation is delegated to the restricted offscreen bridge and completes after 30 seconds in the VM', async () => {
  const worker = createWorker({
    storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token },
    fetchHandler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_050));
      return new Response(JSON.stringify({ ok: true, bearer_token: token }), { status: 200 });
    },
  });
  const result = await worker.send({ type: 'API_REQUEST', requestId: 'slow-mock', path: '/api/suggestions', method: 'POST', body: '{"target_message":"synthetic slow request"}' });
  assert.equal(result.httpOk, true);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.bearer_token, undefined);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(worker.offscreenOptions[0].reasons[0], 'WORKERS');
  assert.equal(worker.bridgeMessages[0].target, 'pcai-offscreen');
  assert.equal(worker.bridgeMessages[0].request.headers.Authorization, `Bearer ${token}`);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('only generation and translation use offscreen; arbitrary internal senders cannot reach the bridge', async () => {
  const worker = createWorker({ storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token } });
  const ordinary = await worker.send({ type: 'API_REQUEST', requestId: 'ordinary', path: '/api/accounts', method: 'GET' });
  const translation = await worker.send({ type: 'API_REQUEST', requestId: 'translation', path: '/api/translation/retry', method: 'POST', body: '{}' });
  assert.equal(ordinary.httpOk, true);
  assert.equal(translation.httpOk, true);
  assert.equal(worker.offscreenOptions.length, 1);
  assert.equal(worker.offscreenOptions[0].url, 'offscreen.html');
  assert.deepEqual(worker.calls.map((call) => new URL(call.url).pathname), ['/api/accounts', '/api/translation/retry']);
  assert.equal(worker.bridgeMessages.some((message) => message.target === 'pcai-offscreen' && /https?:\/\//.test(message.request?.url || '')), true);
});

test('cancelling a long generation aborts its offscreen worker and returns a safe cancellation error', async () => {
  const worker = createWorker({
    storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token },
    fetchHandler: async () => new Promise((resolve) => setTimeout(() => resolve(new Response('{}', { status: 200 })), 50)),
  });
  const pending = worker.send({ type: 'API_REQUEST', requestId: 'cancel-long', path: '/api/suggestions', method: 'POST', body: '{}' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const cancellation = await worker.send({ type: 'API_CANCEL', requestId: 'cancel-long' });
  const result = await pending;
  assert.equal(cancellation.cancelled, true);
  assert.equal(result.error.code, 'request_timeout_or_cancelled');
  assert.ok(worker.bridgeMessages.some((message) => message.type === 'CANCEL' && message.requestId === '7.0.cancel-long'));
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('request IDs are scoped to the originating tab so concurrent tabs cannot cancel each other', async () => {
  const worker = createWorker({
    storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token },
    fetchHandler: async (_url, options) => {
      const body = JSON.parse(options.body);
      await new Promise((resolve) => setTimeout(resolve, body.target_message === 'tab-A' ? 25 : 3));
      return new Response(JSON.stringify({ original_response: body.target_message }), { status: 200 });
    },
  });
  const senderA = { ...contentSender, tab: { ...contentSender.tab, id: 7 } };
  const senderB = { ...contentSender, tab: { ...contentSender.tab, id: 8 } };
  const [a, b] = await Promise.all([
    worker.send({ type: 'API_REQUEST', requestId: 'same-id', path: '/api/suggestions', method: 'POST', body: '{"target_message":"tab-A"}' }, senderA),
    worker.send({ type: 'API_REQUEST', requestId: 'same-id', path: '/api/suggestions', method: 'POST', body: '{"target_message":"tab-B"}' }, senderB),
  ]);
  assert.equal(a.body.original_response, 'tab-A');
  assert.equal(b.body.original_response, 'tab-B');
});

test('401, 403 and 503 statuses and safe error bodies are preserved for the caller', async () => {
  for (const status of [401, 403, 503]) {
    const worker = createWorker({
      storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token },
      fetchHandler: async () => new Response(JSON.stringify({ error: { code: `http_${status}` }, token }), { status }),
    });
    const result = await worker.send({ type: 'API_REQUEST', requestId: `status-${status}`, path: '/api/accounts', method: 'GET' });
    assert.equal(result.ok, true);
    assert.equal(result.httpOk, false);
    assert.equal(result.status, status);
    assert.equal(result.body.error.code, `http_${status}`);
    assert.equal(result.body.token, undefined);
    assert.equal(JSON.stringify(result).includes(token), false);
  }
});

test('aborted backend fetch reports a recoverable timeout without exposing credentials', async () => {
  const worker = createWorker({
    fastTimers: true,
    storage: { backendUrl: 'http://127.0.0.1:8000', pcaiAuthBearer: token },
    fetchHandler: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
      }, { once: true });
    }),
  });
  const result = await worker.send({ type: 'API_REQUEST', requestId: 'timeout-case', path: '/api/accounts', method: 'GET' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'request_timeout_or_cancelled');
  assert.equal(JSON.stringify(result).includes(token), false);
});
