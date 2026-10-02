// Renders a set of review stills from one bundle (much faster than repeated
// `remotion still` calls).
//
// Usage:
//   node scripts/review-stills.mjs <CompositionId> <frame,frame,...> <outDir> [propsJson]
// Example:
//   node scripts/review-stills.mjs TropicoolShowcaseDesktop 60,300,600 out/stills
// Set BROWSER_EXE to use a specific Chrome Headless Shell (optional).
import { bundle } from '@remotion/bundler'
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [, , comp, framesArg, outDir = 'out/stills', propsJson] = process.argv
if (!comp || !framesArg) {
  console.error('Usage: node scripts/review-stills.mjs <CompositionId> <frames> [outDir] [propsJson]')
  process.exit(1)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(outDir, { recursive: true })
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') })
const browserExecutable = process.env.BROWSER_EXE || null
const chromiumOptions = { gl: 'angle' }
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions })
const inputProps = propsJson ? JSON.parse(propsJson) : {}
const composition = await selectComposition({ serveUrl, id: comp, inputProps, puppeteerInstance: browser, browserExecutable })
for (const frame of framesArg.split(',').map(Number)) {
  const output = path.join(outDir, `${comp}-${String(frame).padStart(3, '0')}.png`)
  await renderStill({ composition, serveUrl, frame, output, inputProps, puppeteerInstance: browser, browserExecutable, chromiumOptions, scale: 0.5 })
  console.log('ok', frame)
}
await browser.close({ silent: true })
