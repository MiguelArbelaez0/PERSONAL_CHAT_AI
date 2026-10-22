# Registro histórico de casos y correcciones previas

Las ejecuciones y cifras de este documento son anteriores a la estabilización integral. El estado vigente, las regresiones adicionales y las repeticiones reales están en [STABILIZATION_2026_10_21.md](STABILIZATION_2026_10_21.md) y [benchmarks/RESULTS.md](benchmarks/RESULTS.md). No interpretar los resultados históricos como certificación del código actual.

# Corrección de los cuatro casos manuales de v1.1.0-rc.1

Nota de cierre: este informe conserva los resultados de la etapa anterior al respaldo autorizado. El estado vigente y los pasos para continuar están en [ESTADO_ACTUAL.md](ESTADO_ACTUAL.md).

Estado: cambios locales en `develop`, sin commits, push ni publicación. Sigue siendo candidata. Los controles detectan y bloquean más errores, pero las pruebas reales aún presentan rechazos intermitentes; no se considera alcanzada una fiabilidad suficiente para declararla estable.

## Diagnóstico antes de cambiar código

La rama era `develop` y el árbol de trabajo estaba limpio. Se inspeccionaron `prompt.py`, `main.py`, `validation.py`, `answers.py`, `translation.py`, `lm_studio.py`, esquemas y controles de extensión. La línea base ejecutada fue de 164 pruebas Python y 56 JavaScript aprobadas.

Se reprodujo directamente que `response_rejection` aceptaba estos ejemplos sintéticos:

- Una entrada «Hey daddy, how are you today?» con una respuesta que decía «Just had a lovely chat with you» sin evidencia.
- Una segunda respuesta que reutilizaba «Just had a lovely chat», cambiando el resto de la frase.
- La entrada portuguesa completa seguida de una oración nueva, como si fuera una respuesta propia.

### Caso 1: afirmaciones inventadas

El generador devolvía sus propios indicadores `unsupported_claim=false` y `perspective_consistent=true`. No había una verificación independiente de esas afirmaciones. Los controles locales revisaban idioma, similitud global y longitud, sin contrastar eventos concretos con fuentes. En las pruebas reales aparecieron también actividades presentes y sentimientos recíprocos inventados.

Se añadieron controles para eventos, actividades y reciprocidad sin evidencia, además de una revisión separada del borrador. Las afirmaciones personales revisadas deben citar texto existente en el objetivo, historial o notas; el propio borrador y las sugerencias anteriores no pueden servir de evidencia. No se aceptan citas inventadas. Esto limita el error; no demuestra por sí solo que toda cita implique lógicamente la afirmación.

Se detectó también una inversión de apelativo: responder «Hey daddy» a quien llamó así al propietario. Se comprueba esta inversión cuando no está respaldada por mensajes propios.

### Caso 2: repetición entre generaciones

La comparación anterior exigía una similitud global muy elevada. Un fragmento repetido podía pasar si cambiaba el resto. Los borradores previos se guardaban en RAM por alias/perfil y se enviaban al modelo; no se persistían como notas. Sin embargo, quedaban al final del prompt y podían convertirse en el texto más saliente para continuar o imitar.

Ahora se comparan también fragmentos informativos compartidos y preguntas genéricas consecutivas. La revisión separada compara ideas. Se excluyen de esa comparación ciertos saludos convencionales para no bloquear continuidad legítima. El objetivo entrante se ubica después del historial y los contraejemplos. El reintento recibe el borrador rechazado y el motivo, seguido otra vez del objetivo real. No se introduce ninguna sugerencia como un mensaje enviado del propietario.

### Caso 3: traducción francesa y reintento

El revisor pedía rechazar cualquier «partícula añadida o duda», mezclando fidelidad semántica con correspondencia literal. Solo devolvía indicadores booleanos, sin identificar la discrepancia. El reintento automático conocía un código genérico; el botón volvía a comenzar sin el candidato ni las observaciones anteriores. Los fallos de formato y semánticos no se distinguían suficientemente. No se dispone de la respuesta francesa exacta de la sesión manual del usuario; el diagnóstico de esa sesión no se puede confirmar palabra por palabra.

