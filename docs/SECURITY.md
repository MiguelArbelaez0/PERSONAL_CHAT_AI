# Seguridad — PERSONAL_CHAT_AI v1.2.0

La versión estable v1.2.0 está publicada en [GitHub Releases](https://github.com/MiguelArbelaez0/PERSONAL_CHAT_AI/releases/tag/v1.2.0). Esta nota describe los controles y límites conocidos; no constituye una certificación de seguridad ni una evaluación externa.

## Límites de red y navegador

- FastAPI solo acepta `BACKEND_HOST=127.0.0.1`. Un valor externo o ambiguo se rechaza. El puerto predeterminado es 8000; el acceso remoto no está soportado.
- La extensión declara `storage` y `clipboardWrite`, acceso HTTP al loopback y scripts de contenido para Stripchat. No declara permisos para cookies, historial o credenciales.
- CORS permite HTTPS de `stripchat.com` y sus subdominios, además de orígenes `chrome-extension://` con formato de ID de Chrome. Los métodos y encabezados autorizados incluyen el JSON de la API y `Idempotency-Key` para recuperar de forma segura creaciones de cuenta.
- CORS no es autenticación. La API local no implementa autenticación y otros procesos locales pueden intentar acceder al puerto. Mantén el equipo y los procesos locales bajo control.
- La configuración de LM Studio valida HTTP local y no admite credenciales dentro de la URL.

## Datos y almacenamiento

- `.gitignore` excluye `.env` y variantes, `/data/`, SQLite, entornos virtuales, cachés y `knowledge/local/`. `.env.example` es plantilla pública sin credenciales.
- Las cuentas, perfiles y notas se guardan en SQLite local, sin cifrado de base de datos. Las notas se separan por UUID de cuenta y visitante.
- El historial visible se envía al backend y al LM Studio configurado para generar la respuesta; no se guarda automáticamente como memoria. No registres el contenido completo de conversaciones.
- La identidad se infiere de elementos visibles del DOM y requiere confirmación. No se leen cookies, tokens ni contraseñas.
- La migración v1.1 es explícita; el arranque normal no importa datos ni asigna memorias a cuentas nuevas.

## Verificaciones registradas para la publicación v1.2.0

La documentación de publicación registra pruebas automatizadas para host loopback, permisos del manifiesto, CORS, validación de entradas e aislamiento por cuenta, además de una ejecución de Gitleaks sobre la historia y los cambios de publicación. Son resultados de aquella auditoría, no comprobaciones ejecutadas al actualizar este documento. Las pruebas no sustituyen una evaluación externa ni la revisión de los objetos públicos históricos.

La historia anterior de v1.1 contiene referencias documentales a un nombre artístico usado en esa versión. El empaquetador local [tools/build_distribution.py](../tools/build_distribution.py) utiliza una lista explícita de documentación pública para su ZIP; eso no sanea el historial Git ni elimina forks, cachés o copias externas.

## Uso seguro

- No publiques `.env`, `data/`, `knowledge/local/`, respaldos, exportaciones de chat ni diagnósticos con identificadores.
- No cambies el host a una interfaz de red ni expongas LM Studio.
- Revisa las sugerencias antes de copiarlas. PERSONAL_CHAT_AI no envía mensajes automáticamente.
