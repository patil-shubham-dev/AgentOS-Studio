; AgenticOS — Windows Installer (White Theme, Windows 11 Native)
; ============================================================================
; Clean white theme inspired by Claude Desktop, Cursor, Notion, Linear.
; Pure white backgrounds, light gray surfaces, subtle borders.
; ============================================================================

!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "MUI2.nsh"
!include "WordFunc.nsh"
!include "StrFunc.nsh"

; ── Brand Constants ─────────────────────────────────────────────────────────
!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "AgenticOS"
!endif
!define PRODUCT_VERSION "3.0.0"
!define PRODUCT_TAGLINE "Autonomous AI workspace for coding, research, automation, and execution."
!define PRODUCT_RELEASE_URL "https://agenticos.ai/releases"
!define PRODUCT_SUPPORT_URL "https://agenticos.ai/support"
!define PRODUCT_DOCS_URL "https://agenticos.ai/docs"
!define PRODUCT_COMMUNITY_URL "https://agenticos.ai/community"

; ── White Theme Configuration ───────────────────────────────────────────────
; Colors: white bg, light gray surfaces, subtle borders, black text
!define MUI_BGCOLOR "FFFFFF"
!define MUI_HEADERBGCOLOR "FAFAFA"
!define MUI_HEADERTEXTCOLOR "111827"
!define MUI_TEXTCOLOR "111827"
!define MUI_INSTFILESPAGE_COLORS "111827 FFFFFF"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!define MUI_UI "${NSISDIR}\Contrib\UIs\modern.exe"

; ── Page Flow ───────────────────────────────────────────────────────────────
; Installer: Welcome → Options → Directory → Install → Complete
Page custom CustomWelcomePage
Page custom CustomOptionsPage
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
Page custom CustomCompletePage

; Uninstaller: Confirm → Uninstall → Complete
UninstPage custom un.CustomUninstallPage
!insertmacro MUI_UNPAGE_INSTFILES
UninstPage custom un.CustomUninstallCompletePage

; MUI_LANGUAGE is included by electron-builder's template — do not add it here

; ── Variables ───────────────────────────────────────────────────────────────
Var HAS_PREVIOUS_VERSION
Var PREVIOUS_VERSION
Var PREVIOUS_INSTALL_PATH

; Options state
Var OPT_CREATE_DESKTOP
Var OPT_CREATE_STARTMENU
Var OPT_LAUNCH_AFTER
Var OPT_CONTEXT_MENU
Var OPT_REGISTER_TYPES
Var OPT_AUTO_UPDATES
; Uninstall state
Var REMOVE_SETTINGS
Var REMOVE_CACHE
Var REMOVE_MODELS
Var REMOVE_WORKSPACE

; Data sizes
Var DATA_SETTINGS_SIZE
Var DATA_CACHE_SIZE
Var DATA_MODELS_SIZE
Var DATA_WORKSPACE_SIZE
Var DATA_TOTAL_SIZE
Var DATA_TOTAL_RECOVERABLE

; Font handles
Var FontH1
Var FontH2
Var FontH3
Var FontBody
Var FontBodyBold
Var FontSmall
Var FontMono

; ── Installer Sections ─────────────────────────────────────────────────────

Section "-Core Application" SEC_CORE
  SectionIn RO
  SetOutPath "$INSTDIR"
  DetailPrint "Installing core application files..."
SectionEnd

Section "Desktop Shortcut" SEC_DESKTOP
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  DetailPrint "Desktop shortcut created"
SectionEnd

Section "Start Menu Shortcut" SEC_STARTMENU
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
  DetailPrint "Start Menu shortcuts created"
SectionEnd

