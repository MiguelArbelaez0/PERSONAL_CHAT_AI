/* Conversation detection is selector-driven. No Stripchat selectors are assumed. */
(() => {
  class ConversationDetector {
    constructor({ document: pageDocument, onUpdate, onIncoming, onBaseline, MutationObserverImpl, debounceMs = 250, baselineQuietMs = 900 }) {
      this.document = pageDocument;
      this.onUpdate = onUpdate || (() => {});
      this.onIncoming = onIncoming || (() => {});
      this.onBaseline = onBaseline || (() => {});
      this.MutationObserverImpl = MutationObserverImpl || globalThis.MutationObserver || null;
      this.debounceMs = debounceMs;
      this.baselineQuietMs = baselineQuietMs;
      this.selectors = {};
      this.active = false;
      this.conversationObserver = null;
      this.parentObserver = null;
      this.bootstrapObserver = null;
      this.pendingTimer = null;
      this.baselineTimer = null;
      this.identity = new WeakMap();
      this.fingerprints = new WeakMap();
      this.nextIdentity = 1;
      this.seen = new Set();
      this.seenOrder = [];
      this.conversationKey = null;
      this.currentConversation = null;
      this.hasBaseline = false;
      this.baselineMessages = [];
      this.currentMessages = [];
      this.selectorError = null;
      this.userInteractionHandler = () => {
        this.scheduleScan();
        setTimeout(() => this.scan(false), 700);
      };
      this.visibilityHandler = () => { if (!this.document.hidden) this.scheduleScan(); };
    }

    configure(selectors) {
      this.selectors = { ...selectors };
      this.selectorError = this.validateSelectorSyntax();
      if (this.active) this.start();
    }

    validateSelectorSyntax() {
      try {
        const probe = this.document.createElement('div');
        for (const [key, selector] of Object.entries(this.selectors)) {
          if (String(selector || '').trim()) probe.querySelectorAll(selector);
        }
        return null;
      } catch (error) {
        return String(error?.message || error);
      }
    }

    start() {
      this.stopObservers();
      this.clearBaselineTimer();
      this.active = true;
      this.hasBaseline = false;
      this.baselineMessages = [];
      this.currentMessages = [];
      this.document.addEventListener?.('click', this.userInteractionHandler, true);
      this.document.addEventListener?.('visibilitychange', this.visibilityHandler);
      this.scan();
    }

    stop() {
      this.active = false;
      this.document.removeEventListener?.('click', this.userInteractionHandler, true);
      this.document.removeEventListener?.('visibilitychange', this.visibilityHandler);
      if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      this.clearBaselineTimer();
      this.bootstrapObserver?.disconnect();
      this.bootstrapObserver = null;
      this.stopObservers();
    }

    clearBaselineTimer() {
      if (this.baselineTimer !== null) clearTimeout(this.baselineTimer);
      this.baselineTimer = null;
    }

    scheduleBaseline(conversationKey) {
      this.clearBaselineTimer();
      this.baselineTimer = setTimeout(() => {
        this.baselineTimer = null;
        if (!this.active || this.conversationKey !== conversationKey || !this.currentConversation) return;
        this.hasBaseline = true;
        const snapshot = this.scan(false);
        const lastIncoming = [...this.baselineMessages].reverse().find((item) => item.direction === 'incoming' && item.text) || null;
        if (snapshot?.alias) this.onBaseline({ snapshot, lastIncoming });
      }, this.baselineQuietMs);
    }

    stopObservers() {
      this.conversationObserver?.disconnect();
      this.parentObserver?.disconnect();
      this.conversationObserver = null;
      this.parentObserver = null;
      this.currentConversation = null;
    }

    watchForConversation() {
      if (!this.active || this.bootstrapObserver || !this.MutationObserverImpl) return;
      const target = this.document.body || this.document.documentElement || this.document;
      if (!target) return;
      this.bootstrapObserver = new this.MutationObserverImpl(() => this.scheduleScan());
      this.bootstrapObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    requiredMissing() {
      return ['conversation', 'alias', 'message', 'incoming', 'outgoing']
        .filter((key) => !String(this.selectors[key] || '').trim());
    }

    isObserving() {
      return Boolean(this.conversationObserver || this.parentObserver || this.bootstrapObserver);
    }

    getLatestIncoming() {
      if (!this.hasBaseline) return null;
      return [...this.currentMessages].reverse().find((item) => item.direction === 'incoming' && item.text) || null;
    }

    diagnose() {
      const fields = this.inspectSelectors();
      const invalid = Object.values(fields).find((item) => item.status === 'invalid');
      if (invalid) return { ok: false, reason: 'invalid-selector', detail: invalid.error, fields };
      const missing = this.requiredMissing();
      if (missing.length) return { ok: false, reason: 'unconfigured', missing, fields };
      const conversations = fields.conversation.count;
      if (!conversations) return { ok: false, reason: 'no-conversation', conversations, fields };
      if (conversations !== 1) return { ok: false, reason: 'ambiguous', conversations, fields };
      if (fields.alias.count !== 1) return { ok: false, reason: 'alias-unidentified', aliases: fields.alias.count, fields };
      let rows;
      let directions;
      try {
        const conversation = [...this.document.querySelectorAll(this.selectors.conversation)].filter((el) => this.isVisible(el))[0];
        rows = [...conversation.querySelectorAll(this.selectors.message)].filter((el) => this.isVisible(el));
        directions = rows.map((row) => this.directionOf(row));
      } catch (error) {
        return { ok: false, reason: 'invalid-selector', detail: String(error?.message || error), fields };
      }
      const incoming = directions.filter((direction) => direction === 'incoming').length;
      const outgoing = directions.filter((direction) => direction === 'outgoing').length;
      const system = directions.filter((direction) => direction === 'system').length;
      if (!rows.length || !incoming || !outgoing) return { ok: false, reason: 'insufficient-evidence', fields };
      return {
        ok: true, reason: 'ready', conversations,
        aliases: fields.alias.count, messages: rows.length,
        incoming, outgoing,
        system, unclassified: directions.filter((direction) => direction === 'unknown').length, fields,
      };
    }

    inspectSelectors() {
      const keys = ['conversation', 'alias', 'message', 'incoming', 'outgoing', 'system', 'text', 'timestamp'];
      let conversations = [];
      try {
        if (String(this.selectors.conversation || '').trim()) {
          conversations = [...this.document.querySelectorAll(this.selectors.conversation)].filter((el) => this.isVisible(el));
        }
      } catch (_) {}
      const hasActiveScope = conversations.length === 1;
      const scope = hasActiveScope ? conversations[0] : null;
      const fields = {};
      for (const key of keys) {
        const selector = String(this.selectors[key] || '').trim();
        if (!selector) {
          fields[key] = { selector: '', count: 0, status: 'unconfigured', sample: '', error: '' };
          continue;
        }
        if (key !== 'conversation' && !hasActiveScope) {
          fields[key] = { selector, count: 0, status: 'no-active-scope', sample: '', error: '' };
          continue;
        }
        try {
          const searchRoot = key === 'conversation' ? this.document : scope;
          const matches = [...searchRoot.querySelectorAll(selector)].filter((el) => this.isVisible(el));
          const sample = key === 'conversation' ? [] : matches.slice(0, 2)
            .map((el) => this.textOf(el, key === 'message' && this.selectors.text ? this.selectors.text : ''))
            .filter(Boolean);
          fields[key] = {
            selector, count: matches.length,
            status: matches.length ? 'matches' : 'no-match',
            sample: sample.map((text) => text.slice(0, 120)), error: '',
          };
        } catch (error) {
          fields[key] = { selector, count: 0, status: 'invalid', sample: '', error: String(error?.message || error) };
        }
      }
      return fields;
    }

    isVisible(element) {
      const style = this.document.defaultView?.getComputedStyle?.(element);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
      const rect = element.getBoundingClientRect?.();
      return !rect || (rect.width > 0 && rect.height > 0);
    }

    matchesWithin(element, selector) {
      try {
        return element.matches(selector) || Boolean(element.querySelector(selector));
      } catch {
        return false;
      }
    }

    directionOf(row) {
      const system = String(this.selectors.system || '').trim() && this.matchesWithin(row, this.selectors.system);
      const incoming = this.matchesWithin(row, this.selectors.incoming);
      const outgoing = this.matchesWithin(row, this.selectors.outgoing);
      if (system && (incoming || outgoing)) return 'unknown';
      if (system) return 'system';
      if (incoming === outgoing) return 'unknown';
      return incoming ? 'incoming' : 'outgoing';
    }

    hashFingerprint(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
      return (hash >>> 0).toString(16).padStart(8, '0');
    }

    textOf(row, selector) {
      const target = selector ? row.querySelector(selector) : row;
      return String(target?.innerText || target?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    messageTextOf(row) {
      const target = this.selectors.text ? row.querySelector(this.selectors.text) : row;
      if (!target) return '';
      const timestamps = this.selectors.timestamp ? [...row.querySelectorAll(this.selectors.timestamp)] : [];
      if (timestamps.some((node) => node === target || node.contains(target))) return '';
      const excluded = new Set(timestamps.filter((node) => target.contains(node)));
      if (!excluded.size) return this.textOf(row, this.selectors.text);
      // Read visible content without configured metadata. Never mutate the
      // page or remove clock-shaped words that belong to the actual message.
      const read = (node) => {
        if (excluded.has(node)) return '';
        const style = node.nodeType === 1 ? this.document.defaultView?.getComputedStyle?.(node) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return '';
        if (node.tagName === 'BR') return ' ';
        if (!node.childNodes?.length) return String(node.textContent || '');
        const text = [...node.childNodes].map(read).join('');
        return /^(block|flex|grid|list-item|table|table-row|table-cell)$/.test(style?.display || '') ? ` ${text} ` : text;
      };
      return read(target).replace(/\s+/g, ' ').trim();
    }

    timestampOrder(value) {
      const time = String(value || '').trim();
      const clock = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0);
      if (/^\d{4}-\d{2}-\d{2}[T ]/.test(time)) {
        const parsed = Date.parse(time);
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    }

    idFor(element) {
      if (!this.identity.has(element)) this.identity.set(element, this.nextIdentity++);
      return this.identity.get(element);
    }

    remember(key) {
      if (this.seen.has(key)) return false;
      this.seen.add(key);
      this.seenOrder.push(key);
      while (this.seenOrder.length > 1500) this.seen.delete(this.seenOrder.shift());
      return true;
    }

    scheduleScan() {
      if (!this.active) return;
      if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        this.scan(false);
      }, this.debounceMs);
    }

    observe(conversation) {
      if (!this.active || conversation === this.currentConversation) return;
      this.stopObservers();
      this.currentConversation = conversation;
      if (!conversation || !this.MutationObserverImpl) return;
      this.conversationObserver = new this.MutationObserverImpl(() => this.scheduleScan());
      this.conversationObserver.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-message-id'] });
      const parent = conversation.parentElement;
      if (parent) {
        this.parentObserver = new this.MutationObserverImpl(() => this.scheduleScan());
        this.parentObserver.observe(parent, { childList: true });
      }
    }

    scan() {
      if (!this.active) return null;
      const missing = this.requiredMissing();
      if (missing.length) {
        this.onUpdate({ status: 'unconfigured', missing, alias: null, messages: [] });
        return null;
      }
      if (this.selectorError) {
        this.onUpdate({ status: 'invalid-selector', detail: this.selectorError, alias: null, messages: [] });
        return null;
      }
      let candidates;
      try {
        candidates = [...this.document.querySelectorAll(this.selectors.conversation)].filter((el) => this.isVisible(el));
      } catch (error) {
        this.onUpdate({ status: 'invalid-selector', detail: String(error?.message || error), alias: null, messages: [] });
        return null;
      }
      if (candidates.length !== 1) {
        this.observe(null);
        this.watchForConversation();
        this.clearBaselineTimer();
        this.conversationKey = null;
        this.seen.clear();
        this.seenOrder = [];
        this.hasBaseline = false;
        this.onUpdate({ status: candidates.length ? 'ambiguous' : 'no-conversation', count: candidates.length, alias: null, messages: [] });
        return null;
      }

      const conversation = candidates[0];
      this.bootstrapObserver?.disconnect();
      this.bootstrapObserver = null;
      this.observe(conversation);
      let aliases;
      let rows;
      try {
        aliases = [...conversation.querySelectorAll(this.selectors.alias)].filter((el) => this.isVisible(el));
        rows = [...conversation.querySelectorAll(this.selectors.message)].filter((el) => this.isVisible(el));
      } catch (error) {
        this.onUpdate({ status: 'invalid-selector', detail: String(error?.message || error), alias: null, messages: [] });
        return null;
      }
      const alias = aliases.length === 1 ? this.textOf(aliases[0]) : '';
      const nextKey = `${this.idFor(conversation)}:${alias.toLocaleLowerCase()}`;
      const changed = nextKey !== this.conversationKey;
      if (changed) {
        this.clearBaselineTimer();
        this.conversationKey = nextKey;
        this.seen.clear();
        this.seenOrder = [];
        this.hasBaseline = false;
        this.baselineMessages = [];
        this.currentMessages = [];
      }

      const fallbackOccurrences = new Map();
      const messages = rows.map((row, domOrder) => {
        const direction = this.directionOf(row);
        const text = this.messageTextOf(row);
        const time = this.selectors.timestamp ? this.textOf(row, this.selectors.timestamp) : '';
        const explicitId = row.getAttribute?.('data-message-id') || row.id || '';
        const nodeId = this.idFor(row);
        let fingerprint = explicitId ? `id:${explicitId}` : this.fingerprints.get(row);
        if (!fingerprint) {
          const occurrenceKey = `${this.conversationKey}\u001f${direction}\u001f${time}\u001f${text.replace(/\s+/g, ' ').trim().toLocaleLowerCase()}`;
          const occurrence = fallbackOccurrences.get(occurrenceKey) || 0;
          fallbackOccurrences.set(occurrenceKey, occurrence + 1);
          fingerprint = `hash:${this.hashFingerprint(`${occurrenceKey}\u001f${occurrence}`)}`;
        }
        this.fingerprints.set(row, fingerprint);
        const sender = direction === 'incoming' ? 'interlocutor' : direction === 'outgoing' ? 'user' : direction;
        return {
          id: fingerprint, messageId: fingerprint, fingerprint,
          conversationId: this.conversationKey,
          direction, sender, text, content: text, time, timestamp: time || null,
          domOrder, order: domOrder, timeOrder: this.timestampOrder(time), nodeId,
        };
      }).filter((item) => item.text);
      if (messages.length > 1 && messages.every((item) => item.timeOrder !== null)) {
        messages.sort((a, b) => a.timeOrder - b.timeOrder || a.domOrder - b.domOrder);
      }
      messages.forEach((item, order) => { item.order = order; });

      const snapshot = {
        status: aliases.length !== 1 ? 'alias-unidentified' : this.hasBaseline
          ? 'observing' : messages.length ? 'baseline' : 'baseline-empty',
        alias: alias || null,
        conversationKey: this.conversationKey,
        changed,
        counts: {
          total: messages.length,
          incoming: messages.filter((item) => item.direction === 'incoming').length,
          outgoing: messages.filter((item) => item.direction === 'outgoing').length,
          system: messages.filter((item) => item.direction === 'system').length,
          unclassified: messages.filter((item) => item.direction === 'unknown').length,
        },
        messages: messages.slice(-100).map(({ id, messageId, conversationId, direction, sender, text, content, time, timestamp, fingerprint, domOrder, order }) => ({
          id, messageId, conversationId, direction, sender, text, content, time, timestamp, fingerprint, domOrder, order,
        })),
      };
      this.currentMessages = messages;
      this.onUpdate(snapshot);

      // Wait for the visible chat DOM to settle; late history hydration becomes baseline too.
      if (!this.hasBaseline) {
        this.baselineMessages = messages;
        for (const item of messages) this.remember(item.fingerprint);
        if (snapshot.alias) this.scheduleBaseline(this.conversationKey);
        else this.clearBaselineTimer();
        return snapshot;
      }
      for (const item of messages) {
        if (!this.remember(item.fingerprint)) continue;
        if (item.direction === 'incoming' && snapshot.alias) {
          this.onIncoming({ message: item.text, snapshot, fingerprint: item.fingerprint });
        }
      }
      return snapshot;
    }
  }

  // Stable selectors derived from the real Stripchat DOM supplied for this task.
  // They are only candidates: diagnose() must verify the active page before use.
  ConversationDetector.stripchatSelectors = Object.freeze({
    conversation: '.messenger-chat.expanded',
    alias: '.chat-header-username .user-levels-username-text',
    message: '.messenger-chat__messages-wrapper > .base-message-wrapper[data-message-id]',
    incoming: '.counterpart-base-message-container',
    outgoing: '.base-message-wrapper.position-right',
    system: '',
    text: '.base-message',
    timestamp: '',
  });

  globalThis.PCAIConversationDetector = ConversationDetector;
  if (typeof module !== 'undefined' && module.exports) module.exports = ConversationDetector;
})();
