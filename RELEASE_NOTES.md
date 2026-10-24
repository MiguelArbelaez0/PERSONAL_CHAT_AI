# Preparación v1.2.0 — no publicada

La rama actual prepara v1.2.0; la última estable continúa siendo v1.1.0. Las funciones nuevas y las limitaciones operativas se describen en [notas v1.2.0](docs/RELEASE_NOTES_V1_2.md) y [limitaciones conocidas](docs/KNOWN_ISSUES_V1_2.md). Las notas de abajo documentan exclusivamente la versión histórica v1.1.0 y su configuración de puerto antigua. La usuaria reportó una verificación manual satisfactoria del flujo v1.2.0 en Chrome/Stripchat; la publicación aún no se ha realizado.

# PERSONAL_CHAT_AI v1.1.0 — Stable Release

Publicación aprobada por el propietario tras pruebas manuales finales satisfactorias en Chrome y Stripchat. Las etapas rc.1 inferiores se conservan como historial y no describen el estado vigente.

> Configuración de desarrollo v1.2.0: el backend predeterminado es `127.0.0.1:8000`. Las instrucciones de puerto `8765` de esta nota v1.1.0 son históricas. Consulta [conexión local](docs/LOCAL_BACKEND_CONNECTION.md).

## Novedades y estabilidad

- Personalidades configurables, nombre de prueba predeterminado y perfiles persistentes con selección activa.
- Memoria SQLite independiente por interlocutor y perfiles personalizados.
- Inglés, español, francés y portugués; traducción independiente y fiel al español, con validación semántica y reintentos que conservan el original.
- Modos automático, manual y desactivado; edición y botón copiar. **La aplicación nunca envía mensajes automáticamente**, tampoco en modo automático: solo genera sugerencias.
- Correcciones de perspectiva, evidencia por hablante, preferencias sin respaldo, eco del mensaje y repetición de borradores. Corrección de falsos rechazos de cortesías francesas y del referente portugués en reintentos.
- Rutas estables de almacenamiento y carga de perfiles; dependencias verificadas y distribución sin datos privados.

## Instalación y requisitos

Descomprime PERSONAL_CHAT_AI_v1.1.0.zip en una carpeta propia. En Windows, instala Python 3.11 o posterior y ejecuta INSTALAR_PERSONAL_CHAT_AI.bat. Configura LM Studio con qwen/qwen3-4b-2507, servidor local compatible en http://127.0.0.1:1234/v1. Ejecuta INICIAR_PERSONAL_CHAT_AI.bat; el backend usa 127.0.0.1:8765. Carga extension/ como extensión descomprimida en Chrome y recarga la pestaña de Stripchat. Consulta README y docs/INSTALLATION.md. No reemplaces datos, perfiles ni configuración privada de una instalación anterior.

Verifica el ZIP con SHA256SUMS.txt. La distribución incluye código, extensión, scripts, documentación, LICENSE y avisos de terceros; no incluye modelos, LM Studio, bases de usuario ni conversaciones.

## Validación y limitaciones conocidas

311 pruebas Python y 71 JavaScript aprobadas. pip check, pip-audit y Gitleaks satisfactorios. Instalación limpia y HTTP real aislado con reinicio y persistencia verificados. Pruebas manuales finales de Chrome/Stripchat aprobadas por el usuario; no se presentan como observación directa del agente.

La evaluación real conservada obtuvo 11/13 generaciones y 10/10 traducciones en la ronda general; la específica obtuvo 5/8 generaciones, francés 3/3 y recuperación portuguesa 2/2 mediante traducción/revisión reales tras fallos iniciales sintéticos. Los fallos se conservan en el informe técnico.

Persisten rechazos ocasionales de generación, incluido algún falso rechazo de respuestas naturales; ambigüedad de idioma en mensajes muy breves; dependencia de la calidad y disponibilidad de LM Studio; diferencias de naturalidad entre generaciones. No se garantiza exactitud o aceptación universal ni se presentan estas limitaciones como resueltas.

