# Guía de uso

## Preparar sugerencias

1. Inicia el backend local y LM Studio.
2. Abre la extensión en una conversación de Stripchat.
3. Revisa que el alias y el mensaje entrante activo correspondan al chat seleccionado.
4. Elige el modo:
   - **Automático:** intenta generar al detectar un mensaje entrante nuevo.
   - **Manual:** elige o introduce el mensaje y solicita la generación con la acción manual.
   - **Desactivado:** no solicita nuevas sugerencias.
5. Revisa la respuesta original y su traducción cuando esté disponible.
6. Edita si hace falta, copia la respuesta original y envíala manualmente en Stripchat.

La herramienta no envía automáticamente mensajes. El modelo puede equivocarse: verifica hechos, pronombres, recuerdos y tono antes de usar una sugerencia.

## Memoria y estilo

La memoria por interlocutor consiste en notas guardadas explícitamente. Las preferencias personales y de tono pueden configurarse en los archivos de conocimiento correspondientes. Mantén separados los datos locales de cada usuario y no guardes afirmaciones generadas como hechos confirmados.

## Si no aparecen sugerencias

- Confirma que el backend responde en `http://127.0.0.1:8765/api/health`.
- Comprueba que LM Studio está ejecutándose, que tiene un modelo cargado y que la URL/modelo de `.env` son correctos.
- Usa reintentar después de corregir la conexión.
- Si la original aparece pero no la traducción, usa la acción de reintento de traducción disponible en el panel; la respuesta original debe conservarse.
- Si no se detecta el mensaje o alias correcto, recarga la página y vuelve a seleccionar el chat. Los selectores dependen del DOM de Stripchat.

Para reportar un error, comparte el mensaje de diagnóstico y el resultado de salud, pero elimina alias, mensajes, notas, rutas de usuario y credenciales.
