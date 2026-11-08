// Avatar Weather Card - living background.
// A small canvas weather engine: sky colour from the sun's elevation, sun, moon with phase, stars, clouds, rain, snow, fog, wind, lightning,
// and the avatar drawn INSIDE the canvas so the weather falls in front of her. Everything is procedural, no assets.
// It is created for one canvas inside a card (size from the host element), stops when the card is removed or off-screen.
//   const bg = createBackground(canvas, host);   bg.setCondition("rainy"); bg.setSunElevation(12); bg.setCharacter({img, feetY, body, lit}); bg.destroy();
export function createBackground(canvas, host, options = {}) {

  const ctx = canvas.getContext("2d");

  // --- Performance ---------------------------------------------------------
  // A phone has a GPU that shrugs all of this off; a wall tablet's WebView or
  // a smart-TV browser often paints the canvas in software, where the same
  // scene ran at well under 1 frame a second (measured: 0.3 fps overcast,
  // 17 fps clear, at 2x pixel density with the CPU slowed 4x). Three things
  // keep it cheap everywhere:
  //   * nothing expensive is drawn per frame — clouds, sun, moon, sky and the
  //     character are rendered once into small offscreen canvases (sprites)
  //     and only copied each frame; the blur on the clouds, by far the worst
  //     offender, is baked into the sprite;
  //   * the frame rate is capped (the sky moves slowly; 30 fps looks the
  //     same as 60 on a wall and costs half);
  //   * the pixel density is capped, and lowered further on its own if the
  //     device still can't keep up (see adapt()).
  const PERF = Object.assign({ MAX_FPS: 30, MAX_PIXEL_RATIO: 1.5, AUTO: true }, options.performance || {});
  let maxFps = PERF.MAX_FPS;
  let quality = 0;            // 0 full, 1 reduced density, 2 reduced density + fewer particles

  function pixelRatio() {
    const cap = quality >= 1 ? 1 : PERF.MAX_PIXEL_RATIO;
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap));
  }
  let W = 0, H = 0, DPR = pixelRatio();
  const HAS_FILTER = "filter" in ctx;

  // Declared up here because resize() clears them, and resize() runs while
  // this module is still being evaluated.
  let skyCache = null;
  let spriteGen = 0;

  // An offscreen canvas at the current pixel density, drawn in CSS pixels.
  function makeSprite(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * DPR));
    c.height = Math.max(1, Math.ceil(h * DPR));
    const g = c.getContext("2d");
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c, g, w, h };
  }

  function resize() {
    skyCache = null;
    spriteGen++;                       // every sprite is at the old density
    DPR = pixelRatio();
    W = Math.max(1, host.clientWidth || canvas.clientWidth || 1);
    H = Math.max(1, host.clientHeight || canvas.clientHeight || 1);
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  const resizer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  if (resizer) resizer.observe(host);
  resize();

  // --- Condition -> scene profile -------------------------------------------
  // clouds/rain/snow are "none" | "light" | "heavy"
  const PROFILES = {
    "sunny":          { sun: true,  moon: false, clouds: "none",  rain: "none",  snow: false, fog: false, lightning: false, wind: false },
    "clear-night":    { sun: false, moon: true,  clouds: "none",  rain: "none",  snow: false, fog: false, lightning: false, wind: false },
    "partlycloudy":   { sun: true,  moon: true,  clouds: "light", rain: "none",  snow: false, fog: false, lightning: false, wind: false },
    "cloudy":         { sun: false, moon: false, clouds: "heavy", rain: "none",  snow: false, fog: false, lightning: false, wind: false },
    "fog":            { sun: false, moon: false, clouds: "light", rain: "none",  snow: false, fog: true,  lightning: false, wind: false },
    "rainy":          { sun: false, moon: false, clouds: "heavy", rain: "light", snow: false, fog: false, lightning: false, wind: false },
    "pouring":        { sun: false, moon: false, clouds: "heavy", rain: "heavy", snow: false, fog: false, lightning: false, wind: false },
    "snowy":          { sun: false, moon: false, clouds: "heavy", rain: "none",  snow: true,  fog: false, lightning: false, wind: false },
    "snowy-rainy":    { sun: false, moon: false, clouds: "heavy", rain: "light", snow: true,  fog: false, lightning: false, wind: false },
    "lightning":      { sun: false, moon: false, clouds: "heavy", rain: "none",  snow: false, fog: false, lightning: true,  wind: false },
    "lightning-rainy":{ sun: false, moon: false, clouds: "heavy", rain: "heavy", snow: false, fog: false, lightning: true,  wind: false },
    "hail":           { sun: false, moon: false, clouds: "heavy", rain: "heavy", snow: false, fog: false, lightning: false, wind: false },
    "windy":          { sun: true,  moon: true,  clouds: "light", rain: "none",  snow: false, fog: false, lightning: false, wind: true  },
    "windy-variant":  { sun: true,  moon: true,  clouds: "heavy", rain: "none",  snow: false, fog: false, lightning: false, wind: true  },
    "exceptional":    { sun: false, moon: false, clouds: "heavy", rain: "none",  snow: false, fog: false, lightning: false, wind: false },
  };

  let condition = "sunny";
  let isDay = true;
  let profile = PROFILES.sunny;

  function setCondition(c) {
    condition = PROFILES[c] ? c : "exceptional";
    profile = PROFILES[condition];
  }
  function setDaytime(v) {
    isDay = !!v;
  }
  // Paused while the now-playing panel covers the screen: the animation
  // loop keeps ticking so it can resume instantly, but nothing is drawn.
  let paused = false;
  function setPaused(v) {
    paused = !!v;
  }

  // --- Particle pools ---------------------------------------------------------
  let clouds = [], raindrops = [], snowflakes = [], stars = [], windStreaks = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Builds a unique, organic cumulus silhouette for one cloud: a run of
  // overlapping puffs that are taller in the middle and taper at the
  // edges, plus a couple of small puffs on top for texture. Generated once
  // per cloud (not per frame) so its shape stays stable while it drifts.
  function makeCloudPuffs() {
    const puffs = [];
    const n = 6 + Math.floor(rand(0, 4));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const heightBias = Math.sin(t * Math.PI);
      puffs.push([
        (t - 0.5) * 140 + rand(-6, 6),
        -8 - heightBias * 20 + rand(-5, 5),
        20 + heightBias * 18 + rand(-4, 4),
      ]);
    }
    for (let i = 0; i < 2; i++) {
      puffs.push([rand(-38, 38), rand(-34, -22), 11 + rand(-3, 3)]);
    }
    return puffs;
  }
  function buildClouds(density) {
    const n = density === "heavy" ? 11 : density === "light" ? 6 : 0;
    clouds = Array.from({ length: n }, () => {
      // Two rough depth layers so clouds read as flying at different
      // altitudes/distances rather than all sitting in one band: distant
      // ones are smaller, fainter and slower, near ones bigger and faster.
      const far = Math.random() < 0.5;
      return {
        x: rand(0, W),
        y: far ? rand(H * 0.02, H * 0.4) : rand(H * 0.05, H * 0.62),
        scale: far ? rand(0.35, 0.8) : rand(0.8, 1.9),
        speed: far ? rand(2, 6) : rand(7, 16),
        opacity: far ? rand(0.35, 0.6) : rand(0.65, 0.95),
        bobAmp: rand(4, 12),
        bobPeriod: rand(14000, 26000),
        bobPhase: rand(0, Math.PI * 2),
        puffs: makeCloudPuffs(),
      };
    });
  }
  function buildRain(density) {
    const n = Math.round((density === "heavy" ? 260 : density === "light" ? 110 : 0) * (quality >= 2 ? 0.5 : 1));
    raindrops = Array.from({ length: n }, () => ({
      x: rand(0, W), y: rand(0, H),
      len: rand(10, 22), speed: rand(9, 16) * (density === "heavy" ? 1.5 : 1),
    }));
  }
  function buildSnow(active) {
    const n = active ? (quality >= 2 ? 70 : 140) : 0;
    snowflakes = Array.from({ length: n }, () => ({
      x: rand(0, W), y: rand(0, H), r: rand(1.5, 4),
      speed: rand(0.6, 1.8), drift: rand(-0.6, 0.6), phase: rand(0, Math.PI * 2),
    }));
  }
  function buildStars() {
    stars = Array.from({ length: 90 }, () => ({
      x: rand(0, W), y: rand(0, H * 0.65), r: rand(0.6, 1.8),
      phase: rand(0, Math.PI * 2), speed: rand(0.5, 1.5),
    }));
  }
  function buildWind() {
    windStreaks = Array.from({ length: 18 }, () => ({
      x: rand(0, W), y: rand(0, H), len: rand(40, 120), speed: rand(6, 14),
    }));
  }


  let lastProfileKey = "";
  function ensureParticles() {
    const key = condition + "|" + W + "|" + quality;
    if (key === lastProfileKey) return;
    lastProfileKey = key;
    buildClouds(profile.clouds);
    buildRain(profile.rain);
    buildSnow(profile.snow);
    buildStars();
    buildWind();
  }

  // --- Drawing helpers ---------------------------------------------------------
  // --- Sun elevation, and the sky as a continuous function of it -----------
  // Home Assistant publishes the sun's elevation in degrees on sun.sun, so
  // the sky doesn't have to flip between a day palette and a night one at the
  // moment of sunset. Everything that depends on how high the sun is — the
  // gradient, the horizon glow, the stars, the sun and moon themselves, and
  // how far the character is graded toward evening — reads that one number.
  //
  // The bands below are the standard ones: sunset at 0, civil twilight to -6,
  // nautical to -12, astronomical to -18, night beyond. Two tables, one for a
  // clear sky and one for an overcast one, are interpolated along elevation
  // and then blended against each other by how much cloud there is, so the
  // weather still decides the colour as it did before.
  const SKY_CLEAR = [
    { el:  60, top: [ 32,  98, 190], bot: [143, 203, 239], glow: 0.00 },
    { el:  20, top: [ 47, 124, 201], bot: [143, 203, 239], glow: 0.00 },
    { el:   8, top: [ 62, 130, 196], bot: [186, 214, 233], glow: 0.18 },
    { el:   3, top: [ 63, 110, 168], bot: [242, 176, 106], glow: 0.55 },
    { el:   0, top: [ 52,  82, 127], bot: [239, 138,  84], glow: 0.85 },
    { el:  -3, top: [ 34,  53,  95], bot: [194,  95,  90], glow: 0.60 },
    { el:  -6, top: [ 21,  36,  73], bot: [ 74,  74, 122], glow: 0.28 },
    { el: -12, top: [ 10,  17,  41], bot: [ 27,  37,  71], glow: 0.06 },
    { el: -18, top: [  3,   5,  12], bot: [ 22,  29,  51], glow: 0.00 },
    { el: -90, top: [  3,   5,  12], bot: [ 22,  29,  51], glow: 0.00 },
  ];
  const SKY_OVERCAST = [
    { el:  60, top: [ 91, 107, 122], bot: [139, 152, 163], glow: 0.00 },
    { el:  20, top: [ 91, 107, 122], bot: [139, 152, 163], glow: 0.00 },
    { el:   8, top: [ 84,  98, 113], bot: [141, 149, 157], glow: 0.05 },
    { el:   3, top: [ 74,  83,  97], bot: [148, 133, 128], glow: 0.14 },
    { el:   0, top: [ 62,  69,  84], bot: [131, 112, 110], glow: 0.18 },
    { el:  -3, top: [ 46,  52,  66], bot: [ 88,  84,  93], glow: 0.10 },
    { el:  -6, top: [ 32,  37,  48], bot: [ 55,  58,  71], glow: 0.04 },
    { el: -12, top: [ 20,  24,  33], bot: [ 38,  43,  55], glow: 0.00 },
    { el: -18, top: [ 16,  20,  29], bot: [ 42,  49,  64], glow: 0.00 },
    { el: -90, top: [ 16,  20,  29], bot: [ 42,  49,  64], glow: 0.00 },
  ];

  let sunEl = 25, sunElTarget = 25, sunElKnown = false;

  // Degrees, straight from sun.sun. Passing null falls back to the day/night
  // flag, so the card still works against an instance that doesn't
  // report it.
  function setSunElevation(deg) {
    if (typeof deg === "number" && isFinite(deg)) {
      sunElTarget = Math.max(-90, Math.min(90, deg));
      if (!sunElKnown) sunEl = sunElTarget;   // the first value is the starting sky: a card that opens at night must not glide in from midday
      sunElKnown = true;
    } else {
      sunElKnown = false;
      sunElTarget = isDay ? 25 : -25;
    }
  }

  function easeElevation(dt) {
    if (!sunElKnown) sunElTarget = isDay ? 25 : -25;
    // The state is polled once a minute, so the target arrives in small steps
    // (about a quarter of a degree). Easing toward it turns each step into a
    // ramp rather than a jump; the constant is slow enough that even a large
    // correction after a reconnect glides in instead of snapping.
    sunEl += (sunElTarget - sunEl) * Math.min(1, dt * 0.6);
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function sampleSky(table, el) {
    let i = 0;
    while (i < table.length - 2 && el < table[i + 1].el) i++;
    const a = table[i], b = table[i + 1];
    const t = clamp01((a.el - el) / (a.el - b.el));
    const mix = (x, y) => Math.round(x + (y - x) * t);
    return {
      top: [mix(a.top[0], b.top[0]), mix(a.top[1], b.top[1]), mix(a.top[2], b.top[2])],
      bot: [mix(a.bot[0], b.bot[0]), mix(a.bot[1], b.bot[1]), mix(a.bot[2], b.bot[2])],
      glow: a.glow + (b.glow - a.glow) * t,
    };
  }

  // How much the sky is smothered: 0 clear, 1 solid overcast.
  function cloudiness() {
    if (profile.fog) return 1;
    if (profile.rain !== "none" || profile.snow) return 1;
    if (profile.clouds === "heavy") return 0.92;
    if (profile.clouds === "light") return 0.42;
    return 0;
  }

  function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

  // The gradients are rebuilt only when they actually change. The elevation
  // moves about a quarter of a degree a minute, so the colours are identical
  // for thousands of consecutive frames — and building a full-screen radial
  // gradient sixty times a second is exactly the kind of thing that makes a
  // cheap tablet stutter.
  function drawSky() {
    const c = cloudiness();
    const a = sampleSky(SKY_CLEAR, sunEl);
    const b = sampleSky(SKY_OVERCAST, sunEl);
    const mix3 = (x, y) => [
      Math.round(x[0] + (y[0] - x[0]) * c),
      Math.round(x[1] + (y[1] - x[1]) * c),
      Math.round(x[2] + (y[2] - x[2]) * c),
    ];
    const top = mix3(a.top, b.top);
    const bot = mix3(a.bot, b.bot);

    const glow = Math.round((a.glow * (1 - c) + b.glow * c) * 100) / 100;
    const key = `${top}|${bot}|${glow}|${W}x${H}|${spriteGen}`;
    if (!skyCache || skyCache.key !== key) {
      // Painted once into its own canvas and copied from then on: on a
      // software-rendered canvas a full-screen gradient is computed pixel by
      // pixel, and a copy is much cheaper.
      const sp = makeSprite(W, H);
      const g = sp.g;
      const lin = g.createLinearGradient(0, 0, 0, H);
      lin.addColorStop(0, rgb(top));
      lin.addColorStop(1, rgb(bot));
      let rad = null;
      if (glow > 0.01) {
        // The low sun throws its colour along the horizon rather than evenly
        // over the whole sky, on the side the sun is on. Without this the
        // sunset reads as a flat orange wash instead of a glow.
        const gx = W * 0.82, gy = H * 0.72;
        rad = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.85);
        rad.addColorStop(0, `rgba(255,150,70,${(glow * 0.45).toFixed(3)})`);
        rad.addColorStop(0.45, `rgba(255,120,60,${(glow * 0.16).toFixed(3)})`);
        rad.addColorStop(1, "rgba(255,110,60,0)");
      }
      g.fillStyle = lin;
      g.fillRect(0, 0, W, H);
      if (rad) { g.fillStyle = rad; g.fillRect(0, 0, W, H); }
      skyCache = { key, c: sp.c };
    }
    ctx.drawImage(skyCache.c, 0, 0, W, H);
  }

  // --- What the elevation implies for everything else ----------------------
  // The sun fades out as it sets and the moon fades in, so they cross over
  // instead of one being swapped for the other. The stars come up through
  // civil twilight, which is when they actually become visible.
  function sunAlpha()   { return clamp01((sunEl + 1) / 5); }
  // With a location: the moon is there whenever it is above the horizon, dim
  // by day and at full strength once the sky is dark. Without one: night only.
  function moonAlpha() {
    const dark = clamp01((3 - sunEl) / 6), mp = currentMoonPos();
    if (!mp) return dark;
    return clamp01((mp.el + 1) / 6) * (0.3 + 0.7 * dark);
  }
  function starAlpha()  { return clamp01((-sunEl - 2) / 8); }
  function eveningMix() { return clamp01((2 - sunEl) / 8); }

  // Where the sun sits on screen: high at noon, down toward the horizon as
  // the elevation falls. Kept clear of the character's side of the frame.
  function sunY() {
    const f = clamp01(sunEl / 45);
    return H * (0.42 - 0.33 * f);
  }

  // Sun and moon are the same picture every frame apart from position and a
  // slight pulse, so each is painted once (glow included) and copied.
  let sunSprite = null, moonSprite = null;

  // --- Moon phase -------------------------------------------------------------
  // Worked out here from the date, with no network: the sun's and the moon's
  // ecliptic longitudes (Meeus, the largest periodic terms only, good to about a
  // degree), and their difference is the elongation. 0 = new, 0.25 = first
  // quarter, 0.5 = full, 0.75 = last quarter. `lit` is the lit fraction of the disc.
  function lunar(ms) {
    const rad = Math.PI / 180, sn = x => Math.sin(x * rad);
    const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
    const Lm = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T;
    const M = 357.5291092 + 35999.0502909 * T, Mm = 134.9633964 + 477198.8675055 * T;
    const F = 93.2720950 + 483202.0175233 * T;
    const moon = Lm + 6.288774 * sn(Mm) + 1.274027 * sn(2 * D - Mm) + 0.658314 * sn(2 * D) +
      0.213618 * sn(2 * Mm) - 0.185116 * sn(M) - 0.114332 * sn(2 * F) + 0.058793 * sn(2 * D - 2 * Mm) +
      0.057066 * sn(2 * D - M - Mm) + 0.053322 * sn(2 * D + Mm) + 0.045758 * sn(2 * D - M);
    const sun = 280.46646 + 36000.76983 * T + 1.914602 * sn(M) + 0.019993 * sn(2 * M);
    return { rad, sn, T, D, M, Mm, F, moon, sun };
  }
  function moonPhase(ms) {
    const e = lunar(ms), psi = (((e.moon - e.sun) % 360) + 360) % 360;
    return { p: psi / 360, lit: (1 - Math.cos(psi * e.rad)) / 2 };
  }

  // --- Where the moon is in the sky ----------------------------------------------
  // The same series, plus the moon's ecliptic latitude, turned into right
  // ascension / declination and then into altitude and azimuth for the observer
  // (lat, lon in degrees, east positive). Good to a fraction of a degree, which
  // is far finer than the screen can show. Altitude is topocentric (the
  // moon is close enough that parallax, about 1 degree, matters at the
  // horizon) but not corrected for refraction. `sun: true` runs the same chain for
  // the sun, which is how the geometry was checked against sun.sun.
  function skyPosition(ms, lat, lon, body) {
    const e = lunar(ms), rad = e.rad, sn = e.sn;
    const lam = (body === "sun" ? e.sun : e.moon) * rad;
    const beta = body === "sun" ? 0 : (5.128122 * sn(e.F) + 0.280602 * sn(e.Mm + e.F) +
      0.277693 * sn(e.Mm - e.F) + 0.173237 * sn(2 * e.D - e.F) + 0.055413 * sn(2 * e.D - e.Mm + e.F) +
      0.046271 * sn(2 * e.D - e.Mm - e.F) + 0.032573 * sn(2 * e.D + e.F)) * rad;
    const eps = (23.4392911 - 0.0130042 * e.T) * rad;
    const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lam));
    const dec = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam));
    const jd = ms / 86400000 + 2440587.5;
    const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * e.T * e.T;
    const h = (gmst + lon) * rad - ra, phi = lat * rad;
    let alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)) / rad;
    const az = (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / rad + 180 + 360) % 360;
    if (body !== "sun") alt -= 0.9507 * Math.cos(alt * rad);
    return { el: alt, az };
  }
  let observer = null, moonPos = { at: 0, el: 0, az: 0 };
  function setLocation(lat, lon) {
    if (typeof lat === "number" && typeof lon === "number" && isFinite(lat) && isFinite(lon)) {
      observer = { lat, lon }; moonPos.at = 0;
    }
  }
  // Recomputed every 30 s; the moon moves a quarter of a degree a minute.
  function currentMoonPos() {
    if (!observer) return null;
    const now = Date.now();
    if (Math.abs(now - moonPos.at) > 30000 || !moonPos.at) {
      const p = skyPosition(now, observer.lat, observer.lon, "moon");
      moonPos = { at: now, el: p.el, az: p.az };
    }
    return moonPos;
  }
  // The phase as the sprite sees it: waxing = bright limb on the right (northern
  // hemisphere), waning = on the left. Quantised to 1/120 of a month (about six
  // hours) so the sprite is only repainted when the picture would visibly change.
  let moonCache = { at: 0, q: 0, lit: 0 };
  function currentMoon() {
    const now = Date.now();
    if (Math.abs(now - moonCache.at) > 600000 || !moonCache.at) {
      const m = moonPhase(now);
      moonCache = { at: now, q: Math.round(m.p * 120) % 120, lit: m.lit };
    }
    return moonCache;
  }

  function bodySprite(kind, r) {
    const cur = kind === "sun" ? sunSprite : moonSprite;
    const mq = kind === "moon" ? currentMoon().q : 0;
    if (cur && cur.r === r && cur.gen === spriteGen && cur.mq === mq) return cur;
    const R = r * (kind === "sun" ? 3.2 : 3);
    const sp = makeSprite(R * 2, R * 2), g = sp.g, cx = R, cy = R;
    // The moon's glow follows how much of it is lit: a thin crescent hardly glows.
    const k = kind === "moon" ? 0.2 + 0.8 * currentMoon().lit : 1;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, kind === "sun" ? "rgba(255,235,150,0.55)" : "rgba(220,230,255," + (0.35 * k).toFixed(3) + ")");
    glow.addColorStop(1, kind === "sun" ? "rgba(255,235,150,0)" : "rgba(220,230,255,0)");
    g.fillStyle = glow; g.fillRect(0, 0, R * 2, R * 2);
    if (kind === "sun") {
      g.fillStyle = "#ffe89a";
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    } else {
      // Dark side first (a faint blue-grey disc, the earthshine), then the lit
      // part: a half disc on the bright side closed by the terminator, which is
      // half an ellipse as wide as |cos(elongation)| of the radius — bulging
      // outwards for a crescent, inwards for a gibbous moon.
      const q = mq / 120, waxing = q < 0.5, ph = waxing ? q : 1 - q;     // 0 new .. 0.5 full
      const c = Math.cos(2 * Math.PI * ph), a = r * Math.abs(c);
      g.fillStyle = "rgba(70,82,115,0.55)";
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.save();
      if (!waxing) { g.translate(cx * 2, 0); g.scale(-1, 1); }          // waning: mirror
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);                // right half-limb
      if (c > 0) g.ellipse(cx, cy, Math.max(a, 0.01), r, 0, Math.PI / 2, -Math.PI / 2, true);   // crescent
      else g.ellipse(cx, cy, Math.max(a, 0.01), r, 0, Math.PI / 2, Math.PI * 1.5, false);       // gibbous
      g.closePath();
      g.fillStyle = "#eef2fb"; g.fill();
      g.clip();
      g.fillStyle = "rgba(180,190,210,0.5)";
      [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.1, 0.35, 0.13]].forEach(([dx, dy, dr]) => {
        g.beginPath(); g.arc(cx + dx * r * 1.6, cy + dy * r * 1.6, dr * r, 0, Math.PI * 2); g.fill();
      });
      g.restore();
    }
    const out = { c: sp.c, R, r, gen: spriteGen, mq };
    if (kind === "sun") sunSprite = out; else moonSprite = out;
    return out;
  }

  function drawSun(t) {
    const al = sunAlpha();
    if (al <= 0.01) return;
    const cx = W * 0.86, cy = sunY(), pulse = 1 + Math.sin(t / 900) * 0.03;
    const sp = bodySprite("sun", Math.round(Math.min(W, H) * 0.07));
    const R = sp.R * pulse;
    ctx.globalAlpha = al;
    ctx.drawImage(sp.c, cx - R, cy - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
  }

  function drawMoon(t) {
    const al = moonAlpha();
    if (al <= 0.01) return;
    const mp = currentMoonPos();
    let cx = W * 0.88, cy = H * 0.13;
    if (mp) {
      // Same scale as the sun: higher in the sky, higher on the screen. Slides
      // aside when the sun is up so the two never sit on top of each other.
      cy = H * (0.42 - 0.30 * clamp01(mp.el / 50));
      cx = W * (0.88 - 0.26 * sunAlpha());
    }
    const sp = bodySprite("moon", Math.round(Math.min(W, H) * 0.05));
    ctx.globalAlpha = al;
    ctx.drawImage(sp.c, cx - sp.R, cy - sp.R, sp.R * 2, sp.R * 2);
    ctx.globalAlpha = 1;
  }

  function drawStars(t) {
    const sa = starAlpha();
    if (sa <= 0.01) return;
    // Four brightness levels, one path each, instead of one fill per star.
    const LEVELS = 4, paths = [[], [], [], []];
    stars.forEach(s => {
      const k = 0.4 + 0.6 * Math.abs(Math.sin(t / 1000 * s.speed + s.phase));
      paths[Math.min(LEVELS - 1, Math.floor((k - 0.4) / 0.6 * LEVELS))].push(s);
    });
    paths.forEach((list, i) => {
      if (!list.length) return;
      ctx.fillStyle = `rgba(255,255,255,${(sa * (0.4 + 0.6 * (i + 0.5) / LEVELS)).toFixed(2)})`;
      ctx.beginPath();
      list.forEach(s => { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); });
      ctx.fill();
    });
  }

  // How lit the world is: 1 in full daylight, 0 once the sun is well down.
  // Used for anything that is lit BY the sun rather than being the sun.
  function lightLevel() { return clamp01((sunEl + 6) / 12); }

  // Each cloud is painted once into its own small canvas — blur, underside
  // and gradient included — and only copied each frame. Painting it live
  // meant a blur filter over every cloud sixty times a second, which a
  // software-rendered canvas (tablet WebView, TV browser) cannot do: that
  // alone took an overcast sky to a fraction of a frame per second. The
  // sprite is repainted only when the daylight has changed visibly (the
  // light level is rounded to 1/20), i.e. a few times across a sunset.
  function cloudSprite(c) {
    const L = Math.round(lightLevel() * 20) / 20;
    if (c._sprite && c._spriteL === L && c._spriteGen === spriteGen) return c._sprite;
    const { scale, puffs } = c;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    puffs.forEach(([dx, dy, r]) => {
      const rr = r * 1.05;
      minX = Math.min(minX, dx - rr); maxX = Math.max(maxX, dx + rr);
      minY = Math.min(minY, dy - rr); maxY = Math.max(maxY, dy + 7 + rr);
    });
    const pad = 8;
    const w = (maxX - minX) * scale + pad * 2, h = (maxY - minY) * scale + pad * 2;
    const sp = makeSprite(w, h), g = sp.g;
    const x = pad - minX * scale, y = pad - minY * scale;   // cloud origin inside the sprite

    // Clouds are lit from above by the sun, so they have to go out with it.
    // A white cloud over a midnight sky is the thing that gives away a
    // background that only knows "day" and "night".
    const opacity = c.opacity * (0.55 + 0.45 * L);
    const mixc = (night, day) => Math.round(night + (day - night) * L);
    const bodyTop = [mixc(96, 255), mixc(104, 255), mixc(120, 255)];
    const bodyBot = [mixc(58, 196), mixc(64, 206), mixc(80, 220)];
    const under = [mixc(38, 144), mixc(43, 161), mixc(55, 182)];

    if (HAS_FILTER) g.filter = "blur(3px)";
    // Soft shaded underside, drawn first and offset slightly down, so the
    // cloud reads as a lit volume rather than a flat cutout.
    g.globalAlpha = opacity * (0.35 + 0.15 * L);
    g.fillStyle = `rgb(${under[0]},${under[1]},${under[2]})`;
    g.beginPath();
    puffs.forEach(([dx, dy, r]) => { const px = x + dx * scale + r * scale * 1.05, py = y + dy * scale + 7 * scale;
      g.moveTo(px, py); g.arc(x + dx * scale, py, r * scale * 1.05, 0, Math.PI * 2); });
    g.fill();
    // Main body: a top-lit, cooler-shadowed gradient instead of flat white.
    const grad = g.createLinearGradient(0, y - 34 * scale, 0, y + 22 * scale);
    grad.addColorStop(0, `rgba(${bodyTop[0]},${bodyTop[1]},${bodyTop[2]},${opacity})`);
    grad.addColorStop(1, `rgba(${bodyBot[0]},${bodyBot[1]},${bodyBot[2]},${opacity})`);
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.beginPath();
    puffs.forEach(([dx, dy, r]) => { g.moveTo(x + dx * scale + r * scale, y + dy * scale);
      g.arc(x + dx * scale, y + dy * scale, r * scale, 0, Math.PI * 2); });
    g.fill();

    c._sprite = { c: sp.c, ox: x, oy: y, w, h };
    c._spriteL = L; c._spriteGen = spriteGen;
    return c._sprite;
  }

  function cloudShape(c, t) {
    const y = c.y + Math.sin(t / c.bobPeriod + c.bobPhase) * c.bobAmp;
    const sp = cloudSprite(c);
    ctx.drawImage(sp.c, c.x - sp.ox, y - sp.oy, sp.w, sp.h);
  }
  // --- Clouds follow the real wind ------------------------------------------------
  // The wind arrives as speed (km/h) and bearing (where it blows FROM, degrees
  // or a compass word). The picture is a view toward the south, like the sun's
  // path, so east is on the left: a westerly pushes the clouds leftwards, an
  // easterly rightwards. A wind along the line of sight (north/south) still moves
  // them a little rather than freezing them. The speed factor multiplies each
  // cloud's own depth-based speed (calm = a lazy drift, 60 km/h = about four
  // times faster) and both eases in, so a gust change glides instead of jumping.
  // With no wind data it keeps the old gentle rightward drift.
  let windFactor = 1, windFactorTarget = 1, windDir = 1, windDirTarget = 1;
  const COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  function setWind(kmh, bearing) {
    if (typeof kmh !== "number" || !isFinite(kmh)) { windFactorTarget = 1; windDirTarget = 1; return; }
    let deg = typeof bearing === "number" ? bearing : COMPASS[String(bearing || "").toUpperCase()];
    windFactorTarget = Math.max(0.4, Math.min(4.5, 0.4 + kmh / 15));
    if (typeof deg !== "number" || !isFinite(deg)) { windDirTarget = 1; return; }
    // Blowing toward deg+180; on screen east is left, so x = -sin(toward) = sin(from).
    const s = Math.sin(deg * Math.PI / 180);
    windDirTarget = Math.sign(s || 1) * (0.35 + 0.65 * Math.abs(s));
  }
  function drawClouds(dt, t) {
    const k = Math.min(1, dt * 0.35);
    windFactor += (windFactorTarget - windFactor) * k;
    windDir += (windDirTarget - windDir) * k;
    const v = windFactor * windDir;
    clouds.forEach(c => {
      c.x += c.speed * v * dt;
      const m = 100 * c.scale;
      if (c.x - m > W) c.x = -m; else if (c.x + m < 0) c.x = W + m;
      cloudShape(c, t);
    });
  }

  function drawRain(dt) {
    ctx.strokeStyle = "rgba(190,215,240,0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();                    // one path for every drop
    raindrops.forEach(d => {
      d.y += d.speed * 60 * dt;
      d.x -= d.speed * 6 * dt;
      if (d.y > H) { d.y = -10; d.x = rand(0, W); }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 4, d.y + d.len);
    });
    ctx.stroke();
  }

  function drawSnow(dt) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    snowflakes.forEach(f => {
      f.y += f.speed * 30 * dt;
      f.x += Math.sin(f.phase + f.y / 40) * 0.4 * dt * 60;
      if (f.y > H) { f.y = -6; f.x = rand(0, W); }
      ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    });
    ctx.fill();
  }

  let fogGrads = null, fogKey = "";
  function drawFog(t) {
    const shift = (t / 40) % W;
    if (fogKey !== W + "x" + H) {
      fogKey = W + "x" + H;
      fogGrads = [0, 1, 2].map(i => {
        const y = H * (0.55 + i * 0.13);
        const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, `rgba(255,255,255,${0.18 - i * 0.03})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        return g;
      });
    }
    for (let i = 0; i < 3; i++) {
      const y = H * (0.55 + i * 0.13);
      ctx.fillStyle = fogGrads[i];
      ctx.fillRect(-shift, y - 40, W + shift * 2, 80);
    }
  }

  function getSeason() {
    const m = new Date().getMonth(); // 0 = Jan
    if (m === 11 || m <= 1) return "winter";
    if (m <= 4) return "spring";
    if (m <= 7) return "summer";
    return "autumn";
  }

  // Temperature is what really decides how people dress, so app.js feeds
  // it in; until it arrives we fall back on the month.
  let tempC = null;
  function setTemperature(c) {
    tempC = typeof c === "number" && isFinite(c) ? c : null;
  }

  const tickerHeightPx = 0;   // no news ticker inside the card
  function drawWind(dt) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    windStreaks.forEach(s => {
      s.x += s.speed * 60 * dt;
      if (s.x > W + s.len) { s.x = -s.len; s.y = rand(0, H); }
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.len, s.y + s.len * 0.06);
    });
    ctx.stroke();
  }

  let lightningTimer = 0, lightningFlash = 0;
  function drawLightning(dt) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningFlash = 1;
      lightningTimer = rand(3, 9);
    }
    if (lightningFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${lightningFlash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
      lightningFlash -= dt * 2.5;
      if (lightningFlash < 0) lightningFlash = 0;
    }
  }

  // --- The character ---------------------------------------------------------
  // She is drawn INSIDE the canvas, not as an <img> stacked on top of it, and
  // the position in the frame loop is the reason: rain, snow, wind and the
  // lightning flash are all drawn after this call, so the weather falls in
  // front of her instead of behind. An <img> element could never do that
  // without a second canvas.
  //
  // character.js decides which picture she is wearing and hands it over here
  // already loaded. Every image in the set is normalised so her body is the
  // same height and she stands on the same point (see process.py), so all
  // this needs from the manifest is `feetY` — how far down the picture the
  // ground is — and the images are then interchangeable without her jumping
  // or changing size when the weather does.
  const CHAR_X = options.charX != null ? options.charX : 0.5;       // where she stands, as a fraction of the width (a card on the right of a dashboard may want 0.74)
  const CHAR_BODY = options.charBody != null ? options.charBody : 0.74;   // her body height, as a fraction of usable height
  const CHAR_DEPTH = 75;      // base depth below her soles that is always kept on screen (picture units)
  const CHAR_FADE = 0.7;      // seconds of cross-fade when the picture changes

  let charCur = null, charPrev = null, charMix = 1;

  // `entry` is { img, feetY, body, lit }. `lit` means the picture was already
  // drawn for the evening, so the canvas must not grade it a second time.
  // Passing null takes her off the screen.
  function setCharacter(entry) {
    if (!entry || !entry.img) { charPrev = charCur; charCur = null; charMix = 0; return; }
    if (charCur && charCur.img === entry.img) return;
    charPrev = charCur;
    charCur = entry;
    charMix = charPrev ? 0 : 1;
  }

  // The evening version of each picture is the daytime one cooled and dimmed,
  // cached the first time it is needed. Generating it here rather than asking
  // for a second set of images halves what has to be drawn and downloaded,
  // and it keeps her lighting consistent with the sky the canvas is painting
  // behind her.
  function evening(img) {
    if (img._evening) return img._evening;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(26, 34, 74, 0.40)";      // cool the whole figure
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(255, 170, 90, 0.10)";    // a little warm light back in
    g.fillRect(0, 0, c.width, c.height);
    img._evening = c;
    return c;
  }

  function paintCharacter(entry, alpha) {
    if (!entry || alpha <= 0.001) return;
    const img = entry.img;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    // Her feet sit above the ticker (or the bottom of the screen) with room under
    // them for the base she stands on, which in the pictures reaches CHAR_DEPTH
    // units below the soles (a typical picture; see the clamp below for deeper
    // ones). The bottom margin is a fraction of the height, so it holds whatever
    // resolution the tablet or kiosk panel reports.
    const bottom = H - tickerHeightPx - H * 0.012;
    // Body height is deliberately constant across the set — that is what
    // stops her jumping when the weather changes. CHAR_BODY is chosen so the
    // tallest picture (an open umbrella well above her head) still fits; the
    // second term is only a safety net for a screen shorter than anything
    // expected, where being a little smaller beats having her head cut off.
    const s0 = (CHAR_BODY * (H - tickerHeightPx)) / entry.body;
    const ground = bottom - CHAR_DEPTH * s0;
    // Head to the bottom of the base has to fit in the usable height too: a picture with a very
    // deep base is drawn a little smaller instead of pushing her head off the top.
    const span = ih - (entry.feetY - entry.body);
    const scale = Math.min(s0, ground / entry.feetY, (0.94 * (H - tickerHeightPx)) / span);
    const x = W * CHAR_X - (iw / 2) * scale;
    // A picture whose base is deeper than usual is lifted just enough for the whole
    // base to stay on screen, never cut off by the bottom edge or the ticker.
    const y = Math.min(ground - entry.feetY * scale, bottom - ih * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    // The picture itself may change abruptly — that is fine, and intended —
    // but its lighting should not. Draw the daylight version, then the evening
    // version over it at the strength the sun's elevation calls for, so she
    // darkens through dusk along with the sky instead of snapping at sunset.
    //
    // Both are composited once, already at the size she appears on screen,
    // and that one bitmap is what gets copied each frame. Scaling a 600×1000
    // picture down on every frame is cheap on a phone and not on a TV.
    const mix = entry.lit ? 0 : Math.round(eveningMix() * 40) / 40;
    const dw = iw * scale, dh = ih * scale;
    const key = `${Math.round(dw)}x${Math.round(dh)}|${mix}|${spriteGen}`;
    if (!img._screen || img._screenKey !== key) {
      const sp = makeSprite(dw, dh);
      sp.g.imageSmoothingQuality = "high";
      sp.g.drawImage(img, 0, 0, dw, dh);
      if (mix > 0.01) {
        sp.g.globalAlpha = mix;
        sp.g.drawImage(evening(img), 0, 0, dw, dh);
      }
      img._screen = sp.c; img._screenKey = key;
    }
    ctx.drawImage(img._screen, x, y, dw, dh);
    ctx.restore();
  }

  function drawCharacter(dt) {
    if (charMix < 1) {
      charMix = Math.min(1, charMix + dt / CHAR_FADE);
      paintCharacter(charPrev, 1 - charMix);
      if (charMix >= 1) charPrev = null;
    }
    paintCharacter(charCur, charMix);
  }

  // --- Main loop -----------------------------------------------------------
  let lastTime = performance.now(), drawn = 0;
  let meterFrames = 0, meterT0 = performance.now(), slowFor = 0;

  // Every couple of seconds: how many frames did we actually get? If it is
  // well under the cap for a while, the device is struggling — step down,
  // first the pixel density, then the number of drops and flakes. It never
  // steps back up on its own: a device that was slow once will be slow again.
  function adapt(now) {
    meterFrames++;
    const span = now - meterT0;
    if (span < 2000) return;
    const fps = meterFrames * 1000 / span;
    meterFrames = 0; meterT0 = now;
    if (PERF.AUTO && !paused && quality < 2) {
      slowFor = fps < maxFps * 0.7 ? slowFor + 1 : 0;
      if (slowFor >= 3) {                       // ~6 s below 70% of the cap
        quality++; slowFor = 0;
        if (quality === 2) maxFps = Math.min(maxFps, 24);
        resize(); lastProfileKey = "";          // rebuild at the new level
      }
    }
  }

  let raf = 0, alive = true, visible = true;
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    // The frame rate cap: skip this vsync if the last frame was too recent.
    // (The 2 ms allowance keeps a 60 Hz screen at an even 30, not 20.)
    if (now - lastTime < 1000 / maxFps - 2) return;
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    adapt(now);

    if (paused) return;
    drawn++;

    ensureParticles();
    easeElevation(dt);
    drawSky();

    // No day/night switch here any more: each of these decides for itself how
    // visible it should be from the sun's elevation, so they cross-fade.
    drawStars(now);
    // The condition says whether the sky is clear enough to see anything up
    // there; the elevation says which of the two it is. Reading it this way
    // means a "sunny" state that lingers after dark still gets a moon, and a
    // "clear-night" state that lingers after dawn still gets a sun.
    const clearSky = profile.sun || profile.moon;
    if (clearSky) { drawSun(now); drawMoon(now); }
    if (profile.clouds !== "none") drawClouds(dt, now);
    if (profile.fog) drawFog(now);
    drawCharacter(dt, now);
    if (profile.rain !== "none") drawRain(dt);
    if (profile.snow) drawSnow(dt);
    if (profile.wind) drawWind(dt);
    if (profile.lightning) drawLightning(dt);
  }
  raf = requestAnimationFrame(frame);
  const watcher = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; }) : null;
  if (watcher) watcher.observe(host);
  function destroy() { alive = false; cancelAnimationFrame(raf); if (resizer) resizer.disconnect(); if (watcher) watcher.disconnect(); }

  return {
    destroy, resize,
    setCondition, setDaytime, setSunElevation, setLocation, setWind, setTemperature, setCharacter, setPaused,
    stats: () => ({ drawn, quality, dpr: DPR, maxFps }),
    moon: () => Object.assign({}, moonPhase(Date.now()), currentMoonPos()),
  };
}
