// Background removal for pictures on a plain colour (a chroma key such as grey #808080). Runs in the panel only: the result is
// saved as a transparent picture, the original is kept so the cut can be redone with other settings.
//
// What goes: the colour connected to the top edge and to the sides (so the grey of a coat stays), plus the closed gaps of that colour
// (between legs and arms) that are at least `hole` big. The edge is softened and cleaned of the background halo.

/** The colour of the border (top edge and upper part of the sides) and how much of the border is that colour (0..1). */
export function detectColor(d, w, h) {
  const up = Math.floor(h * 0.6), ch = [[], [], []], pts = [];
  for (let x = 0; x < w; x += Math.max(1, w >> 6)) pts.push([x, 0]);
  for (let y = 0; y < up; y += Math.max(1, h >> 6)) { pts.push([0, y]); pts.push([w - 1, y]); }
  for (const [x, y] of pts) { const i = (y * w + x) * 4; ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
  const color = ch.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
  let near = 0;
  for (const [x, y] of pts) { const i = (y * w + x) * 4; if (Math.max(Math.abs(d[i] - color[0]), Math.abs(d[i + 1] - color[1]), Math.abs(d[i + 2] - color[2])) <= 24) near++; }
  return { color, plain: near / pts.length };
}

/** True when no pixel is transparent: the picture still has its background. */
export function isOpaque(d) {
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return false;
  return true;
}

export const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
export const rgb = (s) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s || ""); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null; };

/**
 * @param src   RGBA pixels (Uint8ClampedArray) of the picture with its background
 * @param color [r, g, b] of the background
 * @param tol   0..100 (50 = default): how far from the colour a pixel may be and still count as background
 * @param hole  0..100 (15 = default): the smallest closed gap that is removed (0 = every gap, 100 = only huge ones)
 * @returns {data, ground}: RGBA pixels with the new alpha; ground = true when the ground reaches both sides of the picture
 */
export function cutBackground(src, w, h, color, tol, hole) {
  const n = w * h, [R, G, B] = color;
  const k = Math.max(0.1, tol) / 50, lo = Math.max(2, 14 * k), hi = Math.max(lo + 4, 36 * k);
  const dist = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) dist[p] = Math.max(Math.abs(src[i] - R), Math.abs(src[i + 1] - G), Math.abs(src[i + 2] - B));
  // 1. the background connected to the top edge and the upper part of the sides
  const gone = new Uint8Array(n), stack = new Int32Array(n);
  let sp = 0;
  const seed = (p) => { if (!gone[p] && dist[p] < hi) { gone[p] = 1; stack[sp++] = p; } };
  const up = Math.floor(h * 0.6);
  for (let x = 0; x < w; x++) seed(x);
  for (let y = 0; y < up; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const p = stack[--sp], x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < n - w) seed(p + w);
  }
  // 2. closed gaps: clearly background-coloured regions, not connected to the edge, at least `hole` big
  const minHole = hole <= 0 ? 1 : Math.max(1, Math.round(hole * 0.00002 * n));
  const seen = new Uint8Array(n), comp = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (seen[s] || gone[s] || dist[s] >= lo) continue;
    let cs = 0; sp = 0; stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const p = stack[--sp]; comp[cs++] = p;
      const x = p % w, nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < n - w ? p + w : -1];
      for (const q of nb) if (q >= 0 && !seen[q] && !gone[q] && dist[q] < lo) { seen[q] = 1; stack[sp++] = q; }
    }
    if (cs >= minHole) for (let j = 0; j < cs; j++) gone[comp[j]] = 1;
  }
  // 3. the soft edge only exists next to the removed area: dilate it by 2 pixels
  const hz = new Uint8Array(n), zone = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const o = y * w; let c = 0;
    for (let x = 0; x < w + 2; x++) {
      if (x < w) c += gone[o + x];
      if (x - 5 >= 0) c -= gone[o + x - 5];
      if (x - 2 >= 0 && x - 2 < w) hz[o + x - 2] = c > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = 0; y < h + 2; y++) {
      if (y < h) c += hz[y * w + x];
      if (y - 5 >= 0) c -= hz[(y - 5) * w + x];
      if (y - 2 >= 0 && y - 2 < h) zone[(y - 2) * w + x] = c > 0 ? 1 : 0;
    }
  }
  // 4. alpha, and the background colour taken out of the semi-transparent edge pixels: c = (c - bg * (1 - a)) / a
  const out = new Uint8ClampedArray(n * 4), span = hi - lo;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let a = 255;
    if (zone[p]) { const d = dist[p]; a = d <= lo ? 0 : d >= hi ? 255 : Math.round(((d - lo) * 255) / span); }
    if (a > 0 && a < 255) {
      const f = a / 255;
      out[i] = (src[i] - R * (1 - f)) / f; out[i + 1] = (src[i + 1] - G * (1 - f)) / f; out[i + 2] = (src[i + 2] - B * (1 - f)) / f;
    } else { out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; }
    out[i + 3] = a;
  }
  let left = false, right = false;
  for (let y = Math.floor(h * 0.6); y < h; y++) { if (out[(y * w) * 4 + 3] > 128) left = true; if (out[(y * w + w - 1) * 4 + 3] > 128) right = true; }
  return { data: out, ground: left && right };
}
