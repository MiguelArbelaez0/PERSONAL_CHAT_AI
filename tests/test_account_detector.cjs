const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { detectAccount, observeAccount } = require('../extension/account-detector.js');

class Element {
  constructor(tag, attributes = {}, text = '', classes = '') {
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.textContent = text;
    this.className = classes;
    this.classList = { contains: (name) => classes.split(/\s+/).includes(name) };
    this.id = '';
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
  }
  getAttribute(name) { return this.attributes[name] || null; }
  matches(selector) {
    if (selector === 'header, [role="banner"]') return this.tagName === 'HEADER' || this.attributes.role === 'banner';
    if (selector === 'header') return this.tagName === 'HEADER';
    return selector.split(',').some((part) => part.trim().split(/\s+/).at(-1).split('.').filter(Boolean).every((name) => this.className.split(/\s+/).includes(name)));
  }
  append(child) { child.parentElement = this; this.children.push(child); }
  querySelector(selector) {
    return this.querySelectorAll(selector).find((child) => selector === 'img[alt]' ? child.tagName === 'IMG' && child.getAttribute('alt') : child.matches(selector)) || null;
  }
  querySelectorAll(selector = '*') {
    const all = [];
    const visit = (node) => { for (const child of node.children) { all.push(child); visit(child); } };
    visit(this);
    if (selector === 'img[alt]') return all.filter((child) => child.tagName === 'IMG' && child.getAttribute('alt'));
    if (selector.startsWith('.') && !selector.includes('[')) return all.filter((child) => child.matches(selector));
    return all;
  }
}
function page(...headers) {
  const all = [];
  const visit = (node) => { all.push(node); node.children.forEach(visit); };
  headers.forEach(visit);
  return {
    querySelectorAll: (selector) => selector === 'header, [role="banner"]' ? headers
      : selector === '.header-top.is-model-user' ? all.filter((node) => node.matches(selector))
        : selector === '.left-wrapper' ? all.filter((node) => node.matches(selector))
          : all.filter((node) => /^user-levels-name-\d+-headerUserMenu$/i.test(node.id)),
    documentElement: new Element('html'),
  };
}
function resultWithoutDiagnostics(result) {
  const { diagnostics, ...publicResult } = result;
  return publicResult;
}

test('detects only a semantic identity signal in the global header', () => {
  const header = new Element('header');
  const accountMenu = new Element('button', {
    'data-testid': 'header-user-menu', 'data-user-id': 'platform-421',
    'aria-label': 'Open account menu for Luna Star',
  }, 'Luna Star');
  header.append(accountMenu);
  assert.deepEqual(resultWithoutDiagnostics(detectAccount(page(header))), {
    status: 'candidate', artistName: 'Luna Star', platformUserId: 'platform-421', identitySource: 'dom', candidateCount: 1,
  });
});

test('does not mistake visitor chat identity for the account identity', () => {
  const header = new Element('header');
  const chatHeader = new Element('div', { 'data-testid': 'header-user-menu', 'data-user-id': 'visitor-1', 'aria-label': 'Account menu for Visitor' }, 'Visitor', 'chat-header');
  header.append(chatHeader);
  assert.equal(detectAccount(page(header)).status, 'unavailable');
  const chatOnly = new Element('div', { 'data-testid': 'header-user-menu', 'data-user-id': 'visitor-1', 'aria-label': 'Account menu for Visitor' }, 'Visitor', 'messenger-chat');
  assert.equal(detectAccount(page(chatOnly)).status, 'unavailable');
  const visitorHeader = new Element('header');
  const visitorName = new Element('span', {}, 'Visitor', 'user-levels-username-text');
  visitorName.id = 'user-levels-name-119879514-user-info';
  visitorHeader.append(visitorName);
  assert.equal(detectAccount(page(visitorHeader)).status, 'unavailable');
});

test('never derives the authenticated identity from a profile URL segment', () => {
  const header = new Element('header');
  header.append(new Element('a', { href: '/ExampleStageName/profile', 'aria-label': 'Open account menu' }, '', 'account-link'));
  assert.equal(detectAccount(page(header)).status, 'unavailable');
});

