# Finalización v1.1.0 — 22 de octubre de 2026

> **Informe histórico previo a la Release v1.2.0.** Las autorizaciones y condiciones de publicación descritas aquí reflejan el estado de trabajo del 22 de octubre de 2026 y no el estado actual del repositorio.

> Actualización posterior a 3ed11fc: véase [cierre de los tres bloqueos](CLOSURE_THREE_BLOCKERS_2026_10_22.md). Allí se documentan correcciones, nuevas regresiones, reintentos portugueses reales y arranque HTTP aislado sin detener 8765. Las decisiones inferiores pertenecen a la etapa anterior.

Trabajo autorizado en develop, preservando el historial, main y todos los datos. Este informe sustituye el estado de la auditoría previa; los informes anteriores siguen siendo evidencia histórica. La autorización de publicación es condicional a resolver bloqueos críticos y validar el paquete.

## Licencia aprobada

El titular autorizó expresamente MIT, Copyright (c) 2026 Miguel Arbeláez Vallejo. LICENSE contiene el texto oficial estándar; THIRD_PARTY_NOTICES.md documenta las licencias declaradas de los componentes instalables. No se relicencian paquetes de terceros, LM Studio o Qwen, ni se incluyen sus binarios/pesos en el ZIP.

## Dependencias

Actualización limitada: FastAPI 0.115.12 → 0.161.1, Starlette 0.46.2 → 1.3.1 y pytest 8.3.5 → 9.0.3. Uvicorn 0.34.2 y HTTPX 0.28.1 se conservan. Pytest pasa a requirements-dev.txt; el servidor solo requiere requirements.txt. constraints.txt fija la resolución probada para evitar instalaciones transitivas distintas. FastAPI 0.161.1 declara starlette>=0.46.0, compatible con 1.3.1; las suites y API verifican la combinación realmente instalada en un entorno aislado nuevo. No se modifica el modelo ni los puertos.

| Aviso deduplicado | Ámbito anterior | Uso vulnerable en la aplicación | Versión corregida indicada | Instalado validado |
|---|---|---|---|---|
| PYSEC-2026-1845 / CVE-2025-71176 | pytest, desarrollo; temporales UNIX | Pruebas; equipo validado Windows | 9.0.3 | pytest 9.0.3 |
| PYSEC-2026-1941 / CVE-2025-54121 | Starlette, producción; multipart | Sin formularios/UploadFile; límite 256 KiB | 0.47.2 | Starlette 1.3.1 |
| PYSEC-2026-1942 / CVE-2025-62727 | Starlette; FileResponse Range | Sin FileResponse/StaticFiles | 0.49.1 | Starlette 1.3.1 |
| PYSEC-2026-161 / CVE-2026-48710 | Starlette; Host reconstruido | No hay autorización basada en request.url | 1.0.1 | Starlette 1.3.1 |
| PYSEC-2026-2281 / CVE-2026-48818 | Starlette; StaticFiles Windows/UNC | No se usa StaticFiles | 1.1.0 | Starlette 1.3.1 |
| PYSEC-2026-2280 / CVE-2026-48817 | Starlette; HTTPEndpoint | No hay subclases HTTPEndpoint ni despacho libre | 1.1.0 | Starlette 1.3.1 |
| PYSEC-2026-248 / CVE-2026-54282 | Starlette; URL de path malformado | No se confía en request.url para autorización | 1.3.0 | Starlette 1.3.1 |
| PYSEC-2026-249 / CVE-2026-54283 | Starlette; límites urlencoded | Sin request.form; límite global del cuerpo | 1.3.1 | Starlette 1.3.1 |

pip-audit de requirements-dev.txt, incluidas dependencias de producción y transitivas, no encontró vulnerabilidades conocidas en la resolución validada. Las versiones mínimas indicadas provienen del informe previo conservado; no se reivindica ausencia universal de vulnerabilidades. No se ignoran avisos. pip check correcto. Las antiguas 1110 advertencias FastAPI desaparecen con esta combinación. Python probado: 3.15, Windows; otros sistemas/versiones no se certifican mediante esta ejecución.

## Causas y correcciones conversacionales

