const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const AccountDetector = require('../extension/account-detector.js');

function detectionFromObservedAuthenticatedAvatar(name) {
  const image = { tagName: 'IMG', getAttribute: (key) => key === 'alt' ? `Foto de perfil de ${name}` : null };
  const accountLink = {
    tagName: 'A', className: 'dropdown-link hidden-ipad-portrait', id: '',
    querySelectorAll: (selector) => selector === 'img[alt]' ? [image] : [],
  };
  const header = {
    tagName: 'DIV', className: 'header-top is-model-user', id: '',
    querySelectorAll: (selector) => selector === '.user-menu-username' ? []
      : selector === '.dropdown-link' ? [accountLink] : [],
  };
  const document = {
    documentElement: {},
    querySelectorAll: (selector) => selector === '.header-top.is-model-user' ? [header] : [],
  };
  return AccountDetector.detectAccount(document);
}

function panel({ retryOutcomes = [], generationOutcomes = [], realFlow = false, preferenceError = false, detectorError = false, profileFailures = 0, profileSaveFailures = 0, storageSetFailures = 0, savedProfile = null, accounts = null, detection = null, initialStorage = {}, accountPostDelay = 0, accountPostLostResponse = 0, confirmDecision = true, accountCreationRequestsState = null } = {}) {
  const elements = new Map();
  class Element {
    constructor(tag = '') { this.tag = tag; this.value = ''; this.textContent = ''; this.children = []; this.dataset = {}; this.style = {}; this.handlers = {}; this.groups = {}; this.selectors = {}; this.hidden = false; this.disabled = false; }
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
  const view = { copied: null, calls: [], confirmations: [] };
  const accountCreationRequests = accountCreationRequestsState || new Map();
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
    PCAIBackendConfig: require('../extension/backend-config.js'), PCAIAccountDetector: accountDetector, PCAIAccountSetup: require('../extension/account-setup.js'),
    URL, AbortController, crypto: require('node:crypto').webcrypto, PCAISuggestionFlow: Flow, confirm: (message) => { view.confirmations.push(message); return confirmDecision; },
    setTimeout: (callback) => { const id = ++timerSequence; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id), console,
    chrome: { runtime: { getManifest: () => JSON.parse(fs.readFileSync(require.resolve('../extension/manifest.json'), 'utf8')) }, storage: { local: {
      get: async (keys) => { if (preferenceFailurePending) { preferenceFailurePending = false; throw new Error('Synthetic preference failure'); } const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter((key) => key in localStore).map((key) => [key, localStore[key]])); },
      set: async (value) => { if (storageSetFailures > 0) { storageSetFailures -= 1; throw new Error('Synthetic storage write failure'); } Object.assign(localStore, value); }, remove: async (key) => { delete localStore[key]; },
    } } },
    navigator: { clipboard: { writeText: async (text) => { view.copied = text; } } },
    fetch: async (url, options = {}) => {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      view.calls.push({ origin: parsedUrl.origin, path, method: options.method || 'GET', payload: options.body ? JSON.parse(options.body) : null, headers: options.headers || {} });
      if (path === '/api/suggestions') {
        const outcome = generationOutcomes.shift();
        return { ok: outcome.status < 400, status: outcome.status, text: async () => JSON.stringify(outcome.body) };
      }
      let result = {};
      if (path === '/api/accounts' && options.method !== 'POST') result = { accounts: structuredClone(accountList) };
      else if (path === '/api/accounts' && options.method === 'POST') {
        if (accountPostDelay) await new Promise((resolve) => setTimeout(resolve, accountPostDelay));
        const key = options.headers?.['Idempotency-Key'];
        result = key ? accountCreationRequests.get(key) : null;
        if (!result) {
          result = { id: 'account-new', platform: 'stripchat', created_at: '2026-10-23T12:00:00Z', profile_count: 0, configured: false, ...JSON.parse(options.body) };
          accountList.push(result);
          if (key) accountCreationRequests.set(key, result);
        }
        if (accountPostLostResponse > 0) { accountPostLostResponse -= 1; throw new Error('Synthetic lost response after commit'); }
      } else if (path.startsWith('/api/accounts/') && path.endsWith('/profiles')) {
        const accountId = path.split('/')[3];
        if (profileFailures-- > 0) throw new Error('Synthetic profile loading failure');
        if (options.method === 'POST') {
          if (profileSaveFailures-- > 0) throw new Error('Synthetic profile save failure');
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
  return { view, get: (id) => body.querySelector(`#pcai-${id}`), localStore, accountList, profiles, accountCreationRequests, failNextStorageSet: () => { storageSetFailures += 1; }, runTimers: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } } };
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

test('new detected identity creates once, survives double click, and reuses UUID after going back', async () => {
  const f = panel({ accounts: [], savedProfile: false, accountPostDelay: 20 });
  await new Promise((resolve) => setImmediate(resolve));
  f.get('wizard-next').onclick();
  const wizard = f.get('wizard-view');
  wizard.selectors['#pcai-wizard-artist'] = { value: 'Synthetic owner' };
  wizard.selectors['#pcai-wizard-account'] = { value: '' };
  f.get('wizard-next').onclick();
  f.get('wizard-next').onclick();
  await new Promise((resolve) => setTimeout(resolve, 35));
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  const creates = f.view.calls.filter((call) => call.path === '/api/accounts' && call.method === 'POST');
  assert.equal(creates.length, 1);
  assert.match(creates[0].headers['Idempotency-Key'], /^[a-f0-9]{32}$/);
  assert.equal(f.localStore.pcaiLastAccountId, 'account-new');
  assert.equal(f.localStore.pcaiSetupProgress.accountId, 'account-new');
  assert.equal(f.localStore.pcaiPendingAccountCreation, undefined);
  assert.equal(f.accountList.length, 1);

  f.get('wizard-back').onclick();
  const backWizard = f.get('wizard-view');
  backWizard.selectors['#pcai-wizard-account'] = { value: 'account-new' };
  backWizard.selectors['#pcai-wizard-artist'] = { value: 'Synthetic owner' };
  f.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.view.calls.filter((call) => call.path === '/api/accounts' && call.method === 'POST').length, 1);
  assert.ok(f.view.calls.some((call) => call.path === '/api/accounts/account-new' && call.method === 'PUT'));
});

test('confirming identity leaves the personality step enabled and persists the selected trait', async () => {
  const f = panel({ accounts: [], savedProfile: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('wizard-title').textContent, '¿De quién será este asistente?');

  f.get('wizard-view').querySelector('#pcai-wizard-artist').value = 'Synthetic owner';
  f.get('wizard-next').onclick();
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));

  assert.equal(f.get('wizard-title').textContent, 'Elige tu personalidad');
  assert.equal(f.get('wizard-next').disabled, false, 'Continuar debe habilitarse después de confirmar la identidad');
  f.get('wizard-view').groups['[data-wizard-list="personality"]:checked'] = [{ value: 'Dominante y segura' }];
  f.get('wizard-view').handlers.change();
  f.get('wizard-next').onclick();
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));

  assert.equal(f.get('wizard-title').textContent, '¿Qué temas te gustan?');
  const saved = f.view.calls.find((call) => call.path === '/api/accounts/account-new/profiles' && call.method === 'POST');
  assert.equal(saved?.payload.personality[0], 'Dominante y segura');
  assert.equal(f.localStore.pcaiSetupProgress.step, 4);
});

