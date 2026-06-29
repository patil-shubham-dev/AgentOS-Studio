; ============================================================================
; AgenticOS — Windows Installer NSIS Script
; ============================================================================
;
; Architecture:  4 installer pages (custom nsDialogs + styled instfiles)
;                2 uninstaller pages (custom nsDialogs, no instfiles)
; Theme:         Dark (#0D0D0D bg, #2563EB accent, #FFFFFF text)
; Dependencies:  nsDialogs, NSD_*, MUI2
; Builder:       electron-builder via !include
;
; Sections are ordered for clarity. Each section's purpose is documented.
; ============================================================================

; ═════════════════════════════════════════════════════════════════════════════
; 1. INCLUDES
; ═════════════════════════════════════════════════════════════════════════════

!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "StrFunc.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"

; ═════════════════════════════════════════════════════════════════════════════
; 2. GLOBAL CONSTANTS — all magic numbers are defined here
; ═════════════════════════════════════════════════════════════════════════════

; Window
!define INSTALLER_WIDTH      540
!define INSTALLER_HEIGHT     420
!define INSTALLER_DIALOG_ID  1018

; Layout
!define CONTENT_MARGIN       20
!define SECTION_GAP          10
!define CONTROL_SPACING      8
!define BUTTON_WIDTH         140
!define BUTTON_HEIGHT        26
!define SMALL_BUTTON_WIDTH   60
!define SMALL_BUTTON_HEIGHT  16
!define CHECKBOX_WIDTH       420
!define CHECKBOX_HEIGHT      14
!define LABEL_WIDTH_FULL     "100%"
!define DIVIDER_HEIGHT       1
!define DIVIDER_WIDTH        460
!define HEADER_IMAGE_WIDTH   150
!define HEADER_IMAGE_HEIGHT  57

; Font sizes (points)
!define FONT_SIZE_SMALL      7
!define FONT_SIZE_BODY       9
!define FONT_SIZE_TITLE      22
!define FONT_SIZE_HEADING    14
!define FONT_SIZE_MONO       8
!define FONT_SIZE_CHECKMARK  28
!define FONT_SIZE_WARN       8

; ═════════════════════════════════════════════════════════════════════════════
; 3. BRAND COLORS — NSIS uses BGR (0xBBGGRR) format, not RGB
; ═════════════════════════════════════════════════════════════════════════════

; #0D0D0D = background       → BGR: 0x0D0D0D
; #FFFFFF = primary text      → BGR: 0xFFFFFF
; #A0A0A0 = secondary text   → BGR: 0xA0A0A0
; #2563EB = accent blue       → BGR: 0xEB6325
; #1E1E1E = surface/card bg  → BGR: 0x1E1E1E
; #FF4444 = destructive red  → BGR: 0x4444FF
; #2A2A2A = input/field bg   → BGR: 0x2A2A2A
; #3A3A3A = border/divider   → BGR: 0x3A3A3A
; #FFAA00 = warning amber    → BGR: 0x00AAFF
; #1A1A00 = warning bg       → BGR: 0x001A1A

!define CLR_BG         0x0D0D0D
!define CLR_SURFACE    0x1E1E1E
!define CLR_TEXT       0xFFFFFF
!define CLR_TEXT_MUTED 0xA0A0A0
!define CLR_ACCENT     0xEB6325
!define CLR_DANGER     0x4444FF
!define CLR_INPUT_BG   0x2A2A2A
!define CLR_BORDER     0x3A3A3A
!define CLR_WARN_TEXT  0x00AAFF
!define CLR_WARN_BG    0x001A1A

; ═════════════════════════════════════════════════════════════════════════════
; 4. PRODUCT METADATA
; ═════════════════════════════════════════════════════════════════════════════

!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "AgenticOS"
!endif
!define PRODUCT_TAGLINE "Autonomous AI workspace for coding, research, and execution."

; VERSION is defined by electron-builder via /DVERSION="x.y.z" in the NSIS config
; Do not set a fallback here — electron-builder always provides it.

; ═════════════════════════════════════════════════════════════════════════════
; 5. MUI2 CONFIGURATION & OVERRIDES
; ═════════════════════════════════════════════════════════════════════════════

; Header image and sidebar are set by electron-builder via installerHeader and
; installerSidebar config options. We do not define them here.
; We use a dark sidebar bitmap (build/assets/sidebar.bmp) so MUI welcome/finish
; pages blend into the background if they appear.

; Unified dialog background
!define MUI_BGCOLOR "0D0D0D"

; Progress bar styling
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"

; Abort warning
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Cancel the ${PRODUCT_NAME} installation?"
!define MUI_ABORTWARNING_CANCEL_DEFAULT

; GUI init hook — used for window sizing and centering
!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT myGUIInit

  ; InstFiles page customization hooks
  !define MUI_PAGE_CUSTOMFUNCTION_PRE   InstFilesPage_Pre
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW  InstFilesPage_Show

  ; Remove MUI header text defaults — we handle headers ourselves on custom pages
  !define MUI_PAGE_HEADER_TEXT ""
  !define MUI_PAGE_HEADER_SUBTEXT ""
!endif

; ═════════════════════════════════════════════════════════════════════════════
; 6. VARIABLES
; ═════════════════════════════════════════════════════════════════════════════

; ── Font handles ──────────────────────────────────────────────────────────
Var FontTitle
Var FontBody
Var FontSmall
Var FontLabel
Var FontMono
Var FontCheck
Var FontDone
Var FontHeading
Var FontWarn

; ── Installer UI controls ─────────────────────────────────────────────────
; Welcome page
Var LabelTitle
Var LabelTagline
Var LabelVersion
Var BtnNext
Var LinkCancel

; Preferences page
Var DirInput
Var BtnBrowse
Var LabelSpace
Var LabelLocSection
Var LabelOptSection
Var ChkDesktop
Var ChkLaunch
Var ChkAutoUpdate
Var Divider1
Var Divider2
Var LabelStep
Var BtnBack
Var BtnInstall

; Complete page
Var LabelCheck
Var LabelDone
Var LabelPath
Var BtnLaunch
Var LinkClose
Var DividerFinal

; ── Installer state ───────────────────────────────────────────────────────
Var CreateDesktopShortcut
Var LaunchAfterInstall
Var EnableAutoUpdate
Var HAS_PREVIOUS_VERSION
Var PREVIOUS_VERSION
Var PREVIOUS_INSTALL_PATH

; ── Uninstaller UI controls ───────────────────────────────────────────────
Var UnLabelTitle
Var UnLabelVer
Var UnLabelPath
Var UnLabelSection
Var UnChkSettings
Var UnChkCache
Var UnChkUserData
Var UnWarnBg
Var UnWarnText
Var UnBtnCloseApp
Var UnBtnCancel
Var UnBtnUninstall
Var UnLabelCheck
Var UnLabelDone
Var UnLabelSpace
Var UnBtnClose
Var UnDiv1
Var UnDiv2
Var UnBottomOffset
Var AppRunning

; ── Uninstaller state ─────────────────────────────────────────────────────
Var RemoveSettings
Var RemoveCache
Var RemoveUserData
Var SettingsLabel
Var CacheLabel
Var DATA_SETTINGS_SIZE
Var DATA_CACHE_SIZE
Var DATA_USERDATA_SIZE
Var DATA_TOTAL_RECOVERABLE
Var DATA_TOTAL_SIZE_STR

; ═════════════════════════════════════════════════════════════════════════════
; 7. SHARED UI MACROS
; ═════════════════════════════════════════════════════════════════════════════
;
; These macros provide reusable UI patterns across installer and uninstaller.
; They require font handles ($FontLabel, $FontBody, etc.) to be initialized
; before use (see InitFonts / un.InitFonts).
;
; Macros clobber $0 and $R0 — caller should save registers if needed.
; ═════════════════════════════════════════════════════════════════════════════

; ── Section title label ─────────────────────────────────────────────────────
!macro CreateSectionTitle x y width text
  ${NSD_CreateLabel} ${x}u ${y}u ${width}u 10u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $0 ${WM_SETFONT} $FontLabel 0
!macroend

; ── Muted body label ────────────────────────────────────────────────────────
!macro CreateMutedLabel x y width height text
  ${NSD_CreateLabel} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $0 ${WM_SETFONT} $FontBody 0
!macroend

; ── White body label ────────────────────────────────────────────────────────
!macro CreateBodyLabel x y width height text
  ${NSD_CreateLabel} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT} ${CLR_BG}
  SendMessage $0 ${WM_SETFONT} $FontBody 0
