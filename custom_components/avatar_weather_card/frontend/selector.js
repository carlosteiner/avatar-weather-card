// Avatar Weather Card - picture selector.
// Pure functions: given the weather, the time and the list of available slots, name the picture to show.
export const TEMP_RANK = { freezing: 0, cold: 1, chilly: 2, mild: 3, warm: 4, hot: 5, heatwave: 6 };
// Old names: hotdry / hothumid = hot + a humidity tag.
// Only "humid" matters in a file name; anything else (dry, normal, or no tag) means normal. hotdry / hothumid are still read as old spellings.
const TEMP_ALIAS = { hotdry: ["hot", "any"], hothumid: ["hot", "humid"] };
export const HUMS = ["humid", "dry", "normal"];   // tags accepted in a name; only "humid" has an effect
// Humidity has two levels, humid and normal (= no tag), and only matters for warm, hot and heatwave weather under a clear, cloudy or windy sky.
export const HUM_TEMPS = { warm: 1, hot: 1, heatwave: 1 };
// Humidity is measured only under a dry sky; rain, storms, snow and fog count as humid whatever the sensor says
// (so the old hothumid_rain pictures are right for them). Explicit humid/dry tags are only allowed with a dry sky.
const HUM_SKIES = { clear: 1, cloudy: 1, wind: 1 };
export const SKIES = ["clear", "cloudy", "wind", "fog", "rain", "storm", "hail", "sleet", "snow", "snowstorm", "fair", "any"];
export const MOMENT_LIST = ["earlymorning", "morning", "midday", "afternoon", "goldenhour", "evening", "lateevening", "night", "day", "any"];
const DAYTIME = { morning: 1, midday: 2, afternoon: 3, goldenhour: 4 };
const NIGHTTIME = { evening: 1, lateevening: 2, night: 3 };
export const DEFAULT_MOMENTS = { EARLYMORNING: "05:00", MORNING: "08:30", MIDDAY: "12:00", AFTERNOON: "15:00", LATEEVENING: "22:00", NIGHT: "01:00" };

// The reduced set of slots (2026-11-08): the weather and the clock are folded into it before a picture is looked for,
// so the settings only need 5 temperature bands, 4 skies and 5 moments. Pictures with the finer names still work (nearest pick).
export const FOLD_TEMP = { freezing: "cold", heatwave: "hot" };
export const FOLD_SKY = { storm: "rain", hail: "rain", sleet: "snow", snowstorm: "snow", fog: "cloudy", wind: "cloudy" };
export const FOLD_MOMENT = { midday: "morning", goldenhour: "afternoon", lateevening: "evening" };