- Apelativo dentro de oración: el patrón anterior solo aceptaba fin de frase, no coma, punto y coma o raya tras daddy/sir. Se amplió el límite de vocativo; la reparación elimina solo el apelativo y exige de nuevo controles y revisión completa. Un sustantivo ordinario My daddy no es tratado como vocativo.
- Falso rechazo de Olá! Estou bem, obrigado — e você?: el revisor Qwen declaraba unsupported sin hechos personales. Una gramática cerrada comprueba el mensaje de bienestar entrante y la respuesta portuguesa completa; solo entonces corrige los dos indicadores de contenido si no hay afirmaciones citadas. Contrato, perspectiva, repeticiones, idioma y demás controles siguen vigentes. No se aplica a mensajes con actividades, promesas o contenido añadido.
- I made you laugh → me hayas hecho reír: inversión real del modelo. Se repara únicamente la cláusula explícita Me alegra que me hayas hecho reír cuando el original afirma I'm glad I made you laugh. No se aplica a fuentes condicionales ni al sentido inverso; la traducción reparada requiere revisión de fidelidad y puede seguir rechazándose. El reintento de perspectiva deja de realimentar el candidato erróneo como plantilla.
- Connaître → historia: control acotado de adición en esa expresión, sin cambiar la traducción por una respuesta inventada.
- What's on your mind → qué te pasa ahora: reparación acotada del modismo a qué tienes en mente, siempre revisada; What is wrong conserva su traducción.
- Emoji como prueba de sonrisa observada: se añadió te voir sourire a los controles de actividad con evidencia, sin inferir hechos desde el emoji.
- Análisis contextual vacío: las trazas muestran current_topic: [] en dos reintentos. analysis no tenía contrato de salida estructurada, a diferencia de generación/traducción. Se añadió su esquema con tema no vacío y tipos/límites explícitos. El parser y los validadores continúan rechazando formatos inválidos; no se cambia el caso de prueba ni se rellena con hechos inventados.

## Conservación

Copias SQLite coherentes verificadas antes de trabajar, con comparación lógica y quick_check. Datos originales en data/personalities.sqlite3 y data/personal_chat_ai.sqlite3. No se han importado, reemplazado, borrado ni reinicializado; hashes comprobados antes y después. nombre de prueba y perfil activo originales, memoria por alias, archivos privados y configuración se conservan. Las pruebas crean perfiles/notas únicamente en almacenes temporales o en instalaciones limpias sintéticas.

## Resultados intermedios conservados

Antes del contrato analysis: 285 Python y 71 JavaScript aprobadas, pip check correcto. Benchmark sintético de dos rondas: 15/18 generaciones aceptadas, traducción disponible en 13/13 originales no españoles aceptados; dos rechazos correctos de preferencias inventadas y uno de análisis vacío. Ocho traducciones independientes disponibles. Secuencia de tres rondas con mismo alias: 5/6 aceptadas; último rechazo por repetir borradores previos. No se presentan como resultados del código final posterior al esquema analysis.

Las comprobaciones manuales previas aportadas por el usuario se conservan como evidencia de Chrome (perfiles, persistencia, cuatro idiomas, modos, copia, sin envío automático); no equivalen a una sesión nueva ejecutada por este agente.

## Verificaciones técnicas actuales

290 pruebas Python y 71 JavaScript aprobadas, cero fallos u omisiones. Pruebas de API, memoria, perfiles, traducción, reintentos, modos y copia incluidas en las suites. Sintaxis Python/JavaScript, manifiesto V3 y sus recursos, pip check y diff --check correctos. Las pruebas usan el entorno aislado con las dependencias actualizadas, no se atribuyen esos resultados al backend anterior aún en ejecución.

El instalador de la nueva candidata se ejecutó en una extracción nueva fuera del proyecto y pip check pasó. La comprobación de Uvicorn por socket requiere liberar 8765: la revisión automática de herramientas rechazó detener temporalmente los procesos del backend con blocked by policy, sin más motivo. No se ejecutó la parada, no se rodeó el bloqueo, no se cambió el puerto y no se declara probado ese arranque de red limpio. Se comprueba en cambio la inicialización y persistencia ASGI en la instalación aislada. Antes de una aprobación estable falta la comprobación de arranque/Chrome con el backend actualizado, cerrando manualmente la instancia anterior.

La evaluación intermedia de tres rondas con contrato analysis aceptó 21/23 generaciones y ofreció traducción en 18/18 originales no españoles; los dos rechazos fueron preferencias inventadas de memory/isolation. No hubo más análisis vacíos en esa muestra. No representa una tasa de calidad del 100 %. Se conservan todas las etapas.

La revisión adicional de originales exactos recuperó I made you laugh sin invertir roles, pero detectó otra omisión (te connaître sin objeto en español) y la variante qué te está pasando ahora del modismo. Se añadieron controles/regresiones acotados para esos dos defectos después de esa evaluación intermedia. El reporte de entrega indica por separado los resultados del código posterior.