!macroend

; ── White heading label ─────────────────────────────────────────────────────
!macro CreateHeading x y width height text
  ${NSD_CreateLabel} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT} ${CLR_BG}
  SendMessage $0 ${WM_SETFONT} $FontHeading 0
!macroend

; ── Horizontal divider ──────────────────────────────────────────────────────
; Draws a 1px line using a colored label control.
!macro CreateDivider x y width
  ${NSD_CreateLabel} ${x}u ${y}u ${width}u ${DIVIDER_HEIGHT}u ""
  Pop $0
  SetCtlColors $0 ${CLR_BORDER} ${CLR_BORDER}
!macroend

; ── Checkbox with dark theme colors ─────────────────────────────────────────
!macro CreateThemedCheckbox x y width height text
  ${NSD_CreateCheckBox} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT} ${CLR_BG}
!macroend

; ── Primary action button ───────────────────────────────────────────────────
; Note: SetCtlColors cannot style button backgrounds on themed Windows.
; This is a known NSIS limitation — buttons will use the system theme.
!macro CreatePrimaryButton x y width height text
  ${NSD_CreateButton} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
!macroend

; ── Secondary/back button ───────────────────────────────────────────────────
!macro CreateSecondaryButton x y width height text
  ${NSD_CreateButton} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
!macroend

; ── Link-style button ───────────────────────────────────────────────────────
!macro CreateLinkButton x y width height text
  ${NSD_CreateLink} ${x}u ${y}u ${width}u ${height}u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT_MUTED} ${CLR_BG}
!macroend

; ── Step indicator ──────────────────────────────────────────────────────────
!macro CreateStepIndicator x y text
  ${NSD_CreateLabel} ${x}u ${y}u 100u 12u "${text}"
  Pop $0
  SetCtlColors $0 ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $0 ${WM_SETFONT} $FontSmall 0
!macroend

; ═════════════════════════════════════════════════════════════════════════════
; 8. LOGGING
; ═════════════════════════════════════════════════════════════════════════════
;
; Structured logging via DetailPrint for diagnostic traceability.
; Log format: [AgenticOS] <event>: <message>
; ═════════════════════════════════════════════════════════════════════════════

!macro Log event message
  Push $R0
  DetailPrint "[${PRODUCT_NAME}] ${event}: ${message}"
  Pop $R0
!macroend

Function Log
  Pop $R1
  Pop $R0
  DetailPrint "[${PRODUCT_NAME}] $R0: $R1"
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 9. FONT MANAGEMENT
; ═════════════════════════════════════════════════════════════════════════════
;
; Fonts are created once per context (installer/uninstaller) and reused.
; CreateFont parameters: face, point_size, weight
; ═════════════════════════════════════════════════════════════════════════════

