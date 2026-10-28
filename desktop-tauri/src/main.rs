mod backend_integrity;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const BACKEND_PORT: u16 = 8000;
const DEFAULT_LM_STUDIO_PORT: u16 = 1234;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const HEALTH_TIMEOUT: Duration = Duration::from_millis(700);
const LM_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(6);
const LM_GENERATION_TIMEOUT: Duration = Duration::from_secs(60);
const LM_MODEL_LOAD_TIMEOUT: Duration = Duration::from_secs(180);
const LM_STUDIO_LOAD_CONTEXT_TOKENS: u64 = 8192;
const DEVELOPMENT_DATA_DIRECTORY: &str = "desktop-integration-v140";
const COMPILED_BACKEND_INTEGRITY_SHA256: Option<&str> =
    option_env!("PCAI_BACKEND_INTEGRITY_SHA256");

#[derive(Default)]
struct OwnedService(Mutex<ServiceProcess>);

#[derive(Default)]
struct ServiceProcess {
    child: Option<Child>,
    port: Option<u16>,
    log_path: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    ready: bool,
    title: &'static str,
    message: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChromeLinkStatus {
    linked: bool,
    message: &'static str,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LlmSettings {
    schema_version: u32,
    #[serde(default)]
    selected_model: Option<String>,
    #[serde(default = "default_lm_studio_port")]
    server_port: u16,
    #[serde(default)]
    last_tested_model: Option<String>,
    #[serde(default)]
    last_test_successful: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_load_duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_test_duration_ms: Option<u64>,
}

fn default_lm_studio_port() -> u16 {
    DEFAULT_LM_STUDIO_PORT
}

impl Default for LlmSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            selected_model: None,
            server_port: DEFAULT_LM_STUDIO_PORT,
            last_tested_model: None,
            last_test_successful: false,
            last_load_duration_ms: None,
            last_test_duration_ms: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LlmModel {
    id: String,
    name: String,
    publisher: Option<String>,
    architecture: Option<String>,
    parameter_count: Option<String>,
    state: String,
    loaded: Option<bool>,
    max_context_length: Option<u64>,
    quantization: Option<String>,
    size_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmStatus {
    server_available: bool,
    models: Vec<LlmModel>,
    selected_model: Option<String>,
    selected_model_available: bool,
    selected_model_loaded: Option<bool>,
    server_port: u16,
    last_test_verified: bool,
    config_error: Option<String>,
    config_recovery_available: bool,
    message: String,
}

fn status(ready: bool) -> ServiceStatus {
    if ready {
        ServiceStatus {
            ready: true,
            title: "Todo listo",
            message: "Tu asistente está preparado y funcionando.",
        }
    } else {
        ServiceStatus {
            ready: false,
            title: "Aún no está listo",
            message: "No pudimos iniciar un componente necesario. Pulsa Solucionar para volver a intentarlo.",
        }
    }
}

fn auth_file_is_linked(path: &Path) -> bool {
    let Ok(contents) = fs::read(path) else {
        return false;
    };
    let Ok(value) = serde_json::from_slice::<Value>(&contents) else {
        return false;
    };
    let Some(hash) = value.get("token_hash").and_then(Value::as_str) else {
        return false;
    };
    let Some(origin) = value.get("extension_origin").and_then(Value::as_str) else {
        return false;
    };
    hash.len() == 64
        && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        && origin
            .strip_prefix("chrome-extension://")
            .is_some_and(|id| {
                id.len() == 32 && id.bytes().all(|byte| (b'a'..=b'p').contains(&byte))
            })
}

fn chrome_executable() -> Option<PathBuf> {
    ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .map(|root| root.join("Google/Chrome/Application/chrome.exe"))
        .find(|candidate| candidate.is_file())
}

fn production_storage_root(local_app_data: &Path) -> PathBuf {
    // Tauri's current-user NSIS installer uses %LOCALAPPDATA%\PERSONAL_CHAT_AI
    // for binaries. Store durable data in a sibling tree, outside the uninstaller's scope.
    local_app_data.join("PERSONAL_CHAT_AI_DATA")
}

fn development_storage_root(temp_root: &Path) -> PathBuf {
    temp_root
        .join("PERSONAL_CHAT_AI")
        .join(DEVELOPMENT_DATA_DIRECTORY)
}

fn diagnostic_root() -> Result<PathBuf, &'static str> {
    #[cfg(debug_assertions)]
    {
        return Ok(development_storage_root(&std::env::temp_dir()));
    }

    #[cfg(not(debug_assertions))]
    {
        let local = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .map(|path| path.join("AppData").join("Local"))
            })
            .ok_or("No se pudo preparar el almacenamiento de la aplicación.")?;
        Ok(production_storage_root(&local))
    }
}

fn llm_settings_path() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        // Development configuration is stable across app restarts but isolated from release data.
        return Ok(std::env::temp_dir()
            .join("PERSONAL_CHAT_AI")
            .join("desktop-llm-setup-test")
            .join("config")
            .join("llm-settings.json"));
    }
    #[cfg(not(debug_assertions))]
    {
        let local = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .map(|p| p.join("AppData").join("Local"))
            })
            .ok_or_else(|| {
                "No se pudo encontrar el almacenamiento de la aplicación.".to_string()
            })?;
        Ok(production_storage_root(&local)
            .join("PERSONAL_CHAT_AI")
            .join("config")
            .join("llm-settings.json"))
    }
}

fn validate_model_id(value: &str) -> bool {
    !value.is_empty()
        && value.trim() == value
        && value.len() <= 255
        && !value.chars().any(char::is_control)
}

fn read_llm_settings(path: &Path) -> Result<LlmSettings, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LlmSettings::default())
        }
        Err(_) => return Err("No pudimos leer la configuración de IA. No se modificó.".into()),
    };
    let settings: LlmSettings = serde_json::from_slice(&bytes).map_err(|_| {
        "La configuración de IA no se puede leer. Se conservó sin cambios.".to_string()
    })?;
    if settings.schema_version != 1
        || settings.server_port == 0
        || settings
            .selected_model
            .as_deref()
            .is_some_and(|model| !validate_model_id(model))
        || settings
            .last_tested_model
            .as_deref()
            .is_some_and(|model| !validate_model_id(model))
    {
        return Err("La configuración de IA tiene un formato o versión no compatible. Se conservó sin cambios.".into());
    }
    Ok(settings)
}

fn config_recovery_available(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return true;
    };
    let Some(version) = value.get("schemaVersion").and_then(Value::as_u64) else {
        return true;
    };
    if version != 1 {
        return false;
    }
    serde_json::from_value::<LlmSettings>(value.clone()).map_or(true, |settings| {
        settings.server_port == 0
            || settings
                .selected_model
                .as_deref()
                .is_some_and(|model| !validate_model_id(model))
            || settings
                .last_tested_model
                .as_deref()
                .is_some_and(|model| !validate_model_id(model))
    })
}

