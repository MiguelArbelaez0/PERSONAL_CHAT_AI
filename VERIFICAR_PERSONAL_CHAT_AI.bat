@echo off
setlocal
cd /d "%~dp0"
echo === Verificacion PERSONAL_CHAT_AI ===
if exist "README.md" (echo CORRECTO: README.md) else (echo ERROR: falta README.md)
if exist "backend\main.py" (echo CORRECTO: backend principal) else (echo ERROR: falta backend\main.py)
if exist "extension\manifest.json" (echo CORRECTO: extension manifest) else (echo ERROR: falta manifest)
if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
  set "PY_ARGS="
  echo CORRECTO: entorno virtual encontrado
) else (
  where py >nul 2>&1
  if errorlevel 1 (
    where python >nul 2>&1
    if errorlevel 1 (echo ERROR: Python no encontrado & goto :done)
    set "PY=python"
    set "PY_ARGS="
  ) else (
    set "PY=py"
    set "PY_ARGS=-3"
  )
  echo ADVERTENCIA: usando Python del sistema; no se encontro .venv
)
"%PY%" %PY_ARGS% --version
"%PY%" %PY_ARGS% -c "import fastapi,httpx,uvicorn; print('CORRECTO: importaciones backend')"
if errorlevel 1 echo ERROR: faltan dependencias; instala requirements.txt
for /f %%P in ('"%PY%" %PY_ARGS% -c "from backend.config import settings; print(settings.port)"') do set "BACKEND_PORT=%%P"
if not defined BACKEND_PORT (echo ERROR: no se pudo leer BACKEND_PORT desde la configuracion local & goto :done)
curl.exe --silent --show-error --fail http://127.0.0.1:%BACKEND_PORT%/api/health
if errorlevel 1 (echo ADVERTENCIA: backend no responde; prueba de salud no ejecutada) else (echo CORRECTO: backend salud)
curl.exe --silent --show-error --fail http://127.0.0.1:1234/v1/models
if errorlevel 1 (echo ADVERTENCIA: LM Studio no responde) else (echo CORRECTO: API LM Studio responde)
if exist "tests\test_app.py" (
  "%PY%" %PY_ARGS% -m pytest -q
  if errorlevel 1 echo ERROR: pruebas automatizadas fallaron o pytest no esta instalado
) else (echo PRUEBA NO EJECUTADA: no existe carpeta de pruebas)
:done
echo Nota: este script no valida una sesion real de Chrome/Stripchat.
pause
