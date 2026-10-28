#[path = "../backend_integrity.rs"]
mod backend_integrity;

use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_CREATED_NEW_KEY};
#[cfg(windows)]
use winreg::RegKey;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const HOST_MANIFEST: &str = "native-messaging-host.json";
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;
const HOST_NAME: &str = "com.personalchatai.desktop";
const REGISTRY_PARENT: &str = "Software\\Google\\Chrome\\NativeMessagingHosts";
const REGISTRY_KEY: &str =
    "Software\\Google\\Chrome\\NativeMessagingHosts\\com.personalchatai.desktop";
const COMPILED_EXTENSION_ID: Option<&str> = option_env!("PCAI_CHROME_EXTENSION_ID");
const COMPILED_BACKEND_INTEGRITY_SHA256: Option<&str> =
    option_env!("PCAI_BACKEND_INTEGRITY_SHA256");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Operation {
    Pair,
    Rotate,
    Revoke,
}

fn valid_extension_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|byte| (b'a'..=b'p').contains(&byte))
}

fn is_reserved_development_extension_id(id: &str) -> bool {
    matches!(
        id,
        "edbbjombinoidoopkhhkghaffoijjfjj" | "opegkncolnoekkhemhadjffdofppoknn"
    )
}

fn approved_origin(manifest_bytes: &[u8]) -> Result<String, &'static str> {
    let manifest: Value =
        serde_json::from_slice(manifest_bytes).map_err(|_| "host_not_configured")?;
    if manifest.get("name").and_then(Value::as_str) != Some(HOST_NAME)
        || manifest.get("type").and_then(Value::as_str) != Some("stdio")
    {
        return Err("host_not_configured");
    }
    let origins = manifest
        .get("allowed_origins")
        .and_then(Value::as_array)
        .ok_or("host_not_configured")?;
    if origins.len() != 1 {
        return Err("host_not_configured");
    }
    let origin = origins[0].as_str().ok_or("host_not_configured")?;
    let id = origin
        .strip_prefix("chrome-extension://")
        .and_then(|value| value.strip_suffix('/'))
        .ok_or("host_not_configured")?;
    if !valid_extension_id(id) || origin.contains('*') {
        return Err("host_not_configured");
    }
    Ok(origin.to_string())
}

fn normalize_caller_origin(value: &str) -> Result<String, &'static str> {
    let raw_id = value
        .strip_prefix("chrome-extension://")
        .ok_or("origin_forbidden")?;
    let id = raw_id.strip_suffix('/').unwrap_or(raw_id);
    if !valid_extension_id(id) {
        return Err("origin_forbidden");
    }
    Ok(format!("chrome-extension://{id}/"))
}

fn parse_request(bytes: &[u8]) -> Result<Operation, &'static str> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "invalid_message")?;
    let object = value.as_object().ok_or("invalid_message")?;
    let operation = match object.get("type").and_then(Value::as_str) {
        Some("pair") => Operation::Pair,
        Some("rotate") => Operation::Rotate,
        Some("revoke") => Operation::Revoke,
        _ => return Err("operation_not_allowed"),
    };
    if object.len() != 1 {
        return Err("invalid_message");
    }
    Ok(operation)
}

fn read_frame<R: Read>(reader: &mut R) -> Result<Vec<u8>, &'static str> {
    let mut length = [0u8; 4];
    reader
        .read_exact(&mut length)
        .map_err(|_| "invalid_message")?;
    let size = u32::from_le_bytes(length) as usize;
    if size == 0 || size > MAX_MESSAGE_BYTES {
        return Err("invalid_message");
    }
    let mut body = vec![0u8; size];
    reader
        .read_exact(&mut body)
        .map_err(|_| "invalid_message")?;
    Ok(body)
}

fn write_frame<W: Write>(writer: &mut W, body: &[u8]) -> io::Result<()> {
    let size = u32::try_from(body.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "message too large"))?;
    writer.write_all(&size.to_le_bytes())?;
    writer.write_all(body)?;
    writer.flush()
}

fn app_root() -> Result<PathBuf, &'static str> {
    let local = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or("app_data_unavailable")?;
    Ok(app_root_from_localappdata(&local))
}

fn app_root_from_localappdata(local_app_data: &Path) -> PathBuf {
    local_app_data.join("PERSONAL_CHAT_AI_DATA")
}

fn backend_executable(host_dir: &Path) -> Result<PathBuf, &'static str> {
    let resource_root = host_dir.parent().ok_or("backend_unavailable")?;
    let path = resource_root
        .join("backend")
        .join("personal-chat-ai-backend.exe");
    if path.is_file() {
        Ok(path)
    } else {
        Err("backend_unavailable")
    }
}

