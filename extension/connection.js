(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const state = $('#connection-state');
  const message = $('#page-message');
  const pairingInput = $('#pairing-code');
  const pairButton = $('#pair-button');
  const refreshButton = $('#refresh-button');
  const nativeConnectButton = $('#native-connect-button');
  const nativeDisconnectButton = $('#native-disconnect-button');

  async function send(messageData) {
    const reply = await chrome.runtime.sendMessage(messageData);
    if (!reply || reply.ok !== true) {
      const error = new Error(reply?.error?.message || 'La extensión no pudo completar la operación.');
      error.code = reply?.error?.code || 'extension_error';
      throw error;
    }
    return reply;
  }

  function renderState(text, kind = '') {
    state.textContent = text;
    state.dataset.state = kind;
  }

  function showMessage(text, kind = '') {
    message.textContent = text;
    message.dataset.state = kind;
  }

  function stateText(result) {
    if (result.state === 'connected') return ['Backend conectado · extensión vinculada.', 'connected'];
    if (result.state === 'not_paired') return ['Backend disponible · falta vincular la extensión.', 'warning'];
    if (result.state === 'token_rejected') return ['La vinculación necesita actualizarse. Puedes reconectar con la aplicación de Windows.', 'error'];
    if (result.state === 'origin_rejected') return ['La instalación de la extensión no coincide con la que está vinculada. Reconecta desde la aplicación de Windows.', 'error'];
    if (result.state === 'backend_error') return [`El backend respondió con HTTP ${Number(result.status) || 'desconocido'}.`, 'error'];
    return ['No se pudo conectar con el backend local. Comprueba que esté iniciado.', 'error'];
  }

  function renderNativeActions(result) {
    const connected = result.state === 'connected';
    nativeConnectButton.hidden = connected || result.backendAvailable === false;
    nativeDisconnectButton.hidden = !connected;
    nativeConnectButton.textContent = result.state === 'token_rejected' || result.state === 'origin_rejected'
      ? 'Reconectar' : 'Conectar';
    nativeConnectButton.disabled = false;
    nativeDisconnectButton.disabled = false;
  }

  async function refresh() {
    refreshButton.disabled = true;
    renderState('Comprobando el backend local…');
    try {
      const result = await send({ type: 'CONNECTION_STATUS' });
      const [text, kind] = stateText(result);
      renderState(text, kind);
      renderNativeActions(result);
    } catch (error) {
      renderState(error.message, 'error');
      nativeConnectButton.hidden = false;
      nativeDisconnectButton.hidden = true;
    } finally { refreshButton.disabled = false; }
  }

  async function loadBackendUrl() {
    try {
      const stored = await chrome.storage.local.get('backendUrl');
      const resolved = PCAIBackendConfig.resolveStoredBackendUrl(stored.backendUrl);
      $('#backend-url').value = resolved.url;
      if (resolved.migrated) await chrome.storage.local.set({ backendUrl: resolved.url });
    } catch (_) { $('#backend-url').value = PCAIBackendConfig.DEFAULT_URL; }
  }

  $('#backend-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const url = PCAIBackendConfig.normalizeBackendUrl($('#backend-url').value.trim());
      const permissions = chrome.runtime.getManifest()?.host_permissions || [];
      if (!PCAIBackendConfig.isCoveredByHostPermissions(url, permissions)) {
        throw new Error('Chrome no ha concedido permiso para esa dirección local. Recarga la extensión y vuelve a intentarlo.');
      }
      await chrome.storage.local.set({ backendUrl: url });
      showMessage('Dirección local guardada.', 'success');
      await refresh();
    } catch (error) { showMessage(error.message || 'No se pudo guardar la dirección.', 'error'); }
    finally { button.disabled = false; }
  });

  $('#pair-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pairButton.disabled) return;
    const pairingCode = pairingInput.value.trim();
    pairingInput.value = '';
    pairButton.disabled = true;
    showMessage('Canjeando código temporal…');
    try {
      const result = await send({ type: 'PAIR', pairingCode });
      if (!result.connected) throw new Error('El backend no confirmó el emparejamiento.');
      showMessage('Extensión vinculada. El token quedó guardado en almacenamiento privado de la extensión.', 'success');
      await refresh();
    } catch (error) {
      showMessage(error.message || 'No se pudo vincular la extensión.', 'error');
    } finally { pairButton.disabled = false; pairingInput.value = ''; }
  });

  nativeConnectButton.addEventListener('click', async () => {
    if (nativeConnectButton.disabled) return;
    const rotate = nativeConnectButton.textContent === 'Reconectar';
    if (rotate && !window.confirm('Reconectar revocará la vinculación anterior. ¿Quieres continuar?')) return;
    nativeConnectButton.disabled = true;
    showMessage('Conectando con la aplicación de Windows…');
    try {
      const result = await send({ type: 'NATIVE_PAIR', ...(rotate ? { rotate: true } : {}) });
      const [text, kind] = stateText(result);
      if (result.state !== 'connected') throw new Error(text);
      showMessage('Chrome quedó vinculado con PERSONAL_CHAT_AI.', 'success');
      renderState(text, kind);
      renderNativeActions(result);
    } catch (error) {
      showMessage(error.message || 'No se pudo conectar. Revisa que PERSONAL_CHAT_AI esté instalada.', 'error');
    } finally {
      nativeConnectButton.disabled = false;
      await refresh();
    }
  });

  nativeDisconnectButton.addEventListener('click', async () => {
    if (nativeDisconnectButton.disabled || !window.confirm('Se revocará la conexión con Chrome. ¿Quieres continuar?')) return;
    nativeDisconnectButton.disabled = true;
    showMessage('Desconectando Chrome…');
    try {
      const result = await send({ type: 'NATIVE_REVOKE' });
      if (result.disconnected !== true) throw new Error('La aplicación no confirmó la desconexión.');
      showMessage('Chrome quedó desconectado.', 'success');
    } catch (error) {
      showMessage(error.message || 'No se pudo desconectar Chrome.', 'error');
    } finally {
      nativeDisconnectButton.disabled = false;
      await refresh();
    }
  });

  refreshButton.addEventListener('click', () => { void refresh(); });
  void loadBackendUrl().then(refresh);
})();
