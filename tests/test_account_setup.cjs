const assert = require('node:assert/strict');
const test = require('node:test');
const setup = require('../extension/account-setup.js');

const account = (id, artist_name, platform_user_id = null) => ({ id, platform: 'stripchat', artist_name, platform_user_id, confirmed: true });

test('platform identity matches by stable platform id, not by stage name', () => {
  const accounts = [account('a', 'Luna', 'platform-a'), account('b', 'Luna', 'platform-b')];
  const result = setup.matchDetectedAccount(accounts, { status: 'candidate', artistName: 'Luna', platformUserId: 'platform-b' });
  assert.equal(result.status, 'platform_match');
  assert.equal(result.account.id, 'b');
});

test('name-only matches require confirmation and duplicate names are ambiguous', () => {
  const one = setup.matchDetectedAccount([account('a', 'Luna')], { status: 'candidate', artistName: 'luna' });
  assert.equal(one.status, 'confirm_existing');
  assert.equal(one.account.id, 'a');
  const many = setup.matchDetectedAccount([account('a', 'Luna'), account('b', 'Luna')], { status: 'candidate', artistName: 'Luna' });
  assert.equal(many.status, 'ambiguous');
  assert.equal(many.account, null);
});

test('missing or ambiguous detection never selects an account automatically', () => {
  for (const status of ['unavailable', 'ambiguous']) {
    const result = setup.matchDetectedAccount([account('a', 'Luna')], { status });
    assert.equal(result.account, null);
    assert.equal(result.status, status === 'ambiguous' ? 'ambiguous' : 'manual_required');
  }
});

test('profile payload maps all configured sections and marks completion only when requested', () => {
  const draft = {
    name: 'Mi asistente', personality: ['Cálida'], interests: ['Música'], visitor_types: ['Conversadores'],
    conversation_dynamics: ['Juguetona'], response_style: { tone: ['Natural'], length: 'short', emoji_policy: 'few' },
    languages: ['English', 'auto'], personal_boundaries: ['Temas a evitar: política'], completed_sections: [],
  };
  const partial = setup.buildProfilePayload(draft, 5, false);
  assert.equal(partial.onboarding_complete, false);
  assert.ok(partial.completed_sections.includes('visitor_types'));
  assert.ok(partial.completed_sections.includes('conversation_dynamics'));
  const complete = setup.buildProfilePayload(draft, 8, true);
  assert.equal(complete.onboarding_complete, true);
  assert.equal(complete.completed_sections.length, 7);
  assert.deepEqual(complete.languages, ['English', 'auto']);
});

test('generation readiness requires backend confirmation, active profile and completed onboarding', () => {
  const profile = { id: 'p', onboarding_complete: true };
  assert.equal(setup.profileIsReady({ account: account('a', 'Luna'), active_id: 'p', onboarding_complete: true, profiles: [profile] }), true);
  assert.equal(setup.profileIsReady({ account: account('a', 'Luna'), active_id: null, onboarding_complete: true, profiles: [profile] }), false);
  assert.equal(setup.profileIsReady({ account: { ...account('a', 'Luna'), confirmed: false }, active_id: 'p', onboarding_complete: true, profiles: [profile] }), false);
});
