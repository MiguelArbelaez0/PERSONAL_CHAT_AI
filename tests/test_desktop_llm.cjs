const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

function desktopPage(overrides = {}) {
  const ids = [
    'status-card', 'status-icon', 'status-title', 'status-message', 'start-button', 'repair-button',
    'start-label', 'toast', 'chrome-status', 'chrome-connect-button', 'chrome-disconnect-button',
    'llm-status', 'llm-model-select', 'llm-model-details', 'llm-model-summary', 'llm-model-list',
    'llm-refresh-button', 'llm-save-button', 'llm-test-button', 'llm-step-count', 'llm-step-title',
    'llm-progress-bar', 'llm-back-button', 'llm-cancel-button', 'llm-next-button', 'llm-port-input',
    'llm-port-save-button', 'llm-recovery-panel', 'llm-recovery-button', 'llm-summary-backend',
    'llm-summary-server', 'llm-summary-model', 'llm-summary-test', 'llm-summary-chrome',
  ];
  const elements = new Map(ids.map((id) => [id, {
    id, value: id === 'llm-port-input' ? '1234' : '', textContent: '', dataset: {}, hidden: false, disabled: false,
    handlers: {}, children: [], classList: { add() {}, remove() {} },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    replaceChildren(...children) { this.children = [...children]; this.value = ''; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
  }]));
  const steps = Array.from({ length: 6 }, (_, index) => ({ dataset: { step: String(index) }, hidden: index !== 0 }));
  const defaultStatus = {
    serverAvailable: true,
    serverPort: 1234,
    models: [{ id: 'qwen/chat-4b', name: 'Qwen Chat 4B', state: 'loaded', loaded: true, maxContextLength: 8192, quantization: 'Q4_K_M', sizeBytes: 2_000_000_000 }],
    selectedModel: 'qwen/chat-4b', selectedModelAvailable: true, selectedModelLoaded: true,
    lastTestVerified: false, configRecoveryAvailable: false,
    message: 'El modelo elegido está disponible.',
  };
  let state = structuredClone(overrides.status || defaultStatus);
  let lmCalls = 0;
  let confirmations = 0;
  const calls = [];
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (command === 'start_service' || command === 'check_service' || command === 'repair_service') return { ready: true };
    if (command === 'chrome_connection_status') return { linked: false, message: 'Extensión aún no vinculada' };
    if (command === 'lm_studio_status') {
      lmCalls++;
      if (overrides.lmStatusError) throw new Error('synthetic');
      return structuredClone(state);
    }
    if (command === 'select_lm_model') {
      state.selectedModel = args.modelId;
      state.selectedModelAvailable = state.models.some((model) => model.id === args.modelId);
      state.selectedModelLoaded = state.models.find((model) => model.id === args.modelId)?.loaded ?? null;
      state.lastTestVerified = false;
      return undefined;
    }
    if (command === 'load_and_select_lm_model') {
      const model = state.models.find((item) => item.id === args.modelId);
      if (!model || model.type === 'embedding' || overrides.loadError) throw 'No se pudo cargar el modelo. Comprueba el espacio de memoria en LM Studio.';
      model.loaded = true;
      model.state = 'loaded';
      state.selectedModel = args.modelId;
      state.selectedModelAvailable = true;
      state.selectedModelLoaded = true;
      state.lastTestVerified = false;
      return 'Modelo cargado y seleccionado en 2.81 s. Puedes ejecutar la prueba sintética.';
    }
    if (command === 'set_lm_studio_port') { state.serverPort = args.port; return undefined; }
    if (command === 'recover_corrupt_lm_settings') {
      if (!args.confirmed) throw new Error('confirmation required');
      state.configError = null;
      state.configRecoveryAvailable = false;
      state.selectedModel = null;
      state.lastTestVerified = false;
      return 'Configuración nueva creada. La anterior quedó guardada en una copia de seguridad.';
    }
    if (command === 'test_lm_generation') {
      if (overrides.testError) throw 'La prueba tardó demasiado. Vuelve a intentarlo.';
      state.lastTestVerified = true;
      return 'La prueba de generación terminó correctamente. Duración: 0.96 s.';
    }
    throw new Error(`unexpected command ${command}`);
  };
  vm.runInNewContext(fs.readFileSync('desktop-tauri/ui/app.js', 'utf8'), {
    document: {
      querySelector: (selector) => elements.get(selector.slice(1)),
      querySelectorAll: (selector) => selector === '.llm-step' ? steps : [],
      createElement: () => ({ value: '', textContent: '', children: [], append(...children) { this.children.push(...children); } }),
      activeElement: null,
    },
    window: { __TAURI__: { core: { invoke } }, setInterval() {}, confirm() { confirmations++; return overrides.confirmRecovery ?? true; } },
    setTimeout() { return 1; }, clearTimeout() {},
  });
  return { elements, calls, steps, get state() { return state; }, get lmCalls() { return lmCalls; }, get confirmations() { return confirmations; } };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function goTo(page, step) {
  while (Number(page.elements.get('llm-progress-bar').value) < step + 1) {
    const next = page.elements.get('llm-next-button');
    assert.equal(next.disabled, false, `step ${step} should be reachable (current=${page.elements.get('llm-progress-bar').value}, state=${JSON.stringify(page.state)})`);
    await next.handlers.click();
    await settle();
  }
}

test('backend readiness is separate and wizard starts with accessible progress', async () => {
  const page = desktopPage();
  await settle();
  assert.equal(page.elements.get('status-title').textContent, 'Backend preparado');
  assert.equal(page.elements.get('llm-step-count').textContent, 'Paso 1 de 6');
  assert.equal(page.steps[0].hidden, false);
  assert.match(page.elements.get('status-message').textContent, /Comprueba también el modelo/);
});

test('first setup detects a disconnected server without claiming LM Studio is absent', async () => {
  const page = desktopPage({ status: {
    serverAvailable: false, serverPort: 1234, models: [], selectedModel: null,
    selectedModelAvailable: false, lastTestVerified: false, configRecoveryAvailable: false,
    message: 'No se detectó un servidor local de LM Studio en el puerto configurado.',
  } });
  await settle();
  await page.elements.get('llm-next-button').handlers.click();
  await settle();
  assert.match(page.elements.get('llm-status').textContent, /No se detectó un servidor local/);
  assert.equal(page.elements.get('llm-next-button').disabled, true);
  assert.equal(page.calls.filter((call) => call.command === 'lm_studio_status').length, 2, 'entry performs one refresh');
});

test('model discovery displays only the conversational catalog returned by Tauri', async () => {
  const page = desktopPage({ status: {
    serverAvailable: true, serverPort: 1234,
    models: [
      { id: 'chat/a', name: 'Conversación A', type: 'llm', loaded: true },
      { id: 'chat/b', name: 'Conversación B', type: 'llm', loaded: false },
    ], selectedModel: null, selectedModelAvailable: false, lastTestVerified: false,
    configRecoveryAvailable: false, message: 'Elige un modelo.',
  } });
  await settle();
  await goTo(page, 1);
  await goTo(page, 2);
  assert.match(page.elements.get('llm-model-summary').textContent, /Encontramos 2 modelos/);
  assert.deepEqual(page.elements.get('llm-model-list').children.map((item) => item.children[0].textContent), ['Conversación A', 'Conversación B']);
  assert.equal(page.elements.get('llm-model-list').children[1].children[1].textContent, 'Necesita cargarse');
});

test('empty catalog blocks continuation and gives official LM Studio guidance', async () => {
  const page = desktopPage({ status: { serverAvailable: true, serverPort: 1234, models: [], selectedModel: null, selectedModelAvailable: false, lastTestVerified: false, configRecoveryAvailable: false, message: 'No hay modelos.' } });
  await settle();
  await goTo(page, 1);
  await goTo(page, 2);
  assert.equal(page.elements.get('llm-next-button').disabled, true);
  assert.match(page.elements.get('llm-model-summary').textContent, /no ofrece modelos conversacionales/);
});

test('selection is saved only by the user before advancing to the synthetic test', async () => {
  const page = desktopPage({ status: {
    serverAvailable: true, serverPort: 1234,
    models: [
      { id: 'chat/a', name: 'Chat A', loaded: true },
      { id: 'chat/b', name: 'Chat B', loaded: true },
    ], selectedModel: 'chat/a', selectedModelAvailable: true, selectedModelLoaded: true,
    lastTestVerified: false, configRecoveryAvailable: false, message: 'Elige un modelo.',
  } });
  await settle();
  await goTo(page, 1); await goTo(page, 2); await goTo(page, 3);
  const select = page.elements.get('llm-model-select');
  select.value = 'chat/b';
  await select.handlers.change();
  assert.equal(page.elements.get('llm-save-button').disabled, false);
  await page.elements.get('llm-save-button').handlers.click();
  await settle();
  assert.ok(page.calls.some((call) => call.command === 'select_lm_model' && call.args.modelId === 'chat/b'));
  assert.equal(page.elements.get('llm-next-button').disabled, false);
  await goTo(page, 4);
  assert.equal(page.calls.filter((call) => call.command === 'test_lm_generation').length, 0);
  await page.elements.get('llm-test-button').handlers.click();
  await settle();
  assert.equal(page.calls.filter((call) => call.command === 'test_lm_generation').length, 1);
  assert.match(page.elements.get('llm-status').textContent, /Duración: 0\.96 s/);
  assert.equal(page.elements.get('llm-next-button').disabled, false);
  await goTo(page, 5);
  assert.match(page.elements.get('llm-summary-test').textContent, /Verificada/);
  assert.match(page.elements.get('llm-summary-chrome').textContent, /Extensión aún no vinculada/);
});

test('loading an installed model requires a clear user action and updates its real state', async () => {
  const page = desktopPage({ status: {
    serverAvailable: true, serverPort: 1234,
    models: [{ id: 'chat/unloaded', name: 'Chat unloaded', type: 'llm', loaded: false }],
    selectedModel: null, selectedModelAvailable: false, selectedModelLoaded: null,
    lastTestVerified: false, configRecoveryAvailable: false, message: 'Elige un modelo.',
  } });
  await settle(); await goTo(page, 1); await goTo(page, 2); await goTo(page, 3);
  const select = page.elements.get('llm-model-select');
  select.value = 'chat/unloaded';
  await select.handlers.change();
  assert.equal(page.elements.get('llm-save-button').textContent, 'Cargar y seleccionar');
  await page.elements.get('llm-save-button').handlers.click(); await settle();
  assert.equal(page.confirmations, 1);
  assert.ok(page.calls.some((call) => call.command === 'load_and_select_lm_model' && call.args.modelId === 'chat/unloaded'));
  assert.equal(page.state.models[0].loaded, true);
  assert.equal(page.state.selectedModel, 'chat/unloaded');
  assert.match(page.elements.get('llm-status').textContent, /2\.81 s/);
});

test('failed model load remains recoverable and does not save selection', async () => {
  const page = desktopPage({ loadError: true, status: {
    serverAvailable: true, serverPort: 1234,
    models: [{ id: 'chat/unloaded', name: 'Chat unloaded', type: 'llm', loaded: false }],
    selectedModel: null, selectedModelAvailable: false, selectedModelLoaded: null,
    lastTestVerified: false, configRecoveryAvailable: false, message: 'Elige un modelo.',
  } });
  await settle(); await goTo(page, 1); await goTo(page, 2); await goTo(page, 3);
  const select = page.elements.get('llm-model-select');
  select.value = 'chat/unloaded'; await select.handlers.change();
  await page.elements.get('llm-save-button').handlers.click(); await settle();
  assert.equal(page.state.selectedModel, null);
  assert.equal(page.state.models[0].loaded, false);
  assert.match(page.elements.get('llm-status').textContent, /No se pudo cargar/);
  assert.equal(page.elements.get('llm-save-button').disabled, false);
});

test('declining model load leaves the persisted selection unchanged', async () => {
  const page = desktopPage({ confirmRecovery: false, status: {
    serverAvailable: true, serverPort: 1234,
    models: [{ id: 'chat/unloaded', name: 'Chat unloaded', type: 'llm', loaded: false }],
    selectedModel: null, selectedModelAvailable: false, selectedModelLoaded: null,
    lastTestVerified: false, configRecoveryAvailable: false, message: 'Elige un modelo.',
  } });
  await settle(); await goTo(page, 1); await goTo(page, 2); await goTo(page, 3);
  const select = page.elements.get('llm-model-select');
  select.value = 'chat/unloaded'; await select.handlers.change();
  await page.elements.get('llm-save-button').handlers.click(); await settle();
  assert.equal(page.calls.some((call) => call.command === 'load_and_select_lm_model'), false);
  assert.equal(page.state.selectedModel, null);
});

test('cancel returns to welcome without saving an uncommitted port or selection', async () => {
  const page = desktopPage();
  await settle();
  await goTo(page, 1);
  page.elements.get('llm-port-input').value = '4321';
  await page.elements.get('llm-cancel-button').handlers.click();
  assert.equal(page.elements.get('llm-step-count').textContent, 'Paso 1 de 6');
  assert.equal(page.elements.get('llm-port-input').value, '1234');
  assert.equal(page.calls.some((call) => call.command === 'set_lm_studio_port'), false);
  assert.equal(page.calls.some((call) => call.command === 'select_lm_model'), false);
});

test('advanced port rejects invalid values and persists only a numeric loopback port', async () => {
  const page = desktopPage();
  await settle();
  const input = page.elements.get('llm-port-input');
  input.value = '70000';
  await page.elements.get('llm-port-save-button').handlers.click();
  assert.equal(page.calls.some((call) => call.command === 'set_lm_studio_port'), false);
  input.value = '4321';
  await page.elements.get('llm-port-save-button').handlers.click();
  await settle();
  assert.ok(page.calls.some((call) => call.command === 'set_lm_studio_port' && call.args.port === 4321));
  assert.equal(page.elements.get('llm-port-input').value, '4321');
});

test('corrupt settings require consent before recovery, and cancellation leaves the file untouched', async () => {
  const declined = desktopPage({ confirmRecovery: false, status: {
    serverAvailable: false, serverPort: 1234, models: [], selectedModel: null,
    selectedModelAvailable: false, configError: 'Configuración ilegible.', configRecoveryAvailable: true,
    lastTestVerified: false, message: 'Configuración ilegible.',
  } });
  await settle(); await goTo(declined, 1);
  assert.equal(declined.elements.get('llm-recovery-panel').hidden, false);
  await declined.elements.get('llm-recovery-button').handlers.click();
  assert.equal(declined.confirmations, 1);
  assert.equal(declined.calls.some((call) => call.command === 'recover_corrupt_lm_settings'), false);

  const accepted = desktopPage({ status: {
    serverAvailable: true, serverPort: 1234, models: [], selectedModel: null,
    selectedModelAvailable: false, configError: 'Configuración ilegible.', configRecoveryAvailable: true,
    lastTestVerified: false, message: 'Configuración ilegible.',
  } });
  await settle(); await goTo(accepted, 1);
  await accepted.elements.get('llm-recovery-button').handlers.click();
  await settle();
  assert.ok(accepted.calls.some((call) => call.command === 'recover_corrupt_lm_settings' && call.args.confirmed === true));
  assert.equal(accepted.elements.get('llm-recovery-panel').hidden, true);
  assert.match(accepted.elements.get('llm-status').textContent, /copia de seguridad/);
});

test('generation timeout remains recoverable and does not mark the model verified', async () => {
  const page = desktopPage({ testError: true });
  await settle(); await goTo(page, 1); await goTo(page, 2); await goTo(page, 3);
  await page.elements.get('llm-save-button').handlers.click(); await settle();
  await goTo(page, 4);
  await page.elements.get('llm-test-button').handlers.click(); await settle();
  assert.match(page.elements.get('llm-status').textContent, /tardó demasiado/);
  assert.equal(page.elements.get('llm-next-button').disabled, true);
  assert.equal(page.elements.get('llm-test-button').disabled, false);
});