fn backend_package_is_verified(backend_exe: &Path) -> bool {
    backend_exe.parent().is_some_and(|root| {
        backend_integrity::verify_backend_package(root, COMPILED_BACKEND_INTEGRITY_SHA256)
    })
}

fn manifest_bytes(host_executable: &Path, extension_id: &str) -> Result<Vec<u8>, &'static str> {
    if !valid_extension_id(extension_id) {
        return Err("extension_id_invalid");
    }
    let host_path = fs::canonicalize(host_executable).map_err(|_| "host_not_configured")?;
    let manifest = json!({
        "name": HOST_NAME,
        "description": "Conexión local entre PERSONAL_CHAT_AI y Chrome",
        "path": host_path.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": [format!("chrome-extension://{extension_id}/")]
    });
    serde_json::to_vec_pretty(&manifest).map_err(|_| "manifest_write_failed")
}

fn configured_extension_id() -> Result<&'static str, &'static str> {
    COMPILED_EXTENSION_ID
        .filter(|id| valid_extension_id(id) && !is_reserved_development_extension_id(id))
        .ok_or("extension_id_not_configured")
}

fn manifest_path_for(host_executable: &Path) -> Result<PathBuf, &'static str> {
    let host_path = fs::canonicalize(host_executable).map_err(|_| "host_not_configured")?;
    let host_dir = host_path.parent().ok_or("host_not_configured")?;
    Ok(host_dir.join(HOST_MANIFEST))
}

fn write_manifest_if_missing(
    manifest_path: &Path,
    expected_bytes: &[u8],
) -> Result<bool, &'static str> {
    match fs::read(manifest_path) {
        Ok(existing) if existing == expected_bytes => Ok(false),
        Ok(_) => Err("manifest_conflict"),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(manifest_path)
            {
                Ok(mut file) => {
                    if file.write_all(expected_bytes).is_err() || file.sync_all().is_err() {
                        drop(file);
                        let _ = fs::remove_file(manifest_path);
                        return Err("manifest_write_failed");
                    }
                    Ok(true)
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    match fs::read(manifest_path) {
                        Ok(existing) if existing == expected_bytes => Ok(false),
                        Ok(_) => Err("manifest_conflict"),
                        Err(_) => Err("manifest_read_failed"),
                    }
                }
                Err(_) => Err("manifest_write_failed"),
            }
        }
        Err(_) => Err("manifest_read_failed"),
    }
}

#[derive(Debug, PartialEq, Eq)]
struct RegistrySnapshot {
    default_value: Option<String>,
    has_other_values: bool,
    has_subkeys: bool,
}

fn registry_binding_is_owned(snapshot: &RegistrySnapshot, expected: &str) -> bool {
    snapshot.default_value.as_deref() == Some(expected)
        && !snapshot.has_other_values
        && !snapshot.has_subkeys
}

#[cfg(windows)]
fn snapshot_registry_key(key: &RegKey) -> io::Result<RegistrySnapshot> {
    let values = key.enum_values().collect::<io::Result<Vec<_>>>()?;
    let has_other_values = values.iter().any(|(name, _)| !name.is_empty());
    let default_value = key.get_value::<String, _>("").ok();
    let has_subkeys = match key.enum_keys().next() {
        Some(Ok(_)) => true,
        Some(Err(error)) => return Err(error),
        None => false,
    };
    Ok(RegistrySnapshot {
        default_value,
        has_other_values,
        has_subkeys,
    })
}

