# Picture series

A **series** is a ready-made set of pictures of one character. **Installing a series replaces the whole picture library**: the pictures the user has now are deleted and the series' ones take their place. Before that the panel asks whether to make a backup (see *Backups*).

## A series zip
A flat zip with:
- `series.json`: `{"id": "pencil-woman", "name": "...", "version": "0.1.0", "description": "...", "author": "...", "license": "CC BY 4.0", "attribution": "...", "character": "...", "models": "...", "slots": {"mild_clear_afternoon": {"feetY": 1023, "h": 1078, "w": 750}, ...}}` — `id` must match the id it is installed under; `slots` is optional (the soles line is detected when missing).
- one transparent `<slot>.webp` per picture, named like the slots (`mild_clear_afternoon.webp`, `music_cold_evening.webp`, `halloween_evening.webp`…). Pictures should be normalised like the ones the panel stores (empty margin cropped, figure centred on the standing point).

Limits: 150 MB zip, 400 MB unpacked, 700 files, 3000 px per side, 12 MB per picture. Anything else in the zip (folders, other files, bad names) is skipped. Pictures without transparency are refused.

Build one with `python3 tools/make_series.py --src <folder with .webp + manifest.json> --out dist --id ... --name ... --version ...` (it also writes the catalog entry with the size and the sha256).

## The catalog
`index.json` in the images repository: `{"series": [{"id", "name", "version", "description", "author", "license", "attribution", "count", "bytes", "sha256", "zip_url"}]}`. `zip_url` must be https; the integration checks the sha256 when it is given. The address of the catalog can be changed in the stored settings (`series.catalog_url`).

## Installing
- From the catalog: *Images* tab → *Picture series* → Install / Update / Reinstall.
- By hand: copy a zip into `/config/avatar_weather_card/incoming/` and install it from the same tab.

If the user already has pictures, the panel warns that they will be deleted and asks: **back up first** / install without a backup / cancel. A zip is fully validated before anything is touched: a bad series changes nothing and leaves no backup behind. Pictures added afterwards (by upload) simply live next to the series' ones.

## Backups
`/config/avatar_weather_card/backups/<YYYYMMDD-HHMMSS>.zip`: the pictures, their `manifest.json` and a `backup.json` (name, description, date, reason, number of pictures, series). The name and the description are the ones you give when you create it; backups made automatically before an install or a restore get no name, and show the reason instead. In the *Images* tab → *Backups*: **Back up my pictures now** (you give it a name and an optional description), **Download** (saves the zip on your computer; it is only served to administrators), **Restore** (replaces the current pictures; it asks the same backup question first) and **Delete**. Up to 20 backups are kept; delete old ones to make room. To bring a downloaded backup back, copy the zip into `/config/avatar_weather_card/backups/` renamed back to `YYYYMMDD-HHMMSS.zip` (the download is called `avatar-weather-backup-YYYYMMDD-HHMMSS.zip`: drop the prefix) and reopen the tab: it shows up in the list and can be restored.
