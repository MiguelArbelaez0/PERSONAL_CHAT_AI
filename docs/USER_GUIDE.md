# Guía de uso

Estado actual y validación pendiente: [cierre de rc.1](CLOSURE_2026_10_21.md). La IA puede producir errores incluso tras la revisión automática; no es una versión estable.

Si cambias manualmente el alias, el historial DOM del alias anterior se excluye de esa solicitud. Añade solo contexto que corresponda al nuevo interlocutor. Las notas no etiquetadas describen al interlocutor; para registrar un hecho propio explícito usa una etiqueta como `Propietario:`. El perfil define voz y estilo, no prueba hechos.

Un error 502 muestra el motivo de rechazo sin publicar la respuesta inválida. Los errores 503/504 indican transporte o tiempo de espera. El reintento de traducción conserva la original; su estado de reparación dura hasta 10 minutos y se pierde al reiniciar. Una solicitud superior a 256 KiB se rechaza con 413.

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

## Perfiles en v1.1.0-rc.1

En el panel abre **Personalidad**, selecciona un perfil y pulsa **Activar**. **Nuevo** permite definir nombre, descripción, tono, estilo y reglas; **Guardar perfil** conserva los datos sin activar un perfil nuevo. Puedes editar perfiles, eliminar los personalizados y restaurar ChubbyKriz conservando los personalizados. La selección se comparte entre pestañas del mismo backend; **Actualizar** sincroniza el panel. Los perfiles se guardan localmente sin reemplazar tus notas o archivos privados. Consulta [validación y límites](V1_1_VALIDATION.md).

La referencia entrante solo acompaña traducciones con una elipsis admitida. `generator_fidelity_failed` identifica una negativa de fidelidad del modelo; `invalid_format` identifica una salida no interpretable.

## Perfiles que aparecen vacíos

Confirma el backend local, recarga la extensión en chrome://extensions y después la pestaña de Stripchat. Abre el panel o pulsa Actualizar. La carga de perfiles no depende del éxito del detector y se reintenta al abrir el panel si antes faltaba conexión. No uses Restaurar ni crees duplicados para intentar recuperar datos. Si la API devuelve perfiles pero el panel sigue vacío, conserva el diagnóstico sin compartir datos privados. El usuario confirmó persistencia y perfiles personalizados después del reinicio; consulta la auditoría actual para distinguir esa comprobación de pruebas sintéticas.