#[cfg(windows)]
fn register_native_host(host_executable: &Path) -> Result<(), &'static str> {
    let extension_id = configured_extension_id()?;
    let backend = backend_executable(host_executable.parent().ok_or("host_not_configured")?)?;
    if !backend_package_is_verified(&backend) {
        return Err("backend_integrity_failed");
    }
    let manifest_path = manifest_path_for(host_executable)?;
    let manifest_text = manifest_path.to_string_lossy().into_owned();
    let bytes = manifest_bytes(host_executable, extension_id)?;
    let created_manifest = write_manifest_if_missing(&manifest_path, &bytes)?;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let open_existing = hkcu.open_subkey_with_flags(REGISTRY_KEY, KEY_READ | KEY_WRITE);
    let result = match open_existing {
        Ok(key) => {
            let snapshot = snapshot_registry_key(&key).map_err(|_| "registry_read_failed")?;
            if registry_binding_is_owned(&snapshot, &manifest_text) {
                Ok(())
            } else {
                Err("registry_conflict")
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let (key, disposition) = hkcu
                .create_subkey(REGISTRY_KEY)
                .map_err(|_| "registry_write_failed")?;
            if disposition != REG_CREATED_NEW_KEY {
                let snapshot = snapshot_registry_key(&key).map_err(|_| "registry_read_failed")?;
                if !registry_binding_is_owned(&snapshot, &manifest_text) {
                    Err("registry_conflict")
                } else {
                    Ok(())
                }
            } else {
                match key.set_value("", &manifest_text) {
                    Ok(()) => Ok(()),
                    Err(_) => {
                        drop(key);
                        let _ = hkcu.delete_subkey(REGISTRY_KEY);
                        Err("registry_write_failed")
                    }
                }
            }
        }
        Err(_) => Err("registry_read_failed"),
    };

    if result.is_err() && created_manifest {
        let _ = fs::remove_file(&manifest_path);
    }
    result
}

#[cfg(windows)]
fn unregister_native_host(host_executable: &Path) -> Result<(), &'static str> {
    let extension_id = configured_extension_id()?;
    let manifest_path = manifest_path_for(host_executable)?;
    let manifest_text = manifest_path.to_string_lossy().into_owned();
    let expected_bytes = manifest_bytes(host_executable, extension_id)?;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    match hkcu.open_subkey_with_flags(REGISTRY_KEY, KEY_READ | KEY_WRITE) {
        Ok(key) => {
            let snapshot = snapshot_registry_key(&key).map_err(|_| "registry_read_failed")?;
            if !registry_binding_is_owned(&snapshot, &manifest_text) {
                return Err("registry_conflict");
            }
            drop(key);
            let parent = hkcu
                .open_subkey_with_flags(REGISTRY_PARENT, KEY_READ | KEY_WRITE)
                .map_err(|_| "registry_remove_failed")?;
            parent
                .delete_subkey(HOST_NAME)
                .map_err(|_| "registry_remove_failed")?;
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err("registry_read_failed"),
    }

    if fs::read(&manifest_path).is_ok_and(|current| current == expected_bytes) {
        let _ = fs::remove_file(manifest_path);
    }
    Ok(())
}

#[cfg(not(windows))]
fn register_native_host(_host_executable: &Path) -> Result<(), &'static str> {
    Err("windows_only")
}

#[cfg(not(windows))]
fn unregister_native_host(_host_executable: &Path) -> Result<(), &'static str> {
    Err("windows_only")
}

fn perform_operation(
    operation: Operation,
    backend: &Path,
    native_local_app_data: &Path,
) -> Result<Value, &'static str> {
    if !backend_package_is_verified(backend) {
        return Err("backend_integrity_failed");
    }
    let action = match operation {
        Operation::Pair => "pair",
        Operation::Rotate => "rotate",
        Operation::Revoke => "revoke",
    };
    let mut command = Command::new(backend);
    command
        .arg("--pcai-auth-admin")
        .arg(action)
        .arg("--native")
        .env_clear()
        .env("LOCALAPPDATA", native_local_app_data)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for name in ["SystemRoot", "WINDIR", "PATH"] {
        if let Some(value) = env::var_os(name) {
            command.env(name, value);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = command.output().map_err(|_| "backend_unavailable")?;
    if !output.status.success() {
        return Err("pairing_unavailable");
    }
    let text = std::str::from_utf8(&output.stdout)
        .map_err(|_| "pairing_unavailable")?
        .trim();
    match operation {
        Operation::Pair | Operation::Rotate => {
            if text.len() < 40
                || text.len() > 64
                || !text
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            {
                return Err("pairing_unavailable");
            }
            Ok(json!({ "ok": true, "pairingCode": text }))
        }
        Operation::Revoke if text == "ok" => Ok(json!({ "ok": true, "revoked": true })),
        Operation::Revoke => Err("pairing_unavailable"),
    }
}

fn response_for_request(
    origin: &str,
    expected_origin: &str,
    request: &[u8],
    host_dir: &Path,
    app_data: &Path,
) -> Value {
    if origin != expected_origin {
        return json!({ "ok": false, "code": "origin_forbidden" });
    }
    let operation = match parse_request(request) {
        Ok(operation) => operation,
        Err(code) => return json!({ "ok": false, "code": code }),
    };
    let backend = match backend_executable(host_dir) {
        Ok(path) => path,
        Err(code) => return json!({ "ok": false, "code": code }),
    };
    match perform_operation(operation, &backend, app_data) {
        Ok(result) => result,
        Err(code) => json!({ "ok": false, "code": code }),
    }
}

fn run_native_host(caller_argument: &str) -> Result<(), &'static str> {
    let host_executable = env::current_exe().map_err(|_| "host_not_configured")?;
    let host_dir = host_executable
        .parent()
        .ok_or("host_not_configured")?
        .to_path_buf();
    let manifest = fs::read(host_dir.join(HOST_MANIFEST)).map_err(|_| "host_not_configured")?;
    let expected_origin = approved_origin(&manifest)?;
    let compiled_origin = format!("chrome-extension://{}/", configured_extension_id()?);
    if expected_origin != compiled_origin {
        return Err("host_not_configured");
    }
    let request = read_frame(&mut io::stdin().lock())?;
    let app_data = app_root()?;
    let response = response_for_request(
        &normalize_caller_origin(caller_argument)?,
        &expected_origin,
        &request,
        &host_dir,
        &app_data,
    );
    let encoded = serde_json::to_vec(&response).map_err(|_| "internal_error")?;
    write_frame(&mut io::stdout().lock(), &encoded).map_err(|_| "internal_error")
}

