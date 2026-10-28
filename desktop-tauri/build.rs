fn main() {
    println!("cargo:rerun-if-env-changed=PCAI_CHROME_EXTENSION_ID");
    println!("cargo:rerun-if-env-changed=PCAI_CHROME_EXTENSION_BUILD_MODE");
    println!("cargo:rerun-if-env-changed=PCAI_BACKEND_INTEGRITY_SHA256");
    tauri_build::build()
}