## Licencia e historial

MIT, Copyright (c) 2026 Miguel Arbeláez Vallejo. Los componentes de terceros conservan sus licencias; consulta THIRD_PARTY_NOTICES.md. El historial previo permanece intacto. No existía tag ni Release v1.0.0 al verificar GitHub; se conserva el main histórico d4ba4df447765708bb2a79c430222fe3f3e49fe0, sin inventar una publicación anterior.

---

## Historial previo de preparación

# Notas de publicación

## Cierre de los tres casos — 22 de octubre de 2026

Se corrigieron el respaldo de preferencias por hablante, las cortesías francesas reproducidas y la resolución/reparación acotada del referente portugués. 311 Python y 71 JavaScript aprobadas; HTTP real en puertos aislados, sin detener 8765. Resultados y límites vigentes: [docs/CLOSURE_THREE_BLOCKERS_2026_10_22.md](docs/CLOSURE_THREE_BLOCKERS_2026_10_22.md). Se respalda únicamente develop; no hay publicación estable ni cambios en main. Los apartados inferiores son históricos.

## Finalización vigente — 22 de octubre de 2026

MIT aprobada por el titular; FastAPI/Starlette/pytest actualizados, resolución fijada y pruebas de regresión ampliadas. Estado y resultados actuales en [docs/FINALIZATION_2026_10_22.md](docs/FINALIZATION_2026_10_22.md). La publicación permanece condicionada a las verificaciones finales, sin convertir las etapas históricas inferiores en garantías actuales.


## Auditoría vigente — 22 de octubre de 2026

Véase [docs/AUDIT_2026_10_22.md](docs/AUDIT_2026_10_22.md). Preparación para aprobación, sin publicación. El usuario confirma pruebas manuales satisfactorias en Chrome de perfiles persistentes, cuatro idiomas, modos y copia, sin envío automático. La licencia sigue pendiente y la evaluación sintética actual conserva fallos semánticos; no se declara estable. Los apartados anteriores en fecha son históricos y sus cifras/pendientes no sustituyen este informe.


## Cierre vigente de rc.1 — respaldo exclusivo de develop

Correcciones adicionales de emoji, evidencia por autor, idioma, variación y reintento de traducción con contexto mínimo. 253 Python y 61 JavaScript aprobadas. Repeticiones reales y fallos en el [informe de cierre](docs/CLOSURE_2026_10_21.md). Se conservan perfiles, nombre de prueba, memoria, modos y copia. Sin nuevas dependencias, permisos o modelo. Calidad, validación humana y licencia siguen pendientes: **no es estable ni aprobación para integrar main**. Las secciones inferiores son históricas.

## Verificación integral actual — 21 de octubre de 2026

La versión sigue siendo `v1.1.0-rc.1` en desarrollo, sin publicar. Correcciones de identidad, evidencia, prompt, traducción y límites HTTP con 237 pruebas Python y 61 JavaScript aprobadas. Se ejecutó LM Studio real repetidamente con conversaciones sintéticas; se registran también los fallos y errores de contenido aceptados en etapas intermedias. Véanse [verificación actual](docs/STABILIZATION_2026_10_21.md) y [métricas](docs/benchmarks/RESULTS.md).

Para actualizar, conserva `.env`, `data/` y `knowledge/local/`, reinicia el backend y recarga extensión y pestaña. No hay dependencias, permisos o puertos nuevos. Persisten riesgos de generación/traducción, validación humana Chrome/Stripchat pendiente y decisión de licencia pendiente. **Todavía no corresponde proponer publicación ni integración en main.** Las secciones siguientes son históricas, incluidas sus cifras de pruebas.

## `v1.1.0-rc.1` — revisión local, sin publicar

Personalidades configurables desde el panel con persistencia SQLite local; nombre de prueba predeterminado. Se refuerzan la detección del francés, los controles de mezclas de idioma y repeticiones, y la distinción entre modo e inicio de generación. Se conservan los puertos, la API v1, los archivos privados, las notas por alias y la revisión humana antes de enviar.

