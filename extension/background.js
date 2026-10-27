/* Authenticated, allowlisted backend bridge for PERSONAL_CHAT_AI (Manifest V3). */
(() => {
  'use strict';

  if (typeof importScripts === 'function' && !globalThis.PCAIBackendConfig) importScripts('backend-config.js');

  const config = globalThis.PCAIBackendConfig;
  const AUTH_KEY = 'pcaiAuthBearer';
  const MAX_MESSAGE_BYTES = 256 * 1024;
  const MAX_BODY_BYTES = 64 * 1024;
  const MAX_RESPONSE_BYTES = 512 * 1024;
  const REQUEST_TIMEOUT_MS = 280_000;
  const LONG_REQUEST_PATHS = new Set(['/api/suggestions', '/api/translation/retry']);
  const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
  // backend/profiles.py stores UUIDs in compact uuid4().hex form; also accept
  // canonical UUIDs for existing clients and persisted records.
  const UUID = '(?:[0-9a-f]{8}[0-9a-f]{4}[1-8][0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
  const UUID_RE = new RegExp(`^${UUID}$`, 'i');
  const PREF_KEYS = new Set([
    'backendUrl', 'interlocutor', 'mode', 'selectors', 'processedAutomaticKeys',
    'contextWindow', 'contextCharBudget', 'contextSettingsVersion', 'pcaiPanelPosition',
    'pcaiTogglePosition', 'pcaiSetupProgress', 'pcaiLastAccountId', 'pcaiPendingAccountCreation',
  ]);
  const SELECTOR_KEYS = new Set(['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp']);
  const SENSITIVE_KEYS = new Set(['access_token', 'bearer_token', 'refresh_token', 'pairing_code', 'authorization', 'token']);
  const activeRequests = new Map();
  let creatingOffscreenDocument = null;

  const initialization = Promise.resolve()
    .then(() => chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }))
    .then(() => true, () => false);

  const fail = (code, message, httpStatus = null) => ({
    ok: false, error: { code, message }, httpStatus: Number(httpStatus) || null,
  });

  function byteLength(value) {
    return new TextEncoder().encode(value).length;
  }

  function messageIsBounded(message) {
    try { return byteLength(JSON.stringify(message)) <= MAX_MESSAGE_BYTES; }
    catch (_) { return false; }
  }

  function senderKind(sender) {
    if (!sender || sender.id !== chrome.runtime.id) return null;
    let url;
    try { url = new URL(sender.url || ''); } catch (_) { return null; }
    if (url.protocol === 'chrome-extension:' && url.host === chrome.runtime.id
      && url.pathname === '/connection.html' && !url.search && !url.hash) return 'connection';
    if (!sender.tab || !Number.isInteger(sender.tab.id) || sender.frameId !== 0) return null;
    let tabUrl;
    try { tabUrl = new URL(sender.tab.url || ''); } catch (_) { return null; }
    const allowedPage = (candidate) => candidate.protocol === 'https:'
      && (candidate.hostname === 'stripchat.com' || candidate.hostname.endsWith('.stripchat.com'));
    if (!allowedPage(url) || !allowedPage(tabUrl) || url.origin !== tabUrl.origin) return null;
    if (sender.origin && sender.origin !== url.origin) return null;
    return 'content';
  }

  function plainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === null || Object.prototype.toString.call(value) === '[object Object]'));
  }

  function exactKeys(message, required, optional = []) {
    const allowed = new Set([...required, ...optional]);
    const keys = Object.keys(message);
    return required.every((key) => Object.hasOwn(message, key)) && keys.every((key) => allowed.has(key));
  }

  function inspectJson(value, depth = 0, count = { nodes: 0 }) {
    if (depth > 12 || ++count.nodes > 8000) return false;
    if (typeof value === 'string') return value.length <= 16_000;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return Number.isFinite(value) || typeof value === 'boolean' || value === null;
    if (Array.isArray(value)) return value.length <= 1200 && value.every((item) => inspectJson(item, depth + 1, count));
    if (!plainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length <= 300 && keys.every((key) => key.length <= 160 && !['__proto__', 'prototype', 'constructor'].includes(key)
      && inspectJson(value[key], depth + 1, count));
  }

  function validatePreference(key, value) {
    if (!PREF_KEYS.has(key) || key === AUTH_KEY || !inspectJson(value)) return false;
    if (key === 'backendUrl') {
      try {
        const normalized = config.normalizeBackendUrl(value);
        return config.isCoveredByHostPermissions(normalized, chrome.runtime.getManifest().host_permissions || []);
      } catch (_) { return false; }
    }
    if (key === 'interlocutor') return typeof value === 'string' && value.length <= 120;
    if (key === 'mode') return ['manual', 'auto', 'off'].includes(value);
    if (key === 'contextWindow') return [8, 12, 20, 30, 40, 100].includes(value);
    if (key === 'contextCharBudget') return [3000, 6000, 8000, 12000].includes(value);
    if (key === 'contextSettingsVersion') return Number.isInteger(value) && value >= 0 && value <= 10;
    if (key === 'processedAutomaticKeys') return Array.isArray(value) && value.length <= 1200
      && value.every((item) => typeof item === 'string' && item.length <= 200);
    if (key === 'selectors') return plainObject(value) && Object.keys(value).every((name) => SELECTOR_KEYS.has(name)
      && typeof value[name] === 'string' && value[name].length <= 240);
    if (key === 'pcaiLastAccountId') return typeof value === 'string' && UUID_RE.test(value);
    if (key === 'pcaiPanelPosition' || key === 'pcaiTogglePosition') return plainObject(value)
      && Number.isFinite(value.left) && Number.isFinite(value.top)
      && Math.abs(value.left) <= 100_000 && Math.abs(value.top) <= 100_000;
    if (key === 'pcaiSetupProgress') return plainObject(value) && byteLength(JSON.stringify(value)) <= 32 * 1024
      && (value.accountId == null || UUID_RE.test(value.accountId))
      && (value.profileId == null || UUID_RE.test(value.profileId))
      && Number.isInteger(value.step) && value.step >= 1 && value.step <= 8
      && typeof value.editing === 'boolean' && plainObject(value.draft);
    // content.js generates a 128-bit idempotency key (16 random bytes = 32 hex chars).
    // Keep persisted-request validation aligned with that contract and the backend.
    if (key === 'pcaiPendingAccountCreation') return plainObject(value) && /^[0-9a-f]{32}$/.test(value.key || '')
      && plainObject(value.payload) && value.payload.platform === 'stripchat'
      && typeof value.payload.artist_name === 'string' && value.payload.artist_name.trim().length > 0
      && value.payload.artist_name.length <= 120 && typeof value.payload.confirmed === 'boolean'
      && ['dom', 'manual'].includes(value.payload.identity_source)
      && (value.payload.platform_user_id == null || (typeof value.payload.platform_user_id === 'string' && value.payload.platform_user_id.length <= 128));
    return true;
  }

  function preferencesGet(keys) {
    if (!Array.isArray(keys) || keys.length > 20 || keys.some((key) => typeof key !== 'string' || !PREF_KEYS.has(key))) {
      throw new Error('invalid_preferences_request');
    }
    return chrome.storage.local.get([...new Set(keys)]);
  }

  async function preferencesSet(values) {
    if (!plainObject(values) || !Object.keys(values).length || Object.keys(values).length > PREF_KEYS.size
      || Object.entries(values).some(([key, value]) => !validatePreference(key, value))) {
      throw new Error('invalid_preferences_request');
    }
    await chrome.storage.local.set(values);
    return { saved: true };
  }

  async function preferencesRemove(keys) {
    const permitted = new Set(['pcaiSetupProgress', 'pcaiPendingAccountCreation']);
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length || list.some((key) => typeof key !== 'string' || !permitted.has(key))) {
      throw new Error('invalid_preferences_request');
    }
    await chrome.storage.local.remove([...new Set(list)]);
    return { removed: true };
  }

  function safeBackendBase() {
    const stored = chrome.storage.local.get('backendUrl');
    return stored.then((data) => {
      let base;
      try { base = config.resolveStoredBackendUrl(data.backendUrl).url; }
      catch (_) { base = config.DEFAULT_URL; }
      if (!config.isCoveredByHostPermissions(base, chrome.runtime.getManifest().host_permissions || [])) {
        throw new Error('backend_permission_missing');
      }
      return base;
    });
  }

  function stripSensitiveResponse(value, depth = 0) {
    if (depth > 12) return null;
    if (Array.isArray(value)) return value.map((item) => stripSensitiveResponse(item, depth + 1));
    if (!plainObject(value)) return value;
    const safe = {};
    for (const [key, item] of Object.entries(value)) {
      if (!SENSITIVE_KEYS.has(key.toLowerCase())) safe[key] = stripSensitiveResponse(item, depth + 1);
    }
    return safe;
  }

  async function readResponse(response, { keepCredentialFields = false } = {}) {
    if (response.status === 204) return null;
    const advertised = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
    const raw = await response.text();
    if (byteLength(raw) > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return keepCredentialFields ? value : stripSensitiveResponse(value);
    }
    catch (_) { return { error: { code: 'invalid_json', message: `El backend devolvió un cuerpo no JSON (HTTP ${response.status}).` } }; }
  }

  async function hasOffscreenDocument() {
    const documentUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    if (typeof chrome.runtime.getContexts === 'function') {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [documentUrl],
      });
      return contexts.some((context) => context.documentUrl === documentUrl);
    }
    // Chrome 109–115 does not expose runtime.getContexts yet.
    const clients = await globalThis.clients.matchAll();
    return clients.some((client) => client.url === documentUrl);
  }

  async function ensureOffscreenDocument() {
    if (await hasOffscreenDocument()) return;
    if (!creatingOffscreenDocument) {
      creatingOffscreenDocument = chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['WORKERS'],
        justification: 'Alojar un Web Worker para peticiones locales de generación y traducción que pueden superar el límite de fetch del service worker.',
      }).finally(() => { creatingOffscreenDocument = null; });
    }
    await creatingOffscreenDocument;
  }

  function offscreenError(code) {
    const error = new Error(code || 'offscreen_request_failed');
    if (code === 'request_timeout_or_cancelled') error.name = 'AbortError';
    return error;
  }

  async function fetchInOffscreen({ url, method, headers, body, requestId, timeoutMs, signal }) {
    await ensureOffscreenDocument();
    if (signal?.aborted) throw offscreenError('request_timeout_or_cancelled');
    let abortHandler;
    const responsePromise = chrome.runtime.sendMessage({
      target: 'pcai-offscreen', type: 'FETCH', requestId,
      request: { url, method, headers, body, timeoutMs },
    });
    const aborted = signal && new Promise((_, reject) => {
      abortHandler = () => {
        void chrome.runtime.sendMessage({ target: 'pcai-offscreen', type: 'CANCEL', requestId }).catch(() => {});
        reject(offscreenError('request_timeout_or_cancelled'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) abortHandler();
    });
    try {
      const result = await (aborted ? Promise.race([responsePromise, aborted]) : responsePromise);
      if (!result || result.ok !== true || typeof result.bodyText !== 'string'
        || !Number.isInteger(result.status) || typeof result.httpOk !== 'boolean') {
        throw offscreenError(result?.errorCode);
      }
      const contentLength = result.contentLength;
      return {
        status: result.status,
        ok: result.httpOk,
        headers: { get: (name) => String(name).toLowerCase() === 'content-length' ? contentLength ?? null : null },
        text: async () => result.bodyText,
      };
    } finally {
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  }

  function validateApiRequest(message) {
    const allowedKeys = new Set(['type', 'requestId', 'path', 'method', 'body', 'idempotencyKey']);
    if (Object.keys(message).some((key) => !allowedKeys.has(key))) return null;
    if (typeof message.requestId !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(message.requestId)) return null;
    if (typeof message.path !== 'string' || message.path.length > 2048 || !message.path.startsWith('/api/')
      || message.path.startsWith('//') || message.path.includes('\\') || message.path.includes('#')) return null;
    const method = typeof message.method === 'string' ? message.method.toUpperCase() : 'GET';
    let url;
    try { url = new URL(message.path, config.DEFAULT_URL); } catch (_) { return null; }
    if (url.origin !== new URL(config.DEFAULT_URL).origin || url.username || url.password || url.hash) return null;
    const path = url.pathname;
    let allowed = false;
    let bodyRequired = false;
    let idempotencyAllowed = false;
    const exact = (verb, route, needsBody = false) => {
      if (method === verb && path === route) { allowed = true; bodyRequired = needsBody; }
    };
    exact('GET', '/api/health');
    exact('GET', '/api/diagnostics/lm-studio');
    exact('POST', '/api/suggestions', true);
    exact('POST', '/api/translation/retry', true);
    exact('GET', '/api/accounts');
    exact('POST', '/api/accounts', true); idempotencyAllowed = method === 'POST' && path === '/api/accounts';
    exact('GET', '/api/profiles');
    exact('POST', '/api/profiles', true);
    exact('GET', '/api/migrations');

    const account = path.match(new RegExp(`^/api/accounts/(${UUID})$`, 'i'));
    if (account && method === 'PUT') { allowed = true; bodyRequired = true; }
    const accountProfiles = path.match(new RegExp(`^/api/accounts/(${UUID})/profiles$`, 'i'));
    if (accountProfiles && ['GET', 'POST'].includes(method)) { allowed = true; bodyRequired = method === 'POST'; }
    const accountProfile = path.match(new RegExp(`^/api/accounts/(${UUID})/profiles/(${UUID})$`, 'i'));
    if (accountProfile && ['PUT', 'DELETE'].includes(method)) { allowed = true; bodyRequired = method === 'PUT'; }
    const accountProfileActivate = path.match(new RegExp(`^/api/accounts/(${UUID})/profiles/(${UUID})/activate$`, 'i'));
    if (accountProfileActivate && method === 'POST') { allowed = true; }
    const profile = path.match(new RegExp(`^/api/profiles/(${UUID})$`, 'i'));
    if (profile && ['PUT', 'DELETE'].includes(method)) { allowed = true; bodyRequired = method === 'PUT'; }
    const profileActivate = path.match(new RegExp(`^/api/profiles/(${UUID})/activate$`, 'i'));
    if (profileActivate && method === 'POST') { allowed = true; }

    const memory = path.match(/^\/api\/memory\/([^/]+)(?:\/(notes)(?:\/([1-9][0-9]{0,8}))?)?$/);
    let canonicalPath = path;
    let query = '';
    if (memory) {
      let alias;
      try { alias = decodeURIComponent(memory[1]); } catch (_) { return null; }
      if (!alias || alias.length > 120 || /[\u0000-\u001f/\\]/.test(alias)) return null;
      const isNotes = Boolean(memory[2]);
      const noteId = memory[3];
      const params = [...url.searchParams.entries()];
      const accountIds = url.searchParams.getAll('account_id');
      if (params.length !== 1 || params[0][0] !== 'account_id' || accountIds.length !== 1 || !UUID_RE.test(accountIds[0])) return null;
      if ((!isNotes && ['GET', 'DELETE'].includes(method)) || (isNotes && !noteId && method === 'POST')
        || (noteId && ['PUT', 'DELETE'].includes(method))) {
        allowed = true;
        bodyRequired = isNotes && !noteId && method === 'POST' || Boolean(noteId && method === 'PUT');
        canonicalPath = `/api/memory/${encodeURIComponent(alias)}${isNotes ? '/notes' : ''}${noteId ? `/${noteId}` : ''}`;
        query = `?account_id=${encodeURIComponent(accountIds[0].toLowerCase())}`;
      }
    } else if (url.search) return null;

    if (!allowed || (bodyRequired && typeof message.body !== 'string') || (!bodyRequired && message.body != null)) return null;
    let body = null;
    if (bodyRequired) {
      if (byteLength(message.body) > MAX_BODY_BYTES) return { error: 'request_too_large' };
      try { body = JSON.parse(message.body); } catch (_) { return null; }
      if (!plainObject(body) || !inspectJson(body)) return null;
    }
    let idempotencyKey = null;
    if (message.idempotencyKey != null) {
      if (!idempotencyAllowed || typeof message.idempotencyKey !== 'string' || !/^[0-9a-f]{32}$/.test(message.idempotencyKey)) return null;
      idempotencyKey = message.idempotencyKey;
    }
    return { method, path: `${canonicalPath}${query}`, body, bodyRequired, public: method === 'GET' && canonicalPath === '/api/health', idempotencyKey };
  }

  async function performFetch({ method, path, body, token, requestId, controller: suppliedController, timeoutMs = REQUEST_TIMEOUT_MS, idempotencyKey, keepCredentialFields = false }) {
    const controller = suppliedController || new AbortController();
    if (requestId) {
      if (activeRequests.has(requestId) && activeRequests.get(requestId) !== controller) throw new Error('duplicate_request_id');
      activeRequests.set(requestId, controller);
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const base = await safeBackendBase();
      if (controller.signal.aborted) throw offscreenError('request_timeout_or_cancelled');
      const headers = {};
      if (body !== null) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const url = `${base}${path}`;
      const requestBody = body === null ? undefined : JSON.stringify(body);
      const response = LONG_REQUEST_PATHS.has(path)
        ? await fetchInOffscreen({ url, method, headers, body: requestBody, requestId, timeoutMs, signal: controller.signal })
        : await fetch(url, {
          method, headers, body: requestBody, signal: controller.signal,
          credentials: 'omit', cache: 'no-store', redirect: 'error', mode: 'cors', referrerPolicy: 'no-referrer',
        });
      const parsed = await readResponse(response, { keepCredentialFields });
      return { status: response.status, httpOk: response.ok, body: parsed };
    } finally {
      clearTimeout(timeout);
      if (requestId) activeRequests.delete(requestId);
    }
  }

  async function apiRequest(message, sender) {
    const route = validateApiRequest(message);
    if (!route) return fail('operation_not_allowed', 'La operación solicitada no está permitida.');
    if (route.error === 'request_too_large') return fail('request_too_large', 'La solicitud supera el límite permitido.', 413);
    const scopedRequestId = `${sender.tab.id}.${sender.frameId}.${message.requestId}`;
    if (activeRequests.has(scopedRequestId)) return fail('duplicate_request_id', 'Ya existe una solicitud activa con ese identificador.', 409);
    const requestController = new AbortController();
    activeRequests.set(scopedRequestId, requestController);
    try {
      let token = null;
      if (!route.public) {
        const stored = await chrome.storage.local.get(AUTH_KEY);
        token = typeof stored[AUTH_KEY] === 'string' ? stored[AUTH_KEY] : null;
        if (!token) return { ok: true, httpOk: false, status: 401, body: { error: { code: 'authentication_required', message: 'Vincula PERSONAL_CHAT_AI con el backend local.' } } };
      }
      if (requestController.signal.aborted) throw offscreenError('request_timeout_or_cancelled');
      return { ok: true, ...(await performFetch({ ...route, token, requestId: scopedRequestId, controller: requestController })) };
    }
    catch (error) {
      if (error?.message === 'duplicate_request_id') return fail('duplicate_request_id', 'Ya existe una solicitud activa con ese identificador.', 409);
      if (error?.message === 'backend_permission_missing') return fail('backend_permission_missing', 'Chrome no tiene permiso para esta dirección local.');
      if (error?.message === 'response_too_large') return fail('response_too_large', 'El backend devolvió una respuesta demasiado grande.');
      if (error?.name === 'AbortError') return fail('request_timeout_or_cancelled', 'La solicitud se interrumpió o superó el tiempo máximo. Puedes reintentar manualmente.');
      return fail('backend_unavailable_network', 'No se pudo comunicar con el backend local. Comprueba que esté iniciado.');
    } finally {
      if (activeRequests.get(scopedRequestId) === requestController) activeRequests.delete(scopedRequestId);
    }
  }

  async function pairExtension(pairingCode) {
    if (typeof pairingCode !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(pairingCode)) {
      return fail('pairing_code_invalid', 'El código debe tener el formato válido y seguir vigente.');
    }
    try {
      const result = await performFetch({ method: 'POST', path: '/api/auth/pair', body: { pairing_code: pairingCode }, timeoutMs: 10_000, keepCredentialFields: true });
      if (!result.httpOk || result.status !== 200 || result.body?.token_type !== 'Bearer'
        || typeof result.body?.access_token !== 'string' || result.body.access_token.length < 40 || result.body.access_token.length > 128) {
        const code = result.body?.error?.code === 'pairing_code_invalid' ? 'pairing_code_invalid' : 'pairing_failed';
        return fail(code, code === 'pairing_code_invalid' ? 'El código expiró, ya se utilizó o no es válido. Genera uno nuevo desde la consola.' : 'No se pudo completar el emparejamiento.');
      }
      await chrome.storage.local.set({ [AUTH_KEY]: result.body.access_token });
      return { ok: true, connected: true };
    } catch (error) {
      if (error?.message === 'backend_permission_missing') return fail('backend_permission_missing', 'Chrome no tiene permiso para esta dirección local.');
      return fail('backend_unavailable_network', 'No se pudo comunicar con el backend local. Comprueba que esté iniciado.');
    }
  }

  async function connectionStatus() {
    try {
      const health = await performFetch({ method: 'GET', path: '/api/health', timeoutMs: 5000 });
      if (!health.httpOk) return { ok: true, state: 'backend_error', status: health.status };
      const stored = await chrome.storage.local.get(AUTH_KEY);
      const token = typeof stored[AUTH_KEY] === 'string' ? stored[AUTH_KEY] : null;
      if (!token) return { ok: true, state: 'not_paired', backendAvailable: true };
      const auth = await performFetch({ method: 'GET', path: '/api/accounts', token, timeoutMs: 10_000 });
      if (auth.status === 401) return { ok: true, state: 'token_rejected', backendAvailable: true };
      if (auth.status === 403) return { ok: true, state: 'origin_rejected', backendAvailable: true };
      if (!auth.httpOk) return { ok: true, state: 'backend_error', status: auth.status, backendAvailable: true };
      return { ok: true, state: 'connected', backendAvailable: true };
    } catch (_) {
      return { ok: true, state: 'backend_offline', backendAvailable: false };
    }
  }

  async function handleMessage(message, sender) {
    const kind = senderKind(sender);
    if (!kind || !messageIsBounded(message) || !plainObject(message) || typeof message.type !== 'string') {
      return fail('message_forbidden', 'El emisor o el formato del mensaje no está autorizado.', 403);
    }
    if (message.type === 'API_REQUEST' && kind === 'content') return apiRequest(message, sender);
    if (message.type === 'API_CANCEL' && kind === 'content' && exactKeys(message, ['type', 'requestId'])) {
      if (typeof message.requestId !== 'string') return fail('invalid_message', 'La solicitud no es válida.');
      activeRequests.get(`${sender.tab.id}.${sender.frameId}.${message.requestId}`)?.abort();
      return { ok: true, cancelled: true };
    }
    if (message.type === 'PREFS_GET' && kind === 'content' && exactKeys(message, ['type', 'keys'])) {
      try { return { ok: true, values: await preferencesGet(message.keys) }; }
      catch (_) { return fail('invalid_preferences_request', 'La lectura de preferencias no está permitida.'); }
    }
    if (message.type === 'PREFS_SET' && kind === 'content' && exactKeys(message, ['type', 'values'])) {
      try { return { ok: true, ...(await preferencesSet(message.values)) }; }
      catch (_) { return fail('invalid_preferences_request', 'El formato de preferencias no está permitido.'); }
    }
    if (message.type === 'PREFS_REMOVE' && kind === 'content' && exactKeys(message, ['type', 'keys'])) {
      try { return { ok: true, ...(await preferencesRemove(message.keys)) }; }
      catch (_) { return fail('invalid_preferences_request', 'La eliminación de preferencias no está permitida.'); }
    }
    if (message.type === 'OPEN_CONNECTION' && kind === 'content' && exactKeys(message, ['type'])) {
      try { await chrome.runtime.openOptionsPage(); return { ok: true }; }
      catch (_) { return fail('connection_page_unavailable', 'No se pudo abrir la pantalla de conexión.'); }
    }
    if (message.type === 'PAIR' && kind === 'connection' && exactKeys(message, ['type', 'pairingCode'])) return pairExtension(message.pairingCode);
    if (message.type === 'CONNECTION_STATUS' && kind === 'connection' && exactKeys(message, ['type'])) return connectionStatus();
    return fail('operation_not_allowed', 'La operación solicitada no está permitida.', 403);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (!(await initialization)) return fail('secure_storage_unavailable', 'Chrome no pudo restringir el almacenamiento de credenciales. Actualiza Chrome y recarga la extensión.');
      return handleMessage(message, sender);
    })().then(sendResponse, () => sendResponse(fail('internal_error', 'La extensión no pudo completar la operación.')));
    return true;
  });

  const exposed = { validateApiRequest, senderKind, handleMessage, pairExtension, connectionStatus, AUTH_KEY, PREF_KEYS };
  globalThis.PCAIBackground = exposed;
  if (typeof module !== 'undefined' && module.exports) module.exports = exposed;
})();
