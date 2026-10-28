param(
    [switch] $RepairNativeMessaging,

    [string] $ObservedExtensionId
)

$ErrorActionPreference = 'Stop'
$developmentExtensionId = 'opegkncolnoekkhemhadjffodfpopknn'
$officialExtensionId = 'faclobdnhaephlneakdciincfakfdiam'
$hostName = 'com.personalchatai.desktop'
$registryKeyPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.personalchatai.desktop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$extensionRoot = Join-Path $projectRoot 'extension'
$extensionManifestPath = Join-Path $extensionRoot 'manifest.json'
$hostPackage = Join-Path $projectRoot 'desktop-tauri\target\native-host-development\package'
$hostDirectory = Join-Path $hostPackage 'native-host'
$hostExecutable = Join-Path $hostDirectory 'pcai_native_host.exe'
$hostManifestPath = Join-Path $hostDirectory 'native-messaging-host.json'
$registryBackupDirectory = Join-Path $projectRoot 'desktop-tauri\target\native-host-development\registry-backups'

function Write-Check([string] $Name, [bool] $Passed, [string] $Detail) {
    $state = if ($Passed) { 'OK' } else { 'REVISAR' }
    Write-Output ('[{0}] {1}: {2}' -f $state, $Name, $Detail)
}

function Normalize-ManifestPath([string] $Path) {
    if (-not $Path) { return '' }
    $value = $Path.Trim().Trim('"')
    if ($value.StartsWith('\\?\', [StringComparison]::Ordinal)) { $value = $value.Substring(4) }
    return [IO.Path]::GetFullPath($value)
}

function Get-RegistrySnapshot {
    if (-not (Test-Path -LiteralPath $registryKeyPath)) { return $null }
    $key = Get-Item -LiteralPath $registryKeyPath
    [pscustomobject]@{
        DefaultValue = [string]$key.GetValue('')
        OtherValues = @($key.GetValueNames() | Where-Object { $_ -ne '' })
        SubKeys = [int]$key.SubKeyCount
    }
}

Write-Output 'PERSONAL_CHAT_AI — diagnóstico local (sin cambios por defecto)'
Write-Output "Carpeta de extensión para Cargar descomprimida: $extensionRoot"
Write-Output "ID de desarrollo esperado: $developmentExtensionId"
Write-Output "ID oficial de distribución: $officialExtensionId"

try {
    $manifest = Get-Content -LiteralPath $extensionManifestPath -Raw | ConvertFrom-Json
    $hasNativePermission = $manifest.permissions -contains 'nativeMessaging'
    Write-Check 'Extensión MV3' ($manifest.manifest_version -eq 3) ("versión {0}" -f $manifest.version)
    Write-Check 'Permiso Native Messaging' $hasNativePermission $(if ($hasNativePermission) { 'declarado' } else { 'falta en manifest.json' })
} catch {
    Write-Check 'Manifiesto de extensión' $false 'no se pudo leer o validar extension/manifest.json'
    $manifest = $null
}

$chromeCandidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
Write-Check 'Google Chrome' ($chromeCandidates.Count -gt 0) $(if ($chromeCandidates.Count) { 'instalado' } else { 'no se detectó en las rutas habituales' })

try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
    Write-Check 'Backend local' ($health.status -eq 'ok') $(if ($health.status -eq 'ok') { 'responde correctamente' } else { 'respondió con un estado inesperado' })
} catch {
    Write-Check 'Backend local' $false 'no responde en este momento; abre PERSONAL_CHAT_AI para iniciarlo'
}

try {
    $models = Invoke-RestMethod -Uri 'http://127.0.0.1:1234/v1/models' -TimeoutSec 2
    $modelCount = @($models.data).Count
    Write-Check 'LM Studio' $true ("responde; modelos visibles: {0}" -f $modelCount)
} catch {
    Write-Check 'LM Studio' $false 'no responde en el puerto local habitual; la generación requiere que esté iniciado y tenga un modelo cargado'
}

$snapshot = Get-RegistrySnapshot
if ($null -eq $snapshot) {
    Write-Check 'Registro Native Messaging' $false 'la clave propia no existe en HKCU'
    $registeredPath = ''
    $registeredManifestExists = $false
} else {
    $registeredPath = Normalize-ManifestPath $snapshot.DefaultValue
    $registeredManifestExists = Test-Path -LiteralPath $registeredPath -PathType Leaf
    Write-Check 'Registro Native Messaging' $registeredManifestExists $(if ($registeredManifestExists) { "manifiesto existente: $registeredPath" } else { "ruta registrada ausente: $registeredPath" })
    $usesVerbatimPrefix = ([string]$snapshot.DefaultValue).StartsWith('\\?\', [StringComparison]::Ordinal)
    Write-Check 'Formato de ruta HKCU' (-not $usesVerbatimPrefix) $(if ($usesVerbatimPrefix) { 'el valor usa prefijo extendido \\?\; requiere validación desde Chrome antes de considerar la conexión aprobada' } else { 'ruta absoluta Windows convencional' })
    if ($snapshot.OtherValues.Count -or $snapshot.SubKeys) {
        Write-Check 'Propiedad exclusiva de la clave' $false 'hay valores adicionales o subclaves; la reparación automática se bloqueará'
    } else {
        Write-Check 'Propiedad exclusiva de la clave' $true 'solo contiene el valor predeterminado'
    }
}

if ((Test-Path -LiteralPath $hostExecutable -PathType Leaf) -and (Test-Path -LiteralPath $hostManifestPath -PathType Leaf)) {
    try {
        $hostManifest = Get-Content -LiteralPath $hostManifestPath -Raw | ConvertFrom-Json
        $expectedOrigin = "chrome-extension://$developmentExtensionId/"
        $hostPathMatches = (Normalize-ManifestPath $hostManifest.path) -eq (Normalize-ManifestPath $hostExecutable)
        $originMatches = @($hostManifest.allowed_origins).Count -eq 1 -and $hostManifest.allowed_origins[0] -ceq $expectedOrigin
        $compiledMatches = $false
        & $hostExecutable --verify-extension-id $developmentExtensionId 2>$null
        $compiledMatches = ($LASTEXITCODE -eq 0)
        Write-Check 'Host local compilado' $compiledMatches $(if ($compiledMatches) { "autoriza $developmentExtensionId" } else { 'el binario no corresponde al ID local confirmado' })
        Write-Check 'Manifiesto del host' ($hostPathMatches -and $originMatches) $(if ($hostPathMatches -and $originMatches) { 'ruta y único origen exactos' } else { 'la ruta o el origen no coinciden; no se reparará el Registro' })
    } catch {
        Write-Check 'Manifiesto del host' $false 'no se pudo validar el paquete local'
        $hostPathMatches = $false
        $originMatches = $false
        $compiledMatches = $false
    }
} else {
    Write-Check 'Host local compilado' $false 'aún no está preparado; ejecuta el comando de compilación local documentado'
    $hostPathMatches = $false
    $originMatches = $false
    $compiledMatches = $false
}

Write-Output 'Chrome cargará el código de la carpeta extension/ después de seleccionar Cargar descomprimida en chrome://extensions.'
Write-Output 'Comprueba el ID mostrado por Chrome; este diagnóstico no inspecciona ni modifica perfiles de Chrome.'

if (-not $RepairNativeMessaging) { return }

if ($ObservedExtensionId -cne $developmentExtensionId) {
    throw 'Para reparar el host local debes proporcionar el ID confirmado de desarrollo mediante -ObservedExtensionId.'
}
if (-not ($compiledMatches -and $hostPathMatches -and $originMatches)) {
    throw 'La reparación se canceló porque el host local no está completo o no coincide exactamente con el ID confirmado.'
}

$uninstallEntries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -eq 'PERSONAL_CHAT_AI' -and $_.InstallLocation })
$staleBindingProven = $false
if ($snapshot -and $uninstallEntries.Count -eq 1) {
    $oldInstall = ([string]$uninstallEntries[0].InstallLocation).Trim().Trim('"')
    if ($oldInstall) {
        $expectedStalePath = Normalize-ManifestPath (Join-Path $oldInstall 'native-host\native-messaging-host.json')
        $staleBindingProven = ($registeredPath -eq $expectedStalePath) -and -not $registeredManifestExists
    }
}
if ($snapshot -and -not $staleBindingProven) {
    throw 'La clave actual no coincide con una ruta obsoleta verificable de la instalación registrada; no se modificará.'
}
if ($snapshot -and ($snapshot.OtherValues.Count -or $snapshot.SubKeys)) {
    throw 'La clave contiene otros valores o subclaves; no se modificará.'
}