fn backup_corrupt_settings(path: &Path) -> Result<PathBuf, String> {
    let bytes = fs::read(path)
        .map_err(|_| "No pudimos conservar una copia de la configuración anterior.".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "No pudimos preparar la copia de seguridad.".to_string())?;
    let backup = parent.join(format!(
        "llm-settings-backup-{}-{}.json",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&backup)
        .map_err(|_| {
            "No pudimos crear la copia de seguridad; el archivo original sigue intacto.".to_string()
        })?;
    if file
        .write_all(&bytes)
        .and_then(|_| file.sync_all())
        .is_err()
    {
        let _ = fs::remove_file(&backup);
        return Err(
            "No pudimos completar la copia de seguridad; el archivo original sigue intacto.".into(),
        );
    }
    Ok(backup)
}

fn validate_lm_studio_port(port: u16) -> Result<(), String> {
    if port == 0 {
        return Err("Escribe un puerto entre 1 y 65535.".into());
    }
    Ok(())
}

fn lm_studio_origin(port: u16) -> Result<String, String> {
    validate_lm_studio_port(port)?;
    Ok(format!("http://127.0.0.1:{port}"))
}

fn write_llm_settings(path: &Path, settings: &LlmSettings) -> Result<(), String> {
    if settings.schema_version != 1
        || settings.server_port == 0
        || settings
            .selected_model
            .as_deref()
            .is_some_and(|model| !validate_model_id(model))
        || settings
            .last_tested_model
            .as_deref()
            .is_some_and(|model| !validate_model_id(model))
    {
        return Err("No se pudo guardar esa selección de modelo.".into());
    }
    // Refuse to replace a corrupt or newer config; only valid current settings can be updated.
    let current = read_llm_settings(path)?;
    let _ = current;
    let parent = path
        .parent()
        .ok_or_else(|| "No se pudo preparar la configuración de IA.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "No se pudo preparar la configuración de IA.".to_string())?;
    let temp = parent.join(format!(
        ".llm-settings-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let bytes = serde_json::to_vec(settings)
        .map_err(|_| "No se pudo guardar la configuración de IA.".to_string())?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| "No se pudo preparar el guardado de la configuración de IA.".to_string())?;
    if file
        .write_all(&bytes)
        .and_then(|_| file.sync_all())
        .is_err()
    {
        let _ = fs::remove_file(&temp);
        return Err("No se pudo guardar la configuración de IA.".into());
    }
    drop(file);
    if fs::rename(&temp, path).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(
            "No se pudo actualizar la configuración de IA; la versión anterior se conservó.".into(),
        );
    }
    Ok(())
}

fn replace_corrupt_llm_settings(path: &Path, settings: &LlmSettings) -> Result<String, String> {
    if !config_recovery_available(path) {
        return Err("No encontramos una configuración dañada que necesite recuperación.".into());
    }
    backup_corrupt_settings(path)?;
    // Recovery is the only path allowed to replace a corrupt file, and its backup
    // is durable before this atomic replacement starts.
    let bytes = serde_json::to_vec(settings)
        .map_err(|_| "No pudimos preparar la configuración nueva.".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "No pudimos preparar la configuración nueva.".to_string())?;
    let temp = parent.join(format!(
        ".llm-recovery-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|_| {
            "La copia quedó protegida, pero no pudimos preparar la configuración nueva.".to_string()
        })?;
    if file
        .write_all(&bytes)
        .and_then(|_| file.sync_all())
        .is_err()
    {
        let _ = fs::remove_file(&temp);
        return Err(
            "La copia quedó protegida, pero no pudimos guardar la configuración nueva.".into(),
        );
    }
    drop(file);
    if fs::rename(&temp, path).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(
            "La copia de seguridad está intacta; no pudimos sustituir la configuración dañada."
                .into(),
        );
    }
    Ok("Configuración nueva creada. La anterior quedó guardada en una copia de seguridad.".into())
}

fn selected_model_for_backend() -> String {
    llm_settings_path()
        .ok()
        .and_then(|path| read_llm_settings(&path).ok())
        .and_then(|settings| settings.selected_model)
        .unwrap_or_default()
}

fn lm_studio_base_url() -> String {
    let port = llm_settings_path()
        .ok()
        .and_then(|path| read_llm_settings(&path).ok())
        .map(|settings| settings.server_port)
        .unwrap_or(DEFAULT_LM_STUDIO_PORT);
    format!("http://127.0.0.1:{port}/v1")
}

fn runtime_directories(root: &Path) -> Result<(PathBuf, PathBuf), String> {
    let local_app_data = root.to_path_buf();
    let app_data = local_app_data.join("PERSONAL_CHAT_AI");
    for path in [
        app_data.join("data"),
        app_data.join("legacy"),
        app_data.join("knowledge"),
        app_data.join("logs"),
    ] {
        fs::create_dir_all(path)
            .map_err(|_| "No se pudo preparar el almacenamiento de la aplicación.".to_string())?;
    }
    Ok((local_app_data, app_data))
}

fn backend_executable(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    {
        let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("backend-dist")
            .join("personal-chat-ai-backend")
            .join("personal-chat-ai-backend.exe");
        if development.is_file() {
            return Some(development);
        }
    }

    app.path()
        .resolve(
            "backend/personal-chat-ai-backend.exe",
            tauri::path::BaseDirectory::Resource,
        )
        .ok()
        .filter(|path| {
            path.is_file()
                && path.parent().is_some_and(|root| {
                    backend_integrity::verify_backend_package(
                        root,
                        COMPILED_BACKEND_INTEGRITY_SHA256,
                    )
                })
        })
}

fn child_is_running(process: &mut ServiceProcess) -> bool {
    let Some(child) = process.child.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(Some(_)) => {
            if let Some(path) = process.log_path.take() {
                log_event(&path, "backend_process_exited");
            }
            process.child = None;
            process.port = None;
            false
        }
        Ok(None) => true,
        Err(_) => {
            if let Some(path) = process.log_path.take() {
                log_event(&path, "backend_process_status_unavailable");
            }
            if let Some(mut child) = process.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            process.port = None;
            false
        }
    }
}

fn log_event(log_path: &Path, event: &str) {
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    // Events are fixed diagnostic codes. Request bodies, aliases, and credentials are never logged.
    let _ = writeln!(file, "{timestamp} {event}");
}

