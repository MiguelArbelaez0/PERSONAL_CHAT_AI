# Estado actual y cierre de jornada

**Fecha:** 21 de octubre de 2026.

**Estado:** PERSONAL_CHAT_AI v1.1.0-rc.1 en desarrollo, no estable.

**Rama de respaldo:** `develop`. `main` no se modifica ni se fusiona.

Este cierre conserva las funcionalidades y correcciones existentes. No añade funciones ni cambia la arquitectura. El commit de respaldo utiliza el mensaje `fix: improve multilingual reliability and preserve v1.1.0 rc1 progress`. El hash y la confirmación del push deben consultarse con los comandos de verificación del apartado de respaldo, evitando introducir el hash del propio commit dentro de su contenido.

## Funcionalidades implementadas

- Backend FastAPI local en `127.0.0.1:8765`, con LM Studio local en `127.0.0.1:1234/v1`.
- Extensión Chrome Manifest V3 y panel flotante, detección de alias y clasificación de mensajes entrantes/propios mediante selectores comprobables.
- Perfiles locales: ChubbyKriz predeterminado; creación, edición, selección, eliminación de personalizados y restauración del predeterminado.
- Selección del idioma desde el último mensaje entrante, con respaldo al historial entrante y a la configuración. Cobertura automatizada de inglés, español, francés y portugués.
- Respuesta original editable y traducción al español independiente, sin duplicarla cuando la respuesta ya está en español. Copiar utiliza únicamente el original editable.
- Notas manuales persistentes en SQLite separadas por alias. Los perfiles se almacenan de forma independiente; los borradores no se convierten en recuerdos.
- Modos Automático, Manual y Desactivado. Automático prepara sugerencias; nunca envía mensajes a Stripchat. Se distinguen el modo configurado y el mecanismo de inicio de una generación.

## Correcciones conservadas

- Comprobaciones de copia completa y parcial de la entrada, repetición de fragmentos y preguntas genéricas consecutivas.
- Controles de actividades, eventos o reciprocidad sin evidencia, y apelativos que invierten el rol del propietario y el interlocutor.
- Auditoría separada del generador con citas contrastadas contra las fuentes visibles. Los borradores previos no pueden servir como evidencia factual.
- Objetivo entrante situado después del historial y de los contraejemplos para reducir la continuación accidental de un borrador anterior.
- Contratos de salida JSON con LM Studio; reparación acotada de revisiones mal formadas y compatibilidad con servidores que rechacen ese parámetro.
- Revisión de traducción por equivalencia semántica, con discrepancias concretas y distinción entre fallo de formato, idioma y fidelidad.
- Estado temporal de reparación de traducciones, vinculado al original y al idioma. El botón de reintento conserva el original, actualiza el contexto de corrección y mantiene disponible otro intento si falla.
- Correcciones limitadas de fórmulas de saludo y puntuación, sin omitir los controles posteriores de idioma y significado.
- Conservación de notas, perfiles, configuración privada, puertos, permisos, copia y modos existentes.

## Verificación técnica ejecutada en este cierre

| Comprobación | Resultado real |
| --- | --- |
| Rama y estado inicial | `develop`, cambios locales revisados; sin staging previo. |
| Sincronización inicial | `git fetch origin develop`; divergencia local/remota `0 0` antes del commit de cierre. |
| Python: `.\.venv\Scripts\python.exe -m pytest -q` | **199 aprobadas, 0 fallidas, 0 omitidas**. |
| JavaScript: `node --test tests/*.cjs` | **58 aprobadas, 0 fallidas, 0 omitidas**. |
| Sintaxis Python | Análisis AST correcto de los **23 archivos** Python de backend y pruebas. |
| Sintaxis JavaScript | `node --check` correcto para los tres scripts de la extensión. |
| Manifiesto Chrome | JSON válido, Manifest V3, `1.1.0` y marcador `rc.1`; permisos y referencias a archivos verificados. |
| Espacios y parches | `git diff --check` correcto. |

Pytest emite 900 avisos de deprecación de FastAPI por el uso de `asyncio.iscoroutinefunction`. No son fallos de prueba y no se actualizaron dependencias durante el cierre. Las suites conservan cobertura de perfiles, persistencia, memoria, modos, copia, contratos de API, traducción y flujos de generación. No se detectaron regresiones críticas nuevas en estas verificaciones.

## Seguridad y alcance del respaldo

Se revisaron archivos modificados y nuevos, las exclusiones y los archivos versionados que formarán el árbol del commit. La revisión adicional de rutas y contenido no encontró claves privadas, credenciales en URL, correos ni rutas de cuentas personales en los candidatos. Gitleaks 8.30.1 escaneó una copia temporal de los 55 archivos candidatos iniciales y no encontró secretos. El documento de cierre y el contenido exacto del índice también se verifican antes de confirmar el commit; el rango de commits a enviar se comprueba antes del push.

`.gitignore` excluye `.env` y variantes privadas, `.venv/`, `data/`, bases SQLite, `knowledge/local/`, cachés, registros y temporales. `.env.example` contiene valores de ejemplo locales y se conserva. Los ejemplos de pruebas y documentación son sintéticos; no se incorporan historiales privados. El escaneo no constituye una garantía absoluta de ausencia de información sensible desconocida.

