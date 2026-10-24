/* Shared loopback URL validation and migration for the local FastAPI backend. */
(() => {
  const DEFAULT_URL = 'http://127.0.0.1:8000';
  const LEGACY_DEFAULT_URL = 'http://127.0.0.1:8765';

  function normalizeBackendUrl(raw) {
    let url;
    try { url = new URL(String(raw || DEFAULT_URL)); }
    catch (_) { throw new Error('La URL debe ser válida y usar http://127.0.0.1:PUERTO.'); }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
      || !['', '/'].includes(url.pathname) || url.search || url.hash) {
      throw new Error('La URL del backend debe ser local: http://127.0.0.1:PUERTO');
    }
    return url.origin;
  }

  function resolveStoredBackendUrl(raw) {
    if (!raw) return { url: DEFAULT_URL, migrated: false };
    let normalized;
    try { normalized = normalizeBackendUrl(raw); }
    catch (error) {
      // Earlier releases accepted these loopback spellings, though Chrome's
      // declared host permission did not necessarily cover them.
      try {
        const legacy = new URL(String(raw));
        const oldLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(legacy.hostname);
        if (oldLoopback && legacy.protocol === 'http:' && legacy.port === '8765'
          && !legacy.username && !legacy.password && ['', '/'].includes(legacy.pathname) && !legacy.search && !legacy.hash) {
          return { url: DEFAULT_URL, migrated: true };
        }
      } catch (_) { /* Preserve the invalid value; the caller uses the safe default. */ }
      throw error;
    }
    if (normalized === LEGACY_DEFAULT_URL) return { url: DEFAULT_URL, migrated: true };
    return { url: normalized, migrated: false };
  }

  function isCoveredByHostPermissions(raw, patterns) {
    const url = new URL(normalizeBackendUrl(raw));
    return (Array.isArray(patterns) ? patterns : []).some((pattern) => {
      const match = String(pattern).match(/^http:\/\/([^/]+)\/\*$/i);
      if (!match) return false;
      let permission;
      try { permission = new URL(`http://${match[1]}/`); }
      catch (_) { return false; }
      return permission.hostname === url.hostname && (!permission.port || permission.port === url.port);
    });
  }

  const api = { DEFAULT_URL, LEGACY_DEFAULT_URL, normalizeBackendUrl, resolveStoredBackendUrl, isCoveredByHostPermissions };
  globalThis.PCAIBackendConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