fn backend_command(
    executable: &Path,
    local_app_data: &Path,
    app_data: &Path,
    runtime_temp: &Path,
    log: &File,
) -> Command {
    let mut command = Command::new(executable);
    command.env_clear();
    for key in ["SystemRoot", "WINDIR"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    if let Some(system_root) = std::env::var_os("SystemRoot") {
        let root = PathBuf::from(system_root);
        let system_paths = [
            root.join("System32"),
            root.clone(),
            root.join("System32").join("Wbem"),
        ];
        if let Ok(path) = std::env::join_paths(system_paths) {
            command.env("PATH", path);
        }
    }
    command
        .current_dir(runtime_temp)
        .env("TEMP", runtime_temp)
        .env("TMP", runtime_temp)
        .env("LOCALAPPDATA", local_app_data)
        .env(
            "PCAI_DATABASE_PATH",
            app_data.join("data/personal_chat_ai_v2.sqlite3"),
        )
        .env(
            "DATABASE_PATH",
            app_data.join("legacy/personal_chat_ai.sqlite3"),
        )
        .env(
            "PERSONALITIES_DATABASE_PATH",
            app_data.join("legacy/personalities.sqlite3"),
        )
        .env("KNOWLEDGE_PATH", app_data.join("knowledge"))
        .env("BACKEND_HOST", "127.0.0.1")
        .env("BACKEND_PORT", BACKEND_PORT.to_string())
        .env("LM_STUDIO_BASE_URL", lm_studio_base_url())
        .env("LM_STUDIO_MODEL", selected_model_for_backend())
        .env("LM_STUDIO_TIMEOUT", "90")
        .env("LM_STUDIO_CONTEXT_TOKENS", "8192")
        .env("LM_STUDIO_OUTPUT_TOKENS", "1200")
        .env("DEFAULT_LANGUAGE", "es")
        .env("MAX_MESSAGE_CHARS", "4000")
        .env("MAX_CONTEXT_CHARS", "12000")
        .env("MEMORY_MAX_NOTES", "100")
        .env("LOG_LEVEL", "INFO")
        .stdout(Stdio::from(
            log.try_clone().expect("diagnostic log can be cloned"),
        ))
        .stderr(Stdio::from(
            log.try_clone().expect("diagnostic log can be cloned"),
        ));
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}

fn launch_backend(
    executable: &Path,
    local_app_data: &Path,
    app_data: &Path,
    log_path: &Path,
    process: &mut ServiceProcess,
) -> Result<ServiceStatus, String> {
    if child_is_running(process) {
        if process.port.is_some_and(health_check) {
            return Ok(status(true));
        }
        log_event(log_path, "backend_owned_process_unhealthy");
        stop_owned_service(process);
    }

    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|_| "No se pudo guardar el diagnóstico del inicio.".to_string())?;
    let runtime_temp = app_data.join("runtime-temp");
    fs::create_dir_all(&runtime_temp)
        .map_err(|_| "No se pudo preparar el almacenamiento de la aplicación.".to_string())?;
    let listener = TcpListener::bind(("127.0.0.1", BACKEND_PORT)).map_err(|_| {
        log_event(log_path, "backend_port_unavailable");
        "Otra aplicación está utilizando un componente necesario. Ciérrala y vuelve a intentarlo."
            .to_string()
    })?;
    drop(listener);

    let mut child = backend_command(executable, local_app_data, app_data, &runtime_temp, &log)
        .spawn()
        .map_err(|error| {
            log_event(
                log_path,
                if error.kind() == std::io::ErrorKind::NotFound {
                    "backend_executable_missing"
                } else {
                    "backend_spawn_failed"
                },
            );
            "No se pudo iniciar el asistente. Pulsa Solucionar para volver a intentarlo."
                .to_string()
        })?;
    process.port = Some(BACKEND_PORT);
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                process.port = None;
                log_event(log_path, "backend_exited_during_startup");
                return Err("El asistente se cerró antes de estar listo. Pulsa Solucionar para intentarlo otra vez.".into());
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                log_event(log_path, "backend_process_status_unavailable");
                return Err("No pudimos comprobar el inicio del asistente. Pulsa Solucionar para reintentarlo.".into());
            }
            Ok(None) => {}
        }
        if health_check(BACKEND_PORT) {
            process.child = Some(child);
            process.log_path = Some(log_path.to_path_buf());
            log_event(log_path, "backend_ready");
            return Ok(status(true));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            process.port = None;
            log_event(log_path, "backend_start_timeout");
            return Err(
                "El asistente tardó demasiado en iniciar. Pulsa Solucionar para reintentarlo."
                    .into(),
            );
        }
        sleep(Duration::from_millis(200));
    }
}

fn start_owned_service(
    app: &AppHandle,
    process: &mut ServiceProcess,
) -> Result<ServiceStatus, String> {
    let root = diagnostic_root().map_err(str::to_string)?;
    let (local_app_data, app_data) = runtime_directories(&root)?;
    let log_path = app_data.join("logs/backend.log");
    let executable = backend_executable(app).ok_or_else(|| {
        log_event(&log_path, "backend_executable_missing");
        "No se encontró un componente necesario para iniciar el asistente.".to_string()
    })?;
    launch_backend(&executable, &local_app_data, &app_data, &log_path, process)
}

fn stop_owned_service(process: &mut ServiceProcess) {
    if let Some(path) = process.log_path.as_deref() {
        log_event(path, "backend_stopped_by_application");
    }
    if let Some(mut child) = process.child.take() {
        // Only terminate and wait for the child this application spawned.
        let _ = child.kill();
        let _ = child.wait();
    }
    process.port = None;
    process.log_path = None;
}

fn health_check(port: u16) -> bool {
    let Ok(address) = format!("127.0.0.1:{port}").parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&address, HEALTH_TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(HEALTH_TIMEOUT));
    let host = if port == 80 {
        "127.0.0.1".to_string()
    } else {
        format!("127.0.0.1:{port}")
    };
    let request = format!("GET /api/health HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    stream.take(4096).read_to_string(&mut response).is_ok() && health_response_is_valid(&response)
}

#[tauri::command]
fn check_service(service: State<'_, OwnedService>) -> ServiceStatus {
    let Ok(mut process) = service.0.lock() else {
        return status(false);
    };
    let ready = child_is_running(&mut process) && process.port.is_some_and(health_check);
    if !ready && process.child.is_some() {
        if let Some(child) = process.child.as_mut() {
            let _ = child.kill();
        }
        stop_owned_service(&mut process);
    }
    status(ready)
}

#[tauri::command]
fn start_service(
    app: AppHandle,
    service: State<'_, OwnedService>,
) -> Result<ServiceStatus, String> {
    let mut process = service
        .0
        .lock()
        .map_err(|_| "No se pudo iniciar el asistente.".to_string())?;
    start_owned_service(&app, &mut process)
}

#[tauri::command]
fn repair_service(
    app: AppHandle,
    service: State<'_, OwnedService>,
) -> Result<ServiceStatus, String> {
    let mut process = service
        .0
        .lock()
        .map_err(|_| "No se pudo iniciar el asistente.".to_string())?;
    start_owned_service(&app, &mut process)
}

#[tauri::command]
fn chrome_connection_status() -> ChromeLinkStatus {
    let linked = diagnostic_root()
        .ok()
        .and_then(|root| runtime_directories(&root).ok())
        .is_some_and(|(_, app_data)| auth_file_is_linked(&app_data.join("auth_state.json")));
    ChromeLinkStatus {
        linked,
        message: if linked {
            "La vinculación con la extensión está guardada en esta aplicación."
        } else {
            "Todavía no hay una vinculación guardada con la extensión."
        },
    }
}

#[tauri::command]
fn open_chrome_connection() -> Result<(), String> {
    let executable = chrome_executable()
        .ok_or_else(|| "No encontramos Chrome instalado en este equipo.".to_string())?;
    Command::new(executable)
        .arg("--new-window")
        .arg("chrome://extensions")
        .spawn()
        .map(|_| ())
        .map_err(|_| "No se pudo abrir Chrome. Inténtalo de nuevo.".to_string())
}

