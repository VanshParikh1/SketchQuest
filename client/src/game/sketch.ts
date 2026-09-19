import type Phaser from "phaser";

/**
 * Hand-drawn marker helpers. Everything takes an `Rng` so the wobble is a
 * pure function of a seed: seed from an entity id (plus a small "boil"
 * variant) and the drawing is identical every time, with no shimmer.
 */

export type Rng = () => number;
export type Pt = { x: number; y: number };
export type Ink = {
  color: number;
  width: number;
  alpha?: number;
  /** Max corner/line displacement in px (default 2). */
  wobble?: number;
};

/** FNV-1a string hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: tiny, fast, deterministic. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable rng for an entity id; `variant` picks one of the few "boil" poses. */
export function seededFor(id: string, variant = 0): Rng {
  return makeRng(hashString(id) ^ Math.imul(variant + 1, 0x9e3779b1));
}

const rand = (rng: Rng, amp: number) => (rng() * 2 - 1) * amp;
const ok = (...ns: number[]) => ns.every(Number.isFinite);
/** Longest straight run before a line gets an extra wobble point. */
const SEGMENT_PX = 48;
const MAX_HATCH_LINES = 120;

/** Strokes a polyline in short chunks, each a touch thicker or thinner, like a marker pressed unevenly. */
function strokeChunks(g: Phaser.GameObjects.Graphics, pts: Pt[], ink: Ink, rng: Rng) {
  const CHUNK = 4;
  for (let i = 0; i < pts.length - 1; i += CHUNK) {
    const end = Math.min(i + CHUNK, pts.length - 1);
    g.lineStyle(Math.max(0.6, ink.width * (0.82 + rng() * 0.36)), ink.color, ink.alpha ?? 1);
    g.beginPath();
    g.moveTo(pts[i].x, pts[i].y);
    for (let j = i + 1; j <= end; j++) g.lineTo(pts[j].x, pts[j].y);
    g.strokePath();
  }
}

/** Public wrapper: an open polyline in uneven-pressure marker chunks (no overshoot, no extra wobble). */
export function strokePolyline(g: Phaser.GameObjects.Graphics, pts: Pt[], ink: Ink, rng: Rng) {
  if (pts.length >= 2 && pts.every((p) => ok(p.x, p.y))) strokeChunks(g, pts, ink, rng);
}

/** Points from a to b with a gentle bow and small random kinks. */
function wobblePoints(a: Pt, b: Pt, rng: Rng, amp: number): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.5)) return [a, b];
  const n = Math.min(40, Math.max(1, Math.round(len / SEGMENT_PX)));
  const nx = -dy / len;
  const ny = dx / len;
  const bow = rand(rng, amp);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = bow * Math.sin(Math.PI * t) + (i > 0 && i < n ? rand(rng, amp * 0.35) : 0);
    pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  return pts;
}

/** Offsets each point by up to `amp` px. Use the result for both fill and outline so they agree. */
export function jitterPoints(pts: Pt[], amp: number, rng: Rng): Pt[] {
  return pts.map((p) => ({ x: p.x + rand(rng, amp), y: p.y + rand(rng, amp) }));
}

/** A marker line: two passes that overshoot both ends a little, with a bow and uneven pressure. */
export function sketchLine(g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, ink: Ink, rng: Rng, passes = 2) {
  if (!ok(a.x, a.y, b.x, b.y)) return;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = len > 0 ? (b.x - a.x) / len : 1;
  const uy = len > 0 ? (b.y - a.y) / len : 0;
  const amp = Math.min(ink.wobble ?? 2, Math.max(0.3, len * 0.15));
  const overshoot = Math.min(len * 0.06, 7);

  for (let pass = 0; pass < passes; pass++) {
    const o1 = overshoot * rng();
    const o2 = overshoot * rng();
    const start = { x: a.x - ux * o1 + rand(rng, amp * 0.5), y: a.y - uy * o1 + rand(rng, amp * 0.5) };
    const end = { x: b.x + ux * o2 + rand(rng, amp * 0.5), y: b.y + uy * o2 + rand(rng, amp * 0.5) };
    const pts = wobblePoints(start, end, rng, amp);
    strokeChunks(g, pts, pass === 0 ? ink : { ...ink, width: ink.width * 0.75, alpha: (ink.alpha ?? 1) * 0.8 }, rng);
  }
}

/** A hand-drawn polygon outline: corners nudged, each edge its own overshooting stroke. */
export function sketchPoly(g: Phaser.GameObjects.Graphics, pts: Pt[], ink: Ink, rng: Rng, closed = true) {
  if (pts.length < 2 || !pts.every((p) => ok(p.x, p.y))) return;
  const amp = (ink.wobble ?? 2) * 0.5;
  const corners = jitterPoints(pts, amp, rng);
  const edges = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < edges; i++) sketchLine(g, corners[i], corners[(i + 1) % corners.length], ink, rng);
}

