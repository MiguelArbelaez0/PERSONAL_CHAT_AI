# Cierre de los tres bloqueos — 22 de octubre de 2026

> **Registro histórico previo a la Release v1.2.0.** La frase “no se publica main, PR, tag ni Release” describe únicamente el estado de desarrollo de este informe, anterior a la publicación estable de v1.2.0.

Base: develop, commit 3ed11fc. MIT aprobada. Se trabaja únicamente en desarrollo; no se publica main, PR, tag ni Release. Este informe sustituye las conclusiones sobre estos tres casos del informe FINALIZATION_2026_10_22.md, conservado como evidencia histórica.

## Reproducción anterior a las correcciones

Se añadieron cuatro regresiones sintéticas con los textos exactos. Las cuatro fallaron antes de cambiar el código: aceptación de una preferencia inferida de un emoji, aceptación de una conjetura de color sin notas, dos cortesías francesas legítimas y el reintento portugués con su referente guardado. No se usa el alias real, notas reales ni la memoria de producción en las generaciones.

## 1. Preferencias del interlocutor

Causa: personal_claims solo pedía hechos del propietario. Además, sus citas se contrastaban contra notas/filas del propietario, por lo que no existía una verificación simétrica del interlocutor. El revisor podía devolver supported=true sin registrar la preferencia inventada.

Corrección: contrato de revisión con subject (owner/other_person) y kind. La validación mantiene fuentes independientes para cada hablante, con notas por alias y filas Interlocutor/Usuario separadas. Las preferencias reconocidas requieren una afirmación explícita de preferencia en su fuente, una cita real y un ancla léxica que corresponda con el valor citado; no se convierte una pregunta, un emoji ni un borrador en evidencia. Se contrastan también las negaciones. Las afirmaciones del propietario conservan su requisito de evidencia propia; una cita del interlocutor no puede satisfacerlo. Los revisores heredados sin subject siguen limitados al propietario, no obtienen permisos más amplios.

Los casos Which color do I like? sin datos y Tu as un bon goût pour les choses simples desde un emoji ya no pueden pasar mediante un supported=true con personal_claims vacío. Se mantiene la posibilidad de reconocer datos efectivamente anotados (cobalt-731 sintético), expresar desconocimiento, preguntar por gustos y formular una conjetura pedida expresamente. Las preguntas de preferencia citadas erróneamente por el revisor se identifican como preguntas del borrador, no como hechos ni evidencia, sin omitir el contrato o los demás controles. Se explicitan I/you por autor y destinatario en el marco de roles.

## 2. Falso rechazo francés

Causa: el filtro de cortesías/excepción reconocía una sola forma rígida de Content de mieux te connaître, mientras que el modelo producía Content de te connaître un peu mieux. El revisor pedía evidencia de una cortesía y respondía unsupported sin ninguna afirmación factual citada.

Corrección: gramática cerrada de la respuesta completa de bienestar y cortesía francesa, con variaciones de orden de mieux, oui y content/ravi/heureux. No es una lista de frases prohibidas ni una aceptación de cualquier texto francés. Únicamente esa respuesta sin hechos puede corregir los indicadores de contenido erróneos del revisor; idioma, perspectiva, formato y repeticiones siguen verificándose. Un añadido como J'ai passé la journée avec toi no entra en la excepción. Las dos respuestas reales se aceptan en pruebas API incluso cuando se reproduce el falso veredicto anterior.

## 3. Reintento portugués

Causa: Obrigado por querer conhecer melhor omite el objeto. El mensaje entrante Gostaria de conhecer você melhor permite resolverlo como el propietario, pero mandar ambas frases al modelo hacía que volviera a traducir conocerte. Los datos del candidato rechazado reforzaban esa inversión durante el reintento. La validación perspective_mismatch era correcta: no se elimina.

