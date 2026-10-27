# Hoja de ruta posterior a v1.2.0

La versión estable v1.2.0 está publicada en [GitHub Releases](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0). Esta hoja propone áreas para mantenimiento y una posible v1.3.0; no promete fechas ni funciones y no indica que el trabajo ya esté implementado.

## P0 — Coherencia documental y seguridad local

- Mantener sincronizados los documentos de estado, instalación y seguridad con las versiones publicadas.
- Revisar la frontera de confianza de la API local sin quitar la restricción de loopback ni asumir que CORS es autenticación.

## P1 — Estabilidad y confiabilidad

- Mantener pruebas de regresión para onboarding, aislamiento por cuenta, memoria, cambio de chat, roles, idiomas, traducción y modos Automático/Manual/Desactivado.
- Añadir validación reproducible en Chrome para señales de identidad, cambios del DOM y cambios de cuenta; distinguir esos resultados de fixtures simulados.
- Revisar cómo se identifica un visitante cuando el alias cambia o no es único, sin fusionar recuerdos por nombre.
- Continuar evaluando las respuestas y traducciones con conjuntos sintéticos y conservar también los rechazos y fallos.

## P2 — Rendimiento y mantenibilidad

- Medir latencia y uso de recursos con modelo, equipo, configuración y revisión de código identificados.
- Reforzar integridad referencial SQLite y recuperación ante bases existentes mediante migraciones probadas en copias temporales.
- Revisar dependencias fijadas con análisis de seguridad y pruebas de regresión antes de actualizar.

## P3 — Funciones opcionales

No se propone aquí una función de pago, acceso remoto, envío automático ni gestión remota de modelos. Cualquier cambio de ese tipo requeriría una decisión de producto y una revisión de seguridad y privacidad independiente.
