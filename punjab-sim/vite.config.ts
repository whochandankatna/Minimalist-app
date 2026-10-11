import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` emits dist/index.html with everything inlined, so the whole
// simulation can be opened from disk or hosted as a single page.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { chunkSizeWarningLimit: 4000 },
});
