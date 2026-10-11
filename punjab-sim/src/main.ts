// Entry point: load research data, build the world, start render + sim loop.
import './ui/style.css';
import { loadDataset } from './data/load';
import { World } from './sim/world';
import { SimRenderer } from './render/scene';
import { App } from './ui/app';

const data = loadDataset();
const world = new World(data, { seed: 7 });
const renderer = new SimRenderer(document.getElementById('viewport')!, world);
const app = new App(world, renderer);

// Exposed for console experiments, e.g. sim.world.policy.mspPaddyMult = 1.2
(window as unknown as { sim: unknown }).sim = { world, renderer, app };

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (app.speed > 0) world.advance(Math.min(6, app.speed * dt));
  renderer.update(dt);
  app.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
