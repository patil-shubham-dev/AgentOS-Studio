; ============================================================================
; AgenticOS Windows installer and uninstaller
; Redesigned native NSIS flow for a professional, focused first impression.
; ============================================================================

!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"

; Window
!define INSTALLER_WIDTH      620
!define INSTALLER_HEIGHT     480
!define INSTALLER_DIALOG_ID  1018

; Layout
!define RAIL_W               170
!define PAGE_X               194
!define PAGE_W               384
!define FOOTER_Y             336
!define BUTTON_W             86
!define BUTTON_H             22

; Fonts
!define FONT_SIZE_EYEBROW    7
!define FONT_SIZE_BODY       9
!define FONT_SIZE_BODY_LG    10
!define FONT_SIZE_TITLE      20
!define FONT_SIZE_HEADING    14
!define FONT_SIZE_MONO       8
!define FONT_SIZE_MARK       22

; NSIS colors are BGR, not RGB.
!define CLR_BG               0x11100E ; #0E1011
!define CLR_RAIL             0x181512 ; #121518
!define CLR_SURFACE          0x211F1C ; #1C1F21
!define CLR_SURFACE_SOFT     0x2D2924 ; #24292D
!define CLR_BORDER           0x3A3630 ; #30363A
!define CLR_TEXT             0xF5F1EA ; #EAF1F5
!define CLR_TEXT_MUTED       0xB7ADA0 ; #A0ADB7
!define CLR_TEXT_DIM         0x837A70 ; #707A83
!define CLR_ACCENT           0xC89436 ; #3694C8
!define CLR_SUCCESS          0x7DC25A ; #5AC27D
!define CLR_DANGER           0x5E5CF1 ; #F15C5E
!define CLR_WARN_BG          0x24333F ; #3F3324
!define CLR_WARN_TEXT        0x81B7EF ; #EFB781

!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "AgenticOS"
!endif
!define PRODUCT_TAGLINE "Autonomous AI workspace for coding, research, and execution."
!define INSTALL_SIZE_TEXT "About 650 MB required"

!define MUI_BGCOLOR "0E1011"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Cancel the ${PRODUCT_NAME} installation?"
!define MUI_ABORTWARNING_CANCEL_DEFAULT

!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT myGUIInit
  !define MUI_PAGE_CUSTOMFUNCTION_PRE   InstFilesPage_Pre
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW  InstFilesPage_Show
  !define MUI_PAGE_HEADER_TEXT ""
  !define MUI_PAGE_HEADER_SUBTEXT ""
!endif

Var FontTitle
Var FontHeading
Var FontBody
Var FontBodyLarge
Var FontSmall
Var FontLabel
Var FontMono
Var FontMark

Var DirInput
Var BtnBrowse
Var BtnNext
Var BtnBack
Var BtnInstall
Var BtnCancel
Var BtnLaunch
Var BtnClose
Var LinkCancel
Var ChkDesktop
Var ChkLaunch
Var ChkAutoUpdate
Var CreateDesktopShortcut
Var LaunchAfterInstall
Var EnableAutoUpdate
Var HAS_PREVIOUS_VERSION
Var PREVIOUS_VERSION
Var PREVIOUS_INSTALL_PATH
Var RemoveSettings
Var RemoveCache
Var RemoveUserData
Var UnChkSettings
Var UnChkCache
Var UnChkUserData
Var UnBtnCloseApp
Var UnBtnCancel
Var UnBtnUninstall
Var SettingsLabel
Var CacheLabel

; ---------------------------------------------------------------------------
; Shared UI
; ---------------------------------------------------------------------------

!macro CreateLabel var x y w h text color bg font
  ${NSD_CreateLabel} ${x}u ${y}u ${w}u ${h}u "${text}"
  Pop ${var}
  SetCtlColors ${var} ${color} ${bg}
  SendMessage ${var} ${WM_SETFONT} ${font} 0
!macroend

