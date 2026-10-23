# Problemas conocidos y estado de auditoría

## Publicación v1.1.0 aprobada — 22 de octubre de 2026

El propietario confirmó pruebas manuales satisfactorias de los tres casos en Chrome y Stripchat y autorizó la publicación estable. Esta decisión sustituye las restricciones de publicación de las etapas históricas inferiores. No cambia funcionalidades ni datos. Se conservan las limitaciones conocidas: rechazos ocasionales y algún falso rechazo, ambigüedad de idioma en entradas breves, dependencia de LM Studio y naturalidad variable. Evidencia y procedimiento en [publicación](PUBLICATION_2026_10_22.md).


## Cierre de los tres casos — 22 de octubre de 2026

Se corrigieron el respaldo de preferencias por hablante, las cortesías francesas reproducidas y la resolución/reparación acotada del referente portugués. 311 Python y 71 JavaScript aprobadas; entrega LM Studio 11/13, traducción 10/10, francés 4/4 y reintentos portugueses reales 2/2. Candidata para revisión final, con limitaciones menores documentadas; HTTP real en puertos aislados, sin detener 8765. Resultados y límites vigentes: [CLOSURE_THREE_BLOCKERS_2026_10_22.md](CLOSURE_THREE_BLOCKERS_2026_10_22.md). Se respalda únicamente develop; no hay publicación estable ni cambios en main. Los apartados inferiores son históricos.

**Estado histórico anterior a este cierre: BLOQUEADA para publicación estable.** MIT aprobada, dependencias corregidas (pip-audit sin hallazgos conocidos), 291 Python/71 JavaScript aprobadas. LM Studio final: 11/13 aceptadas, traducción 9/10, reintento portugués fallido; persisten afirmaciones del interlocutor sin respaldo aceptadas. Respaldo exclusivo de develop, sin main/PR/tag/Release. Consultar [informe final](FINALIZATION_2026_10_22.md). Los apartados anteriores en fecha son históricos.

## Finalización vigente — 22 de octubre de 2026

MIT aprobada por el titular; FastAPI/Starlette/pytest actualizados, resolución fijada y pruebas de regresión ampliadas. Estado y resultados actuales en [FINALIZATION_2026_10_22.md](FINALIZATION_2026_10_22.md). La publicación permanece condicionada a las verificaciones finales, sin convertir las etapas históricas inferiores en garantías actuales.


## Auditoría vigente — 22 de octubre de 2026

Véase [AUDIT_2026_10_22.md](AUDIT_2026_10_22.md). Preparación para aprobación, sin publicación. El usuario confirma pruebas manuales satisfactorias en Chrome de perfiles persistentes, cuatro idiomas, modos y copia, sin envío automático. La licencia sigue pendiente, pip-audit detectó ocho avisos distintos en dependencias y la evaluación sintética actual conserva fallos semánticos; no se declara estable. Los apartados anteriores en fecha son históricos y sus cifras/pendientes no sustituyen este informe.


## Incidencia automática posterior al respaldo

Correcciones **locales, sin commit ni push**: [INCIDENT_AUTO_SEQUENCE.md](INCIDENT_AUTO_SEQUENCE.md). Se investigan juntos el saludo y `I missed talking to you, daddy.`. Se corrigieron metadatos de hora, autoría de apelativos y dos falsos positivos concretos. 267 Python/67 JavaScript aprobadas; última secuencia sintética con Qwen: 6/6 aceptadas, con etapas fallidas conservadas. El `repeated_response` exacto de la segunda prueba de Chrome sigue pendiente de atribución; no se declara resuelto ni estable. La validación real de Chrome requiere reiniciar backend y recargar extensión.

## Cierre vigente

Véase [CLOSURE_2026_10_21.md](CLOSURE_2026_10_21.md): 253 Python/61 JavaScript aprobadas, falso duplicado de emoji corregido y referencia de traducción restringida a elipsis. Persisten límites del modelo, rechazos seguros, errores de naturalidad y pruebas humanas pendientes. El respaldo autorizado a develop no constituye aprobación estable. Las secciones siguientes son históricas.

## Verificación integral vigente — 21 de octubre de 2026

