# v1.2.0 — versión estable

- Instalación neutral y cuentas de modelo con UUID, onboarding de ocho pasos y perfiles por cuenta.
- Separación de memoria por cuenta y visitante; migración v1.1 explícita y conservadora.
- Confirmación humana de identidad Stripchat; no se envían mensajes automáticamente.
- Puerto local predeterminado unificado en 8000.
- Se añade recuperación idempotente de creación de cuentas y selección que distingue registros repetidos.

# v1.1.0 — 2026-10-22

Publicación estable autorizada tras aprobación manual de Chrome/Stripchat. Metadatos finales de backend/extensión y documentación; sin cambios funcionales respecto a 9b51913. Se conservan las limitaciones descritas en RELEASE_NOTES.md y todo el historial previo.

# Cambios

## Cierre de los tres casos — 22 de octubre de 2026

Se corrigieron el respaldo de preferencias por hablante, las cortesías francesas reproducidas y la resolución/reparación acotada del referente portugués. 311 Python y 71 JavaScript aprobadas; HTTP real en puertos aislados, sin detener 8765. Resultados y límites vigentes: [docs/CLOSURE_THREE_BLOCKERS_2026_10_22.md](docs/CLOSURE_THREE_BLOCKERS_2026_10_22.md). Se respalda únicamente develop; no hay publicación estable ni cambios en main. Los apartados inferiores son históricos.

## Finalización vigente — 22 de octubre de 2026

MIT aprobada por el titular; FastAPI/Starlette/pytest actualizados, resolución fijada y pruebas de regresión ampliadas. Estado y resultados actuales en [docs/FINALIZATION_2026_10_22.md](docs/FINALIZATION_2026_10_22.md). La publicación permanece condicionada a las verificaciones finales, sin convertir las etapas históricas inferiores en garantías actuales.


## Auditoría vigente — 22 de octubre de 2026

Véase [docs/AUDIT_2026_10_22.md](docs/AUDIT_2026_10_22.md). Preparación para aprobación, sin publicación. El usuario confirma pruebas manuales satisfactorias en Chrome de perfiles persistentes, cuatro idiomas, modos y copia, sin envío automático. La licencia sigue pendiente y la evaluación sintética actual conserva fallos semánticos; no se declara estable. Los apartados anteriores en fecha son históricos y sus cifras/pendientes no sustituyen este informe.


## Cierre adicional de 1.1.0-rc.1 (2026-10-21; respaldo de desarrollo autorizado)

- Corregidos falsos duplicados de emoji, reconocimiento inglés incompleto y uso de notas del visitante como evidencia del propietario.
- Controles de preferencias/intenciones, preguntas genéricas aisladas y variación de reconocimientos de ayuda.
- Traducción con referencia entrante limitada a objetos implícitos; negativa de fidelidad separada de JSON inválido; reparación estrecha de vocativos/modismos siempre revisada.
- 253 pruebas Python y 61 JavaScript aprobadas. Evaluaciones completas y limitaciones en el [cierre vigente](docs/CLOSURE_2026_10_21.md). No es estable. Las entradas siguientes son históricas.

## Estabilización integral de 1.1.0-rc.1 (2026-10-21; cambios locales sin publicar)

- Prompt jerarquizado y compacto, identidad del objetivo en el análisis y rechazo de contratos contradictorios.
- Aislamiento del historial cuando cambia el alias manual; descarte de respuestas con otro alias.
- Controles de actividades/preferencias propias inventadas y reparación por eliminación con validación y auditoría obligatorias.
- Referencia sintáctica separada para traducción y su reintento; controles de objetos, agentes y parentescos invertidos.
- Diagnósticos por motivo/etapa/intentos; errores de transporte 503/504 separados de rechazos 502; cuerpo HTTP limitado a 256 KiB.
- 237 pruebas Python y 61 JavaScript aprobadas. Integración real repetida, incluidos todos los fallos: [informe actual](docs/STABILIZATION_2026_10_21.md). No se declara estable. Las entradas inferiores describen etapas históricas.

## Correcciones manuales de 1.1.0-rc.1 (sin publicar)

- Controles de copia parcial, expresiones repetidas, actividades inventadas y apelativos invertidos; auditoría separada con evidencia citada.
- Contratos JSON verificables con LM Studio y reparación limitada de revisiones mal formadas.
- Traducción revisada por significado, discrepancias concretas y estado temporal de reparación para el botón de reintento. Original editable y copia conservados.
- 199 pruebas Python y 58 JavaScript aprobadas. Las pruebas reales aún muestran rechazos intermitentes y matices semánticos pendientes: ver [informe](docs/RC1_REAL_CASES.md). No se declara estable.

## 1.1.0-rc.1 (2026-10-21; revisión local en develop)

- Perfiles locales validados: creación, edición, activación, eliminación y restauración. nombre de prueba predeterminado, desacoplado del generador.
- Detección reforzada de francés y controles verificables de mezclas en generación y traducción.
- Rechazo de ecos del mensaje y de borradores recientes; historial temporal acotado sin persistir conversaciones.
- Modo configurado e inicio de generación diferenciados en API y panel, manteniendo clientes anteriores.
- Recuperación de notas por relevancia y borrado seguro de registros SQLite, sin migraciones destructivas.
- Pruebas adicionales de perfiles, idiomas, modos, persistencia, inyección externa y controles del panel. Prueba previa corregida para CRLF de Windows.
- Pendiente: validación real en Chrome/Stripchat y LM Studio; no se publica ni declara estable.

Las entradas inferiores se conservan como historial de etapas anteriores; no representan el estado actual del remoto.

## 1.0.0 (candidato; publicación pendiente)

- Fijado el backend a `127.0.0.1`; el inicio rechaza configuraciones `BACKEND_HOST` externas o ambiguas.
- Actualizado el manifiesto a `1.0.0` sin cambiar permisos ni funciones de la extensión.
- Documentación de instalación, uso, seguridad, privacidad y límites de publicación consolidada.
- Esta instantánea candidata tiene una historia Git nueva y no está etiquetada ni publicada. El repositorio remoto antiguo no se ha modificado; sus referencias deben migrarse solo tras autorización.

## 1.2.0-beta.1 (candidato previo; histórico)

- Errores del backend versionados con códigos y mensajes legibles; validaciones no exponen detalles del cuerpo de entrada.
- Contrato de sugerencias v1 añade identificadores efímeros de conversación y generación y estado de traducción.
- Cliente de extensión normaliza errores estructurados/antiguos y descarta respuestas de otra conversación.
- Añadidas reglas de desarrollo, lista de regresión y procedimiento de recuperación.

## 1.1.0

- Detector contextual por selectores DOM configurables, clasificación entrante/propio, deduplicación y control de cambio de conversación.
- Modos manual, automático y desactivado; las sugerencias son borradores editables y nunca se envían automáticamente.
- Sin selectores de Stripchat asumidos; la integración real requiere inspección y prueba manual en Chrome.

## Historial anterior a 1.1.0

- Primera versión del backend FastAPI, cliente local LM Studio, memoria SQLite y extensión MV3 con modo manual.
- La detección automática DOM queda como opción configurable y requiere validación manual en Stripchat.