!macro CreateDivider x y w
  ${NSD_CreateLabel} ${x}u ${y}u ${w}u 1u ""
  Pop $0
  SetCtlColors $0 ${CLR_BORDER} ${CLR_BORDER}
!macroend

!macro CreatePanel x y w h color
  ${NSD_CreateLabel} ${x}u ${y}u ${w}u ${h}u ""
  Pop $0
  SetCtlColors $0 ${color} ${color}
!macroend

!macro CreateRail stepText statusText
  !insertmacro CreatePanel 0 0 ${RAIL_W} 360 ${CLR_RAIL}
  !insertmacro CreateLabel $0 20 22 130 16 "${PRODUCT_NAME}" ${CLR_TEXT} ${CLR_RAIL} $FontHeading
  !insertmacro CreateLabel $0 20 44 124 34 "AI workspace setup" ${CLR_TEXT_MUTED} ${CLR_RAIL} $FontBody
  !insertmacro CreateDivider 20 96 118
  !insertmacro CreateLabel $0 20 112 118 12 "${stepText}" ${CLR_ACCENT} ${CLR_RAIL} $FontLabel
  !insertmacro CreateLabel $0 20 132 124 46 "${statusText}" ${CLR_TEXT_MUTED} ${CLR_RAIL} $FontBody
  !insertmacro CreateLabel $0 20 292 128 26 "Version ${VERSION}" ${CLR_TEXT_DIM} ${CLR_RAIL} $FontSmall
!macroend

!macro CreateChrome stepText statusText
  SetCtlColors $0 "" "${CLR_BG}"
  !insertmacro CreateRail "${stepText}" "${statusText}"
!macroend

!macro CreatePrimaryButton var x y w text handler
  ${NSD_CreateButton} ${x}u ${y}u ${w}u ${BUTTON_H}u "${text}"
  Pop ${var}
  ${NSD_OnClick} ${var} ${handler}
!macroend

!macro CreateSecondaryButton var x y w text handler
  ${NSD_CreateButton} ${x}u ${y}u ${w}u ${BUTTON_H}u "${text}"
  Pop ${var}
  ${NSD_OnClick} ${var} ${handler}
!macroend

!macro CreateOption var x y text checked
  ${NSD_CreateCheckBox} ${x}u ${y}u 340u 15u "${text}"
  Pop ${var}
  SetCtlColors ${var} ${CLR_TEXT} ${CLR_BG}
  ${NSD_SetState} ${var} ${checked}
!macroend

!macro Log event message
  DetailPrint "[${PRODUCT_NAME}] ${event}: ${message}"
!macroend

Function InitFonts
  CreateFont $FontTitle     "Segoe UI" ${FONT_SIZE_TITLE} 700
  CreateFont $FontHeading   "Segoe UI" ${FONT_SIZE_HEADING} 700
  CreateFont $FontBody      "Segoe UI" ${FONT_SIZE_BODY} 400
  CreateFont $FontBodyLarge "Segoe UI" ${FONT_SIZE_BODY_LG} 400
  CreateFont $FontSmall     "Segoe UI" ${FONT_SIZE_EYEBROW} 400
  CreateFont $FontLabel     "Segoe UI" ${FONT_SIZE_EYEBROW} 700
  CreateFont $FontMono      "Consolas" ${FONT_SIZE_MONO} 400
  CreateFont $FontMark      "Segoe UI" ${FONT_SIZE_MARK} 700
FunctionEnd

Function un.InitFonts
  CreateFont $FontTitle     "Segoe UI" ${FONT_SIZE_TITLE} 700
  CreateFont $FontHeading   "Segoe UI" ${FONT_SIZE_HEADING} 700
  CreateFont $FontBody      "Segoe UI" ${FONT_SIZE_BODY} 400
  CreateFont $FontBodyLarge "Segoe UI" ${FONT_SIZE_BODY_LG} 400
  CreateFont $FontSmall     "Segoe UI" ${FONT_SIZE_EYEBROW} 400
  CreateFont $FontLabel     "Segoe UI" ${FONT_SIZE_EYEBROW} 700
  CreateFont $FontMono      "Consolas" ${FONT_SIZE_MONO} 400
  CreateFont $FontMark      "Segoe UI" ${FONT_SIZE_MARK} 700
