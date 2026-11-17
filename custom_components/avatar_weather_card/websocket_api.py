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

from .const import DEFAULT_CATALOG_URL, DOMAIN
from .sets import MAX_SERIES_BYTES, SERIES_ID, META_TEXT, SetExists, SetLibrary

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
    websocket_api.async_register_command(hass, ws_backups_list)
    websocket_api.async_register_command(hass, ws_backup_create)
    websocket_api.async_register_command(hass, ws_backup_restore)
    websocket_api.async_register_command(hass, ws_backup_delete)
    websocket_api.async_register_command(hass, ws_sets_list)
    websocket_api.async_register_command(hass, ws_set_create)
    websocket_api.async_register_command(hass, ws_set_update)
    websocket_api.async_register_command(hass, ws_set_duplicate)
    websocket_api.async_register_command(hass, ws_set_delete)
    websocket_api.async_register_command(hass, ws_set_activate)
    websocket_api.async_register_command(hass, ws_prompts_get)
    websocket_api.async_register_command(hass, ws_prompts_set)


def _listing(hass: HomeAssistant, sid: str | None = None) -> dict:
    """The picture list of a set (the active one when `sid` is empty or unknown), as the card and the panel see it.
    Carries `set`, the id the pictures are served under (/avatar_weather_card_images/<set>/<name>.webp). Blocking: run in the executor."""
    d = hass.data[DOMAIN]
    sets: SetLibrary = d["sets"]
    sid = sid if sid and sets.exists(sid) else d["store"].active_set
    return {**sets.lib(sid).listing(), "set": sid, "set_name": sets.meta(sid)["name"]}


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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/images_list", vol.Optional("set", default=""): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_images_list(hass, connection, msg):
    connection.send_result(msg["id"], await hass.async_add_executor_job(_listing, hass, msg["set"]))


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/image_delete", vol.Required("name"): str, vol.Optional("set", default=""): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_image_delete(hass, connection, msg):
    d = hass.data[DOMAIN]
    sid = msg["set"] or d["store"].active_set
    try:
        lib = await hass.async_add_executor_job(d["sets"].lib, sid)
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    ok = await hass.async_add_executor_job(lib.delete, msg["name"])
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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/public_config", vol.Optional("set", default=""): str})
@websocket_api.async_response
async def ws_public_config(hass, connection, msg):
    """What the Lovelace card needs, for any logged-in user: weather sources, options, special days, holidays and the picture list.
    Nothing about the prompts. `set`: the picture set the card wants (default: the active one)."""
    d = hass.data[DOMAIN]
    cfg = d["store"].config
    images = await hass.async_add_executor_job(_listing, hass, msg["set"])
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


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_catalog"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_catalog(hass, connection, msg):
    """The sets on offer (from the catalog on the internet), the sets installed and the zips dropped in the incoming folder."""
    d = hass.data[DOMAIN]
    url = d["store"].config["series"]["catalog_url"] or DEFAULT_CATALOG_URL
    items, error = [], ""
    try:
        data = json.loads(await _download(hass, url, 1_000_000, 15))
        raw = data.get("series", []) if isinstance(data, dict) else []
        items = [c for c in (_clean_item(x) for x in raw[:50]) if c]
    except (aiohttp.ClientError, ValueError, TimeoutError) as err:
        error = str(err) or err.__class__.__name__
    sets = await hass.async_add_executor_job(d["sets"].listing)
    incoming = await hass.async_add_executor_job(d["sets"].incoming_files)
    connection.send_result(msg["id"], {"catalog": items, "error": error, "url": url, "sets": sets, "incoming": incoming})


def _install_error(connection, msg, err: ValueError) -> None:
    if isinstance(err, SetExists):
        connection.send_error(msg["id"], "exists", err.sid)
    else:
        connection.send_error(msg["id"], "install_failed", str(err) or err.__class__.__name__)


