# Cambios

## 1.1.0-rc.1 (2026-10-21; revisión local en develop)

- Perfiles locales validados: creación, edición, activación, eliminación y restauración. ChubbyKriz predeterminado, desacoplado del generador.
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
