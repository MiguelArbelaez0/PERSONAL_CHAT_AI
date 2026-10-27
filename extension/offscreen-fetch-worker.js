/* Dedicated worker keeps long local HTTP waits outside the MV3 service worker. */
(() => {
  'use strict';

  const MAX_RESPONSE_BYTES = 512 * 1024;
  let activeRequest = null;

  async function readBoundedBody(response) {
    const advertised = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertised) && advertised > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('response_too_large');
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(joined);
  }

  self.onmessage = async (event) => {
    const request = event.data;
    if (request?.type === 'CANCEL') {
      activeRequest?.controller.abort();
      return;
    }
    if (!request || typeof request.requestId !== 'string' || activeRequest) return;
    const controller = new AbortController();
    activeRequest = { requestId: request.requestId, controller };
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: request.method, headers: request.headers, body: request.body,
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        mode: 'cors', referrerPolicy: 'no-referrer',
      });
      const bodyText = await readBoundedBody(response);
      self.postMessage({
        type: 'RESULT', requestId: request.requestId, status: response.status,
        httpOk: response.ok, contentLength: Number(response.headers.get('content-length')) || null, bodyText,
      });
    } catch (error) {
      const errorCode = error?.message === 'response_too_large' ? 'response_too_large'
        : (timedOut || error?.name === 'AbortError' ? 'request_timeout_or_cancelled' : 'backend_unavailable_network');
      self.postMessage({ type: 'ERROR', requestId: request.requestId, errorCode });
    } finally {
      clearTimeout(timeout);
      activeRequest = null;
    }
  };
})();
