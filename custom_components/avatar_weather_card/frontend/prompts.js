// Avatar Weather Card - the prompt file.
// One plain-text file per picture set, divided into sections. Each section starts with a line "## NAME":
//   ## STYLE, ## CHARACTER, ## POSE WEATHER, ## POSE MUSIC   shared by every picture
//   ## <picture name>                                         the scene of that one picture (e.g. ## mild_rain_afternoon)
// The prompt of a picture = STYLE + CHARACTER + the right POSE + its own scene. Text before the first section is ignored.

export const SHARED = [
  ["STYLE", "Style", "How the picture is drawn, plus the background and anything that is true of every picture."],
  ["CHARACTER", "Character", "Who the character is: age, face, hair, skin, build, personality."],
  ["POSE WEATHER", "Pose for the weather and special-day pictures", "Standing or walking, framing, the patch of ground under the feet."],
  ["POSE MUSIC", "Pose for the music pictures", "Seated (for example in an armchair with headphones), framing."],
];
const SHARED_KEYS = new Set(SHARED.map(([k]) => k));
const LABEL = { STYLE: "STYLE", CHARACTER: "CHARACTER", "POSE WEATHER": "POSE AND FRAMING", "POSE MUSIC": "POSE AND FRAMING" };
export const DEFAULT_URL = "/avatar_weather_card_static/default-prompts.txt";
export const GUIDE_URL = "/avatar_weather_card_static/prompt-guide.md";

const head = (line) => { const m = /^##\s+(.+?)\s*$/.exec(line); return m ? m[1] : null; };
const key = (h) => { const u = h.toUpperCase().replace(/\s+/g, " "); return SHARED_KEYS.has(u) ? u : h.toLowerCase(); };

// text -> { intro, shared: {STYLE: "...", ...}, scenes: {name: "..."}, order: [names], bad: [headings not understood] }
export function parsePrompts(text) {
  const out = { intro: "", shared: {}, scenes: {}, order: [], bad: [] };
  let cur = null, buf = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (cur === null) out.intro = body;
    else if (SHARED_KEYS.has(cur)) out.shared[cur] = body;
    else if (/^[a-z0-9_]{1,120}$/.test(cur)) { if (!(cur in out.scenes)) out.order.push(cur); out.scenes[cur] = body; }
    else out.bad.push(cur);
    buf = [];
  };
  for (const line of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    const h = head(line);
    if (h !== null) { flush(); cur = key(h); } else buf.push(line);
  }
  flush();
  return out;
}

export function serializePrompts(p) {
  const parts = [];
  if (p.intro) parts.push(p.intro);
  for (const [k] of SHARED) parts.push(`## ${k}\n${(p.shared[k] || "").trim()}`);
  for (const n of p.order) if (n in p.scenes) parts.push(`## ${n}\n${p.scenes[n].trim()}`);
  return parts.join("\n\n") + "\n";
}

export const isMusic = (name) => /^music_/.test(name);
export const baseName = (name) => String(name).replace(/_\d+$/, "");   // an alternative (_2, _3) uses the scene of its cell

// The scene of a picture: its own section, else (for alternatives) the section of its cell.
export function sceneOf(p, name) {
  if (name in p.scenes) return p.scenes[name];
  const b = baseName(name);
  return b in p.scenes ? p.scenes[b] : "";
}

// The ground of a weather picture: the sentence "Ground: ochre cobbles." in its scene. The BASE paragraph of POSE WEATHER has a
// {ground} placeholder that takes it, so the base is described in one piece (some image models get confused when the base refers to the scene).
const GROUND = /(?:^|\s)Ground:\s*(.+?)\.(?=\s|$)/;

// The full prompt of a picture, ready to paste into the image generator ("" when the picture has no scene).
export function assemble(p, name) {
  let scene = sceneOf(p, name).trim();
  if (!scene) return "";
  const music = isMusic(name), pose = music ? "POSE MUSIC" : "POSE WEATHER";
  const poseText = (p.shared[pose] || "").trim();
  let ground = "";
  if (!music && poseText.includes("{ground}")) {          // only then the Ground sentence leaves the scene: an older file keeps working as it was
    const m = GROUND.exec(scene);
    if (m) { ground = m[1].trim(); scene = (scene.slice(0, m.index) + " " + scene.slice(m.index + m[0].length)).trim(); }
  }
  return ["STYLE", "CHARACTER", pose].map((k) => {
    const t = k === pose ? poseText.replace(/\{ground\}/g, ground || "plain stone") : (p.shared[k] || "").trim();
    return t ? `${LABEL[k]}. ${t}` : "";
  }).filter(Boolean).concat(`THE SCENE. ${scene}`).join("\n\n");
}