FunctionEnd

!ifndef BUILD_UNINSTALLER
Function myGUIInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  System::Call 'user32::SetWindowPos(i $HWNDPARENT, i 0, i 0, i 0, i ${INSTALLER_WIDTH}, i ${INSTALLER_HEIGHT}, i 0x16)'
  System::Call 'user32::GetSystemMetrics(i 0) i .r1'
  System::Call 'user32::GetSystemMetrics(i 1) i .r2'
  IntOp $3 $1 - ${INSTALLER_WIDTH}
  IntOp $3 $3 / 2
  IntOp $4 $2 - ${INSTALLER_HEIGHT}
  IntOp $4 $4 / 2
  System::Call 'user32::SetWindowPos(i $HWNDPARENT, i 0, i $3, i $4, i 0, i 0, i 0x15)'
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

!macro CloseRunningApp
  ExecWait 'taskkill /IM "${PRODUCT_NAME}.exe"'
  Sleep 1200
  ExecWait 'taskkill /IM "${PRODUCT_NAME}.exe" /F'
  Sleep 500
!macroend

Function un.CloseRunningApp
  !insertmacro CloseRunningApp
FunctionEnd

Function CheckExistingInstall
  ReadRegStr $PREVIOUS_VERSION HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion"
  ${If} $PREVIOUS_VERSION == ""
    ReadRegStr $PREVIOUS_VERSION HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion"
  ${EndIf}
  ${If} $PREVIOUS_VERSION != ""
    StrCpy $HAS_PREVIOUS_VERSION "1"
    ReadRegStr $PREVIOUS_INSTALL_PATH HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation"
    ${If} $PREVIOUS_INSTALL_PATH == ""
      ReadRegStr $PREVIOUS_INSTALL_PATH HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation"
    ${EndIf}
    ${If} $PREVIOUS_INSTALL_PATH != ""
      StrCpy $INSTDIR $PREVIOUS_INSTALL_PATH
    ${EndIf}
  ${Else}
    StrCpy $HAS_PREVIOUS_VERSION "0"
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------------------
; Pages
; ---------------------------------------------------------------------------

!ifndef BUILD_UNINSTALLER
  Page custom InstallerPage_Welcome InstallerPage_Welcome_Leave
  Page custom InstallerPage_Prefs InstallerPage_Prefs_Leave
  !insertmacro MUI_PAGE_INSTFILES
  Page custom InstallerPage_Complete ""
!endif

!ifdef BUILD_UNINSTALLER
  UninstPage custom un.Page_Confirm un.Page_Confirm_Leave
  UninstPage custom un.Page_Complete ""
!endif

