// Small canvas line chart: area fill, faint grid, emphasised endpoint, min/max labels.
export function drawChart(canvas: HTMLCanvasElement, values: number[], color: string, fmt: (n: number) => string) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim() || '#999';
  const grid = 'rgba(255,255,255,0.06)';
  const padL = 4, padR = 54, padT = 6, padB = 6;
  const vals = values.length > 400 ? values.slice(-400) : values;
  g.strokeStyle = grid; g.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const y = padT + (h - padT - padB) * (i / 3); g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke(); }
  if (vals.length < 2) {
    g.fillStyle = muted; g.font = '11px system-ui'; g.fillText('Collecting data…', padL + 4, h / 2);
    return;
  }
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1e-9) { max += Math.abs(max) * 0.05 + 1e-6; min -= Math.abs(min) * 0.05 + 1e-6; }
  const X = (i: number) => padL + (i / (vals.length - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  g.beginPath();
  vals.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = color; g.lineWidth = 1.6; g.stroke();
  g.lineTo(X(vals.length - 1), h - padB); g.lineTo(X(0), h - padB); g.closePath();
  const grd = g.createLinearGradient(0, padT, 0, h);
  grd.addColorStop(0, color + '55'); grd.addColorStop(1, color + '00');
  g.fillStyle = grd; g.fill();
  const lx = X(vals.length - 1), ly = Y(vals[vals.length - 1]);
  g.beginPath(); g.arc(lx, ly, 3, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  g.font = '10px "JetBrains Mono", monospace'; g.fillStyle = muted; g.textAlign = 'left';
  g.fillText(fmt(max), w - padR + 6, padT + 8);
  g.fillText(fmt(min), w - padR + 6, h - padB);
}