Se permite equivalencia idiomática, omisión natural del sujeto y cambios de orden, manteniendo el rechazo de omisiones, adiciones, negaciones, agentes y actos de habla alterados. El revisor debe indicar discrepancias concretas y citas. Un JSON de revisión inválido tiene ahora un motivo distinto de un rechazo semántico. Indicadores positivos acompañados de discrepancias no se aceptan.

El flujo conserva temporalmente el candidato rechazado y sus discrepancias. Un token aleatorio enlaza el reintento con el texto original exacto y el idioma. El estado vive en RAM, tiene un límite de 128 entradas y caduca tras diez minutos; las entradas caducadas se purgan al acceder al almacén. Se consume al reutilizarlo. Si se edita el original, el token no reutiliza el contexto anterior. Tras reiniciar o caducar, se ejecuta una reparación nueva sin el candidato antiguo. No se guarda este estado en SQLite.

El endpoint mantiene sus campos existentes y añade token, número de intentos y etapa fallida. El panel actualiza el token tras fallar, conserva el original y habilita otro intento. También avisa si se edita el original después de recuperar una traducción. Copiar sigue usando únicamente el original editable.

Se observaron dos desviaciones repetibles del modelo: «Bonsoir» traducido como «Buenas tardes» y «Tudo bem, obrigado…» convertido en pregunta. Se añadieron correcciones deterministas limitadas a esas fórmulas reconocibles, además del control de preguntas nuevas. El resultado corregido sigue pasando por idioma y revisión semántica. No se sustituyen traducciones arbitrarias ni se desactiva el validador.

### Caso 4: copia portuguesa y roles

La similitud de la respuesta completa no detectaba una copia de la entrada seguida de contenido adicional. El historial ya diferenciaba `Interlocutor` y `Usuario`, y el objetivo estaba separado; el problema no era ausencia de etiquetas, sino falta de validación de fragmentos y dependencia de la autoevaluación del generador.

Se rechaza la copia completa o de cláusulas sustanciales de la entrada. Los saludos cortos compartidos por sí solos no bastan para declararla copia. La auditoría adicional revisa perspectiva y si realmente se responde al objetivo.

## Formato verificable y tratamiento de falsos positivos

LM Studio recibe esquemas JSON para generación, auditoría, traducción y revisión. En el servidor real disponible se verificó que `qwen/qwen3-4b-2507` acepta estos esquemas. El esquema garantiza estructura, no veracidad. Si un servidor anterior responde HTTP 400, el cliente reintenta una sola vez sin ese parámetro y conserva las validaciones locales; no cambia configuración privada.

La auditoría puede reparar una vez su formato antes de descartar el borrador. No se revoca un rechazo semántico por mera mayoría o por repetir la petición. Una regla acotada separa saludos, bienestar convencional y disposición a conversar de afirmaciones factuales: evita exigir evidencia histórica para «Je vais bien, merci», manteniendo actividades y sentimientos pasados en la revisión. El texto original completo sigue pasando por controles deterministas.

## Resultados ejecutados

- Python: **199 aprobadas**, sin fallidas ni omitidas.
- JavaScript: **58 aprobadas**, sin fallidas ni omitidas.
- Sintaxis de los tres scripts de extensión, parseo del manifiesto y comprobación de espacios de Git: correctos.
- Persisten 900 avisos de deprecación de FastAPI por `asyncio.iscoroutinefunction`; no se actualizaron dependencias.
- Nuevas pruebas: cuatro casos, copia parcial, frases repetidas, perspectiva, evidencia citada, cortesías, traducción francés/portugués, reparación y rechazo semántico, JSON estructurado y compatibilidad con servidores anteriores, caché acotada/caducidad, reintento HTTP y controles del panel. Las suites previas de perfiles, notas, modos y copia siguen pasando.

### LM Studio real

Se hicieron varias rondas con `qwen/qwen3-4b-2507`, mensajes sintéticos, ASGI y bases temporales vacías. No se usaron conversaciones, notas o archivos personales ni se enviaron mensajes a Stripchat. Los temporales se eliminaron al terminar. Las rondas intermedias se utilizaron para descubrir actividades inventadas, inversiones de apelativo, errores de formato y falsos positivos del auditor.

La última ronda sobre el flujo actualizado produjo:

