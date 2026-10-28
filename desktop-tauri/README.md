# Aplicación de escritorio — PERSONAL_CHAT_AI v1.4

Este módulo integra el backend FastAPI existente como un proceso auxiliar local de la aplicación Tauri. No duplica la lógica de cuentas, perfiles, memoria, generación ni traducción.

## Comportamiento del proceso

- La aplicación inicia el backend empaquetado al abrirse y espera una respuesta válida de `GET /api/health` en `127.0.0.1:8000`.
- El supervisor conserva el objeto del proceso hijo; nunca busca ni finaliza procesos ajenos. Si deja de responder, la interfaz ofrece **Solucionar** para reintentarlo.
- Al cerrar la ventana se detiene y espera únicamente al proceso que inició la aplicación.
- Se comprueba el puerto antes del inicio. Si está ocupado, la aplicación no adopta el servicio desconocido.
- En paquetes Release, el empaquetador genera un inventario SHA-256 del ejecutable FastAPI y sus archivos auxiliares. El hash del inventario queda fijado en la aplicación y en el host; ambos comprueban el paquete antes de iniciarlo o usarlo. La distribución seguirá necesitando firma de código para autenticar al editor y proteger frente a sustitución de la propia aplicación.
- El backend se distribuye en una carpeta PyInstaller (no como ejecutable de un solo archivo), para que Tauri supervise y cierre el proceso que sirve FastAPI directamente. Recibe un entorno limpio, sin `PYTHONPATH`, `VIRTUAL_ENV`, variables de autenticación heredadas ni configuración privada del desarrollador.
- Los detalles de inicio se guardan en `logs/backend.log`; los registros de la aplicación son códigos técnicos y no incluyen conversaciones, alias ni credenciales. Uvicorn mantiene desactivado el registro de solicitudes.

## Datos y aislamiento

En una compilación de desarrollo, la app y el host local comparten datos temporales bajo `%TEMP%\PERSONAL_CHAT_AI\desktop-integration-v140`. En una instalación por usuaria, Tauri coloca los binarios en `%LOCALAPPDATA%\PERSONAL_CHAT_AI`; para proteger datos al desinstalar, perfiles, memorias, autenticación, bases y conocimiento se guardan aparte en `%LOCALAPPDATA%\PERSONAL_CHAT_AI_DATA\PERSONAL_CHAT_AI`.

La desinstalación conserva deliberadamente ese directorio de datos. La eliminación de perfiles, memoria o bases no forma parte del desinstalador y requerirá una acción separada, explícita y confirmada en una fase posterior.

Las rutas del proceso se fijan explícitamente antes de iniciarlo:

- `PCAI_DATABASE_PATH`: `data/personal_chat_ai_v2.sqlite3`.
- `DATABASE_PATH` y `PERSONALITIES_DATABASE_PATH`: archivos separados bajo `legacy/`; no se ejecuta ninguna migración.
- `LOCALAPPDATA`: estado de autenticación local, dentro del mismo espacio de la aplicación.
- `KNOWLEDGE_PATH`: carpeta `knowledge/` del espacio de la aplicación.
- Registros: `logs/backend.log`.

Las pruebas y el prototipo de desarrollo no leen ni migran las bases del proyecto. La selección/importación de datos previos y la migración de una instalación v1.3.0 requieren una fase posterior y no se realizan aquí.

## Crear el ejecutable auxiliar de FastAPI

PyInstaller y las dependencias Python del backend se instalan en un entorno temporal de empaquetado. No se instalan globalmente ni se agregan a las dependencias de producción:

```powershell
$pyinstallerEnv = Join-Path $env:TEMP 'pcai-pyinstaller-env'
$projectPython = (Get-Command python).Source
& $projectPython -m venv $pyinstallerEnv
$pyinstallerPython = Join-Path $pyinstallerEnv 'Scripts\python.exe'
& $pyinstallerPython -m pip install -r ..\..\requirements.txt 'pyinstaller==6.22.3'
.\packaging\build_backend.ps1 -PyInstallerPython $pyinstallerPython
```