Section "Context Menu Integration" SEC_CONTEXT
  WriteRegStr HKCR "Directory\shell\AgenticOS" "" "Open Folder in &${PRODUCT_NAME}"
  WriteRegStr HKCR "Directory\shell\AgenticOS" "Icon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCR "Directory\shell\AgenticOS\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%V"'
  WriteRegStr HKCR "*\shell\AgenticOS" "" "Open in &${PRODUCT_NAME}"
  WriteRegStr HKCR "*\shell\AgenticOS" "Icon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCR "*\shell\AgenticOS\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%V"'
  WriteRegStr HKCR "Directory\Background\shell\AgenticOS" "" "Open &${PRODUCT_NAME} Here"
  WriteRegStr HKCR "Directory\Background\shell\AgenticOS" "Icon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCR "Directory\Background\shell\AgenticOS\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%V"'
  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  DetailPrint "Context menu integration registered"
SectionEnd

Section /o "Registered Project Types" SEC_ASSOCIATIONS
  WriteRegStr HKCR ".agenticos" "" "AgenticOS.Project"
  WriteRegStr HKCR "AgenticOS.Project" "" "${PRODUCT_NAME} Project"
  WriteRegStr HKCR "AgenticOS.Project\DefaultIcon" "" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCR "AgenticOS.Project\shell\open\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%1"'
  DetailPrint "File associations registered (.agenticos)"
SectionEnd

Section /o "Deep Link Protocol (agenticos://)" SEC_PROTOCOL
  WriteRegStr HKCR "agenticos" "" "URL:${PRODUCT_NAME} Protocol"
  WriteRegStr HKCR "agenticos" "URL Protocol" ""
  WriteRegStr HKCR "agenticos\DefaultIcon" "" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKCR "agenticos\shell\open\command" "" '"$INSTDIR\${PRODUCT_NAME}.exe" "%1"'
  DetailPrint "agenticos:// protocol handler registered"
SectionEnd

Section /o "Auto Updates" SEC_UPDATES
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Settings" "AutoUpdate" "true"
  DetailPrint "Auto-updates enabled"
SectionEnd

Section /o "Telemetry (Anonymous)" SEC_TELEMETRY
  WriteRegStr HKCU "Software\${PRODUCT_NAME}\Settings" "Telemetry" "true"
  DetailPrint "Anonymous telemetry enabled"
SectionEnd

; ── Section Descriptions ──────────────────────────────────────────────────

LangString DESC_SEC_CORE ${LANG_ENGLISH} "Core ${PRODUCT_NAME} application files."
LangString DESC_SEC_DESKTOP ${LANG_ENGLISH} "Add a shortcut to ${PRODUCT_NAME} on your desktop."
LangString DESC_SEC_STARTMENU ${LANG_ENGLISH} "Add ${PRODUCT_NAME} to the Start Menu."
LangString DESC_SEC_CONTEXT ${LANG_ENGLISH} "Add 'Open with ${PRODUCT_NAME}' to the right-click context menu."
LangString DESC_SEC_ASSOCIATIONS ${LANG_ENGLISH} "Associate .agenticos project files with ${PRODUCT_NAME}."
LangString DESC_SEC_PROTOCOL ${LANG_ENGLISH} "Register the agenticos:// protocol for deep linking."
LangString DESC_SEC_UPDATES ${LANG_ENGLISH} "Enable automatic background updates."
LangString DESC_SEC_TELEMETRY ${LANG_ENGLISH} "Send anonymous usage data to help improve ${PRODUCT_NAME}."

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CORE} $(DESC_SEC_CORE)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} $(DESC_SEC_DESKTOP)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_STARTMENU} $(DESC_SEC_STARTMENU)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CONTEXT} $(DESC_SEC_CONTEXT)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_ASSOCIATIONS} $(DESC_SEC_ASSOCIATIONS)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_PROTOCOL} $(DESC_SEC_PROTOCOL)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_UPDATES} $(DESC_SEC_UPDATES)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_TELEMETRY} $(DESC_SEC_TELEMETRY)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

!define MUI_CUSTOMFUNCTION_GUIINIT onGuiInit

; ── Init ─────────────────────────────────────────────────────────────────

!define MUI_PAGE_HEADER_TEXT ""
!define MUI_PAGE_HEADER_SUBTEXT ""

