# PERSONAL_CHAT_AI v1.2.0 — versión estable

PERSONAL_CHAT_AI v1.2.0 — Personalized Assistant.

## Cambios de v1.2.0

- Instalación neutral: no crea identidad, perfil ni personalidad personal precargados.
- Detección de señales visibles de identidad Stripchat con confirmación humana y entrada manual si no hay señal fiable.
- Cuentas de modelo independientes por UUID, sin deduplicación ni fusión por nombre artístico.
- Onboarding obligatorio de ocho pasos y sección **Mi asistente** para editar preferencias.
- Perfiles y notas separados por cuenta; las notas se particionan también por visitante.
- Recuperación idempotente de solicitudes de creación para evitar duplicados por doble clic o pérdida de respuesta de red.
- Selección de cuenta con fecha, estado e ID local abreviado; la lista se puede actualizar.
- Backend local predeterminado en `127.0.0.1:8000`; continúa limitado a loopback.

## Validación

- Suite Python: 335 pruebas aprobadas.
- Suite JavaScript: 117 pruebas aprobadas.
- Pruebas de distribución: 3 aprobadas.
- `pip check` sin dependencias rotas; `pip-audit` sin vulnerabilidades conocidas en las dependencias de producción y desarrollo.
- Gitleaks no encontró secretos en el árbol ni en los 35 commits revisados.
- Sintaxis, manifiesto Chrome MV3 v1.2.0 y `git diff --check` verificados.
- La usuaria confirmó manualmente en Chrome/Stripchat la detección, el onboarding, la persistencia y la generación. Una prueba sintética contra LM Studio local también completó generación y traducción.

Bandit reportó B608 de confianza baja en la consulta de migración de `backend/migrations.py`; la selección usa una lista fija de columnas permitidas y la revisión no confirmó una vulnerabilidad.

## Compatibilidad y control

Los datos de v1.1 se mantienen hasta que la persona ejecute una migración explícita hacia una base v1.2; el inicio normal no importa, fusiona ni elimina perfiles heredados. La migración se explica en [instalación y migración](INSTALLATION.md). No se envían mensajes automáticamente: la persona revisa y envía cada respuesta.

## Seguridad y limitaciones

Las cuentas, perfiles y recuerdos permanecen locales. El backend escucha solo en loopback, no ofrece autenticación local y no admite acceso remoto. La base SQLite no está cifrada; protege el equipo y los respaldos.

Stripchat puede cambiar su DOM y la detección conserva confirmación humana y entrada manual. La calidad de respuestas y traducciones depende del modelo y requiere revisión. La extensión prepara borradores: cada mensaje se revisa y envía manualmente. Consulta [limitaciones conocidas](KNOWN_ISSUES_V1_2.md) e [instalación y migración](INSTALLATION.md).
