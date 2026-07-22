; ============================================================================
; AgenticOS Windows installer hooks
; Uses Electron Builder's assisted NSIS flow without adding duplicate pages.
; ============================================================================

!include "LogicLib.nsh"

!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "AgenticOS"
!endif

; Keep the installer per-user and skip the Electron Builder install-mode page.
; This prevents the extra "all users / only me" screen shown when oneClick=false
; and perMachine=false.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install ${PRODUCT_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "Setup will install ${PRODUCT_NAME} for your Windows account.$\r$\n$\r$\n${PRODUCT_NAME} is an autonomous AI workspace for coding, research, and execution.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_TEXT "Launch ${PRODUCT_NAME}"
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} is ready"
  !define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been installed successfully.$\r$\n$\r$\nClick Finish to close Setup."
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_UNCONFIRMPAGE_TEXT_TOP "Setup will remove ${PRODUCT_NAME} from this Windows account."
  !define MUI_UNCONFIRMPAGE_TEXT_LOCATION "Application folder:"
  !define MUI_UNCONFIRMPAGE_TEXT_BOTTOM "Your projects and application data are preserved."
  !insertmacro MUI_UNPAGE_CONFIRM
!macroend

!macro customInstall
  DetailPrint "Installing ${PRODUCT_NAME}..."
!macroend

!macro customInstallFinished
  DetailPrint "Finalizing ${PRODUCT_NAME} setup..."
!macroend

!macro customUnInstall
  DetailPrint "Removing ${PRODUCT_NAME}..."
!macroend
