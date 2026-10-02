// On-screen copy and voiceover script. Scenes 1 to 5 follow the creative brief.
// Scenes 6 and 7 were drafted because the brief was cut off there, then approved.
// Voiceover lines 1, 4 and 6 use the approved shorter versions.
import type { SceneKey } from './timeline'

export const COPY: Record<SceneKey, { lines: string[]; voiceover: string }> = {
  problem: {
    lines: ['Too many systems.', 'Not enough clarity.'],
    voiceover: "Business shouldn't mean chasing data across disconnected tools.",
  },
  operatingView: {
    lines: ['Everything your business needs.', 'One operating dashboard.'],
    voiceover: 'One dashboard brings sales, staffing, stock and finance together.',
  },
  performance: {
    lines: ['Know what happened.', 'Understand why.', 'See what comes next.'],
    voiceover: 'Track revenue, labour, product costs, rent and profit as the day develops.',
  },
  channels: {
    lines: ['Every channel.', 'One source of truth.'],
    voiceover: 'Combine in-store and delivery sales without manual reports.',
  },
  operations: {
    lines: ['Connected teams.', 'Consistent operations.'],
    voiceover: 'Coordinate your team and daily operations, even when management is off-site.',
  },
  intelligence: {
    lines: ['Spot problems early.', 'Act with confidence.'],
    voiceover: 'Live signals show what needs attention, and what to do next.',
  },
  close: {
    lines: ['One dashboard.', 'Every decision connected.'],
    voiceover: 'Tropicool Treats. One dashboard. Every decision connected.',
  },
}

export const PRODUCT_NAME = 'Tropicool Treats'
export const PRODUCT_SUBTITLE = 'Business Operations App'
export const CLOSING_AUDIENCE = 'For single stores, growing teams and multi-location operators'
