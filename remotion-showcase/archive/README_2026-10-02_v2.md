# Tropicool Treats Business Operations App: 30-second showcase

A 30-second product video built with Remotion, React and TypeScript. It shows how one manager dashboard replaces disconnected tools for finance, sales, staffing, stock and daily operations.

**Core message:** One dashboard. Every decision connected.

| | Primary | Social |
|---|---|---|
| Composition ID | `TropicoolShowcaseDesktop` | `TropicoolShowcaseVertical` |
| Size | 1920 × 1080 | 1080 × 1920 |
| Frame rate | 30 fps | 30 fps |
| Length | 900 frames (30.0 s) | 900 frames (30.0 s) |

## Quick start

```bash
cd remotion-showcase
npm install
npm run dev              # Remotion Studio, both compositions
npm run typecheck
```

## Render

```bash
npm run render:desktop   # out/tropicool-showcase-1920x1080.mp4
npm run render:vertical  # out/tropicool-showcase-1080x1920.mp4
npm run render:all       # both
npm run render:reduced   # desktop, reduced-motion version
npm run still:desktop    # one review frame (frame 300)
```

Equivalent raw commands:

```bash
npx remotion render src/index.ts TropicoolShowcaseDesktop out/tropicool-showcase-1920x1080.mp4
npx remotion render src/index.ts TropicoolShowcaseVertical out/tropicool-showcase-1080x1920.mp4
```

The first render downloads Remotion's headless Chrome. In a sandbox without internet access, pass an existing Chrome Headless Shell with `--browser-executable=/path/to/headless_shell`. The Live Orb is WebGL, so `remotion.config.ts` sets the `angle` OpenGL renderer.

Review stills from a single bundle (faster than repeated `remotion still` calls):

```bash
node scripts/review-stills.mjs TropicoolShowcaseVertical 60,300,600,880 out/stills
```

## Where things live

| Path | What it holds |
|---|---|
| `src/index.ts` | Remotion entry point |
| `src/Root.tsx` | The two compositions |
| `src/Showcase.tsx` | Scene sequencing, captions, Live Orb guide, soundtrack |
| `src/config/timeline.ts` | Frame ranges for all seven scenes (checked to add up to 900) |
| `src/config/copy.ts` | On-screen copy and voiceover script |
| `src/config/assets.ts` | **Music, narration and sound effects** (all replaceable here) |
| `src/data/sample.ts` | Illustrative sample data and derived figures |
| `src/styles/tropicool-app.css` | The app's real stylesheet, vendored (do not edit by hand) |
| `src/components/LiveOrb.tsx` | Frame-driven port of the app's Live Orb shader |
| `src/components/OrbGuide.tsx` | The orb's path through the video |
| `src/components/dashboard/` | Manager dashboard, camera geometry, icons |
| `src/components/charts/` | Sales/forecast/expenses chart, channel donut, logo cutouts |
| `src/components/operations/` | Store tablet clock-in and remote manager view |
| `src/components/problem/`, `closing/` | Opening and closing scenes |
| `public/brand/` | Real channel logos and app icon from the app repository |

## Scenes

| # | Frames | Time | Content |
|---|---|---|---|
| 1 | 0 to 105 | 0:00 to 0:03.5 | Eight disconnected tools overlap with duplicated and conflicting figures |
| 2 | 105 to 210 | 0:03.5 to 0:07 | Windows collapse into the Live Orb, which opens the manager dashboard; Overview, Finance, Staff, Stock Levels, Updates and Settings highlight in turn |
| 3 | 210 to 360 | 0:07 to 0:12 | Range switches to Today; all nine metric cards update, sales target fills past 100%, chart draws and the tooltip moves across days; Today vs Yesterday |
| 4 | 360 to 465 | 0:12 to 0:15.5 | Square, Uber Eats, Bopple and DoorDash logos fly into Revenue by Channel; the donut builds one combined total; live transaction feed |
| 5 | 465 to 600 | 0:15.5 to 0:20 | Store tablet: shift reminder, 200 m geofence, slide to clock in. Remote manager: working now, scheduled vs actual hours, clock-out review approval, stock levels, opening checklist |
| 6 | 600 to 750 | 0:20 to 0:25 | **Drafted for review.** Priority signals, then recommended next steps |
| 7 | 750 to 900 | 0:25 to 0:30 | **Drafted for review.** Three locations feed one total, then the brand lockup and core message |

The brief was cut off at scene 6, so scenes 6 and 7 were drafted to fit the core message. Their copy is in `src/config/copy.ts`.

## How the real app is used

- **Stylesheet:** `scripts/vendor-app-styles.mjs` copies `src/index.css` from `tropicool-treats-teams` (commit `b7ac280`). The dashboard is rendered with the app's own class names (`manager-desktop-sidebar`, `cfo-target-card`, `dash4-stat-card`, `cfo-panel`, `dither-donut-*`, `clock-border-beam`, `animated-bottom-menu-toolbar` and others).
- **Components ported:** the Live Orb shader, the sales/forecast/expenses chart, the dithered channel donut and the clock slider are copied from the app. Wall-clock animation was replaced with frame-driven animation so every render is identical.
- **Assets:** channel logos and the app icon come from the app's `public/` folder (Git LFS files, hash-verified).
- **Fonts:** Outfit and JetBrains Mono, the app's two families, bundled from npm.

To refresh styles after the app changes:

```bash
node scripts/vendor-app-styles.mjs /path/to/tropicool-treats-teams
```

### Intentional differences from the app

- No weight above 500, per the brief. A few app labels use 600 or 700; these are capped in `src/styles/overrides.css`.
- The sidebar greets "Hello, Manager" instead of the owner's name.
- The "Recommended next steps" panel in scene 6 is a showcase composition. It uses the app's modal card styling, and its actions point to existing app areas: Stock Levels, Staff → Time Off and the roster. It is not a shipped screen.
- The clock card's dotted sphere approximates the app's `thinking-orbs` gyro animation.
- Viewport media queries were removed from the vendored CSS; each composition lays out its own format.

## Reduced motion

Pass `{"reducedMotion": true}` as input props (or use `npm run render:reduced`). Springs become short fades, camera moves become cuts, and the orb stops floating and blinking. In Remotion Studio the operating-system preference is also honoured. All reusable components read the setting from `src/lib/motion.tsx`.

## Safe areas

- Desktop: 116 px left and right, 76 px top and bottom.
- Vertical: 80 px left and right, 230 px top and 380 px bottom, clear of social app overlays.

All captions and the closing lockup are positioned from these values in `src/lib/layout.ts`.

## Audio

Every sound is optional and configured in `src/config/assets.ts`. Put files in `public/audio/` and set the path:

```ts
export const NARRATION = {
  problem: { src: 'audio/narration/01-problem.mp3', volume: 1, offset: 4 },
  // ...
}
```

Music fades in and out automatically. Sound-effect cues are listed with the frame they belong to. See `NARRATION-SCRIPT.md` for the script and timing.

## Data and privacy

All figures are illustrative. See `SAMPLE-DATA.md`. No PINs, credentials, customer details or real staff records appear in this project.
