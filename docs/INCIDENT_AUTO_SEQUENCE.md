# Incidencia conjunta: saludo, continuidad y horas duplicadas

Estado: **correcciones locales verificadas; el segundo fallo exacto de Chrome sigue pendiente de atribución**. Rama `develop`, base `096c2437fcec87b63eed0f12eb2607505ccf6a18`. No se hizo commit ni push. `main` permanece en `d4ba4df447765708bb2a79c430222fe3f3e49fe0`.

## Mensajes y alcance

1. `Hey daddy, how are you today?`
2. `I missed talking to you, daddy.`

Modo Automático y perfil predeterminado nombre de prueba. Todas las pruebas usan alias sintéticos y bases temporales. No se consultó ni modificó la memoria del interlocutor real. No se capturó su solicitud de Chrome, sus selectores, notas ni historial. La herramienta de navegador disponible no ofrece acceso al Chrome/Stripchat del usuario. Las pruebas DOM/HTTP son simuladas; las llamadas al modelo y su revisión sí utilizan LM Studio real, mismo Qwen y puertos.

## Causas comprobadas y límites de la atribución

**Saludo: error real de Qwen.** En una reproducción aislada previa, el mensaje limpio falló dos de tres veces con `perspective_mismatch`. El análisis llegó a interpretar al propietario como hijo/subordinado; el reintento respondió `Hey daddy, I'm good, thanks for asking!` al otro participante. El validador rechazó correctamente la inversión. También se observaron actividades inventadas. Esto demuestra que las horas no son necesarias para provocar un rechazo. El error genérico original de Chrome no permite asegurar que su causa fuera exactamente la misma.

**Segundo mensaje: código conocido, comparación desconocida.** El detalle aportado por el usuario identifica `repeated_response`. Se probó la secuencia contra el código archivado del commit base sin cambiar la rama: seis solicitudes aceptadas, sin reproducir ese rechazo exacto. Con varios borradores acumulados sí se reprodujeron `repeated_phrase` y `repetitive_question`, y las trazas muestran frases o preguntas realmente repetidas por Qwen. No equivalen automáticamente al `repeated_response` de Chrome. Para atribuir aquel evento falta saber si el candidato coincidió con el objetivo o con un borrador anterior.

**Falso positivo en frase compartida.** La normalización de `I'm` produce `i m`. El filtro de frases consideraba `m` y `there` como dos palabras de contenido; dos saludos con continuaciones diferentes, `Hey there I'm doing great` y `Hey there, I'm good—thanks for checking in!`, podían activar `repeated_phrase`. Se clasifican ahora las contracciones como palabras funcionales y `there` como parte de la cortesía. Los umbrales de similitud NO se bajaron ni se cambió `_is_duplicate`: la copia exacta o casi exacta del objetivo/borrador sigue rechazada. Las pruebas de los ecos completos del segundo mensaje siguen pasando.

**Falso rechazo de revisión.** La eliminación parcial de cortesías dejaba `for asking` como único contenido de `I'm doing well—thanks for asking!`. El modelo podía marcar ese fragmento como afirmación sin respaldo. Ahora se retiran completas las fórmulas estrechas `thanks/thank you for asking/checking in`, sin retirar actividades, promesas ni otras afirmaciones. No se ignora un veredicto negativo sobre el resto del borrador.

**Marcas de hora.** `ConversationDetector.textOf` leía todo el contenedor seleccionado. Si incluía descendientes de hora, estos pasaban a `item.text`; el panel agregaba además `item.time`, produciendo una doble presentación. Otra vía era un selector de hora que devolviera `20:24 20:24`: `normalizeTimestamp` lo conservaba literalmente. Ambas vías están reproducidas con DOM de prueba. No se puede afirmar cuál ocurrió en la sesión real sin su selector/payload. No se eliminan horas por regex del mensaje: un texto auténtico `Meet me at 20:24.` se conserva.

**Objetivo e historial.** La prueba integrada detector → flujo automático → payload conserva exactamente el segundo mensaje y su identificador. El primer saludo aparece solo como historial entrante etiquetado. Cada reintento del backend termina volviendo a señalar el objetivo actual; no lo cambia por el saludo previo. Los borradores anteriores se conservan en RAM por alias/perfil, no en SQLite ni como filas propias enviadas. Se incluyen como contraejemplos explícitos en el prompt y en la auditoría para prevenir repetición: pueden servir de ancla a un modelo pequeño, pero estas pruebas no demuestran que fueran la causa exacta del evento de Chrome. No se eliminaron ni se convirtieron en recuerdos, ni se relajó el control de repetición para ocultar el fallo.

## Correcciones implementadas

- `backend/roles.py`, `prompt.py`, `grounding.py`, `validation.py`: datos de autoría derivados del objetivo, con apelativo inicial o tras coma. Daddy se dirige al propietario y no prueba el rol del interlocutor. El mismo dato llega al análisis, la generación y la auditoría.
- `backend/main.py`: una inversión explícita del apelativo puede proponerse para reparación por eliminación. No se sustituye por otro rol ni se inventa una respuesta. Si quedan cláusulas de actividad sin respaldo, puede componerse con la reparación existente, solo cuando esta es admisible por sus propias reglas. El resultado completo debe pasar idioma, evidencia, copia/repetición, longitud y auditoría independiente. Un fallo sigue ocultando la respuesta y devolviendo un error.
- `backend/validation.py`, `grounding.py`: correcciones de los dos falsos positivos anteriores y detección de actividades comprobadas `wrapping up`/`finishing up`. Las demás reglas permanecen activas.
- `backend/errors.py`, `main.py`: `repeated_response` añade `diagnostics.duplicate_source` con `target_incoming` o `previous_unsubmitted_draft`. No incluye el texto rechazado ni datos privados. No cambia el código heredado del contrato.
- `extension/conversation-detector.js`: extrae contenido visible omitiendo solo nodos configurados como hora, sin modificar el DOM de Stripchat. Conserva saltos de línea y omite texto oculto. Si el selector de texto apunta únicamente a una hora, no lo considera un mensaje.
- `extension/suggestion-flow.js`: colapsa repeticiones idénticas de una hora en metadatos, nunca horarios diferentes ni horas dentro del texto.
- `extension/content.js`: muestra el motivo específico cuando existe y la fuente del duplicado en Información técnica. La recuperación de carga usa el `finally` existente; no se añadió envío automático ni se modificó Copiar, perfiles, memoria o modos.

