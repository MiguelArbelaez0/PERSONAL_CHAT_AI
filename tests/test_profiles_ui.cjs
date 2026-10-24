const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function panel({ retryOutcomes = [], generationOutcomes = [], realFlow = false, preferenceError = false, detectorError = false, profileFailures = 0, savedProfile = null, accounts = null, detection = null, initialStorage = {} } = {}) {
  const elements = new Map();
  class Element {
    constructor(tag = '') { this.tag = tag; this.value = ''; this.textContent = ''; this.children = []; this.dataset = {}; this.style = {}; this.handlers = {}; this.groups = {}; this.selectors = {}; this.hidden = false; }
    querySelector(selector) {
      if (this.selectors[selector]) return this.selectors[selector];
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    }
    querySelectorAll(selector) {
      if (this.groups[selector]) return this.groups[selector];
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
    static latestIncoming() { return null; }
  }
  const Flow = realFlow ? class extends require('../extension/suggestion-flow.js') {
    constructor(options) { super(options); view.flow = options; view.coordinator = this; }
  } : FixtureFlow;
  const owner = { id: 'account-1', platform: 'stripchat', artist_name: 'Synthetic owner', platform_user_id: 'owner-1', identity_source: 'dom', confirmed: true };
  const accountList = accounts || [owner];
  const configured = {
    id: 'profile-1', account_id: owner.id, schema_version: 2, name: 'Mi asistente', description: '', tone: '', style: '', rules: '',
    personality: ['Dulce y cariñosa'], interests: ['Música'], visitor_types: ['Conversadores'], conversation_dynamics: ['Juguetona'],
    response_style: { tone: ['Cálido'], length: 'short', emoji_policy: 'match_context', custom_instructions: '' },
    languages: ['Español', 'auto'], personal_boundaries: ['Temas a evitar: datos privados'],
    completed_sections: ['personality', 'interests', 'visitor_types', 'conversation_dynamics', 'response_style', 'languages', 'personal_boundaries'], onboarding_complete: true,
  };
  const profiles = savedProfile === false ? [] : [savedProfile || configured];
  let active = profiles[0]?.id || null;
  const localStore = { ...initialStorage };
  const body = new Element('body');
  let preferenceFailurePending = preferenceError;
  let timerSequence = 0;
  const timers = new Map();
  const accountDetector = {
    detectAccount: () => detection || { status: 'candidate', artistName: 'Synthetic owner', platformUserId: 'owner-1', identitySource: 'dom', candidateCount: 1 },
    observeAccount: (document, onChange) => { view.identityChanged = onChange; return { stop() {}, scan() {} }; },
  };
  const snapshot = (accountId = owner.id) => ({
    account: accountList.find((item) => item.id === accountId) || owner,
    active_id: profiles.some((profile) => profile.id === active && profile.account_id === accountId) ? active : null,
    onboarding_complete: Boolean(profiles.find((profile) => profile.id === active && profile.account_id === accountId)?.onboarding_complete),
    profiles: structuredClone(profiles.filter((profile) => profile.account_id === accountId)),
  });
  const context = vm.createContext({
    window: {}, document: { body, documentElement: body, createElement: (tag) => new Element(tag), querySelectorAll: () => [] },
    location: { hostname: 'stripchat.com' },
    PCAIConversationDetector: detectorError ? class { constructor() { throw new Error('Synthetic detector failure'); } } : undefined,
    PCAIAccountDetector: accountDetector, PCAIAccountSetup: require('../extension/account-setup.js'),
    URL, AbortController, PCAISuggestionFlow: Flow, confirm: () => true,
    setTimeout: (callback) => { const id = ++timerSequence; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id), console,
    chrome: { storage: { local: {
      get: async (keys) => { if (preferenceFailurePending) { preferenceFailurePending = false; throw new Error('Synthetic preference failure'); } const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter((key) => key in localStore).map((key) => [key, localStore[key]])); },
      set: async (value) => Object.assign(localStore, value), remove: async (key) => { delete localStore[key]; },
    } } },
    navigator: { clipboard: { writeText: async (text) => { view.copied = text; } } },
    fetch: async (url, options = {}) => {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      view.calls.push({ path, method: options.method || 'GET', payload: options.body ? JSON.parse(options.body) : null });
      if (path === '/api/suggestions') {
        const outcome = generationOutcomes.shift();
        return { ok: outcome.status < 400, status: outcome.status, text: async () => JSON.stringify(outcome.body) };
      }
      let result = {};
      if (path === '/api/accounts' && options.method !== 'POST') result = { accounts: structuredClone(accountList) };
      else if (path === '/api/accounts' && options.method === 'POST') {
        result = { id: 'account-new', platform: 'stripchat', ...JSON.parse(options.body) }; accountList.push(result);
      } else if (path.startsWith('/api/accounts/') && path.endsWith('/profiles')) {
        const accountId = path.split('/')[3];
        if (profileFailures-- > 0) throw new Error('Synthetic profile loading failure');
        if (options.method === 'POST') {
          result = { id: `profile-${profiles.length + 1}`, account_id: accountId, ...JSON.parse(options.body) }; profiles.push(result);
          if (result.onboarding_complete) active = result.id;
        } else result = snapshot(accountId);
      } else if (path.startsWith('/api/accounts/') && path.includes('/profiles/')) {
        const parts = path.split('/'); const profileId = parts[5];
        if (parts.at(-1) === 'activate') { active = profileId; result = profiles.find((item) => item.id === active); }
        else if (options.method === 'PUT') { Object.assign(profiles.find((item) => item.id === profileId), JSON.parse(options.body)); result = profiles.find((item) => item.id === profileId); if (result?.onboarding_complete) active = profileId; }
        else if (options.method === 'DELETE') { const index = profiles.findIndex((item) => item.id === profileId); if (index >= 0) profiles.splice(index, 1); result = {}; }
      } else if (path.startsWith('/api/accounts/') && options.method === 'PUT') {
        const accountId = path.split('/')[3]; const target = accountList.find((item) => item.id === accountId); Object.assign(target, JSON.parse(options.body)); result = target;
      } else if (path === '/api/health') result = { ok: true };
      else if (path === '/api/diagnostics/lm-studio') result = { available: false };
      else if (path === '/api/translation/retry') {
        result = retryOutcomes.shift();
        if (result instanceof Error) throw result;
      }
      const statusCode = options.method === 'POST' ? 201 : options.method === 'DELETE' ? 204 : 200;
      return { ok: true, status: statusCode, text: async () => JSON.stringify(result) };
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../extension/content.js'), 'utf8'), context);
  return { view, get: (id) => body.querySelector(`#pcai-${id}`), localStore, accountList, profiles, runTimers: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } } };
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

test('Mi asistente edits a separate account-scoped draft and activates it only after backend confirmation', async () => {
  const f = panel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('title').textContent, 'Asistente de Synthetic owner');
  assert.equal(f.get('profile-active').textContent, 'Mi asistente');
  f.get('profile-edit').onclick();
  assert.equal(f.get('onboarding').hidden, false);

  const wizard = f.get('wizard-view');
  const checks = (field, values) => { wizard.groups[`[data-wizard-list="${field}"]:checked`] = values.map((value) => ({ value })); };
  const value = (field, entry) => { const input = { value: entry }; wizard.selectors[`[data-wizard-value="${field}"]`] = input; };
  const none = (field) => { wizard.selectors[`[data-wizard-none="${field}"]`] = { checked: true }; };
  const next = async () => { f.get('wizard-next').onclick(); for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve)); };

  checks('personality', ['Dulce y cariñosa']);
  await next();
  assert.ok(f.view.calls.some((call) => call.path === '/api/accounts/account-1/profiles' && call.method === 'POST'));
  none('interests'); await next();
  none('visitors'); await next();
  value('length', 'short'); value('emoji_policy', 'match_context'); checks('languages', ['English', 'auto']);
  await next();
  none('boundaries'); await next();
  await next();

  assert.equal(f.get('onboarding').hidden, true, f.get('wizard-status').textContent);
  assert.equal(f.get('main-content').hidden, false);
  const writes = f.view.calls.filter((call) => call.path.startsWith('/api/accounts/account-1/profiles'));
  const finalWrite = writes.find((call) => call.method === 'PUT' && call.payload?.onboarding_complete === true);
  assert.ok(finalWrite);
  assert.equal(finalWrite.payload.completed_sections.length, 7);
});

