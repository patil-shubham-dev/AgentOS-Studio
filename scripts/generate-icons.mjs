import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const logoSvg = join(root, 'src/renderer/assets/branding/logo.svg')
const outDir = join(root, 'resources/branding')

mkdirSync(outDir, { recursive: true })

const SIZES = [16, 32, 48, 64, 128, 192, 256, 512]

async function main() {
  // Generate PNGs at all required sizes
  for (const size of SIZES) {
    const pngPath = join(outDir, `icon-${size}.png`)
    await sharp(logoSvg)
      .resize(size, size, { fit: 'contain', background: { r: 13, g: 13, b: 13, alpha: 0 } })
      .png()
      .toFile(pngPath)
    console.log(`Generated ${pngPath}`)
  }

  // Main icon.png = 256px (for tray/window)
  await sharp(logoSvg)
    .resize(256, 256, { fit: 'contain', background: { r: 13, g: 13, b: 13, alpha: 0 } })
    .png()
    .toFile(join(outDir, 'icon.png'))
  console.log('Generated resources/branding/icon.png (256px)')

  // 512px icon for electron-builder Linux
  await sharp(logoSvg)
    .resize(512, 512, { fit: 'contain', background: { r: 13, g: 13, b: 13, alpha: 0 } })
    .png()
    .toFile(join(outDir, 'icon-512.png'))
  console.log('Generated resources/branding/icon-512.png')

  // Copy 192px for manifest
  await sharp(logoSvg)
    .resize(192, 192, { fit: 'contain', background: { r: 13, g: 13, b: 13, alpha: 0 } })
    .png()
    .toFile(join(outDir, 'icon-192.png'))
  console.log('Generated resources/branding/icon-192.png')

  // Generate icon.ico (multi-res: 256, 128, 64, 48, 32, 16)
  const icoSizes = [256, 128, 64, 48, 32, 16]
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => {
      const buf = await sharp(logoSvg)
        .resize(size, size, { fit: 'contain', background: { r: 13, g: 13, b: 13, alpha: 0 } })
        .png()
        .toBuffer()
      return buf
    })
  )
  const icoBuf = await pngToIco(icoPngs)
  writeFileSync(join(outDir, 'icon.ico'), icoBuf)
  console.log('Generated resources/branding/icon.ico')

  // Copy icon.ico to root resources/ for any direct references
  writeFileSync(join(root, 'resources/icon.ico'), icoBuf)
  console.log('Generated resources/icon.ico')

  // Also generate a smaller 32x32 icon.png for tray usage
  await sharp(logoSvg)
    .resize(32, 32, { fit: 'contain', background: { r: 13, g: 13, b: 13, alpha: 0 } })
    .png()
    .toFile(join(outDir, 'icon-32.png'))
  console.log('Generated resources/branding/icon-32.png')
}

main().catch(console.error)
