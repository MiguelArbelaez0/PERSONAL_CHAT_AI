# Seguridad — PERSONAL_CHAT_AI v1.2.0

La versión estable v1.2.0 está publicada en [GitHub Releases](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0). Esta nota describe los controles y límites conocidos; no constituye una certificación de seguridad ni una evaluación externa.

## Trabajo v1.3.0 en la rama de seguridad (no publicado)

La rama `feature/v1.3.0-security-hardening` integra el bearer del backend con la extensión mediante un service worker MV3 y una página propia de conexión. Estos cambios aún no pertenecen a la Release estable v1.2.0. Para la instalación v1.2.0 sigue aplicando la advertencia de que la API no tiene autenticación; esta integración solo se debe probar con la rama correspondiente y datos sintéticos/locales.

- Solo `GET /api/health` y `POST /api/auth/pair` son públicos. El emparejamiento requiere un código generado expresamente en una consola local y un origen válido de extensión Chrome.
- Genera el código con `python -m backend.auth_admin pair`. Caduca en cinco minutos, se consume una vez y admite hasta cinco intentos incorrectos. No lo pegues en Stripchat, DevTools ni una URL.
- El canje devuelve un bearer aleatorio una vez. La extensión de la rama v1.3.0 lo conserva en `chrome.storage.local` restringido a `TRUSTED_CONTEXTS`; el service worker lo añade a las peticiones permitidas. El token no se devuelve a los content scripts ni se inserta en el DOM. El backend guarda el hash del bearer y del código, no sus valores originales.
- En Windows el estado se guarda bajo `%LOCALAPPDATA%/PERSONAL_CHAT_AI/auth_state.json`; en sistemas POSIX, bajo `$XDG_STATE_HOME/PERSONAL_CHAT_AI/auth_state.json` o `~/.local/state/PERSONAL_CHAT_AI/auth_state.json`. En POSIX se aplican permisos de usuario al directorio y al archivo. La protección de este archivo depende de la ACL/permisos del sistema operativo.
- Recupera el acceso ejecutando `python -m backend.auth_admin rotate`; requiere confirmación interactiva y revoca inmediatamente el token anterior. `python -m backend.auth_admin revoke` revoca credenciales sin emitir otra.
- Los demás endpoints, incluidos perfiles, cuentas, memoria, traducción, generación y rutas de documentación, requieren `Authorization: Bearer`. El Host debe ser el loopback y puerto configurado; las solicitudes de navegador deben proceder del origen emparejado.
- La página de conexión y las opciones de esa extensión están servidas localmente. El código temporal se introduce allí, no en Stripchat ni en DevTools. `chrome.storage.local.setAccessLevel` requiere Chrome 102 o posterior; la rama v1.3.0 requiere Chrome 109 o posterior por el uso de Offscreen Documents.
- Chrome puede terminar un service worker cuando una respuesta de `fetch()` tarda más de 30 segundos. En la rama v1.3.0, solo generación y reintento de traducción se ejecutan en un Web Worker dentro del documento offscreen; el service worker conserva la autorización, la allowlist y el saneamiento de respuestas. Las pruebas automatizadas no prueban el ciclo de vida real de Chrome: la generación larga sigue pendiente de verificación manual.

Estos controles de la rama v1.3.0 no se atribuyen a la Release estable v1.2.0 descrita a continuación.

## Límites de red y navegador de la Release v1.2.0

- FastAPI solo acepta `BACKEND_HOST=127.0.0.1`. Un valor externo o ambiguo se rechaza. El puerto predeterminado es 8000; el acceso remoto no está soportado.
- La extensión declara `storage` y `clipboardWrite`, acceso HTTP al loopback y scripts de contenido para Stripchat. No declara permisos para cookies, historial o credenciales.
- CORS permite HTTPS de `stripchat.com` y sus subdominios, además de orígenes `chrome-extension://` con formato de ID de Chrome. Los métodos y encabezados autorizados incluyen el JSON de la API y `Idempotency-Key` para recuperar de forma segura creaciones de cuenta.
- CORS no es autenticación. La API local no implementa autenticación y otros procesos locales pueden intentar acceder al puerto. Mantén el equipo y los procesos locales bajo control.
- La configuración de LM Studio valida HTTP local y no admite credenciales dentro de la URL.

## Datos y almacenamiento

- `.gitignore` excluye `.env` y variantes, `/data/`, SQLite, entornos virtuales, cachés y `knowledge/local/`. `.env.example` es plantilla pública sin credenciales.
- Las cuentas, perfiles y notas se guardan en SQLite local, sin cifrado de base de datos. Las notas se separan por UUID de cuenta y visitante.
- El historial visible se envía al backend y al LM Studio configurado para generar la respuesta; no se guarda automáticamente como memoria. No registres el contenido completo de conversaciones.
- La identidad se infiere de elementos visibles del DOM y requiere confirmación. No se leen cookies, tokens ni contraseñas.
- La migración v1.1 es explícita; el arranque normal no importa datos ni asigna memorias a cuentas nuevas.

## Verificaciones registradas para la publicación v1.2.0

La documentación de publicación registra pruebas automatizadas para host loopback, permisos del manifiesto, CORS, validación de entradas e aislamiento por cuenta, además de una ejecución de Gitleaks sobre la historia y los cambios de publicación. Son resultados de aquella auditoría, no comprobaciones ejecutadas al actualizar este documento. Las pruebas no sustituyen una evaluación externa ni la revisión de los objetos públicos históricos.

La historia anterior de v1.1 contiene referencias documentales a un nombre artístico usado en esa versión. El empaquetador local [tools/build_distribution.py](../tools/build_distribution.py) utiliza una lista explícita de documentación pública para su ZIP; eso no sanea el historial Git ni elimina forks, cachés o copias externas.

## Uso seguro

- No publiques `.env`, `data/`, `knowledge/local/`, respaldos, exportaciones de chat ni diagnósticos con identificadores.
- No cambies el host a una interfaz de red ni expongas LM Studio.
- Revisa las sugerencias antes de copiarlas. PERSONAL_CHAT_AI no envía mensajes automáticamente.
