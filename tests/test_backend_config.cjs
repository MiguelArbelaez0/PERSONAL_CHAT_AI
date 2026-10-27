const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const config = require('../extension/backend-config.js');

test('backend default is loopback port 8000 and legacy default URLs migrate without losing custom ports', () => {
  assert.equal(config.DEFAULT_URL, 'http://127.0.0.1:8000');
  assert.deepEqual(config.resolveStoredBackendUrl(undefined), { url: config.DEFAULT_URL, migrated: false });
  assert.deepEqual(config.resolveStoredBackendUrl('http://127.0.0.1:8765'), { url: config.DEFAULT_URL, migrated: true });
  assert.deepEqual(config.resolveStoredBackendUrl('http://localhost:8765/'), { url: config.DEFAULT_URL, migrated: true });
  assert.deepEqual(config.resolveStoredBackendUrl('http://127.0.0.1:9001'), { url: 'http://127.0.0.1:9001', migrated: false });
});

test('backend URL accepts only local HTTP origins without credentials, paths, query or fragment', () => {
  assert.equal(config.normalizeBackendUrl('http://127.0.0.1:8123/'), 'http://127.0.0.1:8123');
  for (const url of [
    'https://127.0.0.1:8000', 'http://localhost:8000', 'http://[::1]:8000',
    'http://192.168.1.2:8000', 'http://user:pass@127.0.0.1:8000',
    'http://127.0.0.1:8000/api', 'http://127.0.0.1:8000/?x=1',
  ]) assert.throws(() => config.normalizeBackendUrl(url), /URL del backend/);
});

test('permission check covers configured loopback ports only when declared in Chrome host_permissions', () => {
  assert.equal(config.isCoveredByHostPermissions('http://127.0.0.1:8000', ['http://127.0.0.1/*']), true);
  assert.equal(config.isCoveredByHostPermissions('http://127.0.0.1:9123', ['http://127.0.0.1/*']), true);
  assert.equal(config.isCoveredByHostPermissions('http://127.0.0.1:9123', ['http://127.0.0.1:8000/*']), false);
  assert.equal(config.isCoveredByHostPermissions('http://127.0.0.1:8000', ['http://example.com/*']), false);
});

test('manifest grants local loopback host access and loads the URL config before the panel', () => {
  const manifest = JSON.parse(fs.readFileSync(require.resolve('../extension/manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1/*'));
  assert.ok(!manifest.host_permissions.some((pattern) => /8765/.test(pattern)));
  assert.ok(manifest.content_scripts[0].js.indexOf('backend-config.js') < manifest.content_scripts[0].js.indexOf('content.js'));
  assert.equal(manifest.minimum_chrome_version, '109');
  assert.ok(manifest.permissions.includes('offscreen'));
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, 'connection.html');
  assert.equal(manifest.options_page, 'connection.html');
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, 'connection.css', 'connection.js', 'offscreen.html', 'offscreen.js', 'offscreen-fetch-worker.js', ...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css]) {
    assert.ok(fs.existsSync(require('node:path').join(require('node:path').resolve(__dirname, '..'), 'extension', file)), `missing extension resource: ${file}`);
  }
});

test('environment example, backend defaults and Windows launchers use one port source', () => {
  const root = require('node:path').resolve(__dirname, '..');
  const example = fs.readFileSync(require('node:path').join(root, '.env.example'), 'utf8');
  assert.match(example, /^BACKEND_PORT=8000$/m);
  for (const script of ['INICIAR_PERSONAL_CHAT_AI.bat', 'VERIFICAR_PERSONAL_CHAT_AI.bat']) {
    const source = fs.readFileSync(require('node:path').join(root, script), 'utf8');
    assert.match(source, /from backend\.config import settings; print\(settings\.port\)/);
    assert.match(source, /127\.0\.0\.1:%BACKEND_PORT%\/api\/health/);
    assert.doesNotMatch(source, /127\.0\.0\.1:8765/);
  }
  const launcher = fs.readFileSync(require('node:path').join(root, 'INICIAR_PERSONAL_CHAT_AI.bat'), 'utf8');
  const verifier = fs.readFileSync(require('node:path').join(root, 'VERIFICAR_PERSONAL_CHAT_AI.bat'), 'utf8');
  assert.match(launcher, /"%PYTHON_EXE%" %PYTHON_ARGS% -c/);
  assert.match(verifier, /"%PY%" %PY_ARGS% -c/);
});
