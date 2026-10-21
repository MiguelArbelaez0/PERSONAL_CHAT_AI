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
      normalized.httpStatus = Number(status) || null;
      normalized.diagnostics = body && typeof body === 'object' && !Array.isArray(body)
        && body.diagnostics && typeof body.diagnostics === 'object' ? body.diagnostics : null;
      return normalized;
    }

    constructor({ request, getMode, getConversationKey, getLatestIncomingFingerprint, getContextWindow, getContextCharBudget, onLoading, onSuccess, onEmpty, onError }) {
      this.request = request;
      this.getMode = getMode;
      this.getConversationKey = getConversationKey;
      this.getLatestIncomingFingerprint = getLatestIncomingFingerprint || (() => null);
      this.getContextWindow = getContextWindow || (() => 100);
      this.getContextCharBudget = getContextCharBudget || (() => 12000);
      this.onLoading = onLoading || (() => {});
      this.onSuccess = onSuccess || (() => {});
      this.onEmpty = onEmpty || (() => {});
      this.onError = onError || (() => {});
      this.pending = new Set();
      this.inFlightKeys = new Set();
    }

    cancelPending() {
      for (const controller of this.pending) controller.abort();
      this.pending.clear();
    }

    static latestIncoming(snapshot) {
      return [...(snapshot?.messages || [])].reverse().find((item) => item.direction === 'incoming' && String(item.text || '').trim()) || null;
    }

    static latestConversationMessage(snapshot) {
      return [...(snapshot?.messages || [])].reverse().find((item) => item.direction !== 'system' && String(item.text || '').trim()) || null;
    }

    static isLatestIncoming(snapshot, fingerprint) {
      const latest = SuggestionFlow.latestConversationMessage(snapshot);
      return Boolean(latest && latest.direction === 'incoming' && latest.fingerprint === fingerprint);
    }

    static normalizeTimestamp(value) {
      const raw = String(value || '').replace(/\s+/g, ' ').trim();
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
      if (this.inFlightKeys.has(requestKey)) return { state: 'duplicate' };
      this.inFlightKeys.add(requestKey);
      const controller = new AbortController();
      this.pending.add(controller);
      this.onLoading({ automatic, alias });
      let responseReceived = false;
      try {
        const context = SuggestionFlow.prepareContextDetails(snapshot, text, {
          targetFingerprint,
          windowSize: this.getContextWindow(),
          maxChars: this.getContextCharBudget(),
        });
        const data = await this.request({
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
        }, controller.signal);
        responseReceived = true;
        if (controller.signal.aborted || (conversationKey && conversationKey !== this.getConversationKey())
          || (data?.conversation_id && conversationKey && data.conversation_id !== conversationKey)
          || (targetFingerprint && data?.target_message_id && data.target_message_id !== targetFingerprint)
          || (targetIsIncoming && targetFingerprint && this.getLatestIncomingFingerprint() !== targetFingerprint)
          || (automatic && this.getMode() !== 'auto')) return { state: 'stale' };
        const originalResponse = typeof data?.original_response === 'string' ? data.original_response.trim() : '';
        if (!originalResponse) {
          const error = new Error('LM Studio no devolvió una respuesta original. Puedes reintentar.');
          error.httpStatus = data?.__httpStatus || null;
          this.onError({ automatic, alias, error, httpStatus: error.httpStatus });
          return { state: 'error' };
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
        return { state: 'success', count: 1 };
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) return { state: 'stale' };
        if (conversationKey && conversationKey !== this.getConversationKey()) return { state: 'stale' };
        if (targetIsIncoming && targetFingerprint && this.getLatestIncomingFingerprint() !== targetFingerprint) return { state: 'stale' };
        const normalized = responseReceived
          ? SuggestionFlow.normalizeApiError({ error: { code: 'render_error' } })
          : error instanceof Error
          ? SuggestionFlow.normalizeApiError({ error: { code: error.code, message: error.message }, diagnostics: error.diagnostics }, error.httpStatus)
          : SuggestionFlow.normalizeApiError(error, error?.httpStatus);
        this.onError({ automatic, alias, error: normalized, httpStatus: normalized.httpStatus });
        return { state: 'error' };
      } finally {
        this.pending.delete(controller);
        this.inFlightKeys.delete(requestKey);
        if (!this.pending.size) this.onLoading({ done: true });
      }
    }
  }

  globalThis.PCAISuggestionFlow = SuggestionFlow;
  if (typeof module !== 'undefined' && module.exports) module.exports = SuggestionFlow;
})();
