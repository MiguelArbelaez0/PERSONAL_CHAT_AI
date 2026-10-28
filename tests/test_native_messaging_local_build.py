import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEVELOPMENT_ID = "opegkncolnoekkhemhadjffodfpopknn"
DISTRIBUTION_ID = "faclobdnhaephlneakdciincfakfdiam"


def read(relative_path):
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_extension_declares_mv3_native_messaging_and_only_loopback_backend_access():
    manifest = json.loads(read("extension/manifest.json"))
    assert manifest["manifest_version"] == 3
    assert "nativeMessaging" in manifest["permissions"]
    assert manifest["host_permissions"] == ["http://127.0.0.1/*"]
    assert "<all_urls>" not in manifest["host_permissions"]


def test_local_host_build_is_explicit_exact_id_and_stays_under_ignored_target():
    script = read("desktop-tauri/packaging/build_native_host.ps1")
    assert "ValidateSet('Development', 'DevelopmentInstalled', 'Distribution')" in script
    assert DEVELOPMENT_ID in script
    assert DISTRIBUTION_ID in script
    assert '"{0}\\cargo-target"' in script
    assert "native-host-development-installed" in script
    assert "'development-installed'" in script
    assert "StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase)" in script
    assert "allowed_origins.Count -ne 1" in script
    assert "No se registró en Windows ni se modificó Chrome." in script
    assert "REG ADD" not in script.upper()


def test_distribution_installer_is_fixed_to_official_id_and_never_development_id():
    script = read("desktop-tauri/packaging/build_windows_installer.ps1")
    assert DISTRIBUTION_ID in script
    assert DEVELOPMENT_ID in script
    assert "$ProductionExtensionId -ne $officialExtensionId" in script
    assert "$env:PCAI_CHROME_EXTENSION_BUILD_MODE = 'distribution'" in script


def test_registry_diagnostic_is_read_only_unless_explicit_repair_and_confirmation():
    script = read("tools/PROBAR_PERSONAL_CHAT_AI.ps1")
    assert "[switch] $RepairNativeMessaging" in script
    assert "if (-not $RepairNativeMessaging) { return }" in script
    assert "-ObservedExtensionId" in script
    assert "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.personalchatai.desktop" in script
    assert "Escribe REPARAR" in script
    assert "$confirmation -cne 'REPARAR'" in script
    assert "defaultValue" in script or "DefaultValue" in script
    assert "snapshot.OtherValues.Count -or $snapshot.SubKeys" in script


def test_all_added_powershell_files_parse_without_executing_them():
    powershell = shutil.which("powershell") or shutil.which("pwsh")
    if not powershell:
        import pytest

        pytest.skip("PowerShell no está disponible para validación sintáctica")
    files = [
        ROOT / "desktop-tauri/packaging/build_native_host.ps1",
        ROOT / "desktop-tauri/packaging/build_windows_installer.ps1",
        ROOT / "tools/PROBAR_PERSONAL_CHAT_AI.ps1",
    ]
    escaped = [str(path).replace("'", "''") for path in files]
    command = """
$errors = @()
foreach ($path in @(%s)) {
  $tokens = $null
  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors) | Out-Null
  if ($parseErrors.Count -gt 0) { $errors += $parseErrors }
}
if ($errors.Count) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }
""" % ",".join("'%s'" % path for path in escaped)
    result = subprocess.run(
        [powershell, "-NoProfile", "-NonInteractive", "-Command", command],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
