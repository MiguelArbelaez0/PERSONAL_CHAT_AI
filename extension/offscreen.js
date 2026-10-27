/* Restricted bridge that hosts one dedicated worker per long local AI request. */
(() => {
  'use strict';

  const MAX_BODY_BYTES = 64 * 1024;
  const MAX_RESPONSE_BYTES = 512 * 1024;
  const MAX_TIMEOUT_MS = 280_000;
  const ALLOWED_PATHS = new Set(['/api/suggestions', '/api/translation/retry']);
  const REQUEST_ID = /^[a-zA-Z0-9._:-]{1,160}$/;
  const requests = new Map();

  const byteLength = (value) => new TextEncoder().encode(value).length;
  const plainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === null || Object.prototype.toString.call(value) === '[object Object]'));
  const exactKeys = (value, required) => plainObject(value)
    && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key));
  const workerSender = (sender) => sender?.id === chrome.runtime.id
    && sender.url === chrome.runtime.getURL('background.js');

  function validateRequest(message) {
    if (!exactKeys(message, ['target', 'type', 'requestId', 'request']) || message.target !== 'pcai-offscreen'
      || message.type !== 'FETCH' || typeof message.requestId !== 'string' || !REQUEST_ID.test(message.requestId)
      || !exactKeys(message.request, ['url', 'method', 'headers', 'body', 'timeoutMs'])) return false;
    const request = message.request;
    let url;
    try { url = new URL(request.url); } catch (_) { return false; }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password
      || url.search || url.hash || !ALLOWED_PATHS.has(url.pathname) || request.method !== 'POST') return false;
    if (typeof request.body !== 'string' || byteLength(request.body) > MAX_BODY_BYTES
      || !Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > MAX_TIMEOUT_MS) return false;
    if (!plainObject(request.headers) || Object.keys(request.headers).some((key) => !['Content-Type', 'Authorization'].includes(key))) return false;
    return request.headers['Content-Type'] === 'application/json'
      && typeof request.headers.Authorization === 'string'
      && /^Bearer [A-Za-z0-9._~+/-]{32,256}$/.test(request.headers.Authorization);
  }

  function finish(requestId, result) {
    const record = requests.get(requestId);
    if (!record || record.finished) return;
    record.finished = true;
    requests.delete(requestId);
    record.worker.terminate();
    record.sendResponse(result);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!workerSender(sender) || !plainObject(message) || message.target !== 'pcai-offscreen') return undefined;
    if (message.type === 'CANCEL' && exactKeys(message, ['target', 'type', 'requestId'])
      && typeof message.requestId === 'string' && REQUEST_ID.test(message.requestId)) {
      const record = requests.get(message.requestId);
      if (record) record.worker.postMessage({ type: 'CANCEL' });
      sendResponse({ ok: true });
      return false;
    }
    if (!validateRequest(message) || requests.has(message.requestId)) {
      sendResponse({ ok: false, errorCode: 'offscreen_request_rejected' });
      return false;
    }

    const worker = new Worker(chrome.runtime.getURL('offscreen-fetch-worker.js'));
    const record = { worker, sendResponse, finished: false };
    requests.set(message.requestId, record);
    worker.onmessage = (event) => {
      const result = event.data;
      if (!plainObject(result) || result.requestId !== message.requestId) {
        finish(message.requestId, { ok: false, errorCode: 'offscreen_request_failed' });
        return;
      }
      if (result.type === 'ERROR') {
        const allowedErrors = new Set(['request_timeout_or_cancelled', 'response_too_large']);
        finish(message.requestId, { ok: false, errorCode: allowedErrors.has(result.errorCode) ? result.errorCode : 'backend_unavailable_network' });
        return;
      }
      if (result.type !== 'RESULT' || !Number.isInteger(result.status) || result.status < 100 || result.status > 599
        || typeof result.httpOk !== 'boolean' || typeof result.bodyText !== 'string'
        || byteLength(result.bodyText) > MAX_RESPONSE_BYTES
        || (result.contentLength != null && (!Number.isInteger(result.contentLength) || result.contentLength < 0 || result.contentLength > MAX_RESPONSE_BYTES))) {
        finish(message.requestId, { ok: false, errorCode: 'response_too_large' });
        return;
      }
      finish(message.requestId, {
        ok: true, status: result.status, httpOk: result.httpOk,
        contentLength: result.contentLength, bodyText: result.bodyText,
      });
    };
    worker.onerror = () => finish(message.requestId, { ok: false, errorCode: 'backend_unavailable_network' });
    worker.postMessage({ requestId: message.requestId, ...message.request });
    return true;
  });
})();