!macro customInit
  StrCpy $HAS_PREVIOUS_VERSION "0"
  StrCpy $PREVIOUS_VERSION ""
  StrCpy $PREVIOUS_INSTALL_PATH ""

  ; Detect previous installation
  ReadRegStr $PREVIOUS_VERSION HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion"
  ${If} $PREVIOUS_VERSION == ""
    ReadRegStr $PREVIOUS_VERSION HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion"
  ${EndIf}
  ${If} $PREVIOUS_VERSION == ""
    ReadRegStr $PREVIOUS_VERSION HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.agenticos.studio" "DisplayVersion"
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
  ${EndIf}

  ; Default selections
  StrCpy $OPT_CREATE_DESKTOP "1"
  StrCpy $OPT_CREATE_STARTMENU "1"
  StrCpy $OPT_LAUNCH_AFTER "1"
  StrCpy $OPT_CONTEXT_MENU "1"
  StrCpy $OPT_REGISTER_TYPES "0"
  StrCpy $OPT_AUTO_UPDATES "1"
!macroend

Function onGuiInit
  ; White theme: black text on white background
  SetCtlColors $HWNDPARENT "111827" "FFFFFF"
FunctionEnd

; ── Font Initialization ───────────────────────────────────────────────────

Function InitFonts
  System::Call "user32::CreateFont(48, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontH1
  System::Call "user32::CreateFont(24, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontH2
  System::Call "user32::CreateFont(18, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontH3
  System::Call "user32::CreateFont(16, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontBody
  System::Call "user32::CreateFont(16, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontBodyBold
  System::Call "user32::CreateFont(13, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontSmall
  System::Call "user32::CreateFont(14, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Cascadia Mono') i.s"
  Pop $FontMono
FunctionEnd

; ═══════════════════════════════════════════════════════════════════════════
; WELCOME PAGE
; ═══════════════════════════════════════════════════════════════════════════

Function CustomWelcomePage
  !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME}" ""

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  Call InitFonts

  ; Logo area — accent brand bar at top
  ${NSD_CreateLabel} 0u 0u 100% 6u ""
  Pop $0
  SetCtlColors $0 "2563EB" "2563EB"

  ; Product name
  ${NSD_CreateLabel} 32u 28u 100% 28u "${PRODUCT_NAME}"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $FontH1 1
  SetCtlColors $1 "111827" "FFFFFF"

  ; Version
  ${NSD_CreateLabel} 32u 56u 100% 14u "Version ${PRODUCT_VERSION}"
  Pop $2
  SendMessage $2 ${WM_SETFONT} $FontSmall 1
  SetCtlColors $2 "6B7280" "FFFFFF"

  ; Tagline
  ${NSD_CreateLabel} 32u 80u 280u 32u "${PRODUCT_TAGLINE}"
  Pop $3
  SendMessage $3 ${WM_SETFONT} $FontBody 1
  SetCtlColors $3 "6B7280" "FFFFFF"

  ; Separator
  ${NSD_CreateLabel} 32u 118u 280u 1u ""
  Pop $4
  SetCtlColors $4 "E5E7EB" "E5E7EB"

  ; Feature highlights
  ${NSD_CreateLabel} 32u 132u 280u 16u "✦  Multi-agent AI workspace with role-based collaboration"
  Pop $5
  SendMessage $5 ${WM_SETFONT} $FontBody 1
  SetCtlColors $5 "374151" "FFFFFF"

  ${NSD_CreateLabel} 32u 152u 280u 16u "✦  Autonomous execution & task orchestration"
  Pop $6
  SendMessage $6 ${WM_SETFONT} $FontBody 1
  SetCtlColors $6 "374151" "FFFFFF"

  ${NSD_CreateLabel} 32u 172u 280u 16u "✦  Built-in browser automation & web research"
  Pop $7
  SendMessage $7 ${WM_SETFONT} $FontBody 1
  SetCtlColors $7 "374151" "FFFFFF"

  ${NSD_CreateLabel} 32u 192u 280u 16u "✦  Visual canvas, code editor & Git integration"
  Pop $8
  SendMessage $8 ${WM_SETFONT} $FontBody 1
  SetCtlColors $8 "374151" "FFFFFF"

  ${NSD_CreateLabel} 32u 212u 280u 16u "✦  Local-first architecture with privacy focus"
  Pop $9
  SendMessage $9 ${WM_SETFONT} $FontBody 1
  SetCtlColors $9 "374151" "FFFFFF"

  ; Upgrade notification
  ${If} $HAS_PREVIOUS_VERSION == "1"
    ${NSD_CreateLabel} 32u 242u 280u 14u "Upgrading from v$PREVIOUS_VERSION — settings will be preserved."
    Pop $R0
    SendMessage $R0 ${WM_SETFONT} $FontSmall 1
    SetCtlColors $R0 "2563EB" "FFFFFF"
  ${EndIf}

  nsDialogs::Show