#[tauri::command]
fn disconnect_chrome_link(app: AppHandle) -> Result<ChromeLinkStatus, String> {
    let root = diagnostic_root().map_err(str::to_string)?;
    let (local_app_data, app_data) = runtime_directories(&root)?;
    let backend = backend_executable(&app).ok_or_else(|| {
        "No se encontró un componente necesario para desconectar Chrome.".to_string()
    })?;
    let runtime_temp = app_data.join("runtime-temp");
    fs::create_dir_all(&runtime_temp)
        .map_err(|_| "No se pudo preparar la desconexión.".to_string())?;
    let mut command = Command::new(backend);
    command
        .arg("--pcai-auth-admin")
        .arg("revoke")
        .arg("--native")
        .env_clear()
        .current_dir(runtime_temp)
        .env("LOCALAPPDATA", local_app_data)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for key in ["SystemRoot", "WINDIR", "PATH"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = command
        .output()
        .map_err(|_| "No se pudo desconectar Chrome.".to_string())?;
    if !output.status.success() || output.stdout.as_slice() != b"ok\n" {
        return Err("No se pudo confirmar la desconexión de Chrome.".to_string());
    }
    Ok(ChromeLinkStatus {
        linked: false,
        message: "Chrome quedó desconectado. Puedes volver a vincularlo cuando quieras.",
    })
}

fn parse_lm_model_inventory(value: &Value) -> Result<Vec<LlmModel>, String> {
    let items = value
        .get("models")
        .and_then(Value::as_array)
        .or_else(|| value.get("data").and_then(Value::as_array))
        .ok_or_else(|| "LM Studio devolvió un catálogo incompatible.".to_string())?;
    let mut models = Vec::new();
    for item in items {
        if item.get("type").and_then(Value::as_str) != Some("llm") {
            continue; // Embeddings, vision/decision models, and unknown types are not selectable.
        }
        let id = item
            .get("key")
            .and_then(Value::as_str)
            .or_else(|| item.get("id").and_then(Value::as_str));
        let Some(id) = id.filter(|value| validate_model_id(value)) else {
            continue;
        };
        let name = item
            .get("display_name")
            .and_then(Value::as_str)
            .or_else(|| item.get("name").and_then(Value::as_str))
            .unwrap_or(id)
            .chars()
            .take(200)
            .collect::<String>();
        let loaded_instances = item.get("loaded_instances").and_then(Value::as_array);
        let loaded = loaded_instances
            .map(|instances| !instances.is_empty())
            .or_else(|| {
                item.get("state")
                    .and_then(Value::as_str)
                    .map(|state| state == "loaded")
            });
        let state = item
            .get("state")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| match loaded {
                Some(true) => "loaded".into(),
                Some(false) => "not-loaded".into(),
                None => "unknown".into(),
            });
        let max_context_length = item
            .get("max_context_length")
            .and_then(Value::as_u64)
            .or_else(|| {
                loaded_instances
                    .and_then(|instances| instances.first())
                    .and_then(|instance| instance.get("config"))
                    .and_then(|config| config.get("context_length"))
                    .and_then(Value::as_u64)
            });
        let quantization = item
            .get("quantization")
            .and_then(|quant| {
                quant
                    .as_str()
                    .or_else(|| quant.get("name").and_then(Value::as_str))
            })
            .map(|value| value.chars().take(80).collect());
        models.push(LlmModel {
            id: id.to_string(),
            name,
            publisher: item
                .get("publisher")
                .and_then(Value::as_str)
                .map(|value| value.chars().take(120).collect()),
            architecture: item
                .get("architecture")
                .and_then(Value::as_str)
                .or_else(|| item.get("arch").and_then(Value::as_str))
                .map(|value| value.chars().take(120).collect()),
            parameter_count: item
                .get("params_string")
                .and_then(Value::as_str)
                .map(|value| value.chars().take(80).collect()),
            state,
            loaded,
            max_context_length,
            quantization,
            size_bytes: item.get("size_bytes").and_then(Value::as_u64),
        });
    }
    Ok(models)
}

fn find_selected_model<'a>(models: &'a [LlmModel], selected: Option<&str>) -> Option<&'a LlmModel> {
    selected.and_then(|id| models.iter().find(|model| model.id == id))
}

fn has_assistant_content(value: &Value) -> bool {
    let Some(content) = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
    else {
        return false;
    };
    content.as_str().is_some_and(|text| !text.trim().is_empty())
        || content.as_array().is_some_and(|blocks| {
            blocks.iter().any(|block| {
                block
                    .get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| !text.trim().is_empty())
            })
        })
}

fn valid_load_response(value: &Value) -> bool {
    value.get("type").and_then(Value::as_str) == Some("llm")
        && value.get("status").and_then(Value::as_str) == Some("loaded")
        && value
            .get("instance_id")
            .and_then(Value::as_str)
            .is_some_and(validate_model_id)
}

fn lm_model_load_request(model_id: &str) -> Value {
    serde_json::json!({
        "model": model_id,
        "context_length": LM_STUDIO_LOAD_CONTEXT_TOKENS
    })
}

fn lm_http_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
        .map_err(|_| "No pudimos preparar la comprobación de LM Studio.".to_string())
}

async fn fetch_lm_models(port: u16) -> Result<Vec<LlmModel>, String> {
    let origin = lm_studio_origin(port)?;
    let client = lm_http_client(LM_DISCOVERY_TIMEOUT)?;
    let response = client
        .get(format!("{origin}/api/v1/models"))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "LM Studio tardó demasiado en mostrar sus modelos. Puedes volver a intentarlo."
                    .to_string()
            } else {
                "No se detectó un servidor local de LM Studio en el puerto configurado. Comprueba que esté activo y vuelve a intentarlo."
                    .to_string()
            }
        })?;
    let response = if response.status() == reqwest::StatusCode::NOT_FOUND
        || response.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED
    {
        client
            .get(format!("{origin}/api/v0/models"))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    "LM Studio tardó demasiado en mostrar sus modelos. Puedes volver a intentarlo."
                        .to_string()
                } else {
                    "No encontramos un catálogo de modelos compatible en LM Studio.".to_string()
                }
            })?
    } else {
        response
    };
    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(
            "LM Studio solicita una autorización local que esta versión todavía no admite.".into(),
        );
    }
    if !response.status().is_success() {
        return Err("No pudimos consultar los modelos de LM Studio. Comprueba que su servidor esté actualizado.".into());
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "LM Studio devolvió una lista de modelos que no pudimos leer.".to_string())?;
    parse_lm_model_inventory(&value)
}

fn current_llm_settings() -> (Option<LlmSettings>, Option<String>) {
    match llm_settings_path().and_then(|path| read_llm_settings(&path)) {
        Ok(settings) => (Some(settings), None),
        Err(message) => (None, Some(message)),
    }
}

