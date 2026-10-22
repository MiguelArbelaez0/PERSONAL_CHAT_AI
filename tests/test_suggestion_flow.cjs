const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const SuggestionFlow = require('../extension/suggestion-flow.js');
const contentSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8').replace(/\r\n/g, '\n');

function fixture({ mode = 'manual', response, request, latestIncomingFingerprint = null } = {}) {
  let currentMode = mode;
  let conversationKey = 'chat-a';
  const view = { suggestions: [], state: '', requests: 0 };
  const flow = new SuggestionFlow({
    getMode: () => currentMode,
    getConversationKey: () => conversationKey,
    getLatestIncomingFingerprint: () => latestIncomingFingerprint,
    request: async (payload, signal) => {
      view.requests++;
      view.payload = payload;
      if (request) return request(payload, signal);
      if (response instanceof Error) throw response;
      return response || { language: 'es', original_response: 'Respuesta de prueba directa', spanish_translation: null };
    },
    onLoading: ({ done } = {}) => { view.loading = !done; },
    onSuccess: (data) => { view.suggestions.push(data.originalResponse); view.translation = data.spanishTranslation; view.language = data.language; view.initial = data.initial; view.state = 'success'; },
    onEmpty: ({ httpStatus }) => { view.httpStatus = httpStatus; view.state = 'empty'; },
    onError: ({ httpStatus, error }) => { view.httpStatus = httpStatus; view.error = error?.message; view.state = 'error'; },
  });
  return { flow, view, snapshot: { conversationKey, alias: 'Ana', messages: [] }, setMode: (v) => { currentMode = v; }, setConversation: (v) => { conversationKey = v; }, setLatestIncoming: (v) => { latestIncomingFingerprint = v; } };
}

test('manual alias change cannot reuse a different interlocutor DOM history', async () => {
  const f = fixture();
  const snapshot = { ...f.snapshot, messages: [
    { direction: 'outgoing', text: 'Private synthetic fact from Ana', fingerprint: 'old' },
  ] };
  await f.flow.generate('Hello Bob', snapshot, false, 'Bob');
  assert.equal(f.view.payload.context, '');
  assert.equal(f.view.payload.dom_extracted_message_count, 0);
  assert.equal(f.view.payload.interlocutor, 'Bob');
});

test('explicit backend alias mismatch discards an otherwise current response', async () => {
  const f = fixture({ response: { interlocutor: 'Bob', language: 'en', original_response: 'Hello there' } });
  await f.flow.generate('Hello', f.snapshot);
  assert.deepEqual(f.view.suggestions, []);
});

test('structured rejection reason survives API normalization', () => {
  const error = SuggestionFlow.normalizeApiError({ error: { code: 'lm_studio_error', reason_code: 'unsupported_claim', message: 'Rejected' } }, 502);
  assert.equal(error.reasonCode, 'unsupported_claim');
  assert.equal(error.httpStatus, 502);
});

test('manual form generation sends the selected message to the backend', async () => {
  assert.match(contentSource, /id="pcai-generate"[^>]*>Generar respuesta</);
  assert.match(contentSource, /\$\('#pcai-generate'\)\.onclick[\s\S]*?latestIncoming\.text, currentSnapshot, false/);
  const f = fixture();
  await f.flow.generate('  Hola  ', f.snapshot, false, 'Alias manual');
  assert.equal(f.view.requests, 1);
  assert.equal(f.view.payload.message, 'Hola');
  assert.equal(f.view.payload.interlocutor, 'Alias manual');
  assert.equal(f.view.payload.configured_mode, 'manual');
  assert.equal(f.view.payload.generation_trigger, 'manual');
  assert.equal(f.view.state, 'success');
});

