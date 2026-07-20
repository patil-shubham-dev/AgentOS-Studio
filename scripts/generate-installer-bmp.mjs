import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function hexToRgb(hexColor) {
  return {
    r: parseInt(hexColor.slice(0, 2), 16),
    g: parseInt(hexColor.slice(2, 4), 16),
    b: parseInt(hexColor.slice(4, 6), 16),
  }
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function createBmp(width, height, pixelAt) {

  // BMP header (14 bytes) + DIB header (40 bytes) = 54 bytes
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize

  const buf = Buffer.alloc(fileSize)

  // BMP file header
  buf.write('BM', 0)                     // signature
  buf.writeUInt32LE(fileSize, 2)         // file size
  buf.writeUInt32LE(54, 10)              // pixel data offset

  // DIB header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14)              // header size
  buf.writeInt32LE(width, 18)            // width
  buf.writeInt32LE(height, 22)           // height (positive = bottom-up)
  buf.writeUInt16LE(1, 26)               // planes
  buf.writeUInt16LE(24, 28)              // bits per pixel
  buf.writeUInt32LE(0, 30)               // compression (none)
  buf.writeUInt32LE(pixelDataSize, 34)   // pixel data size
  buf.writeInt32LE(0, 38)                // h resolution
  buf.writeInt32LE(0, 42)                // v resolution
  buf.writeUInt32LE(0, 46)               // colors in palette
  buf.writeUInt32LE(0, 50)               // important colors

  // Pixel data (BGR format, bottom-up)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + y * rowSize + x * 3
      const { r, g, b } = pixelAt(x, height - y - 1)
      buf.writeUInt8(b, offset)          // Blue
      buf.writeUInt8(g, offset + 1)      // Green
      buf.writeUInt8(r, offset + 2)      // Red
    }
  }

  return buf
}

function createGradientBmp(width, height, fromHex, toHex, accentHex) {
  const from = hexToRgb(fromHex)
  const to = hexToRgb(toHex)
  const accent = hexToRgb(accentHex)

  return createBmp(width, height, (x, y) => {
    const t = (x / Math.max(1, width - 1)) * 0.65 + (y / Math.max(1, height - 1)) * 0.35
    const glow = Math.max(0, 1 - Math.hypot((x - width * 0.18) / width, (y - height * 0.18) / height) * 2.8)
    const base = {
      r: mix(from.r, to.r, t),
      g: mix(from.g, to.g, t),
      b: mix(from.b, to.b, t),
    }

    return {
      r: mix(base.r, accent.r, glow * 0.22),
      g: mix(base.g, accent.g, glow * 0.22),
      b: mix(base.b, accent.b, glow * 0.22),
    }
  })
}

const assetsDir = join(root, 'build/assets')

writeFileSync(join(assetsDir, 'header.bmp'), createGradientBmp(150, 57, '0E1011', '121518', '3694C8'))
console.log('Generated build/assets/header.bmp (150x57)')

writeFileSync(join(assetsDir, 'sidebar.bmp'), createGradientBmp(164, 314, '121518', '0E1011', '3694C8'))
console.log('Generated build/assets/sidebar.bmp (164x314)')