Write-Output "Se propone cambiar únicamente: $registryKeyPath"
Write-Output ("Valor anterior: {0}" -f $(if ($snapshot) { $snapshot.DefaultValue } else { '(clave ausente)' }))
Write-Output "Valor nuevo: $hostManifestPath"
$confirmation = Read-Host 'Escribe REPARAR para reemplazar únicamente esta vinculación Native Messaging'
if ($confirmation -cne 'REPARAR') {
    Write-Output 'Cancelado. No se modificó el Registro.'
    return
}

$oldValue = if ($snapshot) { $snapshot.DefaultValue } else { $null }
if ($snapshot) {
    # Persist an exact backup outside tracked source before changing the sole authorized key.
    New-Item -ItemType Directory -Path $registryBackupDirectory -Force | Out-Null
    $backupPath = Join-Path $registryBackupDirectory ('native-messaging-{0:yyyyMMdd-HHmmss-fff}.json' -f (Get-Date))
    $backup = [ordered]@{
        registryKey = 'HKCU\Software\Google\Chrome\NativeMessagingHosts\com.personalchatai.desktop'
        defaultValue = $oldValue
    } | ConvertTo-Json -Depth 3
    [IO.File]::WriteAllText($backupPath, $backup, [Text.UTF8Encoding]::new($false))
    $savedBackup = Get-Content -LiteralPath $backupPath -Raw | ConvertFrom-Json
    if ($savedBackup.registryKey -cne 'HKCU\Software\Google\Chrome\NativeMessagingHosts\com.personalchatai.desktop' -or
        $savedBackup.defaultValue -cne $oldValue) {
        throw 'La copia de seguridad del valor anterior no se pudo verificar; no se modificó el Registro.'
    }
    Write-Output "Copia verificada del valor anterior: $backupPath"
    Set-Item -LiteralPath $registryKeyPath -Value $hostManifestPath
}
$registrationOutput = @(& $hostExecutable --register 2>&1)
if ($LASTEXITCODE -eq 0) {
    $after = Get-RegistrySnapshot
    if ($after -and (Normalize-ManifestPath $after.DefaultValue) -eq (Normalize-ManifestPath $hostManifestPath)) {
        Write-Output 'Native Messaging local quedó vinculado al host de desarrollo confirmado.'
        return
    }
}

$safeRegistrationError = ($registrationOutput | ForEach-Object { [string]$_ } | Select-Object -First 1)
if ($safeRegistrationError -match '^[a-z_]+$') {
    Write-Output "El host rechazó el registro con el código técnico: $safeRegistrationError"
}

# Restore only the default value we changed; never overwrite a concurrent change.
if ($snapshot -and (Test-Path -LiteralPath $registryKeyPath)) {
    $afterFailure = Get-RegistrySnapshot
    if ((Normalize-ManifestPath $afterFailure.DefaultValue) -eq (Normalize-ManifestPath $hostManifestPath)) {
        Set-Item -LiteralPath $registryKeyPath -Value $oldValue
        throw 'Falló el registro nuevo. Se restauró el valor predeterminado anterior de HKCU.'
    }
}
throw 'Falló la verificación del registro nuevo. No se sobrescribió ninguna modificación concurrente; revisa la clave indicada.'