export function createSelector(opts = {}) {
  const WIND_KMH = opts.windKmh ?? 25, HUMID_PCT = opts.humidPct ?? 65;
  const MOMENTS = { ...DEFAULT_MOMENTS, ...(opts.moments || {}) };
  const MOMENTS_FREE = opts.freeMoments ? { ...DEFAULT_MOMENTS, ...opts.freeMoments } : null;   // times for weekends/holidays (optional)
  const FOLLOW_DAWN = !!opts.followDawn, DAWN_OFFSET = opts.dawnOffset ?? 0;
  const TB = { heatwave: 35, hot: 29, warm: 23, mild: 17, chilly: 10, cold: 2, ...(opts.tempBands || {}) };
  const weekendLooks = opts.weekendLooks !== false;
  // events: { halloween: ["10-31","10-31"], ... }
  const EVENTS = opts.events || {};
  const holidays = new Set(opts.holidays || []);
  const hhmm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "")); return m ? +m[1] * 60 + +m[2] : null; };

  function parse(name) {
    const parts = name.split("_");
    const music = parts[0] === "music";
    if (music) parts.shift();
    let n = 0;
    if (/^\d+$/.test(parts[parts.length - 1])) n = +parts.pop();
    if (!music && EVENTS[parts[0]]) {
      if (parts.length !== 2 || MOMENT_LIST.indexOf(parts[1]) < 0) return null;
      return { name, event: parts[0], temp: "any", hum: "any", sky: "any", moment: parts[1], weekend: false, n, music: false, base: name.replace(/_\d+$/, "") };
    }
    let weekend = false;
    if (parts[parts.length - 1] === "weekend") { weekend = true; parts.pop(); }
    let temp = parts.shift(), hum = "any";
    if (temp in TEMP_ALIAS) { [temp, hum] = TEMP_ALIAS[temp]; }
    else if (HUMS.indexOf(parts[0]) >= 0) hum = parts.shift() === "humid" ? "humid" : "any";
    const sky = music ? "any" : parts[0];
    if (hum === "humid" && (!HUM_TEMPS[temp] || !HUM_SKIES[sky])) hum = "any";   // humidity only matters for warm/hot/heatwave under clear, cloudy or wind: elsewhere the tag is ignored
    const moment = music ? parts[0] : parts[1];
    const expected = music ? 1 : 2;
    if (parts.length !== expected || !(temp in TEMP_RANK || temp === "any") ||
        SKIES.indexOf(sky) < 0 || MOMENT_LIST.indexOf(moment) < 0) return null;
    return { name, temp, hum, sky, moment, weekend, n, music, base: name.replace(/_\d+$/, "") };
  }

  // "humid" from HUMID_PCT up, otherwise "normal" (also when unknown).
  function humBand(h) {
    return h != null && isFinite(h) && h >= HUMID_PCT ? "humid" : "normal";
  }

  function tempBand(t) {
    if (t == null || !isFinite(t)) return "mild";
    if (t >= TB.heatwave) return "heatwave";
    if (t >= TB.hot) return "hot";
    if (t >= TB.warm) return "warm";
    if (t >= TB.mild) return "mild";
    if (t >= TB.chilly) return "chilly";
    if (t >= TB.cold) return "cold";
    return "freezing";
  }

  function skyOf(s) {
    const c = s.condition;
    const windy = s.wind != null && s.wind >= WIND_KMH;
    if (c === "hail") return "hail";
    if (c === "lightning" || c === "lightning-rainy") return "storm";
    if (c === "snowy") return windy ? "snowstorm" : "snow";
    if (c === "snowy-rainy") return "sleet";
    if (c === "rainy" || c === "pouring") return "rain";
    if (c === "fog") return "fog";
    if (c === "windy" || c === "windy-variant" || windy) return "wind";
    if (c === "cloudy" || c === "exceptional") return "cloudy";
    return "clear";
  }

  // s = { isDay, solar, sunrise }  sunrise: minutes after midnight (local), used when followDawn is on.
  function momentOf(s, d) {
    const m = d.getHours() * 60 + d.getMinutes();
    const M = MOMENTS_FREE && isFree(d) ? MOMENTS_FREE : MOMENTS;
    const at = (k) => hhmm(M[k]);
    let morning = at("MORNING");
    if (FOLLOW_DAWN && s.sunrise != null && isFinite(s.sunrise)) {   // morning begins at sunrise, kept between early morning and midday
      morning = Math.min(at("MIDDAY") - 30, Math.max(at("EARLYMORNING") + 30, s.sunrise + DAWN_OFFSET));
    }
    if (m >= at("EARLYMORNING") && m < morning) return "earlymorning";
    if (m >= at("NIGHT") && m < at("EARLYMORNING")) return "night";
    if (s.isDay === false) {
      if (m >= morning && m < 12 * 60) return "morning";
      return (m >= at("LATEEVENING") || m < at("NIGHT")) ? "lateevening" : "evening";
    }
    if (s.solar === "sunset") return "goldenhour";
    if (m < at("MIDDAY")) return "morning";
    if (m < at("AFTERNOON")) return "midday";
    return "afternoon";
  }

  // want = {temp, hum}, have = picture {temp, hum}
  const HUM_NORMAL = 0.3;   // wanted "normal" but the picture is tagged humid
  function tempCost(want, have) {
    if (have.temp === "any") return 1.5 + humCost(want, have);
    // Sticky heat: a humid 30 degrees and 36 degrees are nearly the same outfit.
    if ((want.temp === "heatwave" && have.temp === "hot" && have.hum === "humid") ||
        (want.temp === "hot" && want.hum === "humid" && have.temp === "heatwave")) return 0.15;
    const d = TEMP_RANK[have.temp] - TEMP_RANK[want.temp];   // >0: picture is for warmer weather
    const dist = d === 0 ? 0 : d > 0 ? 1.6 * d : 0.7 * -d;
    return dist + humCost(want, have);
  }
  function humCost(want, have) {
    if (have.hum === "any" || want.hum === have.hum) return 0;
    return HUM_NORMAL;   // want normal (or no humidity at all, as in a plain cell name), picture humid: a humid picture must not take the place of a normal one
  }

  const DRY = { clear: 1, cloudy: 1, wind: 1, fog: 1 };
  const SNOWY = { snow: 1, snowstorm: 1 };
  const WET = { rain: 1, storm: 1, hail: 1, sleet: 1 };
  const SKY_NEAR = {
    "clear|cloudy": 2, "clear|wind": 2, "cloudy|wind": 2, "cloudy|fog": 1.5, "clear|fog": 3, "wind|fog": 3,
    "rain|storm": 3, "rain|hail": 3, "storm|hail": 2, "rain|sleet": 3, "storm|sleet": 4, "hail|sleet": 3, "snow|snowstorm": 2,
  };
  function skyCost(want, have) {
    if (have === "any") return DRY[want] ? 1 : 6;
    if (have === "fair") return DRY[want] ? 0.3 : 8;
    if (want === have) return 0;
    const pair = SKY_NEAR[want + "|" + have] || SKY_NEAR[have + "|" + want];
    if (pair) return pair;
    const gear = (k) => WET[k] || SNOWY[k];
    if (gear(have) && DRY[want]) return 12;
    if (gear(want) && DRY[have]) return 8;
    if (have === "sleet" || want === "sleet") return 3;
    return 5;
  }
  function momentCost(want, have) {
    if (have === "any") return 1;
    if (want === have) return 0;
    if (have === "day") {
      if (DAYTIME[want]) return want === "goldenhour" ? 0.8 : 0.3;
      if (want === "earlymorning") return 2;
      return 3;
    }
    if (DAYTIME[want] && DAYTIME[have]) return 0.5 * Math.abs(DAYTIME[want] - DAYTIME[have]);
    if (NIGHTTIME[want] && NIGHTTIME[have]) return 0.25 * Math.abs(NIGHTTIME[want] - NIGHTTIME[have]);
    if (want === "earlymorning") return DAYTIME[have] ? 2 + 0.5 * (DAYTIME[have] - 1) : 4;
    if (have === "earlymorning") return DAYTIME[want] ? 2.5 + 0.5 * (DAYTIME[want] - 1) : 4;
    if (want === "goldenhour" && have === "evening") return 1.5;
    if (want === "evening" && have === "goldenhour") return 1.5;
    return 3;
  }
  const wildcards = (p) => (p.temp === "any") + (p.hum === "any") + (p.sky === "any" || p.sky === "fair") + (p.moment === "any" || p.moment === "day");
  function score(p, want) {
    if (p.event) return momentCost(want.moment, p.moment);
    if (p.weekend && !want.weekend) return Infinity;
    let s = tempCost(want, p) + momentCost(want.moment, p.moment);
    if (!p.music) s += skyCost(want.sky, p.sky);
    if (p.weekend) s -= 0.5;
    return s;
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
    return h >>> 0;
  }

  function choose(slots, want, music, key) {
    const names = Object.keys(slots);
    let best = null;
    for (const name of names) {
      const p = parse(name);
      if (!p || p.music !== music) continue;
      if ((p.event || null) !== ((!music && want.event) || null)) continue;
      const s = score(p, want);
      if (s === Infinity) continue;
      const w = wildcards(p);
      if (!best || s < best.s - 1e-9 || (Math.abs(s - best.s) < 1e-9 && (w < best.w || (w === best.w && p.base < best.p.base)))) best = { p, s, w };
    }
    if (!best) return null;
    const alts = names.filter((n) => n.replace(/_\d+$/, "") === best.p.base).sort();
    return { name: alts.length > 1 ? alts[hash(key || "") % alts.length] : best.p.name, score: best.s, exact: best.s < 1e-9 };
  }

  function activeEvent(slots, d, requirePictures = true) {
    const p2 = (n) => (n < 10 ? "0" : "") + n;
    const stamp = (x) => p2(x.getMonth() + 1) + "-" + p2(x.getDate()) + " " + p2(x.getHours()) + ":" + p2(x.getMinutes());
    const shifted = new Date(d.getTime() - hhmm(MOMENTS.MORNING) * 60000);
    const md = stamp(d), day = stamp(shifted).slice(0, 5);
    for (const ev of Object.keys(EVENTS)) {
      const A = EVENTS[ev][0], B = EVENTS[ev][1];
      const a = A.length > 5 ? A : A + " 00:00", b = B.length > 5 ? B : B + " 23:59";
      const x = A.length > 5 || B.length > 5 ? md : day + " 12:00";
      if (!(a <= b ? x >= a && x <= b : x >= a || x <= b)) continue;
      if (!requirePictures || Object.keys(slots).some((n) => { const p = parse(n); return p && p.event === ev; })) return ev;
    }
    return null;
  }

  const ymd = (x) => { const p = (n) => (n < 10 ? "0" : "") + n; return x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate()); };
  const mmdd = (x) => ymd(x).slice(5);
  const isFree = (x) => { const w = x.getDay(); return w === 0 || w === 6 || holidays.has(ymd(x)) || holidays.has(mmdd(x)); };

  // requirePictures=false: report the event of the calendar even if it has no pictures (for the panel's "ideal").
  function want(slots, state, d, requirePictures = true) {
    const moment = momentOf(state, d);
    const day = (n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const eve = moment === "goldenhour" || moment === "evening" || moment === "lateevening";
    const weekend = isFree(d) || (eve && d.getHours() >= 12 && isFree(day(1))) || (moment === "lateevening" && d.getHours() < 12 && isFree(day(-1)));
    // wind speed no longer makes a sky of its own: a "windy" condition counts as cloudy, a breeze under a clear sky stays clear
    const sky = FOLD_SKY[skyOf({ ...state, wind: null })] || skyOf({ ...state, wind: null });
    const t = tempBand(state.temp), temp = FOLD_TEMP[t] || t;
    return { event: activeEvent(slots, d, requirePictures), temp, hum: HUM_TEMPS[temp] && HUM_SKIES[sky] ? humBand(state.humidity) : "any", sky, moment: FOLD_MOMENT[moment] || moment, weekend: weekendLooks && weekend };
  }

  return { parse, tempBand, humBand, skyOf, momentOf, foldMoment: (m) => FOLD_MOMENT[m] || m, want, choose, score, activeEvent };
}