test('new installation requires manual identity confirmation and persists onboarding progress by account', async () => {
  const f = panel({ accounts: [], detection: { status: 'unavailable', candidates: [], candidateCount: 0 } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('title').textContent, 'Configura tu asistente');
  assert.equal(f.get('generate').disabled, true);
  const next = async () => { f.get('wizard-next').onclick(); for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve)); };
  await next();
  const wizard = f.get('wizard-view');
  wizard.selectors['#pcai-wizard-artist'] = { value: 'Manual Luna' };
  wizard.selectors['#pcai-wizard-account'] = { value: '' };
  await next();
  assert.equal(f.accountList.length, 1);
  assert.equal(f.accountList[0].artist_name, 'Manual Luna');
  assert.equal(f.accountList[0].identity_source, 'manual');
  assert.equal(f.get('generate').disabled, true);
  wizard.groups['[data-wizard-list="personality"]:checked'] = [{ value: 'Elegante y sofisticada' }];
  wizard.handlers.input();
  f.runTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.localStore.pcaiSetupProgress.step, 3);
  assert.equal(f.localStore.pcaiSetupProgress.draft.personality[0], 'Elegante y sofisticada');
  await next();
  assert.equal(f.localStore.pcaiSetupProgress.accountId, 'account-new');
  assert.equal(f.localStore.pcaiSetupProgress.profileId, 'profile-2');
  assert.equal(f.localStore.pcaiSetupProgress.step, 4);
  assert.equal(f.localStore.pcaiSetupProgress.draft.personality[0], 'Elegante y sofisticada');
  assert.equal(f.get('generate').disabled, true);
});

