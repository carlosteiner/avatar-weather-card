from __future__ import annotations

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .images import valid_name


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
        name, feet, blob = None, None, None
        reader = await request.multipart()
        async for part in reader:
            if part.name == "name":
                name = (await part.text()).strip()
            elif part.name == "feet":
                t = (await part.text()).strip()
                feet = int(t) if t.isdigit() else None
            elif part.name == "file":
                blob = await part.read(decode=False)
        events = [d["id"] for d in data["store"].config["special_days"]]
        if not name or not valid_name(name, events):
            return self.json_message(f"Invalid picture name: {name}", 400)
        if not blob:
            return self.json_message("No file", 400)
        try:
            slot = await self.hass.async_add_executor_job(data["images"].add, name, blob, feet)
        except ValueError as err:
            return self.json_message(str(err), 400)
        return self.json({"name": name, "slot": slot})


class ReferenceUploadView(HomeAssistantView):
    url = "/api/avatar_weather_card/reference"
    name = "api:avatar_weather_card:reference"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return self.json_message("Admin required", 403)
        blob = None
        reader = await request.multipart()
        async for part in reader:
            if part.name == "file":
                blob = await part.read(decode=False)
        if not blob:
            return self.json_message("No file", 400)
        try:
            info = await self.hass.async_add_executor_job(self.hass.data[DOMAIN]["reference"].save, blob)
        except ValueError as err:
            return self.json_message(str(err), 400)
        return self.json(info)