Corrección: se resuelve esa elipsis en una copia semántica del texto para el traductor/revisor (querer me conhecer melhor) solo cuando el contexto confirma el objeto. El original almacenado, editable, copiable y ligado al token permanece intacto. La regla exige una elipsis real con fin de cláusula y no toca objetos explícitos (você, João) ni inventa referente si falta contexto. Se evita reenviar el candidato/reproche español erróneo para perspectiva. Como Qwen persistió en invertir el pronombre incluso con el referente explícito, se repara exclusivamente la cláusula Gracias por querer conocerte mejor → conocerme mejor cuando esa resolución está probada. La traducción completa reparada pasa nuevamente por idioma, perspectiva, omisiones y revisión semántica; un veredicto de fidelidad negativo sigue impidiendo mostrarla.

La primera evaluación específica real mantuvo el fallo portugués y se conserva. Posteriormente se recuperó el reintento con revisión real de Qwen. Las pruebas distinguen traducciones/generación fijadas o errores inyectados de las llamadas reales: se usa una respuesta portuguesa fija para garantizar el original exacto; se fuerzan dos errores iniciales para obtener estado de reparación y después se solicita traducción/revisión reales. No se cuentan esos originales fijados como generaciones del modelo. También se reproduce directamente el estado previo con perspective_mismatch.

## Protección y HTTP real

Copias SQLite verificadas mediante lectura de origen, backup coherente, quick_check y comparación lógica antes de trabajar. Todo ensayo con modelo usa almacenes sintéticos temporales. Ninguna prueba manda mensajes ni modifica perfiles o notas originales. Los hashes de ambas bases originales se contrastan al cerrar.

Se ejecutó tools/probe_isolated_http.py: copia únicamente el backend y copias privadas de las bases a un runtime temporal, configura rutas absolutas dentro de ese runtime y pide puertos libres al sistema operativo. Se inició Uvicorn HTTP/TCP real en 127.0.0.1:53557 y 53561. Salud, equivalencia de los perfiles copiados, perfil/nota sintéticos y persistencia en el segundo arranque pasaron. Se cierran solamente las instancias/hilos creados por el ensayo mediante server.should_exit; no se busca ni termina el proceso de 8765. El backend existente continuó respondiendo ok. Una primera ejecución del instrumento falló al limpiar una conexión SQLite aún abierta en Windows; se corrigió el cierre explícito y se repitió satisfactoriamente. No se presenta el intento fallido como exitoso.

Los puertos de producción y permisos de Chrome no se cambian. La suite añade además una comprobación HTTP real con bases exclusivamente sintéticas y puertos efímeros. No se accede a conversaciones reales de Chrome/Stripchat en esta auditoría.

## Verificaciones de código y seguridad

311 Python y 71 JavaScript aprobadas; cero fallos y omisiones. Se conservan los resultados fallidos de las regresiones iniciales y evaluaciones intermedias. pip check y pip-audit de requirements-dev.txt (incluida producción/transitivas) correctos, sin vulnerabilidades conocidas notificadas. No se cambiaron las dependencias, MIT, modelo Qwen, modos, memoria, perfiles o copia durante esta corrección. Sintaxis Python/JavaScript, Manifest V3, recursos y git diff --check se comprueban al entregar. Gitleaks revisa el contenido seguro del índice/paquete y el commit antes del push.

## Estado funcional y alcance

Las funciones de nombre de prueba, perfiles personalizados y selección persistente, memoria independiente por alias, cuatro idiomas, tres modos, reintentos y copia siguen cubiertas por las suites. El código de extensión no cambia. La aplicación nunca envía automáticamente mensajes. Los datos de usuario y las copias privadas quedan fuera de Git y del ZIP.

Una respuesta 502 que bloquea una preferencia inventada no equivale a una preferencia falsa mostrada; es una limitación de disponibilidad recuperable mediante reintento. La recuperación del modelo de una nota puede fallar aunque la nota esté correctamente conservada y aislada. No se elimina el control para aumentar la aceptación. El mismo Qwen puede seguir equivocándose como generador o revisor; las cifras HTTP no son una medición universal de calidad. Se inspeccionan las salidas reales, no solo los códigos de estado.

