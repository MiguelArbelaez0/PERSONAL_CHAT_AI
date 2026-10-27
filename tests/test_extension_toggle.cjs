const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('floating button mounts in body, opens/closes the panel, and avoids duplicate mounts', async () => {
  const rootDir = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(rootDir, 'extension', 'content.js'), 'utf8');
  const SuggestionFlow = require('../extension/suggestion-flow.js');
  const css = fs.readFileSync(path.join(rootDir, 'extension', 'panel.css'), 'utf8');
  const elements = new Map();

  class Element {
    constructor(id = '') {
      this.id = id;
      this.hidden = id === 'pcai-panel';
      this.value = '';
      this.attributes = {};
      this.style = {};
      this.handlers = {};
      this.children = [];
    }
    set innerHTML(value) { this.markup = value; }
    get innerHTML() { return this.markup; }
    querySelector(selector) {
      const id = selector.slice(1);
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
  }

  const body = new Element('body');
  const document = {
    body,
    documentElement: new Element('html'),
    createElement: () => new Element(),
    querySelector: () => null,
  };
  const window = {};
  const preferences = {};
  const runtime = {
    getManifest: () => JSON.parse(fs.readFileSync(path.join(rootDir, 'extension', 'manifest.json'), 'utf8')),
    sendMessage: async (message) => {
      if (message.type === 'PREFS_GET') return { ok: true, values: Object.fromEntries(message.keys.filter((key) => key in preferences).map((key) => [key, preferences[key]])) };
      if (message.type === 'PREFS_SET') { Object.assign(preferences, message.values); return { ok: true, saved: true }; }
      if (message.type === 'PREFS_REMOVE') { for (const key of message.keys) delete preferences[key]; return { ok: true, removed: true }; }
      if (message.type === 'API_REQUEST') {
        const body = message.path === '/api/health' ? { status: 'ok', service: 'personal-chat-ai' }
          : message.path === '/api/diagnostics/lm-studio' ? { available: false }
            : message.path === '/api/accounts' ? { accounts: [] } : {};
        return { ok: true, httpOk: true, status: 200, body };
      }
      return { ok: true };
    },
  };
  const context = vm.createContext({
    window, document, URL, console, setTimeout, PCAISuggestionFlow: SuggestionFlow,
    PCAIBackendConfig: require('../extension/backend-config.js'),
    chrome: { runtime, storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ available: false }) }),
    navigator: { clipboard: { writeText: async () => {} } },
    confirm: () => true,
  });

  vm.runInContext(source, context);
  assert.equal(body.children.length, 1);
  const root = body.children[0];
  const toggle = root.querySelector('#pcai-toggle');
  const panel = root.querySelector('#pcai-panel');
  assert.equal(panel.hidden, true);
  toggle.handlers.click({ preventDefault() {} });
  assert.equal(panel.hidden, false);
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  toggle.handlers.click({ preventDefault() {} });
  assert.equal(panel.hidden, true);
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  toggle.handlers.click({ preventDefault() {} });
  assert.equal(panel.hidden, false);
  root.querySelector('#pcai-close').handlers.click({ preventDefault() {} });
  assert.equal(panel.hidden, true);
  assert.equal(toggle.attributes['aria-expanded'], 'false');

  vm.runInContext(source, context);
  assert.equal(body.children.length, 1);
  assert.match(css, /position:\s*fixed\s*!important/);
  assert.match(css, /z-index:\s*214748364[67]\s*!important/);
});
