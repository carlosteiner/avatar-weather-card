# Changelog

## 0.1.0 (unreleased)
First public version (beta).
- Home Assistant integration with an admin panel in the sidebar (settings, images, prompts).
- Lovelace card with a living sky background, the avatar for the current weather and time of day, clock, weather, tomorrow's forecast, extra sensors, music view with controls, visual editor.
- Picture selector: temperature, sky and moment of the day, weekends and holidays, special days, nearest-picture fallback.
- Picture series: install a ready-made set of pictures from a catalog (or from a zip). Installing REPLACES the picture library, after asking whether to back the current pictures up; `tools/make_series.py` builds one.
- Backups of the picture library: back up now (with a name and a description), list, download, restore, delete.
- Prompt generator for text-only and reference-picture image generators, wardrobe, colours, weekend activities, outfit editor.
