# PERSONAL_CHAT_AI

Asistente local para preparar y revisar borradores de respuesta a conversaciones de Stripchat. La generación usa un modelo servido por LM Studio en el mismo equipo. La persona revisa, edita, copia y envía cada mensaje; la extensión no lo envía.

> **Estado:** `v1.1.0-rc.1`, candidata a revisión en `develop`; no es una versión estable. La validación real en Chrome/Stripchat y LM Studio está pendiente. Backend local en `127.0.0.1:8765`, sin cambios en los puertos ni en el contrato API v1 existente.

Las correcciones posteriores a las pruebas manuales añaden controles de evidencia, copia parcial, repetición y reparación de traducciones. Las pruebas reales todavía presentan rechazos intermitentes y matices de traducción que requieren revisión humana. Consulta el [informe de los cuatro casos](docs/RC1_REAL_CASES.md); no se considera todavía una candidata completamente fiable.

## Qué ofrece

- Modos Automático, Manual y Desactivado.
- Identificación de chat, alias y dirección de mensajes mediante selectores DOM configurables y comprobables.
- Contexto reciente de mensajes entrantes y propios disponible en el DOM activo.
- Una respuesta original en el idioma detectado del último mensaje entrante y una traducción secundaria al español cuando corresponde.
- Notas locales por alias y archivos Markdown para preferencias de tono y estilo.
- Perfiles editables y persistentes; ChubbyKriz como predeterminado configurable.
- Edición y copia de la respuesta original; la traducción se muestra por separado.
- Procesamiento local mediante el backend FastAPI y LM Studio; no incluye envío automático.

La cobertura automatizada confirma lógica con datos sintéticos y clientes simulados. La detección DOM en una sesión real de Chrome/Stripchat y la calidad de generación/traducción con un modelo real deben comprobarse por separado.

## Tecnologías

- Python 3.11 o posterior, FastAPI, Uvicorn y HTTPX (versiones fijadas en `requirements.txt`).
- SQLite, incluido en Python, para las notas que el usuario guarda explícitamente.
- JavaScript, CSS y extensión Chrome Manifest V3.
- LM Studio con una API local compatible con Chat Completions.
- Pytest y Node.js para las pruebas automatizadas.

## Arquitectura

```text
Stripchat (DOM activo)
  → extensión Chrome
  → backend local FastAPI en 127.0.0.1:8765
  → LM Studio local en 127.0.0.1:1234/v1
  → respuesta original
  → traducción y revisión al español, si corresponde
  → panel flotante
```

El detalle de componentes y endpoints está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requisitos

- Windows 11, Chrome y Python 3.11 o posterior.
- LM Studio instalado, con un modelo de chat descargado y cargado por el usuario.
- Espacio de disco y memoria suficientes para ese modelo. No se fija un requisito universal de hardware: depende del tamaño y cuantización del modelo elegido.
- Node.js solo si se ejecutan las pruebas JavaScript.

No se incluyen ni descargan modelos. Revisa la licencia del modelo elegido antes de usarlo o distribuir el producto.

## Instalación en Windows

1. Descarga o clona el repositorio en una carpeta de usuario.
2. Abre PowerShell en la raíz y crea el entorno:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

3. En LM Studio, carga un modelo y activa el servidor local compatible con OpenAI en `http://127.0.0.1:1234/v1`.
4. Inicia el backend:

   ```powershell
   python -m backend
   ```

5. Comprueba `http://127.0.0.1:8765/api/health` y `http://127.0.0.1:8765/api/diagnostics/lm-studio`.
6. En Chrome abre `chrome://extensions`, activa **Modo de desarrollador**, elige **Cargar extensión sin empaquetar** y selecciona `extension/`.
7. Abre o recarga Stripchat. Consulta la [guía de instalación](docs/INSTALLATION.md) para instrucciones y solución de problemas.

Mantén `BACKEND_HOST=127.0.0.1`. El backend rechaza cualquier otro valor y esta versión no soporta acceso remoto. La API local no tiene autenticación; protege el equipo y ejecuta solo software local de confianza.

## Primer uso

- **Automático:** valida los selectores en el chat actual. Tras sincronizar, puede preparar una respuesta para el último mensaje entrante visible y aún no procesado; los mensajes nuevos pueden activar otra generación.
- **Manual:** pega o selecciona un mensaje, añade contexto etiquetado si hace falta y pulsa **Generar respuesta**.
- **Desactivado:** no solicita nuevas sugerencias automáticamente.

El chat debe estar identificado para usar la memoria asociada a su alias. El modelo solo recibe el contexto presente en el DOM y los datos manuales de esa solicitud. No equivale al historial completo del sitio. Revisa siempre la respuesta antes de copiarla y enviarla. La [guía de usuario](docs/USER_GUIDE.md) explica los controles.

## LM Studio y configuración

Los valores reales y sus límites están en `.env.example` y `backend/config.py`. Los principales son:

| Variable | Valor de ejemplo | Uso |
|---|---:|---|
| `BACKEND_HOST` | `127.0.0.1` | Interfaz local del backend. Mantener loopback. |
| `BACKEND_PORT` | `8765` | Puerto del backend local. |
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | API local de LM Studio. |
| `LM_STUDIO_MODEL` | vacío | Si está vacío se utiliza el primer modelo anunciado. |
| `LM_STUDIO_TIMEOUT` | `90` | Tiempo máximo por petición al modelo. |
| `LM_STUDIO_CONTEXT_TOKENS` | `8192` | Presupuesto de contexto configurado para el modelo. |
| `LM_STUDIO_OUTPUT_TOKENS` | `1200` | Reserva estimada de salida. |
| `DEFAULT_LANGUAGE` | `es` | Idioma de respaldo si el mensaje no se clasifica. |