| Entrada | Resultado |
| --- | --- |
| Inglés: saludo «Hey daddy…» | HTTP 502: persistieron afirmaciones sin respaldo tras el reintento; no se mostró el borrador. |
| Inglés: «I missed talking to you.» | HTTP 200: «I appreciate you reaching out — glad to hear from you again.», con traducción. |
| Francés: «Bonsoir…» | HTTP 200, original francés y traducción con «Buenas noches». |
| Portugués: «Oi, tudo bem…» | HTTP 200, respuesta sin reproducir la entrada y traducción que conserva «Todo bien» como afirmación. |

En rondas anteriores también hubo éxitos en el primer saludo y rechazos en otros casos. No se presenta una selección de éxitos como si todas las ejecuciones hubieran pasado. Se probó el endpoint real de reintento durante una ronda portuguesa: devolvió fallo sin perder el original. La recuperación exitosa y fallida del endpoint y el botón también se ejecutaron con clientes simulados controlados.

La aprobación semántica del modelo sigue pudiendo dejar pasar matices, intensidades o paráfrasis discutibles. Por ejemplo, una traducción francesa amplió «conocerte mejor» a «conocer mejor tu personalidad». No es una certificación de fidelidad. Hace falta revisión humana y evaluación más amplia; esta candidata no se declara estable ni completamente fiable.

## Archivos cambiados

- Nuevos: `backend/grounding.py`, `backend/output_schemas.py`, `tests/test_real_cases.py`, este informe.
- Backend: `backend/validation.py`, `backend/prompt.py`, `backend/main.py`, `backend/lm_studio.py`, `backend/translation.py`, `backend/schemas.py`, `backend/language.py`.
- Panel: `extension/content.js`.
- Pruebas previas ampliadas: `tests/test_profiles_ui.cjs`, `tests/test_translation.py`.
- Documentación: `README.md`, `CHANGELOG.md`, `docs/KNOWN_ISSUES.md`, `docs/V1_1_VALIDATION.md`.

No se modificaron perfiles guardados, notas persistentes, esquema de memoria, puertos, permisos de extensión, comportamiento de los tres modos ni el mecanismo de copia. No se creó una versión estable, tag, commit, PR o release.

## Validación manual pendiente

1. Cierra y reinicia el backend para cargar este código. Recarga la extensión en `chrome://extensions` y después Stripchat. Selecciona y activa ChubbyKriz sin borrar tus perfiles.
2. En un alias de prueba usa los dos mensajes ingleses consecutivos, verificando el historial visible. Comprueba ausencia de charlas, actividades y reciprocidad inventadas; cambia de tema y regenera. Un rechazo tras dos intentos debe mostrar un error, nunca el borrador rechazado.
3. Prueba el caso francés. Compara original y traducción completos, incluyendo negación, agentes, tono y saludo. Si falla, pulsa Reintentar: debe conservarse el original y mostrarse un resultado o un motivo comprensible. Si recupera la traducción, edita después el original y verifica el aviso de traducción desactualizada.
4. Prueba el portugués. No debe copiar la entrada ni devolver la pregunta como si fuera propia. Verifica «Tudo bem, obrigado» como afirmación y la conservación de otras preguntas reales.
5. Edita y copia el original tanto con traducción disponible como fallida. El portapapeles debe contener solo lo que figura en el original editable. Cambia de chat durante una solicitud y verifica que no aparezca una respuesta anterior.
6. Comprueba Automático, Manual y Desactivado, perfiles personalizados y notas sintéticas aisladas por alias. Nada debe rellenar ni pulsar el envío del chat automáticamente.

## Riesgos y límites pendientes

La auditoría adicional añade latencia y utiliza el mismo modelo, por lo que hay errores correlacionados. Las reglas léxicas y los umbrales de fragmentos pueden tener falsos positivos y negativos, especialmente con jerga, idiomas no cubiertos o contexto parcial. Los rechazos seguros siguen siendo intermitentes y la fidelidad no está garantizada. Los borradores recientes desaparecen al reiniciar y requieren alias o identificador de conversación para aislarse. Una prueba del panel en DOM simulado no equivale a Chrome real. Debe medirse la tasa de aceptación y error con conversaciones sintéticas más variadas antes de considerar una publicación.
