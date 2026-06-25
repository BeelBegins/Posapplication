; Custom NSIS include for electron-builder.
; Adds: (1) a password gate before installation, (2) a Windows Defender exclusion for the install dir.
;
; SECURITY CAVEATS (see chat):
;  - The password below is a casual deterrent only. It is compiled into the installer and is
;    recoverable by a determined user; it does not encrypt the payload.
;  - Add-MpPreference reduces antivirus coverage for the install folder. Because this installer is
;    UNSIGNED, Windows SmartScreen will still warn on first run (More info -> Run anyway).

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; >>> SET YOUR INSTALL PASSWORD HERE before building (npm run dist) <<<
!define INSTALL_PASSWORD "Pioneer@12"

; Install-only code. NSIS compiles the uninstaller in a separate pass with BUILD_UNINSTALLER
; defined and the install page section removed; without this guard the install page functions
; would be compiled-but-unreferenced there and (warnings-as-errors) fail the build.
!ifndef BUILD_UNINSTALLER
  Var PwdInput
  Var EnteredPwd

  !macro customPageAfterChangeDir
    Page custom PasswordPageCreate PasswordPageLeave
  !macroend

  Function PasswordPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 6u 100% 24u "This installation is password-protected.$\r$\nEnter the password provided by your administrator to continue."
    Pop $1
    ${NSD_CreateLabel} 0 40u 100% 12u "Password:"
    Pop $1
    ${NSD_CreatePassword} 0 54u 100% 13u ""
    Pop $PwdInput
    nsDialogs::Show
  FunctionEnd

  Function PasswordPageLeave
    ${NSD_GetText} $PwdInput $EnteredPwd
    ${If} $EnteredPwd != "${INSTALL_PASSWORD}"
      MessageBox MB_ICONSTOP "Incorrect password. Installation cannot continue."
      Abort ; keep the user on the password page
    ${EndIf}
  FunctionEnd

  !macro customInstall
    DetailPrint "Adding Windows Defender exclusion for $INSTDIR"
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Add-MpPreference -ExclusionPath \"$INSTDIR\" -ErrorAction Stop } catch { }"'
  !macroend
!endif

!macro customUnInstall
  DetailPrint "Removing Windows Defender exclusion for $INSTDIR"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Remove-MpPreference -ExclusionPath \"$INSTDIR\" -ErrorAction Stop } catch { }"'
!macroend