La app estima tokens sin conocer el tokenizador ni la ventana real del modelo. Ajusta los presupuestos de acuerdo con la configuración de LM Studio. Consulta [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Idioma y traducción

La respuesta original se genera primero. Si su idioma no es español, el backend solicita una traducción independiente y revisa el idioma y la fidelidad. Si falla la traducción, conserva el original y permite reintentar solo esa traducción. Hay un reintento interno acotado, pero los resultados automatizados usan modelos simulados: los fallos intermitentes observados no se deben considerar resueltos hasta probar con LM Studio real.

Se prioriza el idioma del mensaje entrante objetivo. Para mensajes ambiguos se usan mensajes entrantes recientes y, finalmente, `DEFAULT_LANGUAGE`. Los controles locales rechazan idiomas incorrectos, mezclas reconocibles y repeticiones; permiten un solo reintento de generación. El detector es heurístico: expresiones desconocidas pueden escapar a sus controles o rechazarse por ambigüedad.

## Personalidades

En el panel abre **Personalidad**. Selecciona un perfil y pulsa **Activar**. Con **Nuevo** puedes definir nombre, descripción, tono, estilo y reglas; pulsa **Guardar perfil** y después **Activar**. También puedes editar o eliminar perfiles personalizados. **Restaurar predeterminado** restaura y activa ChubbyKriz conservando tus perfiles personalizados.

Los perfiles se guardan en `personalities.sqlite3`, junto a la base de notas configurada (por defecto en `data/`). La selección activa se comparte entre las pestañas que usan ese backend; pulsa **Actualizar** para reflejar cambios realizados en otra pestaña. Los archivos `knowledge/local/` se conservan como fuentes complementarias: el perfil elegido determina la voz, y ninguna preferencia puede sustituir las reglas de idioma, perspectiva o veracidad.

## Contexto, memoria y privacidad

- El contexto de chat se procesa para la solicitud y no se guarda automáticamente en SQLite.
- Los últimos cinco borradores de hasta 128 conversaciones se mantienen en RAM para evitar repeticiones. Se eliminan al reiniciar el backend; eliminar la memoria de un alias también retira sus borradores temporales.
- Solo las notas que el usuario guarda explícitamente se almacenan en `data/personal_chat_ai.sqlite3`, separadas por una clave derivada del alias.
- Los archivos de personalización se leen desde `knowledge/local/`; la carpeta está excluida de Git. Los archivos versionados de `knowledge/` son valores genéricos.
- La extensión conserva claves de mensajes procesados para deduplicar el modo Automático.
- El código usa LM Studio local; no integra servicios remotos. El equipo, Chrome, LM Studio, los modelos descargados y otros procesos locales quedan fuera de esa garantía.

La [política de privacidad](docs/PRIVACY.md) y la [auditoría de seguridad](docs/SECURITY.md) describen límites y hallazgos. No se afirma que el producto sea completamente seguro.

## Limitaciones conocidas

- Stripchat puede cambiar su DOM; la validación real de selectores requiere una sesión abierta.
- El historial está limitado a filas que Stripchat mantiene en el DOM, al tamaño elegido y al presupuesto del modelo.
- El idioma, la naturalidad, los roles conversacionales y la traducción dependen del modelo y requieren revisión humana.
- No hay instalador, paquete de extensión para Chrome Web Store, actualizador ni gestión de modelos.
- El backend no autentica llamadas locales; el acceso se limita a loopback y no hay soporte remoto.
- La publicación está pendiente de migrar las referencias antiguas del repositorio público con autorización y completar la validación manual en Chrome/Stripchat y la generación real con LM Studio. Las pruebas HTTP/ASGI pasaron en un entorno aislado compatible; ver [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Pruebas

Desde PowerShell en la raíz:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
node --test tests/*.cjs
node --check extension/content.js
node --check extension/suggestion-flow.js
Get-Content extension/manifest.json -Raw | ConvertFrom-Json | Out-Null
git diff --check
```

Las pruebas no verifican una sesión real de Stripchat ni la salida de un modelo LM Studio real. La ejecución de esta auditoría y sus límites están documentados en [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).

## Licencia y uso

La licencia está **pendiente de decisión del propietario**. El archivo `LICENSE` no concede actualmente una licencia de código abierto ni permiso general de redistribución o comercialización. Las licencias de los modelos y de LM Studio dependen de sus proveedores y de la configuración elegida; no se distribuyen con este repositorio. Consulta [docs/SECURITY.md](docs/SECURITY.md) y solicita asesoría profesional para obligaciones legales, privacidad, contenido adulto y términos de las plataformas.

## Estado y hoja de ruta

La candidata `v1.1.0-rc.1` requiere las pruebas manuales de [docs/V1_1_VALIDATION.md](docs/V1_1_VALIDATION.md). Las notas están en [RELEASE_NOTES.md](RELEASE_NOTES.md) y el historial en [CHANGELOG.md](CHANGELOG.md).
