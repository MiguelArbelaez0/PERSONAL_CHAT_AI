# Problemas conocidos y estado de auditoría

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