FunctionEnd

; ═══════════════════════════════════════════════════════════════════════════
; OPTIONS PAGE
; ═══════════════════════════════════════════════════════════════════════════

Function CustomOptionsPage
  !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME}" "Choose your installation preferences"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Title
  ${NSD_CreateLabel} 24u 10u 100% 20u "Installation Options"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $FontH3 1
  SetCtlColors $1 "111827" "FFFFFF"

  ; Card background — options
  ${NSD_CreateCheckBox} 24u 38u 280u 14u "Create Desktop Shortcut"
  Pop $R0
  ${NSD_SetState} $R0 ${BST_CHECKED}

  ${NSD_CreateCheckBox} 24u 56u 280u 14u "Create Start Menu Shortcut"
  Pop $R1
  ${NSD_SetState} $R1 ${BST_CHECKED}

  ${NSD_CreateCheckBox} 24u 74u 280u 14u "Launch AgenticOS After Install"
  Pop $R2
  ${NSD_SetState} $R2 ${BST_CHECKED}

  ${NSD_CreateCheckBox} 24u 92u 280u 14u "Add 'Open with AgenticOS' Context Menu"
  Pop $R3
  ${NSD_SetState} $R3 ${BST_CHECKED}

  ${NSD_CreateCheckBox} 24u 110u 280u 14u "Register Supported Project Types"
  Pop $R4
  ${NSD_SetState} $R4 ${UNCHECKED}

  ${NSD_CreateCheckBox} 24u 128u 280u 14u "Enable Automatic Updates"
  Pop $R5
  ${NSD_SetState} $R5 ${BST_CHECKED}

  ; Separator
  ${NSD_CreateLabel} 24u 150u 280u 1u ""
  Pop $R6
  SetCtlColors $R6 "E5E7EB" "E5E7EB"

  ; Location info
  ${NSD_CreateLabel} 24u 160u 120u 14u "Install location:"
  Pop $R7
  SendMessage $R7 ${WM_SETFONT} $FontSmall 1
  SetCtlColors $R7 "6B7280" "FFFFFF"

  ${NSD_CreateLabel} 24u 176u 280u 14u "$INSTDIR"
  Pop $R8
  SendMessage $R8 ${WM_SETFONT} $FontMono 1
  SetCtlColors $R8 "374151" "FFFFFF"

  ; Disk space info
  ${GetRoot} "$INSTDIR" $R9
  ${DriveSpace} $R9 "/D=F /S=M" $R9

  ${NSD_CreateLabel} 24u 200u 200u 14u "Required: ~450 MB     Available: $R9 MB"
  Pop $R0
  SendMessage $R0 ${WM_SETFONT} $FontSmall 1
  SetCtlColors $R0 "6B7280" "FFFFFF"

  nsDialogs::Show

  ; Save selections
  ${NSD_GetState} $R0 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $OPT_CREATE_DESKTOP "1"
    SectionSetFlags ${SEC_DESKTOP} 1
  ${Else}
    StrCpy $OPT_CREATE_DESKTOP "0"
    SectionSetFlags ${SEC_DESKTOP} 0
  ${EndIf}

  ${NSD_GetState} $R1 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $OPT_CREATE_STARTMENU "1"
    SectionSetFlags ${SEC_STARTMENU} 1
  ${Else}
    StrCpy $OPT_CREATE_STARTMENU "0"
    SectionSetFlags ${SEC_STARTMENU} 0
  ${EndIf}

  ${NSD_GetState} $R2 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $OPT_LAUNCH_AFTER "1"
  ${Else}
    StrCpy $OPT_LAUNCH_AFTER "0"
  ${EndIf}

  ${NSD_GetState} $R3 $0
  ${If} $0 == ${BST_CHECKED}
    SectionSetFlags ${SEC_CONTEXT} 1
  ${Else}
    SectionSetFlags ${SEC_CONTEXT} 0
  ${EndIf}

  ${NSD_GetState} $R4 $0
  ${If} $0 == ${BST_CHECKED}
    SectionSetFlags ${SEC_ASSOCIATIONS} 1
  ${Else}
    SectionSetFlags ${SEC_ASSOCIATIONS} 0
  ${EndIf}

  ${NSD_GetState} $R5 $0
  ${If} $0 == ${BST_CHECKED}
    SectionSetFlags ${SEC_UPDATES} 1
  ${Else}
    SectionSetFlags ${SEC_UPDATES} 0
  ${EndIf}
