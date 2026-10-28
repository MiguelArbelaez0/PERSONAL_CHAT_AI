param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ProductionExtensionId,

    [Parameter(Mandatory = $true)]
    [ValidateSet('ChromeWebStore', 'ManifestPublicKey')]
    [string] $ExtensionIdSource,

    [string] $ExtensionManifestPath,

    [string] $PyInstallerPython
)

$ErrorActionPreference = 'Stop'
$moduleRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$officialExtensionId = 'faclobdnhaephlneakdciincfakfdiam'
$forbiddenIds = @(
    'edbbjombinoidoopkhhkghaffoijjfjj',
    'opegkncolnoekkhemhadjffdofppoknn',
    'opegkncolnoekkhemhadjffodfpopknn'
)
if ($ProductionExtensionId -in $forbiddenIds) {
    throw 'El ID indicado pertenece a una instalación o prueba de desarrollo y no puede usarse en el instalador de distribución.'
}
if ($ProductionExtensionId -ne $officialExtensionId) {
    throw 'El instalador de esta versión debe usar el ID oficial confirmado de Chrome Web Store.'
}

if (-not $ExtensionManifestPath) {
    $projectRoot = (Resolve-Path -LiteralPath (Join-Path $moduleRoot '..')).Path
    $ExtensionManifestPath = Join-Path $projectRoot 'extension\manifest.json'
}
$extensionManifest = Get-Content -LiteralPath $ExtensionManifestPath -Raw | ConvertFrom-Json
if ($extensionManifest.manifest_version -ne 3 -or $extensionManifest.permissions -notcontains 'nativeMessaging') {
    throw 'El manifiesto de la extensión debe ser MV3 y declarar nativeMessaging.'
}

if ($ExtensionIdSource -eq 'ManifestPublicKey') {
    if (-not $extensionManifest.key) {
        throw 'Falta manifest.key. No se generará ni buscará una clave privada; configura la identidad pública de distribución con autorización.'
    }
    try {
        $publicKey = [Convert]::FromBase64String([string]$extensionManifest.key)
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try { $digest = $sha256.ComputeHash($publicKey) } finally { $sha256.Dispose() }
        $alphabet = 'abcdefghijklmnop'.ToCharArray()
        $derivedId = -join (0..15 | ForEach-Object {
            $byte = [int]$digest[$_]
            [string]$alphabet[$byte -shr 4] + [string]$alphabet[$byte -band 15]
        })
    } catch {
        throw 'No se pudo validar la clave pública de manifest.key.'
    }
    if ($derivedId -ne $ProductionExtensionId) {
        throw 'El ID suministrado no coincide con el ID derivado de la clave pública de la extensión.'
    }
} elseif ($ExtensionIdSource -eq 'ChromeWebStore') {
    Write-Warning 'La compilación confía en que ProductionExtensionId fue verificado por la propietaria en Chrome Web Store; no consulta ni modifica la tienda.'
}

$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) {
    $candidate = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $cargo = $candidate }
}
if (-not $cargo) { throw 'No se encontró Cargo. No se instaló ninguna herramienta.' }

$cargoBin = Split-Path -Parent $cargo
$tauriCli = Join-Path $cargoBin 'cargo-tauri.exe'
if (-not (Test-Path -LiteralPath $tauriCli -PathType Leaf)) {
    throw 'Falta Tauri CLI. El instalador no se generó y no se instaló ninguna herramienta.'
}

$backendSource = Join-Path $moduleRoot 'backend-dist\personal-chat-ai-backend\personal-chat-ai-backend.exe'
$backendDirectory = Join-Path $moduleRoot 'backend-dist\personal-chat-ai-backend'
if ($PyInstallerPython) {
    & (Join-Path $PSScriptRoot 'build_backend.ps1') -PyInstallerPython $PyInstallerPython
    if ($LASTEXITCODE -ne 0) { throw "El empaquetado de FastAPI terminó con código $LASTEXITCODE." }
}
if (-not (Test-Path -LiteralPath $backendSource -PathType Leaf)) {
    throw 'Falta el backend empaquetado. Prepara backend-dist con el script build_backend.ps1.'
}
$integrityScript = Join-Path $PSScriptRoot 'write_backend_integrity.ps1'
$backendIntegrityHash = (& $integrityScript -BackendDirectory $backendDirectory | Out-String).Trim()
if ($backendIntegrityHash -notmatch '^[0-9a-f]{64}$') {
    throw 'No se pudo generar la comprobación de integridad del backend empaquetado.'
}

$hostSource = Join-Path $moduleRoot 'target\release\pcai_native_host.exe'

$previousExtensionId = $env:PCAI_CHROME_EXTENSION_ID
$previousBuildMode = $env:PCAI_CHROME_EXTENSION_BUILD_MODE
$previousBackendHash = $env:PCAI_BACKEND_INTEGRITY_SHA256
$previousPath = $env:PATH
try {
    $env:PCAI_CHROME_EXTENSION_ID = $ProductionExtensionId
    $env:PCAI_CHROME_EXTENSION_BUILD_MODE = 'distribution'
    $env:PCAI_BACKEND_INTEGRITY_SHA256 = $backendIntegrityHash
    $env:PATH = "$cargoBin;$env:PATH"
    Push-Location $moduleRoot
    try {
        & $cargo build --release --bin pcai_native_host
        if ($LASTEXITCODE -ne 0) { throw "La compilación del host terminó con código $LASTEXITCODE." }
        if (-not (Test-Path -LiteralPath $hostSource -PathType Leaf)) {
            throw 'Cargo no generó el ejecutable Native Messaging esperado.'
        }
        & $hostSource --verify-extension-id $ProductionExtensionId
        if ($LASTEXITCODE -ne 0) { throw 'El host compilado no contiene el ID de producción indicado.' }

        & $tauriCli build --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw "Tauri terminó con código $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
} finally {
    $env:PATH = $previousPath
    if ($null -eq $previousExtensionId) { Remove-Item Env:PCAI_CHROME_EXTENSION_ID -ErrorAction SilentlyContinue }
    else { $env:PCAI_CHROME_EXTENSION_ID = $previousExtensionId }
    if ($null -eq $previousBuildMode) { Remove-Item Env:PCAI_CHROME_EXTENSION_BUILD_MODE -ErrorAction SilentlyContinue }
    else { $env:PCAI_CHROME_EXTENSION_BUILD_MODE = $previousBuildMode }
    if ($null -eq $previousBackendHash) { Remove-Item Env:PCAI_BACKEND_INTEGRITY_SHA256 -ErrorAction SilentlyContinue }
    else { $env:PCAI_BACKEND_INTEGRITY_SHA256 = $previousBackendHash }
}

$installerDir = Join-Path $moduleRoot 'target\release\bundle\nsis'
$installers = @(Get-ChildItem -LiteralPath $installerDir -Filter '*.exe' -File -ErrorAction SilentlyContinue)
if ($installers.Count -eq 0) { throw 'La compilación terminó sin generar un instalador NSIS.' }
$installers | Select-Object -ExpandProperty FullName
