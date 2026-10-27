# Privacidad — v1.2.0

PERSONAL_CHAT_AI procesa el contexto visible para preparar borradores. La modelo debe revisar cada sugerencia y enviarla manualmente.

## Qué datos se usan

- El DOM activo de Stripchat aporta el mensaje entrante, el contexto reciente visible y señales de identidad de la cuenta autenticada. La detección no lee cookies, credenciales ni tokens; la identidad se confirma en el onboarding.
- FastAPI recibe el UUID de la cuenta, las preferencias del perfil y el contexto necesario para generar. El cliente envía la solicitud al LM Studio configurado localmente.
- Las notas de memoria solo se guardan mediante acciones explícitas. Cada nota queda aislada por UUID de modelo y alias de visitante; respuestas generadas e historial no se añaden automáticamente como recuerdos.
- La extensión guarda preferencias de panel, progreso del onboarding, cuenta seleccionada y, mientras se completa una creación, una clave idempotente temporal en `chrome.storage.local`. No almacena allí el historial completo del chat.

## Dónde se guarda

La base predeterminada `data/personal_chat_ai_v2.sqlite3` contiene cuentas, perfiles y notas. Las fuentes v1.1 pueden quedar en rutas heredadas para una migración explícita. Las bases SQLite no están cifradas; protege la sesión de Windows y los respaldos. Los archivos `knowledge/local/` pueden contener datos personales y están excluidos de Git.

El backend y LM Studio deben permanecer en loopback. Esta versión no admite acceso remoto. El backend no implementa autenticación local; CORS limita las respuestas legibles por páginas web, pero no sustituye autenticación frente a procesos locales.

## Retención y control

- El contexto de conversación y las solicitudes al modelo no se persisten intencionalmente como historial.
- Las notas se conservan hasta que la modelo las edita o elimina. Los borradores recientes antirrepetición viven en memoria del proceso y se pierden al reiniciar.
- La migración v1.1 no se ejecuta al iniciar. La herramienta explícita conserva las fuentes y coloca datos importados en el área heredada, sin asignarlos automáticamente a una cuenta nueva.
- Eliminar una nota local con SQLite `secure_delete` no garantiza borrar copias externas, respaldos, copias del sistema de archivos o datos que un proveedor local del modelo retenga.

## Publicación y documentación histórica

El empaquetador local `tools/build_distribution.py` selecciona una lista explícita de archivos y excluye bases, conversaciones, memorias, respaldos y reportes internos del ZIP que genera. El historial Git conserva documentación histórica de v1.1 con un nombre artístico usado en esa versión; esta nota no afirma que forks, cachés o copias externas hayan sido eliminados.

Para reportar problemas, comparte códigos y mensajes técnicos redactados. No compartas alias, mensajes, notas, capturas de chats, `.env` ni rutas de usuario.