fn current_lm_port(settings: Option<&LlmSettings>) -> u16 {
    settings
        .map(|value| value.server_port)
        .unwrap_or(DEFAULT_LM_STUDIO_PORT)
}

#[tauri::command]
async fn lm_studio_status() -> LlmStatus {
    let path = llm_settings_path().ok();
    let (settings, config_error) = current_llm_settings();
    let selected = settings
        .as_ref()
        .and_then(|value| value.selected_model.clone());
    let port = current_lm_port(settings.as_ref());
    let recovery_available = path.as_deref().is_some_and(config_recovery_available);
    let last_test_verified = settings.as_ref().is_some_and(|value| {
        value.last_test_successful && value.last_tested_model.as_deref() == selected.as_deref()
    });
    match fetch_lm_models(port).await {
        Ok(models) => {
            let selected_entry = find_selected_model(&models, selected.as_deref());
            let selected_model_available = selected_entry.is_some();
            let selected_model_loaded = selected_entry.and_then(|model| model.loaded);
            let message = if let Some(error) = config_error.as_ref() {
                error.clone()
            } else if models.is_empty() {
                "LM Studio está conectado, pero no encontramos modelos de conversación compatibles."
                    .into()
            } else if selected.is_none() {
                "Elige un modelo de conversación para continuar.".into()
            } else if selected_entry.is_none() {
                "El modelo guardado ya no está disponible. Actualiza la lista y elige otro.".into()
            } else if selected_entry.and_then(|model| model.loaded) == Some(false) {
                "El modelo está disponible, pero no cargado. Cárgalo en LM Studio y vuelve a probar.".into()
            } else {
                "El modelo elegido está disponible. Ejecuta la prueba para comprobar la generación."
                    .into()
            };
            LlmStatus {
                server_available: true,
                models,
                selected_model: selected,
                selected_model_available,
                selected_model_loaded,
                server_port: port,
                last_test_verified: last_test_verified
                    && selected_model_available
                    && selected_model_loaded != Some(false),
                config_error,
                config_recovery_available: recovery_available,
                message,
            }
        }
        Err(message) => LlmStatus {
            server_available: false,
            models: Vec::new(),
            selected_model: selected,
            selected_model_available: false,
            selected_model_loaded: None,
            server_port: port,
            last_test_verified: false,
            config_error,
            config_recovery_available: recovery_available,
            message,
        },
    }
}

#[tauri::command]
async fn select_lm_model(
    model_id: String,
    app: AppHandle,
    service: State<'_, OwnedService>,
) -> Result<(), String> {
    select_lm_model_with_load_duration(model_id, None, app, service).await
}

async fn select_lm_model_with_load_duration(
    model_id: String,
    load_duration_ms: Option<u64>,
    app: AppHandle,
    service: State<'_, OwnedService>,
) -> Result<(), String> {
    let path = llm_settings_path()?;
    let existing = read_llm_settings(&path)?;
    let models = fetch_lm_models(existing.server_port).await?;
    if !models.iter().any(|model| model.id == model_id) {
        return Err(
            "Ese modelo ya no está disponible. Actualiza la lista y vuelve a elegir.".into(),
        );
    }
    write_llm_settings(
        &path,
        &LlmSettings {
            schema_version: 1,
            selected_model: Some(model_id),
            last_tested_model: None,
            last_test_successful: false,
            last_load_duration_ms: load_duration_ms,
            last_test_duration_ms: None,
            ..existing
        },
    )?;

    let mut process = service
        .0
        .lock()
        .map_err(|_| "No se pudo aplicar la selección.".to_string())?;
    let owned_backend_running = process.child.is_some() && child_is_running(&mut process);
    if owned_backend_running {
        stop_owned_service(&mut process);
        if let Err(error) = start_owned_service(&app, &mut process) {
            // Keep the explicit selection for recovery; the UI reports that the backend needs repair.
            return Err(format!(
                "La selección quedó guardada, pero no pudimos reiniciar el asistente. {}",
                error
            ));
        }
    }
    Ok(())
}

#[tauri::command]
async fn load_and_select_lm_model(
    model_id: String,
    app: AppHandle,
    service: State<'_, OwnedService>,
) -> Result<String, String> {
    if !validate_model_id(&model_id) {
        return Err(
            "No pudimos identificar ese modelo. Actualiza la lista y vuelve a elegir.".into(),
        );
    }
    let path = llm_settings_path()?;
    let settings = read_llm_settings(&path)?;
    let origin = lm_studio_origin(settings.server_port)?;
    let models = fetch_lm_models(settings.server_port).await?;
    let model = models
        .iter()
        .find(|candidate| candidate.id == model_id)
        .ok_or_else(|| {
            "Ese modelo ya no aparece en LM Studio. Actualiza la lista e inténtalo otra vez."
                .to_string()
        })?;
    if model.loaded == Some(true) {
        select_lm_model(model_id, app, service).await?;
        return Ok("El modelo ya estaba cargado y quedó seleccionado.".into());
    }
    if model.loaded != Some(false) {
        return Err("LM Studio no informó si el modelo está cargado. Compruébalo en su interfaz e inténtalo de nuevo.".into());
    }

    let load_started = Instant::now();
    let client = lm_http_client(LM_MODEL_LOAD_TIMEOUT)?;
    let response = client
        .post(format!("{origin}/api/v1/models/load"))
        .json(&lm_model_load_request(&model_id))
        .send()
        .await
        .map_err(|error| if error.is_timeout() {
            "La carga tardó demasiado o no terminó. Comprueba el estado en LM Studio; puedes reintentar.".to_string()
        } else {
            "No pudimos pedir a LM Studio que cargara el modelo. Comprueba su estado e inténtalo otra vez.".to_string()
        })?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(
            "LM Studio solicita una autorización local que esta versión todavía no admite.".into(),
        );
    }
    if response.status() == reqwest::StatusCode::NOT_FOUND
        || response.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED
    {
        return Err("Esta versión de LM Studio no ofrece la carga guiada. Carga el modelo desde LM Studio y vuelve a actualizar la lista.".into());
    }
    if !response.status().is_success() {
        return Err("LM Studio no pudo cargar el modelo. Comprueba el espacio de memoria en su interfaz y vuelve a intentarlo.".into());
    }
    let result = response.json::<Value>().await.map_err(|_| {
        "LM Studio respondió con un resultado de carga que no pudimos verificar.".to_string()
    })?;
    if !valid_load_response(&result) {
        return Err(
            "LM Studio no confirmó la carga del modelo. No se cambió la selección guardada.".into(),
        );
    }
    let verified_models = fetch_lm_models(settings.server_port).await?;
    if !verified_models
        .iter()
        .any(|candidate| candidate.id == model_id && candidate.loaded == Some(true))
    {
        return Err("LM Studio respondió, pero todavía no vemos el modelo cargado. Actualiza la lista antes de continuar.".into());
    }

    let load_duration_ms = elapsed_millis(load_started);
    select_lm_model_with_load_duration(model_id, Some(load_duration_ms), app, service).await?;
    Ok(format!(
        "Modelo cargado y seleccionado en {}. Puedes ejecutar la prueba sintética.",
        format_duration(load_duration_ms)
    ))
}

