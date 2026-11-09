# Avatar Weather Card

A Home Assistant integration and Lovelace card that shows **an avatar dressed for the weather**: it changes outfit with the temperature, the sky, the time of day, weekends, holidays and special days, on a living sky background (sun, moon, stars, clouds, rain, snow, fog, lightning). A music view takes over while a media player plays.

> **Status: beta (0.1.0).** It works, but expect rough edges. Screenshots are coming.

## What you get
- A sidebar **panel** to set everything up: weather sources, thresholds, times of day, holidays, special days, the character, the wardrobe, the pictures and the prompts to make them.
- A **card** for your dashboards, with a visual editor: clock, weather, tomorrow's forecast, extra sensors, the avatar, the music view with controls.
- A **picture selector** that picks the closest available picture, so a set of pictures can grow slowly.
- A **prompt generator** for AI image generators (text-only or with a reference picture), so you can make your own series.

## Requirements
- Home Assistant 2024.7 or newer (tested on 2026.10) and a modern browser (the card uses CSS container query units).
- Pictures of the character. A default series will be available from the images repository (see *Pictures*); you can also make your own.

## Installation
### HACS (custom repository)
1. HACS → ⋮ → *Custom repositories* → add this repository, category *Integration*.
2. Install **Avatar Weather Card** and restart Home Assistant.
3. Settings → Devices & services → *Add integration* → **Avatar Weather Card**.

### Manual
Copy `custom_components/avatar_weather_card` into your `config/custom_components/`, restart, then add the integration as above.

The card is loaded by the integration on every dashboard: there is no Lovelace resource to add.

## First steps
1. Open **Avatar Weather** in the sidebar → *Settings*: tick your weather entities (give each a weight), choose the sun entity, adjust the temperature thresholds and times of day.
2. *Prompt* tab: describe the character, tick the clothes and colours you like.
3. *Images* tab: add pictures (drag and drop; a file named like a slot, e.g. `mild_rain_afternoon.png`, keeps its name). Every cell shows what comes out and the prompt to make its picture.
4. Add the card to a dashboard: *Add card* → **Avatar Weather Card**, or in YAML:

```yaml
type: custom:avatar-weather-card
name: Living room
height: 460
media_player: media_player.living_room   # optional: music view while it plays
sensors:                                  # optional extra panels, up to 3
  - { entity: sensor.balcony_temperature, label: Balcony, icon: thermometer, unit: "°C" }
```

### Card options
| Option | Default | |
|---|---|---|
| `name` | – | small label above the clock |
| `layout` | `cards` | `cards` (glass panels) or `classic` (bare text) |
| `height` | 420 | card height in px; everything scales with it |
| `clock_size` | 1 | size of the clock and date (also in the music view) |
| `show_clock` `show_details` `show_forecast` | true | parts to show |
| `temperature_entity` `humidity_entity` | – | replace the temperature / humidity of the weather sources for this card (shown value and outfit) |
| `forecast_entity` | heaviest source | weather entity for tomorrow and the next hour |
| `sensors` | – | extra sensor panels: `entity`, `label`, `icon` (thermometer, humidity, wind, pressure), `unit` |
| `media_player` / `media_players` | – | enables the music view |
| `music_controls` | true | previous / play-pause / next, mute, volume |
| `pause_grace` | 30 | seconds the music view stays after a pause |
| `avatar_x` `avatar_size` | 0.74 / 0.74 | where the avatar stands and how big she is |
| `show_picture` | false | write which picture was chosen and why (handy while testing) |

## Pictures
The pictures are not part of this repository. A default series is published separately (see the images repository linked from the releases) and installs from the **Images** tab → *Picture series* in one click. Installing a series replaces your pictures (it asks first whether to back them up; backups can be created with a name and a description, downloaded, restored or deleted from the same tab), and you can add your own pictures afterwards. You can also install a series zip by hand, or build and share your own: see [docs/SERIES.md](docs/SERIES.md). How the names work and how a picture is chosen: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Pictures are served by Home Assistant without authentication (like any static path). Do not upload pictures of real people you do not want to be readable on your network, and note that some image generators refuse to work from a picture of a real person.

## Contributing
Issues and pull requests are welcome. The integration is plain Python, the panel and the card are plain JavaScript modules (no build step).

## License
Code: [MIT](LICENSE). The default pictures have their own licence (see the images repository).