Function InitFonts
  CreateFont $FontTitle    "Segoe UI" ${FONT_SIZE_TITLE}  700
  CreateFont $FontHeading  "Segoe UI" ${FONT_SIZE_HEADING} 700
  CreateFont $FontBody     "Segoe UI" ${FONT_SIZE_BODY}   400
  CreateFont $FontSmall    "Segoe UI" ${FONT_SIZE_SMALL}  400
  CreateFont $FontLabel    "Segoe UI" ${FONT_SIZE_SMALL}  700
  CreateFont $FontMono     "Consolas" ${FONT_SIZE_MONO}   400
  CreateFont $FontCheck    "Segoe UI Symbol" ${FONT_SIZE_CHECKMARK} 700
  CreateFont $FontDone     "Segoe UI" ${FONT_SIZE_HEADING} 700
  CreateFont $FontWarn     "Segoe UI" ${FONT_SIZE_WARN}   400
FunctionEnd

Function un.InitFonts
  CreateFont $FontTitle    "Segoe UI" ${FONT_SIZE_TITLE}  700
  CreateFont $FontHeading  "Segoe UI" ${FONT_SIZE_HEADING} 700
  CreateFont $FontBody     "Segoe UI" ${FONT_SIZE_BODY}   400
  CreateFont $FontSmall    "Segoe UI" ${FONT_SIZE_SMALL}  400
  CreateFont $FontLabel    "Segoe UI" ${FONT_SIZE_SMALL}  700
  CreateFont $FontMono     "Consolas" ${FONT_SIZE_MONO}   400
  CreateFont $FontCheck    "Segoe UI Symbol" ${FONT_SIZE_CHECKMARK} 700
  CreateFont $FontDone     "Segoe UI" ${FONT_SIZE_HEADING} 700
  CreateFont $FontWarn     "Segoe UI" ${FONT_SIZE_WARN}   400
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 10. WINDOW MANAGEMENT
; ═════════════════════════════════════════════════════════════════════════════
;
; Resizes and centers the installer window on screen.
; Called via MUI_CUSTOMFUNCTION_GUIINIT.
; ═════════════════════════════════════════════════════════════════════════════

!ifndef BUILD_UNINSTALLER
Function myGUIInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4

  ; Resize to fixed dimensions
  System::Call 'user32::SetWindowPos(i $HWNDPARENT, i 0, i 0, i 0, i ${INSTALLER_WIDTH}, i ${INSTALLER_HEIGHT}, i 0x16)'

  ; Center on screen
  System::Call 'user32::GetSystemMetrics(i 0) i .r1'
  System::Call 'user32::GetSystemMetrics(i 1) i .r2'
  IntOp $3 $1 - ${INSTALLER_WIDTH}
  IntOp $3 $3 / 2
  IntOp $4 $2 - ${INSTALLER_HEIGHT}
  IntOp $4 $4 / 2
  System::Call 'user32::SetWindowPos(i $HWNDPARENT, i 0, i $3, i $4, i 0, i 0, i 0x15)'

  !insertmacro Log "GUI" "Window initialized: ${INSTALLER_WIDTH}x${INSTALLER_HEIGHT} centered"

  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

; ═════════════════════════════════════════════════════════════════════════════
; 11. PROCESS MANAGEMENT
; ═════════════════════════════════════════════════════════════════════════════
;
; Handles running application detection and graceful termination.
; Protocol: graceful request → wait → force terminate (fallback)
; Uses taskkill (built into Windows) via NSIS ExecWait.
; No external NSIS plugins required.
; ═════════════════════════════════════════════════════════════════════════════

!macro CloseRunningApp
  !insertmacro Log "PROCESS" "Attempting to close ${PRODUCT_NAME}.exe gracefully..."
  ExecWait 'taskkill /IM "${PRODUCT_NAME}.exe"'
  Sleep 1500
  !insertmacro Log "PROCESS" "Verifying ${PRODUCT_NAME}.exe closed..."
  ExecWait 'taskkill /IM "${PRODUCT_NAME}.exe" /F'
  Sleep 1000
  !insertmacro Log "PROCESS" "${PRODUCT_NAME}.exe close sequence completed"
!macroend

Function CloseRunningApp
  !insertmacro CloseRunningApp
FunctionEnd

Function un.CloseRunningApp
  !insertmacro Log "PROCESS" "Uninstaller: closing ${PRODUCT_NAME}.exe gracefully..."
  ExecWait 'taskkill /IM "${PRODUCT_NAME}.exe"'
  Sleep 1500
  !insertmacro Log "PROCESS" "Uninstaller: force closing if still running..."
  ExecWait 'taskkill /IM "${PRODUCT_NAME}.exe" /F'
  Sleep 1000
  !insertmacro Log "PROCESS" "Uninstaller: close sequence completed"
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 12. DISK SPACE HELPERS
; ═════════════════════════════════════════════════════════════════════════════

Function GetDiskSpace
  Pop $R0
  ${DriveSpace} $R0 "/D=F /S=M" $R1
  Push $R1
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 13. ERROR RECOVERY HELPERS
; ═════════════════════════════════════════════════════════════════════════════

; Checks whether the install directory exists and contains a previous install.
; This is used to detect upgrades vs fresh installs.
Function CheckExistingInstall
  Push $0
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
    !insertmacro Log "UPGRADE" "Previous installation detected: v$PREVIOUS_VERSION at $INSTDIR"
  ${Else}
    StrCpy $HAS_PREVIOUS_VERSION "0"
    !insertmacro Log "INSTALL" "Fresh installation — no previous version found"
  ${EndIf}

  Pop $0
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 14. PAGE DECLARATIONS
; ═════════════════════════════════════════════════════════════════════════════
;
; Page flow:
;   Installer:  Welcome → Preferences → Installing → Complete
;   Uninstaller: Confirm → Complete (uninstall execution happens in Confirm_Leave)
;
; Note: MUI_PAGE_INSTFILES is supplied by electron-builder's template.
; We customize it via MUI_PAGE_CUSTOMFUNCTION_PRE and _SHOW (defined above).
; ═════════════════════════════════════════════════════════════════════════════

