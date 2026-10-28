# PERSONAL_CHAT_AI v1.4 — validación de escritorio y preparación

Fecha del registro: 2026-10-27
Rama de desarrollo prevista: `feature/v1.4.0-user-friendly-ui`
Estado: prototipo; no es una versión de distribución.

## Resultado de integración manual

Los puntos de esta sección reflejan una prueba real realizada y confirmada manualmente por la usuaria con una copia de PERSONAL_CHAT_AI 1.3.0 y un perfil temporal independiente de Chrome. No se repitió la prueba al editar este documento. No se registran aquí el ID específico del perfil, la ruta local de prueba ni credenciales.

| Comprobación | Resultado informado | Alcance |
| --- | --- | --- |
| Extensión en el perfil temporal | Correcta; activa y conservada al reiniciar ese perfil | No verifica instalación para otras usuarias |
| Host Native Messaging | La aplicación pudo vincular la extensión con un manifiesto limitado al ID de prueba | No valida el ID final de distribución |
| Estado de conexión | La interfaz mostró «Backend conectado · extensión vinculada» | No sustituye una auditoría completa del protocolo o de credenciales |
| Desconexión | El estado pasó a desconectado | Verificado manualmente en el entorno temporal |
| Reconexión | El estado vinculado se restableció | Verificado manualmente en el entorno temporal |
| Persistencia entre sesiones de Chrome | El vínculo seguía presente tras cerrar y reabrir Chrome con el mismo perfil | No equivale a reiniciar Windows |
| Limpieza de HKCU | Se retiró la clave temporal y se confirmó `Test-Path = False` | No quedan autorizado ni instalado hosts persistentes por esa prueba |

La clave del Registro se creó exclusivamente para la prueba temporal y se retiró después. La lista `allowed_origins` contenía un solo origen exacto; no se usaron comodines. La evidencia respalda el flujo observado de Native Messaging, pero no acredita que el token no aparezca en todos los posibles registros ni completa una revisión de seguridad.

El perfil temporal mantuvo la vinculación después de reiniciar Chrome; por ello debe considerarse estado de prueba con una credencial local de prueba potencialmente persistente. No se inspeccionó ni se copió su contenido. No reutilizar ese perfil en pruebas con cuentas reales. Antes de retirarlo, desconectar la extensión y confirmar la revocación mediante el flujo de la aplicación; cualquier borrado del perfil requiere autorización separada.

## Qué puede hacer hoy una usuaria

- La aplicación Tauri inicia el backend local y verifica su estado.
- La aplicación tiene una sección **Conectar con Chrome**. Su botón abre `chrome://extensions`; la usuaria aún debe localizar PERSONAL_CHAT_AI, abrir su menú y entrar a la página **Conexión**.
- Desde la página de la extensión, la usuaria pulsa **Conectar** para iniciar el flujo de Native Messaging. No necesita leer ni copiar el código efímero ni el Bearer.
- La aplicación puede mostrar el estado de vínculo y ofrece desconexión. La extensión sigue siendo una instalación separada.

Esto es más sencillo que la vinculación manual por consola, pero aún no cumple el objetivo de una instalación guiada de principio a fin: no hay instalador, la extensión debe instalarse por separado y el botón de escritorio no la abre directamente en todos los perfiles. No se ha comprobado un flujo de usuario final en una máquina limpia.

## Pendientes antes de distribución

Prioridad recomendada:

