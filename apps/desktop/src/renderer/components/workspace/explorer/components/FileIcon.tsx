// SVG file-type icons — one component, no dependencies
// Each icon is a minimal 14x14 SVG designed for dense UI display at 11px

const ICONS: Record<string, string> = {
  // Code
  ts: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#3178C6"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">T</text></svg>`,
  tsx: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#3178C6"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">X</text></svg>`,
  js: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#F7DF1E"/><text x="7" y="10" text-anchor="middle" fill="#000" font-size="9" font-weight="bold" font-family="sans-serif">J</text></svg>`,
  jsx: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#F7DF1E"/><text x="7" y="10" text-anchor="middle" fill="#000" font-size="9" font-weight="bold" font-family="sans-serif">X</text></svg>`,
  json: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#5B5B5B"/><text x="7" y="10" text-anchor="middle" fill="#DDD" font-size="7" font-weight="bold" font-family="sans-serif">{ }</text></svg>`,

  // Web
  css: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#1572B6"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="7" font-family="sans-serif">CSS</text></svg>`,
  scss: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#C6538C"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="6" font-family="sans-serif">SCSS</text></svg>`,
  html: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#E34F26"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="7" font-family="sans-serif">H</text></svg>`,
  svg: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#FFB13B"/><text x="7" y="10" text-anchor="middle" fill="#000" font-size="6" font-family="sans-serif">SVG</text></svg>`,

  // Languages
  py: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#3776AB"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="7" font-family="sans-serif">PY</text></svg>`,
  rs: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#DEA584"/><text x="7" y="10" text-anchor="middle" fill="#000" font-size="6" font-family="sans-serif">RS</text></svg>`,
  go: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#00ADD8"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="7" font-family="sans-serif">GO</text></svg>`,
  md: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#4B4B4B"/><text x="7" y="10" text-anchor="middle" fill="#CCC" font-size="6" font-family="sans-serif">MD</text></svg>`,

  // Config
  yaml: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#6B5B3A"/><text x="7" y="10" text-anchor="middle" fill="#DDD" font-size="6" font-family="sans-serif">YML</text></svg>`,
  toml: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="12" height="12" rx="2" fill="#9C4221"/><text x="7" y="10" text-anchor="middle" fill="white" font-size="6" font-family="sans-serif">TL</text></svg>`,
  lock: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="6" width="10" height="7" rx="1.5" fill="#8B5CF6"/><path d="M4 6V4.5a3 3 0 1 1 6 0V6" stroke="#8B5CF6" stroke-width="1.3" fill="none"/></svg>`,

  // Generic file
  _default: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 1.5h5l3.5 3.5V12a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" fill="currentColor" opacity="0.3"/><path d="M8 1.5v3.5h3.5" fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.3"/></svg>`,

  // Directory
  dir: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4a1 1 0 0 1 1-1h3.34a1 1 0 0 1 .7.3l1.26 1.26a.5.5 0 0 0 .35.14H11.5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V4z" fill="currentColor" opacity="0.25"/></svg>`,
  dirOpen: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4a1 1 0 0 1 1-1h3.34a1 1 0 0 1 .7.3l1.26 1.26a.5.5 0 0 0 .35.14H11.5a1 1 0 0 1 1 1v.5a.5.5 0 0 1-.5.5H9.07a1 1 0 0 0-.95.68l-.48 1.45a.5.5 0 0 1-.47.37H2.5a.5.5 0 0 1-.48-.63l1.15-4A.5.5 0 0 1 3.65 4z" fill="currentColor" opacity="0.35"/></svg>`,

  // Image
  img: `<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" fill="#6366F1" opacity="0.3"/><circle cx="5" cy="6" r="1.2" fill="#6366F1"/><path d="M2 10l3-3 2 2 3-3 2.5 2.5" stroke="#6366F1" stroke-width="0.8" fill="none"/></svg>`,
}

function extKey(path: string): string {
  const name = path.split("/").pop() || path
  if (name.startsWith(".")) return name.toLowerCase()
  const dot = name.lastIndexOf(".")
  if (dot < 0) return ""
  return name.slice(dot + 1).toLowerCase()
}

export function FileIcon({ path, isDir, isOpen }: { path: string; isDir?: boolean; isOpen?: boolean }) {
  if (isDir) {
    const svg = isOpen ? ICONS.dirOpen : ICONS.dir
    return <span className="shrink-0 leading-none flex items-center" style={{ width: 14, height: 14 }}>
      <span dangerouslySetInnerHTML={{ __html: svg }} />
    </span>
  }

  const key = extKey(path)
  const icon = ICONS[key] || ICONS.img

  // Image files (png, jpg, gif, webp) get the image icon
  if (["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp"].includes(key)) {
    return <span className="shrink-0 leading-none flex items-center" style={{ width: 14, height: 14 }}>
      <span dangerouslySetInnerHTML={{ __html: ICONS.img! }} />
    </span>
  }

  return <span className="shrink-0 leading-none flex items-center" style={{ width: 14, height: 14 }}>
    <span dangerouslySetInnerHTML={{ __html: icon }} />
  </span>
}
