# Picture series

A **series** is a ready-made set of pictures of one character. Installing a series fills the coverage grids; the user's own pictures always win over a series picture of the same name, and removing a series never touches the user's pictures.

## A series zip
A flat zip with:
- `series.json`: `{"id": "pencil-woman", "name": "...", "version": "0.1.0", "description": "...", "author": "...", "license": "CC BY 4.0", "attribution": "...", "character": "...", "models": "...", "slots": {"mild_clear_afternoon": {"feetY": 1023, "h": 1078, "w": 750}, ...}}` — `id` must match the id it is installed under; `slots` is optional (the soles line is detected when missing).
- one transparent `<slot>.webp` per picture, named like the slots (`mild_clear_afternoon.webp`, `music_cold_evening.webp`, `halloween_evening.webp`…). Pictures should be normalised like the ones the panel stores (empty margin cropped, figure centred on the standing point).

Limits: 150 MB zip, 400 MB unpacked, 700 files, 3000 px per side, 12 MB per picture. Anything else in the zip (folders, other files, bad names) is skipped. Pictures without transparency are refused.

Build one with `python3 tools/make_series.py --src <folder with .webp + manifest.json> --out dist --id ... --name ... --version ...` (it also writes the catalog entry with the size and the sha256).

## The catalog
`index.json` in the images repository: `{"series": [{"id", "name", "version", "description", "author", "license", "attribution", "count", "bytes", "sha256", "zip_url"}]}`. `zip_url` must be https; the integration checks the sha256 when it is given. The address of the catalog can be changed in the stored settings (`series.catalog_url`).

## Installing
- From the catalog: *Images* tab → *Picture series* → Install / Update / Remove.
- By hand: copy a zip into `/config/avatar_weather_card/incoming/` and install it from the same tab.

Installed series live in `/config/avatar_weather_card/series/<id>/` and are served under `/avatar_weather_card_series/<id>/`.
