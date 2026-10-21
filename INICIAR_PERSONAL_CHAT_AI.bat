@echo off
setlocal
cd /d "%~dp0"
echo === PERSONAL_CHAT_AI: inicio ===
if exist ".venv\Scripts\python.exe" (
  set "PYTHON_EXE=.venv\Scripts\python.exe"
) else (
  where py >nul 2>&1
  if errorlevel 1 (
    where python >nul 2>&1
    if errorlevel 1 (
      echo ERROR: No se encontro Python. Instala Python 3.11+ sin modificar instalaciones existentes.
      pause
      exit /b 1
    ) else (
      set "PYTHON_EXE=python"
    )
  ) else (
    set "PYTHON_EXE=py -3"
  )
)
if not exist "backend\main.py" (
  echo ERROR: Falta backend\main.py.
  pause
  exit /b 1
)
if exist ".env" ( echo Configuracion local .env encontrada. ) else ( echo AVISO: No existe .env; se usaran valores predeterminados. )
%PYTHON_EXE% -c "import fastapi,httpx,uvicorn; print('Dependencias: correctas')"
if errorlevel 1 (
  echo ERROR: Faltan dependencias. Ejecuta %PYTHON_EXE% -m pip install -r requirements.txt
  pause
  exit /b 1
)
curl.exe --silent --fail http://127.0.0.1:8765/api/health >nul 2>&1
if not errorlevel 1 (
  echo Backend ya responde en 127.0.0.1:8765. No se iniciara otra instancia.
  start "" http://127.0.0.1:8765/api/diagnostics/lm-studio
  pause
  exit /b 0
)
powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort 8765 -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo ERROR: El puerto 8765 esta ocupado por otro servicio. No se detuvo ningun proceso.
  pause
  exit /b 1
)
curl.exe --silent --fail http://127.0.0.1:1234/v1/models >nul 2>&1
if errorlevel 1 echo AVISO: LM Studio no responde. Inicia su servidor local antes de generar sugerencias.
echo Iniciando backend en esta ventana. Detenlo con Ctrl+C.
%PYTHON_EXE% -m backend
if errorlevel 1 echo ERROR: El backend termino con un error. Revisa Python y requirements.txt.
pause
