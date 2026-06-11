import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import type { WindowManager } from './window-manager'

let tray: Tray | null = null

export function createTray(windowManager: WindowManager): void {
  const iconPath = join(__dirname, '../../resources/branding/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('AgenticOS')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AgenticOS',
      click: () => {
        const win = windowManager.getMainWindow()
        if (win) {
          win.show()
          win.focus()
        } else {
          windowManager.createMainWindow()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    const win = windowManager.getMainWindow()
    if (win) {
      win.show()
      win.focus()
    } else {
      windowManager.createMainWindow()
    }
  })
}
