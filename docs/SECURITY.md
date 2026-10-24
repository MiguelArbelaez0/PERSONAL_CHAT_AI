# Seguridad — v1.2.0 en auditoría

v1.2.0 aún no está publicada. Esta nota describe la configuración de la rama auditada; no es una certificación de seguridad.

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

## Verificaciones de esta auditoría

Las pruebas automatizadas comprueban host loopback, permisos del manifiesto, CORS, validación de entradas e aislamiento por cuenta. Gitleaks se ejecutó sobre la historia y los cambios que se incluirían en la revisión; consulta el informe de auditoría v1.2.0 para el resultado exacto. Las pruebas no sustituyen una evaluación externa ni la revisión de los objetos públicos históricos.

La historia anterior de v1.1 contiene referencias documentales a un nombre artístico usado en esa versión. El paquete v1.2 debe incluir solo la documentación pública revisada. Esta auditoría no reescribe la historia Git ni declara que copias externas hayan sido eliminadas.

## Uso seguro

- No publiques `.env`, `data/`, `knowledge/local/`, respaldos, exportaciones de chat ni diagnósticos con identificadores.
- No cambies el host a una interfaz de red ni expongas LM Studio.
- Revisa las sugerencias antes de copiarlas. PERSONAL_CHAT_AI no envía mensajes automáticamente.
