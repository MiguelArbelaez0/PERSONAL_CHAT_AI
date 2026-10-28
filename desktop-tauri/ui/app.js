const { invoke } = window.__TAURI__.core;
const card = document.querySelector('#status-card');
const icon = document.querySelector('#status-icon');
const title = document.querySelector('#status-title');
const message = document.querySelector('#status-message');
const startButton = document.querySelector('#start-button');
const repairButton = document.querySelector('#repair-button');
const startLabel = document.querySelector('#start-label');
const toast = document.querySelector('#toast');
const chromeStatus = document.querySelector('#chrome-status');
const chromeConnectButton = document.querySelector('#chrome-connect-button');
const chromeDisconnectButton = document.querySelector('#chrome-disconnect-button');
const llmStatus = document.querySelector('#llm-status');
const llmModelSelect = document.querySelector('#llm-model-select');
const llmModelDetails = document.querySelector('#llm-model-details');
const llmModelSummary = document.querySelector('#llm-model-summary');
const llmModelList = document.querySelector('#llm-model-list');
const llmRefreshButton = document.querySelector('#llm-refresh-button');
const llmSaveButton = document.querySelector('#llm-save-button');
const llmTestButton = document.querySelector('#llm-test-button');
const llmStepCount = document.querySelector('#llm-step-count');
const llmStepTitle = document.querySelector('#llm-step-title');
const llmProgressBar = document.querySelector('#llm-progress-bar');
const llmSteps = [...document.querySelectorAll('.llm-step')];
const llmBackButton = document.querySelector('#llm-back-button');
const llmCancelButton = document.querySelector('#llm-cancel-button');
const llmNextButton = document.querySelector('#llm-next-button');
const llmPortInput = document.querySelector('#llm-port-input');
const llmPortSaveButton = document.querySelector('#llm-port-save-button');
const llmRecoveryPanel = document.querySelector('#llm-recovery-panel');
const llmRecoveryButton = document.querySelector('#llm-recovery-button');
const llmSummaryBackend = document.querySelector('#llm-summary-backend');
const llmSummaryServer = document.querySelector('#llm-summary-server');
const llmSummaryModel = document.querySelector('#llm-summary-model');
const llmSummaryTest = document.querySelector('#llm-summary-test');
const llmSummaryChrome = document.querySelector('#llm-summary-chrome');

let busy = false;
let llmBusy = false;
let llmState = null;
let llmStep = 0;
let llmCompleted = false;
let toastTimer;

function renderStatus(state) {
  const ready = Boolean(state?.ready);
  card.dataset.state = ready ? 'ready' : 'error';
  icon.textContent = ready ? '✓' : '!';
  title.textContent = ready ? 'Backend preparado' : 'Aún no está listo';
  message.textContent = ready
    ? 'El servicio principal responde. Comprueba también el modelo de IA y Chrome antes de empezar.'
    : (state?.message || 'Pulsa Solucionar para intentarlo de nuevo.');
  startButton.disabled = busy || ready;
  repairButton.hidden = ready;
  startLabel.textContent = ready ? 'Iniciado' : 'Iniciar';
  renderSetupSummary();
  updateWizardControls();
}

function showWorking(label) {
  busy = true;
  card.dataset.state = 'checking';
  icon.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  title.textContent = label;
  message.textContent = 'Esto solo tomará un momento.';
  startButton.disabled = true;
  repairButton.disabled = true;
  startLabel.textContent = 'Preparando…';
}

async function inspectService() {
  try {
    const state = await invoke('check_service');
    renderStatus(state);
  } catch (_) {
    renderStatus({ ready: false, message: 'No pudimos comprobar el estado. Pulsa Solucionar para volver a intentarlo.' });
  }
}

