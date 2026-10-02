// Frame-driven port of the app's Live Orb (src/components/ui/live-orb.tsx).
// The shader and colours are copied unchanged. The app animates with
// requestAnimationFrame and the wall clock, which would make every render
// different, so here time, gaze direction and blinks come from the video frame.
import { useLayoutEffect, useRef, useState } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { useReducedMotion } from '../lib/motion'

export const ORB_WHITE = { color: '#F4F4F5', eyeColor: '#09090B' } as const

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform vec2 u_look;
uniform float u_blink;
uniform float u_mode;
uniform vec3 u_body;
uniform vec3 u_eye;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

vec3 orient(vec3 p, vec2 look) {
  float yaw = look.x * 0.92;
  float pitch = -look.y * 0.78;
  float cy = cos(yaw);
  float sy = sin(yaw);
  float cp = cos(pitch);
  float sp = sin(pitch);
  vec3 q = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  return vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
}

float eyeMask(vec3 n, vec3 e, vec3 right, vec3 up, float halfH, float rad) {
  float facing = dot(n, e);
  float x = dot(n, right) - dot(e, right);
  float y = dot(n, up) - dot(e, up);
  y -= clamp(y, -halfH, halfH);
  float d = length(vec2(x, y)) - rad;
  float fill = 1.0 - smoothstep(-0.01, 0.01, d);
  return fill * smoothstep(0.12, 0.32, facing);
}

vec3 wash(vec3 n, float t) {
  vec2 q = n.xy * 2.2 + n.z * 0.85;
  vec2 w1 = vec2(
    fbm(q * 1.4 + vec2(t * 0.22, t * 0.18)),
    fbm(q * 1.4 + vec2(-t * 0.16, t * 0.24) + 4.1)
  );
  q += (w1 - 0.5) * 0.72;
  float f = fbm(q * 2.1 + vec2(0.0, t * 0.12));
  float g = fbm(q * 4.6 - vec2(t * 0.2, 0.0));
  vec3 col = mix(u_c1, u_c2, smoothstep(0.28, 0.72, f));
  return mix(col, u_c3, pow(smoothstep(0.42, 0.9, g), 1.4));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  uv.x *= aspect;

  float radius = 0.94;
  vec2 p = uv / radius;
  float r2 = dot(p, p);
  float edge = 1.0 - smoothstep(0.985, 1.012, sqrt(max(r2, 0.0)));
  if (edge <= 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = normalize(vec3(p, z));

  vec2 look = u_look;
  float lm = length(look);
  if (lm > 1.0) look /= lm;

  vec3 right = orient(vec3(1.0, 0.0, 0.0), look);
  vec3 up = orient(vec3(0.0, 1.0, 0.0), look);
  vec3 eL = orient(normalize(vec3(-0.32, 0.08, 1.0)), look);
  vec3 eR = orient(normalize(vec3(0.32, 0.08, 1.0)), look);

  float halfH = mix(0.128, 0.012, u_blink);
  float rad = mix(0.054, 0.062, u_blink);
  float eyes = max(
    eyeMask(n, eL, right, up, halfH, rad),
    eyeMask(n, eR, right, up, halfH, rad)
  );

  vec3 body = u_mode > 0.5 ? wash(n, u_time * u_speed) : u_body;
  vec3 col = mix(body, u_eye, clamp(eyes, 0.0, 1.0));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), edge);
}
`

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type GlState = { gl: WebGLRenderingContext; uniforms: Record<string, WebGLUniformLocation | null> }

function setup(canvas: HTMLCanvasElement): GlState | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
  }
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  const program = gl.createProgram()
  if (!vs || !fs || !program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  const uniforms = Object.fromEntries(['u_resolution', 'u_time', 'u_speed', 'u_look', 'u_blink', 'u_mode', 'u_body', 'u_eye', 'u_c1', 'u_c2', 'u_c3'].map(name => [name, gl.getUniformLocation(program, name)]))
  return { gl, uniforms }
}

/** Blinks at fixed, natural-looking intervals so every render matches. */
export function blinkAmount(frame: number, fps: number, offset = 0) {
  const period = Math.round(fps * 3.4)
  const t = ((frame + offset) % period) / fps
  if (t < 0.055) return t / 0.055
  if (t < 0.1) return 1
  if (t < 0.18) return 1 - (t - 0.1) / 0.08
  return 0
}

export type LiveOrbProps = {
  size: number
  /** Gaze direction, each axis from -1 to 1. Positive y looks up. */
  look?: { x: number; y: number }
  blinkOffset?: number
}

export function LiveOrb({ size, look = { x: 0, y: 0.08 }, blinkOffset = 0 }: LiveOrbProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const reduced = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GlState | null>(null)
  const [hasGl, setHasGl] = useState(true)
  const pixels = Math.round(size * 2)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!stateRef.current) {
      stateRef.current = setup(canvas)
      if (!stateRef.current) { setHasGl(false); return }
    }
    const { gl, uniforms: u } = stateRef.current
    const body = hexToRgb(ORB_WHITE.color)
    const eye = hexToRgb(ORB_WHITE.eyeColor)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(u.u_resolution, canvas.width, canvas.height)
    gl.uniform1f(u.u_time, reduced ? 0 : frame / fps)
    gl.uniform1f(u.u_speed, reduced ? 0 : 0.55)
    gl.uniform2f(u.u_look, look.x, look.y)
    gl.uniform1f(u.u_blink, reduced ? 0 : blinkAmount(frame, fps, blinkOffset))
    gl.uniform1f(u.u_mode, 0)
    gl.uniform3f(u.u_body, body[0], body[1], body[2])
    gl.uniform3f(u.u_eye, eye[0], eye[1], eye[2])
    gl.uniform3f(u.u_c1, 0, 0, 0)
    gl.uniform3f(u.u_c2, 0, 0, 0)
    gl.uniform3f(u.u_c3, 0, 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }, [frame, fps, reduced, look.x, look.y, blinkOffset, pixels])

  return (
    <div data-slot="live-orb" role="img" aria-label="Live Orb" style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {!hasGl && (
        // Same CSS fallback face the app shows when WebGL is unavailable.
        <div style={{ position: 'absolute', inset: '2%', borderRadius: '50%', overflow: 'hidden', backgroundColor: ORB_WHITE.color }}>
          <span style={{ position: 'absolute', borderRadius: 999, backgroundColor: ORB_WHITE.eyeColor, width: '13%', height: '28%', left: `${31 + look.x * 8}%`, top: `${34 - look.y * 8}%` }} />
          <span style={{ position: 'absolute', borderRadius: 999, backgroundColor: ORB_WHITE.eyeColor, width: '13%', height: '28%', left: `${56 + look.x * 8}%`, top: `${34 - look.y * 8}%` }} />
        </div>
      )}
      <canvas ref={canvasRef} width={pixels} height={pixels} style={{ position: 'absolute', inset: 0, width: size, height: size }} />
    </div>
  )
}
