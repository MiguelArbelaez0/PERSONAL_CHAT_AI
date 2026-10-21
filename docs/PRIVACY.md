# Privacidad

## Datos que procesa

La extensión lee el DOM de la página de Stripchat en las conversaciones configuradas para identificar el chat y preparar contexto reciente. Ese texto se envía al backend local y después al endpoint LM Studio configurado. La privacidad depende de que el endpoint permanezca local y de la política del modelo y del servidor elegidos.

El backend utiliza notas locales por alias, persistidas en SQLite cuando la persona las guarda explícitamente. El identificador interno del interlocutor se deriva mediante hash del alias. El diseño inspeccionado no persiste intencionalmente el historial completo; la extensión conserva claves de deduplicación en `chrome.storage`.

Los archivos Markdown de conocimiento pueden contener perfil o preferencias personales. `knowledge/local/` está excluido de Git. Revisa los archivos antes de copiarlos, compartir registros o enviar diagnósticos.

## Minimización y control

- Usa solo el contexto necesario para generar la respuesta.
- Verifica manualmente cualquier respuesta antes de copiarla a Stripchat.
- No guardes una inferencia o texto producido por IA como recuerdo confirmado.
- Elimina las notas locales desde las funciones disponibles cuando ya no se necesiten; para borrar los datos locales restantes, cierra la aplicación y gestiona la base de datos local en `data/`.
- La aplicación no envía mensajes automáticamente.

## Revisión del repositorio

Esta instantánea limpia no incluye el historial Git del repositorio de desarrollo ni datos locales de perfil, memoria o conversación. El remoto de origen sigue teniendo referencias anteriores activas hasta que se complete una migración autorizada. Las pruebas de escaneo no garantizan que copias, cachés o referencias externas hayan desaparecido; consulta [SECURITY.md](SECURITY.md).