Function InstallerPage_Welcome
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  Call InitFonts
  !insertmacro CreateChrome "Step 1 of 3" "Install ${PRODUCT_NAME} with the defaults used by modern desktop AI tools."

  !insertmacro CreateLabel $0 ${PAGE_X} 30 ${PAGE_W} 28 "Set up ${PRODUCT_NAME}" ${CLR_TEXT} ${CLR_BG} $FontTitle
  !insertmacro CreateLabel $0 ${PAGE_X} 66 350 36 "${PRODUCT_TAGLINE}" ${CLR_TEXT_MUTED} ${CLR_BG} $FontBodyLarge

  !insertmacro CreatePanel ${PAGE_X} 122 330 66 ${CLR_SURFACE}
  !insertmacro CreateLabel $0 212 136 280 14 "Ready in a few seconds" ${CLR_TEXT} ${CLR_SURFACE} $FontBody
  !insertmacro CreateLabel $0 212 154 284 22 "Installs locally, adds Start Menu access, and keeps user data separate from app files." ${CLR_TEXT_MUTED} ${CLR_SURFACE} $FontSmall

  !insertmacro CreatePanel ${PAGE_X} 204 330 52 ${CLR_SURFACE_SOFT}
  !insertmacro CreateLabel $0 212 218 280 14 "No account changes during install" ${CLR_TEXT} ${CLR_SURFACE_SOFT} $FontBody
  !insertmacro CreateLabel $0 212 236 284 12 "Provider setup happens inside the app when you launch it." ${CLR_TEXT_MUTED} ${CLR_SURFACE_SOFT} $FontSmall

  !insertmacro CreateDivider ${PAGE_X} ${FOOTER_Y} 340
  ${NSD_CreateLink} ${PAGE_X}u 352u 72u 14u "Cancel"
  Pop $LinkCancel
  SetCtlColors $LinkCancel ${CLR_TEXT_DIM} ${CLR_BG}
  ${NSD_OnClick} $LinkCancel InstallerPage_Welcome_Cancel

  !insertmacro CreatePrimaryButton $BtnNext 468u 348u 96u "Continue" InstallerPage_Welcome_Next

  !insertmacro Log "PAGE" "Welcome page displayed"
  nsDialogs::Show
FunctionEnd

Function InstallerPage_Welcome_Next
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function InstallerPage_Welcome_Cancel
  MessageBox MB_YESNO|MB_ICONQUESTION "Cancel the ${PRODUCT_NAME} installation?" IDYES abort IDNO done
  abort:
    Quit
  done:
FunctionEnd

Function InstallerPage_Welcome_Leave
FunctionEnd

Function InstallerPage_Prefs
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  Call InitFonts
  !insertmacro CreateChrome "Step 2 of 3" "Confirm where ${PRODUCT_NAME} should live and choose lightweight system options."

  !insertmacro CreateLabel $0 ${PAGE_X} 24 ${PAGE_W} 22 "Installation options" ${CLR_TEXT} ${CLR_BG} $FontHeading
  !insertmacro CreateLabel $0 ${PAGE_X} 52 350 24 "The recommended setup works for most users and can be changed later from Windows settings." ${CLR_TEXT_MUTED} ${CLR_BG} $FontBody

  !insertmacro CreateLabel $0 ${PAGE_X} 92 200 10 "INSTALL LOCATION" ${CLR_TEXT_DIM} ${CLR_BG} $FontLabel
  ${NSD_CreateText} ${PAGE_X}u 108u 276u 18u $INSTDIR
  Pop $DirInput
  SetCtlColors $DirInput ${CLR_TEXT} ${CLR_SURFACE}
  !insertmacro CreateSecondaryButton $BtnBrowse 486u 106u 70u "Browse" InstallerPage_Prefs_Browse

  ${GetRoot} "$INSTDIR" $R0
  ${DriveSpace} $R0 "/D=F /S=M" $R1
  !insertmacro CreateLabel $0 ${PAGE_X} 134 330 12 "${INSTALL_SIZE_TEXT}. Available: $R1 MB." ${CLR_TEXT_MUTED} ${CLR_BG} $FontSmall

  !insertmacro CreateDivider ${PAGE_X} 162 340
  !insertmacro CreateLabel $0 ${PAGE_X} 178 200 10 "SYSTEM OPTIONS" ${CLR_TEXT_DIM} ${CLR_BG} $FontLabel
  !insertmacro CreateOption $ChkDesktop ${PAGE_X} 196 "Create a desktop shortcut" ${BST_CHECKED}
  !insertmacro CreateOption $ChkLaunch ${PAGE_X} 218 "Launch ${PRODUCT_NAME} when setup finishes" ${BST_CHECKED}
  !insertmacro CreateOption $ChkAutoUpdate ${PAGE_X} 240 "Enable automatic updates" ${BST_CHECKED}

  !insertmacro CreateDivider ${PAGE_X} ${FOOTER_Y} 340
  !insertmacro CreateSecondaryButton $BtnBack 374u 348u 76u "Back" InstallerPage_Prefs_Back
  !insertmacro CreatePrimaryButton $BtnInstall 462u 348u 96u "Install" InstallerPage_Prefs_Install

  !insertmacro Log "PAGE" "Preferences page displayed"
  nsDialogs::Show
