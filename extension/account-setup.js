/* Small account/onboarding contract helpers shared by the panel and deterministic tests. */
(() => {
  const SECTION_FOR_STEP = Object.freeze({
    3: 'personality', 4: 'interests', 5: 'visitor_types', 6: 'response_style', 7: 'personal_boundaries',
  });

  function matchDetectedAccount(accounts, detection) {
    const list = Array.isArray(accounts) ? accounts : [];
    if (detection?.status !== 'candidate' || !String(detection.artistName || '').trim()) {
      return { status: detection?.status === 'ambiguous' ? 'ambiguous' : 'manual_required', account: null, candidates: [] };
    }
    const artistName = String(detection.artistName).trim();
    if (detection.platformUserId) {
      const matches = list.filter((account) => account.platform === 'stripchat' && account.platform_user_id === detection.platformUserId);
      if (matches.length === 1) return { status: 'platform_match', account: matches[0], candidates: matches };
      if (matches.length > 1) return { status: 'ambiguous', account: null, candidates: matches };
      const sameName = list.filter((account) => account.artist_name?.trim().toLocaleLowerCase() === artistName.toLocaleLowerCase());
      return { status: sameName.length ? 'name_collision' : 'new_account', account: null, candidates: sameName };
    }
    const sameName = list.filter((account) => account.platform === 'stripchat' && account.artist_name?.trim().toLocaleLowerCase() === artistName.toLocaleLowerCase());
    if (sameName.length === 1) return { status: 'confirm_existing', account: sameName[0], candidates: sameName };
    if (sameName.length > 1) return { status: 'ambiguous', account: null, candidates: sameName };
    return { status: 'new_account', account: null, candidates: [] };
  }

  function profileIsReady(snapshot) {
    return Boolean(snapshot?.account?.confirmed && snapshot.account.artist_name && snapshot.onboarding_complete
      && snapshot.active_id && snapshot.profiles?.some((profile) => profile.id === snapshot.active_id && profile.onboarding_complete));
  }

  function sectionsThroughStep(step, prior = []) {
    const sections = new Set(prior);
    for (let current = 3; current <= Number(step); current++) {
      const section = SECTION_FOR_STEP[current];
      if (section) sections.add(section);
      if (current === 6) sections.add('languages');
      if (current === 5) sections.add('conversation_dynamics');
    }
    return [...sections];
  }

  function buildProfilePayload(draft, step, complete = false) {
    const completedSections = sectionsThroughStep(step, draft?.completed_sections || []);
    if (complete) {
      for (const section of ['personality', 'interests', 'visitor_types', 'conversation_dynamics', 'response_style', 'languages', 'personal_boundaries']) {
        if (!completedSections.includes(section)) completedSections.push(section);
      }
    }
    return {
      schema_version: 2,
      name: String(draft?.name || 'Mi asistente').trim().slice(0, 80),
      description: '', tone: '', style: '', rules: '',
      personality: [...new Set(draft?.personality || [])],
      interests: [...new Set(draft?.interests || [])],
      visitor_types: [...new Set(draft?.visitor_types || [])],
      conversation_dynamics: [...new Set(draft?.conversation_dynamics || [])],
      response_style: {
        tone: [...new Set(draft?.response_style?.tone || [])],
        length: draft?.response_style?.length || null,
        emoji_policy: draft?.response_style?.emoji_policy || null,
        custom_instructions: String(draft?.response_style?.custom_instructions || '').trim().slice(0, 600),
      },
      languages: [...new Set(draft?.languages || [])],
      personal_boundaries: [...new Set(draft?.personal_boundaries || [])],
      completed_sections: completedSections,
      onboarding_complete: Boolean(complete),
    };
  }

  const api = { matchDetectedAccount, profileIsReady, sectionsThroughStep, buildProfilePayload };
  globalThis.PCAIAccountSetup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
