// Avatar Weather Card - visual editor for the Lovelace card (opens from "Edit" on the card).
// Built on Home Assistant's own ha-form, so it looks like the other cards and follows the theme.
// The global settings (weather sources, times of day, pictures, prompts) live in the Avatar Weather panel in the sidebar;
// the editor only covers what is specific to this one card.
const DEFAULTS = { layout: "cards", clock_size: 1, music_controls: true, pause_grace: 30, height: 420, avatar_x: 0.74, avatar_size: 0.74, show_clock: true, show_details: true, show_forecast: true, show_picture: false };

const ACTIVE = "__active";   // the choice "the active set" (stored as no image_set at all)

const SCHEMA = [
  { name: "name", selector: { text: {} } },
  { name: "image_set", selector: { select: { mode: "dropdown", options: [{ value: ACTIVE, label: "The active set" }] } } },
  { name: "layout", selector: { select: { mode: "dropdown", options: [{ value: "cards", label: "Cards (glass panels, like the web page)" }, { value: "classic", label: "Classic (bare text)" }] } } },
  { name: "height", selector: { number: { min: 200, max: 900, step: 10, mode: "slider", unit_of_measurement: "px" } } },
  { name: "clock_size", selector: { number: { min: 0.5, max: 2, step: 0.05, mode: "slider" } } },
  {
    type: "grid", name: "", schema: [
      { name: "show_clock", selector: { boolean: {} } },
      { name: "show_details", selector: { boolean: {} } },
      { name: "show_forecast", selector: { boolean: {} } },
    ],
  },
  { name: "forecast_entity", selector: { entity: { domain: "weather" } } },
  { name: "media_player", selector: { entity: { domain: "media_player" } } },
  {
    type: "grid", name: "", schema: [
      { name: "music_controls", selector: { boolean: {} } },
      { name: "pause_grace", selector: { number: { min: 0, max: 300, step: 5, mode: "box", unit_of_measurement: "s" } } },
    ],
  },
  { name: "temperature_entity", selector: { entity: { domain: "sensor", device_class: "temperature" } } },
  { name: "humidity_entity", selector: { entity: { domain: "sensor", device_class: "humidity" } } },
  {
    type: "grid", name: "", schema: [
      { name: "avatar_x", selector: { number: { min: 0.1, max: 0.9, step: 0.05, mode: "slider" } } },
      { name: "avatar_size", selector: { number: { min: 0.4, max: 1, step: 0.02, mode: "slider" } } },
    ],
  },
  ...[1, 2, 3].map((n) => ({
    type: "expandable", name: `sensor_${n}`, title: `Extra sensor ${n} (optional)`, schema: [
      { name: "entity", selector: { entity: { domain: "sensor" } } },
      { name: "label", selector: { text: {} } },
      { name: "icon", selector: { select: { mode: "dropdown", options: [{ value: "thermometer", label: "Thermometer" }, { value: "humidity", label: "Humidity" }, { value: "wind", label: "Wind" }, { value: "pressure", label: "Pressure" }] } } },
      { name: "unit", selector: { text: {} } },
    ],
  })),
  { name: "show_picture", selector: { boolean: {} } },
];