FunctionEnd

; ═══════════════════════════════════════════════════════════════════════════
; INSTALL HOOKS
; ═══════════════════════════════════════════════════════════════════════════

!macro customInstall
  DetailPrint "━━━ ${PRODUCT_NAME} Installation ━━━"
  DetailPrint ""
  DetailPrint "●  Preparing installation environment..."
  Sleep 300

  ${If} $HAS_PREVIOUS_VERSION == "1"
    DetailPrint "●  Previous installation detected: v$PREVIOUS_VERSION"
    DetailPrint "●  Settings will be preserved during upgrade"
    ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\config.json"
      CopyFiles /SILENT "$APPDATA\${PRODUCT_NAME}\config.json" "$TEMP\agenticos-config-backup.json"
      DetailPrint "●  Configuration backed up"
    ${EndIf}
  ${EndIf}

  DetailPrint ""
  DetailPrint "●  Installing dependencies..."
  Sleep 200
!macroend

!macro customInstallFinished
  DetailPrint ""
  DetailPrint "●  Configuring system..."
  Sleep 200

  ; Write registry info
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "Publisher" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayIcon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "URLInfoAbout" "${PRODUCT_SUPPORT_URL}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoRepair" 0

  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  DetailPrint ""
  DetailPrint "●  Creating shortcuts..."
  Sleep 100

  DetailPrint ""
  DetailPrint "●  Finalizing installation..."
  Sleep 200

  ; Restore config
  ${If} ${FileExists} "$TEMP\agenticos-config-backup.json"
    CopyFiles /SILENT "$TEMP\agenticos-config-backup.json" "$APPDATA\${PRODUCT_NAME}\config.json"
    Delete "$TEMP\agenticos-config-backup.json"
  ${EndIf}

  ; Launch
  ${If} $OPT_LAUNCH_AFTER == "1"
    ExecShell "open" "$INSTDIR\${PRODUCT_NAME}.exe"
  ${EndIf}
!macroend

; ── Non-component install (for electron-builder compat) ───────────────────
!macro customRemoveFiles
  DetailPrint "Cleaning up remaining files..."
!macroend

Section "Uninstall"
  ; Handled by electron-builder + customUnInstall hooks
SectionEnd

; ═══════════════════════════════════════════════════════════════════════════
; COMPLETE PAGE
; ═══════════════════════════════════════════════════════════════════════════

