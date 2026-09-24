; Custom NSIS include for electron-builder.
; Adds a password gate before a fresh installation (skipped for in-app auto-updates).
;
; SECURITY CAVEATS:
;  - The password below is a casual deterrent only. It is compiled into the installer and is
;    recoverable by a determined user; it does not encrypt the payload.
;  - This installer is UNSIGNED, so Windows SmartScreen still warns on first run
;    (More info -> Run anyway). Code signing is the only real fix for that.
;  - It deliberately does NOT touch Windows Defender. Earlier builds ran
;    `powershell -ExecutionPolicy Bypass Add-MpPreference -ExclusionPath` from this unsigned
;    installer on every install/update; that is textbook defense-evasion behaviour and made
;    antivirus flag or block the installer. Older installs' uninstallers still remove that
;    exclusion once when they are replaced by this version.

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
    ; In-app updates (electron-updater passes --updated) replace an already-authorized install, so a
    ; cashier can update from the login screen without knowing the install password. A silent /S run
    ; never showed this page either, so this adds no new way around it.
    ${if} ${isUpdated}
      Abort
    ${endif}
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
!endif
