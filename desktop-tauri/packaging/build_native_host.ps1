param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Development', 'DevelopmentInstalled', 'Distribution')]
    [string] $Mode,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ExtensionId,

    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
$developmentExtensionId = 'opegkncolnoekkhemhadjffodfpopknn'
$distributionExtensionId = 'faclobdnhaephlneakdciincfakfdiam'
if ($Mode -in @('Development', 'DevelopmentInstalled') -and $ExtensionId -ne $developmentExtensionId) {
    throw 'El modo local solo admite el ID de desarrollo confirmado para PERSONAL_CHAT_AI.'
}
if ($Mode -eq 'Distribution' -and $ExtensionId -ne $distributionExtensionId) {
    throw 'La distribución debe utilizar el ID oficial confirmado de Chrome Web Store.'
}
$compiledBuildMode = switch ($Mode) {
    'Development' { 'development' }
    'DevelopmentInstalled' { 'development-installed' }
    'Distribution' { 'distribution' }
}

$moduleRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$targetRoot = [IO.Path]::GetFullPath((Join-Path $moduleRoot 'target'))
$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) {
    $cargoCandidate = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
    if (Test-Path -LiteralPath $cargoCandidate -PathType Leaf) { $cargo = $cargoCandidate }
}
if (-not $cargo) { throw 'No se encontró Cargo. No se instaló ninguna herramienta.' }

if (-not $OutputDirectory) {
    $packageName = if ($Mode -eq 'DevelopmentInstalled') { 'native-host-development-installed' } else { 'native-host-development' }
    $OutputDirectory = Join-Path $targetRoot "$packageName\package"
}
$outputFull = [IO.Path]::GetFullPath($OutputDirectory)
$targetPrefix = $targetRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $outputFull.StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Los artefactos del host deben permanecer dentro de desktop-tauri/target/.'
}
if (Test-Path -LiteralPath $outputFull) {
    throw 'La carpeta de salida ya existe. Elige una ruta nueva dentro de desktop-tauri/target/ para conservar el artefacto anterior.'
}

$backendSource = Join-Path $moduleRoot 'backend-dist\personal-chat-ai-backend'
$backendExe = Join-Path $backendSource 'personal-chat-ai-backend.exe'
if (-not (Test-Path -LiteralPath $backendExe -PathType Leaf)) {
    throw 'Primero empaqueta el backend con packaging/build_backend.ps1.'
}
$integrityScript = Join-Path $PSScriptRoot 'write_backend_integrity.ps1'
$backendIntegrityHash = (& $integrityScript -BackendDirectory $backendSource | Out-String).Trim()
if ($backendIntegrityHash -notmatch '^[0-9a-f]{64}$') {
    throw 'No se pudo generar la comprobación de integridad del backend empaquetado.'
}

$cargoBin = Split-Path -Parent $cargo
$cargoTarget = Join-Path $targetRoot ("{0}\cargo-target" -f $(if ($Mode -eq 'DevelopmentInstalled') { 'native-host-development-installed' } else { 'native-host-development' }))
$previousExtensionId = $env:PCAI_CHROME_EXTENSION_ID
$previousBuildMode = $env:PCAI_CHROME_EXTENSION_BUILD_MODE
$previousBackendHash = $env:PCAI_BACKEND_INTEGRITY_SHA256
try {
    $env:PCAI_CHROME_EXTENSION_ID = $ExtensionId
    $env:PCAI_CHROME_EXTENSION_BUILD_MODE = $compiledBuildMode
    $env:PCAI_BACKEND_INTEGRITY_SHA256 = $backendIntegrityHash
    Push-Location $moduleRoot
    try {
        & $cargo build --release --bin pcai_native_host --target-dir $cargoTarget
        if ($LASTEXITCODE -ne 0) { throw "Cargo terminó con código $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
} finally {
    if ($null -eq $previousExtensionId) { Remove-Item Env:PCAI_CHROME_EXTENSION_ID -ErrorAction SilentlyContinue }
    else { $env:PCAI_CHROME_EXTENSION_ID = $previousExtensionId }
    if ($null -eq $previousBuildMode) { Remove-Item Env:PCAI_CHROME_EXTENSION_BUILD_MODE -ErrorAction SilentlyContinue }
    else { $env:PCAI_CHROME_EXTENSION_BUILD_MODE = $previousBuildMode }
    if ($null -eq $previousBackendHash) { Remove-Item Env:PCAI_BACKEND_INTEGRITY_SHA256 -ErrorAction SilentlyContinue }
    else { $env:PCAI_BACKEND_INTEGRITY_SHA256 = $previousBackendHash }
}

$builtHost = Join-Path $cargoTarget 'release\pcai_native_host.exe'
if (-not (Test-Path -LiteralPath $builtHost -PathType Leaf)) {
    throw 'Cargo no generó el ejecutable Native Messaging esperado.'
}
& $builtHost --verify-extension-id $ExtensionId
if ($LASTEXITCODE -ne 0) { throw 'El host compilado no coincide con el ID y modo solicitados.' }

$hostDir = Join-Path $outputFull 'native-host'
$backendDir = Join-Path $outputFull 'backend'
New-Item -ItemType Directory -Force -Path $hostDir, $backendDir | Out-Null
$hostExe = Join-Path $hostDir 'pcai_native_host.exe'
Copy-Item -LiteralPath $builtHost -Destination $hostExe
Copy-Item -Path (Join-Path $backendSource '*') -Destination $backendDir -Recurse
& (Join-Path $PSScriptRoot 'write_native_host_manifest.ps1') -ExtensionId $ExtensionId -HostExecutable $hostExe -OutputPath (Join-Path $hostDir 'native-messaging-host.json')

$manifest = Get-Content -LiteralPath (Join-Path $hostDir 'native-messaging-host.json') -Raw | ConvertFrom-Json
if ($manifest.allowed_origins.Count -ne 1 -or $manifest.allowed_origins[0] -ne "chrome-extension://$ExtensionId/" -or $manifest.allowed_origins[0].Contains('*')) {
    throw 'El manifiesto generado no contiene exclusivamente el origen esperado.'
}
Write-Output "Modo: $Mode"
Write-Output "ID autorizado: $ExtensionId"
Write-Output "Host local: $hostExe"
Write-Output "Manifiesto: $(Join-Path $hostDir 'native-messaging-host.json')"
Write-Output 'No se registró en Windows ni se modificó Chrome.'