FunctionEnd

Function InstallerPage_Prefs_Browse
  nsDialogs::SelectFolderDialog "Choose where to install ${PRODUCT_NAME}" $INSTDIR
  Pop $0
  ${If} $0 != error
    StrCpy $INSTDIR $0
    ${NSD_SetText} $DirInput $INSTDIR
  ${EndIf}
FunctionEnd

Function InstallerPage_Prefs_Back
  SendMessage $HWNDPARENT 0x408 -1 0
FunctionEnd

Function InstallerPage_Prefs_Install
  ${NSD_GetText} $DirInput $INSTDIR
  ${NSD_GetState} $ChkDesktop $CreateDesktopShortcut
  ${NSD_GetState} $ChkLaunch $LaunchAfterInstall
  ${NSD_GetState} $ChkAutoUpdate $EnableAutoUpdate
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function InstallerPage_Prefs_Leave
  ${NSD_GetText} $DirInput $INSTDIR
FunctionEnd

!ifndef BUILD_UNINSTALLER
Function InstFilesPage_Pre
  !insertmacro Log "INSTALL" "Starting installation"
FunctionEnd

Function InstFilesPage_Show
  Push $0
  Push $1
  Push $2
  Push $3
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1004
  SendMessage $1 0x409 0 ${CLR_ACCENT}
  SendMessage $1 0x408 0 ${CLR_SURFACE}
  GetDlgItem $2 $0 1006
  SetCtlColors $2 ${CLR_TEXT_MUTED} ${CLR_BG}
  GetDlgItem $3 $HWNDPARENT 2
  EnableWindow $3 0
  ShowWindow $3 0
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

Function InstallerPage_Complete
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  Call InitFonts
  !insertmacro CreateChrome "Step 3 of 3" "Setup is complete. You can launch immediately or close this window."

  !insertmacro CreateLabel $0 ${PAGE_X} 56 42 32 "OK" ${CLR_SUCCESS} ${CLR_BG} $FontMark
  !insertmacro CreateLabel $0 ${PAGE_X} 104 ${PAGE_W} 24 "${PRODUCT_NAME} is ready" ${CLR_TEXT} ${CLR_BG} $FontTitle

  StrLen $R0 $INSTDIR
  ${If} $R0 > 54
    StrCpy $R1 $INSTDIR 51 -51
    StrCpy $R1 "...$R1"
  ${Else}
    StrCpy $R1 $INSTDIR
  ${EndIf}
  !insertmacro CreateLabel $0 ${PAGE_X} 140 342 14 "Installed to $R1" ${CLR_TEXT_MUTED} ${CLR_BG} $FontSmall

  !insertmacro CreatePanel ${PAGE_X} 184 330 54 ${CLR_SURFACE}
  !insertmacro CreateLabel $0 212 198 286 14 "Next: open a workspace and connect a model provider." ${CLR_TEXT} ${CLR_SURFACE} $FontBody
  !insertmacro CreateLabel $0 212 216 286 12 "Settings, updates, and diagnostics are available inside the app." ${CLR_TEXT_MUTED} ${CLR_SURFACE} $FontSmall

  !insertmacro CreateDivider ${PAGE_X} ${FOOTER_Y} 340
  !insertmacro CreateSecondaryButton $BtnClose 374u 348u 76u "Close" InstallerPage_Complete_Close
  !insertmacro CreatePrimaryButton $BtnLaunch 462u 348u 96u "Launch" InstallerPage_Complete_Launch

  nsDialogs::Show
FunctionEnd

Function InstallerPage_Complete_Launch
  Exec '"$INSTDIR\${PRODUCT_NAME}.exe"'
  Quit