El resultado local es `backend-dist/personal-chat-ai-backend/`, excluido de Git. El ejecutable es `personal-chat-ai-backend.exe` dentro de esa carpeta. El archivo [backend.spec](packaging/backend.spec) incorpora los módulos de backend y Uvicorn requeridos, y los certificados de `certifi`. No incluye `.env`, bases de datos, memorias, archivos de conocimiento, perfiles ni datos de prueba.

Al congelar la aplicación, el backend resuelve su raíz dentro de la extracción temporal de PyInstaller. El supervisor cambia su directorio de trabajo a otra carpeta temporal y proporciona todas las rutas persistentes mediante variables de entorno explícitas. Así, el backend no puede usar rutas relativas del checkout ni leer el `.env` del desarrollador.

## Ejecutar y validar en desarrollo

1. Crear el ejecutable auxiliar con el comando anterior.
2. Desde este directorio ejecutar `cargo run`.
3. La tarjeta principal confirma únicamente que FastAPI responde; no significa que el modelo LLM o Chrome estén listos.
4. `packaging/smoke_backend.ps1` valida el ejecutable y sus rutas temporales.
5. Para probar la supervisión del proceso hijo con el ejecutable real, ejecutar `cargo test tests::packaged_backend_starts_once_uses_temporary_data_and_stops -- --ignored --exact` desde el módulo.
6. Para revisar las pruebas unitarias de Rust, ejecutar `cargo test`.

## Configuración de IA — Fase 6.1

- La aplicación consulta el catálogo tipado local de LM Studio (`/api/v1/models`, con compatibilidad de lectura para `/api/v0/models`) y permite seleccionar únicamente entradas cuyo tipo explícito sea `llm`. Los modelos de embeddings, decisión, visión y tipo desconocido no se ofrecen para generar respuestas.
- La selección se guarda en `config/llm-settings.json`, fuera de SQLite. En Release queda bajo `%LOCALAPPDATA%\PERSONAL_CHAT_AI_DATA\PERSONAL_CHAT_AI`; el backend recibe el ID seleccionado al iniciarse. Si cambia el modelo mientras el backend propio está ejecutándose, la aplicación reinicia solo ese proceso.
- **Probar generación** es una acción manual y utiliza el mensaje sintético «Responde únicamente con la palabra OK». La validación exige contenido de asistente no vacío; no guarda ni registra el texto devuelto. Solo conserva el resultado y la duración de la prueba en milisegundos. La carga confirmada también registra su duración; ambas se muestran como tiempos en la interfaz.
- El modelo debe estar instalado y cargado en LM Studio. Esta fase no instala LM Studio, descarga modelos, carga modelos ni admite una configuración de autenticación de LM Studio. Si LM Studio solicita autorización, la aplicación informa que aún no es compatible.
- «Backend preparado», «LM Studio conectado», «modelo seleccionado», «prueba de generación» y «Chrome vinculado» son estados separados. No se declara el asistente listo solo por la salud de FastAPI.

## Asistente de configuración de IA — Fase 6.2

La configuración gráfica guía a la usuaria por seis pasos: bienvenida, detección del servidor local, catálogo de modelos conversacionales, selección, prueba sintética y resumen. La detección se hace al abrir la aplicación y al solicitar una actualización; no genera solicitudes de prueba en segundo plano. El modelo se prueba únicamente cuando la usuaria pulsa **Probar generación**.

El catálogo solo muestra modelos que LM Studio marca explícitamente como `llm`; los embeddings y tipos desconocidos no se pueden elegir para conversación. Si no se detecta un servidor, el mensaje indica que no se respondió en el puerto configurado, sin afirmar que LM Studio esté instalado o ausente. El enlace de descarga dirige al sitio oficial de LM Studio.

