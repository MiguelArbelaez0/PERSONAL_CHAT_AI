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

El manifiesto declara `1.1.0` y `version_name=1.1.0-rc.1 (validación pendiente)`. La API conserva la versión de contrato `1.0`. No hay publicación de esta candidata.

## Perfiles y validación en v1.1

`profiles.py` mantiene perfiles y selección activa en una base local independiente de las notas. `prompt.py` recibe el perfil como parámetro; no contiene la identidad predeterminada. `validation.py` comprueba idioma, mezcla reconocible, eco y repetición con un registro temporal acotado de borradores. La revisión semántica del modelo sigue comprobando pertinencia, perspectiva y hechos respaldados.

Se añaden `/api/profiles` (GET, POST), `/api/profiles/{id}` (PUT, DELETE), `/api/profiles/{id}/activate` (POST) y `/api/profiles/restore` (POST). Las sugerencias aceptan y devuelven `configured_mode` y `generation_trigger` con valores predeterminados compatibles con clientes anteriores. Consultar [validación](V1_1_VALIDATION.md) para límites y pruebas.