test('fresh installation completes all eight onboarding steps and reaches suggestion generation', async () => {
  const f = panel({
    accounts: [], savedProfile: false, realFlow: true,
    detection: { status: 'unavailable', candidates: [], candidateCount: 0 },
    generationOutcomes: [{ status: 200, body: { language: 'en', original_response: 'That sounds lovely, tell me more.', spanish_translation: 'Suena muy bien, cuéntame más.' } }],
  });
  const tick = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); };
  const next = async () => { assert.equal(f.get('wizard-next').disabled, false); f.get('wizard-next').onclick(); await tick(); };
  const checks = (field, values) => { f.get('wizard-view').groups[`[data-wizard-list="${field}"]:checked`] = values.map((value) => ({ value })); };
  const value = (field, entry) => { f.get('wizard-view').selectors[`[data-wizard-value="${field}"]`] = { value: entry }; };

  await tick();
  assert.equal(f.get('wizard-title').textContent, 'Tu asistente, a tu manera');
  await next();
  assert.equal(f.get('wizard-title').textContent, '¿De quién será este asistente?');
  f.get('wizard-view').querySelector('#pcai-wizard-artist').value = 'Manual Star';
  await next();
  assert.equal(f.get('wizard-title').textContent, 'Elige tu personalidad');
  assert.equal(f.get('wizard-next').disabled, false);

  checks('personality', ['Dominante y segura']); f.get('wizard-view').handlers.change(); await next();
  assert.equal(f.get('wizard-title').textContent, '¿Qué temas te gustan?');
  f.get('wizard-back').onclick();
  assert.equal(f.get('wizard-title').textContent, 'Elige tu personalidad');
  assert.match(f.get('wizard-view').innerHTML, /value="Dominante y segura" checked/);
  await next();
  assert.equal(f.get('wizard-title').textContent, '¿Qué temas te gustan?');
  checks('interests', ['Música']); f.get('wizard-view').handlers.change(); await next();
  assert.equal(f.get('wizard-title').textContent, 'Define tus preferencias');
  checks('visitor_types', ['Conversadores']); checks('conversation_dynamics', ['Directa y clara']);
  f.get('wizard-view').handlers.change(); await next();
  assert.equal(f.get('wizard-title').textContent, 'Así quieres responder');
  value('length', 'medium'); value('emoji_policy', 'few'); checks('tone', ['Seguro']); checks('languages', ['English', 'auto']);
  f.get('wizard-view').handlers.change(); await next();
  assert.equal(f.get('wizard-title').textContent, 'Tus límites personales');
  value('allowedTopics', 'conversación respetuosa'); value('avoidedTopics', 'datos privados'); value('personalRule', 'No afirmar recuerdos no confirmados');
  f.get('wizard-view').handlers.input(); await next();
  assert.equal(f.get('wizard-title').textContent, 'Revisa tu configuración');
  assert.match(f.get('wizard-view').innerHTML, /Dominante y segura/);
  assert.match(f.get('wizard-view').innerHTML, /No afirmar recuerdos no confirmados/);
  await next();

  assert.equal(f.get('onboarding').hidden, true);
  assert.equal(f.get('main-content').hidden, false);
  assert.equal(f.get('title').textContent, 'Asistente de Manual Star');
  assert.equal(f.get('profile-active').textContent, 'Mi asistente');
  assert.equal(f.get('generate-custom').disabled, false);
  const profile = f.profiles[0];
  assert.equal(profile.account_id, 'account-new');
  assert.equal(profile.onboarding_complete, true);
  assert.deepEqual(profile.personality, ['Dominante y segura']);
  assert.deepEqual(profile.interests, ['Música']);
  assert.deepEqual(profile.languages, ['English', 'auto']);
  assert.deepEqual(profile.personal_boundaries, ['Temas permitidos: conversación respetuosa', 'Temas a evitar: datos privados', 'Límites personales: No afirmar recuerdos no confirmados']);
  assert.equal(f.localStore.pcaiSetupProgress, undefined);

  f.get('message').value = 'What do you enjoy talking about?';
  f.get('alias').value = 'Synthetic visitor';
  await f.get('generate-custom').onclick();
  await tick();
  const generation = f.view.calls.find((call) => call.path === '/api/suggestions');
  assert.equal(generation.payload.target_message, 'What do you enjoy talking about?');
  assert.equal(generation.payload.model_account_id, 'account-new');
  assert.equal(f.get('results').querySelectorAll('.pcai-suggestion').length, 1);

  const restored = panel({
    accounts: [structuredClone(f.accountList[0])], savedProfile: structuredClone(profile),
    detection: { status: 'unavailable', candidates: [], candidateCount: 0 },
    initialStorage: { pcaiLastAccountId: 'account-new' },
  });
  await tick();
  assert.equal(restored.get('wizard-title').textContent, '¿De quién será este asistente?');
  restored.get('wizard-view').querySelector('#pcai-wizard-account').value = 'account-new';
  restored.get('wizard-view').querySelector('#pcai-wizard-artist').value = 'Manual Star';
  restored.get('wizard-next').onclick();
  await tick();
  assert.equal(restored.get('onboarding').hidden, true);
  assert.equal(restored.get('main-content').hidden, false);
  assert.equal(restored.get('title').textContent, 'Asistente de Manual Star');
  assert.equal(restored.view.calls.some((call) => call.method === 'POST' && (call.path === '/api/accounts' || call.path.endsWith('/profiles'))), false);
});