async function runAction(action, label) {
  if (busy) return;
  showWorking(label);
  try {
    const state = await invoke(action);
    renderStatus(state);
  } catch (error) {
    renderStatus({ ready: false, message: 'No pudimos preparar el espacio. Pulsa Solucionar para intentarlo otra vez.' });
    showToast(typeof error === 'string' ? error : 'No pudimos completar el paso. Puedes volver a intentarlo.');
  } finally {
    busy = false;
    repairButton.disabled = false;
    await inspectService();
    await inspectLlm();
  }
}

function formatModelDetails(model) {
  const details = [];
  if (model.publisher) details.push(`Origen: ${model.publisher}`);
  if (model.architecture) details.push(model.architecture);
  if (model.parameterCount) details.push(model.parameterCount);
  if (model.quantization) details.push(model.quantization);
  if (model.maxContextLength) details.push(`Contexto máximo: ${Number(model.maxContextLength).toLocaleString('es-ES')} tokens`);
  if (model.sizeBytes) details.push(`${(Number(model.sizeBytes) / (1024 ** 3)).toFixed(1)} GB`);
  if (model.loaded === true) details.push('cargado');
  if (model.loaded === false) details.push('necesita cargarse en LM Studio');
  return details.join(' · ');
}

function renderLlmStatus(state, notice = '') {
  llmState = state;
  const models = Array.isArray(state?.models) ? state.models : [];
  const saved = state?.selectedModel || '';
  const oldChoice = llmModelSelect.value;
  const selected = models.some((model) => model.id === oldChoice) ? oldChoice : saved;
  llmModelSelect.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = models.length ? 'Elige un modelo de conversación' : 'No hay modelos compatibles';
  llmModelSelect.appendChild(placeholder);
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name && model.name !== model.id ? `${model.name} · ${model.id}` : model.id;
    llmModelSelect.appendChild(option);
  }
  if (saved && !models.some((model) => model.id === saved)) {
    const missing = document.createElement('option');
    missing.value = saved;
    missing.textContent = 'El modelo guardado ya no está disponible';
    llmModelSelect.appendChild(missing);
  }
  llmModelSelect.value = selected || '';
  const selectedModel = models.find((model) => model.id === llmModelSelect.value);
  llmModelDetails.textContent = selectedModel ? formatModelDetails(selectedModel) : '';
  llmModelSummary.textContent = models.length
    ? `Encontramos ${models.length} modelo${models.length === 1 ? '' : 's'} de conversación.`
    : (state?.serverAvailable ? 'LM Studio respondió, pero no ofrece modelos conversacionales compatibles.' : 'No hay conexión con el servidor local de LM Studio.');
  llmModelList.replaceChildren();
  for (const model of models) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    const availability = document.createElement('span');
    name.textContent = model.name || model.id;
    availability.textContent = model.loaded === true ? 'Cargado' : model.loaded === false ? 'Necesita cargarse' : 'Estado no informado';
    item.append(name, availability);
    llmModelList.appendChild(item);
  }

  if (state?.configError) {
    llmStatus.textContent = state.configError;
    llmStatus.dataset.state = 'error';
  } else if (notice) {
    llmStatus.textContent = notice;
    llmStatus.dataset.state = 'ready';
  } else {
    llmStatus.textContent = state?.message || 'No pudimos comprobar el motor de IA.';
    llmStatus.dataset.state = state?.serverAvailable ? (state?.selectedModelAvailable ? 'ready' : 'checking') : 'error';
  }

  llmModelSelect.disabled = llmBusy || models.length === 0;
  llmRefreshButton.disabled = llmBusy;
  if (document.activeElement !== llmPortInput) llmPortInput.value = String(state?.serverPort || 1234);
  llmPortSaveButton.disabled = llmBusy;
  llmRecoveryPanel.hidden = !state?.configRecoveryAvailable;
  llmRecoveryButton.disabled = llmBusy || !state?.configRecoveryAvailable;
  const modelNeedsLoad = selectedModel?.loaded === false;
  llmSaveButton.textContent = modelNeedsLoad ? 'Cargar y seleccionar' : 'Guardar selección';
  llmSaveButton.disabled = llmBusy || !selectedModel || (selectedModel.id === saved && !modelNeedsLoad);
  llmTestButton.disabled = llmBusy || !state?.serverAvailable || !state?.selectedModelAvailable || state?.selectedModelLoaded === false;
  renderSetupSummary();
  updateWizardControls();
}

