import { Menu, BrowserWindow, app, shell, dialog } from 'electron'
import type { WindowManager } from './window-manager'
import { sendToWindow } from './ipc/safe-send'
import { getWorkspaceManager } from './ipc/workspace'

export function createAppMenu(windowManager: WindowManager, _mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CommandOrControl+O',
          click: async () => {
            const win = windowManager.getMainWindow()
            if (!win) return
            const wm = getWorkspaceManager()
            const folderPath = await wm.openFolderDialog(win)
            if (folderPath) {
              sendToWindow(win, 'open-folder', folderPath)
            }
          }
        },
        {
          label: 'Open Workspace...',
          accelerator: 'CommandOrControl+Shift+O',
          click: async () => {
            const win = windowManager.getMainWindow()
            if (!win) return
            const wm = getWorkspaceManager()
            const wsPath = await wm.openWorkspaceDialog(win)
            if (wsPath) {
              sendToWindow(win, 'open-workspace', wsPath)
            }
          }
        },
        { type: 'separator' },
        {
          label: 'New Window',
          accelerator: 'CommandOrControl+Shift+N',
          click: () => windowManager.createMainWindow()
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CommandOrControl+B',
          click: () => sendToWindow(windowManager.getMainWindow(), 'toggle-sidebar')
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'CommandOrControl+`',
          click: () => sendToWindow(windowManager.getMainWindow(), 'toggle-terminal')
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          role: 'togglefullscreen'
        },
        {
          label: 'Zoom In',
          accelerator: 'CommandOrControl+=',
          role: 'zoomIn'
        },
        {
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          role: 'zoomOut'
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CommandOrControl+0',
          role: 'resetZoom'
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          role: 'toggleDevTools'
        }
      ]
    },
    {
      label: 'Workspace',
      submenu: [
        {
          label: 'Go to File...',
          accelerator: 'CommandOrControl+P',
          click: () => sendToWindow(windowManager.getMainWindow(), 'command-palette')
        },
        {
          label: 'Search in Files',
          accelerator: 'CommandOrControl+Shift+F',
          click: () => sendToWindow(windowManager.getMainWindow(), 'global-search')
        },
        { type: 'separator' },
        {
          label: 'Git: Status',
          click: () => sendToWindow(windowManager.getMainWindow(), 'open-git-panel')
        }
      ]
    },
    {
      label: 'Agent',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CommandOrControl+N',
          click: () => sendToWindow(windowManager.getMainWindow(), 'new-chat')
        },
        {
          label: 'Agent Settings...',
          click: () => sendToWindow(windowManager.getMainWindow(), 'open-settings', { tab: 'agents' })
        },
        { type: 'separator' },
        {
          label: 'Execution Dashboard',
          click: () => sendToWindow(windowManager.getMainWindow(), 'open-dashboard')
        }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CommandOrControl+Shift+`',
          click: () => sendToWindow(windowManager.getMainWindow(), 'new-terminal')
        },
        {
          label: 'Kill Active Terminal',
          click: () => sendToWindow(windowManager.getMainWindow(), 'kill-active-terminal')
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CommandOrControl+,',
          click: () => sendToWindow(windowManager.getMainWindow(), 'open-settings', {})
        },
        {
          label: 'Extensions',
          click: () => sendToWindow(windowManager.getMainWindow(), 'open-extensions')
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AgenticOS',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About AgenticOS',
              message: 'AgenticOS',
              detail: `Version ${app.getVersion()}\n\nYour AI operating system for development`
            })
          }
        },
        {
          label: 'Check for Updates...',
          click: () => sendToWindow(windowManager.getMainWindow(), 'check-for-updates')
        },
        { type: 'separator' },
        {
          label: 'Open Logs',
          click: () => sendToWindow(windowManager.getMainWindow(), 'open-logs')
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