#[tauri::command]
async fn set_lm_studio_port(
    port: u16,
    app: AppHandle,
    service: State<'_, OwnedService>,
) -> Result<(), String> {
    validate_lm_studio_port(port)?;
    let path = llm_settings_path()?;
    let existing = read_llm_settings(&path)?;
    if existing.server_port == port {
        return Ok(());
    }
    write_llm_settings(
        &path,
        &LlmSettings {
            server_port: port,
            last_tested_model: None,
            last_test_successful: false,
            last_load_duration_ms: None,
            last_test_duration_ms: None,
            ..existing
        },
    )?;
    let mut process = service
        .0
        .lock()
        .map_err(|_| "No se pudo aplicar el cambio.".to_string())?;
    let running = process.child.is_some() && child_is_running(&mut process);
    if running {
        stop_owned_service(&mut process);
        if let Err(error) = start_owned_service(&app, &mut process) {
            return Err(format!(
                "El puerto quedó guardado. Pulsa Solucionar para reiniciar el asistente. {error}"
            ));
        }
    }
    Ok(())
}

#[tauri::command]
fn recover_corrupt_lm_settings(confirmed: bool) -> Result<String, String> {
    if !confirmed {
        return Err("Confirma antes de crear una configuración nueva.".into());
    }
    let path = llm_settings_path()?;
    replace_corrupt_llm_settings(&path, &LlmSettings::default())
}

async fn perform_lm_generation_test(model: &str, port: u16) -> Result<String, String> {
    let origin = lm_studio_origin(port)?;
    let models = fetch_lm_models(port).await?;
    let selected = models
        .iter()
        .find(|candidate| candidate.id == model)
        .ok_or_else(|| "El modelo guardado ya no aparece en LM Studio. Elige otro.".to_string())?;
    if selected.loaded == Some(false) {
        return Err(
            "El modelo está instalado, pero no cargado. Cárgalo en LM Studio y vuelve a probar."
                .into(),
        );
    }
    let client = lm_http_client(LM_GENERATION_TIMEOUT)?;
    let response = client
        .post(format!("{origin}/v1/chat/completions"))
        .json(&serde_json::json!({
            "model": model,
            "messages": [{"role":"user", "content":"Responde únicamente con la palabra OK."}],
            "temperature": 0,
            "max_tokens": 8,
            "stream": false
        }))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "La prueba tardó demasiado. Comprueba el modelo y vuelve a intentarlo.".to_string()
            } else {
                "No pudimos conectar con el modelo. Comprueba que LM Studio siga abierto."
                    .to_string()
            }
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(
            "El modelo seleccionado dejó de estar disponible. Actualiza la lista y elige otro."
                .into(),
        );
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err(
            "LM Studio solicita una autorización local que esta versión todavía no admite.".into(),
        );
    }
    if !response.status().is_success() {
        return Err(
            "No se pudo probar el modelo. Comprueba que esté cargado y vuelve a intentarlo.".into(),
        );
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "El modelo devolvió una respuesta que no pudimos leer.".to_string())?;
    if !has_assistant_content(&value) {
        return Err("El modelo no devolvió una respuesta de prueba. Comprueba que sea un modelo de conversación.".into());
    }
    Ok("La prueba de generación terminó correctamente.".into())
}

#[tauri::command]
async fn test_lm_generation() -> Result<String, String> {
    let path = llm_settings_path()?;
    let mut settings = read_llm_settings(&path)?;
    let model = settings
        .selected_model
        .clone()
        .ok_or_else(|| "Elige y guarda un modelo de conversación antes de probarlo.".to_string())?;
    settings.last_tested_model = Some(model.clone());
    settings.last_test_successful = false;
    settings.last_test_duration_ms = None;
    write_llm_settings(&path, &settings)?;
    let test_started = Instant::now();
    let result = perform_lm_generation_test(&model, settings.server_port).await;
    let duration_ms = elapsed_millis(test_started);
    settings.last_test_duration_ms = Some(duration_ms);
    settings.last_test_successful = result.is_ok();
    if let Err(error) = write_llm_settings(&path, &settings) {
        return if result.is_ok() {
            Err(format!(
                "La respuesta llegó, pero no pudimos guardar el resultado de la prueba. {error}"
            ))
        } else {
            result
        };
    }
    match result {
        Ok(message) => Ok(format!(
            "{message} Duración: {}.",
            format_duration(duration_ms)
        )),
        Err(error) => Err(format!(
            "{error} Duración: {}.",
            format_duration(duration_ms)
        )),
    }
}