export function rectCorners(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function sketchRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ink: Ink, rng: Rng) {
  const amp = Math.min(ink.wobble ?? 2, Math.max(0.3, Math.min(w, h) * 0.25));
  sketchPoly(g, rectCorners(x, y, w, h), { ...ink, wobble: amp }, rng);
}

/** Ellipse drawn as 1-2 loose loops that overshoot their starting point. */
export function sketchEllipse(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ink: Ink,
  rng: Rng,
  loops = 2
) {
  if (!ok(cx, cy, rx, ry) || rx <= 0 || ry <= 0) return;
  const amp = Math.min(ink.wobble ?? 1.5, Math.min(rx, ry) * 0.2);
  const n = Math.min(22, Math.max(10, Math.round(Math.max(rx, ry) * 0.9) + 8));
  for (let loop = 0; loop < loops; loop++) {
    const start = rng() * Math.PI * 2;
    const sweep = Math.PI * 2 * (1.04 + rng() * 0.08);
    const grow = 1 + (loop === 0 ? 0 : rand(rng, 0.05));
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = start + (sweep * i) / n;
      const k = grow + rand(rng, amp / Math.max(rx, ry));
      pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    strokeChunks(g, pts, loop === 0 ? ink : { ...ink, width: ink.width * 0.75, alpha: (ink.alpha ?? 1) * 0.8 }, rng);
  }
}

export function sketchCircle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, ink: Ink, rng: Rng, loops = 2) {
  sketchEllipse(g, cx, cy, r, r, ink, rng, loops);
}

/**
 * Scribble fill: diagonal marker strokes clipped to the polygon. When every
 * row is a single span the strokes are chained into one zig-zag, like real
 * scribbling; concave shapes fall back to separate strokes.
 */
export function hatchPoly(
  g: Phaser.GameObjects.Graphics,
  poly: Pt[],
  ink: Ink,
  rng: Rng,
  spacing = 12,
  angle = -Math.PI / 4,
  inset = 3
) {
  if (poly.length < 3 || !poly.every((p) => ok(p.x, p.y))) return;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = poly.map((p) => ({ u: p.x * cos + p.y * sin, v: -p.x * sin + p.y * cos }));
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of rot) {
    vMin = Math.min(vMin, p.v);
    vMax = Math.max(vMax, p.v);
  }
  const height = vMax - vMin;
  if (!(height > 2)) return;
  const step = Math.max(spacing, height / MAX_HATCH_LINES);

  const rows: Array<{ v: number; spans: Array<[number, number]> }> = [];
  for (let v = vMin + step / 2; v < vMax; v += step) {
    const xs: number[] = [];
    for (let i = 0; i < rot.length; i++) {
      const a = rot[i];
      const b = rot[(i + 1) % rot.length];
      if ((a.v <= v && b.v > v) || (b.v <= v && a.v > v)) xs.push(a.u + ((v - a.v) / (b.v - a.v)) * (b.u - a.u));
    }
    xs.sort((p, q) => p - q);
    const spans: Array<[number, number]> = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const u0 = xs[k] + inset + rng() * 3;
      const u1 = xs[k + 1] - inset - rng() * 3;
      if (u1 - u0 > 2) spans.push([u0, u1]);
    }
    if (spans.length) rows.push({ v: v + rand(rng, step * 0.15), spans });
  }
  if (!rows.length) return;

  const toWorld = (u: number, v: number): Pt => ({ x: u * cos - v * sin, y: u * sin + v * cos });
  if (rows.every((r) => r.spans.length === 1)) {
    const pts: Pt[] = [];
    rows.forEach(({ v, spans: [[u0, u1]] }, i) => {
      const forward = i % 2 === 0;
      pts.push(toWorld(forward ? u0 : u1, v), toWorld(forward ? u1 : u0, v));
    });
    strokeChunks(g, pts, ink, rng);
  } else {
    for (const { v, spans } of rows) {
      for (const [u0, u1] of spans) strokeChunks(g, [toWorld(u0, v), toWorld(u1, v)], ink, rng);
    }
  }
}

/** Solid fill for a (jittered) polygon. */
export function fillPoly(g: Phaser.GameObjects.Graphics, pts: Pt[], color: number, alpha = 1) {
  if (pts.length < 3 || !pts.every((p) => ok(p.x, p.y))) return;
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true, true);
}

/** Five-point star outline, for goal / twinkle doodles. */
export function starPoints(cx: number, cy: number, outer: number, inner: number, rotation = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (Math.PI * i) / 5;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
