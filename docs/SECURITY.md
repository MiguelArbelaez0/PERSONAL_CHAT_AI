# Seguridad

Verificación integral vigente: [STABILIZATION_2026_10_21.md](STABILIZATION_2026_10_21.md). Se añadió límite de cuerpo HTTP de 256 KiB, comprobado también con fragmentos sin Content-Length, y rechazo de identidades contradictorias. No se añadió autenticación ni límite global de frecuencia. Los informes LM Studio compartibles son sintéticos y omiten tokens efímeros. Los apartados históricos no certifican el estado de referencias remotas actuales.

## Alcance auditado

La revisión de esta instantánea cubre permisos del manifiesto, configuración del servidor, cliente LM Studio, rutas de API, archivos incluidos y exclusiones. El escaneo Gitleaks anterior del repositorio fuente no encontró credenciales conocidas. Esta instantánea excluye `.env`, SQLite, `knowledge/local/`, cachés, entornos virtuales e informes internos. Esto reduce el riesgo detectado, pero no garantiza que un secreto desconocido no exista.

## Hallazgos que bloquean publicación

### Límite de servidor incluido en esta instantánea

`backend/config.py` rechaza cualquier `BACKEND_HOST` distinto de `127.0.0.1`; Uvicorn recibe únicamente esa dirección. La API no implementa autenticación y el acceso remoto no está soportado. Las pruebas comprueban configuraciones externas y ambiguas.

### Repositorio de desarrollo anterior

Esta instantánea no incluye la historia Git del repositorio de desarrollo. El remoto de origen conserva referencias activas anteriores y no se ha alterado. La migración requiere aprobación explícita y las copias, forks, cachés u objetos no referenciados de terceros pueden persistir.

## Protecciones observadas

- `.gitignore` excluye `.env`, variantes `.env.*` salvo `.env.example`, `/data/`, SQLite, entornos virtuales, cachés y `knowledge/local/`.
- El manifiesto limita permisos de extensión a almacenamiento y portapapeles; su host de backend apunta a loopback.
- CORS permite orígenes HTTPS de `stripchat.com` y subdominios, además de IDs con formato de Chrome extension. La política no es autenticación y no limita clientes que no sean navegador; el enlace de loopback proporciona el límite local en esta versión.
- La URL de LM Studio se valida como HTTP local en la configuración inspeccionada.
- Los diagnósticos de backend tienen desactivado el registro de acceso de Uvicorn en su lanzador.
- La extensión prepara respuestas y no automatiza el envío a Stripchat.

## Recomendaciones operativas

- Mantener `BACKEND_HOST=127.0.0.1`.
- No publicar `.env`, `data/`, `knowledge/local/`, exportaciones de conversaciones, registros o capturas con datos identificables.
- Revisar permisos y exposición de red antes de cada distribución.
- No incluir credenciales de LM Studio u otros servicios en el repositorio.
- Elegir una licencia solo mediante decisión explícita del titular; [LICENSE](../LICENSE) indica que sigue pendiente.
