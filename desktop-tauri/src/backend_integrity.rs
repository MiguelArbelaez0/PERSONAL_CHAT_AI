use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path};

const MANIFEST_NAME: &str = "backend-integrity.json";

pub fn sha256_hex(contents: &[u8]) -> String {
    Sha256::digest(contents)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn collect_relative_files(root: &Path, current: &Path, files: &mut HashSet<String>) -> bool {
    let Ok(entries) = fs::read_dir(current) else {
        return false;
    };
    for entry in entries {
        let Ok(entry) = entry else { return false };
        let Ok(kind) = entry.file_type() else {
            return false;
        };
        if kind.is_symlink() {
            return false;
        }
        let path = entry.path();
        if kind.is_dir() {
            if !collect_relative_files(root, &path, files) {
                return false;
            }
        } else if kind.is_file() {
            if path.file_name().is_some_and(|name| name == MANIFEST_NAME) {
                continue;
            }
            let Ok(relative) = path.strip_prefix(root) else {
                return false;
            };
            files.insert(relative.to_string_lossy().replace('\\', "/"));
        } else {
            return false;
        }
    }
    true
}

pub fn verify_backend_package(root: &Path, expected_manifest_hash: Option<&str>) -> bool {
    let Some(expected) = expected_manifest_hash else {
        return false;
    };
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return false;
    }
    let Ok(root) = fs::canonicalize(root) else {
        return false;
    };
    let manifest_path = root.join(MANIFEST_NAME);
    let Ok(manifest_bytes) = fs::read(&manifest_path) else {
        return false;
    };
    if !sha256_hex(&manifest_bytes).eq_ignore_ascii_case(expected) {
        return false;
    }
    let Ok(manifest) = serde_json::from_slice::<Value>(&manifest_bytes) else {
        return false;
    };
    let Some(entries) = manifest.get("files").and_then(Value::as_array) else {
        return false;
    };
    if entries.is_empty() {
        return false;
    }

    let mut listed = HashSet::new();
    for entry in entries {
        let Some(relative) = entry.get("path").and_then(Value::as_str) else {
            return false;
        };
        let Some(expected_file_hash) = entry.get("sha256").and_then(Value::as_str) else {
            return false;
        };
        let relative_path = Path::new(relative);
        if relative_path.as_os_str().is_empty()
            || relative_path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
            || expected_file_hash.len() != 64
            || !expected_file_hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
            || !listed.insert(relative.replace('\\', "/"))
        {
            return false;
        }
        let candidate = root.join(relative_path);
        let Ok(canonical) = fs::canonicalize(&candidate) else {
            return false;
        };
        if !canonical.starts_with(&root) || !canonical.is_file() {
            return false;
        }
        let Ok(contents) = fs::read(canonical) else {
            return false;
        };
        if !sha256_hex(&contents).eq_ignore_ascii_case(expected_file_hash) {
            return false;
        }
    }

    let mut actual = HashSet::new();
    collect_relative_files(&root, &root, &mut actual) && actual == listed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "pcai-backend-integrity-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    fn write_integrity_manifest(root: &Path) -> String {
        let mut paths = Vec::new();
        let mut files = HashSet::new();
        assert!(collect_relative_files(root, root, &mut files));
        for path in files {
            let contents = fs::read(root.join(&path)).expect("synthetic file");
            paths.push(serde_json::json!({ "path": path, "sha256": sha256_hex(&contents) }));
        }
        paths.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        let bytes = serde_json::to_vec(&serde_json::json!({ "files": paths })).unwrap();
        fs::write(root.join(MANIFEST_NAME), &bytes).unwrap();
        sha256_hex(&bytes)
    }

    #[test]
    fn package_integrity_accepts_exact_synthetic_package_and_rejects_changes() {
        let root = temporary_root();
        fs::create_dir_all(root.join("_internal")).unwrap();
        fs::write(root.join("backend.exe"), b"synthetic executable").unwrap();
        fs::write(root.join("_internal/module.pyc"), b"synthetic module").unwrap();
        let manifest_hash = write_integrity_manifest(&root);

        assert!(verify_backend_package(&root, Some(&manifest_hash)));
        fs::write(root.join("_internal/module.pyc"), b"changed module").unwrap();
        assert!(!verify_backend_package(&root, Some(&manifest_hash)));
        assert!(!verify_backend_package(&root, None));
        let _ = fs::remove_dir_all(root);
    }
}
