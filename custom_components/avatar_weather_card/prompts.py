"""The prompt file of a picture set: plain text divided into sections, each starting with a line "## NAME".

## STYLE, ## CHARACTER, ## POSE WEATHER and ## POSE MUSIC are shared by every picture; any other section is named after one
picture (## mild_rain_afternoon) and holds its scene. Text before the first section is ignored. The panel assembles the prompts;
the server only checks and keeps the file (frontend/prompts.js has the same parser).
"""
from __future__ import annotations

import re

SHARED = ("STYLE", "CHARACTER", "POSE WEATHER", "POSE MUSIC")
MAX_BYTES = 512 * 1024
MAX_SCENES = 2000
_HEAD = re.compile(r"^##\s+(.+?)\s*$")
_SCENE = re.compile(r"^[a-z0-9_]{1,120}$")


def parse(text: str) -> dict:
    """{"shared": {key: text}, "scenes": {name: text}, "bad": [headings not understood]}"""
    out: dict = {"shared": {}, "scenes": {}, "bad": []}
    cur, buf = None, []

    def flush() -> None:
        body = "\n".join(buf).strip()
        if cur is None:
            pass
        elif cur in SHARED:
            out["shared"][cur] = body
        elif _SCENE.match(cur):
            out["scenes"][cur] = body
        else:
            out["bad"].append(cur)
        buf.clear()

    for line in str(text).replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        m = _HEAD.match(line)
        if m:
            flush()
            h = m.group(1)
            up = " ".join(h.upper().split())
            cur = up if up in SHARED else h.lower()
        else:
            buf.append(line)
    flush()
    return out


def check(text: str) -> dict:
    """Validate a prompt file before it is kept. Returns a summary; raises ValueError with a message for the user."""
    if not isinstance(text, str):
        raise ValueError("the prompt file must be text")
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValueError(f"the prompt file is too large (max {MAX_BYTES // 1024} KB)")
    p = parse(text)
    if not p["shared"] and not p["scenes"]:
        raise ValueError("no sections found: every section starts with a line like “## STYLE” or “## mild_rain_afternoon”")
    if p["bad"]:
        raise ValueError("these section names are not understood: " + ", ".join(p["bad"][:8])
                         + " (use STYLE, CHARACTER, POSE WEATHER, POSE MUSIC or a picture name in lowercase letters, digits and _)")
    if len(p["scenes"]) > MAX_SCENES:
        raise ValueError(f"too many sections (max {MAX_SCENES})")
    return {"shared": sorted(p["shared"]), "scenes": len(p["scenes"])}
