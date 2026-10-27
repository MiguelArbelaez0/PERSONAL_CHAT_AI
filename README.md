# PERSONAL_CHAT_AI

Asistente local para preparar y revisar borradores de respuesta a conversaciones de Stripchat. La generación usa un modelo servido por LM Studio en el mismo equipo. La persona revisa, edita, copia y envía cada mensaje; la extensión no lo envía.

> **Versión estable:** `v1.2.0`. PERSONAL_CHAT_AI inicia sin identidad ni perfil personal precargados. Consulta las [notas de la versión](docs/RELEASE_NOTES_V1_2.md) y las [limitaciones conocidas](docs/KNOWN_ISSUES_V1_2.md). Backend local predeterminado `127.0.0.1:8000` (configurable), LM Studio `127.0.0.1:1234/v1`.

Las sugerencias, traducciones y detección DOM pueden fallar y requieren revisión humana.

## Qué ofrece

- Modos Automático, Manual y Desactivado.
- Identificación de chat, alias y dirección de mensajes mediante selectores DOM configurables y comprobables.
- Contexto reciente de mensajes entrantes y propios disponible en el DOM activo.
- Una respuesta original en el idioma detectado del último mensaje entrante y una traducción secundaria al español cuando corresponde.
- Cuentas locales independientes por modelo de Stripchat y perfiles personalizados sin valores personales predeterminados.
- Onboarding obligatorio de ocho pasos para identidad, personalidad, intereses, preferencias, estilo, idiomas y límites.
- Notas de memoria separadas por cuenta de modelo y visitante.
- Edición y copia de la respuesta original; la traducción se muestra por separado.
- Procesamiento local mediante el backend FastAPI y LM Studio; no incluye envío automático.

Las pruebas automatizadas usan datos sintéticos y clientes simulados. En la comprobación manual reportada por la usuaria se confirmó la detección del nombre artístico, el onboarding completo, la persistencia, la generación mediante LM Studio y el envío manual sin publicación automática. La cobertura de tests no sustituye esa comprobación en Chrome/Stripchat.

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
  → backend local FastAPI en 127.0.0.1:8000
  → LM Studio local en 127.0.0.1:1234/v1
  → respuesta original
  → traducción y revisión al español, si corresponde
  → panel flotante
```

El detalle de componentes y endpoints está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
La configuración y migración de puertos está descrita en [docs/LOCAL_BACKEND_CONNECTION.md](docs/LOCAL_BACKEND_CONNECTION.md).

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
   python -m pip install -r requirements-dev.txt
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

3. En LM Studio, carga `qwen/qwen3-4b-2507` y activa el servidor local compatible con OpenAI en `http://127.0.0.1:1234/v1`. Configura `LM_STUDIO_MODEL=qwen/qwen3-4b-2507` en tu `.env` sin reemplazar otros valores privados.
4. Inicia el backend:

   ```powershell
   python -m backend
   ```

5. Comprueba `http://127.0.0.1:8000/api/health` y `http://127.0.0.1:8000/api/diagnostics/lm-studio`.
6. En Chrome abre `chrome://extensions`, activa **Modo de desarrollador**, elige **Cargar extensión sin empaquetar** y selecciona `extension/`.
7. Abre o recarga Stripchat. Consulta la [guía de instalación](docs/INSTALLATION.md) para instrucciones y solución de problemas.

Mantén `BACKEND_HOST=127.0.0.1`. El backend rechaza cualquier otro valor y esta versión no soporta acceso remoto. La API local no tiene autenticación; protege el equipo y ejecuta solo software local de confianza.

## Primer uso

- **Automático:** valida los selectores en el chat actual. Tras sincronizar, puede preparar una respuesta para el último mensaje entrante visible y aún no procesado; los mensajes nuevos pueden activar otra generación.
- **Manual:** pega o selecciona un mensaje, añade contexto etiquetado si hace falta y pulsa **Generar respuesta**.
- **Desactivado:** no solicita nuevas sugerencias automáticamente.

En la primera instalación, confirma el nombre detectado o escríbelo manualmente y completa el onboarding. Las cuentas existentes se eligen explícitamente; un nombre coincidente nunca fusiona ni identifica cuentas por sí solo. El modelo solo recibe el contexto visible en el DOM, las preferencias de la cuenta seleccionada y las notas del par cuenta/visitante; no equivale al historial completo del sitio. Revisa cada respuesta antes de copiarla y enviarla. Consulta la [guía de usuario](docs/USER_GUIDE.md).

## LM Studio y configuración

Los valores reales y sus límites están en `.env.example` y `backend/config.py`. Los principales son:

| Variable | Valor de ejemplo | Uso |
|---|---:|---|
| `BACKEND_HOST` | `127.0.0.1` | Interfaz local del backend. Mantener loopback. |
| `BACKEND_PORT` | `8000` | Puerto del backend local. La extensión acepta otros puertos de `127.0.0.1` con permiso declarado. |
| `LM_STUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | API local de LM Studio. |
| `LM_STUDIO_MODEL` | vacío | Si está vacío se utiliza el primer modelo anunciado. |
| `LM_STUDIO_TIMEOUT` | `90` | Tiempo máximo por petición al modelo. |
| `LM_STUDIO_CONTEXT_TOKENS` | `8192` | Presupuesto de contexto configurado para el modelo. |
| `LM_STUDIO_OUTPUT_TOKENS` | `1200` | Reserva estimada de salida. |
| `DEFAULT_LANGUAGE` | `es` | Idioma de respaldo si el mensaje no se clasifica. |
| `PCAI_DATABASE_PATH` | `data/personal_chat_ai_v2.sqlite3` | Base de cuentas, perfiles y notas de v1.2. |
| `DATABASE_PATH` | `data/personal_chat_ai.sqlite3` | Fuente antigua v1.1 usada solo por la herramienta de migración explícita. |

La app estima tokens sin conocer el tokenizador ni la ventana real del modelo. Ajusta los presupuestos de acuerdo con la configuración de LM Studio. Consulta [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Idioma y traducción

La respuesta original se genera primero. Si su idioma no es español, el backend solicita una traducción independiente y revisa el idioma y la fidelidad. Si falla la traducción, conserva el original y permite reintentar solo esa traducción. Hay un reintento interno acotado. La prueba real sintética y las limitaciones operativas se resumen en [limitaciones conocidas](docs/KNOWN_ISSUES_V1_2.md); revisa cada borrador en la instalación y con el modelo que utilices.

Se prioriza el idioma del mensaje entrante objetivo. Para mensajes ambiguos se usan mensajes entrantes recientes y, finalmente, `DEFAULT_LANGUAGE`. Los controles locales rechazan idiomas incorrectos, mezclas reconocibles y repeticiones; permiten un solo reintento de generación. El detector es heurístico: expresiones desconocidas pueden escapar a sus controles o rechazarse por ambigüedad.

## Identidad, cuentas y preferencias

El asistente detecta señales visibles de identidad en Stripchat y siempre solicita confirmación. Si no puede verificar una señal, la modelo puede escribir su nombre. La cuenta local usa un UUID independiente del nombre artístico. En nombres repetidos, el selector muestra fecha, estado e ID abreviado y requiere una elección explícita. Crear otra cuenta con nombre repetido requiere confirmación; no se fusionan datos.

El onboarding configura personalidad, intereses, preferencias de interacción, longitud, tono, emojis, idiomas y límites personales. La generación permanece bloqueada hasta que FastAPI confirme que la cuenta está lista. Después, **Mi asistente** permite editar el perfil. La base local predeterminada es `data/personal_chat_ai_v2.sqlite3`; guarda cuentas, perfiles y notas. Las notas se filtran por cuenta y visitante. La migración v1.1 requiere una acción explícita y conserva las bases fuente; el inicio normal no importa datos automáticamente.

## Contexto, memoria y privacidad

- El contexto de chat se procesa para la solicitud y no se guarda automáticamente en SQLite.
- Los últimos cinco borradores de hasta 128 conversaciones se mantienen en RAM para evitar repeticiones. Se eliminan al reiniciar el backend; eliminar la memoria de un alias también retira sus borradores temporales.
- Solo las notas que el usuario guarda explícitamente se almacenan localmente, con separación por UUID de cuenta y clave derivada del alias del visitante.
- Los archivos de conocimiento opcionales se leen desde `knowledge/local/`; la carpeta está excluida de Git. Ningún archivo local sustituye la cuenta ni sus preferencias configuradas.
- La extensión conserva claves de mensajes procesados para deduplicar el modo Automático.
- El código usa LM Studio local; no integra servicios remotos. El equipo, Chrome, LM Studio, los modelos descargados y otros procesos locales quedan fuera de esa garantía.

La [política de privacidad](docs/PRIVACY.md) y la [revisión de seguridad](docs/SECURITY.md) describen límites y hallazgos. No se afirma que el producto sea completamente seguro.

## Limitaciones conocidas

- Stripchat puede cambiar su DOM; la validación real de selectores requiere una sesión abierta.
- El historial está limitado a filas que Stripchat mantiene en el DOM, al tamaño elegido y al presupuesto del modelo.
- El idioma, la naturalidad, los roles conversacionales y la traducción dependen del modelo y requieren revisión humana.
- No hay instalador firmado/MSI, paquete publicado en Chrome Web Store, actualizador automático ni gestión de modelos.
- El backend no autentica llamadas locales; el acceso se limita a loopback y no hay soporte remoto.
- La publicación requiere cerrar la revisión de cambios y privacidad del historial Git. La comprobación manual de Chrome/Stripchat fue reportada por la usuaria; las pruebas automatizadas no equivalen a esa sesión.

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

Las pruebas automatizadas no verifican el flujo completo en una sesión real de Stripchat. La usuaria confirmó manualmente ese flujo en Chrome; la generación sintética real con LM Studio y las limitaciones restantes se describen en [limitaciones conocidas](docs/KNOWN_ISSUES_V1_2.md).

## Licencia y uso

El código original está bajo [licencia MIT](LICENSE), Copyright (c) 2026 Miguel Arbeláez Vallejo, por autorización expresa del titular. Las dependencias mantienen sus propias licencias; consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No se incluyen LM Studio ni los pesos Qwen.

## Estado y hoja de ruta

La [Release estable v1.2.0](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0) está publicada en GitHub. Las [limitaciones conocidas](docs/KNOWN_ISSUES_V1_2.md) describen las condiciones operativas; el [CHANGELOG](CHANGELOG.md) conserva los registros históricos de desarrollo y publicación anteriores.