test('onboarding reports a profile save failure and can continue after retry', async () => {
  const f = panel({ savedProfile: false, profileSaveFailures: 1, realFlow: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('wizard-title').textContent, 'Elige tu personalidad');
  f.get('wizard-view').groups['[data-wizard-list="personality"]:checked'] = [{ value: 'Dominante y segura' }];
  f.get('wizard-view').handlers.change();
  f.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('wizard-title').textContent, 'Elige tu personalidad');
  assert.match(f.get('wizard-status').textContent, /No se pudo conectar con el backend local/);
  assert.equal(f.get('wizard-next').disabled, false);

  f.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('wizard-title').textContent, '¿Qué temas te gustan?');
  assert.equal(f.profiles.length, 1);
  assert.equal(f.profiles[0].personality[0], 'Dominante y segura');
});

test('onboarding makes local progress persistence failures visible without discarding the selection', async () => {
  const f = panel({ savedProfile: false });
  await new Promise((resolve) => setImmediate(resolve));
  f.get('wizard-view').groups['[data-wizard-list="personality"]:checked'] = [{ value: 'Dominante y segura' }];
  f.get('wizard-view').handlers.input();
  f.failNextStorageSet();
  f.runTimers();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(f.get('wizard-status').textContent, /No se pudo guardar la copia local del progreso/);
  assert.match(f.get('wizard-view').innerHTML, /Dominante y segura/);
  f.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('wizard-title').textContent, '¿Qué temas te gustan?');
  assert.equal(f.profiles[0].personality[0], 'Dominante y segura');
});