Los resultados finales, fallos observados, clasificación y artefacto se completan a continuación con el código de entrega. No se declara v1.1.0 publicada o estable por haber pasado las pruebas.

## Ajustes contra falsos positivos y balance de validación

La evaluación ampliada de entrega obtuvo 22/23 generaciones y traducción 19/19. La inspección identificó un falso rechazo de I actually don't know what color you like: actually y la subordinada what color you like confundían el reconocimiento del desconocimiento. Se añadió una regresión que falló antes del ajuste y pasó después; se separan cláusulas de desconocimiento de afirmaciones posteriores. I don't know. You love jazz sigue exigiendo evidencia. Una pregunta genuina no se confunde con la afirmación You love jazz, don't you?, que conserva su requisito de respaldo.

El chequeo adicional de contrato exige que source sea válido incluso en la excepción de preguntas. Las reglas no permiten usar draft o previous_drafts como fuentes. La elipsis portuguesa exige fin de cláusula: conocer mejor João no se reescribe como si el objeto fuese el propietario. Esas verificaciones evitan ampliar indebidamente las reparaciones.

La evaluación posterior al ajuste, cuya huella debe coincidir con la entrega, se informa separadamente. Las rondas ampliadas previas no se presentan como idénticas al código posterior. No se atribuyen los errores inyectados a un fallo de transporte real de LM Studio.

## Resultado del código entregado

**311 Python y 71 JavaScript aprobadas**, cero fallos/omisiones. Las 20 pruebas añadidas respecto a 3ed11fc incluyen evidencia separada por hablante, notas válidas y negadas, preguntas naturales en cuatro idiomas frente a afirmaciones con coletilla, desconocimiento con actually, contratos inválidos, dos cortesías francesas por API, caché de traducción anterior, revisión negativa que sigue bloqueando la reparación y HTTP real con reinicio.

La última evaluación de entrega del código final (una ronda y extras, sin cambiar los casos) obtuvo **11/13 generaciones aceptadas**, dos rechazos y traducción disponible en **10/10 originales aceptados no españoles**. Ocho traducciones independientes disponibles (cuatro patrón y cuatro originales fallidos anteriores). Mediana 6.613 s, p95 9.116 s. Sin errores reales de transporte. Las latencias incluyen análisis, revisiones y reintentos; son muestras pequeñas, no una promesa de rendimiento.

- isolation: 502 unsupported_claim al proponer Qwen deep crimson sin nota ni evidencia. El revisor también atribuyó esa preferencia al hablante equivocado y citó un borrador como fuente; el contraste de fuentes lo rechazó. Rechazo seguro; no se muestra el borrador.
- regenerate-1: 502 repeated_response al repetir un borrador anterior. Rechazo seguro; no se desactiva la protección para subir la aceptación.
- memory: se aceptó la referencia correcta a la nota sintética cobalt-731; la memoria permaneció aislada. El desconocimiento natural se verificó mediante regresión y en la ejecución anterior benchmark_shipped.json; no se convierte el rechazo actual de una conjetura en un éxito.
- Los originales francés y portugués de esa ronda se aceptaron y tradujeron; los originales españoles no recibieron traducción redundante.

Evaluación específica adicional sobre el mismo código: **8 generaciones reales solicitadas**, cinco aceptadas y tres rechazadas: dos por preferencias del propietario inventadas o atribuidas al hablante incorrecto (unknown_preference y grounded_preference), y un falso rechazo del revisor al confundir una propuesta musical con preferencia/actividad personal (natural_question). Los tres fallos quedan conservados. Francés **3/3 aceptadas**, además del francés de la ronda general (**4/4 en estas dos ejecuciones finales**). En esta ejecución específica fallaron la propuesta musical natural y la respuesta con nota; en la ronda general sí se aceptaron el cambio de tema y la referencia correcta a cobalt-731. En targeted_shipped.json ambos habían pasado. Esta variación del modelo no se presenta como éxito universal de recuperación de memoria. No se observaron de nuevo los dos casos concretos de preferencias inventadas aceptadas: los replays de validador permisivo y las trazas reales muestran que ahora requieren evidencia del interlocutor. Esto no certifica ausencia de toda alucinación futura.

