# Publicación v1.1.0 — 22 de octubre de 2026

El propietario aprobó explícitamente las pruebas manuales finales de Chrome y Stripchat y confirmó la corrección de los tres casos. La aprobación manual es evidencia aportada por el usuario, no una prueba observada directamente por el agente. Se autorizaron PR develop→main, merge, tag anotado y Release público con ZIP.

Código funcional aprobado: 9b51913. Solo se actualizan metadatos a 1.1.0 y documentación. nombre de prueba, perfiles, memoria SQLite, cuatro idiomas, tres modos, copia y ausencia de envío automático permanecen intactos. No se reinicia la instancia de 8765 ni se alteran datos originales.

Validación de referencia: 311 Python/71 JavaScript aprobadas, pip check y pip-audit correctos, Gitleaks sin hallazgos; instalación limpia del ZIP y HTTP real con reinicio/persistencia, tanto con copias de datos anteriores como con bases vacías. Se repiten suites, verificación de dependencias, seguridad e instalación para los metadatos finales antes de publicar.

Evaluación LM Studio conservada en [cierre técnico](CLOSURE_THREE_BLOCKERS_2026_10_22.md): general 11/13 y traducción 10/10; específica 5/8, francés 3/3 y reintentos portugueses reales 2/2 tras estado inicial sintético. No se repite el ciclo de desarrollo ni se ocultan los fallos.

Limitaciones aceptadas por el propietario: rechazos ocasionales del modelo, algún falso rechazo de propuestas naturales, ambigüedad de idioma en mensajes breves, dependencia de LM Studio y variación de naturalidad. No se afirma que estén resueltas ni se garantiza fidelidad universal.

Se publica exclusivamente una distribución seleccionada por tools/build_distribution.py, con MIT y avisos de terceros, sin .env privado, bases, memorias, conversaciones, credenciales, cachés ni datos temporales. SHA256SUMS.txt acompaña al ZIP; su hash e inventario se registran externamente para evitar autorreferencia. Se verifica la descarga remota después de publicar.

Preservación: main histórico d4ba4df447765708bb2a79c430222fe3f3e49fe0 seguirá siendo ancestro. En la inspección previa no existía tag ni GitHub Release anterior; no se inventa v1.0.0. No se elimina develop ni se usa force push. El PR conserva los commits mediante merge, respetando protecciones y checks. Las referencias definitivas de PR, commits, tag, Release y paquete constan en el informe de entrega y en GitHub.
