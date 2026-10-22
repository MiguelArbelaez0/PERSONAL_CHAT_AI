const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function panel({ retryOutcomes = [] } = {}) {
  const elements = new Map();
  class Element {
    constructor(tag = '') { this.tag = tag; this.value = ''; this.children = []; this.dataset = {}; this.style = {}; this.handlers = {}; }
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    }
    querySelectorAll() { return []; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    remove() { this.removed = true; }
  }
  const view = { copied: null, calls: [] };
  class Flow {
    constructor(options) { view.flow = options; this.pending = new Set(); }
    cancelPending() {}
  }
  const profiles = [{ id: 'default', name: 'ChubbyKriz', description: '', tone: '', style: '', rules: '' }];
  let active = 'default';
  const body = new Element('body');
  const context = vm.createContext({
    window: {}, document: { body, documentElement: body, createElement: (tag) => new Element(tag) },
    URL, PCAISuggestionFlow: Flow, confirm: () => true,
    setTimeout: () => 1, clearTimeout: () => {}, console,
    chrome: { storage: { local: { get: async () => ({}), set: async () => {} } } },
    navigator: { clipboard: { writeText: async (text) => { view.copied = text; } } },
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname;
      view.calls.push({ path, method: options.method || 'GET', payload: options.body ? JSON.parse(options.body) : null });
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
      } else if (path === '/api/profiles') result = { profiles: structuredClone(profiles), active_id: active };
      return { ok: true, status: options.method === 'DELETE' ? 204 : 200, text: async () => JSON.stringify(result) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/content.js'), 'utf8'), context);
  return { view, get: (id) => elements.get(`#pcai-${id}`) };
}

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
  assert.equal(f.view.calls.at(-1).payload.retry_token, 'first-token');
  await copy.onclick();
  assert.equal(f.view.copied, original);
  await retry.onclick();
  assert.equal(f.view.calls.at(-1).payload.retry_token, 'next-token');
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