FunctionEnd

Function InstallerPage_Complete_Close
  Quit
FunctionEnd

; ---------------------------------------------------------------------------
; Install hooks
; ---------------------------------------------------------------------------

!macro customInit
  StrCpy $CreateDesktopShortcut "1"
  StrCpy $LaunchAfterInstall "1"
  StrCpy $EnableAutoUpdate "1"
  StrCpy $HAS_PREVIOUS_VERSION "0"
  StrCpy $PREVIOUS_VERSION ""
  StrCpy $PREVIOUS_INSTALL_PATH ""
  Call CheckExistingInstall
!macroend

!macro customInstall
  DetailPrint "${PRODUCT_NAME} installation"
  ${If} $HAS_PREVIOUS_VERSION == "1"
    DetailPrint "Upgrading from v$PREVIOUS_VERSION and preserving settings"
  ${EndIf}
  DetailPrint "Installing application files..."
!macroend

!macro customInstallFinished
  DetailPrint "Configuring Windows integration..."
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "Publisher" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayIcon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "URLInfoAbout" "https://agenticos.ai/support"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoRepair" 0

  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  ${EndIf}

  ${If} $EnableAutoUpdate == ${BST_CHECKED}
    WriteRegStr HKCU "Software\${PRODUCT_NAME}\Settings" "AutoUpdate" "true"
  ${EndIf}

  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  DetailPrint "Installation completed."
!macroend

; ---------------------------------------------------------------------------
; Uninstaller
; ---------------------------------------------------------------------------

Function un.Page_Confirm
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  Call un.InitFonts
  !insertmacro CreateChrome "Remove app" "Uninstall the desktop app. Your projects and workspace data are preserved unless you choose otherwise."

  !insertmacro CreateLabel $0 ${PAGE_X} 24 ${PAGE_W} 24 "Uninstall ${PRODUCT_NAME}" ${CLR_TEXT} ${CLR_BG} $FontHeading
  !insertmacro CreateLabel $0 ${PAGE_X} 52 342 24 "The application files will be removed from this computer." ${CLR_TEXT_MUTED} ${CLR_BG} $FontBody

  StrLen $R0 $INSTDIR
  ${If} $R0 > 58
    StrCpy $R1 $INSTDIR 55 -55
    StrCpy $R1 "...$R1"
  ${Else}
    StrCpy $R1 $INSTDIR
  ${EndIf}
  !insertmacro CreateLabel $0 ${PAGE_X} 84 342 12 "$R1" ${CLR_TEXT_DIM} ${CLR_BG} $FontMono

  !insertmacro CreateDivider ${PAGE_X} 112 340
  !insertmacro CreateLabel $0 ${PAGE_X} 128 220 10 "OPTIONAL DATA CLEANUP" ${CLR_TEXT_DIM} ${CLR_BG} $FontLabel

  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $SettingsLabel "Remove settings and configuration"
  ${Else}
    StrCpy $SettingsLabel "Remove settings and configuration (not found)"
  ${EndIf}
  !insertmacro CreateOption $UnChkSettings ${PAGE_X} 148 "$SettingsLabel" ${BST_CHECKED}

  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\cache\*.*"
    StrCpy $CacheLabel "Remove local cache"
  ${Else}
    StrCpy $CacheLabel "Remove local cache (not found)"
  ${EndIf}
  !insertmacro CreateOption $UnChkCache ${PAGE_X} 170 "$CacheLabel" ${BST_CHECKED}
  !insertmacro CreateOption $UnChkUserData ${PAGE_X} 192 "Also delete projects and user workspace data" ${BST_UNCHECKED}

  !insertmacro CreatePanel ${PAGE_X} 230 340 44 ${CLR_WARN_BG}
  !insertmacro CreateLabel $0 210 240 240 20 "Close ${PRODUCT_NAME} before removing it. This button is harmless if it is already closed." ${CLR_WARN_TEXT} ${CLR_WARN_BG} $FontSmall
  !insertmacro CreateSecondaryButton $UnBtnCloseApp 466u 240u 82u "Close app" un.CloseRunningApp

  !insertmacro CreateDivider ${PAGE_X} ${FOOTER_Y} 340
  !insertmacro CreateSecondaryButton $UnBtnCancel 374u 348u 76u "Cancel" un.Page_Confirm_Cancel
  !insertmacro CreatePrimaryButton $UnBtnUninstall 462u 348u 96u "Uninstall" un.Page_Confirm_DoUninstall

  nsDialogs::Show
