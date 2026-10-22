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
        <div class="pcai-brand"><span class="pcai-brand-icon" aria-hidden="true">✦</span><span><strong>Asistente local</strong><small id="pcai-header-state">Borradores privados</small></span></div>
        <div class="pcai-header-controls"><button id="pcai-minimize" class="pcai-icon-button" type="button" aria-label="Minimizar panel" title="Minimizar">−</button><button id="pcai-close" class="pcai-icon-button" type="button" aria-label="Cerrar asistente" title="Cerrar">×</button></div>
      </header>
      <div class="pcai-status" id="pcai-status" role="status">Comprobando servicios locales…</div>
      <div class="pcai-conversation-card">
        <div class="pcai-conversation-heading"><strong id="pcai-active-alias">Sin conversación identificada</strong></div>
        <div id="pcai-last-incoming" class="pcai-last-message" aria-live="polite"></div>
        <div class="pcai-detection" id="pcai-detection" aria-live="polite" hidden></div>
      </div>
      <details id="pcai-context-details" class="pcai-context-details"><summary>Ver contexto</summary><div class="pcai-context" id="pcai-context" aria-live="polite"></div></details>
      <section class="pcai-suggestions-section"><div class="pcai-section-heading"><h2>Respuesta sugerida</h2></div><div id="pcai-results" aria-live="polite"></div></section>
      <button class="primary pcai-generate-main" id="pcai-generate" type="button">Generar respuesta</button>
      <label class="pcai-mode-control">Modo<select id="pcai-mode"><option value="manual">Manual</option><option value="auto" selected>Automático</option><option value="off">Desactivado</option></select><span id="pcai-mode-badge" class="pcai-mode-badge">Automático</span></label>
      <details id="pcai-personalities" class="pcai-advanced"><summary>Personalidad · <span id="pcai-profile-active">Cargando…</span></summary>
        <label>Perfil<select id="pcai-profile-select"></select></label>
        <div class="pcai-actions"><button id="pcai-profile-new" type="button">Nuevo</button><button id="pcai-profile-activate" type="button">Activar</button><button id="pcai-profile-reload" type="button">Actualizar</button></div>
        <label>Nombre<input id="pcai-profile-name" maxlength="80" /></label>
        <label>Descripción<textarea id="pcai-profile-description" maxlength="800"></textarea></label>
        <label>Tono<input id="pcai-profile-tone" maxlength="300" /></label>
        <label>Estilo<input id="pcai-profile-style" maxlength="300" /></label>
        <label>Reglas<textarea id="pcai-profile-rules" maxlength="1000"></textarea></label>
        <div class="pcai-actions"><button id="pcai-profile-save" type="button">Guardar perfil</button><button id="pcai-profile-delete" type="button">Eliminar perfil</button><button id="pcai-profile-restore" type="button">Restaurar predeterminado</button></div>
        <small id="pcai-profile-status" role="status">Los perfiles se guardan en este equipo.</small>
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
        <label>URL del backend<input id="pcai-url" value="http://127.0.0.1:8765" /></label><button id="pcai-save-settings" type="button">Guardar URL</button>
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
  const SuggestionFlow = globalThis.PCAISuggestionFlow;
  let retrySuggestion = null;
  let suggestionFlow;
  let detector;
  let selectors = {};
  let verifiedSelectorSignature = null;
  const autoDiagnostic = {
    event: 'ninguno', lastIncoming: 'no detectado', generation: 'pendiente',
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
  let base = 'http://127.0.0.1:8765';

  function discoverStripchatSelectors() {
    const hostname = location.hostname.toLowerCase();
    if (hostname !== 'stripchat.com' && !hostname.endsWith('.stripchat.com')) return null;
    const probe = new Detector({ document, onUpdate: () => {}, onIncoming: () => {} });
    probe.configure(Detector.stripchatSelectors);
    const report = probe.diagnose();
    return { selectors: { ...Detector.stripchatSelectors }, report };
  }

  function normalizeLoopback(raw) {
    const url = new URL(raw);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) {
      throw new Error('La URL del backend debe ser local: http://127.0.0.1:PUERTO');
    }
    return url.origin;
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
      void chrome.storage.local.set({ [key]: { left: Number.parseFloat(element.style.left), top: Number.parseFloat(element.style.top) } });
    }
    dragState = null;
  }

  async function loadPrefs() {
    try {
      const data = await chrome.storage.local.get(['backendUrl', 'interlocutor', 'mode', 'selectors', 'processedAutomaticKeys', 'contextWindow', 'contextCharBudget', 'pcaiPanelPosition', 'pcaiTogglePosition']);
      try { base = normalizeLoopback(data.backendUrl || base); } catch (_) { base = 'http://127.0.0.1:8765'; }
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
            await chrome.storage.local.set({ selectors });
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
        await chrome.storage.local.set({ contextWindow, contextCharBudget, contextSettingsVersion: 3 });
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
      await loadProfiles();
      applyMode();
      renderAutoDiagnostic();
    } catch (_) {}
  }
  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    } catch (cause) {
      const error = SuggestionFlow.normalizeApiError(null);
      error.cause = cause;
      throw error;
    }
    let body = null;
    let invalidJson = false;
    if (response.status !== 204) {
      const raw = await response.text();
      if (raw) {
        try { body = JSON.parse(raw); }
        catch (_) {
          invalidJson = true;
        }
      }
    }
    if (!response.ok) {
      if (invalidJson) throw SuggestionFlow.normalizeApiError({ error: { code: 'invalid_json', message: `El backend devolvió un cuerpo no JSON (HTTP ${response.status}).` } }, response.status);
      throw SuggestionFlow.normalizeApiError(body, response.status);
    }
    if (invalidJson) throw SuggestionFlow.normalizeApiError({ error: { code: 'invalid_json' } }, response.status);
    if (body && typeof body === 'object') body.__httpStatus = response.status;
    return body;
  }
  function renderAutoDiagnostic(patch = {}) {
    Object.assign(autoDiagnostic, patch);
    const connected = Boolean(currentSnapshot?.conversationKey && currentSnapshot.alias);
    const counts = currentSnapshot?.counts || { total: currentSnapshot?.messages?.length || 0, incoming: 0, outgoing: 0 };
    $('#pcai-auto-diagnostic').textContent = [
      `Modo automático: ${mode === 'auto' ? 'activado' : 'desactivado'}`,
      `Conversación: ${connected ? 'identificada' : 'no identificada'} · Alias: ${currentSnapshot?.alias || '—'}`,
      `Observador del DOM: ${detector?.isObserving() ? 'activo' : 'inactivo'}`,
      `Último evento: ${autoDiagnostic.event}`,
      `Mensajes: ${counts.total} total, ${counts.incoming} entrantes, ${counts.outgoing} propios`,
      `Último entrante: ${autoDiagnostic.lastIncoming}`,
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
    getConversationKey: () => latestConversationKey,
    getLatestIncomingFingerprint: () => {
      const latest = SuggestionFlow.latestConversationMessage(currentSnapshot);
      return latest?.direction === 'incoming' ? latest.fingerprint : null;
    },
    getContextWindow: () => contextWindow,
    getContextCharBudget: () => contextCharBudget,
    request: (payload, signal) => api('/api/suggestions', { method: 'POST', signal, body: JSON.stringify(payload) }),
    onLoading: ({ done } = {}) => {
      const generate = $('#pcai-generate');
      generate.disabled = done ? mode === 'off' : true;
      generate.textContent = done ? 'Generar respuesta' : 'Generando…';
      const customGenerate = $('#pcai-generate-custom');
      customGenerate.disabled = done ? mode === 'off' : true;
      customGenerate.textContent = done ? 'Generar respuesta personalizada' : 'Generando…';
      updateGenerateAvailability();
      results.querySelectorAll?.('[data-pcai-state="loading"]').forEach((item) => item.remove());
      if (!done) {
        results.replaceChildren();
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
        lm_studio_invalid_response: 'LM Studio devolvió un formato no válido.',
        invalid_json: 'El backend respondió con JSON no válido.',
        render_error: 'La respuesta llegó, pero el panel no pudo mostrarla.',
      };
      status.textContent = `${statusByCode[error.code] || (httpStatus ? `Falló la petición HTTP ${httpStatus}.` : 'Falló la generación.') } Puedes reintentar.`;
      status.className = 'pcai-status is-error';
      detection.textContent = `Falló la generación: ${error.message || 'error del backend'}. Puedes reintentar.`;
      detection.hidden = false;
      const safeIssues = (error.diagnostics?.issues || []).map((item) => `${Array.isArray(item.path) ? item.path.join('.') : 'solicitud'}:${String(item.reason || 'validation_error')}`).slice(0, 6).join(', ');
      const technicalSummary = `${error.code || 'error'} · ${String(error.message || 'Error sin descripción').slice(0, 120)}${safeIssues ? ` · ${safeIssues}` : ''}`;
      renderAutoDiagnostic({ generation: 'fallida', http: httpStatus ? `HTTP ${httpStatus}` : 'sin respuesta HTTP', backendError: technicalSummary.slice(0, 180), lmCount: 'sin resultado' });
      showTechnicalError(technicalSummary);
      if (automatic) detection.textContent = 'Falló la generación automática; puedes reintentar desde Respuestas sugeridas.';
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
      } catch (error) { status.textContent += ' · LM Studio no disponible'; status.className = 'pcai-status is-warn'; showTechnicalError(error.message); }
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
    $('#pcai-generate').disabled = mode === 'off' || busy;
    $('#pcai-generate-custom').disabled = mode === 'off' || busy;
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
    if (!payload.snapshot?.alias || !String(payload.message || '').trim()) return;
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
    autoTimer = setTimeout(() => {
      autoTimer = null;
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
    retrySuggestion = () => requestSuggestion(messageText, snapshot, automatic, aliasOverride, initial, targetFingerprint, targetIsIncoming, additionalContext);
    const result = await suggestionFlow.generate(messageText, snapshot, automatic, aliasOverride, initial, targetFingerprint, targetIsIncoming, additionalContext);
    if (automatic) {
      const key = automaticMessageKey({ message: messageText, snapshot, fingerprint: targetFingerprint });
      if (result.state === 'stale') processedAutomaticKeys.delete(key);
      if (result.state === 'success') {
        const persistentKeys = [...processedAutomaticKeys].filter((item) => item.includes('\u001fid:')).slice(-1200);
        void chrome.storage.local.set({ processedAutomaticKeys: persistentKeys });
      }
    }
    if (result.state === 'unidentified') detection.textContent = 'No se generó: no hay un alias fiable para la conversación activa.';
    return result;
  }

  function renderSnapshot(snapshot) {
    const previousKey = latestConversationKey;
    const hadSnapshot = currentSnapshot !== null;
    const previousLatest = SuggestionFlow.latestConversationMessage(currentSnapshot);
    const previousTargetFingerprint = previousLatest?.direction === 'incoming' ? previousLatest.fingerprint : null;
    const nextKey = snapshot.conversationKey || null;
    latestConversationKey = nextKey;
    currentSnapshot = snapshot;
    const nextLatest = SuggestionFlow.latestConversationMessage(snapshot);
    const nextTargetFingerprint = nextLatest?.direction === 'incoming' ? nextLatest.fingerprint : null;
    const conversationChanged = Boolean(hadSnapshot && previousKey !== nextKey);
    if (hadSnapshot && !conversationChanged && previousTargetFingerprint !== nextTargetFingerprint) abortPending();
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
        if (mode !== 'auto') return;
        detection.hidden = false;
        if (lastIncoming) autoDiagnostic.lastIncoming = 'último mensaje entrante del contexto inicial';
        if (lastIncoming && SuggestionFlow.isLatestIncoming(snapshot, lastIncoming.fingerprint)
          && verifiedSelectorSignature === JSON.stringify(selectors)) {
          queueAutomaticSuggestion({ message: lastIncoming.text, snapshot, fingerprint: lastIncoming.fingerprint, initial: true });
        } else detection.textContent = 'Esperando el último mensaje entrante del chat.';
        renderAutoDiagnostic();
      },
      onIncoming: ({ message: incomingMessage, snapshot, fingerprint }) => {
        if (mode !== 'auto' || verifiedSelectorSignature !== JSON.stringify(selectors)) return;
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
  let profileSnapshot = { active_id: null, profiles: [] };
  let editingProfileId = null;
  const profileFields = ['name', 'description', 'tone', 'style', 'rules'];
  function editProfile(profile) {
    editingProfileId = profile?.id || null;
    for (const field of profileFields) $(`#pcai-profile-${field}`).value = profile?.[field] || '';
    $('#pcai-profile-delete').disabled = !editingProfileId || editingProfileId === 'default';
  }
  async function loadProfiles() {
    try {
      const data = await api('/api/profiles');
      if (!Array.isArray(data.profiles)) throw new Error('Reinicia el backend actualizado para usar perfiles.');
      profileSnapshot = data;
      const select = $('#pcai-profile-select');
      select.replaceChildren();
      for (const profile of data.profiles) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        select.append(option);
      }
      select.value = data.active_id;
      const active = data.profiles.find((profile) => profile.id === data.active_id);
      $('#pcai-profile-active').textContent = active?.name || 'Sin perfil';
      editProfile(active);
      $('#pcai-profile-status').textContent = 'Perfiles guardados localmente. Guardar no cambia el perfil activo.';
    } catch (error) {
      $('#pcai-profile-status').textContent = error.message;
      $('#pcai-profile-active').textContent = 'Sin conexión';
    }
  }
  async function profileAction(action) {
    try {
      abortPending();
      const selected = await action();
      results.replaceChildren();
      await loadProfiles();
      if (selected?.id) {
        $('#pcai-profile-select').value = selected.id;
        editProfile(selected);
      }
    } catch (error) { $('#pcai-profile-status').textContent = error.message; }
  }
  $('#pcai-profile-select').onchange = () => editProfile(profileSnapshot.profiles.find((item) => item.id === $('#pcai-profile-select').value));
  $('#pcai-profile-new').onclick = () => {
    $('#pcai-profile-select').value = '';
    editProfile(null);
    $('#pcai-profile-status').textContent = 'Nuevo perfil: completa los campos y guarda; después pulsa Activar.';
  };
  $('#pcai-profile-reload').onclick = loadProfiles;
  $('#pcai-profile-save').onclick = () => profileAction(async () => {
    const payload = Object.fromEntries(profileFields.map((field) => [field, $(`#pcai-profile-${field}`).value.trim()]));
    if (!payload.name) throw new Error('Indica un nombre para el perfil.');
    const saved = await api(editingProfileId ? `/api/profiles/${encodeURIComponent(editingProfileId)}` : '/api/profiles', { method: editingProfileId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    return saved;
  });
  $('#pcai-profile-activate').onclick = () => profileAction(async () => {
    if (!editingProfileId) throw new Error('Guarda el perfil antes de activarlo.');
    await api(`/api/profiles/${encodeURIComponent(editingProfileId)}/activate`, { method: 'POST' });
  });
  $('#pcai-profile-delete').onclick = () => {
    if (!editingProfileId || editingProfileId === 'default') return;
    if (confirm('¿Eliminar este perfil personalizado?')) void profileAction(() => api(`/api/profiles/${encodeURIComponent(editingProfileId)}`, { method: 'DELETE' }));
  };
  $('#pcai-profile-restore').onclick = () => {
    if (confirm('¿Restaurar y activar ChubbyKriz? Se conservan los perfiles personalizados.')) void profileAction(() => api('/api/profiles/restore', { method: 'POST' }));
  };
  $('#pcai-save-settings').onclick = async () => { try { base = normalizeLoopback($('#pcai-url').value.trim()); await chrome.storage.local.set({ backendUrl: base }); await loadProfiles(); check(); } catch (e) { status.textContent = e.message; } };
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
    await chrome.storage.local.set({ selectors });
    configureDetector();
    if (mode !== 'off') applyMode();
    $('#pcai-selector-diagnostic').textContent = verifiedSelectorSignature === signature
      ? 'Configuración guardada y comprobada en este DOM durante esta sesión.'
      : 'Configuración guardada; aún no está verificada. Pulsa «Probar selectores en esta página».';
  };
  $('#pcai-mode').onchange = async () => {
    mode = modeSelect.value;
    modeBadge.textContent = mode === 'auto' ? 'Automático' : mode === 'off' ? 'Desactivado' : 'Manual';
    await chrome.storage.local.set({ mode });
    applyMode();
    renderAutoDiagnostic();
  };
  $('#pcai-context-window').addEventListener('change', async () => {
    const selected = Number($('#pcai-context-window').value);
    contextWindow = [8, 12, 20, 30, 40, 100].includes(selected) ? selected : 100;
    $('#pcai-context-window').value = String(contextWindow);
    await chrome.storage.local.set({ contextWindow, contextSettingsVersion: 3 });
  });
  $('#pcai-context-char-budget').addEventListener('change', async () => {
    const selected = Number($('#pcai-context-char-budget').value);
    contextCharBudget = [3000, 6000, 8000, 12000].includes(selected) ? selected : 12000;
    $('#pcai-context-char-budget').value = String(contextCharBudget);
    await chrome.storage.local.set({ contextCharBudget, contextSettingsVersion: 3 });
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
    if (typedMessage && manualAlias) await chrome.storage.local.set({ interlocutor: manualAlias });
    void requestSuggestion(candidate, currentSnapshot, false, manualAlias || null, false, typedMessage ? null : latestIncoming?.fingerprint, !typedMessage, $('#pcai-context-extra').value.trim());
  };
  $('#pcai-save-note').onclick = async () => {
    if (!alias.value.trim()) { status.textContent = 'Escribe un alias para asociar la nota.'; return; }
    try { await api(`/api/memory/${encodeURIComponent(alias.value.trim())}/notes`, { method: 'POST', body: JSON.stringify({ text: $('#pcai-note').value }) }); $('#pcai-note').value = ''; await loadNotes(); }
    catch (e) { status.textContent = e.message; }
  };
  async function loadNotes() {
    const requestedAlias = alias.value.trim();
    if (!requestedAlias) { notes.replaceChildren(); status.textContent = 'Escribe un alias antes de consultar la memoria.'; return; }
    try {
      const data = await api(`/api/memory/${encodeURIComponent(requestedAlias)}`);
      if (alias.value.trim() !== requestedAlias) return;
      notes.replaceChildren();
      data.notes.forEach((note) => {
        const row = document.createElement('div'); row.className = 'pcai-note';
        const input = document.createElement('input'); input.value = note.text; input.maxLength = 1000;
        const save = document.createElement('button'); save.textContent = 'Guardar'; save.onclick = async () => { try { await api(`/api/memory/${encodeURIComponent(requestedAlias)}/notes/${note.id}`, { method: 'PUT', body: JSON.stringify({ text: input.value }) }); } catch (e) { status.textContent = e.message; } };
        const del = document.createElement('button'); del.textContent = 'Borrar'; del.onclick = async () => { try { await api(`/api/memory/${encodeURIComponent(requestedAlias)}/notes/${note.id}`, { method: 'DELETE' }); if (alias.value.trim() === requestedAlias) await loadNotes(); } catch (e) { status.textContent = e.message; } };
        row.append(input, save, del); notes.append(row);
      });
    } catch (e) { status.textContent = 'No se pudo cargar la memoria local. Revisa Diagnóstico.'; status.className = 'pcai-status is-error'; showTechnicalError(e.message); }
  }
  $('#pcai-load-notes').onclick = loadNotes;
  $('#pcai-clear-memory').onclick = async () => { if (!alias.value.trim() || !confirm(`¿Eliminar toda la memoria local de ${alias.value.trim()}?`)) return; try { await api(`/api/memory/${encodeURIComponent(alias.value.trim())}`, { method: 'DELETE' }); await loadNotes(); } catch (e) { status.textContent = e.message; } };
  loadPrefs();
  window.__personalChatAIInstalled = true;
})();