const llmStepTitles = ['Bienvenida', 'Detectar LM Studio', 'Detectar modelos', 'Seleccionar modelo', 'Probar generación', 'Finalización'];

function renderSetupSummary() {
  llmSummaryBackend.textContent = card.dataset.state === 'ready' ? 'Disponible' : 'No disponible';
  llmSummaryServer.textContent = llmState?.serverAvailable ? 'Conectado' : 'No conectado';
  llmSummaryModel.textContent = llmState?.selectedModelAvailable ? llmState.selectedModel : 'Sin seleccionar';
  llmSummaryTest.textContent = llmState?.lastTestVerified ? 'Verificada' : 'Pendiente';
  llmSummaryChrome.textContent = chromeStatus.textContent || 'Se comprueba por separado';
}

function updateWizardControls() {
  llmSteps.forEach((panel, index) => { panel.hidden = index !== llmStep; });
  llmStepCount.textContent = `Paso ${llmStep + 1} de ${llmSteps.length}`;
  llmStepTitle.textContent = llmStepTitles[llmStep];
  llmProgressBar.value = llmStep + 1;
  llmBackButton.disabled = llmStep === 0 || llmBusy;
  llmCancelButton.hidden = llmStep === 0 || llmCompleted;
  llmNextButton.disabled = llmBusy
    || (llmStep === 1 && (!llmState?.serverAvailable || Boolean(llmState?.configError)))
    || (llmStep === 2 && (!llmState?.serverAvailable || !llmState?.models?.length))
    || (llmStep === 3 && (!llmState?.selectedModelAvailable || llmState?.selectedModelLoaded === false))
    || (llmStep === 4 && !llmState?.lastTestVerified)
    || (llmStep === 5 && llmCompleted);
  llmNextButton.textContent = llmStep === 0 ? 'Comenzar' : llmStep === 5 ? (llmCompleted ? 'Configuración lista' : 'Finalizar') : 'Continuar';
}

function setLlmStep(step) {
  llmStep = Math.max(0, Math.min(llmSteps.length - 1, step));
  updateWizardControls();
}

llmNextButton.addEventListener('click', () => {
  if (llmNextButton.disabled) return;
  if (llmStep === 5) {
    llmCompleted = true;
    showToast('Configuración de IA finalizada. Chrome mantiene su estado independiente.');
    updateWizardControls();
    return;
  }
  setLlmStep(llmStep + 1);
  if (llmStep === 1 && !llmState?.serverAvailable) void refreshLlm();
});
llmBackButton.addEventListener('click', () => setLlmStep(llmStep - 1));
llmCancelButton.addEventListener('click', () => {
  llmCompleted = false;
  if (llmState?.serverPort) llmPortInput.value = String(llmState.serverPort);
  setLlmStep(0);
  showToast('Asistente pausado. La selección guardada y los ajustes anteriores se conservaron.');
});

async function inspectLlm() {
  try {
    renderLlmStatus(await invoke('lm_studio_status'));
  } catch (_) {
    renderLlmStatus({ serverAvailable: false, models: [], message: 'No pudimos comprobar LM Studio. Puedes actualizar la lista para volver a intentarlo.' });
  }
}

async function refreshLlm() {
  if (llmBusy) return;
  llmBusy = true;
  llmRefreshButton.disabled = true;
  llmStatus.textContent = 'Buscando modelos de conversación…';
  llmStatus.dataset.state = 'checking';
  try {
    renderLlmStatus(await invoke('lm_studio_status'));
  } catch (_) {
    renderLlmStatus({ serverAvailable: false, models: [], message: 'No se detectó un servidor local de LM Studio. Comprueba su estado e inténtalo de nuevo.' });
  } finally {
    llmBusy = false;
    renderLlmStatus(llmState || { serverAvailable: false, models: [], message: 'No pudimos comprobar LM Studio.' });
  }
}