La sección avanzada permite cambiar solo el número de puerto. La aplicación siempre construye la dirección como `http://127.0.0.1:<puerto>/v1`; no acepta hostnames externos, protocolo HTTPS ni direcciones públicas. El valor se guarda en `llm-settings.json` mediante escritura atómica, se valida y se aplica al backend propio reiniciándolo cuando es necesario. El puerto predeterminado sigue siendo 1234 y los archivos de Fase 6.1 que no tienen el campo nuevo se leen con ese valor.

Si la configuración local es ilegible, el asistente no la sustituye automáticamente. La usuaria puede cancelar sin cambios o confirmar una recuperación; antes de crear la configuración nueva, la aplicación guarda una copia exacta del archivo anterior en la carpeta de configuración. Las configuraciones de una versión futura se preservan y no se ofrecen para reemplazo automático.

La aplicación conserva el último resultado de prueba asociado al modelo seleccionado. Un cambio de modelo o de puerto invalida ese resultado; un reintento fallido elimina el estado de verificación anterior. El resumen presenta por separado FastAPI, LM Studio, modelo, generación y conexión Chrome. Finalizar el asistente no vincula Chrome ni envía mensajes.

Esta fase no instala LM Studio, no descarga ni carga modelos y no comprueba si el programa está instalado en Windows. Si no hay servidor local disponible, la usuaria debe instalar/abrir LM Studio y activar su servidor desde la interfaz de LM Studio. La versión actual de LM Studio no se ha probado en vivo durante esta fase; las pruebas automatizadas usan respuestas sintéticas.

## Administración de modelos — Fase 6.3 (alcance seguro)

La lista local usa el tipo explícito `llm` de `GET /api/v1/models` y muestra únicamente los metadatos que esa respuesta proporciona (nombre, identificador, publisher/origen, arquitectura, cantidad de parámetros, tamaño, cuantización y contexto). No infiere licencia, requisitos de RAM/VRAM ni compatibilidad de generación a partir del tamaño. Si LM Studio no ofrece un campo, se omite en lugar de inventarlo.

Para un modelo instalado pero no cargado, **Cargar y seleccionar** solicita consentimiento y utiliza `POST /api/v1/models/load` con un contexto de 8.192 tokens, alineado con el presupuesto de FastAPI y acotado frente a modelos con contextos máximos mucho mayores. La app solo guarda la selección después de que LM Studio confirme `type=llm`, `status=loaded` y luego el catálogo vuelva a mostrar ese mismo modelo cargado. La carga tiene un timeout recuperable; el error no cambia la selección guardada. Los tiempos se miden con reloj monotónico desde el inicio de la operación hasta su respuesta/verificación, sin incluir el texto generado en la configuración. Los timeouts no cancelan de forma remota una carga o generación ya aceptada por LM Studio; tras un timeout se debe comprobar el estado en LM Studio antes de reintentar. La app no descarga modelos ni descarga modelos de memoria automáticamente. En una versión antigua que no ofrezca el endpoint v1, la carga debe hacerse desde la interfaz de LM Studio.

