/* Conservative, read-only detection of the authenticated identity in Stripchat's global header. */
(() => {
  const ACCOUNT_MARKER = /(?:account|profile|user(?:-menu)?|cuenta|perfil|usuario)/i;
  const CHAT_MARKER = /(?:chat|messenger|conversation|message-list|pcai-root)/i;
  const NAME_ATTRIBUTES = ['data-account-name', 'data-username', 'data-user-name', 'data-profile-name'];
  const ID_ATTRIBUTES = ['data-account-id', 'data-user-id', 'data-profile-id'];
  // Observed in the authenticated model header by the user in Stripchat DevTools.
  const MODEL_HEADER_NAME_ID = /^user-levels-name-(\d+)-headerUserMenu$/i;
  const PROFILE_AVATAR_ALT_PREFIXES = [
    /^foto de perfil de\s+(.+)$/i,
    /^foto del perfil de\s+(.+)$/i,
    /^profile picture of\s+(.+)$/i,
    /^profile photo of\s+(.+)$/i,
    /^photo de profil de\s+(.+)$/i,
    /^foto do perfil de\s+(.+)$/i,
    /^foto del profilo di\s+(.+)$/i,
    /^profilbild von\s+(.+)$/i,
  ];

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

  function nameFromProfileAvatarAlt(value) {
    const alt = String(value || '').replace(/\s+/g, ' ').trim();
    for (const pattern of PROFILE_AVATAR_ALT_PREFIXES) {
      const match = alt.match(pattern);
      if (match) return cleanName(match[1]);
    }
    return '';
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

  function candidateFor(element) {
    const modelHeaderMatch = MODEL_HEADER_NAME_ID.exec(String(element?.id || ''));
    const isObservedModelHeaderName = Boolean(modelHeaderMatch
      && String(element.tagName || '').toLocaleLowerCase() === 'span'
      && String(element.className || '').split(/\s+/).includes('user-levels-username-text'));
    const testId = attr(element, 'data-testid');
    const label = attr(element, 'aria-label') || attr(element, 'title');
    const labelledAccount = ACCOUNT_MARKER.test(`${testId} ${label}`);
    const names = NAME_ATTRIBUTES.map((key) => cleanName(attr(element, key))).filter(Boolean);
    if (label && !isObservedModelHeaderName) names.push(cleanName(label));
    const image = element.querySelector?.('img[alt]');
    if (image) names.push(cleanName(attr(image, 'alt')));
    const text = cleanName(element.textContent || '');
    if (isObservedModelHeaderName && text) names.push(text);
    if (labelledAccount && text && text.length <= 80) names.push(text);
    const name = [...new Set(names.filter(Boolean))];
    const platformIds = ID_ATTRIBUTES.map((key) => attr(element, key)).filter(Boolean);
    if (isObservedModelHeaderName) platformIds.push(modelHeaderMatch[1]);
    const uniquePlatformIds = [...new Set(platformIds)];
    const markedIdentity = labelledAccount || isObservedModelHeaderName || Boolean(uniquePlatformIds.length && name.length);
    if (markedIdentity && (name.length > 1 || uniquePlatformIds.length > 1)) return { ambiguous: true };
    if (!markedIdentity || name.length !== 1) return null;
    return { artistName: name[0], platformUserId: uniquePlatformIds[0] || null, identitySource: 'dom' };
  }

  function classHas(element, className) {
    return String(typeof element?.className === 'string' ? element.className : '').split(/\s+/).includes(className);
  }

  function addCandidate(candidates, candidate) {
    const normalizedName = candidate.artistName.toLocaleLowerCase();
    const sameId = candidate.platformUserId
      ? candidates.find((item) => item.platformUserId === candidate.platformUserId)
      : null;
    const sameName = candidates.find((item) => item.artistName.toLocaleLowerCase() === normalizedName);
    const current = sameId || sameName;
    if (current) {
      if (current.artistName.toLocaleLowerCase() !== normalizedName
        || (current.platformUserId && candidate.platformUserId && current.platformUserId !== candidate.platformUserId)) return false;
      if (!current.platformUserId && candidate.platformUserId) current.platformUserId = candidate.platformUserId;
      return true;
    }
    candidates.push({ ...candidate });
    return true;
  }

  function detectAccount(documentObject) {
    const headers = [...(documentObject?.querySelectorAll?.('header, [role="banner"]') || [])].filter(isGlobalHeader);
    const observedModelNames = [...(documentObject?.querySelectorAll?.('[id^="user-levels-name-"][id$="-headerUserMenu"]') || [])]
      .filter((node) => MODEL_HEADER_NAME_ID.test(String(node?.id || '')));
    const nodes = new Set(observedModelNames);
    for (const header of headers) {
      nodes.add(header);
      for (const node of header.querySelectorAll?.('[data-testid], [aria-label], [title], [data-account-name], [data-username], [data-user-name], [data-profile-name], [data-account-id], [data-user-id], [data-profile-id], [id^="user-levels-name-"][id$="-headerUserMenu"], a[href]') || []) nodes.add(node);
    }
    const candidates = [];
    let contradictoryIdentity = false;

    // Observed global authenticated-model header: its hidden dropdown still contains
    // the account name while closed. Never use the profile link's URL as identity.
    const authenticatedHeaders = [...(documentObject?.querySelectorAll?.('.header-top.is-model-user') || [])]
      .filter((node) => classHas(node, 'header-top') && classHas(node, 'is-model-user'));
    let authenticatedNameNodeCount = 0;
    let authenticatedAvatarCount = 0;
    let rejectedAvatarAltCount = 0;
    for (const header of authenticatedHeaders) {
      const menuNames = [...(header.querySelectorAll?.('.user-menu-username') || [])]
        .map((node) => cleanName(node.textContent || node.innerText || ''))
        .filter(Boolean);
      authenticatedNameNodeCount += menuNames.length;
      const avatarNames = [];
      for (const link of header.querySelectorAll?.('.dropdown-link') || []) {
        if (String(link.tagName || '').toLocaleLowerCase() !== 'a') continue;
        const images = [...(link.querySelectorAll?.('img[alt]') || [])];
        authenticatedAvatarCount += images.length;
        for (const image of images) {
          const name = nameFromProfileAvatarAlt(attr(image, 'alt'));
          if (name) avatarNames.push(name);
          else if (attr(image, 'alt')) rejectedAvatarAltCount++;
        }
      }
      const distinctNames = [...new Set([...menuNames, ...avatarNames])];
      if (distinctNames.length > 1) { contradictoryIdentity = true; continue; }
      if (!distinctNames.length) continue;
      const stableHeaderId = [...(header.querySelectorAll?.('[id^="user-levels-name-"][id$="-headerUserMenu"]') || [])]
        .map((node) => candidateFor(node)).find((candidate) => candidate && !candidate.ambiguous);
      if (!addCandidate(candidates, {
        artistName: distinctNames[0], platformUserId: stableHeaderId?.platformUserId || null,
        identitySource: 'authenticated-header',
      })) contradictoryIdentity = true;
    }

    // On a profile page, an editable avatar and its adjacent observed name identify
    // the owner profile. The name alone is not sufficient and URL segments are ignored.
    const profileRoots = [...(documentObject?.querySelectorAll?.('.left-wrapper') || [])]
      .filter((root) => classHas(root, 'left-wrapper') && root.querySelector?.('.user-avatar-editable'));
    for (const root of profileRoots) {
      const profileNames = [...(root.querySelectorAll?.('.username-panel__name') || [])]
        .map((node) => cleanName(node.textContent || node.innerText || ''))
        .filter(Boolean);
      const distinctNames = [...new Set(profileNames)];
      if (distinctNames.length !== 1) { contradictoryIdentity = true; continue; }
      if (!addCandidate(candidates, {
        artistName: distinctNames[0], platformUserId: null, identitySource: 'editable-own-profile',
      })) contradictoryIdentity = true;
    }

    for (const node of nodes) {
      if (!node) continue;
      const ownHeaderSignal = MODEL_HEADER_NAME_ID.test(String(node.id || ''));
      if (!ownHeaderSignal && isChatElement(node)) continue;
      const candidate = candidateFor(node);
      if (candidate?.ambiguous) { contradictoryIdentity = true; continue; }
      if (!candidate) continue;
      if (!addCandidate(candidates, candidate)) contradictoryIdentity = true;
    }
    const found = candidates;
    const diagnostics = {
      semanticHeaderCount: headers.length,
      observedOpenMenuNameCount: observedModelNames.length,
      authenticatedHeaderCount: authenticatedHeaders.length,
      authenticatedMenuNameCount: authenticatedNameNodeCount,
      authenticatedAvatarCount,
      rejectedAvatarAltCount,
      ownEditableProfileCount: profileRoots.length,
    };
    if (contradictoryIdentity) return { status: 'ambiguous', candidates: found, candidateCount: Math.max(2, found.length), diagnostics };
    if (found.length === 1) return { status: 'candidate', ...found[0], candidateCount: 1, diagnostics };
    if (found.length > 1) return { status: 'ambiguous', candidates: found, candidateCount: found.length, diagnostics };
    const reason = authenticatedHeaders.length
      ? (authenticatedAvatarCount && rejectedAvatarAltCount ? 'authenticated_avatar_alt_unrecognized' : 'authenticated_name_not_in_dom')
      : 'no_authenticated_identity_signal';
    return {
      status: 'unavailable', candidates: [], candidateCount: 0, reason,
      diagnostics: {
        ...diagnostics,
      },
    };
  }

  function observeAccount(documentObject, onChange, MutationObserverClass = globalThis.MutationObserver) {
    let stopped = false;
    let timer = null;
    let previousKey = null;
    const scan = () => {
      if (stopped) return;
      const result = detectAccount(documentObject);
      const key = result.status === 'candidate'
        ? `${result.platformUserId || ''}\u001f${result.identitySource || ''}\u001f${result.artistName.toLocaleLowerCase()}`
        : result.status === 'unavailable'
          ? `${result.status}\u001f${result.reason || ''}\u001f${result.diagnostics?.authenticatedHeaderCount || 0}\u001f${result.diagnostics?.authenticatedAvatarCount || 0}\u001f${result.diagnostics?.ownEditableProfileCount || 0}`
          : `${result.status}\u001f${result.candidateCount || 0}`;
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
    observer?.observe(documentObject.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-label', 'title', 'alt', 'href', 'data-testid', 'data-user-id', 'data-account-id', 'data-username'] });
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
