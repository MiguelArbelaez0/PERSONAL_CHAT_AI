param(
    [Parameter(Mandatory = $true)]
    [string] $PyInstallerPython
)

$ErrorActionPreference = 'Stop'
$pythonPath = (Resolve-Path -LiteralPath $PyInstallerPython).Path
$moduleRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $moduleRoot '..')).Path
$distPath = Join-Path $moduleRoot 'backend-dist'
$specPath = Join-Path $PSScriptRoot 'backend.spec'
$workPath = Join-Path $env:TEMP ("pcai-v140-pyinstaller-work-" + [guid]::NewGuid().ToString('N'))

if (-not (Test-Path -LiteralPath $specPath -PathType Leaf)) {
    throw 'No se encontró el archivo de configuración de PyInstaller.'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'backend\__main__.py') -PathType Leaf)) {
    throw 'No se encontró el punto de entrada de FastAPI.'
}

New-Item -ItemType Directory -Force -Path $distPath, $workPath | Out-Null
$null = & $pythonPath -c "import fastapi, httpx, uvicorn"
if ($LASTEXITCODE -ne 0) {
    throw 'El entorno temporal debe tener instaladas las dependencias indicadas en requirements.txt.'
}
Push-Location $projectRoot
try {
    & $pythonPath -m PyInstaller --noconfirm --clean --distpath $distPath --workpath $workPath $specPath
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller terminó con código $LASTEXITCODE."
    }
    $backendExe = Join-Path $distPath 'personal-chat-ai-backend\personal-chat-ai-backend.exe'
    if (-not (Test-Path -LiteralPath $backendExe -PathType Leaf)) {
        throw 'PyInstaller no generó el ejecutable esperado.'
    }
    Write-Output "Backend empaquetado en: $($backendExe | Split-Path -Parent)"
} finally {
    Pop-Location
}
