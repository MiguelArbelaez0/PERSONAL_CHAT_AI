const assert = require('node:assert/strict');
const test = require('node:test');
const ConversationDetector = require('../extension/conversation-detector.js');
const SuggestionFlow = require('../extension/suggestion-flow.js');

class FixtureElement {
  get nodeType() { return 1; }
  get textContent() { return (this._text || '') + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = value; this.children = []; }
  get innerText() { return this.textContent; }
  set innerText(value) { this._text = value; }
  get childNodes() { return [...(this._text ? [{ nodeType: 3, textContent: this._text, childNodes: [] }] : []), ...this.children]; }
  contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); }
  constructor(tag = 'div', classes = '', text = '') {
    this.tagName = tag.toUpperCase();
    this.classList = new Set(classes.split(/\s+/).filter(Boolean));
    this.textContent = text;
    this.innerText = text;
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.id = '';
  }
  append(child) { child.parentElement = this; this.children.push(child); }
  getBoundingClientRect() { return { width: 100, height: 20 }; }
  getAttribute(name) { return this.attributes[name] || null; }
  matches(selector) {
    if (!selector || selector === '[' || selector.includes(':')) throw new Error('invalid selector');
    if (selector.includes(' > ')) {
      const parts = selector.split(' > ');
      return this.matches(parts.at(-1)) && this.parentElement?.matches(parts.at(-2));
    }
    if (selector.includes(' ')) {
      const parts = selector.trim().split(/\s+/);
      if (!this.matches(parts.at(-1))) return false;
      for (let parent = this.parentElement; parent; parent = parent.parentElement) {
        if (parent.matches(parts.at(-2))) return true;
      }
      return false;
    }
    const attrs = [...selector.matchAll(/\[([\w-]+)\]/g)].map((match) => match[1]);
    const withoutAttrs = selector.replace(/\[[\w-]+\]/g, '');
    if (attrs.some((name) => !(name in this.attributes))) return false;
    const tag = withoutAttrs.match(/^[a-zA-Z][\w-]*/)?.[0];
    const classes = [...withoutAttrs.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
    const ids = [...withoutAttrs.matchAll(/#([\w-]+)/g)].map((match) => match[1]);
    if (!tag && !classes.length && !ids.length && !attrs.length) throw new Error('invalid selector');
    return (!tag || this.tagName.toLowerCase() === tag.toLowerCase())
      && classes.every((name) => this.classList.has(name))
      && ids.every((name) => this.id === name);
  }
  querySelectorAll(selector) {
    if (!selector || selector === '[' || selector.includes(':')) throw new Error('invalid selector');
    const found = [];
    const visit = (element) => element.children.forEach((child) => {
      if (child.matches(selector)) found.push(child);
      visit(child);
    });
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class FixtureDocument extends FixtureElement {
  constructor() {
    super('document');
    this.hidden = false;
    this.listeners = new Map();
    this.defaultView = { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) };
  }
  createElement(tag) { return new FixtureElement(tag); }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
}

function makeConversation(aliasText = 'Alex') {
  const conversation = new FixtureElement('section', 'conversation');
  conversation.append(new FixtureElement('div', 'alias', aliasText));
  return conversation;
}

function row(direction, text, id = '', time = '') {
  const element = new FixtureElement('article', `message ${direction}`, text);
  if (id) element.attributes['data-message-id'] = id;
  if (time) element.append(new FixtureElement('time', 'time', time));
  return element;
}

const selectors = {
  conversation: '.conversation', alias: '.alias', message: '.message',
  incoming: '.incoming', outgoing: '.outgoing',
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('configured timestamp nodes do not contaminate the selected incoming text or mutate the page', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation('Synthetic');
  const item = row('incoming', '');
  const body = new FixtureElement('span', 'body', 'Hey daddy, how are you today?');
  body.append(new FixtureElement('time', 'time', '20:24'));
  item.append(body);
  item.append(new FixtureElement('time', 'time', '20:24'));
  conversation.append(item); doc.append(conversation);
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, text: '.body', timestamp: '.time' });
  detector.start();
  const snapshot = detector.scan();
  assert.equal(snapshot.messages[0].text, 'Hey daddy, how are you today?');
  assert.equal(snapshot.messages[0].time, '20:24');
  assert.equal(item.querySelectorAll('.time').length, 2);
  detector.configure({ ...selectors, timestamp: '.time' });
  assert.equal(detector.scan().messages[0].text, 'Hey daddy, how are you today?');
  detector.stop();
});

test('clock words in actual message text survive; a timestamp selected as text is not a message', () => {
  const doc = new FixtureDocument(); const conversation = makeConversation('Synthetic');
  const item = row('incoming', 'Meet me at 20:24.', '', '20:24');
  conversation.append(item); doc.append(conversation);
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, timestamp: '.time' });
  detector.start();
  assert.equal(detector.scan().messages[0].text, 'Meet me at 20:24.');
  detector.configure({ ...selectors, text: '.time', timestamp: '.time' });
  assert.equal(detector.scan().messages.length, 0);
  detector.stop();
});

