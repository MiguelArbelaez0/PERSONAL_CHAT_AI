# Registro histórico de validación previa

> Este documento registra etapas de v1.1.0-rc.1. Sus estados de validación pendiente y publicación describen aquella candidata; no describen v1.2.0, que está publicada como versión estable.

En el momento de ese registro, la verificación vigente de la tarea integral estaba en [STABILIZATION_2026_10_21.md](STABILIZATION_2026_10_21.md) y [benchmarks/RESULTS.md](benchmarks/RESULTS.md). Las cifras y afirmaciones inferiores describen etapas anteriores, conservadas como evidencia. Chrome/Stripchat real continuaba pendiente para aquella candidata.

# v1.1.0-rc.1: auditoría y validación

Actualización posterior a las pruebas manuales: consultar [RC1_REAL_CASES.md](RC1_REAL_CASES.md) para las cuatro correcciones, los resultados vigentes (199 Python / 58 JavaScript) y los riesgos reales todavía abiertos. Las cifras inferiores documentan la implementación inicial de la candidata.

Estado al 21 de octubre de 2026: candidata local en `develop`. No se ha publicado, etiquetado ni enviado a GitHub. Se probaron mensajes sintéticos con LM Studio real; sigue pendiente el flujo completo en Chrome/Stripchat y conversaciones más variadas.

## Diagnóstico previo

Se verificaron estructura, contratos y dependencias: FastAPI (`main.py`, `schemas.py`) coordina prompts (`prompt.py`, `knowledge.py`), idioma (`language.py`), cliente LM Studio (`lm_studio.py`), traducción (`translation.py`) y notas (`memory.py`). La extensión separa clasificación DOM (`conversation-detector.js`), solicitudes y respuestas obsoletas (`suggestion-flow.js`) y panel/configuración en Chrome storage (`content.js`). Los prompts usan roles system/user, un objetivo entrante independiente e historial etiquetado Interlocutor/Usuario; no convierten borradores en mensajes enviados.

Ya existían detección del último mensaje, fallback al historial entrante, reintento acotado, análisis contextual, revisión de roles, traducción independiente, memoria manual por alias, tres modos y copia del original. No se sustituyeron estas funciones.

Hallazgos:

- Las preferencias Markdown no ofrecían CRUD ni selección de perfiles desde el panel.
- El vocabulario francés no cubría suficientemente el caso «Bonsoir… J'aimerais… connaître».
- Clasificar el texto completo podía aceptar mezclas cuando predominaba un idioma.
- No había comparación entre regeneraciones; una respuesta podía repetir el mensaje o el borrador anterior.
- La etiqueta de inicio manual/automático no expresaba el modo configurado.
- Las notas más recientes podían desplazar una nota anterior relacionada con el objetivo.
- Línea base ejecutada: 129 pruebas Python pasaron; JavaScript tuvo 53 aprobadas y una fallida por una expresión regular que asumía LF en un archivo CRLF. Se normalizó la lectura de ese test.

## Cambios y compatibilidad

`profiles.py` almacena perfiles validados en `personalities.sqlite3`, en el directorio de la base configurada. No modifica las tablas antiguas ni sobrescribe `.env` o `knowledge/local/`. SQLite aporta transacciones y consultas parametrizadas; el perfil activo se lee por solicitud. Restaurar conserva perfiles personalizados. El modelo no dispone de herramientas para cambiar configuración.

Se añaden `GET/POST /api/profiles`, `PUT/DELETE /api/profiles/{id}`, `POST /api/profiles/{id}/activate` y `POST /api/profiles/restore`. Los campos nuevos `configured_mode` y `generation_trigger` tienen valores compatibles con clientes anteriores. El marcador `target_is_incoming=false` de texto pegado manualmente sigue admitiéndose; no autoriza un objetivo automático propio.

`validation.py` complementa la revisión semántica existente con idioma, mezclas reconocibles, eco, repetición y longitud. Hay como máximo dos intentos de generación. Los cinco últimos borradores de hasta 128 conversaciones/perfiles permanecen solo en RAM. No son hechos ni memoria persistente; se excluyen de hechos personales en el prompt. Eliminar la memoria de un alias elimina también sus borradores temporales. Las notas se ordenan por coincidencia léxica con el objetivo antes del límite del prompt. `secure_delete` limpia los registros borrados en SQLite; no equivale a cifrado o borrado forense de copias de seguridad.