_INSTALL = {vol.Required("replace"): bool, vol.Required("backup"): bool}


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_install", vol.Required("series_id"): str, **_INSTALL})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_install(hass, connection, msg):
    """Download a set from the catalog, check it and install it as a new set. A set with the same id is replaced only when
    `replace` is true (and backed up first when `backup`); otherwise the error code is "exists"."""
    d = hass.data[DOMAIN]
    sid = msg["series_id"]
    url = d["store"].config["series"]["catalog_url"] or DEFAULT_CATALOG_URL
    try:
        data = json.loads(await _download(hass, url, 1_000_000, 15))
        item = next((c for c in (_clean_item(x) for x in data.get("series", [])[:50]) if c and c["id"] == sid), None)
        if not item or not item["zip_url"]:
            raise ValueError("set not found in the catalog")
        if await hass.async_add_executor_job(d["sets"].exists, sid) and not msg["replace"]:
            raise SetExists(sid)
        blob = await _download(hass, item["zip_url"], MAX_SERIES_BYTES, 300)
        if item["sha256"] and hashlib.sha256(blob).hexdigest() != item["sha256"]:
            raise ValueError("the downloaded file does not match the catalog (sha256)")
        events = [x["id"] for x in d["store"].config["special_days"]]
        result = await hass.async_add_executor_job(
            lambda: d["sets"].install(blob, events, replace=msg["replace"], backup=msg["backup"], expect_id=sid))
    except (aiohttp.ClientError, ValueError, TimeoutError) as err:
        if not isinstance(err, SetExists):
            _LOGGER.warning("Installing set %s failed: %s", sid, err)
        _install_error(connection, msg, err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/series_install_file", vol.Required("file"): str, **_INSTALL})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_series_install_file(hass, connection, msg):
    """Install a set from a zip dropped by hand in /config/avatar_weather_card/incoming/ (same rules as the catalog)."""
    d = hass.data[DOMAIN]
    name = msg["file"]
    sets: SetLibrary = d["sets"]
    if not re.fullmatch(r"[A-Za-z0-9._ -]{1,120}\.zip", name) or ".." in name:
        connection.send_error(msg["id"], "invalid_file", "invalid file name")
        return

    def work():
        path = sets.incoming / name
        if not path.is_file() or path.stat().st_size > MAX_SERIES_BYTES:
            raise ValueError("file not found or too large")
        return sets.install(path.read_bytes(), [x["id"] for x in d["store"].config["special_days"]], replace=msg["replace"], backup=msg["backup"])

    try:
        result = await hass.async_add_executor_job(work)
    except ValueError as err:
        _install_error(connection, msg, err)
        return
    connection.send_result(msg["id"], result)


# --- the sets ----------------------------------------------------------------------------------------------------

async def _call(hass, connection, msg, fn, *args, code="failed"):
    try:
        result = await hass.async_add_executor_job(fn, *args)
    except ValueError as err:
        connection.send_error(msg["id"], code, str(err))
        return None
    connection.send_result(msg["id"], result)
    return result


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/sets_list"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_sets_list(hass, connection, msg):
    d = hass.data[DOMAIN]
    sets = await hass.async_add_executor_job(d["sets"].listing)
    connection.send_result(msg["id"], {"sets": sets, "active": d["store"].active_set})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/set_create", vol.Required("name"): str, vol.Optional("description", default=""): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_create(hass, connection, msg):
    await _call(hass, connection, msg, hass.data[DOMAIN]["sets"].create, msg["name"], msg["description"])


_META_SCHEMA = {vol.Optional(k): str for k in META_TEXT}


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/set_update", vol.Required("set_id"): str, **_META_SCHEMA})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_update(hass, connection, msg):
    """Rename a set and edit its details (description, author, licence, attribution, version...)."""
    fields = {k: msg[k] for k in META_TEXT if k in msg}
    await _call(hass, connection, msg, hass.data[DOMAIN]["sets"].update, msg["set_id"], fields)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/set_duplicate", vol.Required("set_id"): str, vol.Optional("name", default=""): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_duplicate(hass, connection, msg):
    await _call(hass, connection, msg, hass.data[DOMAIN]["sets"].duplicate, msg["set_id"], msg["name"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/set_delete", vol.Required("set_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_delete(hass, connection, msg):
    """Delete a set for good (back it up first if you may want it back). The active set cannot be deleted."""
    d = hass.data[DOMAIN]
    if msg["set_id"] == d["store"].active_set:
        connection.send_error(msg["id"], "failed", "the active set cannot be deleted: make another set active first")
        return
    await _call(hass, connection, msg, lambda: {"deleted": d["sets"].delete(msg["set_id"])})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/set_activate", vol.Required("set_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_activate(hass, connection, msg):
    d = hass.data[DOMAIN]
    if not await hass.async_add_executor_job(d["sets"].exists, msg["set_id"]):
        connection.send_error(msg["id"], "failed", "set not found")
        return
    await d["store"].async_set_active(msg["set_id"])
    connection.send_result(msg["id"], {"active": msg["set_id"]})


# --- the prompt file of a set ------------------------------------------------------------------------------------

@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/prompts_get", vol.Optional("set", default=""): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_prompts_get(hass, connection, msg):
    """The prompt file of a set (default: the active one). `text` is "" when the set has none: the panel then uses the built-in file."""
    d = hass.data[DOMAIN]
    sid = msg["set"] or d["store"].active_set

    def work():
        text = d["sets"].prompts_get(sid)
        return {"set": sid, "text": text, "custom": bool(text)}

    await _call(hass, connection, msg, work, code="not_found")


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/prompts_set", vol.Optional("set", default=""): str, vol.Required("text"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_prompts_set(hass, connection, msg):
    """Save the prompt file of a set; empty text goes back to the built-in one."""
    d = hass.data[DOMAIN]
    sid = msg["set"] or d["store"].active_set
    await _call(hass, connection, msg, lambda: {"set": sid, **d["sets"].prompts_set(sid, msg["text"])}, code="invalid_prompts")


# --- backups of the sets -----------------------------------------------------------------------------------------

@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/backups_list"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backups_list(hass, connection, msg):
    await _call(hass, connection, msg, lambda: {"backups": hass.data[DOMAIN]["sets"].backups()}, code="backup_failed")


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/backup_create", vol.Required("set_id"): str,
                                  vol.Optional("name", default=""): str, vol.Optional("description", default=""): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_create(hass, connection, msg):
    await _call(hass, connection, msg, hass.data[DOMAIN]["sets"].backup_create, msg["set_id"], "manual backup", msg["name"], msg["description"],
                code="backup_failed")


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/backup_restore", vol.Required("backup_id"): str, vol.Required("backup_first"): bool, vol.Optional("as_new", default=False): bool})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_restore(hass, connection, msg):
    """Put a backup back as the set it was taken from: that set's pictures are replaced (`backup_first`: backed up before)."""
    await _call(hass, connection, msg, hass.data[DOMAIN]["sets"].backup_restore, msg["backup_id"], msg["backup_first"], msg["as_new"], code="backup_failed")


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/backup_delete", vol.Required("backup_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_delete(hass, connection, msg):
    await _call(hass, connection, msg, hass.data[DOMAIN]["sets"].backup_delete, msg["backup_id"], code="backup_failed")