test('reads the owner name from the observed authenticated global header while its dropdown is closed', () => {
  const header = new Element('div', {}, '', 'header-top is-model-user');
  header.append(new Element('div', {}, 'Luna Star', 'colored user-menu-username username'));
  header.append(new Element('a', { href: '/OtherModel/profile' }, 'OtherModel', 'suggested-model-link'));
  assert.deepEqual(resultWithoutDiagnostics(detectAccount(page(header))), {
    status: 'candidate', artistName: 'Luna Star', platformUserId: null,
    identitySource: 'authenticated-header', candidateCount: 1,
  });
});

test('detects the profile name from the authenticated header avatar alt observed in Chrome', () => {
  const header = new Element('div', {}, '', 'header-top is-model-user');
  const nav = new Element('nav', {}, '', 'nav-right');
  const accountLink = new Element('a', { href: '/ExampleStage/profile' }, '', 'dropdown-link hidden-ipad-portrait');
  const avatar = new Element('span', {}, '', 'avatar avatar-border color-league-default');
  avatar.append(new Element('img', { alt: 'Foto de perfil de NovaArtist' }));
  accountLink.append(avatar);
  nav.append(accountLink);
  header.append(nav);
  assert.deepEqual(resultWithoutDiagnostics(detectAccount(page(header))), {
    status: 'candidate', artistName: 'NovaArtist', platformUserId: null,
    identitySource: 'authenticated-header', candidateCount: 1,
  });
});

test('supports known localized profile-avatar labels and reports unknown labels without guessing', () => {
  for (const alt of ['Profile picture of Luna Star', 'Photo de profil de Luna Star', 'Foto do perfil de Luna Star', 'Foto del profilo di Luna Star', 'Profilbild von Luna Star']) {
    const header = new Element('div', {}, '', 'header-top is-model-user');
    const nav = new Element('nav', {}, '', 'nav-right');
    const link = new Element('a', {}, '', 'dropdown-link');
    link.append(new Element('img', { alt })); nav.append(link); header.append(nav);
    assert.equal(detectAccount(page(header)).artistName, 'Luna Star', alt);
  }
  const header = new Element('div', {}, '', 'header-top is-model-user');
  const nav = new Element('nav', {}, '', 'nav-right');
  const link = new Element('a', {}, '', 'dropdown-link');
  link.append(new Element('img', { alt: 'Avatar de Luna Star' })); nav.append(link); header.append(nav);
  const result = detectAccount(page(header));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'authenticated_avatar_alt_unrecognized');
  assert.equal(result.diagnostics.authenticatedAvatarCount, 1);
  assert.equal(result.diagnostics.rejectedAvatarAltCount, 1);
});

test('recognizes the owner profile only when the observed editable avatar is present', () => {
  const ownProfile = new Element('div', {}, '', 'left-wrapper');
  ownProfile.append(new Element('div', {}, '', 'profile-cover__avatar-wrapper'));
  ownProfile.children[0].append(new Element('div', {}, '', 'user-avatar-editable'));
  ownProfile.append(new Element('div', {}, 'Luna Star', 'username-panel__name'));
  assert.deepEqual(resultWithoutDiagnostics(detectAccount(page(ownProfile))), {
    status: 'candidate', artistName: 'Luna Star', platformUserId: null,
    identitySource: 'editable-own-profile', candidateCount: 1,
  });

  const otherProfile = new Element('div', {}, '', 'left-wrapper');
  otherProfile.append(new Element('div', {}, 'Guest Model', 'username-panel__name'));
  assert.equal(detectAccount(page(otherProfile)).status, 'unavailable');
});

test('conflicting authenticated header and editable own-profile names fail closed', () => {
  const header = new Element('div', {}, '', 'header-top is-model-user');
  header.append(new Element('div', {}, 'Luna Star', 'user-menu-username'));
  const ownProfile = new Element('div', {}, '', 'left-wrapper');
  ownProfile.append(new Element('div', {}, '', 'user-avatar-editable'));
  ownProfile.append(new Element('div', {}, 'Another Name', 'username-panel__name'));
  assert.equal(detectAccount(page(header, ownProfile)).status, 'ambiguous');
});

