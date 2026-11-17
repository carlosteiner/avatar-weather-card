# How Avatar Weather Card works

## Parts
- **Integration** (`custom_components/avatar_weather_card`): config storage, picture sets (several libraries, one active), set install/export/import and backups, upload and download endpoints, websocket API, sidebar panel.
- **Admin panel** (`frontend/avatar-weather-panel.js`): *Settings* (picture sets, weather sources and weights, holidays, special days, thresholds, times of day), *Prompts* (the prompt file of the active set: the four shared sections, download / load / reset, instructions for an AI; the optional reference picture), *Images* (the active set: coverage grids, upload, the scene and the whole prompt of each cell).
- **Lovelace card** (`frontend/avatar-weather-card.js` + editor): shows the avatar chosen for the current weather over a living sky, with clock, weather, forecast, sensors and a music view.
- **Selector** (`frontend/selector.js`): given the weather and the clock, names the picture to show. Used by the panel and the card.

## Picture names
`<temperature>_<sky>_<moment>[_weekend][_N]` and `music_<temperature>_<moment>[_weekend][_N]`, plus `<special-day>_<moment>`.
- temperature: `cold chilly mild warm hot` (finer names `freezing heatwave` are still read)
- sky: `clear cloudy rain snow` (`wind fog storm hail sleet snowstorm` are still read)
- moment: `earlymorning morning afternoon evening night` (`midday goldenhour lateevening` are still read)
- `_N` = alternates of the same picture; one is picked per hour.

## Selection
The live weather and the clock are folded into the reduced set above, every available picture gets a distance from them, and the closest wins. Mistakes are not equally bad: rain gear under a clear sky is the worst, then dry clothes in the rain; evening heels at 7 in the morning is next; a neighbouring temperature band costs little. A missing picture is simply never the answer, so a set can grow cell by cell.

## Pictures and sets
A **set** is a folder `/config/avatar_weather_card/sets/<id>/` with the pictures, a `manifest.json` (size, soles line `feetY`, mean lightness) and a `set.json` (name, description, author, licence, version, credits). A picture is a PNG/WebP of the character, transparent or on a plain one-colour background (removed on upload); on upload the empty margin is cropped, the soles line and standing point are detected, and the figure is centred, so all pictures line up whatever tool made them. Pictures are served without authentication from `/avatar_weather_card_images/<set>/<name>.webp` (like any Home Assistant static path): do not upload pictures you do not want to be readable by someone on your network.

Several sets exist at the same time. The **active** set (`sets.active` in the settings) is the one the Images tab edits and uploads to, and the one every card uses unless its own settings name another (`image_set`). The websocket commands `images_list` and `public_config` take an optional `set` (unknown or empty = the active one). The library that older versions kept in `characters/` is moved to the set `default` at the first start.

Sets are created empty, duplicated, renamed, deleted (never the active one), **exported** as a zip and **imported/installed** from a zip or the catalog. Installing validates the whole zip first and never touches another set; an id that is already taken is replaced only when the client says so explicitly (`replace`), after an optional backup (`backup`). A backup is a zip of one set in `/config/avatar_weather_card/backups/` (max 20) that can be created, listed, downloaded, restored (over the set it came from, recreating it if it was deleted) and deleted from the Settings tab. Details and the zip format: [SERIES.md](SERIES.md).

## Prompts
One plain-text file per set, in `/config/avatar_weather_card/prompts/<set>.txt` (not in the set folder, which is served without login), sections `## STYLE`, `## CHARACTER`, `## POSE WEATHER`, `## POSE MUSIC` and one `## <picture name>` per scene. `prompts.py` checks it on save (`prompts_get` / `prompts_set` websocket commands; empty text = back to the built-in `frontend/default-prompts.txt`); `frontend/prompts.js` parses it and assembles STYLE + CHARACTER + POSE + scene. An alternative (`_2`) uses the scene of its cell. The file is included as `prompts.txt` in exports, backups and installs (a zip without it keeps the set's current prompts). `frontend/prompt-guide.md` is the guide for an AI that writes the file.

## Security
Everything that changes data needs an administrator. The card reads its settings through a command that returns only weather sources, options, special days, holidays and the picture list.
