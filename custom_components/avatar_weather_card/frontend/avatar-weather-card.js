// Avatar Weather Card - the Lovelace card (v0.15.0, first version: avatar + data).
//   type: custom:avatar-weather-card
//   name: Salotto                 (optional, shown under the picture)
//   height: 420                   (px, default 420)
//   temperature_entity: sensor.x  (optional: replaces the averaged temperature)
//   humidity_entity: sensor.y     (optional)
//   clock_size: 1                 (size of the clock and the date: 0.5 = half, 1.5 = one and a half times)
//   show_clock / show_details / show_forecast: true   (the clock and date, humidity and wind, tomorrow; set false to hide)
//   layout: cards                 ("cards" = glass panels like the web page, default; "classic" = bare text)
//   sensors:                      (optional extra sensors, up to 3, shown as panels under the forecast)
//     - { entity: sensor.balcony_temperature, label: Balcony, icon: thermometer, unit: "°C" }
//   media_player: media_player.x (optional: while it plays, the card shows the cover, the track and the avatar in her armchair;
//                                  a list under media_players: also works, the first one that plays wins)
//   music_controls: true          (previous / play-pause / next, mute and volume on the music view)
//   pause_grace: 30               (seconds the music view stays after a pause)
//   forecast_entity: weather.x    (optional: the weather entity used for tomorrow; default = the first weather source)
//   show_picture: true            (optional: show which picture was chosen and why)
//   avatar_x: 0.74, avatar_size: 0.74   (optional: where she stands, 0-1 of the width; her height as a fraction of the card)
// The picture is chosen by the same selector as the admin panel, from the global settings of the integration.
import { createSelector, aggregateWeather, solarMoment, sunriseMinutes } from "./selector.js?v=0.1.0-2";
import { createBackground } from "./avatar-weather-background.js?v=0.1.0-2";
import { weatherIconSVG, SENSOR_ICONS } from "./avatar-weather-icons.js?v=0.1.0-2";

const IMAGES = "/avatar_weather_card_images";
const REFRESH_MS = 5 * 60 * 1000;   // settings and picture list
const TICK_MS = 10 * 1000;          // the clock and the moment of the day
const FORECAST_MS = 30 * 60 * 1000;
const HOURLY_MS = 10 * 60 * 1000;
// Words HA has no translation for. Everything else comes from HA's own translations.
const WORDS = {
  en: { humidity: "Humidity", wind: "Wind", nextHour: "Next hour" }, it: { humidity: "Umidità", wind: "Vento", nextHour: "Prossima ora" },
  es: { humidity: "Humedad", wind: "Viento", nextHour: "Próxima hora" }, ca: { humidity: "Humitat", wind: "Vent", nextHour: "Pròxima hora" },
  de: { humidity: "Luftfeuchte", wind: "Wind", nextHour: "Nächste Stunde" }, fr: { humidity: "Humidité", wind: "Vent", nextHour: "Heure suivante" },
};

// Pure: weather + clock + settings -> { want, pick, state }. Exported for tests.
export function pickPicture(data, states, now, overrides = {}) {
  const o = data.options, slots = (data.images && data.images.slots) || {};
  const events = {};
  (data.special_days || []).forEach((d) => { if (d.id && d.start && d.end) events[d.id] = [d.start, d.end]; });
  const holidays = [...(data.extra_holidays || [])];
  const cal = data.holiday_calendar && states[data.holiday_calendar];
  if (cal && cal.state === "on") {
    const p = (n) => (n < 10 ? "0" : "") + n;
    holidays.push(`${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`);
  }
  const sel = createSelector({
    windKmh: o.wind_kmh, humidPct: o.humid_pct, weekendLooks: o.weekend_looks, moments: o.moments, tempBands: o.temp_bands,
    followDawn: o.follow_dawn, dawnOffset: o.dawn_offset, freeMoments: o.free_moments_enabled ? o.moments_free : null, events, holidays,
  });
  const sun = states[o.sun_entity] || states[Object.keys(states).find((k) => k.startsWith("sun."))] || null;
  const agg = aggregateWeather(data.weather_sources || [], states);
  const num = (id) => { const s = id && states[id]; const v = s ? parseFloat(s.state) : NaN; return isFinite(v) ? v : null; };
  const temp = overrides.temperature != null ? overrides.temperature : agg.temp;
  const humidity = overrides.humidity != null ? overrides.humidity : agg.humidity;
  const state = {
    condition: agg.condition, temp, humidity, wind: agg.wind,
    isDay: sun ? sun.state === "above_horizon" : now.getHours() >= 7 && now.getHours() < 20,
    solar: solarMoment(sun, now.getTime(), o.golden_minutes), sunrise: sunriseMinutes(sun),
  };
  const want = sel.want(slots, state, now);
  const key = String(Math.floor(now.getTime() / 3600000));   // alternates (_2, _3…) change every hour
  const pick = Object.keys(slots).length ? sel.choose(slots, want, false, key) : null;
  // the armchair pictures (music_*): temperature and moment count, the sky does not; a new alternate per song (musicKey)
  const music = Object.keys(slots).length ? sel.choose(slots, want, true, overrides.musicKey || key) : null;
  return { want, pick, music, state, used: agg.used, num };
}