Portugués: **dos reintentos API con traducción y revisión reales de Qwen recuperados 2/2**, uno tras dos timeouts iniciales inyectados y otro tras dos candidatos de perspectiva errónea inyectados. En ambos se conserva exactamente el original fijo Oi! Tudo bem, obrigado por querer conhecer melhor. Fico feliz em conversar com você. y ambas traducciones conservan conocerme mejor (una utiliza Muchas gracias). La generación y su revisión inicial son fixtures declarados para aislar el flujo; no se cuentan como generaciones reales ni los fallos inyectados como averías del servidor. Las llamadas de traducción/revisión posteriores sí son reales y sus resultados completos quedan registrados.

Huella de fuentes backend/JavaScript del código evaluado y empaquetado: `1d5c7cea8e682af05e0dbcff638958af10fe31c0206f8aaaffcffa3bca417458`.

### Fallos y etapas conservadas

| Evaluación general | Solicitudes de generación aceptadas | Traducciones de originales no españoles |
|---|---:|---:|
| benchmark_round1.json | 21/23 | 18/18 |
| benchmark_final.json | 19/23 | 16/16 |
| benchmark_confirmed.json | 21/23 | 18/18 |
| benchmark_delivery.json | 22/23 | 19/19 |
| benchmark_shipped.json | 11/13 | 10/10 |
| benchmark_release.json (entrega final) | 11/13 | 10/10 |

Las rondas anteriores tienen cambios sucesivos de código y, en las dos últimas, una ronda en lugar de tres. No se presenta su comparación como un ensayo causal ni se seleccionan únicamente los éxitos. También se conservan targeted_round1/final/confirmed/delivery/shipped/release.json; la primera mantuvo el fallo portugués, las posteriores documentan la resolución/reparación y la recuperación real. Los reportes crudos están en data ignorado y no entran en el ZIP; contienen exclusivamente datos sintéticos, y algunos reportes generales incluyen tokens efímeros de ensayo. Los scripts de QA reproducibles están versionados en tools, no en el ZIP de usuario.

## Clasificación y recomendación

| Caso | Clasificación actual, basada en las pruebas |
|---|---|
| Preferencias sin evidencia | El defecto de validación demostrado queda corregido. Aún puede fallar la generación del modelo, pero en las muestras se rechazan sus conjeturas sin mostrarlas. No hay pérdida ni cruce de memoria. |
| Francés legítimo rechazado | Los dos replays exactos y cuatro generaciones finales pasan; la excepción sigue excluyendo historias inventadas, roles invertidos y repeticiones. No queda el bloqueo reproducido. |
| Reintento portugués | Estado anterior reproducido, original intacto, casos sin referente no reescritos y recuperación real 2/2. No queda el bloqueo reproducido. |

**Candidata preparada para revisión manual del propietario; no publicada ni declarada estable.** No se observó un bloqueo crítico residual de los tres casos concretos en la entrega. Permanecen limitaciones menores de disponibilidad/estilo: Qwen puede volver a generar contenido rechazado, confundir una propuesta de conversación con una preferencia o dar puntuación/gramática españolas poco naturales. La última etapa específica conserva un falso rechazo en inglés de una propuesta musical natural; los otros dos rechazos bloquean preferencias del propietario inventadas o mal atribuidas. No se considera pérdida de memoria, pero sí una limitación de disponibilidad relevante para la decisión de uso. En la prueba extra Guess my favorite color!, el clasificador heurístico eligió español por tratarse de una entrada breve; no se modificó la detección de idiomas fuera del alcance de esta tarea. Esa limitación también queda visible, no se oculta como una prueba de inglés correcta.

No se afirma aceptación o fidelidad universal del 100 %. Antes de autorizar main y una Release estable se recomienda comprobar los tres casos en Chrome con el backend actualizado y decidir si las limitaciones menores documentadas son aceptables para el uso previsto. El backend que sigue atendiendo 8765 no se ha reiniciado: no se le atribuye el código nuevo por haber actualizado los archivos del repositorio.