test('automatic new incoming message generates in auto mode', async () => {
  assert.match(contentSource, /onIncoming:[\s\S]*?queueAutomaticSuggestion\(\{ message: incomingMessage/);
  const f = fixture({ mode: 'auto' });
  await f.flow.generate('Nuevo mensaje', f.snapshot, true);
  assert.equal(f.view.payload.configured_mode, 'auto');
  assert.equal(f.view.payload.generation_trigger, 'automatic');
  assert.equal(f.view.requests, 1);
  assert.equal(f.view.state, 'success');
  assert.equal((await f.flow.generate('Incoming', f.snapshot, true)).state, 'success');
  assert.equal(f.view.requests, 2); // incoming fingerprint deduplication is owned by the detector/queue
});

test('opening a chat generates only for the latest incoming baseline message', () => {
  const baseline = contentSource.match(/onBaseline: \(\{ snapshot, lastIncoming \}\) => \{([\s\S]*?)\n      \},\n      onIncoming:/)?.[1] || '';
  assert.match(baseline, /if \(lastIncoming && SuggestionFlow\.isLatestIncoming\(snapshot, lastIncoming\.fingerprint\)/);
  assert.match(baseline, /queueAutomaticSuggestion\(\{ message: lastIncoming\.text/);
  assert.doesNotMatch(baseline, /snapshot\.messages\.forEach|\.map\(.*queueAutomaticSuggestion/);
  const queue = contentSource.match(/function queueAutomaticSuggestion\(payload\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(queue, /processedAutomaticKeys\.has\(key\)/);
  assert.match(queue, /pendingAutoPayloads\.set\(conversationKey/);
  assert.match(queue, /processedAutomaticKeys\.add\(item\.key\)/);
  assert.match(queue, /SuggestionFlow\.isLatestIncoming\(currentSnapshot, item\.fingerprint\)/);
  assert.match(queue, /abortPending\(\)/);
  assert.match(contentSource, /data\.mode\) \? data\.mode : 'auto'/);
  assert.match(contentSource, /processedAutomaticKeys/);
});

test('last own message is not a valid automatic target; emoji incoming remains a valid target', () => {
  const incoming = { direction: 'incoming', text: 'hello', fingerprint: 'in-1' };
  const outgoing = { direction: 'outgoing', text: 'my reply', fingerprint: 'out-1' };
  assert.equal(SuggestionFlow.isLatestIncoming({ messages: [incoming, outgoing] }, incoming.fingerprint), false);
  assert.equal(SuggestionFlow.isLatestIncoming({ messages: [incoming, { direction: 'unknown', text: 'unclassified row' }] }, incoming.fingerprint), false);
  const emoji = { direction: 'incoming', text: '😏😉', fingerprint: 'in-2' };
  assert.equal(SuggestionFlow.isLatestIncoming({ messages: [incoming, emoji] }, emoji.fingerprint), true);
  assert.equal(SuggestionFlow.latestIncoming({ messages: [incoming, emoji] }), emoji);
});

test('request keeps target and history separate and includes stable conversation identity', async () => {
  const snapshot = { conversationKey: 'chat-a', alias: 'Ana', messages: [
    { direction: 'incoming', text: 'Earlier?', fingerprint: 'old' },
    { direction: 'incoming', text: '😏😉', fingerprint: 'target' },
  ] };
  const f = fixture({ response: { conversation_id: 'chat-a', target_message_id: 'target', language: 'en', original_response: 'What do you mean? 🙂', spanish_translation: '¿Qué quieres decir? 🙂' } });
  await f.flow.generate('😏😉', snapshot, false, null, false, 'target');
  assert.equal(f.view.payload.target_message, '😏😉');
  assert.equal(f.view.payload.target_message_id, 'target');
  assert.equal(f.view.payload.conversation_id, 'chat-a');
  assert.equal(f.view.payload.conversation_history, '- Interlocutor: Earlier?');
});

test('manual request is discarded if a newer incoming target arrives before response', async () => {
  let resolve;
  let latest = 'incoming-1';
  const flow = new SuggestionFlow({
    getMode: () => 'manual', getConversationKey: () => 'chat-a',
    getLatestIncomingFingerprint: () => latest,
    request: () => new Promise((done) => { resolve = done; }),
    onSuccess: () => assert.fail('stale response must not render'),
  });
  const pending = flow.generate('first', { conversationKey: 'chat-a', messages: [] }, false, null, false, 'incoming-1');
  latest = 'incoming-2';
  resolve({ conversation_id: 'chat-a', target_message_id: 'incoming-1', language: 'en', original_response: 'Stale answer' });
  assert.equal((await pending).state, 'stale');
});

test('automatic requests are suppressed in manual mode', async () => {
  const f = fixture({ mode: 'manual' });
  assert.equal((await f.flow.generate('Incoming', f.snapshot, true)).state, 'ignored');
  assert.equal(f.view.requests, 0);
});

test('off mode does not make a request', async () => {
  const f = fixture({ mode: 'off' });
  assert.equal((await f.flow.generate('Hola', f.snapshot)).state, 'ignored');
  assert.equal(f.view.requests, 0);
});

test('backend original response and its translation are passed to the UI renderer', async () => {
  assert.match(contentSource, /loading\.textContent = 'Generando respuesta…'/);
  assert.match(contentSource, /addSuggestion\(originalResponse, spanishTranslation, language/);
  const f = fixture({ response: { language: 'fr', original_response: 'Réponse originale', spanish_translation: 'Respuesta original fiel.' } });
  await f.flow.generate('Hola', f.snapshot);
  assert.deepEqual(f.view.suggestions, ['Réponse originale']);
  assert.equal(f.view.translation, 'Respuesta original fiel.');
  assert.equal(f.view.language, 'fr');
});

test('backend error is surfaced and retry can succeed', async () => {
  assert.match(contentSource, /No se pudieron generar respuestas:[\s\S]*?Reintentar/);
  let fail = true;
  const f = fixture({ request: async () => { if (fail) throw new Error('503 LM Studio'); return { language: 'en', original_response: 'Recovered original', spanish_translation: 'Original recuperada' }; } });
  assert.equal((await f.flow.generate('Hola', f.snapshot)).state, 'error');
  fail = false;
  assert.equal((await f.flow.generate('Hola', f.snapshot)).state, 'success');
  assert.deepEqual(f.view.suggestions, ['Recovered original']);
});

test('structured FastAPI validation errors never render as [object Object]', async () => {
  const normalized = SuggestionFlow.normalizeApiError({
    detail: [{ loc: ['body', 'message'], msg: 'Field required', type: 'missing' }],
  }, 422);
  assert.match(normalized.message, /formato esperado/i);
  assert.doesNotMatch(normalized.message, /\[object Object\]|undefined|null/);
  assert.equal(normalized.code, 'invalid_request');
  assert.equal(normalized.httpStatus, 422);

  const f = fixture({ request: async () => { throw [{ msg: 'invalid' }]; } });
  assert.equal((await f.flow.generate('Hello', f.snapshot)).state, 'error');
  assert.doesNotMatch(f.view.error, /\[object Object\]|undefined|null/);
});

test('API error normalization distinguishes backend, LM Studio, HTTP, JSON, and validation failures', () => {
  const cases = [
    [{ error: { code: 'backend_unavailable_network', message: 'No se pudo conectar.' } }, null, 'backend_unavailable_network'],
    [{ error: { code: 'lm_studio_unavailable', message: 'LM Studio no responde.' } }, 503, 'lm_studio_unavailable'],
    [{ error: { code: 'http_error', message: 'HTTP error.' } }, 500, 'http_error'],
    [{ error: { code: 'invalid_json', message: 'JSON no válido.' } }, 502, 'invalid_json'],
    [{ error: { code: 'generation_validation_failed', message: 'Validación fallida.' } }, 502, 'generation_validation_failed'],
  ];
  for (const [body, status, code] of cases) {
    const error = SuggestionFlow.normalizeApiError(body, status);
    assert.equal(error.code, code);
    assert.ok(error.message);
    assert.doesNotMatch(error.message, /\[object Object\]|undefined|null/);
  }
});

test('manual regeneration requests one new original and replaces the displayed card', async () => {
  let version = 0;
  const f = fixture({ request: async () => {
    version++;
    return { language: 'en', original_response: `Original ${version}`, spanish_translation: `Traducción ${version}` };
  } });
  await f.flow.generate('Selected message', f.snapshot, false);
  await f.flow.generate('Selected message', f.snapshot, false);
  assert.equal(f.view.requests, 2);
  assert.equal(f.view.suggestions.at(-1), 'Original 2');
  assert.match(contentSource, /results\.querySelectorAll\?\.\('\.pcai-suggestion'\)\.forEach\(\(item\) => item\.remove\(\)\)/);
});

test('main manual action explains missing incoming context without making a request', async () => {
  assert.match(contentSource, /if \(!latestIncoming\) \{[\s\S]*?no se envió ninguna solicitud/);
  const f = fixture();
  const result = await f.flow.generate('', { ...f.snapshot, messages: [] });
  assert.equal(result.state, 'ignored');
  assert.equal(f.view.requests, 0);
});

test('same conversation message cannot trigger concurrent duplicate backend calls', async () => {
  let finish;
  const f = fixture({ mode: 'auto', latestIncomingFingerprint: 'msg-1', request: () => new Promise((resolve) => { finish = resolve; }) });
  const first = f.flow.generate('same incoming', f.snapshot, true, null, false, 'msg-1');
  const second = await f.flow.generate('same incoming', f.snapshot, true, null, false, 'msg-1');
  assert.equal(second.state, 'duplicate');
  assert.equal(f.view.requests, 1);
  finish({ language: 'es', original_response: 'Respuesta directa', spanish_translation: null });
  assert.equal((await first).state, 'success');
});

test('empty LM Studio response is rejected so the UI can show a retryable error', async () => {
  assert.match(contentSource, /No se pudieron generar respuestas:[\s\S]*?Reintentar/);
  const f = fixture({ response: { language: 'fr', original_response: '', spanish_translation: null, notice: 'Sin respuesta' } });
  assert.equal((await f.flow.generate('Hola', f.snapshot)).state, 'error');
  assert.equal(f.view.state, 'error');
  assert.match(f.view.error, /una respuesta original/);
});

test('flow accepts one original response and never treats its translation as another draft', async () => {
  const f = fixture({ response: { language: 'fr', original_response: 'Réponse unique.', spanish_translation: 'Respuesta única.' } });
  assert.equal((await f.flow.generate('Hola', f.snapshot)).count, 1);
  assert.deepEqual(f.view.suggestions, ['Réponse unique.']);
  assert.equal(f.view.translation, 'Respuesta única.');
});

test('Spanish original is not duplicated as a translation', async () => {
  const f = fixture({ response: { language: 'es', original_response: 'Me alegra leerte.', spanish_translation: 'Me alegra leerte.' } });
  await f.flow.generate('Hola', f.snapshot);
  assert.equal(f.view.suggestions.length, 1);
  assert.equal(f.view.translation, '');
  assert.match(contentSource, /if \(language !== 'es'\)/);
});

test('copy action uses only the editable original and translation is rendered as secondary text', () => {
  assert.match(contentSource, /navigator\.clipboard\.writeText\(edit\.value\)/);
  assert.match(contentSource, /translationHeading\.textContent = 'Traducción al español'/);
  assert.match(contentSource, /copy\.textContent = 'Copiar respuesta'/);
  assert.match(contentSource, /Respuesta sugerida ·/);
});

test('translation retry uses a separate API request and never changes what the copy button copies', () => {
  assert.match(contentSource, /api\('\/api\/translation\/retry'/);
  assert.match(contentSource, /retryTranslation\.textContent = 'Reintentar traducción'/);
  assert.match(contentSource, /outcome\.spanish_translation/);
  assert.match(contentSource, /navigator\.clipboard\.writeText\(edit\.value\)/);
  assert.match(contentSource, /translation_failure_reason/);
});

test('explicit initial suggestion is labeled separately from new-message generation', async () => {
  const f = fixture({ mode: 'auto' });
  await f.flow.generate('Latest existing incoming', f.snapshot, true, null, true);
  assert.equal(f.view.initial, true);
});

test('closing the floating panel does not stop an enabled detector', () => {
  const closePanel = contentSource.match(/function setPanelOpen\(open\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(closePanel, /detector\?\.scan\(\)/);
  assert.doesNotMatch(closePanel, /detector\?\.stop\(\)/);
});

test('automatic mode and processed message keys persist and selectors revalidate after restart', () => {
  assert.match(contentSource, /get\(\['backendUrl',[^\]]*'mode',[^\]]*'selectors',[^\]]*'processedAutomaticKeys'/);
  assert.match(contentSource, /if \(mode === 'auto' && verifiedSelectorSignature !== JSON\.stringify\(selectors\)\) \{\s*const report = detector\.diagnose\(\)/);
  assert.match(contentSource, /detector\.start\(\)/);
});

test('automatic diagnostic shows event, observer, counts, HTTP, and LM result without chat text', () => {
  for (const field of ['Observador del DOM:', 'Último evento:', 'Mensajes:', 'Última petición backend:', 'Último resultado LM Studio:']) {
    assert.ok(contentSource.includes(field));
  }
  assert.match(contentSource, /autoDiagnostic\.lastIncoming/);
  assert.doesNotMatch(contentSource.slice(contentSource.indexOf('function renderAutoDiagnostic'), contentSource.indexOf('suggestionFlow = new SuggestionFlow')), /\.text\}/);
});

test('response from previous conversation is discarded', async () => {
  let resolve;
  const f = fixture({ request: () => new Promise((r) => { resolve = r; }) });
  const pending = f.flow.generate('Hola', f.snapshot);
  f.setConversation('chat-b');
  resolve({ language: 'en', original_response: 'Stale response', spanish_translation: 'Respuesta obsoleta' });
  assert.equal((await pending).state, 'stale');
  assert.deepEqual(f.view.suggestions, []);
});

test('response carrying a different conversation identifier is discarded', async () => {
  const f = fixture({ response: { api_version: '1.0', conversation_id: 'chat-old', generation_id: 'gen-1', language: 'en', original_response: 'Stale', spanish_translation: 'Obsoleta' } });
  assert.equal((await f.flow.generate('Hello', f.snapshot)).state, 'stale');
  assert.deepEqual(f.view.suggestions, []);
});

test('rendering exceptions are reported separately from backend failures', async () => {
  const f = fixture();
  f.flow.onSuccess = () => { throw new Error('DOM unavailable'); };
  assert.equal((await f.flow.generate('Hello', f.snapshot)).state, 'error');
  assert.match(f.view.error, /no se pudo mostrar/i);
});

test('irrelevant DOM updates do not clear already rendered suggestions', async () => {
  assert.match(contentSource, /if \(conversationChanged\) \{[\s\S]*?results\.replaceChildren\(\);/);
  const f = fixture();
  await f.flow.generate('Hola', f.snapshot);
  const before = [...f.view.suggestions];
  // Snapshot refresh with the same conversation key models an irrelevant DOM mutation.
  await f.flow.generate('', { ...f.snapshot, messages: [{ direction: 'incoming', text: 'metadata refresh' }] });
  assert.deepEqual(f.view.suggestions, before);
});

test('context is labeled, chronological, deduplicated, bounded, and excludes the target incoming message', () => {
  const snapshot = { messages: [
    { direction: 'incoming', text: '¿Cómo estás?', time: '10:01', fingerprint: 'a' },
    { direction: 'outgoing', text: 'Bien, gracias', time: '10:02', fingerprint: 'b' },
    { direction: 'incoming', text: '¿Cómo estás?', time: '10:01', fingerprint: 'a' },
    { direction: 'incoming', text: '¿Y tú?', time: '10:03', fingerprint: 'c' },
  ] };
  const context = SuggestionFlow.prepareContext(snapshot, '¿Y tú?', { targetFingerprint: 'c', windowSize: 8, maxChars: 200 });
  assert.equal(context, '- Interlocutor (10:01): ¿Cómo estás?\n- Usuario (10:02): Bien, gracias');
  assert.ok(context.length <= 200);
});

test('system notices are excluded from target selection and conversational context', () => {
  const snapshot = { messages: [
    { direction: 'incoming', text: 'Hello', fingerprint: 'in-1' },
    { direction: 'system', text: 'Gift notification', fingerprint: 'system-1' },
    { direction: 'outgoing', text: 'Hi there', fingerprint: 'out-1' },
    { direction: 'incoming', text: 'How are you?', fingerprint: 'in-2' },
    { direction: 'system', text: 'Translation available', fingerprint: 'system-2' },
  ] };
  assert.equal(SuggestionFlow.latestConversationMessage(snapshot).fingerprint, 'in-2');
  assert.equal(SuggestionFlow.isLatestIncoming(snapshot, 'in-2'), true);
  assert.equal(SuggestionFlow.prepareContext(snapshot, 'How are you?', { targetFingerprint: 'in-2' }), '- Interlocutor: Hello\n- Usuario: Hi there');
});

test('context diagnostics count visible DOM rows, direction, selected window and character clipping without cutting a row', () => {
  const messages = [
    { direction: 'incoming', text: 'older reference', fingerprint: 'a' },
    { direction: 'outgoing', text: 'own reply', fingerprint: 'b' },
    { direction: 'incoming', text: 'latest target', fingerprint: 'c' },
  ];
  const details = SuggestionFlow.prepareContextDetails(
    { counts: { total: 4, incoming: 2, outgoing: 1 }, messages },
    'latest target', { targetFingerprint: 'c', windowSize: 1, maxChars: 200 },
  );
  assert.equal(details.extractedCount, 4);
  assert.equal(details.extractedIncomingCount, 2);
  assert.equal(details.extractedOutgoingCount, 1);
  assert.equal(details.truncatedByWindow, true);
  assert.equal(details.context, '- Usuario: own reply');
  assert.equal(details.includedCount, 1);
  const clipped = SuggestionFlow.prepareContextDetails(
    { messages: [{ direction: 'incoming', text: 'long '.repeat(50), fingerprint: 'x' }] },
    'target', { windowSize: 8, maxChars: 25 },
  );
  assert.equal(clipped.context, '');
  assert.equal(clipped.truncatedByCharacters, true);
});

test('manual extra context and extraction metadata are sent with a suggestion request', async () => {
  const f = fixture();
  f.snapshot.counts = { total: 3, incoming: 2, outgoing: 1 };
  f.snapshot.messages = [
    { direction: 'incoming', text: 'Earlier reference', fingerprint: 'a' },
    { direction: 'outgoing', text: 'My earlier reply', fingerprint: 'b' },
    { direction: 'incoming', text: 'Latest question', fingerprint: 'c' },
  ];
  await f.flow.generate('Latest question', f.snapshot, false, 'Ana', false, 'c', true,
    '- Interlocutor: we talked about the blue dress');
  assert.equal(f.view.payload.dom_extracted_message_count, 3);
  assert.equal(f.view.payload.dom_extracted_incoming_count, 2);
  assert.equal(f.view.payload.dom_extracted_outgoing_count, 1);
  assert.match(f.view.payload.context, /Usuario: My earlier reply/);
  assert.equal(f.view.payload.additional_context, '- Interlocutor: we talked about the blue dress');
});

test('timestamps normalize clock and ISO values', () => {
  assert.equal(SuggestionFlow.normalizeTimestamp('9:04:33'), '09:04');
  assert.match(SuggestionFlow.normalizeTimestamp('2025-01-02T15:04:00Z'), /^\d{1,2}:\d{2}/);
});

test('context window selection is passed to the request and caps history', async () => {
  const f = fixture();
  f.flow.getContextWindow = () => 1;
  const snapshot = { ...f.snapshot, messages: [
    { direction: 'incoming', text: 'uno', fingerprint: '1' },
    { direction: 'outgoing', text: 'dos', fingerprint: '2' },
    { direction: 'incoming', text: 'tres', fingerprint: '3' },
  ] };
  await f.flow.generate('tres', snapshot, false, null, false, '3');
  assert.equal(f.view.payload.context, '- Usuario: dos');
});

test('large context stays below its character budget and selected message count', () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({
    direction: index % 2 ? 'outgoing' : 'incoming',
    text: `fila-${index} ${'x'.repeat(1500)}`,
    fingerprint: `row-${index}`,
  }));
  messages.push({ direction: 'incoming', text: 'objetivo', fingerprint: 'target' });
  const context = SuggestionFlow.prepareContext(
    { messages }, 'objetivo', { targetFingerprint: 'target', windowSize: 8, maxChars: 6000 },
  );
  assert.ok(context.length <= 6000);
  assert.ok(context.split('\n').length <= 8);
  assert.doesNotMatch(context, /objetivo/);
});

test('original response stays exact for copy and result headings do not embed conversation text', () => {
  assert.match(contentSource, /navigator\.clipboard\.writeText\(edit\.value\)/);
  assert.match(contentSource, /Respuesta sugerida ·/);
  assert.doesNotMatch(contentSource, /addSuggestion\(text,[\s\S]{0,300}messageText/);
});

test('context disclosure is collapsed by default and limits selectable history size', () => {
  assert.match(contentSource, /<details id="pcai-context-details"/);
  assert.match(contentSource, /<summary>Ver contexto<\/summary>/);
  assert.match(contentSource, /let contextWindow = 100/);
  assert.match(contentSource, /value="100" selected>100 mensajes/);
  assert.match(contentSource, /contextSettingsVersion < 3/);
  assert.match(contentSource, /contextSettingsVersion: 3/);
  assert.match(contentSource, /<details class="pcai-advanced-shell"><summary>Opciones avanzadas<\/summary>/);
  assert.doesNotMatch(contentSource, /<footer>Solo prepara borradores/);
});
