"""Global configuration storage (one per installation)."""
from __future__ import annotations

import re
from copy import deepcopy

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

PROMPT_PARTS = ("character", "style", "pose", "background", "base", "noweather", "final")

STORAGE_VERSION = 1
DATE_RE = re.compile(r"^(\d{4}-)?\d{2}-\d{2}( \d{2}:\d{2})?$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
NAME_RE = re.compile(r"^[a-z0-9_]{1,32}$")

DEFAULTS = {
    "weather_sources": [],
    "options": {
        "wind_kmh": 25,
        "humid_pct": 65,
        "weekend_looks": True,
        "rotate_minutes": 60,
        "moments": {"EARLYMORNING": "05:00", "MORNING": "08:30", "MIDDAY": "12:00",
                    "AFTERNOON": "15:00", "LATEEVENING": "22:00", "NIGHT": "01:00"},
        "free_moments_enabled": False,   # different times on weekends and holidays
        "moments_free": {"EARLYMORNING": "05:00", "MORNING": "08:30", "MIDDAY": "12:00",
                         "AFTERNOON": "15:00", "LATEEVENING": "22:00", "NIGHT": "01:00"},
        "follow_dawn": False,            # morning starts at sunrise (+ offset) instead of the fixed time
        "dawn_offset": 0,
        "golden_minutes": 60,            # golden hour = this many minutes before sunset
        "sun_entity": "sun.sun",
        "temp_bands": {"heatwave": 35, "hot": 29, "warm": 23, "mild": 17, "chilly": 10, "cold": 2},
    },
    "avatar": {"description": "", "wardrobe": None, "colors": None, "activities": None, "prefs": {"style": "neutral", "day_shoes": "", "evening_shoes": "", "summer_shoes": "", "extra": "", "bg": "transparent", "bgColor": "#808080", "parts": {}}},     # optional free text about the character (the reference picture is the main source)
    "holiday_calendar": "",
    "extra_holidays": [],
    "special_days": [
        {"id": "halloween", "start": "10-31", "end": "10-31"},
        {"id": "xmas", "start": "12-25", "end": "12-25"},
        {"id": "newyear", "start": "12-31", "end": "12-31"},
    ],
    "series": {"catalog_url": ""},   # where the list of picture series comes from; empty = the default one
}


def validate(cfg: dict) -> dict:
    """Return a cleaned copy of cfg or raise ValueError."""
    out = deepcopy(DEFAULTS)
    src = cfg.get("weather_sources")
    if src is None:  # migrate v0.1 {weather_entities: [ids]}
        src = [{"entity": e, "weight": 1} for e in cfg.get("weather_entities", [])]
    if not isinstance(src, list):
        raise ValueError("weather_sources must be a list")
    clean, seen = [], set()
    for s_ in src:
        e, w = s_.get("entity", ""), s_.get("weight", 1)
        if not (isinstance(e, str) and e.startswith("weather.")) or e in seen:
            raise ValueError(f"invalid weather source: {s_}")
        if isinstance(w, bool) or not isinstance(w, (int, float)) or not 0 <= w <= 100:
            raise ValueError("weight must be a number between 0 and 100")
        seen.add(e)
        clean.append({"entity": e, "weight": w})
    out["weather_sources"] = clean
    op = cfg.get("options", {})
    if not isinstance(op, dict):
        raise ValueError("options must be an object")
    for k, lo, hi in (("wind_kmh", 1, 200), ("humid_pct", 1, 101)):
        v = op.get(k, DEFAULTS["options"][k])
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
            raise ValueError(f"{k} out of range")
        out["options"][k] = v
    out["options"].pop("dry_pct", None)   # no dry level any more (2026-11-02)
    out["options"]["weekend_looks"] = bool(op.get("weekend_looks", True))
    rm = op.get("rotate_minutes", 60)
    if isinstance(rm, bool) or not isinstance(rm, (int, float)) or not 1 <= rm <= 1440:
        raise ValueError("rotate_minutes out of range")
    out["options"]["rotate_minutes"] = rm
    for key, label in (("moments", "moments"), ("moments_free", "moments_free")):
        mo = op.get(key, {} if key == "moments" else None)
        if mo is None:   # free-day times default to the weekday ones
            mo = out["options"]["moments"]
        if not isinstance(mo, dict):
            raise ValueError(f"{label} must be an object")
        for k, dflt in DEFAULTS["options"]["moments"].items():
            v = mo.get(k, dflt)
            if not isinstance(v, str) or not TIME_RE.match(v):
                raise ValueError(f"{label} {k}: use HH:MM")
            out["options"][key][k] = v
        m = {k: int(v[:2]) * 60 + int(v[3:]) for k, v in out["options"][key].items()}
        if not (m["NIGHT"] < m["EARLYMORNING"] < m["MORNING"] < m["MIDDAY"] < m["AFTERNOON"] < m["LATEEVENING"]):
            raise ValueError(f"{label} must be in order: night < early morning < morning < midday < afternoon < late evening")
    out["options"]["free_moments_enabled"] = bool(op.get("free_moments_enabled", False))
    out["options"]["follow_dawn"] = bool(op.get("follow_dawn", False))
    for k, lo, hi in (("dawn_offset", -120, 240), ("golden_minutes", 10, 180)):
        v = op.get(k, DEFAULTS["options"][k])
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
            raise ValueError(f"{k}: number between {lo} and {hi}")
        out["options"][k] = v
    se = op.get("sun_entity", "sun.sun")
    if not isinstance(se, str) or not re.match(r"^sun\.[a-z0-9_]+$", se):
        raise ValueError("sun_entity must be a sun.* entity id")
    out["options"]["sun_entity"] = se
    tb = op.get("temp_bands", {})
    if not isinstance(tb, dict):
        raise ValueError("temp_bands must be an object")
    for k, dflt in DEFAULTS["options"]["temp_bands"].items():
        v = tb.get(k, dflt)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not -50 <= v <= 60:
            raise ValueError(f"temp band {k}: number between -50 and 60")
        out["options"]["temp_bands"][k] = v
    t = out["options"]["temp_bands"]
    if not (t["heatwave"] > t["hot"] > t["warm"] > t["mild"] > t["chilly"] > t["cold"]):
        raise ValueError("temperature thresholds must decrease: heatwave > hot > warm > mild > chilly > cold")
    av = cfg.get("avatar", {})
    if not isinstance(av, dict):
        raise ValueError("avatar must be an object")
    desc = av.get("description", "")
    if not isinstance(desc, str) or len(desc) > 1500:
        raise ValueError("avatar description: text up to 1500 characters")
    out["avatar"]["description"] = desc.strip()
    wd = av.get("wardrobe")   # list of ticked wardrobe option ids, or None = the defaults
    if wd is not None:
        if not isinstance(wd, list) or len(wd) > 400 or not all(isinstance(i, str) and re.match(r"^[a-z0-9_]{1,40}$", i) for i in wd):
            raise ValueError("wardrobe must be a list of option ids")
        wd = list(dict.fromkeys(wd))
    out["avatar"]["wardrobe"] = wd
    co = av.get("colors")   # list of ticked colour ids, or None = the defaults
    if co is not None:
        if not isinstance(co, list) or len(co) > 80 or not all(isinstance(i, str) and re.match(r"^[a-z0-9_]{1,40}$", i) for i in co):
            raise ValueError("colors must be a list of colour ids")
        co = list(dict.fromkeys(co))
    out["avatar"]["colors"] = co
    ac = av.get("activities")   # list of ticked weekend-activity ids, or None = the defaults
    if ac is not None:
        if not isinstance(ac, list) or len(ac) > 80 or not all(isinstance(i, str) and re.match(r"^[a-z0-9_]{1,40}$", i) for i in ac):
            raise ValueError("activities must be a list of activity ids")
        ac = list(dict.fromkeys(ac))
    out["avatar"]["activities"] = ac
    pr = av.get("prefs", {})
    if not isinstance(pr, dict):
        raise ValueError("avatar prefs must be an object")
    if pr.get("style", "neutral") not in ("neutral", "feminine", "masculine"):
        raise ValueError("wardrobe style must be neutral, feminine or masculine")
    out["avatar"]["prefs"]["style"] = pr.get("style", "neutral")
    for k, mx in (("day_shoes", 120), ("evening_shoes", 120), ("summer_shoes", 120), ("extra", 500)):
        v = pr.get(k, "")
        if not isinstance(v, str) or len(v) > mx:
            raise ValueError(f"prefs {k}: text up to {mx} characters")
        out["avatar"]["prefs"][k] = v.strip()
    if pr.get("bg", "transparent") not in ("transparent", "solid"):
        raise ValueError("background must be transparent or solid")
    out["avatar"]["prefs"]["bg"] = pr.get("bg", "transparent")
    bc = pr.get("bgColor", "#808080")
    if not (isinstance(bc, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", bc)):
        raise ValueError("background colour must look like #808080")
    out["avatar"]["prefs"]["bgColor"] = bc.upper()
    parts = pr.get("parts", {})   # the fixed sections of every prompt, as edited by the user (empty = built-in text)
    if not isinstance(parts, dict):
        raise ValueError("prompt parts must be an object")
    clean = {}
    for k, v in parts.items():
        if k not in PROMPT_PARTS:
            raise ValueError(f"unknown prompt part {k}")
        if not isinstance(v, str) or len(v) > 4000:
            raise ValueError(f"prompt part {k}: text up to 4000 characters")
        if v.strip():
            clean[k] = v.strip()
    out["avatar"]["prefs"]["parts"] = clean
    cal = cfg.get("holiday_calendar", "")
    if cal and not (isinstance(cal, str) and cal.startswith("calendar.")):
        raise ValueError("holiday_calendar must be a calendar.* id")
    out["holiday_calendar"] = cal
    eh = cfg.get("extra_holidays", [])
    if not isinstance(eh, list) or not all(isinstance(d, str) and re.match(r"^(\d{4}-)?\d{2}-\d{2}$", d) for d in eh):
        raise ValueError("extra_holidays must be MM-DD or YYYY-MM-DD strings")
    out["extra_holidays"] = eh
    sd = cfg.get("special_days", [])
    if not isinstance(sd, list):
        raise ValueError("special_days must be a list")
    days, seen = [], set()
    for d in sd:
        i, s, e = d.get("id", ""), d.get("start", ""), d.get("end", "")
        if not NAME_RE.match(i) or i in seen or not DATE_RE.match(s) or not DATE_RE.match(e):
            raise ValueError(f"invalid special day: {d}")
        seen.add(i)
        days.append({"id": i, "start": s, "end": e})
    out["special_days"] = days
    se = cfg.get("series", {})
    if not isinstance(se, dict):
        raise ValueError("series must be an object")
    url = se.get("catalog_url", "")
    if url and not (isinstance(url, str) and re.match(r"^https://\S{4,280}$", url)):
        raise ValueError("series.catalog_url must be an https address")
    out["series"] = {"catalog_url": url}   # an old "active" list from earlier versions is dropped
    return out


class ConfigStore:
    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, DOMAIN)
        self.config = deepcopy(DEFAULTS)

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            try:
                self.config = validate(data)
            except ValueError:
                self.config = deepcopy(DEFAULTS)

    async def async_save(self, cfg: dict) -> dict:
        self.config = validate(cfg)
        await self._store.async_save(self.config)
        return self.config