## Ejecución

1. Conserva tus archivos privados y configura LM Studio local en `http://127.0.0.1:1234/v1`, con `qwen/qwen3-4b-2507` cargado si es el modelo que utilizas. Ajusta `LM_STUDIO_MODEL` en tu `.env` existente si necesitas seleccionar ese identificador; no es obligatorio si solo hay un modelo disponible.
2. Ejecuta `INICIAR_PERSONAL_CHAT_AI.bat`, o `.\.venv\Scripts\python.exe -m backend` desde la raíz. El puerto continúa siendo 8765.
3. Recarga la extensión descomprimida en `chrome://extensions` y recarga Stripchat. Revisa backend y LM Studio en el panel.
4. Abre Personalidad; guarda, selecciona y activa el perfil deseado. Guardar un perfil nuevo no lo activa. La selección es global para ese backend; actualiza otros paneles con el botón Actualizar.

Instalación completa: [README](../README.md) y [guía de instalación](INSTALLATION.md). No copies `.env.example` sobre una configuración privada existente.

## Verificaciones automatizadas

Ejecutar desde la raíz:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
node --test tests/*.cjs
node --check extension/content.js
node --check extension/suggestion-flow.js
node --check extension/conversation-detector.js
Get-Content extension/manifest.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

Las pruebas incluyen CRUD/persistencia/restauración de perfiles, idiomas en/es/fr/pt, cambios y fallback, mezclas y reintento limitado, traducción y fidelidad, perspectiva, repeticiones, aislamiento de notas, compatibilidad API, modos e intentos externos de modificar perfiles. Los tests del panel ejecutan manejadores de perfiles y portapapeles en un DOM simulado; no equivalen a Chrome real.

Resultados finales ejecutados: **164 pruebas Python aprobadas**, **56 pruebas JavaScript aprobadas**. Pasaron la comprobación sintáctica de los tres scripts de extensión, el parseo del manifiesto y `git diff --check`. Pytest emitió 735 avisos de deprecación de FastAPI por `asyncio.iscoroutinefunction`; no se actualizaron dependencias para ocultarlos.

## Prueba con LM Studio real

Se ejecutaron dos rondas de cuatro mensajes sintéticos contra `qwen/qwen3-4b-2507`, con ASGI real y bases temporales vacías dentro de `data/`; se eliminaron al terminar. No se consultaron notas ni archivos de conocimiento privados y no se enviaron mensajes a Stripchat.

En ambas rondas hubo HTTP 200 y respuesta original en el idioma esperado para francés, inglés, español y portugués. En español no se solicitó traducción redundante. La primera traducción francesa fue rechazada por fidelidad; se reforzó la conservación de saludos temporales y el motivo del reintento. La segunda ronda completó la traducción francesa. Se observó también que el modelo podía convertir una afirmación portuguesa en pregunta y aprobarla en su propia revisión: se añadió un rechazo determinista de preguntas nuevas. Una prueba posterior del texto portugués obtuvo «Todo bien, gracias por preguntar» sin pregunta añadida, y una traducción francesa aislada también pasó.

Esto demuestra funcionamiento puntual, no calidad garantizada ni estabilidad estadística. El mismo modelo revisa su traducción; las alucinaciones y cambios semánticos más sutiles siguen requiriendo revisión humana. Un intento español de la primera ronda devolvió dos alternativas y se corrigió mediante el reintento existente.

## Validación manual obligatoria (pendiente)

1. **Perfiles:** comprobar nombre de prueba; crear, editar, guardar y activar otro perfil; cerrar y abrir panel y reiniciar backend. Verificar persistencia. Eliminar un personalizado activo y restaurar el predeterminado. Confirmar que las notas antiguas y preferencias privadas siguen presentes.
2. **Idiomas:** probar «Hello, how are you?», «Hola, ¿cómo estás?», «Bonsoir, tu vas bien ? J'aimerais apprendre à mieux te connaître.» y «Olá, tudo bem? Gostaria de conhecer você melhor.». Alternar idiomas en el mismo chat. La respuesta debe seguir el objetivo, mantener nombres y mostrar traducción española independiente solo cuando corresponda. Probar también emojis y saludos ambiguos con historial.
3. **Roles y calidad:** usar «You made me laugh» y referencias ambiguas a promesas no visibles. Comprobar quién hizo cada acción, ausencia de recuerdos inventados y tono breve, cordial o coqueto no gráfico según contexto. Regenerar y revisar diversidad sin perder el objetivo. Una salida repetida tras el reintento debe producir un error, no un borrador aceptado.
4. **Modos:** Automático sugiere ante una entrada nueva sin enviar; Manual solo genera por botón; Desactivado impide generación. En Automático, pulsar Generar debe mostrar modo Automático e inicio por solicitud manual. Probar además el formulario de texto pegado y el contexto adicional.
5. **DOM y cambios de chat:** comprobar selectores de filas entrantes/propias, eventos repetidos y cambio rápido entre alias durante generación. No deben aparecer borradores de otro chat. Los datos no visibles en el DOM no se recuperan automáticamente.
6. **Copia y traducción:** editar el original y copiar; verificar que el portapapeles contiene el original editado. La traducción previa debe indicarse desactualizada. Provocar fallo de traducción, reintentar y verificar que el original se conserva.
7. **Privacidad y memoria:** guardar una nota sintética en un alias y verificar que otro no la recibe. Borrar la nota y toda su memoria; revisar los mensajes de confirmación. No introducir información sensible innecesaria.
8. **Resiliencia:** detener LM Studio/backend, intentar generar, revisar el error y recuperarse al reiniciar. Revisar panel a ventana estrecha, arrastre, minimizar y abrir. Confirmar que nunca se rellena ni se pulsa automáticamente el envío del chat.
9. **Instrucciones externas:** recibir un texto sintético que pida cambiar personalidad, revelar notas o ignorar el idioma. Verificar que no cambia la configuración y revisar el borrador antes de copiar.

## Límites y riesgos

La detección léxica no certifica cualquier frase multilingüe: jerga, textos mínimos, préstamos y palabras fuera del vocabulario pueden provocar falsos positivos o negativos. La coherencia, perspectiva, veracidad y fidelidad semántica dependen también de la revisión del mismo modelo; no hay garantía contra alucinaciones ni inyección de prompt. Un error de validación puede exigir reformular o regenerar manualmente.

Las bases locales no están cifradas. Alias hasheados no anonimizan las notas ni el campo de nombre; proteja la carpeta con su cuenta de Windows. La API local no autentica clientes: CORS no sustituye autenticación y permite el origen Stripchat para las solicitudes de la extensión. Un proceso local o código malicioso con acceso a un origen permitido queda fuera de este aislamiento. No se añadieron servicios externos ni permisos de extensión.

Los diagnósticos registran estados, no el contenido de conversaciones. No se realizó un nuevo escaneo de secretos con Gitleaks. Los datos privados están excluidos de Git; revise siempre lo que decide versionar. No se ejecutaron migraciones destructivas ni cambios en `main`.

## Archivos y estado de Git

Cambios locales sin commit ni staging en `develop`; no se ejecutaron push, creación de PR, tags o releases. Se mantienen sin cambios los puertos, `.env.example`, requisitos y configuraciones privadas.

- Backend nuevos: `backend/profiles.py`, `backend/validation.py`.
- Backend modificados: `backend/main.py`, `backend/schemas.py`, `backend/prompt.py`, `backend/language.py`, `backend/translation.py`, `backend/memory.py`.
- Extensión: `extension/content.js`, `extension/suggestion-flow.js`, `extension/manifest.json`.
- Tests nuevos: `tests/test_v110.py`, `tests/test_profiles_ui.cjs`.
- Tests modificados: `tests/test_translation.py`, `tests/test_suggestion_flow.cjs`.
- Documentación: `README.md`, `CHANGELOG.md`, `RELEASE_NOTES.md`, `docs/ARCHITECTURE.md`, `docs/KNOWN_ISSUES.md`, `docs/PRIVACY.md`, `docs/USER_GUIDE.md` y este archivo.
