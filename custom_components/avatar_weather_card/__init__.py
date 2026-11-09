"""Avatar Weather Card - skeleton: registers an admin panel in the sidebar."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import websocket_api as ws
from .const import DOMAIN, IMAGES_URL, PANEL_URL, REFERENCE_URL, STATIC_URL
from .images import BackupLibrary, ImageLibrary, ReferenceLibrary, SeriesLibrary
from .store import ConfigStore
from .views import BackupDownloadView, ReferenceUploadView, UploadView

_LOGGER = logging.getLogger(__name__)
# Cache-busting token for the frontend files (panel, card and the modules they import): change it whenever a frontend file changes,
# and the same token in the import lines of avatar-weather-card.js and avatar-weather-panel.js.
VERSION = "0.1.0-2"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.setdefault(DOMAIN, {})
    if "store" not in data:
        data["store"] = ConfigStore(hass)
        await data["store"].async_load()
        ws.async_register(hass)
        lib = ImageLibrary(Path(hass.config.path("avatar_weather_card")))
        await hass.async_add_executor_job(lib.setup)
        data["images"] = lib
        ref = ReferenceLibrary(Path(hass.config.path("avatar_weather_card")))
        await hass.async_add_executor_job(ref.setup)
        data["reference"] = ref
        root = Path(hass.config.path("avatar_weather_card"))
        backups = BackupLibrary(root, lib)
        series = SeriesLibrary(root, lib, backups)
        await hass.async_add_executor_job(backups.setup)
        await hass.async_add_executor_job(series.setup)
        data["backups"] = backups
        data["series"] = series
        hass.http.register_view(UploadView(hass))
        hass.http.register_view(ReferenceUploadView(hass))
        hass.http.register_view(BackupDownloadView(hass))
        await hass.http.async_register_static_paths(
            [StaticPathConfig(IMAGES_URL, str(lib.dir), False), StaticPathConfig(REFERENCE_URL, str(ref.dir), False)]
        )
    if not data.get("static"):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)]
        )
        data["static"] = True
        # the Lovelace card: loaded on every dashboard, no resource to add by hand
        frontend.add_extra_js_url(hass, f"{STATIC_URL}/avatar-weather-card.js?v={VERSION}")
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="avatar-weather-panel",
        frontend_url_path=PANEL_URL,
        module_url=f"{STATIC_URL}/avatar-weather-panel.js?v={VERSION}",
        sidebar_title="Avatar Weather",
        sidebar_icon="mdi:weather-partly-cloudy",
        require_admin=True,
        config={},
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL)
    return True