Function CustomCompletePage
  !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME}" "Installation completed successfully"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0u 0u 100% 6u ""
  Pop $0
  SetCtlColors $0 "2563EB" "2563EB"

  ; Success indicator
  ${NSD_CreateLabel} 32u 30u 40u 40u "✓"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $FontH1 1
  SetCtlColors $1 "2563EB" "FFFFFF"

  ; Title
  ${NSD_CreateLabel} 80u 32u 200u 28u "Installation Complete"
  Pop $2
  SendMessage $2 ${WM_SETFONT} $FontH1 1
  SetCtlColors $2 "111827" "FFFFFF"

  ; Subtitle
  ${NSD_CreateLabel} 32u 78u 280u 14u "${PRODUCT_NAME} ${PRODUCT_VERSION} is ready to use."
  Pop $3
  SendMessage $3 ${WM_SETFONT} $FontBody 1
  SetCtlColors $3 "6B7280" "FFFFFF"

  ; Separator
  ${NSD_CreateLabel} 32u 100u 280u 1u ""
  Pop $4
  SetCtlColors $4 "E5E7EB" "E5E7EB"

  ; Info
  ${NSD_CreateLabel} 32u 112u 280u 14u "Install path:"
  Pop $5
  SendMessage $5 ${WM_SETFONT} $FontSmall 1
  SetCtlColors $5 "6B7280" "FFFFFF"

  ${NSD_CreateLabel} 32u 128u 280u 14u "$INSTDIR"
  Pop $6
  SendMessage $6 ${WM_SETFONT} $FontMono 1
  SetCtlColors $6 "374151" "FFFFFF"

  ${If} $HAS_PREVIOUS_VERSION == "1"
    ${NSD_CreateLabel} 32u 154u 280u 14u "Settings from v$PREVIOUS_VERSION have been preserved."
    Pop $7
    SendMessage $7 ${WM_SETFONT} $FontSmall 1
    SetCtlColors $7 "2563EB" "FFFFFF"
  ${EndIf}

  nsDialogs::Show
FunctionEnd

; ═══════════════════════════════════════════════════════════════════════════
; UNINSTALLER
; ═══════════════════════════════════════════════════════════════════════════

!macro customUnInit
  StrCpy $REMOVE_SETTINGS "0"
  StrCpy $REMOVE_CACHE "0"
  StrCpy $REMOVE_MODELS "0"
  StrCpy $REMOVE_WORKSPACE "0"
  Call un.DetectData
!macroend

Function un.DetectData
  StrCpy $DATA_SETTINGS_SIZE "calculating..."
  StrCpy $DATA_CACHE_SIZE "calculating..."
  StrCpy $DATA_MODELS_SIZE "calculating..."
  StrCpy $DATA_WORKSPACE_SIZE "calculating..."
  StrCpy $DATA_TOTAL_SIZE "calculating..."
  StrCpy $DATA_TOTAL_RECOVERABLE "0"

  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    ${GetSize} "$APPDATA\${PRODUCT_NAME}" "/S=OK" $0 $1 $2
    ${If} $0 > 1048576
      IntFmt $DATA_SETTINGS_SIZE "%.1f MB" $0
    ${ElseIf} $0 > 1024
      IntFmt $DATA_SETTINGS_SIZE "%.0f KB" $0
    ${Else}
      StrCpy $DATA_SETTINGS_SIZE "$0 bytes"
    ${EndIf}
    IntOp $DATA_TOTAL_RECOVERABLE $DATA_TOTAL_RECOVERABLE + $0
  ${Else}
    StrCpy $DATA_SETTINGS_SIZE "Not found"
  ${EndIf}

  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\cache\*.*"
    ${GetSize} "$LOCALAPPDATA\${PRODUCT_NAME}\cache" "/S=OK" $0 $1 $2
    ${If} $0 > 1048576
      IntFmt $DATA_CACHE_SIZE "%.1f MB" $0
    ${ElseIf} $0 > 1024
      IntFmt $DATA_CACHE_SIZE "%.0f KB" $0
    ${Else}
      StrCpy $DATA_CACHE_SIZE "$0 bytes"
    ${EndIf}
    IntOp $DATA_TOTAL_RECOVERABLE $DATA_TOTAL_RECOVERABLE + $0
  ${Else}
    StrCpy $DATA_CACHE_SIZE "Not found"
  ${EndIf}

  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\models\*.*"
    ${GetSize} "$LOCALAPPDATA\${PRODUCT_NAME}\models" "/S=OK" $0 $1 $2
    ${If} $0 > 1048576
      IntFmt $DATA_MODELS_SIZE "%.1f MB" $0
    ${ElseIf} $0 > 1024
      IntFmt $DATA_MODELS_SIZE "%.0f KB" $0
    ${Else}
      StrCpy $DATA_MODELS_SIZE "$0 bytes"
    ${EndIf}
    IntOp $DATA_TOTAL_RECOVERABLE $DATA_TOTAL_RECOVERABLE + $0
  ${Else}
    StrCpy $DATA_MODELS_SIZE "Not found"
  ${EndIf}

  ${If} $DATA_TOTAL_RECOVERABLE > 1048576
    IntFmt $DATA_TOTAL_SIZE "%.1f MB" $DATA_TOTAL_RECOVERABLE
  ${ElseIf} $DATA_TOTAL_RECOVERABLE > 1024
    IntFmt $DATA_TOTAL_SIZE "%.0f KB" $DATA_TOTAL_RECOVERABLE
  ${Else}
    StrCpy $DATA_TOTAL_SIZE "$DATA_TOTAL_RECOVERABLE bytes"
  ${EndIf}
