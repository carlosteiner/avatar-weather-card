from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_config_get)
    websocket_api.async_register_command(hass, ws_public_config)
    websocket_api.async_register_command(hass, ws_config_set)
    websocket_api.async_register_command(hass, ws_images_list)
    websocket_api.async_register_command(hass, ws_image_delete)
    websocket_api.async_register_command(hass, ws_reference_get)
    websocket_api.async_register_command(hass, ws_reference_delete)


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
    d = hass.data[DOMAIN]
    m = await hass.async_add_executor_job(d["images"].listing)
    connection.send_result(msg["id"], m)


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
    images = await hass.async_add_executor_job(d["images"].listing)
    connection.send_result(msg["id"], {
        "weather_sources": cfg["weather_sources"], "options": cfg["options"], "special_days": cfg["special_days"],
        "holiday_calendar": cfg["holiday_calendar"], "extra_holidays": cfg["extra_holidays"], "images": images,
    })
