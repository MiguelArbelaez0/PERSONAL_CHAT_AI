# Limitaciones conocidas — PERSONAL_CHAT_AI v1.2.0

**Estado:** documento de limitaciones de la versión estable v1.2.0, publicada en [GitHub Releases](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0). v1.1.0 es la versión estable anterior.

## Comportamiento y validación

- Stripchat puede modificar su DOM, por lo que las señales de identidad y los selectores pueden requerir mantenimiento. La identidad detectada necesita confirmación de la modelo.
- La usuaria confirmó manualmente en Chrome el flujo de identidad, onboarding, persistencia, generación con LM Studio y envío manual. Esa comprobación corresponde a su sesión; no sustituye pruebas con otras cuentas, regiones o cambios futuros del sitio.
- La documentación de publicación registra una prueba sintética contra LM Studio local y la API: obtuvo una respuesta aceptada tras un reintento de fundamentación y una traducción al español. Ese resultado es histórico, no una ejecución de esta actualización documental. La naturalidad y exactitud siguen dependiendo del modelo cargado.
- El historial de chat usado para una solicitud depende de los mensajes que Stripchat mantenga visibles en el DOM y de los límites de contexto configurados.
- Revisa cada sugerencia y su traducción antes de copiarla o enviarla. La extensión no publica mensajes automáticamente.

## Almacenamiento y red

- Las cuentas, perfiles y notas se guardan localmente en SQLite, sin cifrado de base de datos. Protege la sesión de Windows y los respaldos.
- El backend escucha en loopback y no implementa autenticación local. El acceso remoto no está soportado.
- La migración desde v1.1 es explícita; el inicio normal no importa ni elimina las bases anteriores.
- LM Studio debe estar disponible localmente. La aplicación no descarga modelos ni envía solicitudes a un servicio de inferencia remoto.
