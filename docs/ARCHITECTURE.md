# Arquitectura

## Componentes

```text
Stripchat en Chrome
  └─ extensión Manifest V3 (extension/)
       └─ API HTTP local en 127.0.0.1:8000 por defecto (backend/)
            ├─ cliente compatible con Chat Completions
            │    └─ LM Studio en el equipo
            ├─ cuentas locales y perfiles configurados por la modelo
            └─ SQLite local: cuentas, perfiles y notas guardadas explícitamente (data/)
```

La extensión detecta señales visibles de la cuenta autenticada y solicita confirmación humana. Cada modelo tiene una cuenta local con UUID estable y perfiles configurables. El backend recibe el UUID en operaciones de perfil, memoria y generación; las notas se consultan por pareja UUID de cuenta y alias de visitante. El prompt usa el perfil confirmado y el contexto permitido. Cuando corresponde, se solicita traducción al español. La persona revisa, edita y copia la respuesta; la aplicación no envía mensajes a Stripchat.

## Límites de confianza y datos

- La extensión declara permisos de almacenamiento y escritura al portapapeles, con acceso HTTP limitado al loopback `127.0.0.1` (todos sus puertos) y scripts de contenido en los dominios configurados de Stripchat. El backend predeterminado escucha en `127.0.0.1:8000`; el puerto se puede configurar localmente.
- El backend utiliza FastAPI y SQLite. Las notas solo se guardan mediante operaciones explícitas; el historial de conversación no se persiste intencionalmente.
- La identidad visual no es una clave: el nombre artístico no es único. Una señal DOM por nombre requiere confirmación y no fusiona cuentas.
- La primera instalación no crea perfiles ni memorias personales. La generación exige cuenta confirmada y perfil completo.
- Los reintentos de creación de cuenta usan una clave idempotente aleatoria asociada a la solicitud confirmada. No reutiliza cuentas por coincidencia de nombre.
- El cliente LM Studio usa un servicio HTTP local compatible con Chat Completions. La ruta y el modelo se configuran en el entorno.
- Los selectores del sitio pueden cambiar y deben validarse en Chrome tras cambios de Stripchat.

## Bloqueo de exposición de red

El backend solo inicia con `BACKEND_HOST=127.0.0.1`; valores externos o ambiguos se rechazan. El acceso remoto no está soportado en esta versión. La API no implementa autenticación y confía en el sistema local y en sus controles de origen CORS. Consulta [SECURITY.md](SECURITY.md).

## Versiones

El manifiesto y FastAPI declaran `1.2.0`. La versión estable v1.2.0 está publicada en [GitHub Releases](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0); v1.1.0 es la versión estable anterior. La API conserva el contrato `1.0` para las solicitudes existentes.

## Cuentas y perfiles en v1.2

`profiles.py` mantiene `model_accounts`, perfiles versionados, selección activa por cuenta y claves idempotentes de creación. `memory.py` particiona notas por `account_id` y clave normalizada de visitante. El estado global de perfil activo no determina la identidad de generación. La API `/api/accounts` expone resúmenes de configuración para el selector; el contenido de perfil y memoria requiere rutas con el UUID.

El onboarding de ocho pasos guarda progreso local por UUID y crea o actualiza un perfil conforme a los contratos `/api/accounts/{id}/profiles`. La selección de cuentas existentes es explícita cuando solo hay coincidencia de nombre. Las rutas `/api/profiles` permanecen como compatibilidad v1.1 y solo resuelven implícitamente cuando existe exactamente una cuenta.

La migración desde v1.1 está separada del arranque normal. Copia los registros antiguos a un área heredada de la nueva base y conserva las fuentes; no asigna automáticamente datos históricos a una cuenta nueva. Revisa [almacenamiento de cuentas](ACCOUNT_PROFILE_STORAGE_V1_2.md) y [onboarding e identidad](IDENTITY_ONBOARDING_V1_2.md) para contratos y límites.