// --- Aggregating several weather entities (weighted) ---------------------------------
const toC = (v, u) => (String(u || "").includes("F") ? (v - 32) * 5 / 9 : v);
const toKmh = (v, u) => {
  const s = String(u || "km/h").toLowerCase();
  if (s.includes("mph")) return v * 1.60934;
  if (s.includes("m/s")) return v * 3.6;
  if (s.includes("kn")) return v * 1.852;
  if (s.includes("ft")) return v * 1.09728;
  return v;
};

// sources: [{entity, weight}], states: hass.states. Returns {condition, temp, humidity, wind, used:[{entity,weight,temp,condition}]}
export function aggregateWeather(sources, states) {
  const sum = { t: 0, tw: 0, h: 0, hw: 0, w: 0, ww: 0 }, votes = {}, used = [];
  for (const src of sources) {
    const st = states[src.entity];
    const wt = Number(src.weight);
    if (!st || !(wt > 0) || st.state === "unavailable" || st.state === "unknown") continue;
    const a = st.attributes || {};
    const t = a.temperature != null ? toC(Number(a.temperature), a.temperature_unit) : null;
    const hum = a.humidity != null ? Number(a.humidity) : null;
    const wnd = a.wind_speed != null ? toKmh(Number(a.wind_speed), a.wind_speed_unit) : null;
    if (t != null && isFinite(t)) { sum.t += t * wt; sum.tw += wt; }
    if (hum != null && isFinite(hum)) { sum.h += hum * wt; sum.hw += wt; }
    if (wnd != null && isFinite(wnd)) { sum.w += wnd * wt; sum.ww += wt; }
    votes[st.state] = (votes[st.state] || 0) + wt;
    used.push({ entity: src.entity, weight: wt, temp: t, condition: st.state });
  }
  const cond = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0] || null;
  return {
    condition: cond,
    temp: sum.tw ? sum.t / sum.tw : null,
    humidity: sum.hw ? sum.h / sum.hw : null,
    wind: sum.ww ? sum.w / sum.ww : null,
    used,
  };
}

// "sunset" in the last hour of light.
export function solarMoment(sun, now = Date.now(), goldenMinutes = 60) {
  const a = (sun && sun.attributes) || {};
  const HOUR = 3600 * 1000, GOLDEN = goldenMinutes * 60000;
  const rise = Date.parse(a.next_rising), set = Date.parse(a.next_setting);
  if (sun && sun.state === "above_horizon") {
    if (isFinite(set) && set - now < GOLDEN) return "sunset";
    if (isFinite(rise) && rise - now > 22 * HOUR) return "sunrise";
  }
  return null;
}

// Minutes after local midnight of the sun's next rising (about today's sunrise), or null.
export function sunriseMinutes(sun) {
  const d = new Date(((sun && sun.attributes) || {}).next_rising);
  return isFinite(d) ? d.getHours() * 60 + d.getMinutes() : null;
}