fn main() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    match arguments.first().map(String::as_str) {
        Some("--register") if arguments.len() == 1 => {
            let result = env::current_exe()
                .map_err(|_| "host_not_configured")
                .and_then(|path| register_native_host(&path));
            if let Err(code) = result {
                eprintln!("{code}");
                std::process::exit(1);
            }
            return;
        }
        Some("--unregister") if arguments.len() == 1 => {
            let result = env::current_exe()
                .map_err(|_| "host_not_configured")
                .and_then(|path| unregister_native_host(&path));
            if let Err(code) = result {
                eprintln!("{code}");
                std::process::exit(1);
            }
            return;
        }
        Some("--verify-extension-id") if arguments.len() == 2 => {
            if configured_extension_id() == Ok(arguments[1].as_str()) {
                return;
            }
            std::process::exit(1);
        }
        Some("--register" | "--unregister" | "--verify-extension-id") => {
            eprintln!("invalid_arguments");
            std::process::exit(2);
        }
        Some(origin) => {
            if let Err(code) = run_native_host(origin) {
                // Native messaging stdout is reserved for framed JSON; no sensitive detail is logged.
                let response = serde_json::to_vec(&json!({ "ok": false, "code": code }))
                    .unwrap_or_else(|_| b"{\"ok\":false,\"code\":\"internal_error\"}".to_vec());
                let _ = write_frame(&mut io::stdout().lock(), &response);
            }
        }
        None => {
            let response = serde_json::to_vec(&json!({ "ok": false, "code": "origin_forbidden" }))
                .unwrap_or_else(|_| b"{\"ok\":false,\"code\":\"origin_forbidden\"}".to_vec());
            let _ = write_frame(&mut io::stdout().lock(), &response);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_ID: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const TEST_ORIGIN: &str = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/";

    #[test]
    fn host_manifest_requires_one_exact_extension_origin() {
        let manifest = format!(
            r#"{{"name":"{HOST_NAME}","type":"stdio","allowed_origins":["{TEST_ORIGIN}"]}}"#
        );
        assert_eq!(approved_origin(manifest.as_bytes()).unwrap(), TEST_ORIGIN);
        let wildcard = format!(
            r#"{{"name":"{HOST_NAME}","type":"stdio","allowed_origins":["chrome-extension://*/"]}}"#
        );
        assert!(approved_origin(wildcard.as_bytes()).is_err());
        let multiple = format!(
            r#"{{"name":"{HOST_NAME}","type":"stdio","allowed_origins":["{TEST_ORIGIN}","chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/"]}}"#
        );
        assert!(approved_origin(multiple.as_bytes()).is_err());
    }

    #[test]
    fn distribution_refuses_the_known_temporary_and_personal_profile_ids() {
        assert!(is_reserved_development_extension_id(
            "edbbjombinoidoopkhhkghaffoijjfjj"
        ));
        assert!(is_reserved_development_extension_id(
            "opegkncolnoekkhemhadjffdofppoknn"
        ));
        assert!(!is_reserved_development_extension_id(TEST_ID));
    }

    #[test]
    fn registry_binding_must_be_exact_and_exclusive() {
        let owned = RegistrySnapshot {
            default_value: Some(
                r"C:\Program Files\PERSONAL_CHAT_AI\native-messaging-host.json".into(),
            ),
            has_other_values: false,
            has_subkeys: false,
        };
        assert!(registry_binding_is_owned(
            &owned,
            r"C:\Program Files\PERSONAL_CHAT_AI\native-messaging-host.json"
        ));
        assert!(!registry_binding_is_owned(
            &owned,
            r"C:\Other\native-messaging-host.json"
        ));
        let foreign_value = RegistrySnapshot {
            has_other_values: true,
            ..owned
        };
        assert!(!registry_binding_is_owned(
            &foreign_value,
            r"C:\Program Files\PERSONAL_CHAT_AI\native-messaging-host.json"
        ));
    }

    #[test]
    fn host_auth_storage_is_outside_the_current_user_install_directory() {
        let local_app_data = PathBuf::from(r"C:\Synthetic\LocalAppData");
        let host_storage = app_root_from_localappdata(&local_app_data);
        let auth_path = host_storage
            .join("PERSONAL_CHAT_AI")
            .join("auth_state.json");
        let install_dir = local_app_data.join("PERSONAL_CHAT_AI");

        assert!(!auth_path.starts_with(install_dir));
        assert!(auth_path.starts_with(host_storage));
    }

    #[test]
    fn generated_host_manifest_contains_only_the_requested_origin() {
        let root = std::env::temp_dir().join(format!(
            "pcai-manifest-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let host_dir = root.join("resources/native-host");
        fs::create_dir_all(&host_dir).unwrap();
        let host = host_dir.join("pcai_native_host.exe");
        fs::write(&host, b"synthetic host placeholder").unwrap();

        let bytes = manifest_bytes(&host, TEST_ID).unwrap();
        let manifest: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(manifest["name"], HOST_NAME);
        assert_eq!(manifest["type"], "stdio");
        assert_eq!(manifest["allowed_origins"].as_array().unwrap().len(), 1);
        assert_eq!(manifest["allowed_origins"][0], TEST_ORIGIN);
        assert_eq!(
            PathBuf::from(manifest["path"].as_str().unwrap()),
            fs::canonicalize(host).unwrap()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn manifest_write_is_idempotent_and_refuses_replacement() {
        let root = std::env::temp_dir().join(format!(
            "pcai-manifest-write-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join(HOST_MANIFEST);
        assert!(write_manifest_if_missing(&path, b"expected").unwrap());
        assert!(!write_manifest_if_missing(&path, b"expected").unwrap());
        assert_eq!(
            write_manifest_if_missing(&path, b"foreign"),
            Err("manifest_conflict")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn native_requests_allow_only_exact_operations_and_shapes() {
        assert_eq!(parse_request(br#"{"type":"pair"}"#), Ok(Operation::Pair));
        assert_eq!(
            parse_request(br#"{"type":"rotate"}"#),
            Ok(Operation::Rotate)
        );
        assert_eq!(
            parse_request(br#"{"type":"revoke"}"#),
            Ok(Operation::Revoke)
        );
        assert!(parse_request(br#"{"type":"pair","pairingCode":"leak"}"#).is_err());
        assert!(parse_request(br#"{"type":"unknown"}"#).is_err());
    }

    #[test]
    fn native_framing_is_bounded_and_little_endian() {
        let body = br#"{"type":"pair"}"#;
        let mut frame = (body.len() as u32).to_le_bytes().to_vec();
        frame.extend_from_slice(body);
        assert_eq!(read_frame(&mut frame.as_slice()).unwrap(), body);
        let oversized = ((MAX_MESSAGE_BYTES + 1) as u32).to_le_bytes();
        assert!(read_frame(&mut oversized.as_slice()).is_err());
        let mut encoded = Vec::new();
        write_frame(&mut encoded, body).unwrap();
        assert_eq!(&encoded[..4], &(body.len() as u32).to_le_bytes());
        assert_eq!(&encoded[4..], body);
    }

    #[test]
    fn caller_origin_must_match_the_exact_manifest_origin() {
        assert!(valid_extension_id(TEST_ID));
        assert!(!valid_extension_id("*"));
        let reply = response_for_request(
            "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/",
            TEST_ORIGIN,
            br#"{"type":"pair"}"#,
            Path::new("."),
            Path::new("."),
        );
        assert_eq!(reply["code"], "origin_forbidden");
        assert_eq!(reply["pairingCode"], Value::Null);
        assert_eq!(
            normalize_caller_origin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").unwrap(),
            TEST_ORIGIN
        );
        assert!(normalize_caller_origin(
            "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/other"
        )
        .is_err());
    }
}