## Clasificación de riesgos y decisión de publicación

Un 502 que bloquea una preferencia inventada o repetición es recuperable: no expone el borrador, permite reintentar y no daña datos. Se considera una limitación conocida de disponibilidad, no prueba de pérdida de memoria. Una traducción o afirmación incorrecta que pasa controles es un defecto de fiabilidad distinto; la aceptación HTTP no mide su significado. No se promete fidelidad universal por usar el mismo modelo como revisor. Las muestras y su revisión se detallan sin seleccionar solo éxitos.

MIT y los ocho avisos de dependencias quedan resueltos para las versiones auditadas. Permanecen API local sin autenticación, SQLite sin cifrar y falta de límite global de frecuencia como límites operativos documentados; se conserva loopback, CORS acotado, límite de cuerpo y ausencia de envío automático. No se atribuye a Gitleaks una garantía absoluta de ausencia de datos privados.

La integración estable y la Release siguen condicionadas a cerrar las verificaciones de instalación/ejecución pendientes y a revisar los resultados semánticos de entrega. Si no se cumplen, se respalda únicamente develop, sin main, PR, tags ni Release. La versión anterior se conserva en su commit histórico sin crear o mover etiquetas retrospectivas.

## Última corrección y estado de entrega

Una etapa adicional aceptó 12/13 generaciones con traducción 11/11, pero su revisión encontró un fragmento huérfano en isolation: calm and cozy, really. La causa era la reparación por eliminación de una preferencia inventada, que podía conservar solo adjetivos. La reparación inglesa ahora exige un inicio de cláusula o cortesía reconocible antes de someterse a las demás validaciones; no convierte ese fragmento en una respuesta nueva. Regresión añadida. Suite posterior: 291 Python y 71 JavaScript aprobadas. Los resultados del benchmark posterior se registran por separado abajo.

Tres originales exactos probados de nuevo con el código posterior: traducción disponible 3/3. Se conserva I → te en hacer reír; te connaître conserva el objeto en español (requirió dos intentos); el modismo ya no pregunta por un problema personal. Persisten gramática/puntuación española poco naturales, incluida una interrogación mal colocada. Disponibilidad no equivale a estilo profesional ni fidelidad universal.

La instalación limpia aislada con nuevas dependencias pasó inicialización/servicio ASGI, salud, nombre de prueba, creación de perfil sintético, selección y nota, y persistencia en un segundo proceso. Starlette avisa que el uso de httpx por TestClient está deprecado; fue una advertencia, no fallo. No se añadió otra dependencia para ocultarla.

**Decisión: respaldo de develop autorizado; publicación estable detenida.** MIT está aprobada y el escaneo de dependencias está limpio, pero no se ha completado el arranque de red limpio ni Chrome con el backend actualizado. La herramienta rechazó la operación de parada/reinicio requerida. No se ha actualizado ni interrumpido el proceso real; sus módulos cargados no se confunden con el entorno nuevo de validación. No hay autorización para afirmar comprobaciones no ejecutadas. Los defectos semánticos de las etapas intermedias y la variación restante justifican mantener rc.1 y revisar los casos reales tras el reinicio. No se crea PR, no se integra main, no se crean tags ni Release mientras falte esa condición.

## Pasos exactos para desbloquear la entrega

1. Cerrar manualmente el backend anterior con Ctrl+C en su ventana, sin borrar ningún archivo. Mantener las copias privadas verificadas.
2. En el proyecto, ejecutar .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt y después .\.venv\Scripts\python.exe -m pip check. No sobrescribir .env ni data.
3. Con 8765 libre, iniciar la instalación extraída nueva mediante INICIAR_PERSONAL_CHAT_AI.bat y comprobar /api/health y /api/profiles en 127.0.0.1:8765. Validar un perfil/nota sintéticos, reiniciar y comprobar persistencia. Esta carpeta nueva no contiene datos reales.
4. Cerrar esa instancia, iniciar el proyecto original y verificar su perfil activo y memoria originales. Recargar la extensión y la pestaña de Chrome. Repetir los dos mensajes ingleses consecutivos, francés, portugués, español, reintentos, copia y los tres modos, sin envío automático.
5. Revisar matices, participantes, variación y resultados pendientes. Solo si no quedan bloqueos críticos, actualizar marcadores rc a estable, reconstruir un ZIP distinto y ejecutar las comprobaciones finales; revisar diff y los checks de GitHub.
6. Crear PR develop → main, respetar protecciones/aprobaciones, integrar sin force push, verificar main y crear v1.1.0 si no existe. Publicar Release estable con ZIP y SHA256SUMS.txt, descargar el adjunto y comparar hash. No crear ni mover etiquetas de versiones anteriores.

