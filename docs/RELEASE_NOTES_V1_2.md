# PERSONAL_CHAT_AI v1.2.0 — preparación de versión

**Estado: no publicada.** Esta rama está en revisión. La última versión estable continúa siendo v1.1.0.

## Cambios de v1.2.0

- Instalación neutral: no crea identidad, perfil ni personalidad personal precargados.
- Detección de señales visibles de identidad Stripchat con confirmación humana y entrada manual si no hay señal fiable.
- Cuentas de modelo independientes por UUID, sin deduplicación ni fusión por nombre artístico.
- Onboarding obligatorio de ocho pasos y sección **Mi asistente** para editar preferencias.
- Perfiles y notas separados por cuenta; las notas se particionan también por visitante.
- Recuperación idempotente de solicitudes de creación para evitar duplicados por doble clic o pérdida de respuesta de red.
- Selección de cuenta con fecha, estado e ID local abreviado; la lista se puede actualizar.
- Backend local predeterminado en `127.0.0.1:8000`; continúa limitado a loopback.

## Compatibilidad y control

La migración desde v1.1 requiere una operación explícita. El inicio normal no importa ni borra datos. No se envían mensajes automáticamente: la persona revisa y envía cada respuesta.

Las suites automatizadas, las limitaciones operativas y la prueba sintética con LM Studio local se resumen en [KNOWN_ISSUES_V1_2.md](KNOWN_ISSUES_V1_2.md). La usuaria confirmó manualmente la identidad, el onboarding completo, persistencia y generación en Chrome/Stripchat; la aplicación mantiene el envío manual.