La [estabilización integral](STABILIZATION_2026_10_21.md) y sus [métricas reales](benchmarks/RESULTS.md) sustituyen las cifras de los apartados inferiores. 237 pruebas Python y 61 JavaScript aprobadas. No es estable: persisten rechazos del modelo, posible aceptación de errores fuera de los controles deterministas, matices de traducción y validación humana Chrome/Stripchat pendiente. HTTP 502 indica contenido/revisión rechazados y ahora incluye motivo y etapa; conexión/HTTP inválido usan 503 y timeout 504.

API local sin autenticación, SQLite sin cifrar y ausencia de límite global de frecuencia siguen siendo límites operativos. El límite de cuerpo de 256 KiB no los sustituye. La licencia de distribución requiere decisión del titular. Todo lo que sigue es un registro histórico y puede describir estados anteriores del remoto.

## Estado actual: v1.1.0-rc.1

Después de las pruebas manuales se añadieron controles y regresiones para cuatro fallos reales. Los resultados y límites actualizados están en [RC1_REAL_CASES.md](RC1_REAL_CASES.md): 199 pruebas Python y 58 JavaScript aprobadas, pero con rechazos intermitentes y posibles matices incorrectos de traducción con el modelo real. Esta candidata no está lista para declararse estable.

La candidata se implementó localmente en `develop`, conservando `main`. Consulta [V1_1_VALIDATION.md](V1_1_VALIDATION.md) para diagnóstico, cambios y validaciones manuales pendientes. La detección de idiomas es heurística y la revisión semántica depende del modelo. La API local no autentica clientes y SQLite no cifra el contenido. No se ha consultado ni cambiado la configuración remota durante este trabajo.

Los apartados siguientes son registros históricos de la preparación de v1.0.0; sus afirmaciones sobre ramas, versiones, servicios y cifras de pruebas no describen necesariamente el estado actual.

## Bloqueos para `v1.0.0`

1. **Migración de referencias públicas:** esta instantánea local parte de una historia limpia, pero el repositorio remoto antiguo no se ha modificado y su rama de desarrollo continúa activa. Solo el propietario puede autorizar la sustitución y retirada de esas referencias; copias externas podrían persistir.
2. **Rama y release:** el remoto sigue usando `feature/personal-chat-ai-v1` como predeterminada; no hay `main`, etiqueta ni release. No se cambió la configuración remota.

## Validación externa pendiente

- No se confirmó una generación y traducción completas contra LM Studio real en esta auditoría.
- No se ejecutó una prueba de extremo a extremo en Chrome con Stripchat real.
- Aunque los servicios locales contestan en `127.0.0.1:8765` y `127.0.0.1:1234`, esta revisión solo consultó salud y disponibilidad; no generó una respuesta ni probó la extensión en Chrome.
- Los selectores y comportamiento del DOM pueden variar por cambios del sitio.
- La calidad y licencia de uso del modelo dependen del modelo que instale el usuario; no se redistribuye uno.

## Pruebas automatizadas

En la verificación de preparación de versión del 21 de octubre de 2026:

- `python -m pytest -q tests`, en entorno virtual aislado Python 3.14.7: **129 pasaron**, incluidas las seis pruebas HTTP/ASGI. Python 3.15 del entorno predeterminado había bloqueado al inicializar el socket del event loop; el runtime principal no se modificó.
- `node --test tests/*.cjs`: **54 pasaron**.
- `node --check` para `content.js`, `conversation-detector.js` y `suggestion-flow.js`: pasaron.
- Parseo y controles del manifiesto: pasó; Manifest V3, versión `1.0.0`, permisos y host_permissions conservados. La carga real de la extensión en Chrome queda pendiente.
- `git diff --check`: pasó.
- Gitleaks no encontró hallazgos en el árbol fuente, el commit inicial de la instantánea (1 commit) ni sus archivos actuales.

Las pruebas automatizadas usan datos sintéticos y clientes simulados; no confirman generación real con LM Studio ni el flujo de Chrome/Stripchat.

## Licencia

No se seleccionó una licencia de código. `LICENSE` declara que la decisión está pendiente y no concede permiso de redistribución. Dependencias y modelos tienen licencias propias que deben revisarse para cualquier distribución comercial.
