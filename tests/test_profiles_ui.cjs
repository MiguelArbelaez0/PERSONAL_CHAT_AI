const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function panel({ retryOutcomes = [], generationOutcomes = [], realFlow = false, preferenceError = false, detectorError = false, profileFailures = 0, savedProfile = null } = {}) {
  const elements = new Map();
  class Element {
    constructor(tag = '') { this.tag = tag; this.value = ''; this.children = []; this.dataset = {}; this.style = {}; this.handlers = {}; }
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    }
    querySelectorAll(selector) {
      const all = []; const visit = (node) => node.children.forEach((child) => { if (!child.removed) { all.push(child); visit(child); } }); visit(this);
      if (selector === '[data-pcai-state]') return all.filter((item) => item.dataset.pcaiState);
      if (selector === '[data-pcai-state="loading"]') return all.filter((item) => item.dataset.pcaiState === 'loading');
      if (selector === '.pcai-suggestion') return all.filter((item) => item.className === 'pcai-suggestion');
      return [];
    }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    remove() { this.removed = true; }
  }
  const view = { copied: null, calls: [] };
  class FixtureFlow {
    constructor(options) { view.flow = options; this.pending = new Set(); }
    cancelPending() {}
  }
  const Flow = realFlow ? class extends require('../extension/suggestion-flow.js') {
    constructor(options) { super(options); view.flow = options; view.coordinator = this; }
  } : FixtureFlow;
  const profiles = [{ id: 'default', name: 'ChubbyKriz', description: '', tone: '', style: '', rules: '' }];
  let active = 'default';
  if (savedProfile) { profiles.push(savedProfile); active = savedProfile.id; }
  const body = new Element('body');
  const context = vm.createContext({
    window: {}, document: { body, documentElement: body, createElement: (tag) => new Element(tag) },
    location: { hostname: 'stripchat.com' },
    PCAIConversationDetector: detectorError ? class { constructor() { throw new Error('Synthetic detector failure'); } } : undefined,
    URL, AbortController, PCAISuggestionFlow: Flow, confirm: () => true,
    setTimeout: () => 1, clearTimeout: () => {}, console,
    chrome: { storage: { local: { get: async () => { if (preferenceError) throw new Error('Synthetic preference failure'); return {}; }, set: async () => {} } } },
    navigator: { clipboard: { writeText: async (text) => { view.copied = text; } } },
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname;
      view.calls.push({ path, method: options.method || 'GET', payload: options.body ? JSON.parse(options.body) : null });
      if (path === '/api/suggestions') {
        const outcome = generationOutcomes.shift();
        return { ok: outcome.status < 400, status: outcome.status, text: async () => JSON.stringify(outcome.body) };
      }
      let result = {};
      if (path === '/api/translation/retry') {
        result = retryOutcomes.shift();
        if (result instanceof Error) throw result;
      } else if (path === '/api/profiles' && options.method === 'POST') {
        result = { id: 'custom', ...JSON.parse(options.body) }; profiles.push(result);
      } else if (path === '/api/profiles/custom/activate') {
        active = 'custom'; result = profiles[1];
      } else if (path === '/api/profiles/custom' && options.method === 'PUT') {
        Object.assign(profiles[1], JSON.parse(options.body)); result = profiles[1];
      } else if (path === '/api/profiles/custom' && options.method === 'DELETE') {
        profiles.pop(); active = 'default';
      } else if (path === '/api/profiles/restore') {
        profiles[0].name = 'ChubbyKriz'; active = 'default'; result = { profiles, active_id: active };
      } else if (path === '/api/profiles') {
        if (profileFailures-- > 0) throw new Error('Synthetic startup connection failure');
        result = { profiles: structuredClone(profiles), active_id: active };
      }
      return { ok: true, status: options.method === 'DELETE' ? 204 : 200, text: async () => JSON.stringify(result) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/content.js'), 'utf8'), context);
  return { view, get: (id) => body.querySelector(`#pcai-${id}`) };
}

test('real flow and panel leave loading after 502, show exact reason and enable retry of the same target', async () => {
  const f = panel({ realFlow: true, generationOutcomes: [
    { status: 502, body: { error: { code: 'generation_validation_failed', reason_code: 'repeated_response', message: 'Se repitió el objetivo.' }, diagnostics: { duplicate_source: 'target_incoming' } } },
    { status: 200, body: { language: 'en', original_response: 'It is good to hear from you again.' } },
  ] });
  await new Promise((resolve) => setImmediate(resolve));
  f.get('message').value = 'I missed talking to you, daddy.';
  f.get('alias').value = 'Synthetic';
  await f.get('generate-custom').onclick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.view.coordinator.pending.size, 0);
  assert.equal(f.get('generate-custom').disabled, false);
  assert.doesNotMatch(f.get('generate-custom').textContent, /Generando/);
  assert.equal(f.get('results').querySelectorAll('[data-pcai-state="loading"]').length, 0);
  assert.equal(f.get('status').textContent, 'Se repitió el objetivo.');
  const retry = f.get('results').children.find((item) => !item.removed && item.textContent === 'Reintentar');
  assert.ok(retry);
  retry.onclick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.view.coordinator.pending.size, 0);
  assert.equal(f.get('results').querySelectorAll('.pcai-suggestion').length, 1);
  const calls = f.view.calls.filter((item) => item.path === '/api/suggestions');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((item) => item.payload.target_message === 'I missed talking to you, daddy.'));
});