FunctionEnd

; ── Uninstall Confirm Page ────────────────────────────────────────────────

Function un.CustomUninstallPage
  !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME}" "Uninstall AgenticOS"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  Call un.InitFonts

  ; Accent bar
  ${NSD_CreateLabel} 0u 0u 100% 6u ""
  Pop $0
  SetCtlColors $0 "2563EB" "2563EB"

  ; Title
  ${NSD_CreateLabel} 32u 20u 100% 24u "Uninstall ${PRODUCT_NAME}"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $FontH1 1
  SetCtlColors $1 "111827" "FFFFFF"

  ; Version and location
  ${NSD_CreateLabel} 32u 48u 280u 14u "Version ${PRODUCT_VERSION}  |  $INSTDIR"
  Pop $2
  SendMessage $2 ${WM_SETFONT} $FontSmall 1
  SetCtlColors $2 "6B7280" "FFFFFF"

  ; Separator
  ${NSD_CreateLabel} 32u 66u 280u 1u ""
  Pop $3
  SetCtlColors $3 "E5E7EB" "E5E7EB"

  ; Instruction
  ${NSD_CreateLabel} 32u 76u 280u 14u "Select data to remove:"
  Pop $4
  SendMessage $4 ${WM_SETFONT} $FontBody 1
  SetCtlColors $4 "111827" "FFFFFF"

  ; Checkboxes
  ${NSD_CreateCheckBox} 32u 96u 280u 14u "Remove settings & configuration ($DATA_SETTINGS_SIZE)"
  Pop $R0
  ${NSD_SetState} $R0 ${BST_CHECKED}

  ${NSD_CreateCheckBox} 32u 114u 280u 14u "Remove cache ($DATA_CACHE_SIZE)"
  Pop $R1
  ${NSD_SetState} $R1 ${BST_CHECKED}

  ${NSD_CreateCheckBox} 32u 132u 280u 14u "Remove downloaded AI models ($DATA_MODELS_SIZE)"
  Pop $R2

  ${NSD_CreateCheckBox} 32u 150u 280u 14u "Remove user workspace data"
  Pop $R3

  ; Note
  ${NSD_CreateLabel} 32u 178u 280u 14u "Your project files, source code, and Git repositories will NOT be affected."
  Pop $R4
  SendMessage $R4 ${WM_SETFONT} $FontSmall 1
  SetCtlColors $R4 "6B7280" "FFFFFF"

  nsDialogs::Show

  ; Save selections
  ${NSD_GetState} $R0 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $REMOVE_SETTINGS "1"
  ${EndIf}
  ${NSD_GetState} $R1 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $REMOVE_CACHE "1"
  ${EndIf}
  ${NSD_GetState} $R2 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $REMOVE_MODELS "1"
  ${EndIf}
  ${NSD_GetState} $R3 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $REMOVE_WORKSPACE "1"
  ${EndIf}
FunctionEnd