llmRefreshButton.addEventListener('click', refreshLlm);
llmModelSelect.addEventListener('change', () => {
  const model = llmState?.models?.find((item) => item.id === llmModelSelect.value);
  llmModelDetails.textContent = model ? formatModelDetails(model) : '';
  const needsLoad = model?.loaded === false;
  llmSaveButton.textContent = needsLoad ? 'Cargar y seleccionar' : 'Guardar selección';
  llmSaveButton.disabled = llmBusy || !model || (model.id === llmState?.selectedModel && !needsLoad);
});

llmSaveButton.addEventListener('click', async () => {
  if (llmBusy || !llmModelSelect.value) return;
  llmBusy = true;
  let notice = '';
  let failed = false;
  renderLlmStatus(llmState);
  llmStatus.textContent = 'Guardando el modelo y preparando el asistente…';
  llmStatus.dataset.state = 'checking';
  try {
    const selectedModel = llmState?.models?.find((model) => model.id === llmModelSelect.value);
    if (selectedModel?.loaded === false) {
      const consent = window.confirm('Cargar este modelo ocupará memoria del equipo mientras LM Studio lo mantenga activo. PERSONAL_CHAT_AI no descargará ni cerrará otros modelos. ¿Quieres cargarlo y seleccionarlo?');
      if (!consent) return;
      notice = await invoke('load_and_select_lm_model', { modelId: llmModelSelect.value });
    } else {
      await invoke('select_lm_model', { modelId: llmModelSelect.value });
      notice = 'Modelo guardado. El asistente ya usará esta selección.';
    }
    await inspectService();
    llmState = await invoke('lm_studio_status');
  } catch (error) {
    failed = true;
    notice = typeof error === 'string' ? error : 'No pudimos guardar ese modelo. Actualiza la lista e inténtalo otra vez.';
    showToast(typeof error === 'string' ? error : 'No pudimos guardar ese modelo. Actualiza la lista e inténtalo otra vez.');
    await inspectLlm();
  } finally {
    llmBusy = false;
    renderLlmStatus(llmState, notice);
    if (notice) llmStatus.dataset.state = failed ? 'error' : 'ready';
  }
});

llmTestButton.addEventListener('click', async () => {
  if (llmBusy) return;
  llmBusy = true;
  let notice = '';
  let failed = false;
  renderLlmStatus(llmState);
  llmStatus.textContent = 'Probando una respuesta breve…';
  llmStatus.dataset.state = 'checking';
  try {
    notice = await invoke('test_lm_generation');
    llmState = await invoke('lm_studio_status');
  } catch (error) {
    failed = true;
    notice = typeof error === 'string' ? error : 'La prueba no terminó. Comprueba que el modelo esté cargado y vuelve a intentarlo.';
    try { llmState = await invoke('lm_studio_status'); } catch (_) { /* Keep the recoverable test message visible. */ }
  } finally {
    llmBusy = false;
    renderLlmStatus(llmState, notice);
    llmStatus.dataset.state = failed ? 'error' : 'ready';
  }
});

llmPortSaveButton.addEventListener('click', async () => {
  if (llmBusy) return;
  const port = Number(llmPortInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showToast('Escribe un puerto entre 1 y 65535.');
    return;
  }
  llmBusy = true;
  llmStatus.textContent = 'Guardando la conexión local…';
  llmStatus.dataset.state = 'checking';
  updateWizardControls();
  try {
    await invoke('set_lm_studio_port', { port });
    await inspectService();
    llmState = await invoke('lm_studio_status');
    renderLlmStatus(llmState, 'Conexión local guardada. Actualiza la lista para detectar el motor.');
  } catch (error) {
    showToast(typeof error === 'string' ? error : 'No pudimos guardar ese puerto. Revisa el número e inténtalo de nuevo.');
    try { llmState = await invoke('lm_studio_status'); } catch (_) { /* Keep the recoverable error visible. */ }
    renderLlmStatus(llmState || { serverAvailable: false, models: [], message: 'No pudimos actualizar el estado.' });
  } finally {
    llmBusy = false;
    updateWizardControls();
  }
});

