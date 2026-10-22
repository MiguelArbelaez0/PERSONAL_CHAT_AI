# Notas de publicación

## Cierre vigente de rc.1 — respaldo exclusivo de develop

Correcciones adicionales de emoji, evidencia por autor, idioma, variación y reintento de traducción con contexto mínimo. 253 Python y 61 JavaScript aprobadas. Repeticiones reales y fallos en el [informe de cierre](docs/CLOSURE_2026_10_21.md). Se conservan perfiles, ChubbyKriz, memoria, modos y copia. Sin nuevas dependencias, permisos o modelo. Calidad, validación humana y licencia siguen pendientes: **no es estable ni aprobación para integrar main**. Las secciones inferiores son históricas.

## Verificación integral actual — 21 de octubre de 2026

La versión sigue siendo `v1.1.0-rc.1` en desarrollo, sin publicar. Correcciones de identidad, evidencia, prompt, traducción y límites HTTP con 237 pruebas Python y 61 JavaScript aprobadas. Se ejecutó LM Studio real repetidamente con conversaciones sintéticas; se registran también los fallos y errores de contenido aceptados en etapas intermedias. Véanse [verificación actual](docs/STABILIZATION_2026_10_21.md) y [métricas](docs/benchmarks/RESULTS.md).

Para actualizar, conserva `.env`, `data/` y `knowledge/local/`, reinicia el backend y recarga extensión y pestaña. No hay dependencias, permisos o puertos nuevos. Persisten riesgos de generación/traducción, validación humana Chrome/Stripchat pendiente y decisión de licencia pendiente. **Todavía no corresponde proponer publicación ni integración en main.** Las secciones siguientes son históricas, incluidas sus cifras de pruebas.

## `v1.1.0-rc.1` — revisión local, sin publicar

Personalidades configurables desde el panel con persistencia SQLite local; ChubbyKriz predeterminado. Se refuerzan la detección del francés, los controles de mezclas de idioma y repeticiones, y la distinción entre modo e inicio de generación. Se conservan los puertos, la API v1, los archivos privados, las notas por alias y la revisión humana antes de enviar.

Para instalar o actualizar: conserva tu `.env` y `data/`, instala `requirements.txt` en el entorno virtual, reinicia el backend y recarga la extensión y la pestaña de Stripchat. No se necesitan nuevas dependencias. Consulta [la auditoría y validación manual](docs/V1_1_VALIDATION.md). Las cifras y observaciones de v1.0.0 siguientes son históricas.

Verificación actual: 164 pruebas Python y 56 JavaScript aprobadas, comprobaciones sintácticas/manifiesto/diff correctas. Se probaron cuatro idiomas con el modelo local real y se corrigieron dos problemas de traducción observados. Esto no sustituye la validación pendiente en Chrome/Stripchat ni certifica fidelidad semántica en cualquier conversación.

## `v1.0.0` — candidato preparado; publicación pendiente

El manifiesto indica `1.0.0` y el backend rechaza configuraciones que no sean `127.0.0.1`. Esta instantánea excluye la historia Git anterior. No se ha modificado el remoto: sus referencias de desarrollo siguen activas hasta una migración autorizada. No se ha publicado `main`, etiqueta ni release.

En un entorno aislado Python 3.14.7 pasaron las 129 pruebas Python, incluidas las seis HTTP/ASGI; Node.js pasó 54 pruebas. Las pruebas automatizadas no sustituyen la generación real con LM Studio ni la prueba de extremo a extremo en Chrome/Stripchat, aún pendientes. El remoto antiguo no se ha modificado. Consulta [docs/SECURITY.md](docs/SECURITY.md), [docs/PRIVACY.md](docs/PRIVACY.md) y [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) antes de aprobar la publicación.
