# Instalación

Esta guía describe la instalación local en Windows de la versión estable v1.2.0, publicada en [GitHub Releases](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0). Descarga el código fuente de esa Release o clona la etiqueta `v1.2.0`; instálalo en una carpeta propia y conserva los datos de instalaciones anteriores. v1.1.0 es la versión estable anterior.

En una instalación nueva, usa una carpeta propia y una base `PCAI_DATABASE_PATH` separada. El inicio normal no migra datos de v1.1. La importación se realiza únicamente con la herramienta explícita de migración y debe prepararse sobre una copia de seguridad.

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

3. Solo si no existe `.env`, copia `.env.example` a `.env`. Conserva siempre configuraciones y bases existentes. El puerto predeterminado es `BACKEND_PORT=8000`; si tu `.env` ya define otro puerto, el backend y el lanzador respetan ese valor. Mantén `BACKEND_HOST=127.0.0.1`, `LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1` y `LM_STUDIO_MODEL=qwen/qwen3-4b-2507`.
4. En LM Studio, carga `qwen/qwen3-4b-2507` e inicia el servidor local compatible con Chat Completions en `127.0.0.1:1234`. No expongas el servidor a la red.
5. Inicia el backend con `INICIAR_PERSONAL_CHAT_AI.bat` o:

   ```powershell
   .\.venv\Scripts\python.exe -m backend
   ```

6. Comprueba el estado local en `http://127.0.0.1:8000/api/health`, o el puerto configurado en `.env`.

La extensión migra la URL predeterminada antigua de `8765` a `8000` sin borrar otras preferencias. Para un puerto local personalizado, configura el mismo valor en el backend y en **Opciones avanzadas → URL del backend** de la extensión. Consulta [conexión local](LOCAL_BACKEND_CONNECTION.md).

No compartas `.env`, la carpeta `data/` ni la carpeta ignorada `knowledge/local/`.

## Actualización desde v1.1.0

v1.2.0 usa una base de datos nueva y no importa los datos de v1.1 al arrancar. Para probarla sin poner en riesgo la instalación estable:

1. Detén el backend v1.1 y conserva esa carpeta y sus bases intactas. Haz una copia de seguridad de `data/` y guarda `.env` en una ubicación privada.
2. Instala v1.2.0 en una carpeta separada, con un entorno `.venv` y `.env` propios. Usa `PCAI_DATABASE_PATH` para apuntar a una base nueva; no configures como destino ninguna base v1.1.
3. Inicia el backend nuevo y comprueba `/api/health`. La cuenta y el perfil iniciales se crean mediante el onboarding; sin él la generación permanece bloqueada.
4. La importación es opcional. Si decides conservar datos v1.1 en el espacio heredado, usa copias de las fuentes y una tercera ruta de destino vacía, distinta de ambas. Ejecuta la herramienta desde la carpeta v1.2:

   ```powershell
   .\.venv\Scripts\python.exe -m backend.migrations `
     --source-memory "C:\ruta\a\copia\personal_chat_ai.sqlite3" `
     --source-profiles "C:\ruta\a\copia\personalities.sqlite3" `
     --target "C:\ruta\v1.2\data\personal_chat_ai_v2.sqlite3"
   ```

   La importación no asigna perfiles ni recuerdos heredados a una cuenta nueva ni los activa. Consulta [almacenamiento y migración](ACCOUNT_PROFILE_STORAGE_V1_2.md) antes de ejecutarla.
5. Conserva la instalación v1.1 y sus fuentes hasta verificar la nueva configuración. No borres ni reemplaces bases para resolver un error de migración.

## Extensión de Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador**.
3. Selecciona **Cargar extensión sin empaquetar** y elige la carpeta `extension`.
4. Abre Stripchat, inicia sesión normalmente y comprueba el estado de conexión del panel.

La automatización se limita a preparar sugerencias. Revisa, edita y envía cada mensaje manualmente.

## Prueba aislada de la rama candidata v1.3.0 (no publicada)

La instalación descrita arriba es la Release estable v1.2.0. Para probar `feature/v1.3.0-security-hardening`, usa una carpeta de trabajo, una base SQLite, estado de autenticación y perfil de Chrome separados; no reutilices `.env`, `data/`, credenciales ni preferencias de la instalación estable. Arranca el backend y carga la extensión desde la misma rama. La extensión candidata requiere emparejamiento local y no es compatible con el backend v1.2.0 sin autenticación. Sigue la [guía de conexión autenticada](CHROME_AUTH_V1_3.md). La usuaria confirmó regeneración Manual y Automático, generación real, persistencia al recargar Stripchat y persistencia de autenticación y generación después de reiniciar Chrome. Aún debe validarse la recuperación manual de credenciales y una generación real de más de 30 segundos durante el reinicio del service worker.

## Primera configuración v1.2.0

Después de cargar la extensión, abre Stripchat e inicia sesión. El onboarding presenta cualquier nombre detectado para confirmación; si no hay una señal clara, puedes escribirlo. Elige una cuenta local existente de forma explícita o confirma la creación de una nueva. Completa los ocho pasos; hasta que el backend confirme la configuración, la generación permanece bloqueada. Consulta la [guía de usuario](USER_GUIDE.md) y las notas de [cuentas y perfiles](ACCOUNT_PROFILE_STORAGE_V1_2.md).

## Verificación de desarrollo

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests
node --test tests/*.cjs
```

Las limitaciones operativas están en [KNOWN_ISSUES_V1_2.md](KNOWN_ISSUES_V1_2.md). Las pruebas automatizadas no sustituyen la comprobación manual en Chrome y Stripchat.

## Instrucciones históricas del paquete v1.1.0

> Esta sección describe el paquete anterior v1.1.0; no son los pasos de instalación de la Release actual. En caso de diferencia, sigue las instrucciones de v1.2.0 anteriores.

Extrae el ZIP en una carpeta nueva; no reemplaces una instalación anterior ni sus datos. La carpeta raíz es PERSONAL_CHAT_AI_v1.1.0. Ejecuta INSTALAR_PERSONAL_CHAT_AI.bat: crea .venv, instala requirements.txt y copia .env.example solo si .env no existe. Necesita Python 3.11+ disponible mediante py o python y acceso al índice de paquetes. No instala LM Studio ni descarga modelos. Si Python falta, instala Python desde su proveedor y habilita el lanzador o PATH; vuelve a ejecutar el instalador.

Configura el modelo Qwen indicado en esta guía. Ejecuta INICIAR_PERSONAL_CHAT_AI.bat; el backend queda en esa ventana y se cierra con Ctrl+C. El lanzador detecta el puerto efectivo del backend desde la configuración existente y evita iniciar una segunda instancia. Para actualizar, conserva una copia verificada de .env, data y knowledge/local; no reemplaces bases ni perfiles por los del paquete (no se incluye ninguno). Usa primero la carpeta nueva sin datos personales y comprueba las funciones.

La Release v1.1.0 se publicó antes de v1.2.0. Las afirmaciones sobre verificaciones pendientes y el paquete de revisión reflejan el estado de aquel artefacto y no describen la publicación actual.
