// Line icons copied from the app (navIcon and ManagerSubIcon in src/App.tsx).
// The five team-hub icons that the app draws with its own TeamHubIcon helper
// are approximated here with matching 24px line glyphs.
const base = (size: number, strokeWidth: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true })

export type NavKey = 'overview' | 'finance' | 'staff' | 'updates' | 'settings'

export function NavIcon({ kind, size = 16 }: { kind: NavKey; size?: number }) {
  const common = base(size, 2)
  switch (kind) {
    case 'overview': return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
    case 'finance': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v12" /></svg>
    case 'staff': return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.4" /><path d="M21 20c0-2.5-1.7-4.6-4-5.3" /></svg>
    case 'updates': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.32.4.58.72.72.32.13.68.18 1.03.13H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
  }
}

export function SubIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  const common = base(size, 1.7)
  switch (kind) {
    case 'sales': return <svg {...common}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 19h20" /></svg>
    case 'cashPurchases': return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M7 10h5M7 15h3M17 10v5M15 12.5h4" /></svg>
    case 'forecast': return <svg {...common}><path d="M3 18c3-6 5-8 8-8 2.5 0 3.5 3 5.5 3 1.4 0 2.8-1.1 4.5-4" /><path d="M17 5h4v4" /><path d="M3 21h18" /></svg>
    case 'analytics': return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" /><path d="M2 20h20" /></svg>
    case 'expenses': return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
    case 'wages': return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5.9 2.5 2c0 3-5 1.5-5 4.5 0 1.1 1.1 2 2.5 2s2.5-1 2.5-2.5" /></svg>
    case 'setup': return <svg {...common}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
    case 'directory': return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.5 20c.4-4 2.5-6 5.5-6s5.1 2 5.5 6M15 15c3 .1 4.7 1.8 5 5" /></svg>
    case 'roles': return <svg {...common}><circle cx="8" cy="8" r="3" /><path d="M3 20c.3-4 2-6 5-6s4.7 2 5 6" /><path d="M16 8h5M16 12h5M16 16h5" /></svg>
    case 'roster': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
    case 'swaps': return <svg {...common}><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg>
    case 'timeoff': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M10 14l4 4M14 14l-4 4" /></svg>
    case 'training': return <svg {...common}><path d="m2 9 10-5 10 5-10 5Z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></svg>
    case 'clockouts': return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>
    case 'reviews': return <svg {...common}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" /></svg>
    case 'categories': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
    case 'alerts': return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8Z" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
    case 'location': return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
    default: return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></svg>
  }
}

export function CheckIcon({ size = 14, strokeWidth = 2.6 }: { size?: number; strokeWidth?: number }) {
  return <svg {...base(size, strokeWidth)}><path d="m5 12 4 4L19 6" /></svg>
}

export function ChevronsIcon({ size = 21, color = '#000' }: { size?: number; color?: string }) {
  return <svg width={size} height={size * 0.86} viewBox="0 0 28 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4 6 6 6-6 6" /><path d="m13 6 6 6-6 6" /></svg>
}
