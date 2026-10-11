// Browser loader: picks up whichever research JSON files exist at build time.
import { buildDataset } from './normalize';
import type { Dataset } from './types';

const files = import.meta.glob('./*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export function loadDataset(): Dataset {
  const raw: Record<string, unknown> = {};
  for (const [path, mod] of Object.entries(files)) {
    const name = path.replace('./', '').replace('.json', '');
    raw[name] = mod;
  }
  return buildDataset(raw);
}
