/* Conservative, read-only detection of the authenticated identity in Stripchat's global header. */
(() => {
  const ACCOUNT_MARKER = /(?:account|profile|user(?:-menu)?|cuenta|perfil|usuario)/i;
  const CHAT_MARKER = /(?:chat|messenger|conversation|message-list|pcai-root)/i;
  const NAME_ATTRIBUTES = ['data-account-name', 'data-username', 'data-user-name', 'data-profile-name'];
  const ID_ATTRIBUTES = ['data-account-id', 'data-user-id', 'data-profile-id'];

  function attr(element, name) {
    const value = element?.getAttribute?.(name);
    if (typeof value === 'string' && value.trim()) return value.trim();
    const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const fromDataset = element?.dataset?.[key];
    return typeof fromDataset === 'string' && fromDataset.trim() ? fromDataset.trim() : '';
  }

  function cleanName(value) {
    let name = String(value || '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^(?:open|show|view|abrir|mostrar|ver)\s+/i, '');
    name = name.replace(/^(?:my|mi)\s+/i, '');
    name = name.replace(/^(?:account|profile|user|cuenta|perfil|usuario)(?:\s+(?:menu|menú))?\s+(?:for|of|de|para)\s+/i, '');
    name = name.replace(/^(?:account|profile|user|cuenta|perfil|usuario)(?:\s+(?:menu|menú))?\s*[:\-–]?\s*/i, '');
    name = name.replace(/\s+(?:account|profile|user|cuenta|perfil|usuario)\s+(?:menu|menú)$/i, '').trim();
    if (!name || /^(?:account|profile|user|cuenta|perfil|usuario|avatar|profile picture)$/i.test(name)) return '';
    if (name.length > 80 || /[\r\n\u0000-\u001f]/.test(name)) return '';
    return name;
  }

  function isChatElement(element) {
    for (let current = element; current; current = current.parentElement) {
      const marker = `${current.id || ''} ${typeof current.className === 'string' ? current.className : ''} ${attr(current, 'data-testid')}`;
      if (CHAT_MARKER.test(marker)) return true;
    }
    return false;
  }

  function isGlobalHeader(header) {
    if (!header || isChatElement(header)) return false;
    return header.matches?.('header, [role="banner"]') !== false;
  }

  function hrefName(element) {
    const href = attr(element, 'href');
    if (!href) return '';
    try {
      const path = new URL(href, 'https://stripchat.com').pathname;
      const match = path.match(/^\/(?:profile|profiles|users|models?)\/([^/]+)\/?$/i);
      if (!match) return '';
      return cleanName(decodeURIComponent(match[1]).replace(/[-_]+/g, ' '));
    } catch (_) { return ''; }
  }

  function candidateFor(element) {
    const testId = attr(element, 'data-testid');
    const label = attr(element, 'aria-label') || attr(element, 'title');
    const labelledAccount = ACCOUNT_MARKER.test(`${testId} ${label}`);
    const names = NAME_ATTRIBUTES.map((key) => cleanName(attr(element, key))).filter(Boolean);
    if (label) names.push(cleanName(label));
    const image = element.querySelector?.('img[alt]');
    if (image) names.push(cleanName(attr(image, 'alt')));
    const text = cleanName(element.textContent || '');
    if (labelledAccount && text && text.length <= 80) names.push(text);
    if (labelledAccount) names.push(hrefName(element));
    const name = [...new Set(names.filter(Boolean))];
    const platformUserId = ID_ATTRIBUTES.map((key) => attr(element, key)).find(Boolean) || '';
    const markedIdentity = labelledAccount || Boolean(platformUserId && (name.length || hrefName(element)));
    if (!markedIdentity || name.length !== 1) return null;
    return { artistName: name[0], platformUserId: platformUserId || null, identitySource: 'dom' };
  }

  function detectAccount(documentObject) {
    const headers = [...(documentObject?.querySelectorAll?.('header, [role="banner"]') || [])].filter(isGlobalHeader);
    const candidates = new Map();
    for (const header of headers) {
      const nodes = [header, ...(header.querySelectorAll?.('[data-testid], [aria-label], [title], [data-account-name], [data-username], [data-user-name], [data-profile-name], [data-account-id], [data-user-id], [data-profile-id], a[href]') || [])];
      for (const node of nodes) {
        if (!node || isChatElement(node)) continue;
        const candidate = candidateFor(node);
        if (!candidate) continue;
        const key = candidate.platformUserId ? `id:${candidate.platformUserId}` : `name:${candidate.artistName.toLocaleLowerCase()}`;
        const current = candidates.get(key);
        if (!current || (!current.platformUserId && candidate.platformUserId)) candidates.set(key, candidate);
      }
    }
    const found = [...candidates.values()];
    if (found.length === 1) return { status: 'candidate', ...found[0], candidateCount: 1 };
    if (found.length > 1) return { status: 'ambiguous', candidates: found, candidateCount: found.length };
    return { status: 'unavailable', candidates: [], candidateCount: 0 };
  }

  function observeAccount(documentObject, onChange, MutationObserverClass = globalThis.MutationObserver) {
    let stopped = false;
    let timer = null;
    let previousKey = null;
    const scan = () => {
      if (stopped) return;
      const result = detectAccount(documentObject);
      const key = result.status === 'candidate'
        ? `${result.platformUserId || ''}\u001f${result.artistName.toLocaleLowerCase()}`
        : result.status;
      if (key !== previousKey) {
        previousKey = key;
        onChange(result);
      }
    };
    const observer = MutationObserverClass && documentObject?.documentElement
      ? new MutationObserverClass(() => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; scan(); }, 350);
      }) : null;
    observer?.observe(documentObject.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'title', 'href', 'data-testid', 'data-user-id', 'data-account-id', 'data-username'] });
    scan();
    return {
      scan,
      stop() {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        observer?.disconnect();
      },
    };
  }

  const api = { detectAccount, observeAccount };
  globalThis.PCAIAccountDetector = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