El respaldo es solo código, pruebas y documentación. Los datos locales excluidos se conservan en el equipo, pero **no quedan respaldados en GitHub**. No se eliminan bases ni memorias, no se crean PR, tags o releases y no se declara estable la versión.

## Problemas conocidos y riesgos

- **HTTP 502 intermitentes:** el modelo puede continuar inventando hechos, repitiendo contenido o devolviendo una revisión inaceptable después del reintento acotado. El backend bloquea esos borradores. Son problemas conocidos de la candidata, no resueltos por el cierre ni ocultados por las pruebas automatizadas.
- Las reglas léxicas y de similitud tienen falsos positivos y negativos. La auditoría añade latencia y usa el mismo modelo, por lo que sus errores pueden estar correlacionados.
- La traducción todavía puede introducir matices, intensidad, puntuación o paráfrasis discutibles aunque la revisión automática la apruebe. No se certifica fidelidad completa; se requiere revisión humana.
- Las pruebas reales previas con `qwen/qwen3-4b-2507` tuvieron resultados mixtos. La última ronda documentada rechazó el primer saludo inglés con HTTP 502 y completó el segundo caso inglés, francés y portugués. En este cierre no se repitieron generaciones reales; se conservaron esos resultados sin presentarlos como éxitos nuevos.
- El contexto depende de las filas presentes en el DOM, la clasificación de autores y el presupuesto del modelo. Los borradores temporales desaparecen al reiniciar el backend y necesitan alias o identificador de conversación para aislarse.
- La API local no autentica clientes y las bases locales no están cifradas. Deben mantenerse los puertos en loopback y protegerse el acceso a la cuenta del equipo.
- Las verificaciones del panel con DOM simulado no sustituyen Chrome/Stripchat. Las pruebas manuales pendientes no bloquean este respaldo de desarrollo autorizado.

## Pruebas manuales pendientes

1. Recargar backend, extensión y página; comprobar identidad del interlocutor, selectores, dirección de mensajes y cambios rápidos entre chats.
2. Repetir los cuatro casos descritos en [RC1_REAL_CASES.md](RC1_REAL_CASES.md), manteniendo el mismo alias en los dos ingleses. Verificar hechos, perspectiva, diversidad, idioma y cierres sin preguntas de relleno.
3. Comparar cada original francés/portugués con toda su traducción, incluidos sujetos, negaciones, tono y saludos. Comprobar reintento exitoso y fallido y conservación del original.
4. Editar y copiar el original antes y después de recuperar una traducción. Verificar el portapapeles y el aviso de traducción desactualizada.
5. Comprobar los tres modos, perfiles personalizados y notas sintéticas aisladas por alias, sin borrar información real.
6. Confirmar ausencia de envío automático y comportamiento claro al detener o reiniciar LM Studio/backend.

## Instrucciones exactas para continuar mañana

1. Abrir PowerShell en la raíz del proyecto y leer este documento junto con [V1_1_VALIDATION.md](V1_1_VALIDATION.md) y [RC1_REAL_CASES.md](RC1_REAL_CASES.md).
2. Verificar el respaldo y la rama:

   ```powershell
   git status -sb
   git branch --show-current
   git log -1 --oneline
   git fetch origin develop
   git rev-list --left-right --count HEAD...origin/develop
   ```

   La rama debe ser `develop`. Si hay cambios locales o divergencia, revisarlos antes de cambiar de rama o integrar trabajo. No descartar ni sobrescribir nada. Si el árbol está limpio y solo falta avanzar al remoto, usar `git pull --ff-only origin develop`.

3. Reejecutar la línea base antes de modificar código:

   ```powershell
   .\.venv\Scripts\python.exe -m pytest -q
   node --test tests/*.cjs
   ```

4. Iniciar LM Studio con `qwen/qwen3-4b-2507` y su servidor local. Iniciar el backend con `INICIAR_PERSONAL_CHAT_AI.bat` o, desde esta raíz:

   ```powershell
   .\.venv\Scripts\python.exe -m backend
   ```

   Si el backend anterior sigue ejecutándose, cerrarlo antes de iniciar otra instancia. No cambiar los puertos ni sobrescribir `.env`.

5. Recargar la extensión en `chrome://extensions`, recargar Stripchat y activar ChubbyKriz. **Primera tarea recomendada:** reproducir el saludo inglés que produjo HTTP 502, capturando únicamente datos sintéticos y los motivos de rechazo, para distinguir una invención real de un falso positivo del auditor. Después medir varias repeticiones de los cuatro casos, sin seleccionar solo los éxitos.
6. Añadir regresiones de cualquier fallo nuevo, ejecutar nuevamente ambas suites y actualizar este estado. No relajar validadores indiscriminadamente, no introducir funcionalidades ajenas y no considerar estable la candidata hasta resolver o caracterizar los errores reales. Cualquier futura publicación o commit requiere la autorización aplicable de la siguiente jornada.

## Verificación del commit de cierre

Tras el push autorizado, estos comandos deben mostrar el mismo hash local y remoto y un árbol limpio:

```powershell
git log -1 --format="%H %s"
git rev-parse origin/develop
git ls-remote --heads origin refs/heads/develop
git status -sb
```

Mensaje previsto: `fix: improve multilingual reliability and preserve v1.1.0 rc1 progress`.