Para instalar o actualizar: conserva tu `.env` y `data/`, instala `requirements.txt` en el entorno virtual, reinicia el backend y recarga la extensión y la pestaña de Stripchat. No se necesitan nuevas dependencias. Consulta [la auditoría y validación manual](docs/V1_1_VALIDATION.md). Las cifras y observaciones de v1.0.0 siguientes son históricas.

Verificación actual: 164 pruebas Python y 56 JavaScript aprobadas, comprobaciones sintácticas/manifiesto/diff correctas. Se probaron cuatro idiomas con el modelo local real y se corrigieron dos problemas de traducción observados. Esto no sustituye la validación pendiente en Chrome/Stripchat ni certifica fidelidad semántica en cualquier conversación.

## `v1.0.0` — candidato preparado; publicación pendiente

El manifiesto indica `1.0.0` y el backend rechaza configuraciones que no sean `127.0.0.1`. Esta instantánea excluye la historia Git anterior. No se ha modificado el remoto: sus referencias de desarrollo siguen activas hasta una migración autorizada. No se ha publicado `main`, etiqueta ni release.

En un entorno aislado Python 3.14.7 pasaron las 129 pruebas Python, incluidas las seis HTTP/ASGI; Node.js pasó 54 pruebas. Las pruebas automatizadas no sustituyen la generación real con LM Studio ni la prueba de extremo a extremo en Chrome/Stripchat, aún pendientes. El remoto antiguo no se ha modificado. Consulta [docs/SECURITY.md](docs/SECURITY.md), [docs/PRIVACY.md](docs/PRIVACY.md) y [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) antes de aprobar la publicación.

## Notas preparadas para aprobación — español

PERSONAL_CHAT_AI v1.1.0 añade perfiles persistentes con nombre de prueba predeterminado, memoria independiente por alias, cuatro idiomas (inglés, español, francés y portugués), traducción española independiente y reintentos que conservan el original. Refuerza perspectiva, evidencia, copias y repeticiones. Conserva modos automático/manual/desactivado y edición/copia. Nunca envía mensajes automáticamente. Dependencias de seguridad actualizadas y licencia MIT aprobada.

Instalación: extraer en una carpeta nueva, ejecutar INSTALAR_PERSONAL_CHAT_AI.bat, configurar LM Studio local con qwen/qwen3-4b-2507 y ejecutar INICIAR_PERSONAL_CHAT_AI.bat; cargar extension como extensión sin empaquetar de Chrome. Windows/Python 3.11+, LM Studio y modelo instalados por el usuario. Conservar .env, data y knowledge/local de instalaciones anteriores; no sobrescribirlos. Verificar manualmente borradores, matices y traducciones; pueden fallar o ser rechazados. API local sin autenticación, bases sin cifrar. Estado de aprobación en docs/FINALIZATION_2026_10_22.md; este texto no acredita publicación.

## Prepared release notes — English

PERSONAL_CHAT_AI v1.1.0 adds persistent profiles with nombre de prueba as default, per-alias memory, English/Spanish/French/Portuguese support, separate Spanish translation and translation retries that preserve the original. It strengthens speaker perspective, evidence, echo and repetition checks. Automatic, manual and disabled modes, editing and copying are preserved. It never sends chat messages automatically. Security dependencies were updated and the owner approved the MIT license.

Extract into a new folder, run INSTALAR_PERSONAL_CHAT_AI.bat, configure local LM Studio with qwen/qwen3-4b-2507, then run INICIAR_PERSONAL_CHAT_AI.bat and load extension in Chrome as an unpacked extension. Requires Windows/Python 3.11+, plus separately installed LM Studio and model. Preserve existing .env, data and knowledge/local. Review drafts and translation meaning manually; generation can fail or be rejected. The local API has no authentication and local databases are not encrypted. See docs/FINALIZATION_2026_10_22.md for approval status; these notes do not claim a published stable release.