## Pruebas y resultados reales

**267 Python y 67 JavaScript aprobadas; cero fallidas u omitidas.** Pytest informa 1110 advertencias de deprecación de FastAPI. Se conservaron todas las pruebas anteriores. Pasan `compileall`, los tres `node --check` y `git diff --check`. Las pruebas adicionales comprueban: ambos mensajes y posiciones del apelativo; ecos reales frente a reconocimiento válido; distinción entre objetivo/borrador; reparación conjunta y auditoría obligatoria; ausencia de notas persistidas; conservación del objetivo durante reintentos; reloj dentro del texto frente a nodo de metadatos; panel sin carga residual y botón Reintentar operativo después de 502.

Se conservan las 42 solicitudes sintéticas reales, incluidas las etapas intermedias fallidas, en AUTO_SEQUENCE_EVIDENCE.json (`incidents/AUTO_SEQUENCE_EVIDENCE.json`, evidencia del repositorio de desarrollo; excluida del ZIP):

| Etapa | Solicitudes aceptadas | Observación |
|---|---:|---|
| Saludos aislados previos, limpios/con horas añadidas | 3/6 | Dos limpios fallaron por perspectiva; uno con horas falló por evidencia. |
| Secuencia contra HEAD anterior, alias distinto por pareja | 6/6 | No reprodujo el duplicado exacto del segundo mensaje; hubo errores de calidad aceptados. |
| Primera corrección, alias distinto por pareja | 6/6 | Resultado intermedio, no garantía general. |
| Siguiente revisión, alias distinto por pareja | 6/6 | Apelativos reparados; algunas respuestas todavía contestaban al saludo. |
| Tres parejas con un alias y borradores acumulados | 3/6 | Evidencia, pregunta repetitiva y frase repetida. |
| Tras corregir cortesía, mismo alias acumulado | 3/6 | Perspectiva y frase compartida; motivó la corrección de contracciones. |
| Tras corregir frase compartida y reparación conjunta | **6/6** | Ambos objetivos aceptados tres veces en el mismo alias sintético. |

La última evaluación usa el backend corregido; la extracción DOM se verificó después con tests adicionales de visibilidad/saltos de línea. ASGI no ejecuta la extensión. Las huellas de cada informe identifican su instantánea, no una certificación de Chrome real. No se detectaron fallos de transporte; todos los rechazos observados fueron de contenido/revisión. Se inspeccionaron las seis últimas originales: sin eco literal ni daddy devuelto al interlocutor, y el segundo mensaje recibió reconocimiento presente. Subsisten estilo variable y traducciones poco naturales; 6/6 HTTP 200 no equivale a calidad perfecta ni estabilidad.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
node --test tests/*.cjs
node --check extension/content.js
node --check extension/suggestion-flow.js
node --check extension/conversation-detector.js
.\.venv\Scripts\python.exe -m compileall -q backend tools tests
git diff --check
.\.venv\Scripts\python.exe -m tools.incident_sequence --rounds 3 --shared-alias --output data/incident_repeat.json
```

## Comprobación pendiente en Chrome y Stripchat

1. Reiniciar el backend desde `develop` y recargar la extensión sin empaquetar y la pestaña. Conservar `.env`, perfiles y bases existentes.
2. En la configuración de selectores, elegir el nodo de contenido del mensaje y el de hora por separado. Comprobar que el resumen muestre el texto una vez y una sola hora. Si no hay selector de hora fiable, seleccionar un contenido que no la incluya; no se adivinan metadatos sin selector.
3. Con nombre de prueba y modo Automático, comprobar la primera entrada y después `I missed talking to you, daddy.`. Antes de generar, revisar el último mensaje seleccionado. No se necesita enviar una respuesta a Stripchat para verificar el borrador.
4. En Network, revisar solo `POST /api/suggestions`: `message` y `target_message` deben ser el texto completo actual, sin horas añadidas; `generation_trigger=automatic`, `configured_mode=auto`, con identificador del segundo objetivo distinto del primero. El historial puede contener el saludo anterior, nunca un borrador como si hubiera sido enviado.
5. Si falla, anotar HTTP, `error.reason_code`, `diagnostics.stage`, `attempts` y `duplicate_source` sin exportar notas ni conversaciones privadas. Verificar que desaparece Generando, reaparece Reintentar y el reintento conserva el mismo objetivo. Si llega otro mensaje antes de terminar, la respuesta anterior no debe mostrarse.
6. Confirmar que Copiar usa la original editable y que no hay envío automático. Solo después de repetir ambos casos satisfactoriamente en Chrome se podrá cerrar el evento real.

**Conclusión:** hay errores del modelo y falsos positivos concretos corregidos, con regresiones y reproducción local. El `repeated_response` exacto de la segunda prueba real todavía no se reprodujo ni se pudo atribuir a su objetivo o a un borrador anterior. No se declara resuelto ese evento ni estable la versión.