test('account creation retry after a lost response reuses the persisted idempotency key', async () => {
  const f = panel({ accounts: [], savedProfile: false, accountPostLostResponse: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  f.get('wizard-next').onclick();
  const wizard = f.get('wizard-view');
  wizard.selectors['#pcai-wizard-artist'] = { value: 'Synthetic owner' };
  wizard.selectors['#pcai-wizard-account'] = { value: '' };
  f.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.accountList.length, 1);
  assert.ok(f.localStore.pcaiPendingAccountCreation?.key);
  const firstKey = f.localStore.pcaiPendingAccountCreation.key;
  f.get('wizard-next').onclick();
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
  const creates = f.view.calls.filter((call) => call.path === '/api/accounts' && call.method === 'POST');
  assert.equal(creates.length, 2);
  assert.deepEqual(creates.map((call) => call.headers['Idempotency-Key']), [firstKey, firstKey]);
  assert.equal(f.accountList.length, 1);
  assert.equal(f.localStore.pcaiLastAccountId, 'account-new');
});

test('pending account creation is recovered idempotently after extension reload and resumes the same UUID', async () => {
  const first = panel({ accounts: [], savedProfile: false, accountPostLostResponse: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  first.get('wizard-next').onclick();
  first.get('wizard-view').selectors['#pcai-wizard-artist'] = { value: 'Synthetic owner' };
  first.get('wizard-view').selectors['#pcai-wizard-account'] = { value: '' };
  first.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(first.localStore.pcaiPendingAccountCreation);

  const reloaded = panel({
    accounts: first.accountList, savedProfile: false, initialStorage: first.localStore,
    accountCreationRequestsState: first.accountCreationRequests,
  });
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reloaded.accountList.length, 1);
  assert.equal(reloaded.localStore.pcaiPendingAccountCreation, undefined);
  assert.equal(reloaded.localStore.pcaiLastAccountId, 'account-new');
  assert.equal(reloaded.localStore.pcaiSetupProgress.accountId, 'account-new');
  assert.equal(reloaded.get('wizard-title').textContent, 'Elige tu personalidad');
});

test('duplicate artist names require explicit choice and show account status, date, and local id', async () => {
  const accounts = [
    { id: 'local-uuid-00000001', platform: 'stripchat', artist_name: 'Synthetic owner', created_at: '2026-10-20T12:00:00Z', profile_count: 0, configured: false },
    { id: 'local-uuid-00000002', platform: 'stripchat', artist_name: 'Synthetic owner', created_at: '2026-10-21T12:00:00Z', profile_count: 2, configured: true },
  ];
  const f = panel({ accounts, savedProfile: false, confirmDecision: false, detection: { status: 'candidate', artistName: 'Synthetic owner', platformUserId: null, identitySource: 'authenticated-header' } });
  await new Promise((resolve) => setImmediate(resolve));
  const html = f.get('wizard-view').innerHTML;
  assert.match(html, /2 cuentas locales/);
  assert.match(html, /Sin perfil/);
  assert.match(html, /Configurada/);
  assert.match(html, /ID …00000001/);
  assert.match(html, /ID …00000002/);
  assert.doesNotMatch(html, /value="local-uuid-00000001" selected/);
  f.get('wizard-view').selectors['#pcai-wizard-artist'] = { value: 'Synthetic owner' };
  f.get('wizard-view').selectors['#pcai-wizard-account'] = { value: '' };
  f.get('wizard-next').onclick();
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.view.confirmations.length, 1);
  assert.match(f.view.confirmations[0], /cuentas locales.*cuenta independiente/i);
  assert.equal(f.view.calls.filter((call) => call.path === '/api/accounts' && call.method === 'POST').length, 0);
});

test('same-name accounts are never auto-selected and explicit selection updates only that UUID', async () => {
  const accounts = [
    { id: 'local-uuid-00000001', platform: 'stripchat', artist_name: 'Synthetic owner', created_at: '2026-10-20T12:00:00Z', profile_count: 0, configured: false },
    { id: 'local-uuid-00000002', platform: 'stripchat', artist_name: 'Synthetic owner', created_at: '2026-10-21T12:00:00Z', profile_count: 0, configured: false },
  ];
  const f = panel({ accounts, savedProfile: false, detection: { status: 'candidate', artistName: 'Synthetic owner', platformUserId: null, identitySource: 'authenticated-header' } });
  await new Promise((resolve) => setImmediate(resolve));
  const wizard = f.get('wizard-view');
  wizard.selectors['#pcai-wizard-account'] = { value: 'local-uuid-00000002' };
  wizard.selectors['#pcai-wizard-artist'] = { value: 'Synthetic owner' };
  f.get('wizard-next').onclick();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.view.calls.some((call) => call.method === 'PUT' && call.path === '/api/accounts/local-uuid-00000002'));
  assert.equal(f.view.calls.some((call) => call.method === 'POST' && call.path === '/api/accounts'), false);
  assert.equal(f.view.confirmations.length, 0);
});

