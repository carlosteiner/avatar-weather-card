# Picture series

A **series** is a ready-made set of pictures of one character, distributed as a zip. **Installing a series creates a new picture set** (its id is the series id) and never touches the user's other sets. Only if a set with that id already exists can the user choose to update it: its pictures are then replaced, after an optional backup (see *Backups*). The same zip is what *Export zip* produces, so sets can be exchanged between users.

## A series zip
A flat zip with:
- `series.json`: `{"id": "pencil-woman", "name": "...", "version": "0.1.0", "description": "...", "author": "...", "license": "CC BY 4.0", "attribution": "...", "character": "...", "models": "...", "slots": {"mild_clear_afternoon": {"feetY": 1023, "h": 1078, "w": 750}, ...}}` — `id` must match the id it is installed under; `slots` is optional (the soles line is detected when missing).
- one transparent `<slot>.webp` per picture, named like the slots (`mild_clear_afternoon.webp`, `music_cold_evening.webp`, `halloween_evening.webp`…). Pictures should be normalised like the ones the panel stores (empty margin cropped, figure centred on the standing point).
- optional `prompts.txt`: the set's prompt file (see the README, *Prompts*). Installing a zip that has one replaces the set's prompts; a zip without one keeps them.

Limits: 150 MB zip, 400 MB unpacked, 700 files, 3000 px per side, 12 MB per picture. Anything else in the zip (folders, other files, bad names) is skipped. Pictures without transparency are refused.

Build one with `python3 tools/make_series.py --src <folder with .webp + manifest.json> --out dist --id ... --name ... --version ...` (it also writes the catalog entry with the size and the sha256).

## The catalog
`index.json` in the images repository: `{"series": [{"id", "name", "version", "description", "author", "license", "attribution", "count", "bytes", "sha256", "zip_url"}]}`. `zip_url` must be https; the integration checks the sha256 when it is given. The address of the catalog can be changed in the stored settings (`series.catalog_url`).

## Installing and sharing
- From the catalog: *Settings* tab → *Picture sets* → *Get more sets* → Install / Update / Reinstall.
- From a zip: *Import a zip…* in the same section, or copy it into `/config/avatar_weather_card/incoming/` and install it from the list.
- A zip is fully validated before anything is touched: a bad series changes nothing and leaves no backup behind.
- **To share a set:** fill in *Rename / details* (name, author, **licence**, credits, version), press *Export zip*, then send the zip to the images repository (pull request or issue). The maintainers add it to `index.json` (`tools/make_series.py` computes the size and sha256 for the entry). Only share pictures you may share under the licence you wrote.

## Backups
`/config/avatar_weather_card/backups/<YYYYMMDD-HHMMSS>.zip`: the pictures, their `manifest.json` and a `backup.json` (name, description, date, reason, number of pictures, series). The name and the description are the ones you give when you create it; backups made automatically before an install or a restore get no name, and show the reason instead. One backup holds one set. In the *Settings* tab → *Picture sets*: **Back up** on a set (it gets a name, you can see it in *Backups*), **Download** (saves the zip on your computer; it is only served to administrators), **Restore** (replaces the pictures of the set the backup came from, or recreates the set; it asks for an optional backup first) and **Delete**. Up to 20 backups are kept; delete old ones to make room. To bring a downloaded backup back, copy the zip into `/config/avatar_weather_card/backups/` renamed back to `YYYYMMDD-HHMMSS.zip` (the download is called `avatar-weather-backup-YYYYMMDD-HHMMSS.zip`: drop the prefix) and reopen the tab: it shows up in the list and can be restored.
