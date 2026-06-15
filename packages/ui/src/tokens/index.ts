export const colors = {
  light: {
    background: 'hsl(0 0% 100%)',
    foreground: 'hsl(0 0% 3.9%)',
    card: 'hsl(0 0% 100%)',
    cardForeground: 'hsl(0 0% 3.9%)',
    popover: 'hsl(0 0% 100%)',
    popoverForeground: 'hsl(0 0% 3.9%)',
    primary: 'hsl(0 0% 9%)',
    primaryForeground: 'hsl(0 0% 98%)',
    secondary: 'hsl(0 0% 96.1%)',
    secondaryForeground: 'hsl(0 0% 9%)',
    muted: 'hsl(0 0% 96.1%)',
    mutedForeground: 'hsl(0 0% 45.1%)',
    accent: 'hsl(0 0% 96.1%)',
    accentForeground: 'hsl(0 0% 9%)',
    destructive: 'hsl(0 84.2% 60.2%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(0 0% 89.8%)',
    input: 'hsl(0 0% 89.8%)',
    ring: 'hsl(0 0% 3.9%)',
  },
  dark: {
    background: 'hsl(0 0% 3.9%)',
    foreground: 'hsl(0 0% 98%)',
    card: 'hsl(0 0% 5.9%)',
    cardForeground: 'hsl(0 0% 98%)',
    popover: 'hsl(0 0% 5.9%)',
    popoverForeground: 'hsl(0 0% 98%)',
    primary: 'hsl(0 0% 98%)',
    primaryForeground: 'hsl(0 0% 9%)',
    secondary: 'hsl(0 0% 12.9%)',
    secondaryForeground: 'hsl(0 0% 98%)',
    muted: 'hsl(0 0% 12.9%)',
    mutedForeground: 'hsl(0 0% 63.9%)',
    accent: 'hsl(0 0% 12.9%)',
    accentForeground: 'hsl(0 0% 98%)',
    destructive: 'hsl(0 62.8% 30.6%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    border: 'hsl(0 0% 14.9%)',
    input: 'hsl(0 0% 14.9%)',
    ring: 'hsl(0 0% 83.1%)',
  },
} as const

export const font = {
  sans: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', ui-monospace, monospace",
} as const

export const radius = '0.5rem' as const

export type ColorToken = keyof typeof colors.light
export type ColorScheme = 'light' | 'dark'
export type FontToken = keyof typeof font

export function getColor(token: ColorToken, scheme: ColorScheme = 'light'): string {
  return colors[scheme][token]
}

export function getCssVar(token: string): string {
  return `var(--color-${token.replace(/([A-Z])/g, '-$1').toLowerCase()})`
}

export function cssVars(scheme: ColorScheme = 'light'): Record<string, string> {
  const vars: Record<string, string> = {
    '--radius': radius,
    '--font-sans': font.sans,
    '--font-mono': font.mono,
  }
  for (const [key, value] of Object.entries(colors[scheme])) {
    const cssKey = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
    vars[cssKey] = value
  }
  return vars
}