test('panel creates, edits, selects, deletes and restores profiles using local API', async () => {
  const f = panel();
  await f.get('profile-reload').onclick();
  assert.equal(f.get('profile-active').textContent, 'ChubbyKriz');
  f.get('profile-new').onclick();
  f.get('profile-name').value = '<img src=x onerror=alert(1)>';
  f.get('profile-tone').value = 'Casual';
  await f.get('profile-save').onclick();
  assert.equal(f.get('profile-select').value, 'custom');
  assert.equal(f.get('profile-active').textContent, 'ChubbyKriz');
  await f.get('profile-activate').onclick();
  assert.equal(f.get('profile-active').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(f.get('profile-active').innerHTML, undefined);
  f.get('profile-name').value = 'Edited';
  await f.get('profile-save').onclick();
  assert.equal(f.get('profile-active').textContent, 'Edited');
  f.get('profile-delete').onclick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('profile-active').textContent, 'ChubbyKriz');
  f.get('profile-restore').onclick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.view.calls.some((call) => call.path === '/api/profiles/restore'));
});

test('copy button copies edited original independently of Spanish translation', async () => {
  const f = panel();
  f.view.flow.onSuccess({ originalResponse: 'Bonsoir Miguel.', spanishTranslation: 'Buenas noches Miguel.', language: 'fr', automatic: false, configuredMode: 'auto', alias: 'Synthetic' });
  const card = f.get('results').children[0];
  const [heading, edit, copy, translation] = card.children;
  assert.match(heading.textContent, /Modo Automático · Solicitud manual/);
  assert.equal(translation.children[1].textContent, 'Buenas noches Miguel.');
  edit.value = 'Bonsoir Miguel !';
  await copy.onclick();
  assert.equal(f.view.copied, 'Bonsoir Miguel !');
});

test('failed translation can be retried, preserves original and rotates repair context until success', async () => {
  const f = panel({ retryOutcomes: [
    { available: false, failure_message: 'Se omitió una frase.', retry_token: 'next-token' },
    { available: true, spanish_translation: 'Buenas noches, estoy bien, gracias.' },
  ] });
  const original = 'Bonsoir, je vais bien, merci.';
  f.view.flow.onSuccess({ originalResponse: original, spanishTranslation: '', language: 'fr', automatic: false,
    configuredMode: 'manual', diagnostics: { translation_retry_available: true, translation_retry_token: 'first-token' } });
  const card = f.get('results').children[0];
  const [, edit, copy, translation] = card.children;
  const retry = translation.children[2];
  await retry.onclick();
  assert.equal(edit.value, original);
  assert.equal(retry.disabled, false);
  assert.match(translation.children[1].textContent, /Se omitió una frase.*original se conserva/);
  assert.equal(f.view.calls.filter((call) => call.path === '/api/translation/retry').at(-1).payload.retry_token, 'first-token');
  await copy.onclick();
  assert.equal(f.view.copied, original);
  await retry.onclick();
  assert.equal(f.view.calls.filter((call) => call.path === '/api/translation/retry').at(-1).payload.retry_token, 'next-token');
  assert.equal(edit.value, original);
  assert.equal(retry.removed, true);
  assert.equal(translation.children[1].textContent, 'Buenas noches, estoy bien, gracias.');
  edit.value = 'Bonsoir !';
  edit.handlers.input();
  assert.match(translation.children[1].textContent, /corresponde al original generado/);
  await copy.onclick();
  assert.equal(f.view.copied, 'Bonsoir !');
});

test('network failure while retrying translation keeps original and retry control', async () => {
  const f = panel({ retryOutcomes: [new Error('network')] });
  f.view.flow.onSuccess({ originalResponse: 'Estou bem, obrigado.', spanishTranslation: '', language: 'pt', automatic: false,
    diagnostics: { translation_retry_available: true } });
  const card = f.get('results').children[0];
  const [, edit, copy, translation] = card.children;
  await translation.children[2].onclick();
  assert.equal(edit.value, 'Estou bem, obrigado.');
  assert.equal(translation.children[2].disabled, false);
  await copy.onclick();
  assert.equal(f.view.copied, 'Estou bem, obrigado.');
});

for (const preferenceError of [false, true]) {
  test(`profiles load at startup despite unrelated initialization failure (preferences=${preferenceError})`, async () => {
    const f = panel({ preferenceError, detectorError: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.get('profile-active').textContent, 'ChubbyKriz');
    assert.equal(f.get('profile-name').value, 'ChubbyKriz');
    assert.ok(f.view.calls.some((call) => call.path === '/api/profiles'));
    assert.ok(f.view.calls.every((call) => call.method === 'GET'));
  });
}

test('opening panel retries unavailable profiles after backend connects without writing storage', async () => {
  const f = panel({ profileFailures: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('profile-active').textContent, 'Sin conexión');
  f.get('panel').hidden = true;
  f.get('toggle').handlers.click({ preventDefault() {}, stopPropagation() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('profile-active').textContent, 'ChubbyKriz');
  assert.ok(f.view.calls.every((call) => call.method === 'GET'));
});

test('extension reload reads existing custom selection and original fields without recreating profiles', async () => {
  const savedProfile = { id: 'legacy-synthetic', name: 'Synthetic saved voice', description: 'Existing description', tone: 'Calm', style: 'Brief', rules: 'Existing rules' };
  for (let reload = 0; reload < 2; reload++) {
    const f = panel({ savedProfile });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.get('profile-active').textContent, savedProfile.name);
    assert.equal(f.get('profile-select').value, savedProfile.id);
    for (const field of ['name', 'description', 'tone', 'style', 'rules']) assert.equal(f.get(`profile-${field}`).value, savedProfile[field]);
    assert.ok(f.view.calls.every((call) => call.method === 'GET'));
  }
});