!ifndef BUILD_UNINSTALLER
  ; Installer pages
  Page custom InstallerPage_Welcome    InstallerPage_Welcome_Leave
  Page custom InstallerPage_Prefs      InstallerPage_Prefs_Leave
  !insertmacro MUI_PAGE_INSTFILES
  Page custom InstallerPage_Complete   ""
!endif

!ifdef BUILD_UNINSTALLER
  ; Uninstaller pages
  UninstPage custom un.Page_Confirm   un.Page_Confirm_Leave
  UninstPage custom un.Page_Complete  ""
!endif

; MUI_LANGUAGE is included by electron-builder's template — do not add it here.

; ═════════════════════════════════════════════════════════════════════════════
; 15. INSTALLER — WELCOME PAGE
; ═════════════════════════════════════════════════════════════════════════════
;
; Layout:
;   AgenticOS (centered, bold, 22pt)
;   Tagline (centered, muted, 9pt)
;   Version (centered, muted, 7pt)
;   [Get Started] (accent button, centered)
;   Cancel (link, centered, muted)
; ═════════════════════════════════════════════════════════════════════════════

Function InstallerPage_Welcome
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${CLR_BG}"

  Call InitFonts

  ; ── Product name ──────────────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 80u ${LABEL_WIDTH_FULL} 30u "${PRODUCT_NAME}"
  Pop $LabelTitle
  SetCtlColors $LabelTitle ${CLR_TEXT} ${CLR_BG}
  SendMessage $LabelTitle ${WM_SETFONT} $FontTitle 0
  ${NSD_AddStyle} $LabelTitle ${SS_CENTER}

  ; ── Tagline ───────────────────────────────────────────────────────────────
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 118u 460u 18u "${PRODUCT_TAGLINE}"
  Pop $LabelTagline
  SetCtlColors $LabelTagline ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $LabelTagline ${WM_SETFONT} $FontBody 0
  ${NSD_AddStyle} $LabelTagline ${SS_CENTER}

  ; ── Version ───────────────────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 140u ${LABEL_WIDTH_FULL} 12u "v${VERSION}"
  Pop $LabelVersion
  SetCtlColors $LabelVersion ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $LabelVersion ${WM_SETFONT} $FontSmall 0
  ${NSD_AddStyle} $LabelVersion ${SS_CENTER}

  ; ── Get Started button ────────────────────────────────────────────────────
  ; Centered: (540 - 140) / 2 = 200
  ${NSD_CreateButton} 200u 178u ${BUTTON_WIDTH}u ${BUTTON_HEIGHT}u "Get Started"
  Pop $BtnNext
  ${NSD_OnClick} $BtnNext InstallerPage_Welcome_Next

  ; ── Cancel link ──────────────────────────────────────────────────────────
  ${NSD_CreateLink} 230u 212u 80u 12u "Cancel"
  Pop $LinkCancel
  SetCtlColors $LinkCancel ${CLR_TEXT_MUTED} ${CLR_BG}
  ${NSD_OnClick} $LinkCancel InstallerPage_Welcome_Cancel

  !insertmacro Log "PAGE" "Welcome page displayed (v${VERSION})"

  nsDialogs::Show
FunctionEnd

Function InstallerPage_Welcome_Next
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function InstallerPage_Welcome_Cancel
  MessageBox MB_YESNO|MB_ICONQUESTION "Cancel the ${PRODUCT_NAME} installation?" IDYES abort IDNO done
  abort:
    !insertmacro Log "INSTALL" "User cancelled installation from Welcome page"
    Quit
  done:
FunctionEnd

Function InstallerPage_Welcome_Leave
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 16. INSTALLER — PREFERENCES PAGE
; ═════════════════════════════════════════════════════════════════════════════
;
; Layout:
;   INSTALL LOCATION (section label)
;   [dir input field                  ] [Browse]
;   604 MB required · 26.7 GB available (muted)
;   ───────────────────────────────── (divider)
;   OPTIONS (section label)
;   ☐ Create desktop shortcut
;   ☐ Launch AgenticOS after install
;   ☐ Enable automatic updates
;   ───────────────────────────────── (divider)
;   2 of 3 (step indicator)    [Back] [Install]
; ═════════════════════════════════════════════════════════════════════════════

