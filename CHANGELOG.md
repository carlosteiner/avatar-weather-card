# Changelog

## 0.3.0 (unreleased)
First public version (beta).
- Home Assistant integration with an admin panel in the sidebar (settings, images, prompts).
- Lovelace card with a living sky background, the avatar for the current weather and time of day, clock, weather, tomorrow's forecast, extra sensors, music view with controls, visual editor.
- Picture selector: temperature, sky and moment of the day, weekends and holidays, special days, nearest-picture fallback.
- Several picture sets side by side (Settings tab → Picture sets): one is *active* (shown and edited in the Images tab), every card can use another one (`image_set` in the card's settings). Create, rename, duplicate, delete, export as a zip, import a zip.
- Install ready-made sets from a catalog (or a zip) as NEW sets: other sets are never touched; updating an existing set asks for an optional backup. `tools/make_series.py` builds one.
- Pictures on a plain background (a chroma key such as grey #808080, or any single colour) are accepted, from the panel and from a set zip: every pixel of the background colour is removed with a small tolerance, also between legs and arms, with a soft edge and no halo. A background that is not one plain colour is refused.
- Installing a set tells you when pictures were not installed because their name matches no cell or special day (for example `xmas_*` when the installation has no `xmas` day): a warning with the first names and what to do.
- Backups per set: back up now (with a name and a description), list, download, restore, delete.
- Existing installations: the old picture library becomes the set `default` automatically.
- Prompts from one plain-text file per picture set (shared STYLE, CHARACTER, POSE WEATHER, POSE MUSIC + one scene per picture), built-in prompts for every cell, download / load / reset, per-cell scene editing with a ready-to-copy prompt, and instructions for an AI chatbot to write a new file. The file is included in exports, backups and installs. This replaces the earlier prompt generator (wardrobe, colours, weekend activities, outfit editor, character notes), whose settings are dropped.
