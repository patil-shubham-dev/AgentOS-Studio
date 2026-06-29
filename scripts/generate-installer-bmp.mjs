import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function createSolidBmp(width, height, hexColor) {
  const r = parseInt(hexColor.slice(0, 2), 16)
  const g = parseInt(hexColor.slice(2, 4), 16)
  const b = parseInt(hexColor.slice(4, 6), 16)

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
      buf.writeUInt8(b, offset)          // Blue
      buf.writeUInt8(g, offset + 1)      // Green
      buf.writeUInt8(r, offset + 2)      // Red
    }
  }

  return buf
}

const brandingDir = join(root, 'resources/branding')

// NSIS installer header: 150x57, solid #0D0D0D
writeFileSync(join(brandingDir, 'installer-header.bmp'), createSolidBmp(150, 57, '0D0D0D'))
console.log('Generated resources/branding/installer-header.bmp (150x57, #0D0D0D)')

// NSIS installer sidebar: 164x314, solid #0D0D0D
writeFileSync(join(brandingDir, 'installer-sidebar.bmp'), createSolidBmp(164, 314, '0D0D0D'))
console.log('Generated resources/branding/installer-sidebar.bmp (164x314, #0D0D0D)')