Function InstallerPage_Prefs
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${CLR_BG}"

  ; ── Section: Install Location ────────────────────────────────────────────
  !insertmacro CreateSectionTitle ${CONTENT_MARGIN}u 14u 200u "INSTALL LOCATION"

  ; Path input field
  ${NSD_CreateText} ${CONTENT_MARGIN}u 28u 360u 16u $INSTDIR
  Pop $DirInput
  SetCtlColors $DirInput ${CLR_TEXT} ${CLR_INPUT_BG}

  ; Browse button
  !insertmacro CreateSecondaryButton 388u 28u 60u 16u "Browse..."
  Pop $BtnBrowse
  ${NSD_OnClick} $BtnBrowse InstallerPage_Prefs_Browse

  ; Disk space info
  ${GetRoot} "$INSTDIR" $R0
  ${DriveSpace} $R0 "/D=F /S=M" $R1
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 48u 400u 10u "Checking disk space..."
  Pop $LabelSpace
  SetCtlColors $LabelSpace ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $LabelSpace ${WM_SETFONT} $FontSmall 0

  ; ── Divider ──────────────────────────────────────────────────────────────
  !insertmacro CreateDivider ${CONTENT_MARGIN}u 66u ${DIVIDER_WIDTH}u
  Pop $Divider1

  ; ── Section: Options ─────────────────────────────────────────────────────
  !insertmacro CreateSectionTitle ${CONTENT_MARGIN}u 74u 200u "OPTIONS"
  Pop $LabelOptSection

  ; Checkbox: Desktop shortcut
  !insertmacro CreateThemedCheckbox ${CONTENT_MARGIN}u 90u ${CHECKBOX_WIDTH}u ${CHECKBOX_HEIGHT}u "Create desktop shortcut"
  Pop $ChkDesktop
  ${NSD_SetState} $ChkDesktop ${BST_CHECKED}

  ; Checkbox: Launch after install
  !insertmacro CreateThemedCheckbox ${CONTENT_MARGIN}u 108u ${CHECKBOX_WIDTH}u ${CHECKBOX_HEIGHT}u "Launch ${PRODUCT_NAME} after install"
  Pop $ChkLaunch
  ${NSD_SetState} $ChkLaunch ${BST_CHECKED}

  ; Checkbox: Auto updates
  !insertmacro CreateThemedCheckbox ${CONTENT_MARGIN}u 126u ${CHECKBOX_WIDTH}u ${CHECKBOX_HEIGHT}u "Enable automatic updates"
  Pop $ChkAutoUpdate
  ${NSD_SetState} $ChkAutoUpdate ${BST_CHECKED}

  ; ── Divider ──────────────────────────────────────────────────────────────
  !insertmacro CreateDivider ${CONTENT_MARGIN}u 150u ${DIVIDER_WIDTH}u
  Pop $Divider2

  ; ── Step indicator ───────────────────────────────────────────────────────
  !insertmacro CreateStepIndicator ${CONTENT_MARGIN}u 155u "2 of 3"

  ; ── Navigation buttons ───────────────────────────────────────────────────
  !insertmacro CreateSecondaryButton 340u 158u 60u 16u "Back"
  Pop $BtnBack
  ${NSD_OnClick} $BtnBack InstallerPage_Prefs_Back

  !insertmacro CreatePrimaryButton 408u 156u 60u 16u "Install"
  Pop $BtnInstall
  ${NSD_OnClick} $BtnInstall InstallerPage_Prefs_Install

  ; ── Update disk space dynamically ────────────────────────────────────────
  ${GetRoot} "$INSTDIR" $R0
  ${DriveSpace} $R0 "/D=F /S=M" $R1
  StrCpy $R2 "Required: calculating...  Available: $R1 MB"
  ${NSD_SetText} $LabelSpace $R2

  !insertmacro Log "PAGE" "Preferences page displayed — install dir: $INSTDIR"

  nsDialogs::Show

  ; ── Save selections on leave ─────────────────────────────────────────────
  ; (This code runs after Show returns)
  !insertmacro Log "PREFERENCES" "Desktop shortcut: $CreateDesktopShortcut, Launch: $LaunchAfterInstall, AutoUpdate: $EnableAutoUpdate"
FunctionEnd

Function InstallerPage_Prefs_Browse
  nsDialogs::SelectFolderDialog "Select install location" $INSTDIR
  Pop $0
  ${If} $0 != error
    StrCpy $INSTDIR $0
    ${NSD_SetText} $DirInput $INSTDIR

    ; Update disk space info
    ${GetRoot} "$INSTDIR" $R0
    ${DriveSpace} $R0 "/D=F /S=M" $R1
    StrCpy $R2 "Required: calculating...  Available: $R1 MB"
    ${NSD_SetText} $LabelSpace $R2

    !insertmacro Log "PREFERENCES" "Install directory changed to: $INSTDIR"
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

  !insertmacro Log "PREFERENCES" "Install confirmed — path: $INSTDIR, desktop: $CreateDesktopShortcut, launch: $LaunchAfterInstall, updates: $EnableAutoUpdate"
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function InstallerPage_Prefs_Leave
  ${NSD_GetText} $DirInput $INSTDIR
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 17. INSTALLER — INSTFILES PAGE
!ifndef BUILD_UNINSTALLER
Function InstFilesPage_Pre
  !insertmacro Log "INSTALL" "Starting installation..."
FunctionEnd

Function InstFilesPage_Show
  Push $0
  Push $1
  Push $2
  Push $3

  ; Style the progress bar
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1004
  SendMessage $1 0x409 0 ${CLR_ACCENT}
  SendMessage $1 0x408 0 ${CLR_SURFACE}

  ; Style the detail text
  GetDlgItem $2 $0 1006
  SetCtlColors $2 ${CLR_TEXT_MUTED} ${CLR_BG}

  ; Hide the Cancel button during installation
  GetDlgItem $3 $HWNDPARENT 2
  EnableWindow $3 0
  ShowWindow $3 0

  !insertmacro Log "INSTALL" "Installation page styled and locked"

  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif

; ═════════════════════════════════════════════════════════════════════════════
; 18. INSTALLER — COMPLETE PAGE
; ═════════════════════════════════════════════════════════════════════════════
;
; Layout:
;   ✓ (large checkmark, accent)
;   AgenticOS is ready. (white, 14pt bold)
;   Installed to C:\... (truncated path, muted, 8pt)
;   ───────────────── (divider)
;   [Launch AgenticOS] (accent button)
;   Close (link, muted)
; ═════════════════════════════════════════════════════════════════════════════