No se ejecutan los pasos 5/6 mientras el estado sea detenido. El hash del respaldo se consulta con git log -1 y origin/develop; no se incluye el hash autorreferente del propio commit en sus archivos.

## Resultado final confirmado — publicación BLOQUEADA

Código final: 291 pruebas Python aprobadas, 71 JavaScript aprobadas; cero fallos/omisiones. pip-audit sin avisos conocidos y pip check correcto para las dependencias nuevas; no se confunde este entorno con el proceso antiguo del backend.

LM Studio, última ejecución completa del código final: **11/13 generaciones aceptadas**, dos rechazadas, **9/10 traducciones disponibles** de originales aceptados no españoles, ocho traducciones independientes disponibles, un reintento portugués manual fallido. Mediana global 5.3615 s, p95 7.895 s; sin fallos de transporte.

Rechazos: french-0 por unsupported_claim del revisor (cortesía francesa no cubierta por la gramática cerrada; falso rechazo persistente); memory por preferencia propia inventada (rechazo correcto). El rechazo francés no se anula generalizando la excepción a cualquier frase.

**Defectos que impiden afirmar estabilidad:**

- ambiguous aceptó Tu as un bon goût pour les choses simples a partir de un emoji, sin evidencia de esa preferencia.
- isolation aceptó I'd say deep blues — calm, steady, and a little mysterious al preguntar Which color do I like? sin notas. La conjetura no está fundamentada. El control de fragmentos elimina un defecto de reparación, pero no resuelve todas las afirmaciones del interlocutor generadas desde cero.
- Causa pendiente: la revisión personal_claims está diseñada principalmente para afirmaciones del propietario y sus citas; no garantiza la comprobación simétrica de preferencias/factos del interlocutor. Qwen puede aprobar su propia conjetura. Solucionarlo requiere atribución verificable de ambas personas, sin usar borradores como evidencia ni permitir que notas de uno respalden hechos del otro. No se declara solucionado por añadir instrucciones al prompt ni por una tasa de aceptación alta.
- Portugués: Obrigado por querer conhecer melhor volvió a traducirse con conocerte mejor en vez de conservar el objeto implícito correspondiente. perspective_mismatch la bloqueó en dos intentos y otros dos manuales; el original se preservó. Fallo recuperable de disponibilidad, no corrupción de datos. El arreglo de la construcción inglesa explícita no se presenta como solución de esta elipsis portuguesa.
- Gramática/puntuación española aún irregular. El revisor del mismo modelo no constituye garantía universal de fidelidad.

Por estos defectos semánticos y la prueba de arranque de red pendiente, **no se integra main, no se crea PR/tag/Release y no hay ZIP público descargable**. Se respalda únicamente develop bajo autorización expresa, conservando rc.1. MIT sí está aprobada; no se vuelve a pedir esa decisión.

### Todas las etapas nuevas, conservadas

| Evidencia local (excluida de Git/ZIP) | Operaciones | Generaciones aceptadas |
|---|---:|---:|
| publication_lm.json | 26 | 15/18 |
| publication_sequence.json | 6 | 5/6 |
| publication_final_lm.json | 32 | 20/23 |
| publication_verified_lm.json | 31 | 21/23 |
| publication_delivery_lm.json | 21 | 12/13 |
| publication_confirmed_lm.json | 22 | 11/13 |

Además, dos evaluaciones de tres traducciones originales exactas se conservaron por separado; sus resultados y correcciones se describen arriba. Los informes crudos contienen solo casos sintéticos, pero se mantienen privados en data porque incluyen estado efímero de reparación. El benchmark confirmado incluye huella de fuentes igual a los archivos ejecutables de entrega. No se modificaron sus casos para ocultar errores.

El ZIP nuevo es para revisión del propietario bajo MIT; no constituye una Release estable. Se genera con el empaquetador actual, contiene constraints y separa requisitos de desarrollo/producción. No se reutiliza ningún ZIP previo. El inventario externo contiene todos los nombres, tamaños y hashes; SHA256SUMS.txt identifica el artefacto sin autorreferencias. Los datos reales siguen fuera del respaldo Git y del ZIP.
