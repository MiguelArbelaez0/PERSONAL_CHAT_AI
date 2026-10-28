!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Preparando la conexión segura con Chrome..."
  ExecWait '"$INSTDIR\native-host\pcai_native_host.exe" --register' $R0
  ${If} $R0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "PERSONAL_CHAT_AI se instaló, pero no se pudo preparar su conexión con Chrome. No se sobrescribió ninguna configuración de otra aplicación. Puedes reparar la instalación o contactar con soporte."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Retirando la conexión de PERSONAL_CHAT_AI con Chrome..."
  IfFileExists "$INSTDIR\native-host\pcai_native_host.exe" 0 pcai_uninstall_native_host_missing
  ExecWait '"$INSTDIR\native-host\pcai_native_host.exe" --unregister' $R0
  ${If} $R0 != 0
    MessageBox MB_ICONSTOP|MB_OK "No se pudo verificar que la configuración de Chrome pertenezca a PERSONAL_CHAT_AI. La desinstalación se detendrá para conservar los archivos y evitar dejar una referencia rota."
    Abort
  ${EndIf}
  Goto pcai_uninstall_native_host_done
  pcai_uninstall_native_host_missing:
    MessageBox MB_ICONSTOP|MB_OK "No se encontró el componente de conexión. La desinstalación se detendrá para evitar dejar una configuración de Chrome incompleta. Contacta con soporte."
    Abort
  pcai_uninstall_native_host_done:
!macroend