test('saved onboarding draft resumes at its account-scoped step without overwriting other profiles', async () => {
  const owner = { id: 'account-1', platform: 'stripchat', artist_name: 'Synthetic owner', platform_user_id: 'owner-1', identity_source: 'dom', confirmed: true };
  const pending = { id: 'pending-profile', account_id: 'account-1', schema_version: 2, name: 'Mi asistente', personality: [], interests: [], visitor_types: [], conversation_dynamics: [], response_style: { tone: [], length: null, emoji_policy: null, custom_instructions: '' }, languages: [], personal_boundaries: [], completed_sections: ['personality'], onboarding_complete: false };
  const f = panel({ accounts: [owner], savedProfile: pending, initialStorage: { pcaiSetupProgress: { accountId: 'account-1', profileId: 'pending-profile', step: 5, editing: false } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('onboarding').hidden, false);
  assert.equal(f.get('wizard-title').textContent, 'Define tus preferencias');
  assert.equal(f.view.calls.filter((call) => call.method !== 'GET').length, 0);
  assert.equal(f.localStore.pcaiSetupProgress.profileId, 'pending-profile');
});

test('an unsaved first-step draft with no backend profile resumes from account-scoped local progress', async () => {
  const owner = { id: 'account-1', platform: 'stripchat', artist_name: 'Synthetic owner', platform_user_id: 'owner-1', identity_source: 'dom', confirmed: true };
  const draft = { name: 'Mi asistente', personality: ['Coqueta y divertida'], interests: [], visitor_types: [], conversation_dynamics: [], response_style: { tone: [], length: null, emoji_policy: null, custom_instructions: '' }, languages: [], personal_boundaries: [], completed_sections: [] };
  const f = panel({ accounts: [owner], savedProfile: false, initialStorage: { pcaiSetupProgress: { accountId: 'account-1', profileId: null, step: 4, editing: false, draft } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('onboarding').hidden, false);
  assert.equal(f.get('wizard-title').textContent, '¿Qué temas te gustan?');
  assert.equal(f.view.calls.filter((call) => call.method !== 'GET').length, 0);
  assert.equal(f.localStore.pcaiSetupProgress.draft.personality[0], 'Coqueta y divertida');
});

test('a detected account change clears the old account context and requires confirmation', async () => {
  const f = panel();
  await new Promise((resolve) => setImmediate(resolve));
  f.view.identityChanged({ status: 'candidate', artistName: 'Different owner', platformUserId: 'owner-2', identitySource: 'dom' });
  assert.equal(f.get('title').textContent, 'Configura tu asistente');
  assert.equal(f.get('onboarding').hidden, false);
  assert.equal(f.get('main-content').hidden, true);
  assert.equal(f.get('generate').disabled, true);
  assert.match(f.get('wizard-status').textContent, /cambio|ambigua/i);

  const f2 = panel();
  await new Promise((resolve) => setImmediate(resolve));
  f2.view.identityChanged({ status: 'candidate', artistName: 'Synthetic owner', platformUserId: null, identitySource: 'dom' });
  assert.equal(f2.get('main-content').hidden, true, 'a previously stable identity must not silently degrade to name-only matching');
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
  test(`confirmed account profile loads despite unrelated initialization failure (preferences=${preferenceError})`, async () => {
    const f = panel({ preferenceError, detectorError: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.get('profile-active').textContent, 'Mi asistente');
    assert.equal(f.get('title').textContent, 'Asistente de Synthetic owner');
    assert.ok(f.view.calls.some((call) => call.path === '/api/accounts'));
    assert.ok(f.view.calls.some((call) => call.path === '/api/accounts/account-1/profiles'));
    assert.ok(f.view.calls.every((call) => !call.path.startsWith('/api/profiles')));
    assert.ok(f.view.calls.every((call) => call.method === 'GET'));
  });
}

test('profile connection failure leaves generation locked and offers the identity setup', async () => {
  const f = panel({ profileFailures: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('generate').disabled, true);
  assert.equal(f.get('onboarding').hidden, false);
  assert.equal(f.get('title').textContent, 'Configura tu asistente');
});

test('extension reload reads the selected account profile without creating a duplicate', async () => {
  const savedProfile = { id: 'legacy-synthetic', account_id: 'account-1', schema_version: 2, name: 'Synthetic saved voice', personality: ['Elegante y sofisticada'], interests: ['Anime'], visitor_types: [], conversation_dynamics: [], response_style: { tone: ['Natural'], length: 'medium', emoji_policy: 'few' }, languages: ['English'], personal_boundaries: [], completed_sections: ['personality', 'interests', 'visitor_types', 'conversation_dynamics', 'response_style', 'languages', 'personal_boundaries'], onboarding_complete: true };
  for (let reload = 0; reload < 2; reload++) {
    const f = panel({ savedProfile });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.get('profile-active').textContent, savedProfile.name);
    assert.equal(f.get('profile-select').value, savedProfile.id);
    assert.match(f.get('profile-summary').textContent, /Elegante y sofisticada/);
    assert.equal(f.profiles.length, 1);
    assert.ok(f.view.calls.every((call) => call.method === 'GET'));
  }
});
