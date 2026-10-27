# Conexión autenticada de Chrome — rama v1.3.0

> Esta guía describe cambios no publicados de `feature/v1.3.0-security-hardening`. La Release estable v1.2.0 todavía usa el contrato anterior sin bearer. No reemplaces tu instalación habitual hasta completar las pruebas de esta rama.

## Requisitos

- Chrome 109 o posterior (la rama usa Offscreen Documents para mantener las solicitudes largas fuera del ciclo de vida de `fetch()` del service worker).
- Backend de esta misma rama en `127.0.0.1:8000`.
- La extensión cargada desde `extension/` de esta rama.
- Mantener privados el código temporal y el token que recibe la extensión.

## Vincular la extensión

1. Inicia el backend de esta rama y comprueba que `http://127.0.0.1:8000/api/health` responde.
2. En PowerShell, desde la carpeta del proyecto, ejecuta `python -m backend.auth_admin pair`.
3. Copia el código temporal que muestra la consola. Dura cinco minutos y se consume una sola vez.
4. Abre PERSONAL_CHAT_AI desde la barra de extensiones de Chrome, pega el código en **Código temporal de vinculación** y pulsa **Vincular extensión**.
5. Comprueba que la página indique **Backend conectado · extensión vinculada**.

El código solo se escribe en la página local de la extensión. No lo pegues en Stripchat, la consola de DevTools, una URL, un archivo compartido ni una conversación.

## Si se revoca el acceso

El estado **token rechazado** significa que el backend ya no acepta la credencial guardada. En la consola del proyecto ejecuta `python -m backend.auth_admin rotate`, confirma escribiendo `ROTAR`, y repite el emparejamiento con el nuevo código. La rotación revoca el token anterior. `python -m backend.auth_admin revoke` revoca el acceso sin emitir credenciales nuevas.

La página de conexión permite configurar una URL alternativa solo si sigue siendo HTTP en loopback y Chrome declara el permiso de host correspondiente. No se admite una dirección LAN o pública.

## Solución de problemas

| Estado/error | Qué comprobar |
|---|---|
| Backend no conectado | Confirma que el backend de esta rama escucha en `127.0.0.1:8000` y que la página de conexión utiliza esa URL. No cambies el host a una dirección de red. |
| Código de vinculación inválido o expirado | Genera otro con `python -m backend.auth_admin pair` y úsalo en menos de cinco minutos. Cada código se consume una sola vez. |
| Token rechazado / HTTP 401 | Usa el comando local `rotate`, confirma `ROTAR` y vincula de nuevo. No copies ni compartas el bearer. |
| HTTP 403 | Comprueba que se usa la extensión cargada desde esta rama y el perfil de Chrome emparejado. No relajes las validaciones de Host u Origin. |
| `missing_context_analysis` | El análisis no llegó como JSON completo que el parser reconociera tras el reintento. El parser admite el análisis en raíz o dentro de `analysis`; la salida vacía, truncada o con otro formato se rechaza. Reintenta y consulta los metadatos redactados de `analysis` (`http_status`, `format`, `empty`, `truncated`, `extracted` y `rejection`), nunca el texto de la conversación. El resultado de una etapa no se debe atribuir a la otra sin esos metadatos. |
| `repetitive_question` / generación HTTP 502 | El borrador o su revisión repitió una pregunta/idea tras el reintento. La validación no se desactiva; conserva la última sugerencia válida y permite un nuevo intento manual. |
| LM Studio HTTP 503/504 o timeout | Confirma que LM Studio sirve Chat Completions en `http://127.0.0.1:1234/v1`, que el modelo configurado está cargado y que el tiempo de respuesta cabe en `LM_STUDIO_TIMEOUT`. La simulación de 30 segundos no demuestra el ciclo de vida en Chrome real. |

## Privacidad y limitaciones

- El service worker es el único componente que lee el bearer, valida la ruta y adjunta la autorización. Para generación y traducción, pasa la solicitud a un documento offscreen que crea un Web Worker dedicado; ese worker ejecuta únicamente `POST /api/suggestions` o `POST /api/translation/retry` en loopback. El bearer viaja solo entre contextos internos de la extensión y nunca se devuelve al content script ni se inserta en el DOM. El almacenamiento local se restringe a contextos de confianza de la extensión.
- El backend no registra el código ni el token. El archivo de estado de autenticación queda bajo el directorio de estado local del usuario y depende de los permisos/ACL del sistema operativo.
- Las pruebas automatizadas simulan el navegador. No confirman el emparejamiento real de origen ni generaciones largas contra LM Studio en Chrome. La ruta larga evita el `fetch()` del service worker; aún se debe validar manualmente una generación superior a 30 segundos en Chrome real.
- Esta fase no envía mensajes automáticamente a Stripchat.

## Estado de validación observado

Históricamente, la usuaria reportó que la extensión se emparejó con el backend temporal, la vinculación persistió tras reiniciar Chrome, apareció el panel en Stripchat, se detectó la identidad y el onboarding llegó al paso 2 de 8. En esa sesión, crear una cuenta nueva mostró el error de referencias no permitido; se corrigió después. El 27 de octubre de 2026, la usuaria confirmó con los últimos cambios regeneración consecutiva en Manual y Automático, generación real con LM Studio, persistencia de cuenta/perfil/memoria al recargar Stripchat y persistencia de autenticación y generación tras reiniciar Chrome.

En la prueba automatizada local del 26 de octubre de 2026 pasaron 353 pruebas Python y 155 JavaScript. La prueba de más de 30 segundos es una simulación del ciclo de vida en una VM Node, no Chrome. La prueba real con Qwen3 4B usó únicamente datos sintéticos: cuatro solicitudes aisladas de análisis devolvieron JSON válido; de dos flujos completos, uno terminó con generación y traducción, y otro agotó un reintento por `repetitive_question`. `missing_context_analysis`, observado en dos solicitudes previas, no se reprodujo. La salida original no se conservó con metadatos suficientes para distinguir retrospectivamente respuesta vacía/truncada de un formato no parseable.

Antes de proponer una RC faltan la revocación y recuperación manual de credenciales y una generación real superior a 30 segundos durante el reinicio del service worker. No usar conversaciones privadas para estas pruebas.
