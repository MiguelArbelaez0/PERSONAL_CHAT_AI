# Arquitectura

## Componentes

```text
Stripchat en Chrome
  └─ extensión Manifest V3 (extension/)
       └─ API HTTP local en 127.0.0.1:8765 (backend/)
            ├─ cliente compatible con Chat Completions
            │    └─ LM Studio en el equipo
            ├─ archivos Markdown de conocimiento (knowledge/)
            └─ SQLite local para notas guardadas explícitamente (data/)
```

La extensión detecta la conversación y los mensajes disponibles en el DOM activo. El backend reúne el contexto permitido, las instrucciones de estilo y las notas asociadas al alias y solicita una respuesta al servicio local. Cuando corresponde, solicita también una traducción al español. La persona revisa y copia la respuesta; la aplicación no envía mensajes a Stripchat.

## Límites de confianza y datos

- La extensión declara permisos de almacenamiento y escritura al portapapeles, con acceso al backend local `http://127.0.0.1:8765/*` y scripts de contenido en los dominios configurados de Stripchat.
- El backend utiliza FastAPI y SQLite. Las notas solo se guardan mediante operaciones explícitas; el historial de conversación no se persiste intencionalmente.
- El cliente LM Studio usa un servicio HTTP local compatible con Chat Completions. La ruta y el modelo se configuran en el entorno.
- Los selectores del sitio pueden cambiar y deben validarse en Chrome tras cambios de Stripchat.

## Bloqueo de exposición de red

El backend solo inicia con `BACKEND_HOST=127.0.0.1`; valores externos o ambiguos se rechazan. El acceso remoto no está soportado en esta versión. La API no implementa autenticación y confía en el sistema local y en sus controles de origen CORS. Consulta [SECURITY.md](SECURITY.md).

## Versiones

El manifiesto declara `1.0.0`, que corresponde al objetivo de esta versión. La etiqueta y la publicación aún no se han creado.