fn elapsed_millis(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

fn format_duration(duration_ms: u64) -> String {
    format!("{:.2} s", duration_ms as f64 / 1000.0)
}

fn main() {
    let app = tauri::Builder::default()
        .manage(OwnedService::default())
        .invoke_handler(tauri::generate_handler![
            check_service,
            start_service,
            repair_service,
            chrome_connection_status,
            open_chrome_connection,
            disconnect_chrome_link,
            lm_studio_status,
            select_lm_model,
            load_and_select_lm_model,
            test_lm_generation,
            set_lm_studio_port,
            recover_corrupt_lm_settings
        ])
        .build(tauri::generate_context!())
        .expect("No se pudo iniciar PERSONAL_CHAT_AI");

    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(service) = handle.try_state::<OwnedService>() {
                if let Ok(mut process) = service.0.lock() {
                    stop_owned_service(&mut process);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic_model(id: &str, state: &str) -> LlmModel {
        LlmModel {
            id: id.into(),
            name: id.into(),
            publisher: None,
            architecture: None,
            parameter_count: None,
            state: state.into(),
            loaded: Some(state == "loaded"),
            max_context_length: Some(8192),
            quantization: Some("Q4_K_M".into()),
            size_bytes: Some(10),
        }
    }

    #[test]
    fn native_model_catalog_accepts_only_explicit_llm_type_and_parses_v1_metadata() {
        let parsed = parse_lm_model_inventory(&serde_json::json!({"models":[
            {"key":"embedding-first","display_name":"Embedding","type":"embedding","loaded_instances":[]},
            {"key":"chat-second","display_name":"Chat model","type":"llm","publisher":"synthetic-publisher","architecture":"synthetic-arch","params_string":"4B","loaded_instances":[{"id":"loaded-1","config":{"context_length":4096}}],"max_context_length":8192,"quantization":{"name":"Q4_K_M"},"size_bytes":1234},
            {"key":"unknown","type":"future_type"}
        ]})).expect("valid synthetic model list");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "chat-second");
        assert_eq!(parsed[0].name, "Chat model");
        assert_eq!(parsed[0].loaded, Some(true));
        assert_eq!(parsed[0].max_context_length, Some(8192));
        assert_eq!(parsed[0].size_bytes, Some(1234));
        assert_eq!(parsed[0].quantization.as_deref(), Some("Q4_K_M"));
        assert_eq!(parsed[0].publisher.as_deref(), Some("synthetic-publisher"));
        assert_eq!(parsed[0].architecture.as_deref(), Some("synthetic-arch"));
        assert_eq!(parsed[0].parameter_count.as_deref(), Some("4B"));
    }

    #[test]
    fn model_load_response_requires_explicit_loaded_llm_and_instance() {
        assert!(valid_load_response(
            &serde_json::json!({"type":"llm","status":"loaded","instance_id":"chat/model"})
        ));
        assert!(!valid_load_response(
            &serde_json::json!({"type":"embedding","status":"loaded","instance_id":"chat/model"})
        ));
        assert!(!valid_load_response(
            &serde_json::json!({"type":"llm","status":"failed","instance_id":"chat/model"})
        ));
        assert!(!valid_load_response(
            &serde_json::json!({"type":"llm","status":"loaded"})
        ));
    }

    #[test]
    fn model_load_request_uses_the_backend_context_budget() {
        assert_eq!(
            lm_model_load_request("qwen/qwen3-4b-2507"),
            serde_json::json!({"model":"qwen/qwen3-4b-2507","context_length":8192})
        );
    }

    #[test]
    fn legacy_catalog_is_supported_but_embedding_first_and_unknown_types_are_not_selectable() {
        let parsed = parse_lm_model_inventory(&serde_json::json!({"data":[
            {"id":"embedding-first","type":"embeddings","state":"loaded"},
            {"id":"chat-second","type":"llm","state":"not-loaded","max_context_length":4096},
            {"id":"ambiguous","state":"loaded"}
        ]}))
        .expect("valid synthetic v0 list");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "chat-second");
        assert_eq!(parsed[0].loaded, Some(false));
        assert!(parse_lm_model_inventory(
            &serde_json::json!({"data":[{"id":"unknown","state":"loaded"}]})
        )
        .expect("unknown inventory is safely empty")
        .is_empty());
    }

    #[test]
    fn selected_model_disappearance_is_detected_without_fallback() {
        let models = vec![synthetic_model("new-chat-model", "loaded")];
        assert!(find_selected_model(&models, Some("removed-model")).is_none());
        assert!(find_selected_model(&models, Some("new-chat-model")).is_some());
    }

    #[test]
    fn llm_selection_persists_atomically_and_corrupt_config_is_never_overwritten() {
        let root = std::env::temp_dir().join(format!(
            "pcai-llm-config-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let path = root.join("config/llm-settings.json");
        assert_eq!(
            read_llm_settings(&path)
                .expect("empty config defaults")
                .selected_model,
            None
        );
        let first = LlmSettings {
            schema_version: 1,
            selected_model: Some("chat-one".into()),
            last_tested_model: Some("chat-one".into()),
            last_test_successful: true,
            last_load_duration_ms: Some(2_815),
            last_test_duration_ms: Some(964),
            ..LlmSettings::default()
        };
        write_llm_settings(&path, &first).expect("first atomic write");
        let saved = read_llm_settings(&path).expect("saved config");
        assert_eq!(saved, first);
        assert_eq!(saved.last_load_duration_ms, Some(2_815));
        assert_eq!(saved.last_test_duration_ms, Some(964));
        let stored_text = fs::read_to_string(&path).expect("read synthetic config");
        assert!(!stored_text.contains("OK"));
        assert!(!stored_text.contains("response"));
        let second = LlmSettings {
            schema_version: 1,
            selected_model: Some("chat-two".into()),
            ..first.clone()
        };
        write_llm_settings(&path, &second).expect("atomic update");
        assert_eq!(read_llm_settings(&path).expect("updated config"), second);
        let corrupt = br#"{"schemaVersion":999,"selectedModel":"future"}"#;
        fs::write(&path, corrupt).expect("synthetic future schema");
        assert!(write_llm_settings(&path, &first).is_err());
        assert_eq!(fs::read(&path).expect("unmodified corrupt config"), corrupt);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn old_phase_61_settings_keep_the_default_loopback_port() {
        let settings: LlmSettings =
            serde_json::from_slice(br#"{"schemaVersion":1,"selectedModel":"chat-model"}"#)
                .expect("compatible old settings");
        assert_eq!(settings.server_port, 1234);
        assert_eq!(settings.selected_model.as_deref(), Some("chat-model"));
        assert_eq!(settings.last_tested_model, None);
        assert!(!settings.last_test_successful);
        assert_eq!(settings.last_load_duration_ms, None);
        assert_eq!(settings.last_test_duration_ms, None);
    }

    #[test]
    fn corrupt_config_recovery_requires_an_explicit_confirmation_and_keeps_backup() {
        let root = std::env::temp_dir().join(format!(
            "pcai-llm-recovery-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let path = root.join("config/llm-settings.json");
        fs::create_dir_all(path.parent().expect("config parent")).expect("temporary config dir");
        let original = b"{not valid json";
        fs::write(&path, original).expect("synthetic corrupt config");
        assert!(config_recovery_available(&path));
        assert!(replace_corrupt_llm_settings(&path, &LlmSettings::default()).is_ok());
        assert_eq!(
            read_llm_settings(&path).expect("new default config"),
            LlmSettings::default()
        );
        let backups: Vec<_> = fs::read_dir(path.parent().expect("config parent"))
            .expect("read config directory")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("llm-settings-backup-")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(
            fs::read(backups[0].path()).expect("backup contents"),
            original
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn future_settings_are_preserved_and_not_offered_for_reset() {
        let root = std::env::temp_dir().join(format!("pcai-future-config-{}", std::process::id()));
        fs::create_dir_all(&root).expect("temporary config dir");
        let path = root.join("llm-settings.json");
        let future = br#"{"schemaVersion":2,"selectedModel":"future","newOption":true}"#;
        fs::write(&path, future).expect("future settings");
        assert!(!config_recovery_available(&path));
        assert!(replace_corrupt_llm_settings(&path, &LlmSettings::default()).is_err());
        assert_eq!(fs::read(&path).expect("future file retained"), future);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn advanced_connection_accepts_only_a_nonzero_port_on_fixed_loopback() {
        assert!(validate_lm_studio_port(1234).is_ok());
        assert!(validate_lm_studio_port(65535).is_ok());
        assert!(validate_lm_studio_port(0).is_err());
        assert_eq!(
            lm_studio_origin(4321).expect("valid loopback"),
            "http://127.0.0.1:4321"
        );
        assert!(lm_studio_origin(0).is_err());
    }

    #[test]
    fn model_ids_reject_control_characters_and_test_probe_requires_real_content() {
        assert!(validate_model_id("qwen/chat-model"));
        assert!(!validate_model_id(" bad "));
        assert!(!validate_model_id("bad\nmodel"));
        assert!(has_assistant_content(
            &serde_json::json!({"choices":[{"message":{"content":"OK"}}]})
        ));
        assert!(has_assistant_content(
            &serde_json::json!({"choices":[{"message":{"content":[{"type":"text","text":"OK"}]}}]})
        ));
        assert!(!has_assistant_content(
            &serde_json::json!({"choices":[{"message":{"content":"  "}}]})
        ));
        assert!(!has_assistant_content(&serde_json::json!({"choices":[]})));
    }

    #[test]
    fn operation_durations_are_reported_in_seconds_without_response_content() {
        assert_eq!(format_duration(0), "0.00 s");
        assert_eq!(format_duration(1_234), "1.23 s");
        assert_eq!(format_duration(60_000), "60.00 s");
    }

    #[test]
    fn health_response_accepts_only_the_real_backend_contract() {
        assert!(health_response_is_valid(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"status\":\"ok\",\"service\":\"personal-chat-ai\"}"
        ));
        assert!(!health_response_is_valid(
            "HTTP/1.1 200 OK\r\n\r\n{\"status\":\"ok\",\"service\":\"personal-chat-ai-test\"}"
        ));
        assert!(!health_response_is_valid(
            "HTTP/1.1 503 Service Unavailable\r\n\r\n{\"status\":\"ok\",\"service\":\"personal-chat-ai\"}"
        ));
    }

    #[test]
    fn chrome_link_status_reads_only_a_valid_paired_origin_and_hash() {
        let root = std::env::temp_dir().join(format!("pcai-link-status-{}", std::process::id()));
        fs::create_dir_all(&root).expect("temporary status directory");
        let path = root.join("auth_state.json");
        fs::write(
            &path,
            br#"{"version":1,"token_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","extension_origin":"chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","pairing":null}"#,
        )
        .expect("synthetic paired state");
        assert!(auth_file_is_linked(&path));
        fs::write(
            &path,
            br#"{"version":1,"token_hash":"not-a-hash","extension_origin":"chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","pairing":null}"#,
        )
        .expect("synthetic invalid state");
        assert!(!auth_file_is_linked(&path));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn runtime_paths_are_separated_from_project_files() {
        let root = std::env::temp_dir().join(format!("pcai-path-test-{}", std::process::id()));
        let (local, app) = runtime_directories(&root).expect("temporary paths should be created");
        assert!(app
            .join("data/personal_chat_ai_v2.sqlite3")
            .starts_with(&root));
        assert!(app
            .join("legacy/personal_chat_ai.sqlite3")
            .starts_with(&root));
        assert!(app.join("legacy/personalities.sqlite3").starts_with(&root));
        assert!(app.join("knowledge").starts_with(&root));
        assert!(local.starts_with(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn production_user_data_is_outside_the_current_user_install_directory() {
        let test_root =
            std::env::temp_dir().join(format!("pcai-production-path-test-{}", std::process::id()));
        let local_app_data = test_root.join("LocalAppData");
        let install_dir = local_app_data.join("PERSONAL_CHAT_AI");
        let storage_root = production_storage_root(&local_app_data);
        let (_, app_data) = runtime_directories(&storage_root).expect("synthetic paths");

        assert_eq!(storage_root, local_app_data.join("PERSONAL_CHAT_AI_DATA"));
        assert!(!app_data.starts_with(&install_dir));
        assert!(app_data.starts_with(&storage_root));
        let _ = fs::remove_dir_all(test_root);
    }

    #[test]
    fn development_app_storage_is_stable_temporary_and_separate_from_production() {
        let temp_root = PathBuf::from(r"C:\Synthetic\Temp");
        let local_app_data = PathBuf::from(r"C:\Synthetic\LocalAppData");
        let development = development_storage_root(&temp_root);
        let production = production_storage_root(&local_app_data);
        assert_eq!(
            development,
            temp_root
                .join("PERSONAL_CHAT_AI")
                .join(DEVELOPMENT_DATA_DIRECTORY)
        );
        assert_ne!(development, production);
        assert!(development.starts_with(temp_root));
    }

    #[test]
    fn log_events_do_not_contain_request_or_credential_fields() {
        let root = std::env::temp_dir().join(format!("pcai-log-test-{}", std::process::id()));
        fs::create_dir_all(&root).expect("temporary directory");
        let path = root.join("diagnostics.log");
        log_event(&path, "backend_ready");
        let contents = fs::read_to_string(&path).expect("diagnostic log");
        assert!(contents.contains("backend_ready"));
        assert!(!contents.contains("token"));
        assert!(!contents.contains("conversation"));
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Requiere backend-dist/personal-chat-ai-backend.exe; ejecutar después del empaquetado"]
    fn packaged_backend_starts_once_uses_temporary_data_and_stops() {
        let executable = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("backend-dist")
            .join("personal-chat-ai-backend")
            .join("personal-chat-ai-backend.exe");
        assert!(executable.is_file(), "build the PyInstaller backend first");

        let root = std::env::temp_dir().join(format!(
            "pcai-sidecar-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let local_app_data = root.join("LocalAppData");
        let (local_app_data, app_data) =
            runtime_directories(&local_app_data).expect("temporary paths");
        let log_path = app_data.join("logs/backend.log");
        fs::create_dir_all(app_data.join("runtime-temp")).expect("runtime temp");
        let mut process = ServiceProcess::default();

        let first = launch_backend(
            &executable,
            &local_app_data,
            &app_data,
            &log_path,
            &mut process,
        );
        let first_pid = process.child.as_mut().map(|child| child.id());
        let second = launch_backend(
            &executable,
            &local_app_data,
            &app_data,
            &log_path,
            &mut process,
        );
        let second_pid = process.child.as_mut().map(|child| child.id());
        let database = app_data.join("data/personal_chat_ai_v2.sqlite3");

        if let Some(child) = process.child.as_mut() {
            child.kill().expect("the test-owned backend should stop");
            child.wait().expect("the test-owned backend should exit");
        }
        let detected_exit = !child_is_running(&mut process);
        let recovered = launch_backend(
            &executable,
            &local_app_data,
            &app_data,
            &log_path,
            &mut process,
        );
        let recovered_health = process.port.is_some_and(health_check);
        stop_owned_service(&mut process);
        sleep(Duration::from_millis(150));
        let stopped = !health_check(BACKEND_PORT);
        let database_is_temporary = database.is_file() && database.starts_with(&root);
        let _ = fs::remove_dir_all(&root);

        assert!(first.is_ok(), "real FastAPI sidecar should start");
        assert!(
            second.is_ok(),
            "a repeated start should report the existing process"
        );
        assert_eq!(
            first_pid, second_pid,
            "the supervisor must not spawn duplicates"
        );
        assert!(detected_exit, "the supervisor must detect a stopped child");
        assert!(
            recovered.is_ok() && recovered_health,
            "the supervisor must recover by starting a new owned backend"
        );
        assert!(
            database_is_temporary,
            "SQLite must be created under the temporary root"
        );
        assert!(
            stopped,
            "the owned process must release the health endpoint on shutdown"
        );
    }
}

fn health_response_is_valid(response: &str) -> bool {
    let Some((headers, body)) = response.split_once("\r\n\r\n") else {
        return false;
    };
    headers
        .lines()
        .next()
        .is_some_and(|line| line.starts_with("HTTP/1.1 200 "))
        && body.contains("\"status\":\"ok\"")
        && body.contains("\"service\":\"personal-chat-ai\"")
        && !body.contains("personal-chat-ai-test")
}
