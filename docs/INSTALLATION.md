# Instalación

Esta guía describe la instalación local en Windows. La publicación oficial está pendiente de resolver los bloqueos de [SECURITY.md](SECURITY.md) y [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Requisitos

- Windows 10/11.
- Python 3.11 o posterior.
- Google Chrome.
- Node.js solo para ejecutar las pruebas JavaScript.
- LM Studio y un modelo compatible con Chat Completions, descargados y configurados por el usuario.

## Backend

1. Abre PowerShell en la carpeta del proyecto.
2. Crea el entorno e instala las versiones fijadas:

   ```powershell
   py -3 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

3. Copia `.env.example` a `.env` y ajusta la URL, el identificador del modelo y otros valores según la instalación local. Mantén `BACKEND_HOST=127.0.0.1`.
4. En LM Studio, inicia el servidor local compatible con Chat Completions.
5. Inicia el backend con `INICIAR_PERSONAL_CHAT_AI.bat` o:

   ```powershell
   .\.venv\Scripts\python.exe -m backend
   ```

6. Comprueba el estado local en `http://127.0.0.1:8765/api/health`.

No compartas `.env`, la carpeta `data/` ni la carpeta ignorada `knowledge/local/`.

## Extensión de Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Selecciona **Cargar extensión sin empaquetar** y elige la carpeta `extension`.
4. Abre Stripchat, inicia sesión normalmente y comprueba el estado de conexión del panel.

La automatización se limita a preparar sugerencias. Revisa, edita y envía cada mensaje manualmente.

## Verificación de desarrollo

```powershell
.\.venv\Scripts\python.exe -m pytest tests
node --test tests/*.cjs
```

Los resultados de esta auditoría y los límites del entorno están en [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Las pruebas automatizadas no sustituyen la comprobación manual en Chrome y Stripchat.
