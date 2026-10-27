/* Coordinates suggestion requests without depending on the page DOM. */
(() => {
  class SuggestionFlow {
    static normalizeApiError(body, status = null) {
      const error = body && typeof body === 'object' && !Array.isArray(body) ? body.error : null;
      const detail = body && typeof body === 'object' && !Array.isArray(body) ? body.detail : null;
      const message = typeof error?.message === 'string' ? error.message
        : typeof detail === 'string' ? detail
          : typeof body?.message === 'string' ? body.message : '';
      const code = typeof error?.code === 'string' ? error.code : '';
      const fallbacks = {
        invalid_request: 'La solicitud no cumple el formato esperado. Revisa el mensaje y vuelve a intentarlo.',
        request_too_large: 'La solicitud supera el límite configurado.',
        generation_validation_failed: 'La respuesta de LM Studio no superó la validación. Puedes reintentar.',
        lm_studio_unavailable: 'LM Studio no está disponible. Comprueba que el servidor local esté iniciado.',
        backend_unavailable: 'El backend local no está disponible. Inícialo y vuelve a intentarlo.',
        invalid_json: 'El backend devolvió un JSON no válido.',
        render_error: 'La respuesta llegó, pero no se pudo mostrar en el panel. Puedes reintentar.',
        lm_studio_invalid_response: 'LM Studio respondió con un formato no válido.',
        lm_studio_http_error: 'LM Studio devolvió un error HTTP.',
        http_error: `La solicitud falló (HTTP ${Number(status) || 'desconocido'}).`,
        backend_unavailable_network: 'No se pudo conectar con el backend local. Comprueba que esté iniciado.',
      };
      const resolvedCode = code || (status === 422 ? 'invalid_request'
        : status === 502 ? 'generation_validation_failed'
          : status ? 'http_error' : 'backend_unavailable_network');
      const safeMessage = typeof message === 'string' && message.trim() ? message.trim()
        : fallbacks[resolvedCode] || fallbacks.http_error;
      const normalized = new Error(safeMessage);
      normalized.code = resolvedCode;
      normalized.reasonCode = typeof error?.reason_code === 'string' ? error.reason_code : resolvedCode;
      normalized.httpStatus = Number(status) || null;
      normalized.diagnostics = body && typeof body === 'object' && !Array.isArray(body)
        && body.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : null;
      return normalized;
    }

    constructor({ request, getMode, getConversationKey, getInterlocutorAlias, getLatestIncomingFingerprint, getContextWindow, getContextCharBudget, getAccountId, onLoading, onSuccess, onEmpty, onError, onDiagnostic }) {
      this.request = request;
      this.getMode = getMode;
      this.getConversationKey = getConversationKey;
      this.getInterlocutorAlias = getInterlocutorAlias || (() => null);
      this.getLatestIncomingFingerprint = getLatestIncomingFingerprint || (() => null);
      this.getContextWindow = getContextWindow || (() => 100);
      this.getContextCharBudget = getContextCharBudget || (() => 12000);
      this.getAccountId = getAccountId || (() => null);
      this.onLoading = onLoading || (() => {});
      this.onSuccess = onSuccess || (() => {});
      this.onEmpty = onEmpty || (() => {});
      this.onError = onError || (() => {});
      this.onDiagnostic = onDiagnostic || (() => {});
      this.pending = new Set();
      this.pendingAutomatic = new Set();
      this.inFlightKeys = new Set();
      this.idleWaiters = new Set();
      this.generationSequence = 0;
    }

    cancelPending() {
      for (const controller of this.pending) controller.abort();
    }

    cancelAutomatic() {
      for (const controller of this.pendingAutomatic) controller.abort();
    }

    whenIdle() {
      if (!this.pending.size) return Promise.resolve();
      return new Promise((resolve) => this.idleWaiters.add(resolve));
    }

    static latestIncoming(snapshot) {
      return [...(snapshot?.messages || [])].reverse().find((item) => item.direction === 'incoming' && String(item.text || '').trim()) || null;
    }

    static latestConversationMessage(snapshot) {
      return [...(snapshot?.messages || [])].reverse().find((item) => item.direction !== 'system' && String(item.text || '').trim()) || null;
    }

    static latestIncomingIdentity(snapshot) {
      const item = SuggestionFlow.latestIncoming(snapshot);
      if (!item) return null;
      return item.fingerprint || String(item.text || '').replace(/\s+/g, ' ').trim() || null;
    }

    static shouldCancelForSnapshotChange(previous, next) {
      if ((previous?.conversationKey || null) !== (next?.conversationKey || null)) return true;
      const normalizeAlias = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (normalizeAlias(previous?.alias) !== normalizeAlias(next?.alias)) return true;
      return SuggestionFlow.latestIncomingIdentity(previous) !== SuggestionFlow.latestIncomingIdentity(next);
    }

    static isLatestIncoming(snapshot, fingerprint) {
      const latest = SuggestionFlow.latestIncoming(snapshot);
      return Boolean(latest && fingerprint && latest.fingerprint === fingerprint);
    }

    static normalizeTimestamp(value) {
      const raw = String(value || '').replace(/\s+/g, ' ').trim().replace(/^(\d{1,2}:\d{2}(?::\d{2})?)(?:\s+\1)+$/, '$1');
      if (!raw) return '';
      const clock = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (clock) return `${clock[1].padStart(2, '0')}:${clock[2]}`;
      if (/^\d{4}-\d{2}-\d{2}[T ]/.test(raw)) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(parsed);
      }
      return raw.slice(0, 32);
    }

    static prepareContext(snapshot, message, { targetFingerprint = null, windowSize = 100, maxChars = 12000 } = {}) {
      return SuggestionFlow.prepareContextDetails(snapshot, message, { targetFingerprint, windowSize, maxChars }).context;
    }

    static prepareContextDetails(snapshot, message, { targetFingerprint = null, windowSize = 100, maxChars = 12000 } = {}) {
      const seen = new Set();
      const rows = (snapshot?.messages || []).filter((item) => {
        if (!['incoming', 'outgoing'].includes(item.direction) || !String(item.text || '').trim()) return false;
        const text = String(item.text).replace(/\s+/g, ' ').trim();
        const key = item.fingerprint ? `id:${item.fingerprint}` : `${item.direction}|${SuggestionFlow.normalizeTimestamp(item.time)}|${text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      let filtered = rows.filter((item) => !targetFingerprint || item.fingerprint !== targetFingerprint);
      if (!targetFingerprint) {
        const target = String(message || '').replace(/\s+/g, ' ').trim();
        const targetIndex = [...filtered].map((item) => item.direction === 'incoming' && item.text.replace(/\s+/g, ' ').trim() === target).lastIndexOf(true);
        if (targetIndex >= 0) filtered = filtered.filter((_, index) => index !== targetIndex);
      }
      const size = Math.max(1, Math.min(100, Number(windowSize) || 100));
      const recent = filtered.slice(-size);
      const lines = [];
      let used = 0;
      let characterTruncated = false;
      for (const item of [...recent].reverse()) {
        const author = item.direction === 'incoming' ? 'Interlocutor' : 'Usuario';
        const time = SuggestionFlow.normalizeTimestamp(item.time);
        const line = `- ${author}${time ? ` (${time})` : ''}: ${String(item.text).replace(/\s+/g, ' ').trim()}`;
        const separatorLength = lines.length ? 1 : 0;
        const remaining = maxChars - used - separatorLength;
        if (remaining <= 0 || line.length > remaining) { characterTruncated = true; break; }
        const includedLine = line;
        lines.unshift(includedLine);
        used += separatorLength + includedLine.length;
      }
      return {
        context: lines.join('\n'),
        includedCount: lines.length,
        extractedCount: Number(snapshot?.counts?.total) || (snapshot?.messages || []).length,
        extractedIncomingCount: Number(snapshot?.counts?.incoming) || (snapshot?.messages || []).filter((item) => item.direction === 'incoming').length,
        extractedOutgoingCount: Number(snapshot?.counts?.outgoing) || (snapshot?.messages || []).filter((item) => item.direction === 'outgoing').length,
        truncatedByWindow: filtered.length > size || (Number(snapshot?.counts?.total) || 0) > (snapshot?.messages || []).length,
        truncatedByCharacters: characterTruncated,
      };
    }

    async generate(message, snapshot, automatic = false, aliasOverride = null, initial = false, targetFingerprint = null, targetIsIncoming = true, additionalContext = '') {
      const mode = this.getMode();
      const text = String(message || '').trim();
      if (mode === 'off' || (automatic && mode !== 'auto') || !text) return { state: 'ignored' };
      const alias = automatic ? snapshot?.alias : aliasOverride || snapshot?.alias || null;
      if (automatic && !alias) return { state: 'unidentified' };
      const conversationKey = snapshot?.conversationKey || this.getConversationKey();
      const requestKey = `${conversationKey || ''}\u001f${targetFingerprint || text}`;
      if (this.inFlightKeys.has(requestKey)) {
        this.reportDiagnostic({ mode: automatic ? 'auto' : 'manual', state: 'duplicate', duration_ms: 0, reason: 'same_target_in_flight' });
        return { state: 'duplicate' };
      }
      const targetIsCurrent = () => {
        if (!targetIsIncoming || !targetFingerprint) return true;
        const latestIncoming = this.getLatestIncomingFingerprint();
        return latestIncoming == null || latestIncoming === targetFingerprint;
      };
      const accountIdAtStart = this.getAccountId();
      const visitorAtStart = snapshot?.alias || null;
      const generationId = `g${Date.now().toString(36)}-${(++this.generationSequence).toString(36)}`;
      const startedAt = globalThis.performance?.now?.() ?? Date.now();
      let terminalState = 'error';
      let terminalReason = 'unexpected_failure';
      const finish = (state, reason, extra = {}) => {
        terminalState = state;
        terminalReason = reason;
        return { state, ...extra };
      };
      const reportStaleReason = (data = null) => {
        if (conversationKey && conversationKey !== this.getConversationKey()) return 'conversation_changed';
        if (accountIdAtStart !== this.getAccountId()) return 'account_changed';
        const activeVisitor = this.getInterlocutorAlias();
        if (visitorAtStart && normalizeAlias(visitorAtStart) !== normalizeAlias(activeVisitor)) return 'visitor_changed';
        if (data?.model_account_id && accountIdAtStart && data.model_account_id !== accountIdAtStart) return 'account_mismatch';
        if (data?.conversation_id && conversationKey && data.conversation_id !== conversationKey) return 'conversation_mismatch';
        if (typeof data?.interlocutor === 'string' && normalizeAlias(data.interlocutor) !== normalizeAlias(alias)) return 'visitor_mismatch';
        if (targetFingerprint && data?.target_message_id && data.target_message_id !== targetFingerprint) return 'target_mismatch';
        if (!targetIsCurrent()) return 'newer_incoming_message';
        if (automatic && this.getMode() !== 'auto') return 'automatic_mode_disabled';
        if (controller.signal.aborted) return 'cancelled';
        return '';
      };
      const normalizeAlias = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      this.inFlightKeys.add(requestKey);
      const controller = new AbortController();
      this.pending.add(controller);
      if (automatic) this.pendingAutomatic.add(controller);
      let responseReceived = false;
      try {
        this.reportDiagnostic({ generation_id: generationId, mode: automatic ? 'auto' : 'manual', state: 'started', duration_ms: 0, reason: '' });
        this.onLoading({ automatic, alias });
        const contextSnapshot = !automatic && aliasOverride && normalizeAlias(aliasOverride) !== normalizeAlias(snapshot?.alias)
          ? null : snapshot;
        const context = SuggestionFlow.prepareContextDetails(contextSnapshot, text, {
          targetFingerprint,
          windowSize: this.getContextWindow(),
          maxChars: this.getContextCharBudget(),
        });
        const data = await this.request({
          model_account_id: this.getAccountId() || null,
          configured_mode: mode,
          generation_trigger: automatic ? 'automatic' : 'manual',
          message: text.slice(0, 4000), interlocutor: alias,
          target_message: text.slice(0, 4000),
          target_message_id: targetFingerprint || null,
          conversation_history: context.context,
          interlocutor_alias: alias,
          detected_language: null,
          conversation_id: typeof conversationKey === 'string' ? conversationKey.slice(0, 160) : null,
          target_is_incoming: targetIsIncoming,
          context: context.context,
          additional_context: String(additionalContext || '').slice(0, 4000),
          dom_extracted_message_count: context.extractedCount,
          dom_extracted_incoming_count: context.extractedIncomingCount,
          dom_extracted_outgoing_count: context.extractedOutgoingCount,
          dom_extracted_unclassified_count: Math.max(0, context.extractedCount - context.extractedIncomingCount - context.extractedOutgoingCount),
          client_context_window: this.getContextWindow(),
          client_context_truncated_by_window: context.truncatedByWindow,
          client_context_truncated_by_characters: context.truncatedByCharacters,
        }, controller.signal, generationId);
        responseReceived = true;
        const staleReason = reportStaleReason(data);
        if (staleReason) return finish('stale', staleReason);
        const originalResponse = typeof data?.original_response === 'string' ? data.original_response.trim() : '';
        if (!originalResponse) {
          const error = new Error('LM Studio no devolvió una respuesta original. Puedes reintentar.');
          error.httpStatus = data?.__httpStatus || null;
          this.onError({ automatic, alias, error, httpStatus: error.httpStatus });
          return finish('error', 'empty_response');
        }
        const language = typeof data.language === 'string' ? data.language : data?.diagnostics?.detected_language || '';
        const spanishTranslation = language === 'es' || typeof data.spanish_translation !== 'string'
          ? '' : data.spanish_translation.trim();
        this.onSuccess({
          configuredMode: mode, generationTrigger: automatic ? 'automatic' : 'manual',
          originalResponse, spanishTranslation, language, automatic, initial, alias, message: text,
          notice: typeof data.notice === 'string' ? data.notice : '',
          httpStatus: data.__httpStatus || null, diagnostics: data?.diagnostics || null,
        });
        return finish('success', 'completed', { count: 1 });
      } catch (error) {
        const staleReason = reportStaleReason();
        if (staleReason) return finish('stale', staleReason);
        const normalized = responseReceived
          ? SuggestionFlow.normalizeApiError({ error: { code: 'render_error' } })
          : error instanceof Error
          ? SuggestionFlow.normalizeApiError({ error: { code: error.code, reason_code: error.reasonCode, message: error.message }, diagnostics: error.diagnostics }, error.httpStatus)
          : SuggestionFlow.normalizeApiError(error, error?.httpStatus);
        this.onError({ automatic, alias, error: normalized, httpStatus: normalized.httpStatus });
        return finish('error', normalized.code || 'request_failed');
      } finally {
        this.pending.delete(controller);
        this.pendingAutomatic.delete(controller);
        this.inFlightKeys.delete(requestKey);
        if (!this.pending.size) {
          try { this.onLoading({ done: true }); } catch (_) { terminalReason = terminalReason || 'loading_state_render_failed'; }
          for (const resolve of this.idleWaiters) resolve();
          this.idleWaiters.clear();
        }
        const endedAt = globalThis.performance?.now?.() ?? Date.now();
        this.reportDiagnostic({
          generation_id: generationId, mode: automatic ? 'auto' : 'manual', state: terminalState,
          duration_ms: Math.max(0, Math.round(endedAt - startedAt)), reason: terminalReason,
        });
      }
    }

    reportDiagnostic(record) {
      try { this.onDiagnostic(record); } catch (_) { /* Diagnostics must not change generation behavior. */ }
    }
  }

  globalThis.PCAISuggestionFlow = SuggestionFlow;
  if (typeof module !== 'undefined' && module.exports) module.exports = SuggestionFlow;
})();
