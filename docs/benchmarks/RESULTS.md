# LM Studio real: resultados completos del 21 de octubre de 2026

**Evaluación anterior, conservada como evidencia.** Los resultados vigentes están en [CLOSURE_2026_10_21.md](../CLOSURE_2026_10_21.md) y en `closure_verified.json`. `final.json` pertenece a la tarea anterior.

Modelo sin cambios: `qwen/qwen3-4b-2507`, servidor local `127.0.0.1:1234/v1`. Todos los datos son sintéticos y las bases del benchmark son temporales. No se usaron conversaciones, notas ni perfiles privados. No se probó Chrome/Stripchat real. Los JSON conservan todas las entradas/salidas y errores de cada ejecución; únicamente se retiraron tokens efímeros de traducción.

| Etapa | Generaciones aceptadas | Rechazadas | Traducciones disponibles | Mediana / p95 (segundos) |
|---|---:|---:|---:|---:|
| Base anterior a cambios (`baseline.json`, evidencia del repositorio de desarrollo; excluida del ZIP), 2 rondas básicas | 10/10 (100%) | 0 | 8 | 7,004 / 12,249 |
| Intermedia 1 (`intermediate_1.json`, evidencia del repositorio de desarrollo; excluida del ZIP), 3 rondas y extras | 18/23 (78,26%) | 5 | 15 | 5,820 / 8,066 |
| Intermedia 2 (`intermediate_2.json`, evidencia del repositorio de desarrollo; excluida del ZIP), 3 rondas y extras | 20/23 (86,96%) | 3 | 17 | 6,271 / 7,960 |
| Final (`final.json`, evidencia del repositorio de desarrollo; excluida del ZIP), 3 rondas y extras | **20/23 (86,96%)** | **3** | **13** | **6,027 / 9,329** |

Son **91 operaciones reales**: 79 generaciones y 12 traducciones patrón. Cada etapa ampliada tiene 23 generaciones y cuatro traducciones patrón. Las latencias incluyen toda la operación (análisis, generación, revisión y traducción), también rechazos y traducciones patrón; no son velocidad de tokens. Son muestras pequeñas, con variabilidad del modelo, sin garantías estadísticas ni comparación causal controlada. Las etapas contienen código diferente; las dos últimas incluyen huella de fuentes. La base y la primera intermedia no tienen esa huella y no se les inventó una retrospectiva.

## Qué muestran las ejecuciones

La base de 100% HTTP 200 ya contenía una inversión de objeto en portugués/español y preguntas genéricas. Su aceptación no era 100% de calidad. La primera intermedia detectó un supuesto cruce de alias porque se usaba la palabra común “blue” como centinela: es un falso indicio de fuga, no evidencia de filtración. La respuesta también inventaba una preferencia propia, un problema distinto. Se cambió el centinela a `cobalt-731` y se añadieron controles de preferencias del propietario.

La segunda intermedia aceptó inversiones de conocerme/conocerte y “I made you laugh” → “me hayas hecho reír”, además de sweetie → hijo mío y preferencias propias “my go-to too”. Esos fallos motivaron controles deterministas y regresiones. Los informes previos se mantienen para no ocultarlos. Las comprobaciones mecánicas de identidad/idioma no detectaban esos errores: cero inconsistencias mecánicas **no equivale a cero problemas semánticos**.

## Repetición final del código actual

Huella de fuentes backend/JS: `6d99f3493a0a9fb1e83ddda9e9fe1153d086a27348799c8367dc55b2f3be3eca`.

- Los cinco casos básicos, repetidos tres veces: **15/15 originales aceptadas**; todas en el idioma previsto, sin eco literal del objetivo y con identificadores correctos.
- Extras: cambio de idioma, tema, perspectiva y dos regeneraciones aceptados. Emoji ambiguo: 502 `wrong_language`. Consulta de memoria y alias aislado: 502 `unsupported_claim`. No apareció el centinela del otro alias. El rechazo de memoria impide afirmar que la recuperación conversacional funcione siempre aunque la persistencia/aislamiento pasen los tests.
- Traducción en **13/17 originales no españolas aceptadas (76,47%)**. Cuatro fallos: dos `perspective_mismatch` (el modelo insistió en traducir sweetie como hijo mío) y dos `invalid_format`. Se preservó la original en los cuatro. Las tres originales españolas no recibieron traducción redundante.
- Traducciones patrón **4/4 correctas en inspección**: Bonsoir/Je vais bien → Buenas noches/Estoy bien; Estou bem → Estoy bien; Je ne veux pas de promesses → No quiero promesas; Você me fez rir → Me hiciste reír. También fueron correctas las ocho de las etapas intermedias. Esto no extrapola fidelidad a todas las respuestas generadas.
- **0 violaciones mecánicas** de idioma declarado, identidad, traducción española redundante o centinela cruzado. El asistente inspeccionó todas las salidas finales; no es una revisión bilingüe humana independiente.

## Problemas de calidad que permanecen

- `greeting-0`: “just loving this little chat with you today” añade una valoración contextual no demostrada por el saludo. Su aceptación muestra un límite de la auditoría semántica incluso tras los controles específicos.
- `reconnect-1`: “piensas de mí” resulta poco natural y puede desplazar el sentido de “thinking of me”.
- `perspective`: roles correctos, pero “el chiste haya aterrizado bien” es una traducción demasiado literal del modismo.
- Las dos regeneraciones de agradecimiento cambian palabras pero conservan esencialmente la misma idea de haber ayudado; la variación sigue siendo débil.
- El modelo puede seguir equivocándose fuera de las construcciones verificadas; el segundo pase del mismo modelo comparte sus limitaciones. La revisión de estilo/tono del perfil también requiere validación humana.

**Conclusión de aceptación:** todavía bloqueada para aprobación como estable. Se mejoró la detección y el rechazo seguro de errores observados; no se certifica ausencia de alucinaciones, fidelidad universal ni fiabilidad del DOM real. La documentación describe las incidencias y la validación que falta, sin seleccionar únicamente éxitos. Las pruebas de conexión/timeout y cambios rápidos de chat se ejecutan con clientes/DOM simulados para no alterar el servidor ni conversaciones reales.