test('metadata-free extraction preserves line breaks and excludes hidden text', () => {
  const doc = new FixtureDocument(); const item = row('incoming', 'Hey daddy,');
  doc.defaultView.getComputedStyle = (node) => ({ display: node.classList.has('hidden') ? 'none' : 'inline', visibility: 'visible', opacity: '1' });
  item.append(new FixtureElement('br'));
  item.append(new FixtureElement('span', '', 'how are you today?'));
  item.append(new FixtureElement('span', 'hidden', 'hidden duplicate'));
  item.append(new FixtureElement('time', 'time', '20:24'));
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, timestamp: '.time' });
  assert.equal(detector.messageTextOf(item), 'Hey daddy, how are you today?');
  assert.equal(item.querySelectorAll('.time').length, 1);
});

test('detector to automatic HTTP payload keeps the second target exact and excludes DOM clocks', async () => {
  const doc = new FixtureDocument(); const conversation = makeConversation('Synthetic');
  conversation.append(row('incoming', 'Hey daddy, how are you today?', 'first', '20:24'));
  conversation.append(row('incoming', 'I missed talking to you, daddy.', 'second', '20:25'));
  doc.append(conversation);
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, timestamp: '.time' }); detector.start();
  const snapshot = detector.scan(); const target = SuggestionFlow.latestIncoming(snapshot);
  let payload;
  const flow = new SuggestionFlow({ getMode: () => 'auto', getConversationKey: () => snapshot.conversationKey,
    getLatestIncomingFingerprint: () => target.fingerprint, request: async (value) => {
      payload = value; return { language: 'en', original_response: 'Glad to hear from you.' };
    } });
  await flow.generate(target.text, snapshot, true, null, false, target.fingerprint);
  assert.equal(payload.target_message, 'I missed talking to you, daddy.');
  assert.equal(payload.message, payload.target_message);
  assert.equal(payload.target_message_id, target.fingerprint);
  assert.equal(payload.generation_trigger, 'automatic');
  assert.equal(payload.conversation_history, '- Interlocutor (20:24): Hey daddy, how are you today?');
  detector.stop();
});

test('baselines existing rows, emits only new incoming rows once, and ignores own rows', async () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  conversation.append(row('incoming', 'already here'));
  doc.append(conversation);
  const incoming = [];
  const snapshots = [];
  const detector = new ConversationDetector({ document: doc, onIncoming: (item) => incoming.push(item), onUpdate: (s) => snapshots.push(s), baselineQuietMs: 5 });
  detector.configure(selectors);
  detector.start();
  assert.equal(snapshots.at(-1).status, 'baseline');
  await delay(10);
  assert.equal(snapshots.at(-1).status, 'observing');
  conversation.append(row('outgoing', 'my reply'));
  conversation.append(row('incoming', 'new message'));
  detector.scan();
  detector.scan();
  const newIncoming = conversation.children.at(-1);
  newIncoming.textContent = 'new message with a dynamically added label';
  newIncoming.innerText = newIncoming.textContent;
  detector.scan();
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].message, 'new message');
  assert.equal(incoming[0].snapshot.alias, 'Alex');
  assert.deepEqual(incoming[0].snapshot.messages.map((m) => m.direction), ['incoming', 'outgoing', 'incoming']);
  assert.equal(snapshots.at(-1).status, 'observing');
  detector.stop();
});

