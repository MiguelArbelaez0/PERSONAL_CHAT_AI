# Estabilización integral del 21 de octubre de 2026

**Informe histórico de la tarea anterior.** El cierre vigente con correcciones adicionales, pruebas y respaldo autorizado está en [CLOSURE_2026_10_21.md](CLOSURE_2026_10_21.md). Los estados sin commit/push y las cifras inferiores corresponden a aquella tarea.

Estado: PERSONAL_CHAT_AI v1.1.0-rc.1 en desarrollo, **todavía bloqueada para aprobación como estable**. Trabajo local sobre `develop`, base `9fb0ba4bba9779f71478a285762ff4fe1689371f`. No se hicieron commit, push, merge, tags ni releases durante esta tarea. `main` se conserva en `d4ba4df447765708bb2a79c430222fe3f3e49fe0`.

## Diagnóstico y correcciones

1. **Hechos inventados y perspectiva:** las comprobaciones del autor y un segundo pase del mismo modelo no son independientes en capacidad. Ambos aprobaron actividades, preferencias propias y agentes invertidos. Se ampliaron controles deterministas de actividades, preferencias y compromisos; las notas sin etiqueta describen al interlocutor, no al propietario. Las cortesías presentes siguen permitidas. Una propuesta de reparación solo puede eliminar cláusulas existentes, vuelve a pasar todos los controles y necesita auditoría separada antes de mostrarse. No se genera una respuesta prefabricada.
2. **Repetición y prioridad:** el prompt acumulaba reglas redundantes y ejemplos que competían con el objetivo. Se compactó en seis prioridades: objetivo, roles, evidencia, voz, confianza y salida. Perfil, hechos y borradores no enviados permanecen separados. Se conservan la detección de copia, frases/ideas repetidas, preguntas genéricas y el presupuesto verificable. Una prueba de presupuesto usa ahora 6000 tokens en vez de 8192 para seguir provocando un recorte real tras compactar el prompt; sus aserciones no se eliminaron.
3. **Identidad y aislamiento:** al escribir un alias distinto en el panel manual, se enviaba el historial DOM del alias anterior. Ahora se excluye ese historial. La respuesta de otro alias se descarta, además de los controles existentes de conversación, mensaje y cancelación. Los identificadores también llegan al análisis previo. El backend rechaza contratos canónicos/heredados contradictorios con 422.
4. **Traducción:** faltaba contexto para resolver objetos implícitos y los revisores podían aprobar inversiones. La referencia entrante se transmite separada del original y se conserva durante el reintento ligado al original exacto. Controles estrechos rechazan inversiones explícitas de conocerme/conocerte, hacer reír y la traducción de sweetie como hijo. Las omisiones, negaciones, preguntas añadidas y cambios de significado siguen pasando por los validadores existentes. Los casos no cubiertos siguen dependiendo del modelo: no es una prueba universal de equivalencia.
5. **Errores:** un HTTP 502 genérico ocultaba la causa. Se conserva el código antiguo para compatibilidad y se añaden `error.reason_code`, etapa y número de intentos sin el texto privado. Rechazos de contenido siguen en 502; conexión/HTTP/respuesta inválida de LM Studio en 503 y timeout en 504. La extensión conserva y presenta el motivo específico. La traducción fallida no elimina ni regenera la respuesta original.
6. **Recursos:** límite de cuerpo HTTP de 256 KiB antes del parseo, incluyendo solicitudes fragmentadas sin Content-Length; notas vacías rechazadas. Los reintentos de generación, revisión y traducción siguen acotados. No se añadió autenticación ni limitación global de frecuencia.

## Compatibilidad

Sin nuevas dependencias, permisos Chrome, puertos ni modelo. Se conservan nombre de prueba predeterminado y perfiles CRUD/activación/restauración con SQLite, notas por alias, formatos anteriores compatibles, modos Automático/Manual/Desactivado, edición y copia. Ningún modo envía mensajes. Las pruebas de persistencia y compatibilidad existentes pasan; las solicitudes sintéticas usan almacenes temporales y no se borraron ni reinicializaron bases privadas.

## Inventario de archivos

32 archivos candidatos, sin staging:

- Backend modificados: `backend/grounding.py`, `backend/lm_studio.py`, `backend/main.py`, `backend/prompt.py`, `backend/schemas.py`, `backend/translation.py`, `backend/validation.py`. Nuevos: `backend/errors.py`, `backend/request_limits.py`.
- Extensión: `extension/content.js`, `extension/suggestion-flow.js`. Detector, manifiesto y permisos conservados.
- Pruebas: `tests/test_app.py`, `tests/test_suggestion_flow.cjs`; nuevo `tests/test_stabilization.py`. Nuevo ejecutor: `tools/benchmark_local.py`.
- Documentación modificada: `README.md`, `CHANGELOG.md`, `RELEASE_NOTES.md`, `docs/ESTADO_ACTUAL.md`, `docs/INSTALLATION.md`, `docs/KNOWN_ISSUES.md`, `docs/PRIVACY.md`, `docs/RC1_REAL_CASES.md`, `docs/SECURITY.md`, `docs/USER_GUIDE.md`, `docs/V1_1_VALIDATION.md`.
- Documentación nueva: este informe, `docs/benchmarks/RESULTS.md`, `docs/benchmarks/baseline.json`, `docs/benchmarks/intermediate_1.json`, `docs/benchmarks/intermediate_2.json`, `docs/benchmarks/final.json`.

## Pruebas reproducibles

