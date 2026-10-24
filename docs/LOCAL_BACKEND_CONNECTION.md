# Conexión con el backend local

En v1.2.0, la URL predeterminada del backend es `http://127.0.0.1:8000`. FastAPI y la extensión utilizan ese valor. `BACKEND_PORT` sigue siendo configurable; el lanzador de Windows lee el puerto efectivo de la configuración antes de comprobar o iniciar el servidor.

La extensión de Chrome acepta solo URL HTTP en `127.0.0.1`. El permiso Manifest V3 `http://127.0.0.1/*` cubre todos los puertos de esa dirección. Antes de guardar una URL, la extensión verifica que esté cubierta por el manifiesto. Rechaza otros hosts, HTTPS, credenciales incrustadas, rutas, consultas y fragmentos.

Las versiones anteriores usaban `http://127.0.0.1:8765` como valor predeterminado de la extensión. Al iniciar, la extensión migra ese valor antiguo (y sus variantes locales previas) al puerto 8000 actualizando únicamente la preferencia `backendUrl` de Chrome. Conserva los demás valores de `chrome.storage.local` y cualquier puerto local personalizado. No borra una URL guardada que sea inválida; usa el valor predeterminado hasta que se guarde una URL válida.

El código confirma que `backendUrl` se lee y escribe en `chrome.storage.local`, pero no permite conocer el valor guardado en un perfil instalado concreto. La migración gestiona el valor predeterminado anterior sin inspeccionar ni borrar las demás preferencias del navegador.

Al iniciar el backend actualizado, `GET /api/health` debe indicar `"port": 8000` cuando se use el puerto predeterminado. Si el servicio responde en 8000 pero informa 8765, reinícialo para que cargue la configuración actual. No hace falta editar `.env` si ya configura el puerto correcto.