test('reports all loaded DOM rows but keeps a 100-row chronological context snapshot', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  for (let index = 0; index < 125; index += 1) {
    conversation.append(row(index % 2 ? 'outgoing' : 'incoming', `loaded-${index}`, `m-${index}`));
  }
  doc.append(conversation);
  const snapshots = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (snapshot) => snapshots.push(snapshot) });
  detector.configure(selectors);
  detector.start();
  assert.equal(snapshots.at(-1).counts.total, 125);
  assert.equal(snapshots.at(-1).messages.length, 100);
  assert.equal(snapshots.at(-1).messages[0].text, 'loaded-25');
  assert.equal(snapshots.at(-1).messages.at(-1).text, 'loaded-124');
  detector.stop();
});

test('conversation switch establishes a new baseline and does not mix or trigger old messages', async () => {
  const doc = new FixtureDocument();
  const first = makeConversation('Alex');
  first.append(row('incoming', 'first chat'));
  doc.append(first);
  const emitted = [];
  const detector = new ConversationDetector({ document: doc, onIncoming: (item) => emitted.push(item), baselineQuietMs: 5 });
  detector.configure(selectors);
  detector.start();
  await delay(10);
  doc.children = [];
  const second = makeConversation('Sam');
  second.append(row('incoming', 'old visible message'));
  doc.append(second);
  detector.scan();
  assert.equal(emitted.length, 0);
  await delay(10);
  second.append(row('incoming', 'new for Sam'));
  detector.scan();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].snapshot.alias, 'Sam');
  assert.deepEqual(emitted[0].snapshot.messages.map((m) => m.text), ['old visible message', 'new for Sam']);
  detector.stop();
});

test('late initial history is absorbed into the baseline rather than auto-triggered', async () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  doc.append(conversation);
  const emitted = [];
  const detector = new ConversationDetector({ document: doc, onIncoming: (item) => emitted.push(item), baselineQuietMs: 5 });
  detector.configure(selectors);
  detector.start();
  assert.equal(detector.diagnose().reason, 'insufficient-evidence');
  conversation.append(row('incoming', 'late history row'));
  detector.scan();
  await delay(10);
  assert.equal(emitted.length, 0);
  conversation.append(row('incoming', 'genuinely new message'));
  detector.scan();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].message, 'genuinely new message');
  detector.stop();
});

test('automatic startup observes for a chat opened after the initial scan', async () => {
  const doc = new FixtureDocument();
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.options = null; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const snapshots = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (s) => snapshots.push(s), MutationObserverImpl: Observer, debounceMs: 1, baselineQuietMs: 5 });
  detector.configure(selectors);
  detector.start();
  const bootstrap = observers[0];
  assert.equal(bootstrap.target, doc);
  assert.equal(detector.isObserving(), true);
  const conversation = makeConversation('OpeningChat');
  conversation.append(row('incoming', 'existing history'));
  doc.append(conversation);
  bootstrap.callback();
  await delay(10);
  assert.equal(snapshots.at(-1).alias, 'OpeningChat');
  assert.equal(bootstrap.disconnected, true);
  const activeObserver = observers.find((observer) => observer.target === conversation);
  assert.deepEqual(activeObserver.options.attributeFilter, ['class', 'data-message-id']);
  assert.equal(detector.isObserving(), true);
  detector.stop();
});