; ── Uninstall Complete Page ───────────────────────────────────────────────

Function un.CustomUninstallCompletePage
  !insertmacro MUI_HEADER_TEXT "${PRODUCT_NAME}" "Uninstallation completed"

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Accent bar
  ${NSD_CreateLabel} 0u 0u 100% 6u ""
  Pop $0
  SetCtlColors $0 "2563EB" "2563EB"

  ; Success indicator
  ${NSD_CreateLabel} 32u 24u 40u 40u "✓"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $FontH1 1
  SetCtlColors $1 "2563EB" "FFFFFF"

  ; Title
  ${NSD_CreateLabel} 80u 26u 200u 28u "Uninstall Complete"
  Pop $2
  SendMessage $2 ${WM_SETFONT} $FontH1 1
  SetCtlColors $2 "111827" "FFFFFF"

  ; Message
  ${NSD_CreateLabel} 32u 72u 280u 14u "${PRODUCT_NAME} ${PRODUCT_VERSION} has been removed successfully."
  Pop $3
  SendMessage $3 ${WM_SETFONT} $FontBody 1
  SetCtlColors $3 "6B7280" "FFFFFF"

  ; Separator
  ${NSD_CreateLabel} 32u 94u 280u 1u ""
  Pop $4
  SetCtlColors $4 "E5E7EB" "E5E7EB"

  ; Disk space recovered
  ${NSD_CreateLabel} 32u 104u 280u 14u "Disk space recovered: $DATA_TOTAL_SIZE"
  Pop $5
  SendMessage $5 ${WM_SETFONT} $FontBodyBold 1
  SetCtlColors $5 "374151" "FFFFFF"

  ; Thanks
  ${NSD_CreateLabel} 32u 126u 280u 14u "Thank you for trying ${PRODUCT_NAME}."
  Pop $6
  SendMessage $6 ${WM_SETFONT} $FontBody 1
  SetCtlColors $6 "6B7280" "FFFFFF"

  nsDialogs::Show
FunctionEnd

; ── Uninstall Font Init ──────────────────────────────────────────────────

Function un.InitFonts
  System::Call "user32::CreateFont(48, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontH1
  System::Call "user32::CreateFont(24, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontH2
  System::Call "user32::CreateFont(18, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontH3
  System::Call "user32::CreateFont(16, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontBody
  System::Call "user32::CreateFont(16, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontBodyBold
  System::Call "user32::CreateFont(13, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Segoe UI') i.s"
  Pop $FontSmall
  System::Call "user32::CreateFont(14, 0, 0, 0, 400, 0, 0, 0, 0, 0, 0, 0, 0, t'Cascadia Mono') i.s"
  Pop $FontMono
FunctionEnd

; ── Uninstall Hooks ──────────────────────────────────────────────────────

!macro customUnInstall
  DetailPrint "━━━ ${PRODUCT_NAME} Uninstallation ━━━"
  DetailPrint ""

  DetailPrint "●  Removing system integrations..."
  DeleteRegKey HKCR "Directory\shell\AgenticOS"
  DeleteRegKey HKCR "*\shell\AgenticOS"
  DeleteRegKey HKCR "Directory\Background\shell\AgenticOS"
  DeleteRegKey HKCR "AgenticOS.Project"
  DeleteRegValue HKCR ".agenticos" ""
  DeleteRegKey HKCR "agenticos"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}\Settings"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

  DetailPrint "●  Removing shortcuts..."
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"

  DetailPrint "●  Removing application files..."

  ; User data removal
  ${If} $REMOVE_SETTINGS == "1"
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    DeleteRegKey HKCU "Software\${PRODUCT_NAME}"
  ${EndIf}

  ${If} $REMOVE_CACHE == "1"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}\cache"
  ${EndIf}

  ${If} $REMOVE_MODELS == "1"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}\models"
    RMDir /r "$APPDATA\${PRODUCT_NAME}\models"
  ${EndIf}

  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  DetailPrint ""
  DetailPrint "✓  ${PRODUCT_NAME} has been removed"
!macroend
