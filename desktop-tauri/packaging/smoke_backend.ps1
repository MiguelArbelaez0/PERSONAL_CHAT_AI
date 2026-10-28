param(
    [string] $BackendExecutable = (Join-Path $PSScriptRoot '..\backend-dist\personal-chat-ai-backend\personal-chat-ai-backend.exe')
)

$ErrorActionPreference = 'Stop'
$executable = (Resolve-Path -LiteralPath $BackendExecutable).Path
$testRoot = Join-Path $env:TEMP ('pcai-backend-smoke-' + [guid]::NewGuid().ToString('N'))
$localAppData = Join-Path $testRoot 'LocalAppData'
$appData = Join-Path $localAppData 'PERSONAL_CHAT_AI'
$runtimeTemp = Join-Path $appData 'runtime-temp'
$null = New-Item -ItemType Directory -Force -Path `
    (Join-Path $appData 'data'), `
    (Join-Path $appData 'legacy'), `
    (Join-Path $appData 'knowledge'), `
    (Join-Path $appData 'logs'), `
    $runtimeTemp

$listener = $null
try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8000)
    $listener.Start()
} catch {
    if ($listener) { $listener.Stop() }
    throw 'El puerto 8000 está ocupado; no se inició el backend de prueba.'
}
$listener.Stop()

$startInfo = [Diagnostics.ProcessStartInfo]::new($executable)
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.WorkingDirectory = $runtimeTemp
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Environment.Clear()
$systemRoot = [Environment]::GetEnvironmentVariable('SystemRoot', 'Process')
if ($systemRoot) {
    $startInfo.Environment['SystemRoot'] = $systemRoot
    $startInfo.Environment['WINDIR'] = $systemRoot
    $startInfo.Environment['PATH'] = Join-Path $systemRoot 'System32'
}
$startInfo.Environment['TEMP'] = $runtimeTemp
$startInfo.Environment['TMP'] = $runtimeTemp
$startInfo.Environment['LOCALAPPDATA'] = $localAppData
$startInfo.Environment['PCAI_DATABASE_PATH'] = Join-Path $appData 'data\personal_chat_ai_v2.sqlite3'
$startInfo.Environment['DATABASE_PATH'] = Join-Path $appData 'legacy\personal_chat_ai.sqlite3'
$startInfo.Environment['PERSONALITIES_DATABASE_PATH'] = Join-Path $appData 'legacy\personalities.sqlite3'
$startInfo.Environment['KNOWLEDGE_PATH'] = Join-Path $appData 'knowledge'
$startInfo.Environment['BACKEND_HOST'] = '127.0.0.1'
$startInfo.Environment['BACKEND_PORT'] = '8000'
$startInfo.Environment['LM_STUDIO_BASE_URL'] = 'http://127.0.0.1:1234/v1'
$startInfo.Environment['LM_STUDIO_MODEL'] = ''
$startInfo.Environment['LM_STUDIO_TIMEOUT'] = '90'
$startInfo.Environment['LM_STUDIO_CONTEXT_TOKENS'] = '8192'
$startInfo.Environment['LM_STUDIO_OUTPUT_TOKENS'] = '1200'
$startInfo.Environment['DEFAULT_LANGUAGE'] = 'es'
$startInfo.Environment['MAX_MESSAGE_CHARS'] = '4000'
$startInfo.Environment['MAX_CONTEXT_CHARS'] = '12000'
$startInfo.Environment['MEMORY_MAX_NOTES'] = '100'
$startInfo.Environment['LOG_LEVEL'] = 'INFO'

$process = $null
$healthOk = $false
$databaseIsTemporary = $false
try {
    $process = [Diagnostics.Process]::Start($startInfo)
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) { throw "El backend empaquetado terminó al iniciar (código $($process.ExitCode))." }
        try {
            $health = Invoke-RestMethod -TimeoutSec 2 'http://127.0.0.1:8000/api/health'
            if ($health.status -eq 'ok' -and $health.service -eq 'personal-chat-ai') {
                $healthOk = $true
                break
            }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    $database = Join-Path $appData 'data\personal_chat_ai_v2.sqlite3'
    $databaseIsTemporary = (Test-Path -LiteralPath $database) -and $database.StartsWith($testRoot, [StringComparison]::OrdinalIgnoreCase)
} finally {
    if ($process -and -not $process.HasExited) {
        $process.Kill()
        $process.WaitForExit(5000) | Out-Null
    }
}

if (-not $healthOk) { throw 'El endpoint real GET /api/health no respondió correctamente.' }
if (-not $databaseIsTemporary) { throw 'La base creada no quedó dentro del directorio temporal de la prueba.' }

$listener = $null
try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 8000)
    $listener.Start()
    $portReleased = $true
} catch {
    $portReleased = $false
} finally {
    if ($listener) { $listener.Stop() }
}
if (-not $portReleased) { throw 'El backend no liberó el puerto tras cerrar su proceso propio.' }

[pscustomobject]@{
    PackagedExecutableStarted = $true
    RealHealthEndpoint = 'HTTP 200; personal-chat-ai'
    DatabaseCreatedUnderTemp = $databaseIsTemporary
    ProcessStopped = $true
    PortReleased = $portReleased
    TemporaryDirectory = $testRoot
} | Format-List
