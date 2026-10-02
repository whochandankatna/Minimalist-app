# Minimalist-app

Programmatic videos built with [Remotion](https://www.remotion.dev) (React + TypeScript).

## Requirements

- Node.js 18 or newer (tested on Node 22)

## Getting started

```bash
npm install      # install dependencies
npm run dev      # open Remotion Studio at http://localhost:3000
npm run build    # render MyComp to out/video.mp4
npm run lint     # typecheck
```

On the first render, Remotion downloads its own headless Chrome automatically.

## Project layout

- `src/index.ts`: entry point, registers the root
- `src/Root.tsx`: list of compositions (id, size, fps, duration)
- `src/Composition.tsx`: the starter animation
- `public/`: static assets (images, audio, fonts), loaded with `staticFile()`
- `remotion.config.ts`: CLI render settings
- `archive/`: dated copies of files from before they were edited
