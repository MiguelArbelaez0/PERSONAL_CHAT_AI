const assert = require('node:assert/strict');
const test = require('node:test');
const { detectAccount, observeAccount } = require('../extension/account-detector.js');

class Element {
  constructor(tag, attributes = {}, text = '', classes = '') {
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.textContent = text;
    this.className = classes;
    this.id = '';
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
  }
  getAttribute(name) { return this.attributes[name] || null; }
  matches(selector) { return selector === 'header, [role="banner"]' && (this.tagName === 'HEADER' || this.attributes.role === 'banner'); }
  append(child) { child.parentElement = this; this.children.push(child); }
  querySelector(selector) {
    if (selector === 'img[alt]') return this.children.find((child) => child.tagName === 'IMG' && child.getAttribute('alt')) || null;
    return null;
  }
  querySelectorAll() { return this.children; }
}
function page(...headers) { return { querySelectorAll: () => headers, documentElement: new Element('html') }; }

test('detects only a semantic identity signal in the global header', () => {
  const header = new Element('header');
  const accountMenu = new Element('button', {
    'data-testid': 'header-user-menu', 'data-user-id': 'platform-421',
    'aria-label': 'Open account menu for Luna Star',
  }, 'Luna Star');
  header.append(accountMenu);
  assert.deepEqual(detectAccount(page(header)), {
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