test('empty chat completes its baseline so its first later incoming message is new', async () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation('EmptyChat');
  doc.append(conversation);
  const incoming = [];
  const baselines = [];
  const detector = new ConversationDetector({ document: doc, onIncoming: (item) => incoming.push(item), onBaseline: (item) => baselines.push(item), baselineQuietMs: 5 });
  detector.configure(selectors);
  detector.start();
  await delay(10);
  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].lastIncoming, null);
  conversation.append(row('incoming', 'first genuinely new message'));
  detector.scan();
  assert.equal(incoming.length, 1);
  detector.stop();
});

test('initial baseline reports only the latest incoming row for opt-in suggestions', async () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation('InitialChat');
  conversation.append(row('incoming', 'older incoming', 'old'));
  conversation.append(row('outgoing', 'own message', 'mine'));
  conversation.append(row('incoming', 'latest incoming', 'latest'));
  doc.append(conversation);
  const incoming = [];
  const baselines = [];
  const detector = new ConversationDetector({ document: doc, onIncoming: (item) => incoming.push(item), onBaseline: (item) => baselines.push(item), baselineQuietMs: 5 });
  detector.configure(selectors);
  detector.start();
  await delay(10);
  assert.equal(incoming.length, 0);
  assert.equal(baselines[0].lastIncoming.text, 'latest incoming');
  assert.equal(baselines[0].lastIncoming.fingerprint, 'id:latest');
  assert.equal(detector.getLatestIncoming().fingerprint, 'id:latest');
  detector.stop();
});

test('ambiguous conversations and invalid selectors suppress automatic triggers', () => {
  const doc = new FixtureDocument();
  const first = makeConversation();
  first.append(row('incoming', 'message'));
  doc.append(first);
  const updates = [];
  const emitted = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (s) => updates.push(s), onIncoming: (x) => emitted.push(x) });
  detector.configure(selectors);
  detector.start();
  const second = makeConversation('Other');
  doc.append(second);
  detector.scan();
  assert.equal(updates.at(-1).status, 'ambiguous');
  const report = detector.inspectSelectors();
  assert.equal(report.message.status, 'no-active-scope');
  assert.equal(report.message.sample, '');
  assert.equal(emitted.length, 0);
  doc.children = doc.children.filter((child) => child !== second);
  detector.configure({ ...selectors, message: '[' });
  detector.start();
  assert.equal(updates.at(-1).status, 'invalid-selector');
  assert.equal(detector.diagnose().reason, 'invalid-selector');
  detector.stop();
});

test('alias ambiguity cannot produce an identified conversation', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  conversation.append(new FixtureElement('div', 'alias', 'Alex clone'));
  conversation.append(row('incoming', 'hello'));
  doc.append(conversation);
  const updates = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (s) => updates.push(s) });
  detector.configure(selectors);
  detector.start();
  assert.equal(updates.at(-1).status, 'alias-unidentified');
  assert.equal(detector.diagnose().reason, 'alias-unidentified');
  detector.stop();
});

test('selector report exposes zero matches and message samples without claiming validation', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  conversation.append(row('incoming', 'sample incoming'));
  doc.append(conversation);
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, outgoing: '.missing' });
  const report = detector.inspectSelectors();
  assert.equal(report.conversation.count, 1);
  assert.equal(report.outgoing.status, 'no-match');
  assert.equal(report.message.sample[0], 'sample incoming');
  assert.equal(detector.diagnose().reason, 'insufficient-evidence');
});

test('timestamp selector orders chat context chronologically', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  conversation.append(row('outgoing', 'later own message', '', '12:05'));
  conversation.append(row('incoming', 'earlier incoming message', '', '12:01'));
  doc.append(conversation);
  const snapshots = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (snapshot) => snapshots.push(snapshot) });
  detector.configure({ ...selectors, timestamp: '.time' });
  detector.start();
  assert.deepEqual(snapshots.at(-1).messages.map((message) => message.text), ['earlier incoming message', 'later own message']);
  assert.deepEqual(snapshots.at(-1).messages.map((message) => message.order), [0, 1]);
  detector.stop();
});

