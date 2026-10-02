// Fonts are bundled from npm so renders never depend on Google Fonts at runtime.
// The app loads the same two families: Outfit (300/400/500) and JetBrains Mono.
import '@fontsource/outfit/300.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/jetbrains-mono/300.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './tropicool-app.css'
import './overrides.css'

export const FONT_SANS = '"Outfit", sans-serif'
export const FONT_MONO = '"JetBrains Mono", monospace'

// Tokens taken from the app (src/App.tsx glass helpers and src/index.css).
export const TOKENS = {
  ink: '#111111',
  inkSoft: 'rgba(0,0,0,0.58)',
  inkMuted: 'rgba(0,0,0,0.42)',
  page: '#e8e8e8',
  lavender: '#BF77F6', // BRAND_PURPLE
  lavenderSoft: 'rgba(180,156,255,0.13)',
  lavenderLine: 'rgba(180,156,255,0.3)',
  lavenderText: '#d8c9ff',
  success: '#4f9565',
  warning: '#d2a62c',
  danger: '#c94f4f',
  expense: 'rgba(180,40,40,0.85)',
  glass: {
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.85)',
    boxShadow: '0 4px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
  },
  glassDark: {
    background: 'rgba(0,0,0,0.86)',
    border: '1px solid rgba(255,255,255,0.09)',
    boxShadow: '0 4px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
} as const
