# Changelog

## 0.3.3
- **Security:** the pictures are no longer served as unauthenticated static paths. They come from an authenticated view (`/api/avatar_weather_card/image/<set>/<name>.webp`, any logged-in user); the card and the panel fetch them with the user's login and show them as blob URLs, so nobody who can merely reach Home Assistant (Nabu Casa, port forward) can read them.
- The optional *reference picture* (Prompts tab, Images tab "Copy reference image") is removed: it was not used by the card and is often a photo of a real person. A copy left on disk by an older version is deleted at the next start.
- Settings → Times of day: *Evening starts at sunset* (tick box) with a delay in minutes after the sunset (negative = before, 0 = at sunset, as before). In winter the sun sets early, so the evening picture can now be delayed; with the box unticked the *Evening* time is set by hand. The Evening time and the day strips show today's start.

## 0.3.2 (2026-11-21)
- Images tab: the "Drop pictures here" box is gone (drop on a cell and Ctrl+V still work).
- Picture pop-up: zoom (wheel, pinch, double click, − / + buttons, keys + - 0) with drag to move, a *Delete* button, and *Transparency…* that opens the background editor inside the pop-up.
- Background editor: zoom (wheel, pinch, buttons) and drag; the original and the result move together, and the colour can be picked on the zoomed picture.
- Images tab, Special days: the weekdays/weekend switch is gone (those pictures have no weekend variant).
- Picture sets can carry a figure size: optional `body` (300-3000, default 900) in `series.json`, kept by export and applied on install, so a set with smaller figures is shown as big as the others.

## 0.3.1 (2026-11-20)
First public version (beta).
- Home Assistant integration with an admin panel in the sidebar (settings, images, prompts).
- Lovelace card with a living sky background, the avatar for the current weather and time of day, clock, weather, tomorrow's forecast, extra sensors, music view with controls, visual editor.
- Picture selector: temperature, sky and moment of the day, weekends and holidays, special days, nearest-picture fallback.
- Several picture sets side by side (Settings tab → Picture sets): one is *active* (shown and edited in the Images tab), every card can use another one (`image_set` in the card's settings). Create, rename, duplicate, delete, export as a zip, import a zip.
- Install ready-made sets from a catalog (or a zip) as NEW sets: other sets are never touched; updating an existing set asks for an optional backup. `tools/make_series.py` builds one.
- Pictures on a plain background (a chroma key such as grey #808080, or any single colour) are accepted, from the panel and from a set zip. In the panel the cut is done in the browser: only the background connected to the edge goes, plus the closed gaps between legs and arms (grey-ish parts of the figure stay), with a soft edge and no halo. The picture as uploaded is kept (outside the served folder) together with its settings, and in the Images tab *Background…* opens an editor: original and result side by side, colour (picker or click on the picture), tolerance and gap size; *Save* stores the new transparent picture. Pictures that are already transparent are stored as they are. A background that is not one plain colour is refused; a ground that reaches both sides of the picture gets a warning. Originals are not part of exports, backups or catalog zips.
- Installing a set tells you when pictures were not installed because their name matches no cell or special day (for example `xmas_*` when the installation has no `xmas` day): a warning with the first names and what to do.
- Backups per set: back up now (with a name and a description), list, download, restore, delete.
- Existing installations: the old picture library becomes the set `default` automatically.
- Prompts from one plain-text file per picture set (shared STYLE, CHARACTER, POSE WEATHER, POSE MUSIC + one scene per picture), built-in prompts for every cell, download / load / reset, per-cell scene editing with a ready-to-copy prompt, and instructions for an AI chatbot to write a new file. The file is included in exports, backups and installs. This replaces the earlier prompt generator (wardrobe, colours, weekend activities, outfit editor, character notes), whose settings are dropped.
