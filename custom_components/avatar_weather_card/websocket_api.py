from __future__ import annotations

import hashlib
import json
import logging
import re

import aiohttp
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DEFAULT_CATALOG_URL, DOMAIN, IMAGES_URL, SERIES_URL
from .images import MAX_SERIES_BYTES, SERIES_ID, SeriesLibrary, merged_listing

_LOGGER = logging.getLogger(__name__)


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_config_get)
    websocket_api.async_register_command(hass, ws_public_config)
    websocket_api.async_register_command(hass, ws_config_set)
    websocket_api.async_register_command(hass, ws_images_list)
    websocket_api.async_register_command(hass, ws_image_delete)
    websocket_api.async_register_command(hass, ws_reference_get)
    websocket_api.async_register_command(hass, ws_reference_delete)
    websocket_api.async_register_command(hass, ws_series_catalog)
    websocket_api.async_register_command(hass, ws_series_install)
    websocket_api.async_register_command(hass, ws_series_install_file)
    websocket_api.async_register_command(hass, ws_series_remove)


def _merged(hass: HomeAssistant) -> dict:
    """The picture list the card and the panel see: the active series under the user's own pictures (blocking: run in the executor)."""
    d = hass.data[DOMAIN]
    return merged_listing(d["images"].listing(), d["series"], d["store"].config["series"]["active"], IMAGES_URL, SERIES_URL)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/config_get"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_config_get(hass, connection, msg):
    connection.send_result(msg["id"], hass.data[DOMAIN]["store"].config)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/config_set", vol.Required("config"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_config_set(hass, connection, msg):
    try:
        cfg = await hass.data[DOMAIN]["store"].async_save(msg["config"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_config", str(err))
        return
    connection.send_result(msg["id"], cfg)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/images_list"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_images_list(hass, connection, msg):
    connection.send_result(msg["id"], await hass.async_add_executor_job(_merged, hass))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/image_delete", vol.Required("name"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_image_delete(hass, connection, msg):
    d = hass.data[DOMAIN]
    ok = await hass.async_add_executor_job(d["images"].delete, msg["name"])
    connection.send_result(msg["id"], {"deleted": ok})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/reference_get"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_reference_get(hass, connection, msg):
    connection.send_result(msg["id"], await hass.async_add_executor_job(hass.data[DOMAIN]["reference"].info))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/reference_delete"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_reference_delete(hass, connection, msg):
    ok = await hass.async_add_executor_job(hass.data[DOMAIN]["reference"].delete)
    connection.send_result(msg["id"], {"deleted": ok})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/public_config"})
@websocket_api.async_response
async def ws_public_config(hass, connection, msg):
    """What the Lovelace card needs, for any logged-in user: weather sources, options, special days, holidays and the picture list.
    Nothing about the avatar (description, wardrobe, prompts)."""
    d = hass.data[DOMAIN]
    cfg = d["store"].config
    images = await hass.async_add_executor_job(_merged, hass)
    connection.send_result(msg["id"], {
        "weather_sources": cfg["weather_sources"], "options": cfg["options"], "special_days": cfg["special_days"],
        "holiday_calendar": cfg["holiday_calendar"], "extra_holidays": cfg["extra_holidays"], "images": images,
    })


# --- picture series ---------------------------------------------------------------------------------------------

async def _download(hass: HomeAssistant, url: str, limit: int, timeout: int) -> bytes:
    """GET an https address and return the body, refusing anything bigger than `limit` bytes."""
    if not url.startswith("https://"):
        raise ValueError("only https addresses are allowed")
    session = async_get_clientsession(hass)
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
        if resp.status != 200:
            raise ValueError(f"HTTP {resp.status}")
        if resp.content_length and resp.content_length > limit:
            raise ValueError("file too large")
        data = bytearray()
        async for chunk in resp.content.iter_chunked(65536):
            data += chunk
            if len(data) > limit:
                raise ValueError("file too large")
    return bytes(data)


def _clean_item(x) -> dict | None:
    """One catalog entry, reduced to what we use."""
    if not isinstance(x, dict) or not isinstance(x.get("id"), str) or not SERIES_ID.match(x["id"]):
        return None
    out = {"id": x["id"]}
    for k, mx in (("name", 80), ("version", 40), ("description", 500), ("author", 80), ("license", 80), ("attribution", 300), ("preview_url", 300)):
        v = x.get(k, "")
        out[k] = str(v)[:mx] if isinstance(v, (str, int, float)) else ""
    for k in ("count", "bytes"):
        out[k] = x[k] if isinstance(x.get(k), int) and not isinstance(x.get(k), bool) else 0
    zip_url = x.get("zip_url", "")
    out["zip_url"] = zip_url if isinstance(zip_url, str) and zip_url.startswith("https://") and len(zip_url) < 400 else ""
    sha = x.get("sha256", "")
    out["sha256"] = sha.lower() if isinstance(sha, str) and re.fullmatch(r"[0-9a-fA-F]{64}", sha) else ""
    return out


async def _set_active(hass: HomeAssistant, sid: str, on: bool) -> None:
    store = hass.data[DOMAIN]["store"]
    cfg = store.config
    active = [i for i in cfg["series"]["active"] if i != sid] + ([sid] if on else [])
    await store.async_save({**cfg, "series": {**cfg["series"], "active": active}})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_catalog"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_catalog(hass, connection, msg):
    """The series on offer (from the catalog on the internet), the installed ones and the zips dropped in the incoming folder."""
    d = hass.data[DOMAIN]
    url = d["store"].config["series"]["catalog_url"] or DEFAULT_CATALOG_URL
    items, error = [], ""
    try:
        data = json.loads(await _download(hass, url, 1_000_000, 15))
        raw = data.get("series", []) if isinstance(data, dict) else []
        items = [c for c in (_clean_item(x) for x in raw[:50]) if c]
    except (aiohttp.ClientError, ValueError, TimeoutError) as err:
        error = str(err) or err.__class__.__name__
    installed = await hass.async_add_executor_job(d["series"].installed)
    incoming = await hass.async_add_executor_job(d["series"].incoming_files)
    connection.send_result(msg["id"], {
        "catalog": items, "error": error, "url": url, "installed": installed,
        "active": d["store"].config["series"]["active"], "incoming": incoming,
    })


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_install", vol.Required("series_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_install(hass, connection, msg):
    """Download a series from the catalog, check it and install it (or update it)."""
    d = hass.data[DOMAIN]
    sid = msg["series_id"]
    url = d["store"].config["series"]["catalog_url"] or DEFAULT_CATALOG_URL
    try:
        data = json.loads(await _download(hass, url, 1_000_000, 15))
        item = next((c for c in (_clean_item(x) for x in data.get("series", [])[:50]) if c and c["id"] == sid), None)
        if not item or not item["zip_url"]:
            raise ValueError("series not found in the catalog")
        blob = await _download(hass, item["zip_url"], MAX_SERIES_BYTES, 300)
        if item["sha256"] and hashlib.sha256(blob).hexdigest() != item["sha256"]:
            raise ValueError("the downloaded file does not match the catalog (sha256)")
        events = [x["id"] for x in d["store"].config["special_days"]]
        result = await hass.async_add_executor_job(d["series"].install, sid, blob, events)
        await _set_active(hass, sid, True)
    except (aiohttp.ClientError, ValueError, TimeoutError) as err:
        _LOGGER.warning("Installing series %s failed: %s", sid, err)
        connection.send_error(msg["id"], "install_failed", str(err) or err.__class__.__name__)
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_install_file", vol.Required("file"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_install_file(hass, connection, msg):
    """Install a series from a zip dropped by hand in /config/avatar_weather_card/incoming/."""
    d = hass.data[DOMAIN]
    name = msg["file"]
    series: SeriesLibrary = d["series"]
    if not re.fullmatch(r"[A-Za-z0-9._ -]{1,120}\.zip", name) or ".." in name:
        connection.send_error(msg["id"], "invalid_file", "invalid file name")
        return

    def work():
        path = series.incoming / name
        if not path.is_file() or path.stat().st_size > MAX_SERIES_BYTES:
            raise ValueError("file not found or too large")
        blob = path.read_bytes()
        sid = series.id_of(blob)
        return series.install(sid, blob, [x["id"] for x in d["store"].config["special_days"]])

    try:
        result = await hass.async_add_executor_job(work)
        await _set_active(hass, result["id"], True)
    except ValueError as err:
        connection.send_error(msg["id"], "install_failed", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_remove", vol.Required("series_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_remove(hass, connection, msg):
    sid = msg["series_id"]
    if not SERIES_ID.match(sid):
        connection.send_error(msg["id"], "invalid_id", "invalid series id")
        return
    removed = await hass.async_add_executor_job(hass.data[DOMAIN]["series"].remove, sid)
    await _set_active(hass, sid, False)
    connection.send_result(msg["id"], {"removed": removed})
