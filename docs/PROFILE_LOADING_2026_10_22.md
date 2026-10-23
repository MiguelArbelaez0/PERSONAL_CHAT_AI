# Investigación de carga de perfiles — 22 de octubre de 2026

Estado: corrección de inicialización comprobada en pruebas; verificación de Chrome pendiente. Rama develop. Sin commit ni push.

## Evidencia y causa

La API local GET http://127.0.0.1:8765/api/profiles respondió 200 y devolvió un perfil, ChubbyKriz, activo con id default. Se comparó el contenido completo devuelto con el JSON original de SQLite: igualdad exacta. No se publican sus campos privados.

El proceso del puerto 8765 fue PID 19492, con lanzamiento mediante el Python de .venv del proyecto y argumento -m backend; también se observó el lanzador PID 9596. La ruta de trabajo interna del proceso no se inspeccionó directamente. INICIAR_PERSONAL_CHAT_AI.bat establece el directorio del proyecto antes de ejecutar el módulo.

Almacenamiento encontrado:

- Perfiles: <proyecto>/data/personalities.sqlite3.
- Memoria: mismo directorio, personal_chat_ai.sqlite3.

Ambas bases pasan PRAGMA quick_check. La búsqueda dentro del proyecto, excluyendo dependencias y Git, no encontró otras bases ni archivos JSON de perfiles. Solo existe un perfil en el almacén encontrado; no se ha demostrado dónde estaban los perfiles personalizados mencionados.

Settings calcula ROOT desde __file__ y resuelve DATABASE_PATH relativo contra ese ROOT. main crea el almacén de perfiles junto a la base de memoria. No se encontró un cambio reciente de estas rutas; profiles.py/config.py mantienen la implementación de introducción de perfiles. No hay evidencia de una regresión de rutas, corrupción, permisos o serialización en el backend observado.

Defecto reproducido: loadPrefs envolvía preferencias, descubrimiento del DOM, detector y carga de perfiles en un único try con catch vacío. Cualquier excepción anterior a loadProfiles impedía incluso solicitar /api/profiles y dejaba vacía la sección. Otra carencia comprobada: abrir el panel después de una carga fallida no reintentaba los perfiles aunque health respondiese correctamente. Sin consola/Network de la sesión afectada no puede atribuirse con certeza el incidente concreto a una excepción específica ni descartarse una URL distinta guardada en Chrome.

## Corrección

extension/content.js carga perfiles en finally, independientemente del detector, presenta errores de inicialización y vuelve a intentar perfiles pendientes al comprobar la conexión al abrir el panel. Una carga correcta evita recargas automáticas posteriores que pisarían una edición del formulario. No se cambian almacenamiento, perfiles originales, selección persistida, memoria, modelo ni envío de mensajes.

## Protección de datos

Se crearon copias SQLite coherentes en data/backups/profile_audit_20261022_202739 antes de ejecutar las suites. Se verificó quick_check y equivalencia lógica de ambas copias. data está excluido de Git.

Hashes SHA256 de originales antes y después de las pruebas, idénticos:

- personalities.sqlite3: [hash privado verificado localmente; no publicado]
- personal_chat_ai.sqlite3: [hash privado verificado localmente; no publicado]

No se restauraron, reinicializaron ni modificaron datos originales. No se crearon perfiles reales nuevos.

## Validación ejecutada

- .\.venv\Scripts\python.exe -m pytest -q: 268 aprobadas; 1110 advertencias de deprecación de FastAPI/Python 3.15; cero fallos.
- node --test tests/*.cjs: 71 aprobadas; cero fallos.
- node --check extension/content.js: correcto.
- git diff --check: correcto.
- Dos regresiones de inicialización fallaron antes de corregir content.js y pasan después.
- Regresiones nuevas: fallos de preferencias/detector no bloquean perfiles; reconexión sin escritura; perfil personalizado sintético conserva todos sus campos y selección al recrear el panel; ruta independiente del directorio actual y reapertura del almacén conservan selección/datos.
- Las suites existentes cubren CRUD, selección, memoria anterior, modos, copia, traducción y reintentos.

No se reinició el proceso real ni se manejó Chrome. La reapertura del almacén y recarga de interfaz se comprobaron con datos sintéticos; no equivalen a una prueba manual de Chrome ni a recuperar perfiles personalizados ausentes.

## Validación manual pendiente

1. Mantener el backend iniciado y comprobar GET http://127.0.0.1:8765/api/profiles: active_id default y ChubbyKriz. No pulsar Restaurar, Nuevo ni Guardar para recuperar datos.
2. En chrome://extensions recargar PERSONAL_CHAT_AI y después recargar la página de Stripchat para reemplazar el content script anterior.
3. Abrir el panel y comprobar URL http://127.0.0.1:8765, selector ChubbyKriz y campos originales. Actualizar solo realiza GET.
4. Si el backend aún no estaba listo, iniciarlo y volver a abrir el panel: los perfiles deben cargarse sin recrearlos.
5. Reiniciar el backend con el lanzador habitual y recargar la página; comprobar selección y campos, sin alterar memoria.
6. Si continúa vacío, registrar el mensaje visible del apartado de perfiles, el diagnóstico y la petición /api/profiles en Network, sin compartir conversaciones ni contenido privado. Si faltan perfiles personalizados, localizar su almacenamiento anterior antes de cualquier restauración/importación.