## Validación manual para la aprobación

1. Cuando el propietario decida actualizar la instancia habitual, instalar los requisitos y reiniciar el backend con el código nuevo, sin reemplazar .env, perfiles, notas ni archivos privados. Esta tarea no detiene la instancia actual. Recargar la extensión y la pestaña de Stripchat.
2. Con alias de prueba, enviar un emoji y preguntar Which color do I like? sin notas: aceptar desconocimiento/petición de pista, o rechazo explícito; nunca presentar un color inventado como conocido. Con una nota sintética explícita para ese alias, comprobar la referencia correcta sin atribuírsela al propietario ni a otro alias.
3. Probar Bonsoir, tu vas bien ? J'aimerais apprendre à mieux te connaître. con nombre de prueba y perfil personalizado. Verificar respuesta francesa breve y traducción española, sin exigir evidencia de una cortesía ni admitir recuerdos inventados.
4. Probar Oi, tudo bem? Gostaria de conhecer você melhor. Si aparece reintento, comprobar que conoce al propietario (conocerme), que no se modifica el original y que el botón recupera la traducción o muestra un error claro. El ensayo API reproducible usa fixtures para forzar esos errores sin tocar conversaciones reales.
5. Revisar inglés, español, francés y portugués, alternar modos automático/manual/desactivado y copiar el original. Confirmar que nada se envía automáticamente y que selección de perfil/notas siguen conservándose al reiniciar.

## Comandos reproducibles de QA

Desde el checkout de desarrollo, con dependencias de requirements-dev.txt:

```powershell
python -m pytest -q
node --test tests/*.cjs
python -m pip check
pip-audit -r requirements-dev.txt
python -m tools.benchmark_local --rounds 3 --previous-failures --output data/nueva_evaluacion.json
python -m tools.verify_remaining_cases --output data/nuevos_casos.json
python -m tools.probe_isolated_http --copies data/closure_three_20261022 --output data/http_nuevo.json
```

El último comando necesita las copias privadas verificadas preparadas en esta tarea; no se distribuyen. La suite HTTP automatizada utiliza en cambio bases enteramente sintéticas. Gitleaks y diff --check se ejecutan además sobre los archivos preparados antes del respaldo autorizado.

Archivos de implementación modificados: backend/evidence.py (nuevo), backend/grounding.py, backend/main.py, backend/output_schemas.py, backend/roles.py y backend/translation.py. Regresiones: tests/test_remaining_blockers.py. Instrumentos nuevos: tools/probe_isolated_http.py y tools/verify_remaining_cases.py. Se actualizan README, CHANGELOG, RELEASE_NOTES y los informes de estado/cierre/incidencias/resultados. No cambia extension.

## Paquete y respaldo

Se prepara un ZIP nuevo para revisión del propietario, sin reutilizar ni sobrescribir los anteriores, mediante tools/build_distribution.py. El inventario externo identifica los archivos y hashes; SHA256SUMS.txt identifica el ZIP sin autorreferencia. El paquete incluye el backend nuevo con evidence.py, extensión intacta, requisitos/constraints, configuración de ejemplo, MIT, avisos de terceros, scripts y guías. Excluye .env privado, .venv, SQLite, memorias, conversaciones, knowledge/local, logs, cachés, respaldos, pesos y trazas de ensayo.

La validación del paquete ejecuta el instalador en una extracción nueva y prueba HTTP real tanto con copias verificadas de los almacenes anteriores como con bases vacías, en puertos efímeros. Los informes de validación y el hash final acompañan al ZIP fuera del repositorio. Las pruebas de QA y pip-audit requieren el checkout/herramientas de auditoría en un entorno separado; no se instalan herramientas de auditoría en el servidor de usuario.

El commit y push autorizados se realizan exclusivamente en develop después de revisar el índice, Gitleaks, las suites y el paquete. El hash se consulta con git log -1 y con origin/develop; no se inserta el hash autorreferente en este documento. No se actualiza main ni se crea una publicación.