Línea base ejecutada antes de modificar: **199 Python y 58 JavaScript aprobadas**. Resultado tras las correcciones: **237 Python y 61 JavaScript aprobadas; cero fallidas u omitidas**. Pytest informa 1005 advertencias de deprecación de `asyncio.iscoroutinefunction` en FastAPI con el Python instalado; no se cambiaron dependencias para silenciarlas.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
node --test tests/*.cjs
node --check extension/content.js
node --check extension/suggestion-flow.js
node --check extension/conversation-detector.js
.\.venv\Scripts\python.exe -m compileall -q backend tools tests
git diff --check
```

Las regresiones nuevas cubren identidad contradictoria, fuga de contexto por alias manual, descarte de alias obsoleto, códigos de error, límites HTTP fragmentados, notas vacías, preferencias propias inventadas, reparación por eliminación auditada y rechazada, preservación de acciones al retirar cortesías, citas obligatorias para resolver falsos positivos, objetos y parentescos traducidos incorrectamente y conservación del contexto en reintentos exitosos/fallidos. Las suites anteriores conservan los cuatro casos reales, copia, repetición, memoria, perfiles y modos.

## Integración local y límites de las métricas

`tools/benchmark_local.py` llama al backend mediante ASGI y al **LM Studio real en 127.0.0.1:1234/v1**, modelo `qwen/qwen3-4b-2507`. No usa Chrome ni el servidor backend ya iniciado. Usa bases temporales, conocimiento vacío y conversaciones sintéticas; por ello no reproduce preferencias privadas. Conserva entradas, salidas completas, fallos, latencia, identidad y comprobaciones mecánicas. El informe final lleva una huella SHA-256 del código ejecutado.

```powershell
.\.venv\Scripts\python.exe -m tools.benchmark_local --rounds 3 --output data/benchmark_repeat.json
```

Los informes sanitizados en `docs/benchmarks/` incluyen la línea base, dos etapas intermedias y la repetición final. HTTP 200 significa que la original pasó los controles, no que su contenido o traducción esté garantizado. La aprobación semántica del modelo tampoco es verdad de referencia. Las cuatro traducciones patrón se revisan aparte. El detalle final de métricas y valoración está en `benchmarks/RESULTS.md`.

## Seguridad y privacidad

Loopback obligatorio conservado para ambos servicios. Manifiesto V3 y permisos originales. `.env`, `.venv`, bases, historiales locales, cachés, temporales, modelos y `knowledge/local/` permanecen excluidos. Los informes compartibles contienen exclusivamente datos sintéticos y no contienen los tokens efímeros de reparación. Gitleaks se ejecuta sobre una copia de los archivos fuente candidatos, no sobre datos privados.

Verificaciones ejecutadas: manifiesto JSON válido, V3, todos sus JS/CSS presentes y permisos idénticos a HEAD; `compileall`, tres `node --check` y `git diff --check` correctos. Gitleaks: 66 archivos candidatos (~869 KiB), **cero hallazgos**, salida 0. No hay bases ni `.env` privado entre los archivos versionados; `git check-ignore` confirma las exclusiones. Este escaneo del árbol candidato no certifica referencias remotas ni copias externas. Los cambios nuevos no se incorporaron al historial Git.

Riesgos que permanecen: API local sin autenticación; CORS no autentica procesos locales ni extensiones; SQLite no cifra notas/perfiles; no hay límite global de concurrencia/frecuencia; el aislamiento depende del alias que el usuario haya identificado correctamente y un cliente puede suministrar contexto manual arbitrario. Los diagnósticos nuevos contienen códigos, nunca el borrador rechazado. Las defensas contra inyección reducen riesgos pero un LLM no ofrece aislamiento formal de instrucciones.

## Continuación y validación humana

1. Conservar `.env`, `data/` y `knowledge/local/`. No copiar `.env.example` sobre una configuración existente. Cargar el modelo indicado y reiniciar el backend con `.\.venv\Scripts\python.exe -m backend`. Recargar la extensión sin empaquetar y la pestaña de Stripchat.
2. En un chat de prueba autorizado, revisar alias, dirección de cada fila y último mensaje; ajustar los selectores con la guía `STRIPCHAT.md`. Reproducir los cinco mensajes y perspectiva descritos en `RC1_REAL_CASES.md` y en el benchmark.
3. Probar cada modo. Automático genera borradores solo con entrantes válidos; Manual únicamente al solicitar; Desactivado no genera. Verificar personalmente que ninguno envía mensajes.
4. Cambiar rápidamente entre dos chats mientras genera y cambiar el alias manual. No debe mostrarse una respuesta antigua ni contexto del otro chat. Revisar la información técnica sin exportar conversaciones privadas.
5. Forzar fallo de traducción con un cliente de pruebas o parar LM Studio después de obtener una original. Comprobar que el original editable y Copiar conservan su contenido. Reiniciar LM Studio y usar Reintentar traducción; no debe generar otra original. Si expira el estado temporal (10 minutos/reinicio), el reintento aún traduce el original pero ya no conserva el contexto de reparación.
6. Crear/editar/activar un perfil de prueba, guardar una nota bajo un alias de prueba, reiniciar backend y verificar persistencia y aislamiento. Restaurar nombre de prueba y eliminar solo los datos de prueba desde el panel.
7. Revisar fidelidad humana de todas las originales/traducciones, repetir la serie local y resolver los rechazos o errores documentados antes de aprobar. Chrome/Stripchat real sigue pendiente: los tests DOM son simulados.
8. El titular debe elegir la licencia de distribución. `LICENSE` no concede actualmente redistribución. Solo tras cerrar calidad, validación humana y licencia corresponde pedir autorización para integración/publicación.

Referencias históricas: [V1_1_VALIDATION.md](V1_1_VALIDATION.md), [RC1_REAL_CASES.md](RC1_REAL_CASES.md). Sus cifras anteriores se conservan como evidencia de etapas previas, no como verificación del código actual.
