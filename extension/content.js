(() => {
  if (window.__personalChatAIInstalled) return;

  const root = document.createElement('div');
  root.id = 'pcai-root';
  const selectorField = (key, label, purpose, placeholder = 'Selector CSS') => `
        <label>${label}<small class="pcai-selector-purpose">${purpose}</small>
          <span class="pcai-selector-input"><input id="pcai-sel-${key}" placeholder="${placeholder}" /><button id="pcai-pick-${key}" type="button">Elegir en página</button></span>
          <small id="pcai-selector-state-${key}" class="pcai-selector-state">Sin probar</small>
        </label>`;
  root.innerHTML = `
    <button id="pcai-toggle" type="button" aria-label="Abrir asistente" aria-expanded="false"><span aria-hidden="true">✦</span></button>
    <section id="pcai-panel" aria-label="Asistente local" hidden>
      <header id="pcai-drag-handle" class="pcai-header">
        <div class="pcai-brand"><span class="pcai-brand-icon" aria-hidden="true">✦</span><span><strong id="pcai-title">Configura tu asistente</strong><small id="pcai-header-state">Borradores privados</small></span></div>
        <div class="pcai-header-controls"><button id="pcai-minimize" class="pcai-icon-button" type="button" aria-label="Minimizar panel" title="Minimizar">−</button><button id="pcai-close" class="pcai-icon-button" type="button" aria-label="Cerrar asistente" title="Cerrar">×</button></div>
      </header>
      <section id="pcai-onboarding" class="pcai-onboarding" aria-label="Configuración inicial" hidden>
        <div class="pcai-wizard-intro"><span id="pcai-wizard-kicker">PERSONAL_CHAT_AI · CONFIGURACIÓN</span><h1 id="pcai-wizard-title">Tu asistente, a tu manera</h1><p id="pcai-wizard-description">Configura tus preferencias paso a paso. Tus respuestas siempre quedan bajo tu control.</p></div>
        <div class="pcai-progress"><div class="pcai-progress-track"><span id="pcai-progress-fill"></span></div><div class="pcai-progress-caption"><span id="pcai-progress-label">Paso 1 de 8</span><span id="pcai-progress-percent">12 %</span></div></div>
        <div id="pcai-wizard-view" class="pcai-wizard-view"></div>
        <div class="pcai-wizard-nav"><button id="pcai-wizard-back" type="button">Anterior</button><div><button id="pcai-wizard-cancel" type="button" hidden>Cancelar edición</button><button id="pcai-wizard-next" class="primary" type="button">Comenzar</button></div></div>
        <p id="pcai-wizard-status" class="pcai-wizard-status" role="status" aria-live="polite"></p>
      </section>
      <div id="pcai-main-content">
      <div class="pcai-status" id="pcai-status" role="status">Comprobando servicios locales…</div>
      <section id="pcai-connection-needed" class="pcai-connection-needed" hidden aria-label="Conexión segura">
        <p id="pcai-connection-message">Vincula la extensión con el backend local para continuar.</p>
        <button id="pcai-connect-button" type="button">Abrir conexión segura</button>
      </section>
      <div class="pcai-conversation-card">
        <div class="pcai-conversation-heading"><strong id="pcai-active-alias">Sin conversación identificada</strong></div>
        <div id="pcai-last-incoming" class="pcai-last-message" aria-live="polite"></div>
        <div class="pcai-detection" id="pcai-detection" aria-live="polite" hidden></div>
      </div>
      <details id="pcai-context-details" class="pcai-context-details"><summary>Ver contexto</summary><div class="pcai-context" id="pcai-context" aria-live="polite"></div></details>
      <section class="pcai-suggestions-section"><div class="pcai-section-heading"><h2>Respuesta sugerida</h2></div><div id="pcai-results" aria-live="polite"></div></section>
      <button class="primary pcai-generate-main" id="pcai-generate" type="button">Generar respuesta</button>
      <label class="pcai-mode-control">Modo<select id="pcai-mode"><option value="manual">Manual</option><option value="auto" selected>Automático</option><option value="off">Desactivado</option></select><span id="pcai-mode-badge" class="pcai-mode-badge">Automático</span></label>
      <details id="pcai-personalities" class="pcai-advanced"><summary>Mi asistente · <span id="pcai-profile-active">Cargando…</span></summary>
        <p id="pcai-profile-summary" class="pcai-profile-summary">Tus preferencias se guardan localmente por cuenta.</p>
        <label>Perfil de esta cuenta<select id="pcai-profile-select"></select></label>
        <div class="pcai-actions"><button id="pcai-profile-edit" type="button">Editar preferencias</button><button id="pcai-profile-activate" type="button">Activar perfil</button><button id="pcai-profile-new" type="button">Crear perfil</button></div>
        <small id="pcai-profile-status" role="status">Los datos se aíslan por cuenta de modelo.</small>
      </details>
      <details class="pcai-advanced-shell"><summary>Opciones avanzadas</summary>
      <div class="pcai-advanced-content">
      <details class="pcai-advanced"><summary>Responder manualmente</summary>
        <label>Mensaje<textarea id="pcai-message" maxlength="4000" placeholder="Pega o selecciona un mensaje para generar una respuesta."></textarea></label>
        <label>Contexto previo opcional<textarea id="pcai-context-extra" maxlength="4000" placeholder="- Interlocutor: referencia anterior\n- Usuario: respuesta propia"></textarea><small>Úsalo si Stripchat ya no muestra mensajes anteriores. No se guarda; marca cada línea como Interlocutor o Usuario.</small></label>
        <label>Alias para esta respuesta<input id="pcai-alias" maxlength="120" placeholder="Opcional; necesario para usar memoria" /></label>
        <div class="pcai-actions"><button id="pcai-use-selection" type="button">Usar selección</button><button class="primary" id="pcai-generate-custom" type="button">Generar respuesta personalizada</button></div>
      </details>
      <details class="pcai-advanced"><summary>Memoria local</summary>
        <label>Nueva nota (hecho explícito, preferencia, tema recurrente o inferencia incierta)<input id="pcai-note" maxlength="1000" placeholder="Etiqueta el tipo; no guardes conjeturas como hechos" /></label>
        <button id="pcai-save-note" type="button">Guardar nota</button><button id="pcai-load-notes" type="button">Ver notas</button><button id="pcai-clear-memory" type="button">Eliminar toda la memoria</button>
        <div id="pcai-notes"></div>
      </details>
      <details class="pcai-advanced"><summary>Diagnóstico y configuración</summary>
        <p>Los detalles técnicos quedan aquí para no distraer del chat.</p>
        <label>Mensajes para el contexto<select id="pcai-context-window"><option value="8">8 mensajes</option><option value="12">12 mensajes</option><option value="20">20 mensajes</option><option value="30">30 mensajes</option><option value="40">40 mensajes</option><option value="100" selected>100 mensajes</option></select></label>
        <label>Límite de caracteres del historial<select id="pcai-context-char-budget"><option value="3000">3.000 caracteres</option><option value="6000">6.000 caracteres</option><option value="8000">8.000 caracteres</option><option value="12000" selected>12.000 caracteres</option></select></label>
        <div id="pcai-auto-diagnostic" class="pcai-auto-diagnostic" role="status" aria-live="polite"></div>
        <label>URL del backend<input id="pcai-url" value="http://127.0.0.1:8000" /></label><button id="pcai-save-settings" type="button">Guardar URL</button>
        <p>Usa «Elegir en página» para proponer un selector desde un elemento real, o inspecciónalo en DevTools. El candidato debe probarse con el DOM actual y no queda verificado al guardarlo.</p>
        ${selectorField('conversation', 'Contenedor del chat activo', 'Agrupa el alias y las filas de una sola conversación.')}
        ${selectorField('alias', 'Alias del interlocutor', 'Debe coincidir una vez dentro del chat activo.')}
        ${selectorField('message', 'Fila de mensaje', 'Debe coincidir con cada mensaje visible.')}
        ${selectorField('incoming', 'Fila entrante', 'Distingue mensajes escritos por el interlocutor.')}
        ${selectorField('outgoing', 'Fila propia', 'Distingue tus mensajes dentro del chat.')}
        ${selectorField('system', 'Fila del sistema (opcional)', 'Excluye avisos, regalos y elementos que no sean mensajes normales.')}
        ${selectorField('text', 'Texto del mensaje (opcional)', 'Elemento de texto dentro de cada fila; vacío usa el texto de la fila.', 'Selector dentro de la fila')}
        ${selectorField('timestamp', 'Hora del mensaje (opcional)', 'Permite ordenar cronológicamente cuando la página no los ordena.', 'Selector dentro de la fila')}
        <button id="pcai-test-selectors" type="button">Probar selectores en esta página</button><button id="pcai-save-selectors" type="button">Guardar configuración</button>
        <div id="pcai-selector-diagnostic" aria-live="polite">Los selectores no están verificados.</div>
      </details>
      </div>
      </details>
      </div>
    </section>`;
  const mountPoint = document.body || document.documentElement;
  mountPoint.append(root);
  const $ = (selector) => root.querySelector(selector);
  const status = $('#pcai-status');
  const message = $('#pcai-message');
  const alias = $('#pcai-alias');
  const results = $('#pcai-results');
  const notes = $('#pcai-notes');
  const detection = $('#pcai-detection');
  const activeAlias = $('#pcai-active-alias');
  const contextView = $('#pcai-context');
  const contextDetails = $('#pcai-context-details');
  const modeSelect = $('#pcai-mode');
  const modeBadge = $('#pcai-mode-badge');
  const Detector = globalThis.PCAIConversationDetector;
  const AccountDetector = globalThis.PCAIAccountDetector;
  const SuggestionFlow = globalThis.PCAISuggestionFlow;
  let retrySuggestion = null;
  let suggestionFlow;
  let detector;
  let selectors = {};
  let verifiedSelectorSignature = null;
  const autoDiagnostic = {
    event: 'ninguno', lastIncoming: 'no detectado', generation: 'pendiente', requestId: 'ninguno',
    http: 'sin petición', backendError: '', lmCount: 'sin resultado',
    profileSources: 'sin comprobar', memoryStatus: 'sin consultar', language: 'sin detectar', responseLanguage: 'sin validar',
    contextCount: '0', targetFound: 'no', contextSent: 'no',
    extractedCounts: '0 DOM (0 entrantes / 0 propios / 0 sin clasificar)', contextSize: '0 mensajes / 0 caracteres', contextTrim: 'ninguno',
  };
  let mode = 'auto';
  let currentSnapshot = null;
  let latestConversationKey = null;
  let lastSeenConversationKey = null;
  let manuallyEditedMessage = false;
  let contextWindow = 100;
  let contextCharBudget = 12000;
  let switchTimer = null;
  let autoTimer = null;
  const pendingAutoPayloads = new Map();
  const processedAutomaticKeys = new Set();
  const BackendConfig = globalThis.PCAIBackendConfig;
  let base = BackendConfig.DEFAULT_URL;
  let currentAccountId = null;
  let currentAccount = null;
  let accountReady = false;
  let accountObserver = null;
  let modelAccounts = [];
  let profileSnapshot = { account: null, active_id: null, onboarding_complete: false, profiles: [] };
  let editingProfileId = null;
  let wizardStep = 1;
  let wizardEditing = false;
  let wizardDraft = null;
  let wizardProgressTimer = null;
  let identityConfirmInFlight = false;
  let identityDetection = { status: 'unavailable', candidates: [] };
  let wizardIdentityPrefillName = '';
  let detectedAccountMatch = null;
  let apiRequestSequence = 0;

  async function extensionMessage(payload) {
    const result = await chrome.runtime.sendMessage(payload);
    if (!result || result.ok !== true) {
      const error = new Error(result?.error?.message || 'La extensión no pudo completar la operación.');
      error.code = result?.error?.code || 'extension_message_failed';
      error.httpStatus = Number(result?.httpStatus) || null;
      throw error;
    }
    return result;
  }

  async function storageGet(keys) {
    return (await extensionMessage({ type: 'PREFS_GET', keys: Array.isArray(keys) ? keys : [keys] })).values || {};
  }

  async function storageSet(values) {
    return extensionMessage({ type: 'PREFS_SET', values });
  }

  async function storageRemove(keys) {
    return extensionMessage({ type: 'PREFS_REMOVE', keys: Array.isArray(keys) ? keys : [keys] });
  }

  function setConnectionNotice(visible, text = 'Vincula la extensión con el backend local para continuar.') {
    const box = $('#pcai-connection-needed');
    if (!box) return;
    box.hidden = !visible;
    $('#pcai-connection-message').textContent = text;
  }

  function discoverStripchatSelectors() {
    const hostname = location.hostname.toLowerCase();
    if (hostname !== 'stripchat.com' && !hostname.endsWith('.stripchat.com')) return null;
    const probe = new Detector({ document, onUpdate: () => {}, onIncoming: () => {} });
    probe.configure(Detector.stripchatSelectors);
    const report = probe.diagnose();
    return { selectors: { ...Detector.stripchatSelectors }, report };
  }

  function clampPosition(element, left, top) {
    const rect = element.getBoundingClientRect?.() || {};
    const width = rect.width || (element === root ? 48 : 380);
    const height = rect.height || (element === root ? 48 : 600);
    const x = Math.max(8, Math.min(Number(left) || 0, Math.max(8, window.innerWidth - width - 8)));
    const y = Math.max(8, Math.min(Number(top) || 0, Math.max(8, window.innerHeight - height - 8)));
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }

  function restorePosition(element, value) {
    if (!value || !Number.isFinite(value.left) || !Number.isFinite(value.top)) return;
    clampPosition(element, value.left, value.top);
  }

  function setPanelOpen(open) {
    const panel = $('#pcai-panel');
    panel.hidden = !open;
    $('#pcai-toggle').setAttribute('aria-expanded', String(open));
    $('#pcai-toggle').setAttribute('aria-label', open ? 'Cerrar asistente' : 'Abrir asistente');
    if (open) {
      detector?.scan();
      void check();
      const clampPanel = () => {
        if (panel.style.left) clampPosition(panel, Number.parseFloat(panel.style.left), Number.parseFloat(panel.style.top));
      };
      if (window.requestAnimationFrame) window.requestAnimationFrame(clampPanel);
      else setTimeout(clampPanel, 0);
    }
  }

  let dragState = null;
  let ignoreToggleClick = false;
  function startDrag(event, element, key) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.('button,input,textarea,select,summary,a')) return;
    if (window.getSelection?.()?.toString()) return;
    const rect = element.getBoundingClientRect();
    if (element === $('#pcai-panel') && !element.style.left) clampPosition(element, rect.left, rect.top);
    if (element === root && !root.style.left) clampPosition(root, rect.left, rect.top);
    dragState = { element, key, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragState || (dragState.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragState.moved = true;
    clampPosition(dragState.element, dragState.left + dx, dragState.top + dy);
  }

  function endDrag() {
    if (!dragState) return;
    const { element, key, moved } = dragState;
    if (moved) {
      ignoreToggleClick = key === 'toggle';
      void storageSet({ [key]: { left: Number.parseFloat(element.style.left), top: Number.parseFloat(element.style.top) } }).catch(() => {});
    }
    dragState = null;
  }

  async function loadPrefs() {
    try {
      const data = await storageGet(['backendUrl', 'interlocutor', 'mode', 'selectors', 'processedAutomaticKeys', 'contextWindow', 'contextCharBudget', 'pcaiPanelPosition', 'pcaiTogglePosition']);
      try {
        const storedBackend = BackendConfig.resolveStoredBackendUrl(data.backendUrl);
        base = storedBackend.url;
        if (storedBackend.migrated) await storageSet({ backendUrl: base });
      } catch (_) { base = BackendConfig.DEFAULT_URL; }
      $('#pcai-url').value = base;
      alias.value = data.interlocutor || '';
      selectors = data.selectors || {};
      const required = ['conversation', 'alias', 'message', 'incoming', 'outgoing'];
      if (required.some((key) => !String(selectors[key] || '').trim())) {
        const discovered = discoverStripchatSelectors();
        if (discovered) {
          selectors = discovered.selectors;
          for (const key of ['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp']) {
            $(`#pcai-sel-${key}`).value = selectors[key] || '';
          }
          if (discovered.report.ok) {
            verifiedSelectorSignature = JSON.stringify(selectors);
            await storageSet({ selectors });
            $('#pcai-selector-diagnostic').textContent = 'Selectores Stripchat detectados y comprobados contra el DOM visible en esta sesión.';
          } else {
            $('#pcai-selector-diagnostic').textContent = 'Se probaron candidatos derivados del DOM observado, pero falta evidencia para habilitar el modo automático.';
          }
          showSelectorDiagnostic(discovered.report);
        }
      }
      for (const key of ['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp']) {
        $(`#pcai-sel-${key}`).value = selectors[key] || '';
      }
      mode = ['manual', 'auto', 'off'].includes(data.mode) ? data.mode : 'auto';
      for (const key of Array.isArray(data.processedAutomaticKeys) ? data.processedAutomaticKeys.slice(-1200) : []) {
        if (typeof key === 'string') processedAutomaticKeys.add(key);
      }
      const contextSettingsVersion = Number(data.contextSettingsVersion) || 0;
      if (contextSettingsVersion < 3) {
        contextWindow = 100;
        contextCharBudget = 12000;
        await storageSet({ contextWindow, contextCharBudget, contextSettingsVersion: 3 });
      } else {
        contextWindow = [8, 12, 20, 30, 40, 100].includes(Number(data.contextWindow)) ? Number(data.contextWindow) : 100;
        contextCharBudget = [3000, 6000, 8000, 12000].includes(Number(data.contextCharBudget)) ? Number(data.contextCharBudget) : 12000;
      }
      $('#pcai-context-window').value = String(contextWindow);
      $('#pcai-context-char-budget').value = String(contextCharBudget);
      modeSelect.value = mode;
      modeBadge.textContent = mode === 'auto' ? 'Automático' : mode === 'off' ? 'Desactivado' : 'Manual';
      restorePosition(root, data.pcaiTogglePosition);
      restorePosition($('#pcai-panel'), data.pcaiPanelPosition);
      configureDetector();
      applyMode();
      renderAutoDiagnostic();
    } catch (error) {
      showTechnicalError(`No se pudo completar la inicialización del panel: ${error.message}`);
    } finally {
      await initializeAssistant();
    }
  }
  async function api(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    const idempotencyKey = Object.entries(headers).find(([name]) => name.toLowerCase() === 'idempotency-key')?.[1] || null;
    const requestId = options.requestId || `${Date.now()}-${++apiRequestSequence}`;
    const signal = options.signal;
    if (signal?.aborted) {
      const aborted = new Error('La solicitud fue cancelada.'); aborted.name = 'AbortError'; throw aborted;
    }
    const message = {
      type: 'API_REQUEST', requestId, path, method,
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };
    let abortHandler = null;
    try {
      const pending = chrome.runtime.sendMessage(message);
      let reply;
      if (signal) {
        const aborted = new Promise((_, reject) => {
          abortHandler = () => {
            void chrome.runtime.sendMessage({ type: 'API_CANCEL', requestId }).catch(() => {});
            const error = new Error('La solicitud fue cancelada.'); error.name = 'AbortError'; reject(error);
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        });
        reply = await Promise.race([pending, aborted]);
      } else reply = await pending;
      if (!reply || reply.ok !== true) {
        const error = SuggestionFlow.normalizeApiError({ error: reply?.error || { code: 'backend_unavailable_network' } }, reply?.httpStatus);
        if (error.code === 'authentication_required') setConnectionNotice(true, 'El backend exige vincular esta extensión. Abre la conexión segura para continuar.');
        throw error;
      }
      if (reply.status === 401) setConnectionNotice(true, 'La extensión no está vinculada o el token fue revocado. Abre la conexión segura para recuperar el acceso.');
      else if (reply.status === 403) setConnectionNotice(true, 'El backend rechazó el origen o el Host. Comprueba que esta sea la instalación emparejada.');
      if (!reply.httpOk) throw SuggestionFlow.normalizeApiError(reply.body, reply.status);
      const body = reply.body;
      if (body && typeof body === 'object') body.__httpStatus = reply.status;
      if (reply.status !== 401 && reply.status !== 403) setConnectionNotice(false);
      return body;
    } catch (cause) {
      if (cause?.name === 'AbortError') throw cause;
      const error = cause && typeof cause === 'object' && typeof cause.code === 'string'
        ? cause : SuggestionFlow.normalizeApiError(null);
      if (!(cause && typeof cause === 'object' && typeof cause.code === 'string')) error.cause = cause;
      throw error;
    } finally {
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
    }
  }
  function accountScopedPath(path) {
    if (!currentAccountId) throw new Error('Confirma una cuenta de modelo antes de consultar datos privados.');
    return `${path}${path.includes('?') ? '&' : '?'}account_id=${encodeURIComponent(currentAccountId)}`;
  }
  function renderAutoDiagnostic(patch = {}) {
    Object.assign(autoDiagnostic, patch);
    const connected = Boolean(currentSnapshot?.conversationKey && currentSnapshot.alias);
    const counts = currentSnapshot?.counts || { total: currentSnapshot?.messages?.length || 0, incoming: 0, outgoing: 0 };
    $('#pcai-auto-diagnostic').textContent = [
      `Modo automático: ${mode === 'auto' ? 'activado' : 'desactivado'}`,
      `Conversación: ${connected ? 'identificada' : 'no identificada'}`,
      `Observador del DOM: ${detector?.isObserving() ? 'activo' : 'inactivo'}`,
      `Último evento: ${autoDiagnostic.event}`,
      `Mensajes: ${counts.total} total, ${counts.incoming} entrantes, ${counts.outgoing} propios`,
      `Último entrante: ${autoDiagnostic.lastIncoming}`,
      `ID de solicitud: ${autoDiagnostic.requestId}`,
      `Generación: ${autoDiagnostic.generation}`,
      `Última petición backend: ${autoDiagnostic.http}${autoDiagnostic.backendError ? ` · ${autoDiagnostic.backendError}` : ''}`,
      `Último resultado LM Studio: ${autoDiagnostic.lmCount}`,
      `Fuentes de perfil: ${autoDiagnostic.profileSources}`,
      `Memoria del alias activo: ${autoDiagnostic.memoryStatus}`,
      `Idioma detectado/regla: ${autoDiagnostic.language}`,
      `Idioma de salida validado: ${autoDiagnostic.responseLanguage}`,
      `Mensajes de contexto enviados: ${autoDiagnostic.contextCount}`,
      `Filas extraídas del DOM: ${autoDiagnostic.extractedCounts}`,
      `Historial enviado: ${autoDiagnostic.contextSize}`,
      `Recorte de contexto: ${autoDiagnostic.contextTrim}`,
      `Mensaje objetivo encontrado: ${autoDiagnostic.targetFound} · contexto enviado: ${autoDiagnostic.contextSent}`,
    ].join('\n');
  }
  function recordPromptDiagnostics(diagnostics) {
    if (!diagnostics) return;
    const sources = Object.entries(diagnostics.knowledge_sources || {}).map(([name, source]) => {
      const existence = source.local_file_exists ? 'local' : source.shared_file_exists ? 'compartido' : 'ausente';
      return `${name} ${existence}/${source.loaded_from || 'sin cargar'}/${source.included_in_prompt ? 'incluido' : 'no incluido'}`;
    });
    autoDiagnostic.profileSources = sources.join(', ') || 'ninguna';
    autoDiagnostic.memoryStatus = `${diagnostics.memory_available ? 'disponible' : 'sin alias'} · ${Number(diagnostics.memory_note_count) || 0} nota(s)`;
    autoDiagnostic.language = `${diagnostics.detected_language || 'desconocido'} / ${diagnostics.language_rule || 'sin regla'} (${Math.round((Number(diagnostics.language_confidence) || 0) * 100)}%)`;
    const responseLanguages = Array.isArray(diagnostics.response_language_codes) ? diagnostics.response_language_codes.join(', ') : '';
    autoDiagnostic.responseLanguage = `${responseLanguages || 'sin datos'} · reintento: ${diagnostics.language_retry_used ? 'sí' : 'no'}`;
    autoDiagnostic.contextCount = String(Number(diagnostics.context_message_count) || 0);
    autoDiagnostic.extractedCounts = `${Number(diagnostics.dom_extracted_message_count) || 0} DOM (${Number(diagnostics.dom_extracted_incoming_count) || 0} entrantes / ${Number(diagnostics.dom_extracted_outgoing_count) || 0} propios / ${Number(diagnostics.dom_extracted_unclassified_count) || 0} sin clasificar)`;
    autoDiagnostic.contextSize = `${Number(diagnostics.context_message_count) || 0} mensajes / ${Number(diagnostics.context_included_chars) || 0} caracteres · ventana ${Number(diagnostics.client_context_window) || 0} mensajes · prompt estimado ${Number(diagnostics.estimated_prompt_tokens) || 0}/${Number(diagnostics.configured_model_context_tokens) || 0} tokens`;
    autoDiagnostic.contextTrim = (diagnostics.context_truncation_reason || []).join(', ') || 'ninguno';
    autoDiagnostic.targetFound = diagnostics.last_incoming_found ? 'sí' : 'no';
    autoDiagnostic.contextSent = diagnostics.context_sent ? 'sí' : 'no';
    autoDiagnostic.lmCount = `${Number(diagnostics.response_count) || 0} respuesta(s)`;
  }
  suggestionFlow = new SuggestionFlow({
    getMode: () => mode,
    getAccountId: () => currentAccountId,
    getConversationKey: () => latestConversationKey,
    getInterlocutorAlias: () => currentSnapshot?.alias || null,
    getLatestIncomingFingerprint: () => SuggestionFlow.latestIncomingIdentity(currentSnapshot),
    getContextWindow: () => contextWindow,
    getContextCharBudget: () => contextCharBudget,
    request: (payload, signal, requestId) => api('/api/suggestions', { method: 'POST', signal, requestId, body: JSON.stringify(payload) }),
    onLoading: ({ done } = {}) => {
      const generate = $('#pcai-generate');
      generate.disabled = done ? mode === 'off' : true;
      generate.textContent = done ? 'Generar respuesta' : 'Generando…';
      const customGenerate = $('#pcai-generate-custom');
      customGenerate.disabled = done ? mode === 'off' : true;
      customGenerate.textContent = done ? 'Generar respuesta personalizada' : 'Generando…';
      updateGenerateAvailability();
      results.querySelectorAll?.(done ? '[data-pcai-state="loading"]' : '[data-pcai-state]').forEach((item) => item.remove());
      if (!done) {
        const loading = document.createElement('p');
        loading.className = 'pcai-result-state';
        loading.dataset.pcaiState = 'loading';
        loading.textContent = 'Generando respuesta…';
        results.append(loading);
        detection.textContent = 'Generando respuestas con el contexto de este chat…';
        detection.hidden = false;
        renderAutoDiagnostic({ generation: 'en curso' });
      }
    },
    onSuccess: ({ originalResponse, spanishTranslation, language, automatic, configuredMode, initial, alias: who, notice, httpStatus, diagnostics }) => {
      results.querySelectorAll?.('[data-pcai-state]').forEach((item) => item.remove());
      results.querySelectorAll?.('.pcai-suggestion').forEach((item) => item.remove());
      addSuggestion(originalResponse, spanishTranslation, language, who, automatic, initial, diagnostics, configuredMode);
      recordPromptDiagnostics(diagnostics);
      status.textContent = notice || 'Se generó una respuesta.';
      status.className = notice ? 'pcai-status is-warn' : 'pcai-status is-ok';
      detection.textContent = automatic ? (notice || `Sugerencias listas para ${who}; revísalas antes de copiar.`) : 'Sugerencias listas para revisar y copiar.';
      detection.hidden = false;
      renderAutoDiagnostic({ generation: 'completada', http: httpStatus ? `HTTP ${httpStatus}` : 'respuesta recibida', backendError: '', lmCount: '1 respuesta' });
    },
    onEmpty: ({ automatic, alias: who, notice, httpStatus, diagnostics }) => {
      showSuggestionState(notice || 'No se generaron respuestas. Puedes intentarlo de nuevo.', true);
      recordPromptDiagnostics(diagnostics);
      status.textContent = notice || 'La generación terminó sin respuestas.';
      status.className = 'pcai-status is-warn';
      detection.textContent = 'No se generaron respuestas. Puedes reintentar.';
      detection.hidden = false;
      renderAutoDiagnostic({ generation: 'completada sin respuestas', http: httpStatus ? `HTTP ${httpStatus}` : 'respuesta recibida', backendError: '', lmCount: '0 sugerencias' });
      if (automatic) detection.textContent = `No se generaron respuestas para ${who || 'esta conversación'}.`;
    },
    onError: ({ automatic, error, httpStatus }) => {
      showSuggestionState(`No se pudieron generar respuestas: ${error.message || 'error del backend'}`, true);
      const statusByCode = {
        backend_unavailable_network: 'No se pudo conectar con el backend local.',
        backend_unavailable: 'El backend local no está disponible.',
        lm_studio_unavailable: 'El backend responde, pero LM Studio no está disponible.',
        invalid_request: 'El backend rechazó el formato de la solicitud.',
        generation_validation_failed: 'LM Studio respondió, pero la respuesta no superó la validación.',
        lm_studio_http_error: 'LM Studio devolvió un error HTTP.',
        lm_studio_timeout: 'LM Studio agotó el tiempo de espera.',
        lm_studio_invalid_response: 'LM Studio devolvió un formato no válido.',
        invalid_json: 'El backend respondió con JSON no válido.',
        render_error: 'La respuesta llegó, pero el panel no pudo mostrarla.',
      };
      const preciseReason = error.reasonCode && error.reasonCode !== error.code && error.message;
      status.textContent = preciseReason || `${statusByCode[error.code] || (httpStatus ? `Falló la petición HTTP ${httpStatus}.` : 'Falló la generación.') } Puedes reintentar.`;
      status.className = 'pcai-status is-error';
      detection.textContent = `Falló la generación: ${error.message || 'error del backend'}. Puedes reintentar.`;
      detection.hidden = false;
      const safeIssues = (error.diagnostics?.issues || []).map((item) => `${Array.isArray(item.path) ? item.path.join('.') : 'solicitud'}:${String(item.reason || 'validation_error')}`).slice(0, 6).join(', ');
      const duplicateSource = ['target_incoming', 'previous_unsubmitted_draft'].includes(error.diagnostics?.duplicate_source) ? ` · duplicado: ${error.diagnostics.duplicate_source}` : '';
      const technicalSummary = `${error.reasonCode || error.code || 'error'}${duplicateSource} · ${String(error.message || 'Error sin descripción').slice(0, 120)}${safeIssues ? ` · ${safeIssues}` : ''}`;
      renderAutoDiagnostic({ generation: 'fallida', http: httpStatus ? `HTTP ${httpStatus}` : 'sin respuesta HTTP', backendError: technicalSummary.slice(0, 180), lmCount: 'sin resultado' });
      showTechnicalError(technicalSummary);
      if (automatic) detection.textContent = 'Falló la generación automática; puedes reintentar desde Respuestas sugeridas.';
    },
    onDiagnostic: (record) => {
      autoDiagnostic.generation = `${record.state}${record.reason ? ` · ${record.reason}` : ''} · ${record.duration_ms} ms`;
      if (record.generation_id) autoDiagnostic.requestId = record.generation_id;
      renderAutoDiagnostic();
    },
  });
  async function check() {
    try {
      await api('/api/health');
      status.textContent = 'Backend local conectado'; status.className = 'pcai-status is-ok';
      try {
        const d = await api('/api/diagnostics/lm-studio');
        status.textContent += d.available ? ' · LM Studio disponible' : ' · LM Studio desconectado';
        status.className = d.available ? 'pcai-status is-ok' : 'pcai-status is-warn';
        if (!d.available && d.error) showTechnicalError(d.error);
      } catch (error) {
        if (error.httpStatus === 401) {
          status.textContent = 'Backend local conectado · extensión sin vincular';
          status.className = 'pcai-status is-warn';
          setConnectionNotice(true, 'Vincula la extensión con el backend local para cargar cuentas y continuar.');
        } else {
          status.textContent += ' · LM Studio no disponible'; status.className = 'pcai-status is-warn'; showTechnicalError(error.message);
        }
      }
    } catch (error) {
      status.textContent = 'Backend local desconectado'; status.className = 'pcai-status is-error';
      showTechnicalError(error.message);
    }
  }

  function showTechnicalError(detail) {
    const diagnostic = $('#pcai-selector-diagnostic');
    if (diagnostic && detail) diagnostic.textContent = String(detail).slice(0, 500);
  }

  function addSuggestion(text, spanishTranslation, language, suggestionAlias, automatic, initial = false, diagnostics = null, configuredMode = mode) {
    const card = document.createElement('article');
    card.className = 'pcai-suggestion';
    card.dataset.alias = suggestionAlias || '';
    const languageLabels = { en: 'Inglés', fr: 'Francés', pt: 'Portugués', de: 'Alemán', it: 'Italiano', es: 'Español', ru: 'Ruso', uk: 'Ucraniano', ar: 'Árabe', ja: 'Japonés', zh: 'Chino', ko: 'Coreano', el: 'Griego', he: 'Hebreo', th: 'Tailandés', hi: 'Hindi' };
    const heading = document.createElement('div');
    heading.className = 'pcai-suggestion-meta';
    const modeLabel = configuredMode === 'auto' ? 'Automático' : configuredMode === 'off' ? 'Desactivado' : 'Manual';
    heading.textContent = `Respuesta sugerida · ${languageLabels[language] || language || 'Idioma detectado'}${suggestionAlias ? ` · ${suggestionAlias}` : ''} · Modo ${modeLabel} · ${automatic ? 'Inicio automático' : 'Solicitud manual'}${initial ? ' · Inicial' : ''}`;
    const edit = document.createElement('textarea');
    edit.value = text;
    edit.setAttribute('aria-label', 'Editar sugerencia');
    let translationTextNode = null;
    let translatedSource = spanishTranslation ? text : null;
    edit.addEventListener('input', () => {
      card.dataset.dirty = 'true';
      if (translationTextNode && translatedSource !== null && edit.value !== translatedSource) {
        translationTextNode.textContent = 'La traducción corresponde al original generado; regenera para actualizarla.';
      }
    });
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copiar respuesta';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(edit.value); copy.textContent = 'Respuesta copiada'; setTimeout(() => copy.textContent = 'Copiar respuesta', 1200); }
      catch (_) { status.textContent = 'No se pudo copiar; selecciona y copia el texto manualmente.'; }
    };
    card.append(heading, edit, copy);
    if (language !== 'es') {
      const translation = document.createElement('div');
      translation.className = 'pcai-translation';
      const translationHeading = document.createElement('strong');
      translationHeading.textContent = 'Traducción al español';
      const translationText = document.createElement('p');
      translationText.textContent = spanishTranslation || (diagnostics?.translation_failure_reason
        ? `No disponible: ${translationFailureMessage(diagnostics.translation_failure_reason, diagnostics.translation_http_status)}`
        : 'Traducción no disponible.');
      translationTextNode = translationText;
      translation.append(translationHeading, translationText);
      if (!spanishTranslation && diagnostics?.translation_retry_available) {
        let translationRetryToken = diagnostics.translation_retry_token || null;
        const retryTranslation = document.createElement('button');
        retryTranslation.type = 'button';
        retryTranslation.textContent = 'Reintentar traducción';
        retryTranslation.onclick = async () => {
          const sourceText = edit.value;
          retryTranslation.disabled = true;
          retryTranslation.textContent = 'Reintentando traducción…';
          try {
            const outcome = await api('/api/translation/retry', {
              method: 'POST', body: JSON.stringify({ original_response: sourceText, language, retry_token: translationRetryToken }),
            });
            if (edit.value !== sourceText) throw new Error('El original cambió; vuelve a intentar la traducción.');
            if (!outcome.available || !outcome.spanish_translation) {
              translationRetryToken = outcome.retry_token || null;
              translationText.textContent = `${outcome.failure_message || 'No se pudo validar la traducción.'} La respuesta original se conserva; puedes reintentar.`;
              status.textContent = 'La traducción no superó la validación; el original sigue disponible.';
              status.className = 'pcai-status is-warn';
              retryTranslation.disabled = false;
              retryTranslation.textContent = 'Reintentar traducción';
              return;
            }
            translationText.textContent = outcome.spanish_translation;
            translatedSource = sourceText;
            retryTranslation.remove();
            status.textContent = 'Traducción al español lista.';
            status.className = 'pcai-status is-ok';
          } catch (error) {
            translationText.textContent = error.message || 'No se pudo reintentar la traducción.';
            retryTranslation.disabled = false;
            retryTranslation.textContent = 'Reintentar traducción';
          }
        };
        translation.append(retryTranslation);
      }
      card.append(translation);
    }
    results.append(card);
    while (results.children.length > 8) {
      const removable = [...results.children].find((item) => item.dataset.dirty !== 'true' && item !== card);
      if (!removable) break;
      removable.remove();
    }
  }

  function translationFailureMessage(reason, httpStatus) {
    const messages = {
      empty_response: 'LM Studio no devolvió contenido.',
      invalid_format: 'La respuesta no contenía una traducción en el formato esperado.',
      truncated: 'LM Studio cortó la traducción antes de completarla.',
      invalid_response: 'LM Studio devolvió un cuerpo de respuesta no válido.',
      wrong_language: 'La traducción no está en español.',
      added_question: 'La traducción introdujo una pregunta ausente en el original.',
      greeting_mismatch: 'La traducción no conservó el saludo nocturno del original.',
      language_unverified: 'No se pudo confirmar que la traducción esté en español.',
      fidelity_review_failed: 'La revisión detectó cambios u omisiones.',
      invalid_review_format: 'LM Studio no devolvió una revisión de traducción verificable.',
      timeout: 'LM Studio agotó el tiempo de espera.',
      review_timeout: 'Se agotó el tiempo al revisar la traducción.',
      review_truncated: 'LM Studio cortó la revisión antes de completarla.',
      unavailable: 'LM Studio no está disponible.',
      review_unavailable: 'LM Studio no está disponible para revisar la traducción.',
      http_error: 'LM Studio devolvió un error HTTP.',
      review_http_error: 'LM Studio devolvió un error HTTP al revisar la traducción.',
    };
    const detail = messages[reason] || 'No se pudo validar la traducción.';
    return `${detail}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`;
  }

  function showSuggestionState(text, retryable) {
    results.querySelectorAll?.('[data-pcai-state]').forEach((item) => item.remove());
    const messageNode = document.createElement('p');
    messageNode.className = 'pcai-result-state';
    messageNode.dataset.pcaiState = 'true';
    messageNode.textContent = text;
    results.append(messageNode);
    if (retryable && retrySuggestion) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.dataset.pcaiState = 'true';
      retry.textContent = 'Reintentar';
      retry.onclick = () => { void retrySuggestion(); };
      results.append(retry);
    }
  }

  function updateGenerateAvailability() {
    const busy = suggestionFlow.pending.size > 0;
    $('#pcai-generate').disabled = !accountReady || mode === 'off' || busy;
    $('#pcai-generate-custom').disabled = !accountReady || mode === 'off' || busy;
    if (!SuggestionFlow.latestIncoming(currentSnapshot) && mode !== 'off' && !busy) {
      detection.textContent = 'Esperando un mensaje entrante.';
      detection.hidden = false;
    }
  }

  function abortPending() {
    suggestionFlow?.cancelPending();
  }

  function automaticMessageKey(payload) {
    const speaker = String(payload.snapshot?.alias || '').trim().toLocaleLowerCase();
    const stableMessageId = String(payload.fingerprint || '').startsWith('id:')
      ? payload.fingerprint
      : `${payload.snapshot?.conversationKey || ''}:${payload.fingerprint || ''}`;
    return `${speaker}\u001f${stableMessageId}`;
  }

  function queueAutomaticSuggestion(payload) {
    if (!accountReady || !currentAccountId || !payload.snapshot?.alias || !String(payload.message || '').trim()) return;
    const key = automaticMessageKey(payload);
    if (processedAutomaticKeys.has(key) || [...pendingAutoPayloads.values()].some((item) => item.key === key)) return;
    const conversationKey = payload.snapshot.conversationKey;
    if (!conversationKey) return;
    if (suggestionFlow?.pending.size) abortPending();
    // Coalesce rapid mutations/messages: only the latest incoming target for the active chat is generated.
    pendingAutoPayloads.set(conversationKey, { ...payload, key });
    autoDiagnostic.generation = 'pendiente';
    renderAutoDiagnostic();
    if (autoTimer !== null) clearTimeout(autoTimer);
    autoTimer = setTimeout(async () => {
      autoTimer = null;
      // A newer automatic event cancels the active request; wait until its
      // abort has settled before starting the coalesced latest target.
      await suggestionFlow?.whenIdle();
      if (mode !== 'auto') return;
      const queued = [...pendingAutoPayloads.values()];
      pendingAutoPayloads.clear();
      for (const item of queued) {
        if (mode !== 'auto' || item.snapshot?.conversationKey !== latestConversationKey) continue;
        if (!SuggestionFlow.isLatestIncoming(currentSnapshot, item.fingerprint)) continue;
        if (processedAutomaticKeys.has(item.key)) continue;
        processedAutomaticKeys.add(item.key);
        while (processedAutomaticKeys.size > 1200) processedAutomaticKeys.delete(processedAutomaticKeys.values().next().value);
        void requestSuggestion(item.message, item.snapshot, true, null, item.initial === true, item.fingerprint);
      }
    }, 450);
  }

  async function requestSuggestion(messageText, snapshot = currentSnapshot, automatic = false, aliasOverride = null, initial = false, targetFingerprint = null, targetIsIncoming = true, additionalContext = '') {
    if (!accountReady || !currentAccountId) {
      $('#pcai-wizard-status').textContent = 'Completa y confirma la configuración de tu asistente para generar respuestas.';
      showOnboarding(currentAccountId ? 3 : 2, false);
      setPanelOpen(true);
      return { state: 'blocked' };
    }
    retrySuggestion = () => requestSuggestion(messageText, snapshot, automatic, aliasOverride, initial, targetFingerprint, targetIsIncoming, additionalContext);
    const result = await suggestionFlow.generate(messageText, snapshot, automatic, aliasOverride, initial, targetFingerprint, targetIsIncoming, additionalContext);
    if (automatic) {
      const key = automaticMessageKey({ message: messageText, snapshot, fingerprint: targetFingerprint });
      if (result.state === 'stale') processedAutomaticKeys.delete(key);
      if (result.state === 'success') {
        const persistentKeys = [...processedAutomaticKeys].filter((item) => item.includes('\u001fid:')).slice(-1200);
        void storageSet({ processedAutomaticKeys: persistentKeys }).catch(() => {});
      }
    }
    if (result.state === 'unidentified') detection.textContent = 'No se generó: no hay un alias fiable para la conversación activa.';
    return result;
  }

  function renderSnapshot(snapshot) {
    const previousKey = latestConversationKey;
    const hadSnapshot = currentSnapshot !== null;
    const nextKey = snapshot.conversationKey || null;
    const conversationChanged = Boolean(hadSnapshot && previousKey !== nextKey);
    if (hadSnapshot && SuggestionFlow.shouldCancelForSnapshotChange(currentSnapshot, snapshot)) abortPending();
    latestConversationKey = nextKey;
    currentSnapshot = snapshot;
    if (conversationChanged) {
      autoDiagnostic.lastIncoming = 'no detectado';
      autoDiagnostic.generation = 'pendiente';
    }
    if (nextKey && snapshot.changed) {
      autoDiagnostic.event = lastSeenConversationKey ? 'cambio' : 'apertura';
      lastSeenConversationKey = nextKey;
    }
    if (conversationChanged) {
      abortPending();
      if (autoTimer !== null) clearTimeout(autoTimer);
      autoTimer = null;
      pendingAutoPayloads.clear();
      results.replaceChildren();
      notes.replaceChildren();
      retrySuggestion = null;
      // Inputs and rendered private data belong to one conversation only.
      delete alias.dataset.userEdited;
      alias.value = snapshot.alias || '';
      message.value = '';
      $('#pcai-context-extra').value = '';
      manuallyEditedMessage = false;
      contextDetails.open = false;
      if (switchTimer !== null) clearTimeout(switchTimer);
      if (!nextKey) {
        detection.textContent = 'Cambiando de conversación…';
        switchTimer = setTimeout(() => {
          switchTimer = null;
          if (!latestConversationKey) detection.textContent = 'No hay una conversación activa identificada.';
        }, 900);
      }
    } else if (nextKey && switchTimer !== null) {
      clearTimeout(switchTimer);
      switchTimer = null;
    }
    activeAlias.textContent = snapshot.alias || (snapshot.status === 'ambiguous' ? 'Varios chats visibles' : 'Sin conversación identificada');
    if (snapshot.alias && alias.dataset.userEdited !== 'true') alias.value = snapshot.alias;
    else if (!snapshot.alias && alias.dataset.userEdited !== 'true') alias.value = '';
    const labels = {
      observing: mode === 'auto' ? 'Listo para mensajes nuevos.' : 'Contexto actualizado.',
      'alias-unidentified': 'No se pudo identificar el interlocutor. Revisa Diagnóstico.',
      'no-conversation': 'Abre un chat privado para ver el contexto.',
      ambiguous: 'Hay varios chats visibles; la detección automática está en pausa.',
      baseline: 'Preparando contexto…',
      'baseline-empty': 'Esperando un mensaje entrante…',
      unconfigured: 'La detección necesita configuración. Revisa Diagnóstico.',
      'invalid-selector': 'Hay un problema de configuración. Revisa Diagnóstico.',
    };
    if (!conversationChanged || nextKey) {
      detection.textContent = labels[snapshot.status] || snapshot.status;
      detection.hidden = snapshot.status === 'observing' || snapshot.status === 'baseline-empty';
    }
    contextView.replaceChildren();
    const allRecent = snapshot.messages || [];
    const latestIncoming = SuggestionFlow.latestIncoming(snapshot);
    renderMessageSummary($('#pcai-last-incoming'), 'Último mensaje entrante', latestIncoming);
    for (const item of allRecent.slice(-100)) {
      const line = document.createElement('div');
      line.className = `pcai-context-${item.direction}`;
      const author = item.direction === 'incoming' ? 'Interlocutor' : item.direction === 'outgoing' ? 'Tú' : 'Autor desconocido';
      const time = SuggestionFlow.normalizeTimestamp(item.time);
      line.textContent = `${author}${time ? ` · ${time}` : ''}: ${item.text}`;
      contextView.append(line);
    }
    const summary = contextDetails.querySelector('summary');
    summary.textContent = allRecent.length ? `Ver contexto · ${allRecent.length}` : 'Ver contexto';
    updateGenerateAvailability();
    if ((conversationChanged || !hadSnapshot) && snapshot.alias) void loadNotes();
    if (mode === 'auto' && nextKey && verifiedSelectorSignature !== JSON.stringify(selectors)) {
      const report = detector?.diagnose();
      if (report?.ok) {
        verifiedSelectorSignature = JSON.stringify(selectors);
        $('#pcai-selector-diagnostic').textContent = 'Selectores revalidados en el DOM actual; detección automática activa.';
      } else detection.textContent = 'Automático activo; esperando validar los selectores con un chat y mensajes visibles.';
    }
    renderAutoDiagnostic({ event: autoDiagnostic.event });
  }

  function renderMessageSummary(element, label, item) {
    element.replaceChildren();
    element.hidden = !item;
    if (!item) return;
    const labelNode = document.createElement('strong');
    labelNode.textContent = label;
    const time = SuggestionFlow.normalizeTimestamp(item.time);
    const timeNode = document.createElement('small');
    timeNode.textContent = time;
    const textNode = document.createElement('span');
    textNode.textContent = item.text;
    element.append(labelNode, ...(time ? [timeNode] : []), textNode);
  }

  function configureDetector() {
    if (!Detector) {
      detection.textContent = 'Falta cargar conversation-detector.js; recarga la extensión.';
      return;
    }
    detector?.stop();
    detector = new Detector({
      document,
      onUpdate: renderSnapshot,
      onBaseline: ({ snapshot, lastIncoming }) => {
        if (!accountReady || mode !== 'auto') return;
        detection.hidden = false;
        if (lastIncoming) autoDiagnostic.lastIncoming = 'último mensaje entrante del contexto inicial';
        if (lastIncoming && SuggestionFlow.isLatestIncoming(snapshot, lastIncoming.fingerprint)
          && verifiedSelectorSignature === JSON.stringify(selectors)) {
          queueAutomaticSuggestion({ message: lastIncoming.text, snapshot, fingerprint: lastIncoming.fingerprint, initial: true });
        } else detection.textContent = 'Esperando el último mensaje entrante del chat.';
        renderAutoDiagnostic();
      },
      onIncoming: ({ message: incomingMessage, snapshot, fingerprint }) => {
        if (!accountReady || mode !== 'auto' || verifiedSelectorSignature !== JSON.stringify(selectors)) return;
        detection.hidden = false;
        autoDiagnostic.event = 'mensaje entrante';
        autoDiagnostic.lastIncoming = 'detectado';
        if (!manuallyEditedMessage) message.value = incomingMessage;
        queueAutomaticSuggestion({ message: incomingMessage, snapshot, fingerprint });
        renderAutoDiagnostic();
      },
    });
    detector.configure(selectors);
  }

  function applyMode() {
    if (!accountReady) {
      detector?.stop();
      abortPending();
      if (autoTimer !== null) clearTimeout(autoTimer);
      autoTimer = null;
      pendingAutoPayloads.clear();
      updateGenerateAvailability();
      detection.textContent = 'Completa la configuración inicial para activar la detección del chat.';
      return;
    }
    if (mode === 'off') {
      detector?.stop();
      abortPending();
      if (autoTimer !== null) clearTimeout(autoTimer);
      autoTimer = null;
      pendingAutoPayloads.clear();
      detection.textContent = 'Detección y generación desactivadas.';
      $('#pcai-generate').disabled = true;
      return;
    }
    if (mode !== 'auto') {
      suggestionFlow?.cancelAutomatic();
      if (autoTimer !== null) clearTimeout(autoTimer);
      autoTimer = null;
      pendingAutoPayloads.clear();
    }
    updateGenerateAvailability();
    const missing = detector?.requiredMissing() || ['conversation', 'alias', 'message', 'incoming', 'outgoing'];
    if (missing.length) {
      detection.textContent = `Configura los selectores para detectar contexto y mensajes; faltan: ${missing.join(', ')}.`;
      return;
    }
    detector.start();
    if (mode === 'auto' && verifiedSelectorSignature !== JSON.stringify(selectors)) {
      const report = detector.diagnose();
      if (report.ok) verifiedSelectorSignature = JSON.stringify(selectors);
      else detection.textContent = report.reason === 'no-conversation'
        ? 'Automático activo; esperando la apertura de un chat para validar selectores.'
        : 'Automático activo; esperando que el chat y sus mensajes estén disponibles para validar selectores.';
    }
    renderAutoDiagnostic();
    if (mode === 'manual') detection.textContent = 'Modo manual · genera solo cuando lo pidas.';
  }

  function formSelectors() {
    return Object.fromEntries(['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp']
      .map((key) => [key, $(`#pcai-sel-${key}`).value.trim()]));
  }

  function redactSample(text) {
    return String(text || '')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[correo oculto]')
      .replace(/https?:\/\/\S+/gi, '[enlace oculto]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[número oculto]')
      .slice(0, 80);
  }

  function showSelectorDiagnostic(result) {
    const output = $('#pcai-selector-diagnostic');
    if (!result) { output.textContent = 'No se pudo iniciar el detector.'; return; }
    for (const key of ['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp']) {
      const state = $(`#pcai-selector-state-${key}`);
      const field = result.fields?.[key];
      if (!field) { state.textContent = 'Sin informe'; continue; }
      if (field.status === 'unconfigured') state.textContent = 'Sin configurar.';
      else if (field.status === 'invalid') state.textContent = `Selector inválido: ${field.error}`;
      else if (field.status === 'no-match') state.textContent = '0 coincidencias visibles; revisa el selector.';
      else if (field.status === 'no-active-scope') state.textContent = 'No se inspeccionó: primero debe coincidir exactamente un chat abierto.';
      else {
        const sample = field.sample?.length ? ` · Muestra local: “${redactSample(field.sample[0])}”` : '';
        state.textContent = `${field.count} coincidencia(s) visibles; observado en esta prueba, no guardado como verificado${sample}`;
      }
    }
    if (result.ok) output.textContent = `Prueba válida en este DOM: 1 conversación, ${result.aliases} alias, ${result.messages} filas (${result.incoming} entrantes, ${result.outgoing} propias). La validación dura esta sesión.`;
    else if (result.reason === 'unconfigured') output.textContent = `Faltan selectores: ${result.missing.join(', ')}.`;
    else if (result.reason === 'ambiguous') output.textContent = `Conversaciones visibles: ${result.conversations}; debe haber exactamente una activa.`;
    else if (result.reason === 'no-conversation') output.textContent = 'No se encontró un chat visible; abre una conversación y prueba otra vez.';
    else if (result.reason === 'alias-unidentified') output.textContent = `Alias no inequívoco: ${result.aliases} coincidencia(s). Usa el campo manual para generación sin memoria.`;
    else if (result.reason === 'insufficient-evidence') output.textContent = 'Falta evidencia visible de filas, mensajes entrantes y mensajes propios; no se habilitó el modo automático.';
    else output.textContent = `Error en selector CSS: ${result.detail || result.reason}.`;
  }

  function beginElementPicker(key) {
    detection.textContent = `Selecciona en la página el elemento para “${key}”. Pulsa Escape para cancelar.`;
    if (mode === 'auto') {
      detector?.stop();
      abortPending();
      pendingAutoPayloads.clear();
      if (autoTimer !== null) clearTimeout(autoTimer);
      autoTimer = null;
    }
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('click', pick, true);
      detection.textContent = 'Selección cancelada.';
    };
    const pick = (event) => {
      if (root.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('click', pick, true);
      const candidate = selectorCandidate(event.target, key);
      const input = $(`#pcai-sel-${key}`);
      const state = $(`#pcai-selector-state-${key}`);
      if (!candidate) {
        state.textContent = 'No se pudo crear un candidato; inspecciona el elemento en DevTools.';
        detection.textContent = 'No se encontró un selector CSS candidato.';
        return;
      }
      input.value = candidate.selector;
      verifiedSelectorSignature = null;
      state.textContent = `Candidato: ${candidate.count} coincidencia(s) visibles. Pulsa «Probar selectores»; aún no está verificado.`;
      detection.textContent = `Candidato CSS copiado al campo ${key}; configuración todavía no guardada.`;
    };
    document.addEventListener('keydown', escape, true);
    document.addEventListener('click', pick, true);
  }

  function selectorCandidate(element, key) {
    const cssEscape = (value) => globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    let current = element;
    let path = [];
    let best = null;
    for (let depth = 0; current && depth < 7 && current !== document.documentElement; depth += 1, current = current.parentElement) {
      if (!current.tagName || current === root || root.contains(current)) continue;
      const tag = current.tagName.toLowerCase();
      const classes = [...(current.classList || [])].filter(Boolean).slice(0, 3);
      const candidates = [];
      if (classes.length) candidates.push(`${tag}${classes.map((name) => `.${cssEscape(name)}`).join('')}`);
      if (current.id && ['conversation', 'alias', 'text', 'timestamp'].includes(key)) candidates.push(`#${cssEscape(current.id)}`);
      if (!classes.length) {
        const siblings = [...(current.parentElement?.children || [])].filter((item) => item.tagName === current.tagName);
        const nth = siblings.indexOf(current) + 1;
        path.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${nth})` : ''}`);
        candidates.push(path.join(' > '));
      } else path.unshift(`${tag}${classes.map((name) => `.${cssEscape(name)}`).join('')}`);
      for (const selector of candidates) {
        try {
          const count = [...document.querySelectorAll(selector)].filter((item) => detector?.isVisible(item) ?? true).length;
          if (count && (!best || count < best.count)) best = { selector, count };
        } catch (_) {}
      }
    }
    return best;
  }
  $('#pcai-toggle').addEventListener('pointerdown', (event) => startDrag(event, root, 'pcaiTogglePosition'));
  $('#pcai-drag-handle').addEventListener('pointerdown', (event) => startDrag(event, $('#pcai-panel'), 'pcaiPanelPosition'));
  document.addEventListener?.('pointermove', moveDrag, true);
  document.addEventListener?.('pointerup', endDrag, true);
  document.addEventListener?.('pointercancel', endDrag, true);
  window.addEventListener?.('resize', () => {
    if (root.style.left) clampPosition(root, Number.parseFloat(root.style.left), Number.parseFloat(root.style.top));
    const panel = $('#pcai-panel');
    if (panel.style.left) clampPosition(panel, Number.parseFloat(panel.style.left), Number.parseFloat(panel.style.top));
  });
  $('#pcai-toggle').addEventListener('click', (event) => {
    event.preventDefault();
    if (ignoreToggleClick) { ignoreToggleClick = false; return; }
    setPanelOpen($('#pcai-panel').hidden);
  });
  $('#pcai-close').addEventListener('click', (event) => {
    event.preventDefault();
    setPanelOpen(false);
  });
  $('#pcai-minimize').addEventListener('click', (event) => {
    event.preventDefault();
    setPanelOpen(false);
  });
  $('#pcai-use-selection').onclick = () => { const selected = window.getSelection()?.toString().trim(); if (selected) message.value = selected.slice(0, 4000); else status.textContent = 'Selecciona texto en la página o pégalo en el campo.'; };
  const wizardView = $('#pcai-wizard-view');
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const blankDraft = () => ({
    name: 'Mi asistente', personality: [], interests: [], visitor_types: [], conversation_dynamics: [],
    response_style: { tone: [], length: null, emoji_policy: null, custom_instructions: '' }, languages: [],
    personal_boundaries: [], completed_sections: [],
  });
  function profileDraft(profile) {
    const draft = { ...blankDraft(), ...(profile || {}) };
    draft.response_style = { ...blankDraft().response_style, ...(profile?.response_style || {}) };
    draft.personal_boundaries = Array.isArray(profile?.personal_boundaries) ? profile.personal_boundaries : [];
    const splitCustom = (values, known, prefix = '') => {
      const normalized = Array.isArray(values) ? values : [];
      const custom = normalized.filter((value) => !known.includes(value)).map((value) => value.startsWith(prefix) ? value.slice(prefix.length) : value);
      return { selected: normalized.filter((value) => known.includes(value)), custom: custom.join(', ') };
    };
    const customPersonality = (draft.personality || []).find((value) => value.startsWith('Personalizada: '));
    const personality = splitCustom(draft.personality, ['Coqueta y divertida', 'Dulce y cariñosa', 'Elegante y sofisticada', 'Dominante y segura', 'Amistosa y conversadora', 'Personalizada:']);
    draft.personality_custom = customPersonality?.slice('Personalizada: '.length) || personality.custom;
    draft.personalityCustomSelected = Boolean(customPersonality || (draft.personality || []).includes('Personalizada'));
    draft.personality = [...personality.selected.filter((value) => value !== 'Personalizada:'), ...(draft.personalityCustomSelected ? ['Personalizada'] : [])];
    const interests = splitCustom(draft.interests, ['Música', 'Videojuegos', 'Cine y series', 'Anime', 'Viajes', 'Deportes', 'Moda', 'Tecnología']);
    draft.interests = interests.selected; draft.interests_custom = interests.custom;
    const visitors = splitCustom(draft.visitor_types, ['Sumisos', 'Dominantes', 'Románticos', 'Tímidos', 'Conversadores', 'Usuarios nuevos', 'Usuarios frecuentes', 'VIP']);
    draft.visitor_types = visitors.selected; draft.visitor_custom = visitors.custom;
    draft.conversation_dynamics = splitCustom(draft.conversation_dynamics, ['Juguetona', 'Cariñosa', 'Ligera y amistosa', 'Coqueta sin presión', 'Directa y clara']).selected;
    const takeBoundary = (prefix) => draft.personal_boundaries.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
    draft.allowedTopics = takeBoundary('Temas permitidos: ');
    draft.avoidedTopics = takeBoundary('Temas a evitar: ');
    draft.personalRule = takeBoundary('Límites personales: ');
    return draft;
  }
  function escapeProfileName(value) { return escapeHTML(value).slice(0, 100); }
  function checkedCards(field, options, selected = []) {
    return `<div class="pcai-choice-grid">${options.map((option) => `<label class="pcai-choice-card"><input type="checkbox" data-wizard-list="${field}" value="${escapeHTML(option)}" ${selected.includes(option) ? 'checked' : ''}><span class="pcai-choice-check" aria-hidden="true">✓</span><span>${escapeHTML(option)}</span></label>`).join('')}</div>`;
  }
  function wizardStatus(text, error = false) {
    const node = $('#pcai-wizard-status');
    node.textContent = text || '';
    node.className = `pcai-wizard-status${error ? ' is-error' : ''}`;
  }
  function identityStatusMessage(detection) {
    if (detection.status === 'ambiguous') return 'La identificación no es única; elige y confirma la cuenta correcta.';
    if (detection.reason === 'authenticated_avatar_alt_unrecognized') return 'Stripchat reconoce la cabecera de modelo, pero su etiqueta de avatar no tiene un formato reconocido. Escribe tu nombre artístico manualmente.';
    if (detection.reason === 'authenticated_name_not_in_dom') return 'Stripchat reconoce la sesión de modelo, pero no expone el nombre en esta página. Abre el menú de cuenta o escribe tu nombre artístico.';
    if (detection.reason === 'detector_module_missing') return 'No se cargó el módulo de detección de identidad. Recarga la extensión y la página.';
    if (detection.status === 'candidate') return 'Confirma la identidad detectada antes de usar el asistente.';
    return 'No encontramos una señal fiable de identidad. Escribe tu nombre artístico para continuar.';
  }
  function logIdentityDiagnostic(detection) {
    let runtimeDom = null;
    try {
      runtimeDom = {
        authenticatedHeaderSelectorCount: document.querySelectorAll('.header-top.is-model-user').length,
        dropdownControlCount: document.querySelectorAll('.header-top.is-model-user .nav-right .dropdown-link').length,
        dropdownAvatarAltCount: document.querySelectorAll('.header-top.is-model-user .nav-right .dropdown-link img[alt]').length,
      };
    } catch (_) { runtimeDom = { readError: true }; }
    console.info?.('[PERSONAL_CHAT_AI] identity diagnostic', {
      diagnosticVersion: 2,
      detectorLoaded: Boolean(AccountDetector?.detectAccount),
      status: detection.status,
      source: detection.identitySource || null,
      platformIdAvailable: Boolean(detection.platformUserId),
      reason: detection.reason || null,
      counts: detection.diagnostics || null,
      runtimeDom,
    });
  }
  function refreshIdentityStep(detection) {
    if (wizardEditing) return;
    if (wizardStep === 1 && detection.status === 'candidate') wizardStep = 2;
    if (wizardStep !== 2) return;
    const currentName = String(wizardView.querySelector?.('#pcai-wizard-artist')?.value || '').trim();
    const currentAccountChoice = String(wizardView.querySelector?.('#pcai-wizard-account')?.value || '');
    const preserveManualName = Boolean(currentName && currentName !== wizardIdentityPrefillName);
    renderWizard();
    const nextName = wizardView.querySelector?.('#pcai-wizard-artist');
    const nextAccount = wizardView.querySelector?.('#pcai-wizard-account');
    if (nextName) nextName.value = preserveManualName ? currentName : (detection.status === 'candidate' ? detection.artistName : '');
    if (nextAccount && currentAccountChoice) nextAccount.value = currentAccountChoice;
    wizardStatus(identityStatusMessage(detection), detection.status !== 'candidate');
  }
  function updateHeader() {
    const title = currentAccount?.confirmed && currentAccount.artist_name
      ? `Asistente de ${currentAccount.artist_name}` : 'Configura tu asistente';
    $('#pcai-title').textContent = title;
    $('#pcai-panel').setAttribute('aria-label', title);
    $('#pcai-header-state').textContent = accountReady ? 'Cuenta confirmada · borradores privados' : 'Configuración pendiente';
  }
  function showOnboarding(step = 1, editing = false) {
    accountReady = false;
    wizardEditing = Boolean(editing);
    wizardStep = Math.min(8, Math.max(1, Number(step) || 1));
    $('#pcai-onboarding').hidden = false;
    $('#pcai-main-content').hidden = true;
    updateHeader();
    renderWizard();
    updateGenerateAvailability();
    applyMode();
  }
  const WIZARD_STEPS = [
    ['Bienvenida', 'Tu asistente, a tu manera', 'Un copiloto privado que prepara borradores para que tú los revises y envíes.'],
    ['Identidad', '¿De quién será este asistente?', 'Confirma la cuenta de modelo. El nombre artístico solo se muestra y nunca se usa como identificador único.'],
    ['Personalidad', 'Elige tu personalidad', 'Selecciona las cualidades que sí representan tu voz. Puedes elegir varias.'],
    ['Intereses', '¿Qué temas te gustan?', 'Añade temas que quieras conversar; podrás ajustarlos en cualquier momento.'],
    ['Interacción', 'Define tus preferencias', 'Configura dinámicas que tú prefieres. No inferimos características sensibles de los visitantes.'],
    ['Estilo e idiomas', 'Así quieres responder', 'Elige la longitud, el tono, los emojis y los idiomas de tus borradores.'],
    ['Límites', 'Tus límites personales', 'Indica temas permitidos, temas que quieres evitar y reglas que siempre debemos respetar.'],
    ['Confirmación', 'Revisa tu configuración', 'Comprueba el resumen. Puedes volver a cualquier paso antes de guardar y activar.'],
  ];
  function renderWizard() {
    const [label, title, description] = WIZARD_STEPS[wizardStep - 1];
    $('#pcai-wizard-kicker').textContent = wizardEditing ? `MI ASISTENTE · ${label.toLocaleUpperCase()}` : `PERSONAL_CHAT_AI · ${label.toLocaleUpperCase()}`;
    $('#pcai-wizard-title').textContent = title;
    $('#pcai-wizard-description').textContent = description;
    $('#pcai-progress-label').textContent = `Paso ${wizardStep} de 8`;
    $('#pcai-progress-percent').textContent = `${Math.round(wizardStep / 8 * 100)} %`;
    $('#pcai-progress-fill').style.width = `${wizardStep / 8 * 100}%`;
    $('#pcai-wizard-back').hidden = wizardStep === 1 || (wizardEditing && wizardStep === 3);
    $('#pcai-wizard-next').textContent = wizardStep === 1 ? 'Comenzar' : wizardStep === 8 ? 'Guardar y activar' : wizardStep === 2 ? 'Confirmar y continuar' : 'Continuar';
    $('#pcai-wizard-cancel').hidden = !wizardEditing;
    if (wizardStep === 1) {
      wizardView.innerHTML = '<div class="pcai-welcome-card"><span class="pcai-welcome-icon">✦</span><h2>Tu voz, tus reglas</h2><p>PERSONAL_CHAT_AI lee el contexto visible de tus conversaciones y prepara una respuesta original en el idioma del visitante, con traducción al español cuando corresponde.</p><div class="pcai-trust-points"><span>✓ Tus mensajes no se envían automáticamente</span><span>✓ Tus perfiles y recuerdos quedan separados por cuenta</span><span>✓ Puedes editar o copiar cada borrador antes de usarlo</span></div></div>';
    } else if (wizardStep === 2) {
      const candidate = identityDetection.status === 'candidate' ? identityDetection : null;
      wizardIdentityPrefillName = candidate?.artistName || '';
      const preferredId = wizardDraft?.account_id || currentAccountId || '';
      const choices = modelAccounts.map((account) => {
        const created = account.created_at ? new Date(account.created_at).toLocaleDateString() : 'fecha desconocida';
        const state = account.configured ? 'Configurada' : account.profile_count ? 'Configuración pendiente' : 'Sin perfil';
        const shortId = String(account.id || '').slice(-8);
        return `<option value="${escapeHTML(account.id)}" ${account.id === preferredId ? 'selected' : ''}>${escapeHTML(account.artist_name || 'Cuenta sin nombre')} · ${state} · ${created} · ID …${escapeHTML(shortId)}</option>`;
      }).join('');
      const duplicateNameCount = candidate
        ? modelAccounts.filter((item) => item.platform === 'stripchat' && item.artist_name?.trim().toLocaleLowerCase() === candidate.artistName.toLocaleLowerCase()).length
        : 0;
      const detectionText = candidate
        ? `Señal de cabecera detectada: ${escapeHTML(candidate.artistName)}. Confirma que corresponde a tu cuenta.`
        : identityDetection.status === 'ambiguous'
          ? 'La página muestra señales ambiguas. No seleccionaremos ninguna cuenta automáticamente; elige una cuenta o escribe el nombre.'
          : 'No encontramos una señal fiable en la cabecera. Escribe tu nombre artístico o selecciona una cuenta local.';
      wizardView.innerHTML = `<div class="pcai-step-card"><div class="pcai-detection-card ${candidate ? 'is-detected' : 'is-manual'}"><span aria-hidden="true">${candidate ? '✦' : '◎'}</span><p>${detectionText}</p><button id="pcai-detect-account" type="button" class="pcai-link-button">Volver a detectar</button></div><div class="pcai-account-list-heading"><span>${modelAccounts.length} ${modelAccounts.length === 1 ? 'cuenta local' : 'cuentas locales'}</span><button id="pcai-refresh-accounts" type="button" class="pcai-link-button">Actualizar lista</button></div><label>Cuenta local<select id="pcai-wizard-account"><option value="">Crear una cuenta nueva</option>${choices}</select></label><label>Nombre artístico<input id="pcai-wizard-artist" maxlength="80" autocomplete="off" value="${escapeHTML(candidate?.artistName || currentAccount?.artist_name || '')}" placeholder="Escribe tu nombre artístico"></label><p class="pcai-inline-note">La identidad se confirma con tu elección. No leemos cookies, contraseñas ni tokens.</p></div>`;
      $('#pcai-refresh-accounts').onclick = async () => {
        const selected = wizardView.querySelector?.('#pcai-wizard-account')?.value || '';
        const name = wizardView.querySelector?.('#pcai-wizard-artist')?.value || '';
        try {
          const response = await api('/api/accounts');
          modelAccounts = Array.isArray(response.accounts) ? response.accounts : [];
          renderWizard();
          const nextSelect = wizardView.querySelector?.('#pcai-wizard-account');
          const nextInput = wizardView.querySelector?.('#pcai-wizard-artist');
          if (nextSelect) nextSelect.value = selected;
          if (nextInput) nextInput.value = name;
          wizardStatus('Lista de cuentas actualizada. Elige explícitamente la cuenta correcta o crea otra.');
        } catch (error) { wizardStatus(`No se pudo actualizar la lista: ${error.message}`, true); }
      };
      $('#pcai-detect-account').onclick = () => {
        identityDetection = AccountDetector?.detectAccount ? AccountDetector.detectAccount(document) : { status: 'unavailable', candidates: [], reason: 'detector_module_missing' };
        detectedAccountMatch = globalThis.PCAIAccountSetup.matchDetectedAccount(modelAccounts, identityDetection);
        renderWizard();
        wizardStatus('Señales de identidad actualizadas; confirma manualmente la selección.');
      };
    } else if (wizardStep === 3) {
      wizardView.innerHTML = `<div class="pcai-step-card"><p class="pcai-form-lead">¿Qué estilo se parece más a ti?</p>${checkedCards('personality', ['Coqueta y divertida', 'Dulce y cariñosa', 'Elegante y sofisticada', 'Dominante y segura', 'Amistosa y conversadora', 'Personalizada'], wizardDraft.personality)}<label class="pcai-field-label">Describe tu estilo propio<textarea data-wizard-value="personality_custom" maxlength="240" placeholder="Opcional: palabras o matices que quieres añadir">${escapeHTML(wizardDraft.personality_custom || '')}</textarea></label></div>`;
    } else if (wizardStep === 4) {
      wizardView.innerHTML = `<div class="pcai-step-card"><p class="pcai-form-lead">Selecciona tus temas favoritos.</p>${checkedCards('interests', ['Música', 'Videojuegos', 'Cine y series', 'Anime', 'Viajes', 'Deportes', 'Moda', 'Tecnología'], wizardDraft.interests)}<label class="pcai-field-label">Otros intereses<textarea data-wizard-value="interests_custom" maxlength="400" placeholder="Separa los temas con comas">${escapeHTML(wizardDraft.interests_custom || '')}</textarea></label><label class="pcai-check-row"><input type="checkbox" data-wizard-none="interests" ${wizardDraft.completed_sections?.includes('interests') && !wizardDraft.interests?.length ? 'checked' : ''}>No quiero añadir intereses por ahora</label></div>`;
    } else if (wizardStep === 5) {
      wizardView.innerHTML = `<div class="pcai-step-card"><p class="pcai-form-lead">Elige preferencias de interacción; no describen ni clasifican automáticamente a cada visitante.</p><h3>Dinámicas que prefieres</h3>${checkedCards('visitor_types', ['Sumisos', 'Dominantes', 'Románticos', 'Tímidos', 'Conversadores', 'Usuarios nuevos', 'Usuarios frecuentes', 'VIP'], wizardDraft.visitor_types)}<label class="pcai-field-label">Otras preferencias<textarea data-wizard-value="visitor_custom" maxlength="300" placeholder="Añade categorías elegidas por ti">${escapeHTML(wizardDraft.visitor_custom || '')}</textarea></label><h3>Dinámicas de conversación</h3>${checkedCards('conversation_dynamics', ['Juguetona', 'Cariñosa', 'Ligera y amistosa', 'Coqueta sin presión', 'Directa y clara'], wizardDraft.conversation_dynamics)}<label class="pcai-check-row"><input type="checkbox" data-wizard-none="visitors" ${wizardDraft.completed_sections?.includes('visitor_types') && !wizardDraft.visitor_types?.length ? 'checked' : ''}>No quiero fijar preferencias por tipo de visitante</label></div>`;
    } else if (wizardStep === 6) {
      wizardView.innerHTML = `<div class="pcai-step-card"><div class="pcai-form-columns"><label class="pcai-field-label">Longitud<select data-wizard-value="length"><option value="">Elige una opción</option><option value="short" ${wizardDraft.response_style.length === 'short' ? 'selected' : ''}>Corta</option><option value="medium" ${wizardDraft.response_style.length === 'medium' ? 'selected' : ''}>Normal</option><option value="long" ${wizardDraft.response_style.length === 'long' ? 'selected' : ''}>Larga</option></select></label><label class="pcai-field-label">Emojis<select data-wizard-value="emoji_policy"><option value="">Elige una opción</option><option value="match_context" ${wizardDraft.response_style.emoji_policy === 'match_context' ? 'selected' : ''}>Según el contexto</option><option value="few" ${wizardDraft.response_style.emoji_policy === 'few' ? 'selected' : ''}>Pocos</option><option value="none" ${wizardDraft.response_style.emoji_policy === 'none' ? 'selected' : ''}>Sin emojis</option></select></label></div><h3>Tono</h3>${checkedCards('tone', ['Cálido', 'Juguetón', 'Elegante', 'Directo', 'Dulce', 'Seguro'], wizardDraft.response_style.tone)}<h3>Idiomas</h3>${checkedCards('languages', ['Español', 'English', 'Português', 'Français', 'Deutsch', 'Italiano', 'auto'], wizardDraft.languages)}<p class="pcai-inline-note">«Detección automática» adapta cada borrador al idioma del mensaje entrante.</p><label class="pcai-field-label">Instrucción de estilo opcional<textarea data-wizard-value="custom_instructions" maxlength="600" placeholder="Por ejemplo: prefiere frases sencillas">${escapeHTML(wizardDraft.response_style.custom_instructions || '')}</textarea></label></div>`;
    } else if (wizardStep === 7) {
      wizardView.innerHTML = `<div class="pcai-step-card"><label class="pcai-field-label">Temas permitidos<textarea data-wizard-value="allowedTopics" maxlength="500" placeholder="Temas que te gusta conversar">${escapeHTML(wizardDraft.allowedTopics || '')}</textarea></label><label class="pcai-field-label">Temas que quieres evitar<textarea data-wizard-value="avoidedTopics" maxlength="500" placeholder="Temas que prefieres no tratar">${escapeHTML(wizardDraft.avoidedTopics || '')}</textarea></label><label class="pcai-field-label">Reglas personales<textarea data-wizard-value="personalRule" maxlength="500" placeholder="Límites que deben respetarse siempre">${escapeHTML(wizardDraft.personalRule || '')}</textarea></label><label class="pcai-check-row"><input type="checkbox" data-wizard-none="boundaries" ${wizardDraft.completed_sections?.includes('personal_boundaries') && !wizardDraft.personal_boundaries?.length ? 'checked' : ''}>No quiero añadir límites adicionales ahora</label></div>`;
    } else {
      const list = (title, values) => `<div class="pcai-summary-row"><strong>${title}</strong><span>${values?.length ? values.map(escapeHTML).join(' · ') : 'Sin preferencias añadidas'}</span></div>`;
      const boundaries = [wizardDraft.allowedTopics && `Permitidos: ${wizardDraft.allowedTopics}`, wizardDraft.avoidedTopics && `A evitar: ${wizardDraft.avoidedTopics}`, wizardDraft.personalRule && `Regla: ${wizardDraft.personalRule}`].filter(Boolean);
      wizardView.innerHTML = `<div class="pcai-summary-card"><div class="pcai-summary-identity"><span>✦</span><div><small>ASISTENTE PERSONALIZADO</small><strong>${escapeProfileName(currentAccount?.artist_name || 'Identidad pendiente')}</strong></div></div>${list('Personalidad', wizardDraft.personality)}${list('Intereses', wizardDraft.interests)}${list('Preferencias de interacción', [...wizardDraft.visitor_types, ...wizardDraft.conversation_dynamics])}<div class="pcai-summary-row"><strong>Estilo</strong><span>${escapeHTML([wizardDraft.response_style.length || 'longitud por definir', wizardDraft.response_style.tone.join(', ') || 'tono neutral', wizardDraft.response_style.emoji_policy || 'emojis según contexto'].join(' · '))}</span></div>${list('Idiomas', wizardDraft.languages.map((lang) => lang === 'auto' ? 'Detección automática' : lang))}${list('Límites personales', boundaries)}</div><p class="pcai-inline-note">Al guardar, el backend confirmará que el perfil y todas sus secciones estén completos. La extensión nunca enviará mensajes.</p>`;
    }
  }
  function syncWizardDraft() {
    if (!wizardDraft || wizardStep < 3 || wizardStep > 7) return;
    const checked = (field) => [...(wizardView.querySelectorAll?.(`[data-wizard-list="${field}"]:checked`) || [])].map((input) => input.value);
    const value = (field) => wizardView.querySelector?.(`[data-wizard-value="${field}"]`)?.value || '';
    const customList = (raw) => String(raw || '').split(/[,\n;]/).map((part) => part.trim()).filter(Boolean);
    if (wizardStep === 3) {
      const selectedPersonality = checked('personality');
      wizardDraft.personalityCustomSelected = selectedPersonality.includes('Personalizada');
      wizardDraft.personality = selectedPersonality;
      const custom = value('personality_custom').trim();
      wizardDraft.personality = wizardDraft.personality.filter((item) => item !== 'Personalizada');
      if (custom) wizardDraft.personality.push(`Personalizada: ${custom}`);
      wizardDraft.personality_custom = custom;
    } else if (wizardStep === 4) {
      wizardDraft.interests = [...checked('interests'), ...customList(value('interests_custom'))];
      wizardDraft.interests_custom = value('interests_custom');
    } else if (wizardStep === 5) {
      wizardDraft.visitor_types = [...checked('visitor_types'), ...customList(value('visitor_custom'))];
      wizardDraft.visitor_custom = value('visitor_custom');
      wizardDraft.conversation_dynamics = checked('conversation_dynamics');
    } else if (wizardStep === 6) {
      wizardDraft.response_style = { tone: checked('tone'), length: value('length') || null, emoji_policy: value('emoji_policy') || null, custom_instructions: value('custom_instructions') };
      wizardDraft.languages = checked('languages');
    } else if (wizardStep === 7) {
      wizardDraft.allowedTopics = value('allowedTopics').trim();
      wizardDraft.avoidedTopics = value('avoidedTopics').trim();
      wizardDraft.personalRule = value('personalRule').trim();
      wizardDraft.personal_boundaries = [
        wizardDraft.allowedTopics && `Temas permitidos: ${wizardDraft.allowedTopics}`,
        wizardDraft.avoidedTopics && `Temas a evitar: ${wizardDraft.avoidedTopics}`,
        wizardDraft.personalRule && `Límites personales: ${wizardDraft.personalRule}`,
      ].filter(Boolean);
    }
    return wizardDraft;
  }
  function persistWizardDraftSoon() {
    if (!currentAccountId || !wizardDraft || wizardStep < 3 || wizardStep > 7) return;
    if (wizardProgressTimer !== null) clearTimeout(wizardProgressTimer);
    wizardProgressTimer = setTimeout(() => {
      wizardProgressTimer = null;
      const progress = {
        accountId: currentAccountId, profileId: editingProfileId, step: wizardStep,
        editing: wizardEditing, draft: JSON.parse(JSON.stringify(wizardDraft)),
      };
      void storageSet({ pcaiSetupProgress: progress }).catch(() => {
        wizardStatus('No se pudo guardar la copia local del progreso. Tus selecciones siguen en pantalla; pulsa Continuar para guardarlas en el backend.', true);
      });
    }, 250);
  }
  function validateWizardStep() {
    syncWizardDraft();
    const none = (field) => Boolean(wizardView.querySelector?.(`[data-wizard-none="${field}"]`)?.checked);
    if (wizardStep === 3 && !wizardDraft.personality.length) return 'Elige al menos un rasgo de personalidad.';
    if (wizardStep === 3 && wizardDraft.personalityCustomSelected && !wizardDraft.personality_custom) return 'Describe brevemente la personalidad personalizada.';
    if (wizardStep === 4 && !wizardDraft.interests.length && !none('interests')) return 'Elige algún interés o confirma que prefieres dejarlo vacío.';
    if (wizardStep === 5 && !wizardDraft.visitor_types.length && !none('visitors')) return 'Elige preferencias o confirma que no quieres fijarlas.';
    if (wizardStep === 6 && (!wizardDraft.response_style.length || !wizardDraft.response_style.emoji_policy || !wizardDraft.languages.length)) return 'Elige la longitud, el uso de emojis y al menos un idioma.';
    if (wizardStep === 7 && !wizardDraft.personal_boundaries.length && !none('boundaries')) return 'Añade un límite o confirma que no quieres límites adicionales.';
    return '';
  }
  async function saveWizardProfile(step, complete = false) {
    syncWizardDraft();
    const payload = globalThis.PCAIAccountSetup.buildProfilePayload(wizardDraft, step, complete);
    const path = `/api/accounts/${encodeURIComponent(currentAccountId)}/profiles${editingProfileId ? `/${encodeURIComponent(editingProfileId)}` : ''}`;
    const saved = await api(path, { method: editingProfileId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    editingProfileId = saved.id;
    wizardDraft = profileDraft(saved);
    await storageSet({ pcaiSetupProgress: { accountId: currentAccountId, profileId: editingProfileId, step: complete ? 8 : Math.min(8, step + 1), editing: wizardEditing, draft: JSON.parse(JSON.stringify(wizardDraft)) } });
    return saved;
  }
  function startAccountObserver() {
    accountObserver?.stop?.();
    if (!AccountDetector?.observeAccount) return;
    accountObserver = AccountDetector.observeAccount(document, (result) => {
      identityDetection = result;
      detectedAccountMatch = globalThis.PCAIAccountSetup?.matchDetectedAccount(modelAccounts, result) || null;
      logIdentityDiagnostic(result);
      if (!currentAccountId) {
        refreshIdentityStep(result);
        return;
      }
      const identityUnavailable = result.status === 'unavailable';
      const sameName = result.status === 'candidate' && result.artistName.toLocaleLowerCase() === currentAccount?.artist_name?.toLocaleLowerCase();
      const conflictingPlatformId = result.status === 'candidate' && result.platformUserId
        && result.platformUserId !== currentAccount?.platform_user_id;
      const nameOnlyAuthenticatedContinuity = sameName && !result.platformUserId
        && ['authenticated-header', 'editable-own-profile'].includes(result.identitySource);
      const lostStableIdentity = result.status === 'candidate' && currentAccount?.platform_user_id
        && !result.platformUserId && !nameOnlyAuthenticatedContinuity;
      if (identityUnavailable || result.status === 'ambiguous' || (result.status === 'candidate' && (!sameName || conflictingPlatformId || lostStableIdentity))) {
        currentAccountId = null;
        currentAccount = null;
        accountReady = false;
        results.replaceChildren();
        abortPending();
        wizardDraft = blankDraft();
        wizardStep = 2;
        detectedAccountMatch = globalThis.PCAIAccountSetup?.matchDetectedAccount(modelAccounts, result) || null;
        showOnboarding(2, false);
        wizardStatus(identityUnavailable
          ? 'No podemos verificar la cuenta activa en esta página. Confirma tu identidad antes de continuar.'
          : 'Detectamos un cambio o una identidad ambigua. Confirma la cuenta antes de continuar.', true);
        setPanelOpen(true);
      }
    });
  }
  async function activateAccount(account) {
    currentAccountId = account.id;
    currentAccount = account;
    await storageSet({ pcaiLastAccountId: account.id });
    updateHeader();
    const data = await api(`/api/accounts/${encodeURIComponent(account.id)}/profiles`);
    profileSnapshot = data;
    const resume = await storageGet(['pcaiSetupProgress']);
    const savedProgress = resume.pcaiSetupProgress;
    if (savedProgress?.accountId === account.id && (savedProgress.profileId || savedProgress.draft)) {
      const pending = data.profiles.find((item) => item.id === savedProgress.profileId);
      if ((pending || savedProgress.draft) && (!data.onboarding_complete || savedProgress.editing)) {
        editingProfileId = pending?.id || null;
        wizardDraft = profileDraft(savedProgress.draft || pending);
        showOnboarding(Math.max(3, Math.min(8, savedProgress.step || 3)), Boolean(savedProgress.editing));
        setPanelOpen(true);
        return;
      }
    }
    if (globalThis.PCAIAccountSetup.profileIsReady(data)) {
      editingProfileId = null;
      profileSnapshot = data;
      accountReady = true;
      await storageRemove(['pcaiSetupProgress']);
      await loadProfiles();
      return;
    }
    const pending = data.profiles.find((item) => !item.onboarding_complete);
    editingProfileId = pending?.id || null;
    wizardDraft = pending ? profileDraft(pending) : blankDraft();
    const step = savedProgress?.accountId === account.id ? Math.max(3, Math.min(8, savedProgress.step || 3)) : pending ? 3 : 3;
    showOnboarding(step, false);
    setPanelOpen(true);
  }
  async function recoverPendingAccountCreation() {
    const stored = await storageGet(['pcaiPendingAccountCreation']);
    const pending = stored.pcaiPendingAccountCreation;
    if (!pending?.key || !pending?.payload) return;
    try {
      const account = await api('/api/accounts', {
        method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.payload),
      });
      if (!account?.id || !account.confirmed) return;
      modelAccounts = [...modelAccounts.filter((item) => item.id !== account.id), account];
      await storageSet({
        pcaiLastAccountId: account.id,
        pcaiSetupProgress: { accountId: account.id, profileId: null, step: 3, editing: false, draft: profileDraft(blankDraft()) },
      });
      await storageRemove(['pcaiPendingAccountCreation']);
    } catch (error) {
      console.warn?.('[PERSONAL_CHAT_AI] No se pudo recuperar una solicitud local de cuenta; se conserva para reintentar.');
    }
  }
  async function confirmIdentity() {
    if (identityConfirmInFlight) return;
    identityConfirmInFlight = true;
    const confirmButton = $('#pcai-wizard-next');
    confirmButton.disabled = true;
    const originalButtonText = confirmButton.textContent;
    confirmButton.textContent = 'Guardando identidad…';
    try {
    const name = String(wizardView.querySelector?.('#pcai-wizard-artist')?.value || '').trim().replace(/\s+/g, ' ');
    const selectedId = wizardView.querySelector?.('#pcai-wizard-account')?.value || '';
    if (!name) throw new Error('Escribe o confirma el nombre artístico.');
    const previous = modelAccounts.find((item) => item.id === selectedId);
    const sameNameAccounts = modelAccounts.filter((item) => item.platform === 'stripchat' && item.artist_name?.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (!previous && sameNameAccounts.length && !confirm(`Ya existen ${sameNameAccounts.length} cuentas locales con el nombre “${name}”. Crearás una cuenta independiente y no se combinarán sus datos. ¿Quieres continuar?`)) return;
    if (previous && identityDetection.platformUserId && previous.platform_user_id && previous.platform_user_id !== identityDetection.platformUserId) {
      throw new Error('La cuenta seleccionada no coincide con la identidad detectada. Elige la cuenta correcta o crea una nueva.');
    }
    const usesDetectedName = identityDetection.status === 'candidate' && name.toLocaleLowerCase() === identityDetection.artistName.toLocaleLowerCase();
    const accountPayload = {
      platform: 'stripchat', artist_name: name,
      platform_user_id: identityDetection.status === 'candidate' ? identityDetection.platformUserId || previous?.platform_user_id || null : previous?.platform_user_id || null,
      identity_source: usesDetectedName ? 'dom' : 'manual', confirmed: true,
    };
    let saved;
    if (previous) saved = await api(`/api/accounts/${encodeURIComponent(previous.id)}`, { method: 'PUT', body: JSON.stringify(accountPayload) });
    else {
      const pendingResult = await storageGet(['pcaiPendingAccountCreation']);
      let pending = pendingResult.pcaiPendingAccountCreation;
      if (pending?.key && pending.payload && JSON.stringify(pending.payload) !== JSON.stringify(accountPayload)) {
        throw new Error('Hay una creación de cuenta pendiente con otra identidad. Reintenta primero con el nombre confirmado originalmente para recuperar su UUID.');
      }
      if (!pending?.key) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const key = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
        pending = { key, payload: accountPayload };
        await storageSet({ pcaiPendingAccountCreation: pending });
      }
      saved = await api('/api/accounts', { method: 'POST', headers: { 'Idempotency-Key': pending.key }, body: JSON.stringify(pending.payload) });
      await storageSet({ pcaiLastAccountId: saved.id, pcaiSetupProgress: { accountId: saved.id, profileId: null, step: 3, editing: false, draft: profileDraft(blankDraft()) } });
      await storageRemove(['pcaiPendingAccountCreation']);
    }
    if (!saved?.id || !saved.confirmed) throw new Error('El backend no confirmó la identidad de la cuenta.');
    modelAccounts = [...modelAccounts.filter((item) => item.id !== saved.id), saved];
    wizardDraft = profileDraft(wizardDraft || blankDraft());
    wizardDraft.account_id = saved.id;
    currentAccountId = saved.id;
    currentAccount = saved;
    await storageSet({ pcaiLastAccountId: saved.id });
    await activateAccount(saved);
    if (accountReady) return;
    wizardStep = Math.max(3, wizardStep === 2 ? 3 : wizardStep);
    showOnboarding(wizardStep, wizardEditing);
    wizardStatus('Identidad confirmada. Ahora configura tus preferencias.');
    } finally {
      identityConfirmInFlight = false;
      confirmButton.disabled = false;
      if (wizardStep === 2) confirmButton.textContent = originalButtonText;
    }
  }
  async function initializeAssistant() {
    try {
      const accountData = await api('/api/accounts');
      modelAccounts = Array.isArray(accountData.accounts) ? accountData.accounts : [];
      await recoverPendingAccountCreation();
      identityDetection = AccountDetector?.detectAccount ? AccountDetector.detectAccount(document) : { status: 'unavailable', candidates: [], reason: 'detector_module_missing' };
      logIdentityDiagnostic(identityDetection);
      detectedAccountMatch = globalThis.PCAIAccountSetup?.matchDetectedAccount(modelAccounts, identityDetection) || null;
      const saved = await storageGet(['pcaiLastAccountId', 'pcaiSetupProgress']);
      startAccountObserver();
      const detectedNameMatchesSaved = detectedAccountMatch?.status === 'platform_match'
        && detectedAccountMatch.account.artist_name?.toLocaleLowerCase() === identityDetection.artistName?.toLocaleLowerCase();
      if (identityDetection.status === 'candidate' && identityDetection.platformUserId && detectedNameMatchesSaved && detectedAccountMatch.account.confirmed) {
        await activateAccount(detectedAccountMatch.account);
        return;
      }
      const last = modelAccounts.find((item) => item.id === saved.pcaiLastAccountId);
      wizardDraft = blankDraft();
      wizardStep = modelAccounts.length || identityDetection.status !== 'unavailable' || last ? 2 : 1;
      showOnboarding(wizardStep, false);
      wizardStatus(identityStatusMessage(identityDetection), identityDetection.status === 'ambiguous' || identityDetection.status === 'unavailable');
      setPanelOpen(true);
    } catch (error) {
      currentAccountId = null;
      currentAccount = null;
      wizardDraft = blankDraft();
      showOnboarding(1, false);
      wizardStatus(`No se pudo conectar con la configuración local: ${error.message}. Revisa el backend e inténtalo de nuevo.`, true);
      setPanelOpen(true);
    }
  }
  async function loadProfiles() {
    if (!currentAccountId) return;
    try {
      const data = await api(`/api/accounts/${encodeURIComponent(currentAccountId)}/profiles`);
      profileSnapshot = data;
      const select = $('#pcai-profile-select');
      select.replaceChildren();
      for (const profile of data.profiles || []) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name || 'Mi asistente';
        select.append(option);
      }
      select.value = data.active_id || '';
      const active = data.profiles?.find((profile) => profile.id === data.active_id);
      $('#pcai-profile-active').textContent = active?.name || 'Pendiente';
      $('#pcai-profile-summary').textContent = active
        ? `${active.personality.join(' · ') || 'Personalidad sin etiquetas'} · ${active.languages.map((language) => language === 'auto' ? 'detección automática' : language).join(', ') || 'idiomas por configurar'}`
        : 'Aún no hay una configuración activa para esta cuenta.';
      $('#pcai-profile-status').textContent = 'Perfiles y recuerdos guardados por separado para esta cuenta.';
      accountReady = globalThis.PCAIAccountSetup.profileIsReady(data);
      updateHeader();
      $('#pcai-main-content').hidden = !accountReady;
      $('#pcai-onboarding').hidden = accountReady;
      updateGenerateAvailability();
      if (accountReady) applyMode();
      else {
        const active = data.profiles?.find((profile) => profile.id === data.active_id);
        const pending = active || data.profiles?.find((profile) => !profile.onboarding_complete);
        editingProfileId = pending?.id || null;
        wizardDraft = pending ? profileDraft(pending) : blankDraft();
        showOnboarding(3, false);
        setPanelOpen(true);
      }
    } catch (error) {
      $('#pcai-profile-status').textContent = error.message;
      accountReady = false;
      updateHeader();
      showOnboarding(2, false);
    }
  }
  async function nextWizardStep() {
    try {
      wizardStatus('');
      if (wizardStep === 1) { wizardStep = 2; renderWizard(); return; }
      if (wizardStep === 2) { await confirmIdentity(); return; }
      if (wizardStep === 8) {
        await saveWizardProfile(8, true);
        const confirmed = await api(`/api/accounts/${encodeURIComponent(currentAccountId)}/profiles`);
        if (!globalThis.PCAIAccountSetup.profileIsReady(confirmed)) throw new Error('El backend todavía no confirma una configuración completa. Revisa los pasos pendientes.');
        await storageRemove(['pcaiSetupProgress']);
        profileSnapshot = confirmed;
        accountReady = true;
        results.replaceChildren();
        await loadProfiles();
        wizardStatus('Configuración guardada y confirmada. Ya puedes revisar borradores.');
        return;
      }
      const validation = validateWizardStep();
      if (validation) { wizardStatus(validation, true); return; }
      await saveWizardProfile(wizardStep, false);
      wizardStep += 1;
      renderWizard();
    } catch (error) { wizardStatus(error.message || 'No se pudo guardar el progreso. Puedes reintentar.', true); }
  }
  $('#pcai-wizard-view').addEventListener('input', () => { syncWizardDraft(); persistWizardDraftSoon(); });
  $('#pcai-wizard-view').addEventListener('change', () => { syncWizardDraft(); persistWizardDraftSoon(); });
  $('#pcai-wizard-next').onclick = () => { void nextWizardStep(); };
  $('#pcai-wizard-back').onclick = () => { if (wizardStep > 1) { syncWizardDraft(); wizardStep -= 1; renderWizard(); wizardStatus(''); } };
  $('#pcai-wizard-cancel').onclick = async () => {
    try {
      const progress = await storageGet(['pcaiSetupProgress']);
      if (progress.pcaiSetupProgress?.editing && progress.pcaiSetupProgress.profileId) {
        await api(`/api/accounts/${encodeURIComponent(currentAccountId)}/profiles/${encodeURIComponent(progress.pcaiSetupProgress.profileId)}`, { method: 'DELETE' });
      }
      await storageRemove(['pcaiSetupProgress']);
      editingProfileId = null;
      await loadProfiles();
    } catch (error) { wizardStatus(`No se pudo cancelar la edición: ${error.message}`, true); }
  };
  $('#pcai-profile-select').onchange = () => {
    const selected = profileSnapshot.profiles.find((profile) => profile.id === $('#pcai-profile-select').value);
    $('#pcai-profile-active').textContent = selected?.name || 'Pendiente';
  };
  $('#pcai-profile-edit').onclick = () => {
    const selected = profileSnapshot.profiles.find((profile) => profile.id === $('#pcai-profile-select').value) || profileSnapshot.profiles.find((profile) => profile.id === profileSnapshot.active_id);
    if (!selected) { wizardDraft = blankDraft(); editingProfileId = null; }
    else { wizardDraft = profileDraft(selected); editingProfileId = null; }
    wizardEditing = true;
    showOnboarding(3, true);
    wizardStatus(selected ? `Editando «${selected.name}». El perfil actual seguirá disponible hasta guardar los cambios.` : 'Elige tus preferencias; se guardarán al continuar.');
  };
  $('#pcai-profile-new').onclick = () => {
    if (!currentAccountId) return;
    wizardDraft = blankDraft();
    editingProfileId = null;
    wizardEditing = true;
    showOnboarding(3, true);
    wizardStatus('Crea otra configuración para esta misma cuenta.');
  };
  $('#pcai-profile-activate').onclick = async () => {
    try {
      const profileId = $('#pcai-profile-select').value;
      if (!profileId) throw new Error('No hay un perfil para activar.');
      await api(`/api/accounts/${encodeURIComponent(currentAccountId)}/profiles/${encodeURIComponent(profileId)}/activate`, { method: 'POST' });
      await loadProfiles();
    } catch (error) { $('#pcai-profile-status').textContent = error.message; }
  };
  $('#pcai-save-settings').onclick = async () => {
    try {
      const nextUrl = BackendConfig.normalizeBackendUrl($('#pcai-url').value.trim());
      const hostPermissions = chrome.runtime?.getManifest?.().host_permissions || [];
      if (!BackendConfig.isCoveredByHostPermissions(nextUrl, hostPermissions)) throw new Error('Chrome no ha concedido permiso de conexión para esta URL local. Recarga la extensión y vuelve a intentarlo.');
      base = nextUrl;
      await storageSet({ backendUrl: base });
      await check();
    } catch (e) { status.textContent = e.message; }
  };
  $('#pcai-connect-button').onclick = async () => {
    try {
      await extensionMessage({ type: 'OPEN_CONNECTION' });
      status.textContent = 'Abre la página de conexión de PERSONAL_CHAT_AI para vincular el backend.';
      status.className = 'pcai-status is-warn';
    } catch (error) {
      status.textContent = error.message || 'No se pudo abrir la conexión segura.';
      status.className = 'pcai-status is-error';
    }
  };
  $('#pcai-test-selectors').onclick = () => {
    const candidate = formSelectors();
    const tester = new Detector({ document, onUpdate: () => {}, onIncoming: () => {} });
    tester.configure(candidate);
    tester.start();
    const result = tester.diagnose();
    tester.stop();
    verifiedSelectorSignature = result.ok ? JSON.stringify(candidate) : null;
    showSelectorDiagnostic(result);
    if (mode === 'auto' && result.ok) {
      if (JSON.stringify(candidate) === JSON.stringify(selectors)) applyMode();
      else detection.textContent = 'Selectores comprobados; guarda esa misma configuración para iniciar la detección automática.';
    }
  };
  $('#pcai-save-selectors').onclick = async () => {
    const nextSelectors = formSelectors();
    const signature = JSON.stringify(nextSelectors);
    if (signature !== JSON.stringify(selectors)) verifiedSelectorSignature = null;
    selectors = nextSelectors;
    await storageSet({ selectors });
    configureDetector();
    if (mode !== 'off') applyMode();
    $('#pcai-selector-diagnostic').textContent = verifiedSelectorSignature === signature
      ? 'Configuración guardada y comprobada en este DOM durante esta sesión.'
      : 'Configuración guardada; aún no está verificada. Pulsa «Probar selectores en esta página».';
  };
  $('#pcai-mode').onchange = async () => {
    mode = modeSelect.value;
    modeBadge.textContent = mode === 'auto' ? 'Automático' : mode === 'off' ? 'Desactivado' : 'Manual';
    await storageSet({ mode });
    applyMode();
    renderAutoDiagnostic();
  };
  $('#pcai-context-window').addEventListener('change', async () => {
    const selected = Number($('#pcai-context-window').value);
    contextWindow = [8, 12, 20, 30, 40, 100].includes(selected) ? selected : 100;
    $('#pcai-context-window').value = String(contextWindow);
    await storageSet({ contextWindow, contextSettingsVersion: 3 });
  });
  $('#pcai-context-char-budget').addEventListener('change', async () => {
    const selected = Number($('#pcai-context-char-budget').value);
    contextCharBudget = [3000, 6000, 8000, 12000].includes(selected) ? selected : 12000;
    $('#pcai-context-char-budget').value = String(contextCharBudget);
    await storageSet({ contextCharBudget, contextSettingsVersion: 3 });
  });
  for (const key of ['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp']) {
    $(`#pcai-pick-${key}`).onclick = () => beginElementPicker(key);
    $(`#pcai-sel-${key}`).addEventListener('input', () => {
      verifiedSelectorSignature = null;
      if (mode === 'auto') {
        detector?.stop();
        abortPending();
        if (autoTimer !== null) clearTimeout(autoTimer);
        autoTimer = null;
        pendingAutoPayloads.clear();
        detection.textContent = 'Configuración modificada; modo automático detenido hasta volver a probar y guardar.';
      }
    });
  }
  $('#pcai-message').addEventListener('input', () => { manuallyEditedMessage = true; });
  $('#pcai-alias').addEventListener('input', () => { alias.dataset.userEdited = 'true'; });
  $('#pcai-generate').onclick = async () => {
    if (mode === 'off' || suggestionFlow.pending.size > 0) return;
    const latestIncoming = SuggestionFlow.latestIncoming(currentSnapshot);
    if (!latestIncoming) {
      detection.textContent = 'No hay un mensaje entrante válido en el chat activo; no se envió ninguna solicitud.';
      showSuggestionState('Abre un chat con un mensaje entrante y vuelve a intentarlo.', false);
      return;
    }
    void requestSuggestion(latestIncoming.text, currentSnapshot, false, null, false, latestIncoming.fingerprint);
  };
  $('#pcai-generate-custom').onclick = async () => {
    if (mode === 'off' || suggestionFlow.pending.size > 0) return;
    const typedMessage = message.value.trim();
    const latestIncoming = SuggestionFlow.latestIncoming(currentSnapshot);
    const candidate = typedMessage || latestIncoming?.text || '';
    if (!candidate) { detection.textContent = 'Escribe un mensaje o abre un chat con un mensaje entrante.'; showSuggestionState('Falta el mensaje que se debe responder.', false); return; }
    const manualAlias = alias.value.trim();
    if (typedMessage && manualAlias) await storageSet({ interlocutor: manualAlias });
    void requestSuggestion(candidate, currentSnapshot, false, manualAlias || null, false, typedMessage ? null : latestIncoming?.fingerprint, !typedMessage, $('#pcai-context-extra').value.trim());
  };
  $('#pcai-save-note').onclick = async () => {
    if (!alias.value.trim()) { status.textContent = 'Escribe un alias para asociar la nota.'; return; }
    try { await api(accountScopedPath(`/api/memory/${encodeURIComponent(alias.value.trim())}/notes`), { method: 'POST', body: JSON.stringify({ text: $('#pcai-note').value }) }); $('#pcai-note').value = ''; await loadNotes(); }
    catch (e) { status.textContent = e.message; }
  };
  async function loadNotes() {
    const requestedAlias = alias.value.trim();
    if (!requestedAlias) { notes.replaceChildren(); status.textContent = 'Escribe un alias antes de consultar la memoria.'; return; }
    try {
      const data = await api(accountScopedPath(`/api/memory/${encodeURIComponent(requestedAlias)}`));
      if (alias.value.trim() !== requestedAlias) return;
      notes.replaceChildren();
      data.notes.forEach((note) => {
        const row = document.createElement('div'); row.className = 'pcai-note';
        const input = document.createElement('input'); input.value = note.text; input.maxLength = 1000;
        const save = document.createElement('button'); save.textContent = 'Guardar'; save.onclick = async () => { try { await api(accountScopedPath(`/api/memory/${encodeURIComponent(requestedAlias)}/notes/${note.id}`), { method: 'PUT', body: JSON.stringify({ text: input.value }) }); } catch (e) { status.textContent = e.message; } };
        const del = document.createElement('button'); del.textContent = 'Borrar'; del.onclick = async () => { try { await api(accountScopedPath(`/api/memory/${encodeURIComponent(requestedAlias)}/notes/${note.id}`), { method: 'DELETE' }); if (alias.value.trim() === requestedAlias) await loadNotes(); } catch (e) { status.textContent = e.message; } };
        row.append(input, save, del); notes.append(row);
      });
    } catch (e) { status.textContent = 'No se pudo cargar la memoria local. Revisa Diagnóstico.'; status.className = 'pcai-status is-error'; showTechnicalError(e.message); }
  }
  $('#pcai-load-notes').onclick = loadNotes;
  $('#pcai-clear-memory').onclick = async () => { if (!alias.value.trim() || !confirm(`¿Eliminar toda la memoria local de ${alias.value.trim()}?`)) return; try { await api(accountScopedPath(`/api/memory/${encodeURIComponent(alias.value.trim())}`), { method: 'DELETE' }); await loadNotes(); } catch (e) { status.textContent = e.message; } };
  loadPrefs();
  window.__personalChatAIInstalled = true;
})();
