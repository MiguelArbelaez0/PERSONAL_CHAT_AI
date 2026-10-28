param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string] $ExtensionId,

    [Parameter(Mandatory = $true)]
    [string] $OutputDirectory
)

$ErrorActionPreference = 'Stop'
$reservedDevelopmentIds = @(
    'edbbjombinoidoopkhhkghaffoijjfjj',
    'opegkncolnoekkhemhadjffdofppoknn'
)
if ($ExtensionId -in $reservedDevelopmentIds) {
    throw 'No se puede preparar una distribución con un ID temporal o de perfil personal.'
}
$moduleRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $moduleRoot '..')).Path
$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) {
    $cargoCandidate = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
    if (Test-Path -LiteralPath $cargoCandidate -PathType Leaf) { $cargo = $cargoCandidate }
}
if (-not $cargo) { throw 'No se encontró Cargo. No se instaló ninguna herramienta.' }

$outputFull = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputFull) {
    throw 'La carpeta de salida ya existe. Elige una carpeta nueva para evitar sobrescribir archivos.'
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

Push-Location $moduleRoot
$previousExtensionId = $env:PCAI_CHROME_EXTENSION_ID
$previousBackendHash = $env:PCAI_BACKEND_INTEGRITY_SHA256
try {
    $env:PCAI_CHROME_EXTENSION_ID = $ExtensionId
    $env:PCAI_BACKEND_INTEGRITY_SHA256 = $backendIntegrityHash
    & $cargo build --release --bin pcai_native_host
    if ($LASTEXITCODE -ne 0) { throw "Cargo terminó con código $LASTEXITCODE." }
} finally {
    if ($null -eq $previousExtensionId) { Remove-Item Env:PCAI_CHROME_EXTENSION_ID -ErrorAction SilentlyContinue }
    else { $env:PCAI_CHROME_EXTENSION_ID = $previousExtensionId }
    if ($null -eq $previousBackendHash) { Remove-Item Env:PCAI_BACKEND_INTEGRITY_SHA256 -ErrorAction SilentlyContinue }
    else { $env:PCAI_BACKEND_INTEGRITY_SHA256 = $previousBackendHash }
    Pop-Location
}

$hostDir = Join-Path $outputFull 'native-host'
$backendDir = Join-Path $outputFull 'backend'
New-Item -ItemType Directory -Force -Path $hostDir, $backendDir | Out-Null
$hostExe = Join-Path $hostDir 'pcai_native_host.exe'
Copy-Item -LiteralPath (Join-Path $moduleRoot 'target\release\pcai_native_host.exe') -Destination $hostExe
Copy-Item -Path (Join-Path $backendSource '*') -Destination $backendDir -Recurse
& (Join-Path $PSScriptRoot 'write_native_host_manifest.ps1') -ExtensionId $ExtensionId -HostExecutable $hostExe -OutputPath (Join-Path $hostDir 'native-messaging-host.json')
Write-Output "Host preparado en: $outputFull. No se registró en Windows ni se instaló en Chrome."