test('normalizes emoji-only incoming rows with stable identity and conversation metadata', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation('EmojiChat');
  conversation.append(row('incoming', '😏😉'));
  conversation.append(row('outgoing', '😊'));
  doc.append(conversation);
  const snapshots = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (snapshot) => snapshots.push(snapshot) });
  detector.configure(selectors);
  detector.start();
  const messages = snapshots.at(-1).messages;
  assert.equal(messages[0].text, '😏😉');
  assert.equal(messages[0].direction, 'incoming');
  assert.equal(messages[0].sender, 'interlocutor');
  assert.equal(messages[0].conversationId, snapshots.at(-1).conversationKey);
  assert.match(messages[0].fingerprint, /^hash:/);
  detector.scan();
  assert.equal(snapshots.at(-1).messages[0].fingerprint, messages[0].fingerprint);
  assert.equal(snapshots.at(-1).messages[1].sender, 'user');
  detector.stop();
});

test('configured system rows are excluded from normal direction and counted separately', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation('SystemChat');
  conversation.append(row('incoming', 'hello'));
  conversation.append(new FixtureElement('article', 'message system', 'gift notice'));
  conversation.append(row('outgoing', 'thanks'));
  doc.append(conversation);
  const snapshots = [];
  const detector = new ConversationDetector({ document: doc, onUpdate: (snapshot) => snapshots.push(snapshot) });
  detector.configure({ ...selectors, system: '.system' });
  detector.start();
  assert.deepEqual(snapshots.at(-1).messages.map((message) => message.direction), ['incoming', 'system', 'outgoing']);
  assert.equal(snapshots.at(-1).counts.system, 1);
  assert.equal(detector.diagnose().system, 1);
  detector.stop();
});

test('overlapping system and sender selectors remain unclassified instead of guessing', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation('OverlapChat');
  conversation.append(row('incoming', 'ambiguous notice'));
  conversation.append(row('outgoing', 'own reply'));
  doc.append(conversation);
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, system: '.message.incoming' });
  detector.start();
  assert.equal(detector.currentMessages[0].direction, 'unknown');
  assert.equal(detector.currentMessages[1].direction, 'outgoing');
  detector.stop();
});

test('overlapping direction selectors cannot be marked verified', () => {
  const doc = new FixtureDocument();
  const conversation = makeConversation();
  conversation.append(row('incoming', 'inbound'));
  conversation.append(row('outgoing', 'outbound'));
  doc.append(conversation);
  const detector = new ConversationDetector({ document: doc });
  detector.configure({ ...selectors, incoming: '.message', outgoing: '.message' });
  assert.equal(detector.diagnose().reason, 'insufficient-evidence');
});

test('observed Stripchat adapter identifies chat, alias, rows, and both directions', () => {
  const doc = new FixtureDocument();
  const conversation = new FixtureElement('div', 'messenger-chat expanded');
  const header = new FixtureElement('div', 'messenger-chat-header');
  const username = new FixtureElement('div', 'chat-header-username username');
  username.append(new FixtureElement('span', 'user-levels-username-text', 'Alias redacted'));
  header.append(username);
  const content = new FixtureElement('div', 'content');
  const messages = new FixtureElement('div', 'messenger-chat__messages-wrapper');
  const incoming = new FixtureElement('div', 'base-message-wrapper counterpart-base-message-container position-left');
  incoming.attributes['data-message-id'] = 'sample-in';
  incoming.append(new FixtureElement('div', 'base-message', 'incoming sample'));
  const outgoing = new FixtureElement('div', 'base-message-wrapper position-right');
  outgoing.attributes['data-message-id'] = 'sample-out';
  outgoing.append(new FixtureElement('div', 'base-message', 'outgoing sample'));
  messages.append(incoming);
  messages.append(outgoing);
  content.append(messages);
  conversation.append(header);
  conversation.append(content);
  doc.append(conversation);

  const detector = new ConversationDetector({ document: doc });
  detector.configure(ConversationDetector.stripchatSelectors);
  const report = detector.diagnose();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.aliases, 1);
  assert.equal(report.messages, 2);
  assert.equal(report.incoming, 1);
  assert.equal(report.outgoing, 1);
});
