import { app, BrowserWindow, screen } from 'electron'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'out')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
    },
  })

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html'))
  await new Promise(r => setTimeout(r, 5000))

  const image = await win.capturePage()
  writeFileSync(join(outDir, 'screenshot.png'), image.toPNG())
  console.log('Screenshot saved to out/screenshot.png')
  app.quit()
})