llmRecoveryButton.addEventListener('click', async () => {
  if (llmBusy || !llmState?.configRecoveryAvailable) return;
  const confirmed = window.confirm('La configuración actual no se puede leer. Se guardará una copia de seguridad antes de crear una nueva. ¿Quieres continuar?');
  if (!confirmed) return;
  llmBusy = true;
  updateWizardControls();
  try {
    const notice = await invoke('recover_corrupt_lm_settings', { confirmed: true });
    llmState = await invoke('lm_studio_status');
    renderLlmStatus(llmState, typeof notice === 'string' ? notice : 'Configuración recuperada. La anterior quedó respaldada.');
  } catch (error) {
    showToast(typeof error === 'string' ? error : 'No pudimos recuperar la configuración. El archivo anterior se conservó.');
    try { llmState = await invoke('lm_studio_status'); } catch (_) { /* Keep prior state visible. */ }
    renderLlmStatus(llmState || { serverAvailable: false, models: [], message: 'La configuración anterior se conservó.' });
  } finally {
    llmBusy = false;
    updateWizardControls();
  }
});

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4200);
}

async function inspectChromeConnection() {
  try {
    const result = await invoke('chrome_connection_status');
    chromeStatus.dataset.state = result.linked ? 'connected' : 'disconnected';
    chromeStatus.textContent = result.linked ? 'Extensión vinculada' : 'Extensión aún no vinculada';
    chromeConnectButton.textContent = result.linked ? 'Reconectar' : 'Conectar';
    chromeDisconnectButton.hidden = !result.linked;
  } catch (_) {
    chromeStatus.dataset.state = 'error';
    chromeStatus.textContent = 'No pudimos comprobar la conexión.';
    chromeDisconnectButton.hidden = true;
  }
  renderSetupSummary();
}

chromeConnectButton.addEventListener('click', async () => {
  chromeConnectButton.disabled = true;
  try {
    await invoke('open_chrome_connection');
    showToast('Chrome está abierto. Selecciona PERSONAL_CHAT_AI en el menú de extensiones para vincularla.');
  } catch (error) {
    showToast(typeof error === 'string' ? error : 'No pudimos abrir Chrome. Comprueba que esté instalado.');
  } finally {
    chromeConnectButton.disabled = false;
  }
});

chromeDisconnectButton.addEventListener('click', async () => {
  if (!window.confirm('Se revocará la conexión de PERSONAL_CHAT_AI con Chrome. ¿Quieres continuar?')) return;
  chromeDisconnectButton.disabled = true;
  try {
    const result = await invoke('disconnect_chrome_link');
    chromeStatus.dataset.state = 'disconnected';
    chromeStatus.textContent = result.message;
    chromeConnectButton.textContent = 'Conectar';
    chromeDisconnectButton.hidden = true;
    showToast('Chrome quedó desconectado.');
  } catch (error) {
    showToast(typeof error === 'string' ? error : 'No se pudo desconectar Chrome.');
  } finally {
    chromeDisconnectButton.disabled = false;
    await inspectChromeConnection();
  }
});

startButton.addEventListener('click', () => runAction('start_service', 'Preparando el servicio principal…'));
repairButton.addEventListener('click', () => runAction('repair_service', 'Vamos a solucionarlo…'));
void runAction('start_service', 'Iniciando el servicio principal…');
window.setInterval(() => {
  if (!busy) void inspectService();
}, 5000);
void inspectChromeConnection();
window.setInterval(() => void inspectChromeConnection(), 5000);