Function InstallerPage_Complete
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${CLR_BG}"

  ; ── Checkmark ────────────────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 50u ${LABEL_WIDTH_FULL} 36u "✓"
  Pop $LabelCheck
  SetCtlColors $LabelCheck ${CLR_ACCENT} ${CLR_BG}
  SendMessage $LabelCheck ${WM_SETFONT} $FontCheck 0
  ${NSD_AddStyle} $LabelCheck ${SS_CENTER}

  ; ── Ready message ────────────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 96u ${LABEL_WIDTH_FULL} 20u "${PRODUCT_NAME} is ready."
  Pop $LabelDone
  SetCtlColors $LabelDone ${CLR_TEXT} ${CLR_BG}
  SendMessage $LabelDone ${WM_SETFONT} $FontDone 0
  ${NSD_AddStyle} $LabelDone ${SS_CENTER}

  ; ── Install path (truncated) ─────────────────────────────────────────────
  StrLen $R0 $INSTDIR
  ${If} $R0 > 50
    StrCpy $R1 $INSTDIR 50 -50
    StrCpy $R1 "...$R1"
  ${Else}
    StrCpy $R1 $INSTDIR
  ${EndIf}
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 122u 460u 12u "Installed to $R1"
  Pop $LabelPath
  SetCtlColors $LabelPath ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $LabelPath ${WM_SETFONT} $FontSmall 0
  ${NSD_AddStyle} $LabelPath ${SS_CENTER}

  ; ── Divider ──────────────────────────────────────────────────────────────
  !insertmacro CreateDivider 80u 144u 300u
  Pop $DividerFinal

  ; ── Launch button ────────────────────────────────────────────────────────
  ${NSD_CreateButton} 200u 154u 140u 24u "Launch ${PRODUCT_NAME}"
  Pop $BtnLaunch
  ${NSD_OnClick} $BtnLaunch InstallerPage_Complete_Launch

  ; ── Close link ──────────────────────────────────────────────────────────
  !insertmacro CreateLinkButton 230u 184u 80u 12u "Close"
  Pop $LinkClose
  ${NSD_OnClick} $LinkClose InstallerPage_Complete_Close

  !insertmacro Log "PAGE" "Complete page displayed — install path: $INSTDIR"

  nsDialogs::Show
FunctionEnd

Function InstallerPage_Complete_Launch
  !insertmacro Log "COMPLETE" "User requested launch"
  Exec '"$INSTDIR\${PRODUCT_NAME}.exe"'
  Quit
FunctionEnd

Function InstallerPage_Complete_Close
  !insertmacro Log "COMPLETE" "User closed installer"
  Quit
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 19. INSTALL HOOKS
; ═════════════════════════════════════════════════════════════════════════════
;
; These macros are called by electron-builder at specific points in the
; installation lifecycle. They handle detection, logging, and post-install.
; ═════════════════════════════════════════════════════════════════════════════

!macro customInit
  !insertmacro Log "INIT" "Initializing installer"

  StrCpy $HAS_PREVIOUS_VERSION "0"
  StrCpy $PREVIOUS_VERSION ""
  StrCpy $PREVIOUS_INSTALL_PATH ""
  StrCpy $CreateDesktopShortcut "1"
  StrCpy $LaunchAfterInstall "1"
  StrCpy $EnableAutoUpdate "1"

  Call CheckExistingInstall
!macroend

!macro customInstall
  !insertmacro Log "INSTALL" "Installing to: $INSTDIR"
  DetailPrint "━━━ ${PRODUCT_NAME} Installation ━━━"

  ${If} $HAS_PREVIOUS_VERSION == "1"
    !insertmacro Log "UPGRADE" "Upgrading from v$PREVIOUS_VERSION"
    DetailPrint "●  Upgrading from v$PREVIOUS_VERSION — preserving settings"
  ${EndIf}

  DetailPrint "●  Installing core application files..."
!macroend

!macro customInstallFinished
  DetailPrint ""
  DetailPrint "●  Configuring system..."

  ; Registry — uninstall info
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "Publisher" "${PRODUCT_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayIcon" "$INSTDIR\${PRODUCT_NAME}.exe,0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "URLInfoAbout" "https://agenticos.ai/support"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "NoRepair" 0
  !insertmacro Log "REGISTRY" "Uninstall registry keys written"

  ; Desktop shortcut (handled here, not by electron-builder)
  ${If} $CreateDesktopShortcut == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
    !insertmacro Log "SHORTCUT" "Desktop shortcut created"
  ${EndIf}

  ; Auto-update setting
  ${If} $EnableAutoUpdate == ${BST_CHECKED}
    WriteRegStr HKCU "Software\${PRODUCT_NAME}\Settings" "AutoUpdate" "true"
    !insertmacro Log "SETTINGS" "Auto-updates enabled"
  ${EndIf}

  ; Launch after install (handled from Complete page, not here)
  ; This is stored so the Complete page can use it

  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  DetailPrint "●  Finalizing installation..."
  !insertmacro Log "INSTALL" "Installation completed successfully"
!macroend

; customRemoveFiles intentionally NOT defined — let the template handle
; residual file deletion after customUnInstall runs.

; ═════════════════════════════════════════════════════════════════════════════
; 20. UNINSTALLER — CONFIRM PAGE
; ═════════════════════════════════════════════════════════════════════════════
;
; Layout:
;   Uninstall AgenticOS (white, 13pt bold)
;   v3.0.0 (muted, 8pt)
;   C:\... (monospace, truncated)
;   ───────────────── (divider)
;   WHAT TO REMOVE (section label)
;   ☐ Settings and configuration (6 KB)
;   ☐ Cache (Not found)
;   ☐ User data and workspaces (unchecked)
;   ───────────────── (divider)
;   [⚠ AgenticOS is running. Close it.] (inline warning, conditional)
;                           [Cancel] [Uninstall]
; ═════════════════════════════════════════════════════════════════════════════