test('account list refresh exposes an account added after the panel initial snapshot', async () => {
  const accounts = Array.from({ length: 6 }, (_, index) => ({ id: `local-account-${index + 1}`, platform: 'stripchat', artist_name: 'Synthetic owner', created_at: `2026-10-${20 + index}T12:00:00Z`, profile_count: 0, configured: false }));
  const f = panel({ accounts, savedProfile: false, detection: { status: 'candidate', artistName: 'Synthetic owner', platformUserId: null, identitySource: 'authenticated-header' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(f.get('wizard-view').innerHTML, /6 cuentas locales/);
  f.accountList.push({ id: 'seventh-account', platform: 'stripchat', artist_name: 'Synthetic owner', created_at: '2026-10-23T12:00:00Z', profile_count: 0, configured: false });
  await f.get('wizard-view').querySelector('#pcai-refresh-accounts').onclick();
  assert.match(f.get('wizard-view').innerHTML, /7 cuentas locales/);
  assert.match(f.get('wizard-view').innerHTML, /ID …-account/);
});

test('observed Chrome DOM flows through detector, content.js and onboarding name field', async () => {
  const detection = detectionFromObservedAuthenticatedAvatar('NovaArtist');
  assert.equal(detection.status, 'candidate');
  assert.equal(detection.artistName, 'NovaArtist');
  const f = panel({ detection });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.get('title').textContent, 'Configura tu asistente');
  assert.equal(f.get('onboarding').hidden, false);
  assert.match(f.get('wizard-view').innerHTML, /Señal de cabecera detectada: NovaArtist/);
  assert.match(f.get('wizard-view').innerHTML, /value="NovaArtist"/);
  assert.match(f.get('wizard-status').textContent, /confirma la identidad detectada/i);
});

test('late detector result refreshes the already rendered identity step without overwriting manual input', async () => {
  const f = panel({ detection: {
    status: 'unavailable', candidates: [], reason: 'no_authenticated_identity_signal',
    diagnostics: { authenticatedHeaderCount: 0, authenticatedAvatarCount: 0 },
  } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(f.get('wizard-view').innerHTML, /Señal de cabecera detectada/);
  const artistInput = f.get('wizard-view').querySelector('#pcai-wizard-artist');
  artistInput.value = 'Nombre escrito a mano';
  f.view.identityChanged({
    status: 'candidate', artistName: 'Detected Star', platformUserId: null,
    identitySource: 'authenticated-header', diagnostics: { authenticatedHeaderCount: 1, authenticatedAvatarCount: 1 },
  });
  assert.match(f.get('wizard-view').innerHTML, /Señal de cabecera detectada: Detected Star/);
  assert.equal(artistInput.value, 'Nombre escrito a mano');
  assert.match(f.get('wizard-status').textContent, /confirma la identidad detectada/i);
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

test('name-only evidence from the authenticated header preserves the already confirmed account in the same page session', async () => {
  const f = panel();
  await new Promise((resolve) => setImmediate(resolve));
  f.view.identityChanged({ status: 'candidate', artistName: 'Synthetic owner', platformUserId: null, identitySource: 'authenticated-header' });
  assert.equal(f.get('title').textContent, 'Asistente de Synthetic owner');
  assert.equal(f.get('onboarding').hidden, true);
  assert.equal(f.get('main-content').hidden, false);
  assert.equal(f.get('generate').disabled, false);
});

test('loss of every verified identity signal locks account data without deleting onboarding progress', async () => {
  const f = panel();
  await new Promise((resolve) => setImmediate(resolve));
  f.localStore.pcaiSetupProgress = { accountId: 'account-1', profileId: 'profile-1', step: 6, editing: false };
  f.view.identityChanged({ status: 'unavailable', candidates: [] });
  assert.equal(f.get('title').textContent, 'Configura tu asistente');
  assert.equal(f.get('onboarding').hidden, false);
  assert.equal(f.get('main-content').hidden, true);
  assert.equal(f.get('generate').disabled, true);
  assert.equal(f.localStore.pcaiSetupProgress.accountId, 'account-1');
  assert.match(f.get('wizard-status').textContent, /verificar la cuenta activa/i);
});

test('a confirmed artistic-name change reuses the matched platform account and preserves its profile', async () => {
  const f = panel();
  await new Promise((resolve) => setImmediate(resolve));
  f.view.identityChanged({ status: 'candidate', artistName: 'Synthetic Star', platformUserId: 'owner-1', identitySource: 'dom' });
  assert.equal(f.get('title').textContent, 'Configura tu asistente');
  assert.equal(f.get('onboarding').hidden, false);
  assert.equal(f.get('generate').disabled, true);
  f.get('wizard-view').selectors['#pcai-wizard-account'] = { value: 'account-1' };
  f.get('wizard-view').selectors['#pcai-wizard-artist'] = { value: 'Synthetic Star' };
  f.get('wizard-next').onclick();
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.view.calls.some((call) => call.method === 'PUT' && call.path === '/api/accounts/account-1'));
  assert.equal(f.view.calls.some((call) => call.method === 'POST' && call.path === '/api/accounts'), false);
  assert.equal(f.accountList.length, 1);
  assert.equal(f.accountList[0].artist_name, 'Synthetic Star');
  assert.equal(f.get('title').textContent, 'Asistente de Synthetic Star');
  assert.equal(f.profiles[0].id, 'profile-1');
  assert.equal(f.profiles[0].account_id, 'account-1');
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

test('migrates only the legacy default backend URL and preserves other Chrome preferences', async () => {
  const f = panel({ initialStorage: { backendUrl: 'http://127.0.0.1:8765', mode: 'manual', contextWindow: 20, privatePreference: 'keep-me' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.localStore.backendUrl, 'http://127.0.0.1:8000');
  assert.equal(f.get('url').value, 'http://127.0.0.1:8000');
  assert.equal(f.localStore.mode, 'manual');
  assert.equal(f.localStore.contextWindow, 20);
  assert.equal(f.localStore.privatePreference, 'keep-me');
  assert.ok(f.view.calls.filter((call) => call.path === '/api/health').every((call) => call.origin === 'http://127.0.0.1:8000'));
});

test('keeps custom loopback backend URLs and rejects origins not covered by Chrome permissions', async () => {
  const f = panel({ initialStorage: { backendUrl: 'http://127.0.0.1:9001' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.localStore.backendUrl, 'http://127.0.0.1:9001');
  f.get('url').value = 'http://127.0.0.1:9123';
  await f.get('save-settings').onclick();
  assert.equal(f.localStore.backendUrl, 'http://127.0.0.1:9123');
  assert.ok(f.view.calls.some((call) => call.path === '/api/health' && call.origin === 'http://127.0.0.1:9123'));
  f.get('url').value = 'https://example.com';
  await f.get('save-settings').onclick();
  assert.equal(f.localStore.backendUrl, 'http://127.0.0.1:9123');
  assert.match(f.get('status').textContent, /URL del backend debe ser local/);
});
