@echo off
setlocal
cd /d "%~dp0"
if not exist "requirements.txt" (echo ERROR: falta requirements.txt & exit /b 1)
if not exist ".venv\Scripts\python.exe" (
  where py >nul 2>&1
  if errorlevel 1 (
    python -m venv .venv
  ) else (
    py -3 -m venv .venv
  )
  if errorlevel 1 (echo ERROR: no se pudo crear .venv. Instala Python 3.11 o posterior. & exit /b 1)
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (echo ERROR: no se pudieron instalar las dependencias. & exit /b 1)
if not exist ".env" copy /-Y ".env.example" ".env" >nul
if not exist ".env" (echo ERROR: falta configuracion de ejemplo. & exit /b 1)
echo Instalacion completada. Configura LM Studio y ejecuta INICIAR_PERSONAL_CHAT_AI.bat.
exit /b 0