La API REST oficial de LM Studio documenta la descarga por identificador de catálogo o URL Hugging Face, y un endpoint para consultar el progreso de un `job_id`. No documenta una API REST de búsqueda de catálogo que permita a esta aplicación obtener de forma fiable y previa licencia, tamaño, fuente y requisitos de hardware, ni un endpoint REST para cancelar/eliminar una descarga. Por eso la app no inicia descargas: lleva a la usuaria al catálogo y a la pestaña Discover de LM Studio para revisar la ficha/licencia y administrar la descarga allí. No se simula progreso ni cancelación. Fuentes oficiales consultadas: [lista de modelos](https://lmstudio.ai/docs/developer/rest/list), [carga](https://lmstudio.ai/docs/developer/rest/load), [descarga](https://lmstudio.ai/docs/developer/rest/download), [estado de descarga](https://lmstudio.ai/docs/developer/rest/download-status), [API REST](https://lmstudio.ai/docs/developer/rest).

La autenticación opcional de la API de LM Studio todavía no se configura desde PERSONAL_CHAT_AI. Si el servidor exige un token, la aplicación informa que esa configuración no es compatible en esta versión; no pide ni persiste tokens en texto plano.

La configuración de Tauri prepara un instalador NSIS por usuaria e incluye hooks para registrar y retirar el host. El ID de Chrome Web Store confirmado por la propietaria es `faclobdnhaephlneakdciincfakfdiam`. Native Messaging funcionó manualmente con una extensión v1.3.0 en un perfil temporal aislado: vinculación, desconexión, reconexión y persistencia tras reiniciar Chrome. Esa prueba usó el ID temporal de la copia y no valida los hooks del instalador. El nuevo instalador se compiló después de corregir la ruta del host en los hooks, pero aún no se probó en una máquina limpia; consulta el [registro de validación v1.4](../docs/V1_4_DESKTOP_READINESS.md).

## Requisitos de desarrollo

- Windows x64, Rust stable para MSVC, Microsoft C++ Build Tools, Windows SDK y WebView2.
- Node.js/npm para las herramientas de interfaz del proyecto.
- Python 3.15 para crear el entorno temporal de empaquetado; la usuaria final no necesita Python.
- PyInstaller instalado en un entorno temporal aislado.

Este módulo todavía no es un instalador listo para usuarias finales.

## Conexión segura con Chrome (prototipo)

La aplicación Windows puede iniciar el backend local. La conexión con la extensión usa el canal **Chrome Native Messaging** para solicitar un código de vinculación de un solo uso; conserva el intercambio Bearer actual (`POST /api/auth/pair`) y el token permanece en el almacenamiento privado del service worker. La interfaz de Windows y la página de conexión nunca muestran el token.

El flujo actual probado es:

1. Abrir PERSONAL_CHAT_AI; la aplicación inicia el backend empaquetado.
2. Pulsar **Conectar**. La aplicación abre `chrome://extensions`; la usuaria todavía debe abrir el menú de la extensión y entrar en **Conexión**.
3. Pulsar **Conectar** en la página de la extensión. Esta solicita al host un código efímero y lo canjea directamente con el backend, sin que la usuaria copie códigos ni vea el Bearer.
4. La página y la aplicación muestran el estado de vinculación. La usuaria puede desconectar y volver a conectar desde la interfaz.

El host valida el origen que Chrome pasa al proceso y lo compara con una sola entrada `allowed_origins` exacta. La lista no acepta comodines. El host solo reconoce las operaciones `pair`, `rotate` y `revoke`; no ofrece rutas arbitrarias ni recibe el token Bearer. El backend continúa validando autenticación y origen. El permiso `nativeMessaging` se limita al service worker/páginas de extensión; el content script envía solicitudes por el canal ya validado del worker.

Si Chrome perdió el token local y el backend todavía conserva la vinculación, pulsar **Conectar** de nuevo emite un código nuevo y rota la vinculación anterior para esta misma extensión autorizada. El token nuevo se almacena de nuevo en el área privada del service worker.

## ID de extensión y registro del host

Chrome exige que el manifiesto del host incluya el ID exacto de la extensión y que el host se registre bajo `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.personalchatai.desktop` (o la clave equivalente soportada por Chromium). `allowed_origins` no admite comodines. La validación manual utilizó un ID de prueba propio de la copia cargada en un perfil temporal. Ese ID no debe reutilizarse como ID de producción ni codificarse como valor predeterminado.

`packaging/build_windows_installer.ps1` exige el ID oficial de distribución, rechaza los IDs de desarrollo conocidos, compila el host en modo distribución y verifica la compilación antes de invocar Tauri NSIS. También produce un inventario SHA-256 de todos los archivos del backend y fija su hash en la aplicación y el host. El instalador genera el manifiesto para su ruta instalada y registra en HKCU únicamente la clave propia. Si encuentra una clave o manifiesto ajenos, se niega a sobrescribirlos; la desinstalación solo retira la clave si todavía apunta exactamente al manifiesto de PERSONAL_CHAT_AI. Los hooks apuntan a `$INSTDIR\native-host\pcai_native_host.exe`. Un intento anterior confirmó que la ruta de hook previa (`resources\native-host`) era incorrecta; los hooks corregidos están compilados en el instalador, pero aún no se han validado mediante una instalación limpia. La revisión de solo lectura del 2026-10-28 encontró que la clave existente apunta a un manifiesto ausente de una instalación anterior; no se reparó.

**ID de distribución:** la propietaria confirmó el ID del artículo de Chrome Web Store `faclobdnhaephlneakdciincfakfdiam`, que se suministra explícitamente al empaquetador. El artículo se mantuvo como borrador; no se publicó a revisión en esta fase. No se generó ni se leyó ninguna clave privada. La vía alternativa `ManifestPublicKey` comprueba que el ID deriva de la clave pública de `manifest.key`; los IDs de perfiles habituales y de prueba están reservados y el script los rechaza. Consulta la documentación oficial de [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) y de la [clave del manifiesto para conservar un ID durante el desarrollo](https://developer.chrome.com/docs/extensions/reference/manifest/key).

El host espera esta estructura empaquetada:

```text
<carpeta de la aplicación>/
  native-host/pcai_native_host.exe
  native-host/native-messaging-host.json
  backend/personal-chat-ai-backend.exe
  backend/_internal/...
```

El manifiesto apunta a la ruta absoluta del ejecutable del host. Por eso el host lo genera durante la instalación, después de que Tauri copie los recursos a su ubicación estable. La configuración usa NSIS en modo `currentUser`, que no necesita privilegios de administrador según [la documentación de Tauri](https://v2.tauri.app/distribute/windows-installer/). La prueba real del empaquetado, instalación, actualización y desinstalación sigue pendiente.

Cuando la propietaria confirme el ID y se hayan autorizado/instalado las herramientas de empaquetado faltantes, el comando de distribución para Chrome Web Store tendrá esta forma (el marcador no es un ID utilizable):

```powershell
.\packaging\build_windows_installer.ps1 `
  -ProductionExtensionId '<ID_VERIFICADO_DE_CHROME_WEB_STORE>' `
  -ExtensionIdSource ChromeWebStore `
  -PyInstallerPython '<RUTA_AL_PYTHON_TEMPORAL_DE_EMPAQUETADO>'
```

Para la vía `ManifestPublicKey`, el script comprueba que el ID deriva de la clave pública del manifiesto. En ambos casos, el instalador NSIS aparece bajo `target/release/bundle/nsis/`. El build de prueba se generó con Tauri CLI 2.12.4, NSIS 3.13 y el ID de Chrome Web Store confirmado. El nuevo instalador no se ha instalado en una máquina limpia; su registro/retirada de Native Messaging, actualización y desinstalación permanecen pendientes.

## Validación manual y límites

Las pruebas automatizadas usan un ID sintético, estado de autenticación temporal y mensajes Native Messaging simulados. Verifican el encuadre JSON, el origen exacto, operaciones permitidas, rechazo de payloads inválidos, emparejamiento/revocación y que el token no se devuelva a la interfaz. No equivalen a la prueba manual que se resume arriba. El alcance y las comprobaciones aún pendientes están en [el registro de validación y preparación de escritorio v1.4](../docs/V1_4_DESKTOP_READINESS.md).

La extensión conserva también el mecanismo manual de emparejamiento de versiones anteriores como recuperación. No es el flujo normal previsto para usuarias finales.

La conexión manual observada en un perfil temporal no basta para distribuir el producto. Aunque el ID de distribución está confirmado y existe un instalador compilado, aún falta validar en Windows limpio el registro y retirada del host, recuperación ante instalaciones interrumpidas, actualización desde v1.3.0 y conservación de datos en la desinstalación. La integración de generación y traducción desde la aplicación Windows también requiere una prueba funcional propia.

## Conectar la extensión local durante el desarrollo

La copia descomprimida confirmada para este equipo usa el ID `opegkncolnoekkhemhadjffodfpopknn`. El ID oficial de distribución continúa siendo `faclobdnhaephlneakdciincfakfdiam`. Son modos de compilación separados: el host local contiene un único origen autorizado para el ID de desarrollo; el instalador solo admite el ID oficial. No se usan comodines ni se incluyen ambos IDs en el manifiesto local.

Desde PowerShell, en la raíz del repositorio, prepara el host de desarrollo (requiere que el backend empaquetado exista):

```powershell
.\desktop-tauri\packaging\build_native_host.ps1 `
  -Mode Development `
  -ExtensionId 'opegkncolnoekkhemhadjffodfpopknn'
```

El host y su copia del backend se generan bajo `desktop-tauri/target/native-host-development/`; compilar no registra nada en Windows. Ejecuta el diagnóstico de solo lectura:

```powershell
.\tools\PROBAR_PERSONAL_CHAT_AI.ps1
```

En Chrome, carga o recarga directamente la carpeta `extension/` mediante **Cargar descomprimida** y confirma que Chrome muestra exactamente el ID local. La aplicación Tauri de desarrollo y el host de desarrollo comparten almacenamiento sintético temporal en `%TEMP%\PERSONAL_CHAT_AI\desktop-integration-v140`, separado del almacenamiento de distribución en `%LOCALAPPDATA%\PERSONAL_CHAT_AI_DATA`.

La clave Native Messaging de HKCU puede apuntar a una instalación anterior. El diagnóstico muestra si su manifiesto existe. Solo después de revisar el resultado y autorizar por separado el cambio de HKCU se puede ejecutar:

```powershell
.\tools\PROBAR_PERSONAL_CHAT_AI.ps1 `
  -RepairNativeMessaging `
  -ObservedExtensionId 'opegkncolnoekkhemhadjffodfpopknn'
```

La reparación solicita escribir `REPARAR`, exige que la ruta antigua ausente coincida con la ubicación registrada de PERSONAL_CHAT_AI y se bloquea ante otros valores, subclaves o una ruta distinta. Si falla el registro nuevo, intenta restaurar el valor anterior sin sobrescribir un cambio concurrente. Esta opción no se ejecutó en el equipo principal. Después de autorizarla, inicia la aplicación de desarrollo con `cargo run` desde `desktop-tauri` y pulsa **Conectar** en la página de la extensión. La conexión real aún debe confirmarse manualmente; las pruebas automatizadas no la sustituyen.

Si se prueba la extensión local con una aplicación Tauri Release ya instalada o ejecutada desde `target/release`, compila el modo `DevelopmentInstalled`. Mantiene únicamente el ID local, pero usa la misma raíz `%LOCALAPPDATA%\PERSONAL_CHAT_AI_DATA` que la aplicación Release y su backend. No uses el modo `Development` para emparejar con esa aplicación: su autenticación queda aislada bajo `%TEMP%`. El modo `DevelopmentInstalled` tampoco registra ni cambia la clave de Chrome.

```powershell
.\desktop-tauri\packaging\build_native_host.ps1 `
  -Mode DevelopmentInstalled `
  -ExtensionId 'opegkncolnoekkhemhadjffodfpopknn'
```

Los errores de Native Messaging se muestran en la página de conexión con una explicación segura. La consola del service worker registra únicamente un código diagnóstico fijo; nunca imprime códigos temporales, tokens, credenciales ni mensajes del backend. El diagnóstico local señala si el valor existente de HKCU usa el prefijo extendido `\\?\`; su aceptación debe confirmarse en Chrome. El host escribe rutas convencionales en registros nuevos. No cambia una vinculación existente sin autorización explícita.
