# Privacidad

## Finalización vigente — 22 de octubre de 2026

MIT aprobada por el titular; FastAPI/Starlette/pytest actualizados, resolución fijada y pruebas de regresión ampliadas. Estado y resultados actuales en [FINALIZATION_2026_10_22.md](FINALIZATION_2026_10_22.md). La publicación permanece condicionada a las verificaciones finales, sin convertir las etapas históricas inferiores en garantías actuales.


## Auditoría vigente — 22 de octubre de 2026

Véase [AUDIT_2026_10_22.md](AUDIT_2026_10_22.md). Preparación para aprobación, sin publicación. El usuario confirma pruebas manuales satisfactorias en Chrome de perfiles persistentes, cuatro idiomas, modos y copia, sin envío automático. La licencia sigue pendiente y la evaluación sintética actual conserva fallos semánticos; no se declara estable. Los apartados anteriores en fecha son históricos y sus cifras/pendientes no sustituyen este informe.


Actualización de rc.1: el contexto DOM de otro alias no se reutiliza al cambiar manualmente el interlocutor. La referencia entrante para traducción puede conservarse en RAM en el estado de reparación, limitado a 128 entradas durante 600 segundos y ligado al original exacto; no se guarda en SQLite. Los informes versionables del benchmark contienen únicamente conversaciones sintéticas. Véase [verificación actual](STABILIZATION_2026_10_21.md). La sección final sobre migración del repositorio es histórica.

## Datos que procesa

La extensión lee el DOM de la página de Stripchat en las conversaciones configuradas para identificar el chat y preparar contexto reciente. Ese texto se envía al backend local y después al endpoint LM Studio configurado. La privacidad depende de que el endpoint permanezca local y de la política del modelo y del servidor elegidos.

El backend utiliza notas locales por alias, persistidas en SQLite cuando la persona las guarda explícitamente. El identificador interno del interlocutor se deriva mediante hash del alias. El diseño inspeccionado no persiste intencionalmente el historial completo; la extensión conserva claves de deduplicación en `chrome.storage`.

Los archivos Markdown de conocimiento pueden contener perfil o preferencias personales. `knowledge/local/` está excluido de Git. Revisa los archivos antes de copiarlos, compartir registros o enviar diagnósticos.

## Minimización y control

Desde v1.1, los perfiles y la selección activa se guardan en `personalities.sqlite3`, junto a la base de notas configurada. Solo los últimos cinco borradores de hasta 128 conversaciones/perfiles se conservan en RAM; desaparecen al reiniciar el backend y los de un alias al eliminar su memoria. No se convierten automáticamente en hechos persistentes.

Las bases no están cifradas; el hash del alias no anonimiza el texto ni el nombre guardado. El borrado de notas usa `secure_delete` de SQLite, sin garantizar la eliminación de copias externas. La API local carece de autenticación. Proteja el acceso a su cuenta y carpeta de Windows.

- Usa solo el contexto necesario para generar la respuesta.
- Verifica manualmente cualquier respuesta antes de copiarla a Stripchat.
- No guardes una inferencia o texto producido por IA como recuerdo confirmado.
- Elimina las notas locales desde las funciones disponibles cuando ya no se necesiten; para borrar los datos locales restantes, cierra la aplicación y gestiona la base de datos local en `data/`.
- La aplicación no envía mensajes automáticamente.

## Revisión del repositorio

Esta instantánea limpia no incluye el historial Git del repositorio de desarrollo ni datos locales de perfil, memoria o conversación. El remoto de origen sigue teniendo referencias anteriores activas hasta que se complete una migración autorizada. Las pruebas de escaneo no garantizan que copias, cachés o referencias externas hayan desaparecido; consulta [SECURITY.md](SECURITY.md).
