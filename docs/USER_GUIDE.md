# Guía de uso

PERSONAL_CHAT_AI 1.2.0 prepara borradores privados para que la modelo los revise y envíe manualmente. El modo Automático genera sugerencias; nunca envía mensajes a Stripchat.

## Primera configuración

1. Inicia el backend local y LM Studio. Comprueba el estado en `http://127.0.0.1:8000/api/health`, o en el puerto configurado.
2. Abre Stripchat e inicia sesión normalmente. La extensión lee señales visibles del DOM; no accede a cookies, tokens ni credenciales.
3. En el onboarding, revisa el nombre artístico detectado y confírmalo o escríbelo manualmente. La detección nunca confirma una cuenta por sí sola.
4. Si ya tienes cuentas locales, elige la correcta en **Cuenta local**. Las opciones muestran fecha, estado e ID abreviado para distinguir nombres repetidos. Usa **Actualizar lista** si acabas de crear o cambiar una cuenta en otra ventana.
5. Para crear una cuenta independiente, deja seleccionada la opción de crear y confirma. Si el nombre ya existe, acepta el aviso solo si realmente quieres otra cuenta. No se fusionarán datos.
6. Completa los ocho pasos: identidad, personalidad, intereses, preferencias de interacción, estilo e idiomas, límites y revisión final.
7. La generación se habilita cuando el backend confirma que la cuenta y el perfil están completos. Puedes retomar el progreso si se cierra Chrome.

## Cuentas y perfil

Cada cuenta tiene un UUID local estable, independiente del nombre artístico. Perfiles, preferencias y notas se consultan con el UUID de cuenta. Un visitante con el mismo alias en dos cuentas tiene memorias separadas.

En **Mi asistente** puedes editar preferencias sin repetir todo el onboarding. La lista permite distinguir cuentas por estado configurado, fecha e ID abreviado. No elijas una cuenta basándote solo en que su nombre coincide con Stripchat; confirma que sea la cuenta local deseada.

## Preparar sugerencias

1. Comprueba que el alias y el mensaje entrante activo correspondan al chat seleccionado.
2. Elige el modo:
   - **Automático:** prepara una sugerencia al detectar un mensaje entrante nuevo.
   - **Manual:** elige o introduce el mensaje y pulsa la acción para generar.
   - **Desactivado:** no solicita sugerencias.
3. Revisa la respuesta original y la traducción al español cuando esté disponible.
4. Edita si hace falta y copia el original. Envíalo manualmente en Stripchat.

El modelo puede equivocarse sobre idioma, pronombres, tono o hechos. El historial disponible es solo el contexto visible que recibe esa solicitud; no equivale a todo el historial de Stripchat. No guardes una afirmación generada como recuerdo confirmado sin verificarla.

## Memoria y privacidad

Las notas se guardan únicamente cuando la usuaria lo solicita. Cada nota pertenece a una cuenta y un visitante concretos; las respuestas generadas y el historial de chat no se guardan automáticamente como recuerdos. La base local predeterminada está en `data/personal_chat_ai_v2.sqlite3` y no debe compartirse.

El backend escucha solo en `127.0.0.1`. Esta versión no soporta acceso remoto ni implementa autenticación local. Protege el equipo y no compartas `.env`, `data/`, `knowledge/local/`, mensajes, notas ni diagnósticos que contengan datos privados.

## Solución de problemas

- Si no detecta la identidad, confirma el nombre manualmente; no elijas una cuenta solo por coincidencia del nombre.
- Si la lista no coincide con las cuentas locales, pulsa **Actualizar lista**. Si otra instancia/backend utiliza otra base, comprueba la configuración local sin borrar datos.
- Si aparece `onboarding_required`, completa los pasos y vuelve a generar.
- Si no hay sugerencias, confirma la conexión del backend y que LM Studio tenga un modelo cargado.
- Si falla la traducción, el original se conserva y puedes reintentar solo la traducción.
- Si cambia el DOM de Stripchat, recarga la página y valida que el chat activo y el último mensaje entrante sean correctos.

Al reportar errores, comparte el código y el motivo del diagnóstico, no alias, mensajes, notas, rutas personales ni credenciales. Consulta [limitaciones conocidas](KNOWN_ISSUES_V1_2.md) y [seguridad](SECURITY.md).