test('manifest loads the account detector before content.js', () => {
  const manifest = JSON.parse(fs.readFileSync(require.resolve('../extension/manifest.json'), 'utf8'));
  const scripts = manifest.content_scripts.flatMap((script) => script.js);
  assert.ok(scripts.indexOf('account-detector.js') >= 0);
  assert.ok(scripts.indexOf('account-detector.js') < scripts.indexOf('content.js'));
});

test('detects the observed authenticated headerUserMenu element and takes its numeric account id', () => {
  const header = new Element('header');
  const ownName = new Element('span', {}, 'Luna Star', 'user-levels-username-text');
  ownName.id = 'user-levels-name-119879514-headerUserMenu';
  header.append(ownName);
  assert.deepEqual(resultWithoutDiagnostics(detectAccount(page(header))), {
    status: 'candidate', artistName: 'Luna Star', platformUserId: '119879514', identitySource: 'dom', candidateCount: 1,
  });
});

test('contradictory name or account-id signals fail closed as ambiguous', () => {
  const header = new Element('header');
  const ownName = new Element('span', { 'data-user-id': 'another-account', 'data-username': 'Different Name' }, 'Luna Star', 'user-levels-username-text');
  ownName.id = 'user-levels-name-119879514-headerUserMenu';
  header.append(ownName);
  assert.equal(detectAccount(page(header)).status, 'ambiguous');
});

test('ambiguous global identity candidates never choose one account', () => {
  const header = new Element('header');
  header.append(new Element('button', { 'data-testid': 'account-menu', 'data-user-id': 'one', 'aria-label': 'Profile for Luna' }, 'Luna'));
  header.append(new Element('button', { 'data-testid': 'account-menu', 'data-user-id': 'two', 'aria-label': 'Profile for Luna' }, 'Luna'));
  const result = detectAccount(page(header));
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidateCount, 2);
});

test('observer emits changes once and can be stopped', () => {
  const header = new Element('header');
  const account = new Element('button', { 'data-testid': 'account-menu', 'data-user-id': 'one', 'aria-label': 'Profile for Luna' }, 'Luna');
  header.append(account);
  let callback;
  let disconnected = false;
  class Observer { constructor(fn) { callback = fn; } observe() {} disconnect() { disconnected = true; } }
  const changes = [];
  const observer = observeAccount(page(header), (result) => changes.push(result.status), Observer);
  callback();
  assert.deepEqual(changes, ['candidate']);
  observer.stop();
  assert.equal(disconnected, true);
});

test('observer reports an artistic-name change even when the stable account id is unchanged', () => {
  const header = new Element('header');
  const ownName = new Element('span', {}, 'Luna', 'user-levels-username-text');
  ownName.id = 'user-levels-name-119879514-headerUserMenu';
  header.append(ownName);
  const changes = [];
  const observer = observeAccount(page(header), (result) => changes.push(result), null);
  ownName.textContent = 'Luna Star';
  observer.scan();
  assert.equal(changes.length, 2);
  assert.equal(changes[0].platformUserId, changes[1].platformUserId);
  assert.equal(changes[1].artistName, 'Luna Star');
  observer.stop();
});

test('observer rescans when the authenticated header is inserted after the initial unavailable scan', () => {
  let header = null;
  const document = {
    documentElement: new Element('html'),
    querySelectorAll: (selector) => selector === '.header-top.is-model-user' ? (header ? [header] : []) : [],
  };
  const changes = [];
  const observer = observeAccount(document, (result) => changes.push(result), null);
  assert.equal(changes[0].status, 'unavailable');
  header = new Element('div', {}, '', 'header-top is-model-user');
  header.append(new Element('div', {}, 'Late Owner', 'user-menu-username'));
  observer.scan();
  assert.equal(changes.at(-1).status, 'candidate');
  assert.equal(changes.at(-1).artistName, 'Late Owner');
  observer.stop();
});