1. **Fijar el canal y el ID de distribución de Chrome.** El ID del perfil temporal es solo de prueba. Elegir distribución de Chrome Web Store o una política organizacional apropiada, obtener y verificar el ID estable de producción y no añadir IDs de desarrollo al paquete. Chrome exige un ID exacto en `allowed_origins`; su documentación también describe la clave del manifiesto como mecanismo para conservar un ID durante el desarrollo. [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) · [Clave del manifiesto](https://developer.chrome.com/docs/extensions/reference/manifest/key).
2. **Empaquetar una instalación por usuaria.** Activar y configurar un destino MSI o NSIS de Tauri, empaquetar el backend PyInstaller y el host en una ubicación estable, y probar en una cuenta Windows limpia sin Rust, Python ni Node.js. Tauri documenta ambos formatos para Windows y permite personalizar el instalador; hay que elegir el formato después de verificar sus posibilidades de instalación y retirada del host. [Instaladores Windows de Tauri](https://v2.tauri.app/distribute/windows-installer/).
3. **Registrar el host como parte del instalador.** Crear solo la clave propia en HKCU, apuntar al manifiesto instalado en su ruta final y usar exclusivamente el ID de producción. Hacer que la instalación sea transaccional: si falla, retirar únicamente la clave creada por el instalador. No exigir privilegios de administrador sin necesidad. Chrome documenta que el instalador registra el manifiesto en una clave Native Messaging de HKCU o HKLM y que `allowed_origins` no admite comodines.
4. **Implementar una desinstalación segura.** Quitar el registro y archivos propios del host sin borrar datos de usuaria. Preservar bases, perfiles y memorias por defecto; ofrecer una acción de borrado de datos separada, explícita y confirmada. No retirar una clave cuyo valor haya sido cambiado para apuntar a un manifiesto ajeno.
5. **Guiar la primera apertura y recuperación.** Comprobar Chrome, extensión e ID, abrir una ruta de conexión clara, explicar fallos con lenguaje común y ofrecer reconexión. Evitar pedir que la usuaria navegue por páginas internas de Chrome cuando pueda abrirse la página de conexión de la extensión de forma inequívoca.
6. **Probar actualizaciones y convivencia de datos.** Ensayar instalación nueva, actualización desde v1.3.0, fallo y rollback del instalador, cambio de versión de extensión, perfiles múltiples de Chrome, revocación, recuperación y desinstalación. Toda migración de datos debe tener respaldo, confirmación y recuperación; no migrar silenciosamente.
7. **Completar validación de seguridad y funcionamiento.** Ejecutar pruebas con una extensión no autorizada, origen incorrecto, mensajes malformados, host ausente, backend lento o caído, logs revisados sin secretos y permisos mínimos. Validar generación, traducción, modo Manual/Automático y ausencia de envío automático desde la integración Windows. Separar pruebas automatizadas de las manuales.
8. **Probar distribución confiable.** Producir instalador firmado, probar SmartScreen/WebView2 y validar que la actualización no pisa los datos. Documentar requisitos reales de LM Studio y recuperación sin términos técnicos innecesarios.

## Matriz de pruebas pendientes

| Prueba | Estado |
| --- | --- |
| Instalar en Windows limpio sin herramientas de desarrollo | NO PROBADA |
| Instalar y retirar el host automáticamente con el instalador | NO PROBADA |
| Rollback tras fallo de instalación y limpieza de HKCU | NO PROBADA |
| ID final de Chrome Web Store y manifiesto de producción | PENDIENTE DE DECISIÓN/DISTRIBUCIÓN |
| Rechazo real desde una extensión distinta/no autorizada | NO PROBADA |
| Reinstalación/actualización y migración segura desde v1.3.0 | NO PROBADA |
| Recuperación tras reiniciar Windows | NO PROBADA |
| Generación y traducción con LM Studio desde el flujo integrado | NO PROBADA EN ESTA VALIDACIÓN |
| Sin envío automático de mensajes | Debe repetirse como regresión antes de distribución |
| Seguridad completa de credenciales, almacenamiento y logs | Pendiente de auditoría final |
| Instalación, actualización y desinstalación en varias cuentas/perfiles Windows | NO PROBADA |

## Siguiente fase recomendada

Implementar **Fase 5 — instalador Windows por usuaria y ciclo de vida del Native Messaging Host**, después de fijar el canal y el ID estable de Chrome. Mantener la extensión y el backend actuales; concentrar el trabajo en empaquetado, registro exacto y reversible en HKCU, rollback, retirada segura y pruebas sobre perfiles temporales. No incluir importación automática de bases ni generación dentro de esta fase.

El criterio de salida de esa fase debe ser instalar, iniciar, conectar, desconectar, actualizar y desinstalar en una máquina limpia, con el host y los datos aislados correctamente y sin dejar registros de prueba. La integración solo podrá considerarse apta para usuarias finales después de las pruebas funcionales y de seguridad pendientes de la matriz.

## Preparación técnica del instalador — 2026-10-27

Se añadieron configuración de paquete Tauri NSIS `currentUser`, empaquetado del backend y del host, y hooks de instalación/desinstalación. El host crea su manifiesto con una sola entrada `allowed_origins` exacta para el ID de distribución suministrado. El registro se limita a `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.personalchatai.desktop`, se niega a sobrescribir una referencia distinta y la retirada comprueba que la clave sigue apuntando al manifiesto propio.

El almacenamiento duradero se separó del directorio de instalación: binarios bajo `%LOCALAPPDATA%\PERSONAL_CHAT_AI`; datos bajo `%LOCALAPPDATA%\PERSONAL_CHAT_AI_DATA\PERSONAL_CHAT_AI`. Esta separación evita que el directorio de datos quede bajo el ámbito de limpieza del desinstalador NSIS. Las pruebas automatizadas comprueban la separación con rutas sintéticas.

El empaquetador exige seleccionar la fuente del ID (`ChromeWebStore` o `ManifestPublicKey`), recibe el ID explícitamente y rechaza los dos IDs de desarrollo conocidos. La vía `ManifestPublicKey` comprueba que la clave pública del manifiesto deriva al ID declarado; no genera ni lee claves privadas. La vía Web Store requiere que la propietaria verifique el ID del artículo fuera del empaquetador. La extensión actual no tiene `manifest.key` y no existe un ID definitivo de distribución confirmado, por lo que no se puede crear todavía un instalador de distribución válido.

Validación de esta preparación: Rust: **10 pruebas del host aprobadas** y **6 de la aplicación aprobadas, 1 ignorada**; compilación `--release` aprobada. La prueba unitaria nueva verifica un paquete sintético completo y rechaza un archivo modificado. Suites del proyecto: Python **357 aprobadas** (2756 advertencias deprecadas de FastAPI/Python 3.15) y JavaScript **159 aprobadas**, incluida una prueba simulada de 30 segundos. También pasaron `cargo fmt --check`, análisis sintáctico de los scripts PowerShell, validación JSON de Tauri, comprobación de MV3/`nativeMessaging`, y `git diff --check`. No se ejecutaron NSIS, instalación, hooks, registro del host ni desinstalación. El entorno no tiene Tauri CLI ni NSIS disponibles; no se instalaron herramientas. La integración Chrome Native Messaging manual antes descrita fue aportada por la usuaria y no se repitió en esta fase.

Pendientes antes del instalador RC: confirmar canal e ID definitivo; incluir/verificar `nativeMessaging` en la extensión de distribución; disponer de Tauri CLI y NSIS; ejecutar compilación Release y NSIS; probar instalación/actualización/rollback/desinstalación en Windows temporal; verificar que el hook no afecta claves ajenas y que conserva datos; probar una instalación limpia y la integración funcional completa. No se tocó el Registro durante esta preparación.

El empaquetador genera un inventario SHA-256 del paquete FastAPI y fija el hash del inventario en la aplicación y el host. Ambos validan inventario y contenido antes de iniciar el backend o tramitar autenticación. Esto detecta corrupción o modificaciones del paquete, pero no sustituye una firma de código Windows ni autentica criptográficamente el propio ejecutable de escritorio.

## Configuración de IA y administración de modelos — 2026-10-27

La revisión de código de Fase 6.2 confirma un asistente gráfico de seis pasos, ajuste limitado del puerto de loopback, recuperación consentida de configuración dañada con respaldo exacto, selección explícita y generación de prueba sintética. La selección/prueba no usa chats ni memorias. Las pruebas actuales son automatizadas; no se repitió una sesión real con LM Studio ni se inspeccionó la interfaz Tauri abierta durante esta ronda.

En Fase 6.3 se incorporó carga guiada para modelos ya instalados: solo se permite un tipo `llm`; la usuaria confirma antes de cargar; la selección se guarda solo tras validar la respuesta `loaded` y una segunda lectura del catálogo. La lista muestra metadatos devueltos por la API oficial y no inventa licencia, RAM/VRAM o recomendaciones. No se incorpora descarga dentro de PERSONAL_CHAT_AI: la API REST documentada permite iniciar y consultar descargas pero no ofrece un catálogo de exploración local con licencia/tamaño previo/requisitos ni un endpoint REST documentado para cancelarlas. La descarga debe revisarse y gestionarse en LM Studio Discover, que muestra su propia información. No hay descarga real probada.

Pruebas de este registro: suite Python **365 aprobadas** y suite JavaScript **168 aprobadas** para la base 6.2 antes de los últimos cambios de 6.3; después de esos cambios, pruebas Rust **16 aprobadas, 1 ignorada** y suite JavaScript focal **11 aprobadas**. La verificación completa de JavaScript posterior a 6.3 y el `git diff --check` final quedan registrados en el informe de trabajo asociado; no son pruebas de LM Studio real. Fuentes API oficiales: [REST overview](https://lmstudio.ai/docs/developer/rest), [model list](https://lmstudio.ai/docs/developer/rest/list), [load](https://lmstudio.ai/docs/developer/rest/load), [download](https://lmstudio.ai/docs/developer/rest/download), [download status](https://lmstudio.ai/docs/developer/rest/download-status).

## Actualización de cierre — 2026-10-27

Esta actualización complementa el registro histórico anterior; no reemplaza sus resultados ni convierte pruebas simuladas en pruebas manuales.

- **ID de distribución:** la propietaria confirmó el ID de Chrome Web Store **faclobdnhaephlneakdciincfakfdiam**. El empaquetador recibe este ID explícitamente y el host limita `allowed_origins` a ese origen exacto. La carga de la extensión y Native Messaging se probaron manualmente en un perfil temporal; no se publicó la extensión ni se modificó el perfil habitual.
- **Native Messaging:** la usuaria confirmó conexión, desconexión, reconexión y persistencia al reiniciar Chrome en un perfil temporal. La clave temporal de HKCU fue retirada y se verificó ausente después de la prueba. Esto no valida aún los hooks del instalador en una instalación limpia, una actualización o una desinstalación.
- **LM Studio real:** la usuaria confirmó que Qwen3 4B 2507 cargó con contexto de 8192 tokens, que la prueba sintética desde la aplicación respondió y que la selección se guardó en configuración temporal. La instancia de prueba se descargó. La RAM mínima observada fue 1,56 GiB. El resultado fue una validación funcional puntual, no una medición completa de rendimiento; la duración no quedó registrada y no se realizó una prueba de carga sostenida. No se repitió la carga durante el cierre.
- **Primer inicio:** la interfaz existente guía la comprobación del backend y LM Studio, detección y selección explícita del modelo, carga consentida, generación sintética y conexión Chrome por separado. El estado del backend no implica que modelo y Chrome estén listos. No se identificó un defecto reproducible que justificara ampliar este flujo en esta ronda.
- **Pruebas automatizadas ejecutadas en este cierre:** Python **365 aprobadas**; JavaScript **171 aprobadas**, incluyendo una prueba simulada de generación de más de 30 segundos; Rust **28 aprobadas y 1 ignorada**. La prueba Rust ignorada necesita el backend empaquetado. Estas pruebas no sustituyen la validación de una instalación limpia.
- **Pendientes para distribución:** instalar y desinstalar el NSIS en una VM o cuenta Windows temporal; probar actualización y rollback; probar reinicio de Windows; verificar los hooks de HKCU y la conservación de datos; comprobar funcionamiento en instalación limpia sin herramientas de desarrollo; y validar recuperación ante backend/LM Studio ausentes. El instalador no debe considerarse listo para usuarias finales hasta completar esos escenarios.

## Empaquetado de prueba — 2026-10-27

El build actual se generó con Tauri CLI 2.12.4, NSIS 3.13 y PyInstaller 6.22.3 usando el ID de Chrome Web Store confirmado. El host Release superó `--verify-extension-id` para `faclobdnhaephlneakdciincfakfdiam`; no se registró en Windows durante esta compilación.

- Artefacto: `desktop-tauri/target/release/bundle/nsis/PERSONAL_CHAT_AI_1.4.0_x64-setup.exe`
- Tamaño: 19.092.809 bytes (18,21 MiB)
- SHA-256: `F80290721F21CA3BF13A33ADAB9681C7DE806FD9C8CA8FD2741D82248875ADA0`
- El instalador no tiene firma Authenticode y no se ejecutó.
- Smoke test del backend empaquetado: health HTTP 200, SQLite solo en la ruta temporal, proceso propio detenido y puerto 8000 liberado.
- Prueba Rust completa con inclusión explícita de la integración empaquetada: host 10/10; aplicación 19/19.
- Gitleaks no reportó secretos en la carpeta de backend empaquetado. El análisis de nombres no halló archivos privados; las coincidencias iniciales eran DLL de Windows llamadas `api-ms-win-core-memory` y `api-ms-win-core-profile`.

La generación del paquete comprueba compilación y recursos configurados, pero no reemplaza la instalación limpia: no se inspeccionó ni ejecutó el instalador, no se ejercitaron los hooks NSIS/Registro y no se ha firmado el archivo. Este artefacto es para pruebas controladas, no para distribución pública.

## Validación del instalador en VM — 2026-10-27

- El instalador existente se encontró y su SHA-256 coincide con el esperado: `F80290721F21CA3BF13A33ADAB9681C7DE806FD9C8CA8FD2741D82248875ADA0`. Authenticode informa `NotSigned`.
- VirtualBox 7.2.22 está instalado y la VM PCAI_TEST_WIN11 está registrada y apagada inicialmente. Se creó y verificó el snapshot `PCAI-v1.4.0-preinstall-20261027` antes de iniciar la VM.
- Al arrancar, Windows mostró la configuración inicial (OOBE) en la selección de teclado; todavía no hay escritorio de usuario. La prueba se detuvo antes de crear/usar credenciales. No se transfirió ni ejecutó el instalador y no se cambió el Registro.
- Instalación limpia, ejecución sin herramientas de desarrollo, registro Native Messaging, flujo de LM Studio, desinstalación, conservación de datos, actualización y rollback: **no probados**.
- Para continuar, la propietaria debe completar la configuración de Windows en la VM con una cuenta de prueba local desechable. No introducir credenciales de cuentas reales ni solicitar que se compartan contraseñas. Si Windows exige una cuenta en línea o una opción de omisión no disponible, detenerse; no eludir el requisito.

## Corrección de rutas NSIS y estado de validación — 2026-10-27

La revisión de la instalación de desarrollo encontró que los hooks NSIS buscaban el host en `$INSTDIR\resources\native-host\pcai_native_host.exe`, aunque Tauri lo empaqueta en `$INSTDIR\native-host\pcai_native_host.exe`. Se corrigieron las rutas de registro y desregistro para utilizar la ubicación empaquetada. La desinstalación sigue deteniéndose si no puede verificar el host o retirar su asociación, para evitar dejar una referencia rota.

El instalador se volvió a compilar con el ID oficial `faclobdnhaephlneakdciincfakfdiam`. El host compilado pasó la verificación de ese ID y las 10 pruebas unitarias del host pasaron. Artefacto resultante: `desktop-tauri/target/release/bundle/nsis/PERSONAL_CHAT_AI_1.4.0_x64-setup.exe`; tamaño 19.090.924 bytes; SHA-256 `E404D5A6C9AA050429D5A2EE9434507A4B67E57309EA94F38FDDB2FECF33A63E`.

**La instalación del nuevo artefacto no se ha validado en una máquina limpia.** La VM de prueba conserva su snapshot previo a instalación, pero la sesión de Windows requiere desbloqueo manual antes de continuar. Por ello, el registro y retirada de Native Messaging mediante estos hooks, la ejecución de la aplicación tras instalar, la actualización y la desinstalación permanecen pendientes. La compilación y las pruebas unitarias no se presentan como sustituto de esas verificaciones.

## Integración local Chrome Native Messaging — 2026-10-28

La propietaria confirmó para la copia de desarrollo de Chrome el ID `opegkncolnoekkhemhadjffodfpopknn`. Se mantiene separado del ID oficial de Chrome Web Store `faclobdnhaephlneakdciincfakfdiam`: el host local se compila con el primero y permite solo ese origen exacto; el empaquetador NSIS queda restringido al segundo. Los manifiestos mantienen una sola entrada `allowed_origins` y no usan comodines.

La inspección de solo lectura encontró que `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.personalchatai.desktop` apunta a un manifiesto bajo una ruta anterior de instalación que no existe. La entrada de desinstalación refiere esa ubicación. Esto explica por qué Chrome no puede iniciar el host registrado. No se modificó HKCU ni se emparejó la extensión. La inspección visual de Chrome y de su service worker no se completó en esta sesión.

Se preparó un modo de compilación local bajo `desktop-tauri/target/native-host-development/` y un diagnóstico que es de solo lectura por defecto. La reparación opcional exige el ID confirmado, que la ruta anterior obsoleta coincida con la entrada de desinstalación, que la clave no tenga otros valores/subclaves y que se escriba `REPARAR`. Si falla el registro nuevo, la herramienta intenta restaurar el valor anterior sin sobrescribir un cambio concurrente. La app y el host de desarrollo comparten una ruta temporal para autenticación/pruebas, separada de producción. El registro de HKCU y la prueba real Chrome–Native Messaging quedan pendientes de autorización específica.