FunctionEnd

Function un.Page_Confirm_Cancel
  Quit
FunctionEnd

Function un.Page_Confirm_DoUninstall
  ${NSD_GetState} $UnChkSettings $RemoveSettings
  ${NSD_GetState} $UnChkCache $RemoveCache
  ${NSD_GetState} $UnChkUserData $RemoveUserData
  ${If} $RemoveUserData == ${BST_CHECKED}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "This will delete ${PRODUCT_NAME} project and workspace data from Documents. Continue?" IDYES proceed IDNO cancel
    cancel:
      Return
    proceed:
  ${EndIf}
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function un.Page_Confirm_Leave
  DetailPrint "Preparing uninstall..."
FunctionEnd

Function un.Page_Complete
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  !insertmacro CreateChrome "Complete" "${PRODUCT_NAME} has been removed from this computer."
  !insertmacro CreateLabel $0 ${PAGE_X} 68 42 32 "OK" ${CLR_SUCCESS} ${CLR_BG} $FontMark
  !insertmacro CreateLabel $0 ${PAGE_X} 118 ${PAGE_W} 22 "${PRODUCT_NAME} has been removed" ${CLR_TEXT} ${CLR_BG} $FontTitle
  !insertmacro CreateLabel $0 ${PAGE_X} 154 344 24 "Windows shortcuts and app files were removed. Preserved data remains where you left it." ${CLR_TEXT_MUTED} ${CLR_BG} $FontBody
  !insertmacro CreateDivider ${PAGE_X} ${FOOTER_Y} 340
  !insertmacro CreatePrimaryButton $BtnClose 462u 348u 96u "Close" un.Page_Complete_Close
  nsDialogs::Show
FunctionEnd

Function un.Page_Complete_Close
  Quit
FunctionEnd

!macro customUnInit
  StrCpy $RemoveSettings "1"
  StrCpy $RemoveCache "1"
  StrCpy $RemoveUserData "0"
!macroend

!macro customUnInstall
  DetailPrint "${PRODUCT_NAME} uninstall"
  DetailPrint "Closing running instances..."
  Call un.CloseRunningApp

  DetailPrint "Removing Windows integration..."
  DeleteRegKey HKCR "Directory\shell\${PRODUCT_NAME}"
  DeleteRegKey HKCR "*\shell\${PRODUCT_NAME}"
  DeleteRegKey HKCR "Directory\Background\shell\${PRODUCT_NAME}"
  DeleteRegKey HKCR "${PRODUCT_NAME}.Project"
  DeleteRegKey HKCR "agenticos"

  DetailPrint "Removing application files..."
  SetOutPath $TEMP
  RMDir /r "$INSTDIR"

  DetailPrint "Removing shortcuts..."
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

  ${If} $RemoveSettings == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    DetailPrint "Removing settings..."
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
  ${EndIf}

  ${If} $RemoveCache == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\cache\*.*"
    DetailPrint "Removing cache..."
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}\cache"
  ${EndIf}

  ${If} $RemoveUserData == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$DOCUMENTS\${PRODUCT_NAME}\*.*"
    DetailPrint "Removing user data..."
    RMDir /r "$DOCUMENTS\${PRODUCT_NAME}"
  ${EndIf}

  DetailPrint "Cleaning registry..."
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  DetailPrint "Uninstall completed."
!macroend