const MUSIC_ICO = {
  prev: "M6 6h2v12H6zm3.5 6L18 6v12z", next: "M16 6h2v12h-2zM6 18l8.5-6L6 6z", play: "M8 5v14l11-7z", pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  mute: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z",
  muted: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
};
const EVENING_LUM = 70;   // pictures darker than this were drawn for the evening: the canvas must not darken them again

class AvatarWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null; this._loadedAt = 0; this._loading = null; this._last = "";
    this._imgs = new Map(); this._bg = null;
  }

  setConfig(config) {
    this._config = { height: 420, name: "", show_clock: true, show_details: true, show_forecast: true, show_picture: false, layout: "cards", music_controls: true, pause_grace: 30, avatar_x: 0.74, ...config };
    this._build();
    this._last = "";
    this._update();
  }

  getCardSize() { return Math.max(3, Math.round((this._config ? this._config.height : 420) / 50)); }
  static getStubConfig() { return { name: "", height: 420 }; }
  // The visual editor ("Edit" on the card): loaded only when it is opened.
  static async getConfigElement() { await import("./avatar-weather-card-editor.js?v=0.1.0-2"); return document.createElement("avatar-weather-card-editor"); }

  set hass(hass) {
    this._hass = hass;
    if (!this._data || Date.now() - this._loadedAt > REFRESH_MS) this._load();
    this._update();
  }

  connectedCallback() { this._timer = setInterval(() => this._update(), TICK_MS); this._ptimer = setInterval(() => this._tickProgress(), 500); this._update(); }
  disconnectedCallback() {
    clearInterval(this._timer); clearInterval(this._ptimer);
    if (this._bg) { this._bg.destroy(); this._bg = null; }
  }

  async _load() {
    if (this._loading || !this._hass) return;
    this._loading = (async () => {
      try {
        try {
          this._data = await this._hass.callWS({ type: "avatar_weather_card/public_config" });
        } catch (e) {   // an older integration without the public command: administrators can still read the settings
          const [cfg, images] = await Promise.all([
            this._hass.callWS({ type: "avatar_weather_card/config_get" }),
            this._hass.callWS({ type: "avatar_weather_card/images_list" }),
          ]);
          this._data = { ...cfg, images };
        }
        this._loadedAt = Date.now(); this._error = null; this._last = "";
      } catch (e) { this._error = (e && e.message) || "Could not load the settings"; }
      this._loading = null;
      this._update();
    })();
  }

  _build() {
    const h = Number(this._config.height) || 420;
    if (this._bg) { this._bg.destroy(); this._bg = null; }
    this.shadowRoot.innerHTML = `<style>
      ha-card { overflow: hidden; }
      .stage { position: relative; height: ${h}px; background: #5fa8f5; container-type: size; color: #f5f7fa; --cs: ${Math.max(0.4, Math.min(2.5, Number(this._config.clock_size) || 1))}; --ax: ${Number(this._config.avatar_x) || 0.74};
        --u: 1cqw; font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
      @supports (width: min(1cqw, 1cqh)) { .stage { --u: min(1cqw, 1.7778cqh); } }
      canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
      #ov { position: absolute; inset: 0; pointer-events: none; display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
        gap: 3cqh; padding: 4cqh calc(var(--u) * 4) 4cqh calc(var(--u) * 5); text-shadow: 0 2px 18px rgba(0,0,0,.55); box-sizing: border-box; }
      #ov > section { max-width: 56%; }
      .name { font-size: calc(var(--u) * 2); letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
      #time { font-weight: 700; font-size: calc(var(--u) * 10.5 * var(--cs, 1)); line-height: 1; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
      #date { margin-top: 1.2cqh; font-size: calc(var(--u) * 2.6 * var(--cs, 1)); font-weight: 300; opacity: .85; text-transform: capitalize; }
      .wb { display: flex; align-items: center; gap: calc(var(--u) * 2.5); }
      .icon { width: calc(var(--u) * 9); height: calc(var(--u) * 9); flex: none; }
      .icon svg { width: 100%; height: 100%; display: block; }
      .temp { font-size: calc(var(--u) * 6.5); font-weight: 300; line-height: 1; }
      .cond { margin-top: .6cqh; font-size: calc(var(--u) * 2.2); opacity: .9; text-transform: capitalize; }
      .det { display: flex; flex-direction: column; gap: .6cqh; font-size: calc(var(--u) * 1.6); opacity: .85; padding-left: calc(var(--u) * 2); border-left: 1px solid rgba(255,255,255,.25); white-space: nowrap; }
      .fc { display: flex; align-items: center; gap: calc(var(--u) * 1.4); font-size: calc(var(--u) * 1.8); opacity: .9; }
      .fc .lbl { text-transform: uppercase; letter-spacing: .08em; opacity: .65; font-size: .85em; }
      .fc .icon { width: calc(var(--u) * 3.4); height: calc(var(--u) * 3.4); }
      .fc .t { font-weight: 500; } .fc .lo { opacity: .6; font-weight: 300; margin-left: .4em; }
      .fc .c { text-transform: capitalize; opacity: .75; }
      .note { position: absolute; left: 12px; right: 12px; bottom: 8px; font-size: 11px; color: #fff; opacity: .9; text-shadow: 0 1px 3px rgba(0,0,0,.7); pointer-events: none; }
      /* layout "cards": glass panels, as on the web page */
      #ov.cards { --card-bg: rgba(12,24,58,.52); --card-line: rgba(140,180,255,.32); --card-accent: #7fb2ff; gap: 2cqh; padding-left: calc(var(--u) * 4); }
      #ov.cards > section { width: calc(var(--u) * 56); max-width: none; }
      #ov.cards #time { font-size: calc(var(--u) * 11 * var(--cs, 1)); padding-left: calc(var(--u) * 1); }
      #ov.cards #date { font-size: calc(var(--u) * 2.7 * var(--cs, 1)); opacity: .9; padding-left: calc(var(--u) * 1); }
      #ov.cards .name { padding-left: calc(var(--u) * 1); }
      #ov.cards .wb, #ov.cards .fc, #ov.cards .sensor { background: var(--card-bg); border: 1px solid var(--card-line); border-radius: calc(var(--u) * 1.6);
        padding: 1.8cqh calc(var(--u) * 2.2); box-shadow: 0 0 calc(var(--u) * 2.5) rgba(60,110,220,.18), inset 0 0 calc(var(--u) * 1.5) rgba(120,170,255,.06); text-shadow: none; box-sizing: border-box; }
      #ov.cards .wb { display: grid; grid-template-columns: auto auto 1fr auto; column-gap: calc(var(--u) * 2.4); row-gap: .4cqh; align-items: center; }
      #ov.cards .wb .icon { grid-column: 1; grid-row: 1; width: calc(var(--u) * 7.7); height: calc(var(--u) * 7.7); }
      #ov.cards .wb .main { display: contents; }
      #ov.cards .temp { grid-column: 2; grid-row: 1; font-weight: 700; font-size: calc(var(--u) * 7.4); }
      #ov.cards .cond { grid-column: 1 / 4; grid-row: 2; margin-top: 0; font-size: calc(var(--u) * 2.9); }
      #ov.cards .det { grid-column: 4; grid-row: 1 / 3; margin: 0; padding-left: calc(var(--u) * 1.8); padding-right: calc(var(--u) * 1); gap: 1.8cqh; opacity: 1; border-left: 1px solid var(--card-line); }
      .row { display: flex; align-items: center; gap: calc(var(--u) * 1); }
      .row .icon { width: calc(var(--u) * 3); height: calc(var(--u) * 3); color: var(--card-accent); }
      .dl { display: block; font-size: calc(var(--u) * 1.5); opacity: .85; }
      .dv { display: block; white-space: nowrap; font-size: calc(var(--u) * 2.3); font-weight: 700; line-height: 1.15; }
      #ov.cards .fc { gap: calc(var(--u) * 2.4); font-size: calc(var(--u) * 2.2); opacity: 1; }
      #ov.cards .fc .lbl { font-size: calc(var(--u) * 1.9); font-weight: 700; color: var(--card-accent); opacity: 1; min-width: calc(var(--u) * 8); }
      #ov.cards .fc .icon { width: calc(var(--u) * 6); height: calc(var(--u) * 6); }
      #ov.cards .fc .t { font-size: calc(var(--u) * 3.6); font-weight: 700; line-height: 1.1; }
      #ov.cards .fc .lo { display: block; margin: 0; color: var(--card-accent); opacity: 1; font-weight: 700; }
      #ov.cards .fc .c { display: none; }
      .hr { margin-left: auto; padding-left: calc(var(--u) * 2.2); padding-right: calc(var(--u) * 1); border-left: 1px solid var(--card-line); }
      .hr .hl { font-size: calc(var(--u) * 1.5); font-weight: 700; color: var(--card-accent); margin-bottom: .6cqh; white-space: nowrap; }
      .hr .hrow { display: flex; align-items: center; gap: calc(var(--u) * 1.2); }
      .hr .icon { width: calc(var(--u) * 5.6); height: calc(var(--u) * 5.6); }
      .hr .ht { font-size: calc(var(--u) * 3.8); font-weight: 700; line-height: 1.1; }
      .hr .hc { font-size: calc(var(--u) * 1.6); opacity: .9; }
      .sensors { display: flex; gap: calc(var(--u) * 1.6); }
      .sensors .sensor { flex: 1 1 0; display: flex; align-items: center; gap: calc(var(--u) * 1.6); padding: 1.6cqh calc(var(--u) * 1.8); }
      .sensors .sensor .icon { width: calc(var(--u) * 4.4); height: calc(var(--u) * 4.4); color: var(--card-accent); }
      .sensors .sensor .dl { font-size: calc(var(--u) * 2); } .sensors .sensor .dv { font-size: calc(var(--u) * 3.4); }
      #ov:not(.cards) .sensors { gap: calc(var(--u) * 3); font-size: calc(var(--u) * 1.5); opacity: .8; }
      #ov:not(.cards) .sensor { display: flex; align-items: center; gap: calc(var(--u) * .6); }
      #ov:not(.cards) .sensor .icon { width: calc(var(--u) * 2); height: calc(var(--u) * 2); }
      #ov:not(.cards) .sensor .dl, #ov:not(.cards) .sensor .dv { display: inline; font-size: inherit; font-weight: 400; }
      /* the music view: takes over the card while a media player plays */
      .np { --top: calc(var(--u) * 15 * var(--cs, 1) + 2.5cqh); --bot: calc(var(--u) * 8.5 + 3cqh); position: absolute; inset: 0; background: #0b0e14; opacity: 0; visibility: hidden; transition: opacity .5s, visibility .5s; overflow: hidden; color: #fff; text-shadow: 0 2px 20px rgba(0,0,0,.6); }
      .np.on { opacity: 1; visibility: visible; }
      .npb { position: absolute; inset: -8%; background: #0b0e14 center / cover; filter: blur(calc(var(--u) * 4)) saturate(1.5) brightness(.5); transform: scale(1.18); }
      .np::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.42) 0%, rgba(0,0,0,.16) 45%, rgba(0,0,0,.62) 100%); pointer-events: none; }
      .npck { position: absolute; z-index: 1; top: 2.5cqh; left: 0; right: 0; text-align: center; }
      .npc { position: absolute; z-index: 1; left: calc(var(--u) * 4); top: var(--top); bottom: var(--bot); width: max(calc(var(--u) * 30), calc(var(--ax, .74) * 100cqw - 22cqw - var(--u) * 4)); display: flex; flex-direction: column; justify-content: center; gap: 2cqh; }
      .npt { font-size: calc(var(--u) * 10.5 * var(--cs, 1)); font-weight: 700; line-height: 1; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
      .np.cards .npt { font-size: calc(var(--u) * 11 * var(--cs, 1)); }
      .np.noclock { --top: 3cqh; }
      .npd { margin-top: 1.2cqh; font-size: calc(var(--u) * 2.6 * var(--cs, 1)); font-weight: 300; opacity: .85; text-transform: capitalize; }
      .np.cards .npd { font-size: calc(var(--u) * 2.7 * var(--cs, 1)); opacity: .9; }
      .nprow { display: flex; align-items: center; gap: calc(var(--u) * 3); }
      .npcov { position: relative; flex: none; width: min(calc(var(--u) * 28), calc(100cqh - var(--top) - var(--bot))); aspect-ratio: 1; height: auto; border-radius: calc(var(--u) * 1.2); overflow: hidden; box-shadow: 0 calc(var(--u) * 2.4) calc(var(--u) * 6) rgba(0,0,0,.55); background: linear-gradient(145deg, #3a4356, #171c26); }
      .npcov img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .npcov svg { position: absolute; inset: 27%; width: 46%; height: 46%; color: rgba(255,255,255,.5); }
      .npi { min-width: 0; display: flex; flex-direction: column; gap: 1.2cqh; }
      .npti { font-size: calc(var(--u) * 2.5); font-weight: 600; line-height: 1.15; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .npar { font-size: calc(var(--u) * 1.8); opacity: .92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .npal { font-size: calc(var(--u) * 1.6); opacity: .66; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .npar:empty, .npal:empty, .npso:empty { display: none; }
      .npbar { height: max(4px, .7cqh); border-radius: 999px; background: rgba(255,255,255,.24); overflow: hidden; margin-top: 1cqh; }
      .npfill { height: 100%; width: 0; border-radius: 999px; background: rgba(255,255,255,.92); transition: width .5s linear; }
      .nptimes { display: flex; justify-content: space-between; font-size: calc(var(--u) * 1.25); opacity: .72; font-variant-numeric: tabular-nums; margin-top: .5cqh; }
      .npso { font-size: calc(var(--u) * 1.2); letter-spacing: .1em; text-transform: uppercase; opacity: .6; }
      /* the control bar along the bottom (like the web page): a light pill across the card, transport on the left, volume on the right */
      .npdock { position: absolute; z-index: 2; left: calc(var(--u) * 5); right: calc(var(--u) * 5); bottom: 3cqh; --b: max(28px, calc(var(--u) * 5.2));
        display: flex; align-items: center; justify-content: center; gap: calc(var(--b) * .6); padding: calc(var(--b) * .18) calc(var(--b) * .4);
        border-radius: 999px; background: rgba(0,0,0,.22); text-shadow: none; box-sizing: border-box; }
      .npdock:empty { display: none; }
      .npdock .tr { display: flex; align-items: center; gap: calc(var(--b) * .3); flex: none; }
      .npdock .vo { display: flex; align-items: center; gap: calc(var(--b) * .15); flex: 1 1 0; min-width: 0; }
      .nbtn { --size: var(--b); width: var(--size); height: var(--size); flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; appearance: none;
        border: 1px solid rgba(255,255,255,.28); border-radius: 50%; background: rgba(0,0,0,.28); color: #fff; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: transform .12s, background .2s; }
      .nbtn svg { width: 56%; height: 56%; fill: currentColor; display: block; }
      .nbtn:active { transform: scale(.9); background: rgba(255,255,255,.22); }
      .nbtn.main { --size: calc(var(--b) * 1.3); background: rgba(255,255,255,.9); color: #111; border-color: transparent; }
      .nbtn.small { --size: calc(var(--b) * .78); }
      .nbtn[aria-pressed="true"] { background: rgba(255,255,255,.9); color: #111; border-color: transparent; }
      .vo.muted .vbar, .vo.muted .vpct { opacity: .4; }
      .vbar { position: relative; flex: 1 1 0; min-width: calc(var(--b) * .8); height: calc(var(--b) * .8); cursor: pointer; touch-action: none; }
      .vbar::before, .vfill { content: ""; position: absolute; left: 0; top: 50%; height: max(4px, calc(var(--b) * .12)); transform: translateY(-50%); border-radius: 999px; }
      .vbar::before { right: 0; background: rgba(255,255,255,.24); } .vfill { width: 0; background: rgba(255,255,255,.92); }
      .vpct { flex: none; width: calc(var(--b) * .9); text-align: right; font-size: max(11px, calc(var(--b) * .3)); opacity: .8; font-variant-numeric: tabular-nums; }
      .np.paused #npprog { opacity: .5; }
      .npa { position: absolute; z-index: 1; top: var(--top); bottom: var(--bot); left: calc(var(--ax, .74) * 100%); transform: translateX(-50%); display: flex; align-items: center; justify-content: center; }
      .npa img { height: 100%; width: auto; max-width: 46cqw; object-fit: contain; display: block; filter: drop-shadow(0 2cqmin 4cqmin rgba(0,0,0,.45)); }
      .npa:not(.has) { display: none; }
      .msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.5); }
    </style><ha-card><div class="stage" id="stage"><canvas id="cv"></canvas><div id="ov"></div>
      <div class="np" id="np"><div class="npb" id="npb"></div><div class="npck" id="npck"></div><div class="npc" id="npc"></div><div class="npdock" id="npdock"></div><div class="npa" id="npa"><img id="npimg" alt=""></div></div></div></ha-card>`;
  }

  // The picture as a loaded <img>, handed to the canvas when it is ready.
  _show(name, slot, body) {
    const src = `${slot.u || `${IMAGES}/${encodeURIComponent(name)}.webp`}?v=${slot.v || 0}`;
    let im = this._imgs.get(src);
    const give = () => { if (this._bg && this._want === src) this._bg.setCharacter({ img: im, feetY: slot.feetY, body, lit: (slot.lum || 255) < EVENING_LUM }); };
    this._want = src;
    if (!im) {
      im = new Image(); im.onload = give; im.src = src;
      this._imgs.set(src, im);
      if (this._imgs.size > 40) this._imgs.delete(this._imgs.keys().next().value);
    } else if (im.complete && im.naturalWidth) give();
  }

  _update() {
    const sr = this.shadowRoot;
    if (!this._config || !this._hass || !sr.getElementById("stage")) return;
    const ov = sr.getElementById("ov");
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    if (!this._data) { const t = this._error ? `Avatar Weather Card: ${esc(this._error)}` : "Loading…"; if (this._last !== t) { ov.innerHTML = `<div class="msg">${t}</div>`; this._last = t; } return; }
    const states = this._hass.states, c = this._config;
    const num = (id) => { const s = id && states[id]; const v = s ? parseFloat(s.state) : NaN; return isFinite(v) ? v : null; };
    const r = pickPicture(this._data, states, new Date(), { temperature: num(c.temperature_entity), humidity: num(c.humidity_entity) });
    const slots = (this._data.images && this._data.images.slots) || {};
    const body = (this._data.images && this._data.images.body) || 900;

    // ---- the living background
    if (!this._bg) {
      const cv = sr.getElementById("cv");
      if (cv && this.isConnected) this._bg = createBackground(cv, sr.getElementById("stage"), { charX: c.avatar_x, charBody: c.avatar_size });
    }
    this._loadForecast();
    this._updateMusic(r, states, slots, body);
    this._loadHourly();
    const bg = this._bg;
    if (bg) {
      const o = this._data.options || {};
      const sun = states[o.sun_entity] || states[Object.keys(states).find((k) => k.startsWith("sun."))] || null;
      bg.setCondition(r.state.condition || "sunny");
      bg.setDaytime(r.state.isDay);
      bg.setSunElevation(sun && sun.attributes ? sun.attributes.elevation : null);
      const cfg = this._hass.config || {};
      bg.setLocation(+cfg.latitude, +cfg.longitude);
      bg.setTemperature(r.state.temp);
      const w = (this._data.weather_sources || []).map((s) => states[s.entity]).find((s) => s && s.attributes && s.attributes.wind_bearing != null);
      bg.setWind(r.state.wind, w ? w.attributes.wind_bearing : null);
      if (r.pick && slots[r.pick.name]) this._show(r.pick.name, slots[r.pick.name], body); else bg.setCharacter(null);
    }

    // ---- the text on top, like the page: clock and date, weather, humidity and wind, tomorrow (rebuilt only when something changed)
    const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || undefined;
    const now = new Date();
    const hour12 = this._hass.locale && this._hass.locale.time_format === "12" ? true : this._hass.locale && this._hass.locale.time_format === "24" ? false : undefined;
    const time = now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12 });
    const date = now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });
    const tr = (key, fallback) => { const v = this._hass.localize && this._hass.localize(key); return v || fallback; };
    const condText = (k) => (k ? tr(`component.weather.entity_component._.state.${k}`, k) : "");
    const fahr = /F/.test(((this._hass.config || {}).unit_system || {}).temperature || "");
    const deg = (v) => (v == null || !isFinite(v) ? "–" : Math.round(fahr ? v * 9 / 5 + 32 : v) + "°");
    const fc = this._forecast;
    const sig = JSON.stringify([r.pick && r.pick.name, r.want, Math.round((r.state.temp || 0) * 10), r.state.condition, Math.round(r.state.humidity || 0), Math.round(r.state.wind || 0), c, time, date, lang, fc, this._hourly, (c.sensors || []).map((x) => x && states[x.entity] && states[x.entity].state)]);
    if (sig === this._last) return;
    this._last = sig;
    const cards = c.layout !== "classic";
    const W = WORDS[String(lang || "en").slice(0, 2)] || WORDS.en;
    const parts = [];
    if (c.name) parts.push(`<section class="name">${esc(c.name)}</section>`);
    if (c.show_clock !== false) parts.push(`<section><div id="time">${esc(time)}</div><div id="date">${esc(date)}</div></section>`);
    const hum = r.state.humidity != null ? `${Math.round(r.state.humidity)}%` : "";
    const wnd = r.state.wind != null ? `${Math.round(r.state.wind)} km/h` : "";
    const lH = tr("ui.card.weather.attributes.humidity", W.humidity), lW = tr("ui.card.weather.attributes.wind_speed", W.wind);
    const det = [];
    if (c.show_details !== false) {
      const one = (icon, label, v) => (!v ? "" : cards ? `<div class="row"><div class="icon">${SENSOR_ICONS[icon]}</div><span><span class="dl">${esc(label)}</span><span class="dv">${esc(v)}</span></span></div>` : `<div>${esc(label)}: ${esc(v)}</div>`);
      det.push(one("humidity", lH, hum), one("wind", lW, wnd));
    }
    parts.push(`<section class="wb"><div class="icon">${weatherIconSVG(r.state.condition)}</div>
      <div class="main"><div class="temp">${deg(r.state.temp)}</div><div class="cond">${esc(condText(r.state.condition))}</div></div>${det.join("") ? `<div class="det">${det.join("")}</div>` : ""}</section>`);
    if (c.show_forecast !== false && fc) {
      let tomorrow = "tomorrow";
      try { tomorrow = new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(1, "day"); } catch (e) { /* keep the English word */ }
      const hr = this._hourly;
      const hour = cards && hr ? `<div class="hr"><div class="hl">${esc(W.nextHour)} · ${esc(new Date(hr.datetime).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12 }))}</div>
        <div class="hrow"><div class="icon">${weatherIconSVG(hr.condition)}</div><div><div class="ht">${deg(hr.temperature)}</div>${hr.precipitation > 0 ? `<div class="hc">${Math.round(hr.precipitation * 10) / 10} mm</div>` : ""}</div></div></div>` : "";
      parts.push(`<section class="fc"><span class="lbl">${esc(tomorrow)}</span><div class="icon">${weatherIconSVG(fc.condition)}</div>
        <span class="t">${deg(fc.temperature)}${fc.templow != null ? `<span class="lo">${deg(fc.templow)}</span>` : ""}</span><span class="c">${esc(condText(fc.condition))}</span>${hour}</section>`);
    }
    const sens = (Array.isArray(c.sensors) ? c.sensors : []).slice(0, 3).map((x) => {
      const st = x && x.entity && states[x.entity]; if (!st || st.state === "unavailable" || st.state === "unknown") return "";
      const n = parseFloat(st.state), a = st.attributes || {};
      const icon = x.icon || (a.device_class === "humidity" ? "humidity" : a.device_class === "pressure" ? "pressure" : a.device_class === "wind_speed" ? "wind" : "thermometer");
      const unit = x.unit != null ? x.unit : a.unit_of_measurement || "";
      const v = isFinite(n) ? `${Math.round(n)}${unit}` : st.state;
      const label = x.label || a.friendly_name || x.entity;
      return `<div class="sensor"><div class="icon">${SENSOR_ICONS[icon] || ""}</div>${cards ? `<span><span class="dl">${esc(label)}</span><span class="dv">${esc(v)}</span></span>` : `<span>${esc(label)}: ${esc(v)}</span>`}</div>`;
    }).join("");
    if (sens) parts.push(`<section class="sensors">${sens}</section>`);
    const note = c.show_picture && r.pick
      ? `${esc(r.pick.name)} ${r.pick.exact ? "(exact)" : `(closest, distance ${r.pick.score.toFixed(1)})`} · wanted ${esc(r.want.temp)}${r.want.hum === "humid" ? " humid" : ""}, ${esc(r.want.sky)}, ${esc(r.want.moment)}${r.want.weekend ? ", weekend" : ""}${r.want.event ? ", " + esc(r.want.event) : ""}`
      : "";
    ov.className = cards ? "cards" : "";
    ov.innerHTML = `${r.pick ? "" : `<div class="msg">No pictures yet. Open Avatar Weather in the sidebar, Images tab, to install a picture series or add your own.</div>`}${parts.join("")}${note ? `<div class="note">${note}</div>` : ""}`;
  }

  // ---- the music view ----------------------------------------------------------
  _players() {
    const c = this._config;
    return [].concat(c.media_players || [], c.media_player || []).filter(Boolean);
  }

  _updateMusic(r, states, slots, body) {
    const sr = this.shadowRoot, np = sr.getElementById("np");
    if (!np) return;
    const ids = this._players(), now = Date.now();
    let active = null;
    for (const id of ids) { const st = states[id]; if (st && st.state === "playing") { active = st; break; } }
    if (active) this._lastPlaying = { at: now, id: active.entity_id };
    else if (this._lastPlaying && now - this._lastPlaying.at < (Number(this._config.pause_grace) || 0) * 1000) {   // a short pause keeps the music view
      const st = states[this._lastPlaying.id]; if (st && st.state === "paused") active = st;
    }
    if (!active) {
      if (this._musicOn) { this._musicOn = false; np.classList.remove("on"); if (this._bg) this._bg.setPaused(false); this._track = ""; }
      return;
    }
    np.classList.toggle("cards", this._config.layout !== "classic"); np.classList.toggle("noclock", this._config.show_clock === false);   // the clock follows the weather settings: same size, clock_size, show_clock
    if (!this._musicOn) { this._musicOn = true; np.classList.add("on"); if (this._bg) this._bg.setPaused(true); }
    const a = active.attributes || {};
    const key = [active.entity_id, a.media_title, a.media_artist, a.media_album_name, a.entity_picture].join("|");
    if (key !== this._track) {   // text and cover are rebuilt only when the track changes
      this._track = key; this._salt = String(Math.random());
      this._buildMusic(active, a);
    }
    this._player = active;
    const pa = (id, d) => { const p = sr.querySelector(`#${id} path`); if (p) p.setAttribute("d", d); };
    pa("npplay", active.state === "playing" ? MUSIC_ICO.pause : MUSIC_ICO.play);
    np.classList.toggle("paused", active.state !== "playing");
    if (!this._muteAt || Date.now() - this._muteAt > 2500) this._renderMute(!!a.is_volume_muted);
    if (a.volume_level != null && (!this._volAt || Date.now() - this._volAt > 2500)) this._renderVol(a.volume_level);
    this._tickProgress();
    // the armchair picture: a new alternate with every song
    const rm = pickPicture(this._data, states, new Date(), { musicKey: this._salt + "|" + key });
    const av = sr.getElementById("npa"), img = sr.getElementById("npimg");
    if (rm.music && slots[rm.music.name]) {
      const src = `${slots[rm.music.name].u || `${IMAGES}/${encodeURIComponent(rm.music.name)}.webp`}?v=${slots[rm.music.name].v || 0}`;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      av.classList.add("has");
    } else av.classList.remove("has");
    const t = sr.getElementById("npt"); if (t) t.textContent = new Date().toLocaleTimeString(this._hass.language, { hour: "2-digit", minute: "2-digit" });
  }

  _buildMusic(st, a) {
    const sr = this.shadowRoot, esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    const pic = a.entity_picture_local || a.entity_picture;
    const url = pic ? (/^https?:\/\//i.test(pic) ? pic : (this._hass.hassUrl ? this._hass.hassUrl(pic) : pic)) : "";
    sr.getElementById("npb").style.backgroundImage = url ? `url("${url}")` : "none";
    const lang = this._hass.language, now = new Date();
    const svg = (path, id) => `<svg viewBox="0 0 24 24"${id ? ` id="${id}"` : ""}><path d="${path}"/></svg>`;
    const b = (id, path, cls) => `<button type="button" id="${id}" class="nbtn ${cls || ""}">${svg(path)}</button>`;
    const VOL = { down: "M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z", up: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" };
    const dock = this._config.music_controls === false ? "" : `<div class="tr">${b("npprev", MUSIC_ICO.prev)}${b("npplay", st.state === "playing" ? MUSIC_ICO.pause : MUSIC_ICO.play, "main")}${b("npnext", MUSIC_ICO.next)}</div>
      <div class="vo" id="npvo">${b("npmute", MUSIC_ICO.muted, "small")}${b("npvd", VOL.down, "small")}<div class="vbar" id="npvb"><div class="vfill" id="npvf"></div></div>${b("npvu", VOL.up, "small")}<span class="vpct" id="npvp"></span></div>`;
    sr.getElementById("npdock").innerHTML = dock;
    sr.getElementById("npck").innerHTML = this._config.show_clock === false ? "" : `<div><div class="npt" id="npt">${esc(now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }))}</div><div class="npd">${esc(now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" }))}</div></div>`;
    sr.getElementById("npc").innerHTML = `
      <div class="nprow"><div class="npcov">${url ? `<img src="${esc(url)}" alt="">` : `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M38 72V26l32-8v46"/><circle cx="30" cy="72" r="9"/><circle cx="62" cy="64" r="9"/></svg>`}</div>
        <div class="npi"><div class="npti">${esc(a.media_title || a.media_content_id || "")}</div><div class="npar">${esc(a.media_artist || a.media_channel || "")}</div><div class="npal">${esc(a.media_album_name || "")}</div>
          <div id="npprog"><div class="npbar"><div class="npfill" id="npfill"></div></div><div class="nptimes"><span id="npel"></span><span id="npdu"></span></div></div>
          <div class="npso">${esc(a.app_name || a.source || a.friendly_name || "")}</div></div></div>`;
    const img = sr.querySelector(".npcov img"); if (img) img.addEventListener("error", () => { img.remove(); sr.getElementById("npb").style.backgroundImage = "none"; });
    const call = (service, data) => this._hass.callService("media_player", service, { entity_id: this._player ? this._player.entity_id : st.entity_id, ...data });
    const on = (id, fn) => { const x = sr.getElementById(id); if (x) x.onclick = fn; };
    on("npprev", () => call("media_previous_track")); on("npnext", () => call("media_next_track"));
    on("npplay", () => call("media_play_pause"));
    on("npmute", () => { const m = !((this._player.attributes || {}).is_volume_muted); this._muteAt = Date.now(); this._renderMute(m); call("volume_mute", { is_volume_muted: m }); });
    // volume: tap or drag the bar, or step with the two buttons; sent at most every 250 ms, the bar follows the finger meanwhile
    const setVol = (lv) => {
      lv = Math.round(Math.max(0, Math.min(1, lv)) * 100) / 100; this._volAt = Date.now(); this._renderVol(lv); this._volPending = lv;
      if (this._volTimer) return;
      this._volTimer = setTimeout(() => { this._volTimer = null; call("volume_set", { volume_level: this._volPending }); }, 250);
    };
    const cur = () => (this._volShown != null ? this._volShown : ((this._player.attributes || {}).volume_level || 0));
    on("npvd", () => setVol(cur() - 0.05)); on("npvu", () => setVol(cur() + 0.05));
    const bar = sr.getElementById("npvb");
    if (bar) {
      const fromPointer = (e) => { const r = bar.getBoundingClientRect(); setVol((e.clientX - r.left) / r.width); };
      bar.addEventListener("pointerdown", (e) => { bar.setPointerCapture(e.pointerId); fromPointer(e); });
      bar.addEventListener("pointermove", (e) => { if (bar.hasPointerCapture(e.pointerId)) fromPointer(e); });
    }
    this._renderVol(a.volume_level); this._renderMute(!!a.is_volume_muted);
  }

  _renderVol(lv) {
    if (lv == null || !isFinite(lv)) return;
    this._volShown = lv;
    const sr = this.shadowRoot, f = sr.getElementById("npvf"), p = sr.getElementById("npvp");
    if (f) f.style.width = Math.round(lv * 100) + "%"; if (p) p.textContent = Math.round(lv * 100) + "%";
  }
  _renderMute(on) {
    const sr = this.shadowRoot, m = sr.getElementById("npmute"), vo = sr.getElementById("npvo");
    if (m) m.setAttribute("aria-pressed", on ? "true" : "false");   // same icon as the web page: the button turns white when muted
    if (vo) vo.classList.toggle("muted", !!on);
  }

  // HA only reports the playhead when something changes: the bar is advanced locally.
  _tickProgress() {
    const sr = this.shadowRoot, st = this._player; if (!this._musicOn || !st) return;
    const a = st.attributes || {}, fill = sr.getElementById("npfill"); if (!fill) return;
    const dur = typeof a.media_duration === "number" ? a.media_duration : null, pos = typeof a.media_position === "number" ? a.media_position : null;
    const prog = sr.getElementById("npprog"); if (prog) prog.style.display = dur && pos != null ? "" : "none";
    if (!dur || pos == null) return;
    let at = a.media_position_updated_at ? Date.parse(a.media_position_updated_at) : Date.now(); if (!isFinite(at)) at = Date.now();
    const el = Math.min(dur, pos + (st.state === "playing" ? (Date.now() - at) / 1000 : 0));
    const f = (v) => { v = Math.max(0, Math.floor(v)); const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), s = String(v % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`; };
    fill.style.width = Math.max(0, Math.min(100, (el / dur) * 100)) + "%";
    const e1 = sr.getElementById("npel"), e2 = sr.getElementById("npdu"); if (e1) e1.textContent = f(el); if (e2) e2.textContent = f(dur);
  }

  // Tomorrow's forecast: from the entity chosen in the card, else the first weather source with the most weight.
  async _loadForecast() {
    if (!this._hass || !this._data || (this._fcAt && Date.now() - this._fcAt < FORECAST_MS)) return;
    this._fcAt = Date.now();
    const src = this._config.forecast_entity || ((this._data.weather_sources || []).slice().sort((a, b) => b.weight - a.weight)[0] || {}).entity;
    if (!src) return;
    try {
      const res = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "daily" }, target: { entity_id: src }, return_response: true });
      const list = (res && res.response && res.response[src] && res.response[src].forecast) || [];
      const t = new Date(); t.setDate(t.getDate() + 1);
      const same = (d) => { const x = new Date(d); return x.getFullYear() === t.getFullYear() && x.getMonth() === t.getMonth() && x.getDate() === t.getDate(); };
      this._forecast = list.find((f) => same(f.datetime)) || list[1] || list[0] || null;
    } catch (e) { this._forecast = null; this._fcAt = Date.now() - FORECAST_MS + 5 * 60 * 1000; }   // try again in 5 minutes
    this._last = "";
    this._update();
  }

  // The first hourly entry that starts after now (layout "cards", inside the forecast panel).
  async _loadHourly() {
    if (!this._hass || !this._data || this._config.layout === "classic" || (this._hrAt && Date.now() - this._hrAt < HOURLY_MS)) return;
    this._hrAt = Date.now();
    const src = this._config.forecast_entity || ((this._data.weather_sources || []).slice().sort((a, b) => b.weight - a.weight)[0] || {}).entity;
    if (!src) return;
    try {
      const res = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: src }, return_response: true });
      const list = (res && res.response && res.response[src] && res.response[src].forecast) || [];
      this._hourly = list.find((f) => Date.parse(f.datetime) > Date.now()) || null;
    } catch (e) { this._hourly = null; }   // some weather entities have no hourly forecast: the panel simply has no next-hour part
    this._last = "";
    this._update();
  }
}

customElements.define("avatar-weather-card", AvatarWeatherCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "avatar-weather-card", name: "Avatar Weather Card", preview: true, description: "The avatar for the current weather and time of day, on a living sky." });
