from __future__ import annotations

import json

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .images import valid_name
from .sets import MAX_SERIES_BYTES, SLOT_FILE, SetExists


class UploadView(HomeAssistantView):
    url = "/api/avatar_weather_card/upload"
    name = "api:avatar_weather_card:upload"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("Admin required", 403)
        data = self.hass.data[DOMAIN]
        name, feet, blob, sid, tol, orig, params = None, None, None, None, 50, None, None
        reader = await request.multipart()
        async for part in reader:
            if part.name == "set":
                sid = (await part.text()).strip()
            elif part.name == "name":
                name = (await part.text()).strip()
            elif part.name == "feet":
                t = (await part.text()).strip()
                feet = int(t) if t.isdigit() else None
            elif part.name == "tolerance":
                t = (await part.text()).strip()
                tol = int(t) if t.isdigit() and 0 <= int(t) <= 100 else 50
            elif part.name == "original":
                orig = await part.read(decode=False)
            elif part.name == "params":
                try:
                    params = json.loads(await part.text())
                except ValueError:
                    params = None
            elif part.name == "file":
                blob = await part.read(decode=False)
        events = [d["id"] for d in data["store"].config["special_days"]]
        if not name or not valid_name(name, events):
            return self.json_message(f"Invalid picture name: {name}", 400)
        if not blob:
            return self.json_message("No file", 400)
        sets = data["sets"]
        sid = sid or data["store"].active_set     # pictures go to the active set unless another one is named
        try:
            lib = await self.hass.async_add_executor_job(sets.lib, sid)
            slot = await self.hass.async_add_executor_job(lib.add, name, blob, feet, tol, orig or None, params)
        except ValueError as err:
            return self.json_message(str(err), 400)
        return self.json({"name": name, "set": sid, "slot": slot})


class OriginalView(HomeAssistantView):
    """The picture as it was uploaded (with its background), for editing the cut in the panel. Admin only."""
    url = "/api/avatar_weather_card/original"
    name = "api:avatar_weather_card:original"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request) -> web.StreamResponse:
        if not request["hass_user"].is_admin:
            return self.json_message("Admin required", 403)
        data = self.hass.data[DOMAIN]
        sid = request.query.get("set") or data["store"].active_set
        try:
            lib = await self.hass.async_add_executor_job(data["sets"].lib, sid)
        except ValueError:
            return self.json_message("Set not found", 404)
        found = await self.hass.async_add_executor_job(lib.original, request.query.get("name", ""))
        if not found:
            return self.json_message("No original", 404)
        return web.Response(body=found[0], content_type=found[1], headers={"Cache-Control": "no-store"})


_PICTURE_CACHE = {"Cache-Control": "private, max-age=86400"}   # the ?v= of the URL changes whenever a picture does


class PictureView(HomeAssistantView):
    """A picture of a set, for any logged-in user (the card). Replaces the old unauthenticated static path."""
    url = "/api/avatar_weather_card/image/{sid}/{name}"
    extra_urls = ["/api/avatar_weather_card/image/{name}"]      # no set named: the active set
    name = "api:avatar_weather_card:image"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, name: str, sid: str = "") -> web.StreamResponse:
        data = self.hass.data[DOMAIN]
        sid = sid or data["store"].active_set
        slot = name[:-5] if name.endswith(".webp") else ""
        if not SLOT_FILE.match(slot):
            return self.json_message("Invalid picture name", 400)
        try:
            lib = await self.hass.async_add_executor_job(data["sets"].lib, sid)
        except ValueError:
            return self.json_message("Set not found", 404)
        path = lib.dir / f"{slot}.webp"
        if not await self.hass.async_add_executor_job(path.is_file):
            return self.json_message("Picture not found", 404)
        return web.FileResponse(path, headers=_PICTURE_CACHE)


class BackupDownloadView(HomeAssistantView):
    """Download one backup zip (admin only; the backups folder is never served as static files)."""
    url = "/api/avatar_weather_card/backup/{bid}"
    name = "api:avatar_weather_card:backup"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, bid: str) -> web.StreamResponse:
        if not request["hass_user"].is_admin:
            return self.json_message("Admin required", 403)
        sets = self.hass.data[DOMAIN]["sets"]
        try:
            path = await self.hass.async_add_executor_job(sets.backup_file, bid)
        except ValueError:
            return self.json_message("Invalid backup id", 400)
        if path is None:
            return self.json_message("Backup not found", 404)
        return web.FileResponse(path, headers={"Content-Disposition": f'attachment; filename="avatar-weather-backup-{bid}.zip"'})


class SetExportView(HomeAssistantView):
    """Download a set as a series zip: to keep it, to move it to another installation or to share it (admin only)."""
    url = "/api/avatar_weather_card/set/{sid}/export"
    name = "api:avatar_weather_card:set_export"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, sid: str) -> web.StreamResponse:
        if not request["hass_user"].is_admin:
            return self.json_message("Admin required", 403)
        sets = self.hass.data[DOMAIN]["sets"]
        try:
            blob = await self.hass.async_add_executor_job(lambda: sets.export(sid) if sets.exists(sid) else None)
        except ValueError as err:
            return self.json_message(str(err), 400)
        if blob is None:
            return self.json_message("Set not found", 404)
        return web.Response(body=blob, content_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{sid}.zip"'})


class SetImportView(HomeAssistantView):
    """Install a set from a series zip uploaded from the browser. Form fields: file, replace (1/0), backup (1/0)."""
    url = "/api/avatar_weather_card/set_import"
    name = "api:avatar_weather_card:set_import"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("Admin required", 403)
        data = self.hass.data[DOMAIN]
        blob, replace, backup = None, False, True
        reader = await request.multipart()
        async for part in reader:
            if part.name == "replace":
                replace = (await part.text()).strip() == "1"
            elif part.name == "backup":
                backup = (await part.text()).strip() != "0"
            elif part.name == "file":
                blob = bytearray()
                while chunk := await part.read_chunk(65536):
                    blob += chunk
                    if len(blob) > MAX_SERIES_BYTES:
                        return self.json_message("File too large", 400)
        if not blob:
            return self.json_message("No file", 400)
        events = [d["id"] for d in data["store"].config["special_days"]]
        try:
            result = await self.hass.async_add_executor_job(
                lambda: data["sets"].install(bytes(blob), events, replace=replace, backup=backup))
        except SetExists as err:
            return self.json({"error": "exists", "set": err.sid, "message": str(err)}, status_code=409)
        except ValueError as err:
            return self.json_message(str(err), 400)
        return self.json(result)
