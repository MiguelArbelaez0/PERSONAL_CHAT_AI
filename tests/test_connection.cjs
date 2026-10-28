const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const BackendConfig = require('../extension/backend-config.js');

function connectionPage({ nativeError = null } = {}) {
  const elements = new Map();
  for (const id of ['#connection-state', '#page-message', '#pairing-code', '#pair-button', '#refresh-button', '#native-connect-button', '#native-disconnect-button', '#backend-url', '#backend-form', '#pair-form']) {
    elements.set(id, { value: '', textContent: '', dataset: {}, disabled: false, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, querySelector() { return elements.get('#pair-button'); } });
  }
  const calls = [];
  const storage = { backendUrl: BackendConfig.DEFAULT_URL };
  const chrome = {
    runtime: {
      sendMessage: async (message) => {
        calls.push(message);
        if (message.type === 'PAIR') return { ok: true, connected: true };
        if (message.type === 'NATIVE_PAIR') return nativeError
          ? { ok: false, error: { code: nativeError.code, message: nativeError.message } }
          : { ok: true, state: 'connected' };
        if (message.type === 'NATIVE_REVOKE') return { ok: true, disconnected: true };
        if (message.type === 'CONNECTION_STATUS') return { ok: true, state: 'connected' };
        return { ok: true };
      },
      getManifest: () => ({ host_permissions: ['http://127.0.0.1/*'] }),
    },
    storage: { local: {
      get: async (key) => ({ [key]: storage[key] }),
      set: async (value) => Object.assign(storage, value),
    } },
  };
  const context = vm.createContext({
    document: { querySelector: (selector) => elements.get(selector) },
    chrome, PCAIBackendConfig: BackendConfig, URL, window: { confirm: () => true },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/connection.js'), 'utf8'), context);
  return { elements, calls, storage };
}

test('connection page clears the one-time code before sending and never persists it or the bearer', async () => {
  const page = connectionPage();
  await new Promise((resolve) => setImmediate(resolve));
  const field = page.elements.get('#pairing-code');
  field.value = 'synthetic-one-time-code';
  const event = { preventDefault() {}, submitter: page.elements.get('#pair-button'), currentTarget: page.elements.get('#pair-form') };
  await page.elements.get('#pair-form').handlers.submit(event);
  const pair = page.calls.find((call) => call.type === 'PAIR');
  assert.equal(pair.pairingCode, 'synthetic-one-time-code');
  assert.equal(field.value, '');
  assert.deepEqual(Object.keys(page.storage), ['backendUrl']);
  assert.equal(JSON.stringify(page.storage).includes('synthetic-one-time-code'), false);
  assert.equal(JSON.stringify(page.calls).includes('access_token'), false);
  assert.equal(page.elements.get('#page-message').textContent, 'Extensión vinculada. El token quedó guardado en almacenamiento privado de la extensión.');
});

test('connection page uses native pairing without asking the user to handle a code or token', async () => {
  const page = connectionPage();
  await new Promise((resolve) => setImmediate(resolve));
  const button = page.elements.get('#native-connect-button');
  button.textContent = 'Conectar';
  await button.handlers.click();
  assert.ok(page.calls.some((call) => call.type === 'NATIVE_PAIR'));
  assert.equal(JSON.stringify(page.calls).includes('pairingCode'), false);
  assert.equal(JSON.stringify(page.storage).includes('token'), false);
  assert.equal(page.elements.get('#page-message').textContent, 'Chrome quedó vinculado con PERSONAL_CHAT_AI.');
});

test('connection page displays the sanitized Native Messaging diagnostic from the worker', async () => {
  const page = connectionPage({ nativeError: {
    code: 'native_host_not_found',
    message: 'Chrome no encuentra el componente de conexión. Repara la instalación de PERSONAL_CHAT_AI.',
  } });
  await new Promise((resolve) => setImmediate(resolve));
  const button = page.elements.get('#native-connect-button');
  button.textContent = 'Conectar';
  await button.handlers.click();
  assert.equal(
    page.elements.get('#page-message').textContent,
    'Chrome no encuentra el componente de conexión. Repara la instalación de PERSONAL_CHAT_AI.',
  );
  assert.equal(JSON.stringify(page.storage).includes('token'), false);
});
