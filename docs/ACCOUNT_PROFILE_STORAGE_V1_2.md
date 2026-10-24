# Almacenamiento de cuentas y perfiles v1.2

La aplicación escribe en `data/personal_chat_ai_v2.sqlite3` (configurable con
`PCAI_DATABASE_PATH`). `DATABASE_PATH` y `PERSONALITIES_DATABASE_PATH` identifican
las fuentes v1.1 para la importación explícita; el arranque no las abre ni las
migra automáticamente. Una base v1.1 detectada en la ruta de destino se rechaza
sin modificarla.

Cada cuenta local tiene un UUID estable y campos propios de plataforma,
identificación, confirmación y fechas. El nombre artístico no es único. Los
perfiles y notas se consultan por UUID de cuenta; las notas también se aíslan por
alias de visitante. Una instalación vacía no crea cuentas ni perfiles. La
generación requiere una cuenta confirmada y un perfil activo con el onboarding
completo; sin ello devuelve `onboarding_required` o un error específico de
identificación de cuenta.

## Importación opcional de v1.1

La importación solo copia perfiles y notas a tablas heredadas sin asociarlos a
una cuenta. Las bases originales se abren en modo de solo lectura. Ejecutar la
migración es una decisión explícita y debe hacerse primero sobre copias de
prueba:

```powershell
python -m backend.migrations --source-memory data/personal_chat_ai.sqlite3 --source-profiles data/personalities.sqlite3 --target data/personal_chat_ai_v2.sqlite3
```

Se puede sobrescribir cualquiera de las tres rutas. El destino debe ser distinto
de las dos fuentes y no debe contener datos que se quieran conservar: los
registros heredados de una ejecución interrumpida se sustituyen dentro de una
transacción al reintentar. El comando registra el estado, verifica la integridad
de SQLite y los recuentos, y es idempotente para las mismas fuentes. Una vez
completada la migración, cambiar las fuentes requiere detenerse y revisar el
estado; no se mezclan importaciones distintas automáticamente.

Los perfiles importados, incluidas personalizaciones anteriores, permanecen en
el espacio heredado y no se convierten en cuentas ni se activan. La interfaz de
onboarding y la asignación manual posterior de datos heredados forman parte de
una fase posterior. La aplicación no elimina bases, perfiles ni recuerdos
originales.