Function un.Page_Confirm
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${CLR_BG}"
  Call un.InitFonts

  ; ── Title ─────────────────────────────────────────────────────────────────
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 16u 460u 18u "Uninstall ${PRODUCT_NAME}"
  Pop $UnLabelTitle
  SetCtlColors $UnLabelTitle ${CLR_TEXT} ${CLR_BG}
  SendMessage $UnLabelTitle ${WM_SETFONT} $FontHeading 0

  ; ── Version ───────────────────────────────────────────────────────────────
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 36u 460u 12u "v${VERSION}"
  Pop $UnLabelVer
  SetCtlColors $UnLabelVer ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $UnLabelVer ${WM_SETFONT} $FontBody 0

  ; ── Install path (truncated, monospace) ──────────────────────────────────
  StrLen $R0 $INSTDIR
  ${If} $R0 > 60
    StrCpy $R1 $INSTDIR 57 -57
    StrCpy $R1 "...$R1"
  ${Else}
    StrCpy $R1 $INSTDIR
  ${EndIf}
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 50u 460u 12u "$R1"
  Pop $UnLabelPath
  SetCtlColors $UnLabelPath ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $UnLabelPath ${WM_SETFONT} $FontMono 0

  ; ── Divider ──────────────────────────────────────────────────────────────
  !insertmacro CreateDivider ${CONTENT_MARGIN}u 68u ${DIVIDER_WIDTH}u
  Pop $UnDiv1

  ; ── Section: What to remove ──────────────────────────────────────────────
  !insertmacro CreateSectionTitle ${CONTENT_MARGIN}u 76u 200u "WHAT TO REMOVE"

  ; Check if settings dir exists
  ${If} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    StrCpy $SettingsLabel "Settings and configuration"
  ${Else}
    StrCpy $SettingsLabel "Settings and configuration   (Not found)"
  ${EndIf}

  !insertmacro CreateThemedCheckbox ${CONTENT_MARGIN}u 90u ${CHECKBOX_WIDTH}u ${CHECKBOX_HEIGHT}u "$SettingsLabel"
  Pop $UnChkSettings
  ${NSD_SetState} $UnChkSettings ${BST_CHECKED}

  ; Cache check
  ${If} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\cache\*.*"
    StrCpy $CacheLabel "Cache"
  ${Else}
    StrCpy $CacheLabel "Cache   (Not found)"
  ${EndIf}

  !insertmacro CreateThemedCheckbox ${CONTENT_MARGIN}u 108u ${CHECKBOX_WIDTH}u ${CHECKBOX_HEIGHT}u "$CacheLabel"
  Pop $UnChkCache
  ${NSD_SetState} $UnChkCache ${BST_CHECKED}

  ; User data — unchecked by default (safety)
  !insertmacro CreateThemedCheckbox ${CONTENT_MARGIN}u 126u ${CHECKBOX_WIDTH}u ${CHECKBOX_HEIGHT}u "User data and workspaces"
  Pop $UnChkUserData
  ${NSD_SetState} $UnChkUserData ${BST_UNCHECKED}

  ; ── Divider ──────────────────────────────────────────────────────────────
  !insertmacro CreateDivider ${CONTENT_MARGIN}u 146u ${DIVIDER_WIDTH}u
  Pop $UnDiv2

  ; ── Running process warning (always shown) ──────────────────────────────
  ; Always displayed as a precaution. Close App button attempts graceful
  ; shutdown via taskkill. Harmless when app is not running.
  StrCpy $UnBottomOffset 190

  ; Warning background
  ${NSD_CreateLabel} ${CONTENT_MARGIN}u 152u 460u 30u ""
  Pop $UnWarnBg
  SetCtlColors $UnWarnBg "" "${CLR_WARN_BG}"

  ; Warning text
  ${NSD_CreateLabel} 28u 156u 340u 22u "${PRODUCT_NAME} is running. Close it before uninstalling."
  Pop $UnWarnText
  SetCtlColors $UnWarnText ${CLR_WARN_TEXT} ${CLR_WARN_BG}
  SendMessage $UnWarnText ${WM_SETFONT} $FontWarn 0

  ; Close App button
  !insertmacro CreateSecondaryButton 390u 156u 80u 16u "Close App"
  Pop $UnBtnCloseApp
  ${NSD_OnClick} $UnBtnCloseApp un.CloseRunningApp

  ; ── Navigation buttons ───────────────────────────────────────────────────
  !insertmacro CreateSecondaryButton 340u $UnBottomOffset 60u 16u "Cancel"
  Pop $UnBtnCancel
  ${NSD_OnClick} $UnBtnCancel un.Page_Confirm_Cancel

  !insertmacro CreatePrimaryButton 408u $UnBottomOffset 60u 16u "Uninstall"
  Pop $UnBtnUninstall
  ${NSD_OnClick} $UnBtnUninstall un.Page_Confirm_DoUninstall

  !insertmacro Log "PAGE" "Uninstall confirm page displayed"
  !insertmacro Log "UNINSTALL" "App running: $AppRunning, path: $INSTDIR"

  nsDialogs::Show
FunctionEnd

Function un.Page_Confirm_Cancel
  !insertmacro Log "UNINSTALL" "User cancelled uninstall"
  Quit
FunctionEnd

Function un.Page_Confirm_DoUninstall
  ${NSD_GetState} $UnChkSettings $RemoveSettings
  ${NSD_GetState} $UnChkCache $RemoveCache
  ${NSD_GetState} $UnChkUserData $RemoveUserData

  !insertmacro Log "UNINSTALL" "Uninstall confirmed — settings: $RemoveSettings, cache: $RemoveCache, userdata: $RemoveUserData"
  SendMessage $HWNDPARENT 0x408 1 0
FunctionEnd

