# How Avatar Weather Card works

## Parts
- **Integration** (`custom_components/avatar_weather_card`): config storage, picture library, picture series and backups, upload and backup-download endpoints, websocket API, sidebar panel.
- **Admin panel** (`frontend/avatar-weather-panel.js`): *Settings* (weather sources and weights, holidays, special days, thresholds, times of day), *Prompt* (character notes, wardrobe, colours, weekend activities, fixed prompt parts), *Images* (coverage grids, upload, prompt per cell, outfit editor).
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

## Pictures
Stored in `/config/avatar_weather_card/characters/` with a `manifest.json` (size, soles line `feetY`, mean lightness). A picture is a transparent PNG/WebP of the character; on upload the empty margin is cropped, the soles line and standing point are detected, and the figure is centred, so all pictures line up whatever tool made them. Pictures are served without authentication from `/avatar_weather_card_images/` (like any Home Assistant static path): do not upload pictures you do not want to be readable by someone on your network.

## Picture series and backups
A series (a zip with `series.json` and the pictures) is validated completely and then **replaces the whole library**: the old pictures are deleted, after an optional backup that the panel always asks for. A backup is a zip of the library in `/config/avatar_weather_card/backups/` (max 20) that can be created, listed, downloaded, restored and deleted from the Images tab. Both the install and the restore commands take the backup choice explicitly, so a client cannot forget it. Details and the zip format: [SERIES.md](SERIES.md).

## Prompts
The panel writes the prompt for every cell (text-only or for generators that take a reference picture). The fixed parts (character, style, pose, background, base, no-weather, final check) are editable. The outfit is chosen from the wardrobe items you tick that suit the temperature, time and sky; you can change it per cell.

## Security
Everything that changes data needs an administrator. The card reads its settings through a command that returns only weather sources, options, special days, holidays and the picture list.