const LABELS = {
  image_set: "Picture set",
  name: "Name (shown on the card)",
  layout: "Layout",
  entity: "Sensor",
  label: "Label (default: the sensor name)",
  icon: "Icon",
  unit: "Unit (default: the sensor unit)",
  height: "Height",
  temperature_entity: "Temperature sensor (optional)",
  humidity_entity: "Humidity sensor (optional)",
  clock_size: "Clock size",
  media_player: "Media player (optional)",
  music_controls: "Music controls",
  pause_grace: "Keep the music view after a pause",
  show_clock: "Clock and date",
  show_details: "Humidity and wind",
  show_forecast: "Tomorrow's forecast",
  forecast_entity: "Weather entity for tomorrow (optional)",
  avatar_x: "Avatar position (left to right)",
  avatar_size: "Avatar size",
  show_picture: "Show which picture was chosen and why",
};
const HELPERS = {
  image_set: "Which set of pictures this card draws from. \"The active set\" follows the choice made in the Avatar Weather panel, Settings tab; pick another one to give this card its own character.",
  name: "Shown small at the top of the card, above the clock. Leave empty for none.",
  layout: "Cards = glass panels with icons, like the web page. Classic = plain text on the sky.",
  height: "Height of the card in pixels. Everything inside scales with it.",
  clock_size: "Size of the clock and the date: 1 = like the web page, 0.5 = half, 2 = double.",
  media_player: "While it plays, the card shows the cover, the track and the avatar in her armchair. Leave empty for no music view.",
  music_controls: "Previous, play/pause, next, mute and volume buttons on the music view.",
  pause_grace: "Seconds the music view stays after you pause. After that the weather comes back.",
  show_clock: "The big clock with today's date.",
  show_details: "Humidity and wind, next to the temperature.",
  show_forecast: "Tomorrow's weather (and the next hour, in the cards layout).",
  forecast_entity: "The weather entity the forecast comes from. Leave empty to use the weather source with the most weight.",
  temperature_entity: "Replaces the temperature in this card: the big number AND the outfit of the avatar (cold, chilly, mild, warm, hot). Leave empty to use the average of the weather sources set in the Avatar Weather panel. Handy for a thermometer of your own, such as one on the balcony.",
  humidity_entity: "Replaces the humidity number shown in this card (it does not change the picture). Leave empty to use the weather sources.",
  avatar_x: "0.5 = centred, 0.74 = on the right like the web page.",
  avatar_size: "Height of the avatar as a fraction of the card.",
  entity: "Only shown in its own panel under the forecast: it does not change the avatar or the temperature above.",
  label: "The name written in the panel.",
  icon: "The small picture in the panel.",
  unit: "Written after the value (for example °C or %).",
  show_picture: "Writes at the bottom which picture was chosen and why. Handy to check the selection; turn it off for everyday use.",
};

// The config without empty values and without the defaults, so the YAML stays short. sensor_1..3 of the form become the `sensors` list.
export function cleanConfig(value, type) {
  const out = { type }, sensors = [];
  Object.keys(value || {}).forEach((k) => {
    const v = value[k];
    if (/^sensor_\d$/.test(k)) {
      if (v && v.entity) { const x = { entity: v.entity }; ["label", "icon", "unit"].forEach((f) => { if (v[f]) x[f] = v[f]; }); sensors.push(x); }
      return;
    }
    if (k === "sensors") return;
    if (k === "image_set" && v === ACTIVE) return;
    if (v === undefined || v === null || v === "") return;
    if (k in DEFAULTS && (typeof DEFAULTS[k] === "boolean" ? v === DEFAULTS[k] : typeof DEFAULTS[k] === "number" ? Number(v) === DEFAULTS[k] : v === DEFAULTS[k])) return;   // only what differs from the defaults
    if (v === false && !(k in DEFAULTS)) return;
    out[k] = v;
  });
  if (sensors.length) out.sensors = sensors;
  return out;
}

class AvatarWeatherCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (first) this._loadSets();
  }

  // The picture sets for the dropdown (administrators only: the editor is for them anyway).
  async _loadSets() {
    try {
      const r = await this._hass.callWS({ type: "avatar_weather_card/sets_list" });
      this._sets = [{ value: ACTIVE, label: `The active set (${(r.sets.find((x) => x.id === r.active) || {}).name || r.active})` },
        ...r.sets.filter((x) => x.id !== r.active).map((x) => ({ value: x.id, label: `${x.name} (${x.count} pictures)` })),
        ...(r.sets.some((x) => x.id === r.active) ? [{ value: r.active, label: `${(r.sets.find((x) => x.id === r.active) || {}).name} (the active one, fixed)` }] : [])];
      this._render();
    } catch (err) { /* an older integration without sets: the dropdown keeps its single choice */ }
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = SCHEMA;
      this._form.computeLabel = (s) => LABELS[s.name] || s.name;
      this._form.computeHelper = (s) => HELPERS[s.name] || "";
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = cleanConfig(ev.detail.value, this._config.type || "custom:avatar-weather-card");
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    if (this._sets) {
      const cur = this._config.image_set;
      const opts = this._sets.some((o) => o.value === cur) || !cur ? this._sets : [...this._sets, { value: cur, label: `${cur} (not found)` }];
      this._form.schema = SCHEMA.map((f) => (f.name === "image_set" ? { name: "image_set", selector: { select: { mode: "dropdown", options: opts } } } : f));
    }
    const data = { ...DEFAULTS, image_set: ACTIVE, ...this._config };
    const list = Array.isArray(this._config.sensors) ? this._config.sensors : [];
    [1, 2, 3].forEach((n) => { data[`sensor_${n}`] = list[n - 1] || {}; });
    delete data.sensors;
    this._form.data = data;
  }
}

customElements.define("avatar-weather-card-editor", AvatarWeatherCardEditor);