Function un.Page_Confirm_Leave
  ; File removal is handled by !macro customUnInstall (runs after this).
  ; This leave function advances from the confirm page to the complete page.
  !insertmacro Log "UNINSTALL" "Proceeding to uninstall..."
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 21. UNINSTALLER — COMPLETE PAGE
; ═════════════════════════════════════════════════════════════════════════════
;
; Layout:
;   ✓ (large checkmark, accent)
;   AgenticOS has been removed. (white, 13pt bold)
;   Your files have been cleaned up. (muted, 8pt)
;   [Close] (button)
; ═════════════════════════════════════════════════════════════════════════════
;
; Design rules:
;   - No "Thank you for trying AgenticOS."
;   - No "We're sorry to see you go."
;   - Clean, neutral, respectful tone.
; ═════════════════════════════════════════════════════════════════════════════

Function un.Page_Complete
  nsDialogs::Create ${INSTALLER_DIALOG_ID}
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "" "${CLR_BG}"

  ; ── Checkmark ────────────────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 50u ${LABEL_WIDTH_FULL} 36u "✓"
  Pop $UnLabelCheck
  SetCtlColors $UnLabelCheck ${CLR_ACCENT} ${CLR_BG}
  SendMessage $UnLabelCheck ${WM_SETFONT} $FontCheck 0
  ${NSD_AddStyle} $UnLabelCheck ${SS_CENTER}

  ; ── Confirmation message ─────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 96u ${LABEL_WIDTH_FULL} 18u "${PRODUCT_NAME} has been removed."
  Pop $UnLabelDone
  SetCtlColors $UnLabelDone ${CLR_TEXT} ${CLR_BG}
  SendMessage $UnLabelDone ${WM_SETFONT} $FontDone 0
  ${NSD_AddStyle} $UnLabelDone ${SS_CENTER}

  ; ── Cleanup message ──────────────────────────────────────────────────────
  ${NSD_CreateLabel} 0 118u ${LABEL_WIDTH_FULL} 12u "Your files have been cleaned up."
  Pop $UnLabelSpace
  SetCtlColors $UnLabelSpace ${CLR_TEXT_MUTED} ${CLR_BG}
  SendMessage $UnLabelSpace ${WM_SETFONT} $FontSmall 0
  ${NSD_AddStyle} $UnLabelSpace ${SS_CENTER}

  ; ── Close button ─────────────────────────────────────────────────────────
  ${NSD_CreateButton} 220u 150u 100u 22u "Close"
  Pop $UnBtnClose
  ${NSD_OnClick} $UnBtnClose un.Page_Complete_Close

  !insertmacro Log "PAGE" "Uninstall complete page displayed"
  nsDialogs::Show
FunctionEnd

Function un.Page_Complete_Close
  !insertmacro Log "UNINSTALL" "User closed uninstaller"
  Quit
FunctionEnd

; ═════════════════════════════════════════════════════════════════════════════
; 22. UNINSTALL HOOKS
; ═════════════════════════════════════════════════════════════════════════════

!macro customUnInit
  !insertmacro Log "UNINSTALL" "Initializing uninstaller"

  ; Default: remove settings & cache, preserve user data
  StrCpy $RemoveSettings "1"
  StrCpy $RemoveCache "1"
  StrCpy $RemoveUserData "0"
  StrCpy $DATA_SETTINGS_SIZE "0"
  StrCpy $DATA_CACHE_SIZE "0"
  StrCpy $DATA_USERDATA_SIZE "0"
  StrCpy $DATA_TOTAL_RECOVERABLE "0"
!macroend

!macro customUnInstall
  !insertmacro Log "UNINSTALL" "Executing uninstall hooks"
  DetailPrint "━━━ ${PRODUCT_NAME} Uninstallation ━━━"
  DetailPrint "●  Closing running instances..."
  Call un.CloseRunningApp

  DetailPrint "●  Removing system integrations..."
  DeleteRegKey HKCR "Directory\shell\${PRODUCT_NAME}"
  DeleteRegKey HKCR "*\shell\${PRODUCT_NAME}"
  DeleteRegKey HKCR "Directory\Background\shell\${PRODUCT_NAME}"
  DeleteRegKey HKCR "${PRODUCT_NAME}.Project"
  DeleteRegKey HKCR "agenticos"

  DetailPrint "●  Removing application files..."
  SetOutPath $TEMP
  RMDir /r "$INSTDIR"
  !insertmacro Log "UNINSTALL" "RMDir /r $INSTDIR done"

  DetailPrint "●  Removing shortcuts..."
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

  ; Data removal (checkbox values from confirm page, or defaults in silent mode)
  ${If} $RemoveSettings == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$APPDATA\${PRODUCT_NAME}\*.*"
    DetailPrint "●  Removing settings..."
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    !insertmacro Log "UNINSTALL" "Removed settings: $APPDATA\${PRODUCT_NAME}"
  ${EndIf}

  ${If} $RemoveCache == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\cache\*.*"
    DetailPrint "●  Removing cache..."
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}\cache"
    !insertmacro Log "UNINSTALL" "Removed cache: $LOCALAPPDATA\${PRODUCT_NAME}\cache"
  ${EndIf}

  ${If} $RemoveUserData == ${BST_CHECKED}
  ${AndIf} ${FileExists} "$DOCUMENTS\${PRODUCT_NAME}\*.*"
    DetailPrint "●  Removing user data..."
    RMDir /r "$DOCUMENTS\${PRODUCT_NAME}"
    !insertmacro Log "UNINSTALL" "Removed user data: $DOCUMENTS\${PRODUCT_NAME}"
  ${EndIf}

  DetailPrint "●  Cleaning registry..."
  DeleteRegKey HKCU "Software\${PRODUCT_NAME}"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"

  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  DetailPrint "●  Uninstall completed"
  !insertmacro Log "UNINSTALL" "Uninstall completed"
!macroend
