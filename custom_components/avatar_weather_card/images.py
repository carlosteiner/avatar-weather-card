"""Avatar image library: files + manifest in /config/avatar_weather_card/characters."""
from __future__ import annotations

import io
import json
import re
import shutil
import time
import zipfile
from pathlib import Path

from PIL import Image

TEMPS = ["freezing", "cold", "chilly", "mild", "warm", "hot", "hotdry", "hothumid", "heatwave", "any"]
SKIES = ["clear", "cloudy", "wind", "fog", "rain", "storm", "hail", "sleet", "snow", "snowstorm", "fair", "any"]
MOMENTS = ["earlymorning", "morning", "midday", "afternoon", "goldenhour", "evening", "lateevening", "night", "day", "any"]
_SUFFIX = r"(_weekend)?(_\d+)?"
MAX_BYTES = 12 * 1024 * 1024


def valid_name(name: str, event_ids: list[str]) -> bool:
    """Humidity has two levels, humid and normal. Only a "humid" tag counts; no tag (or dry/normal) means normal."""
    t, s, m = "|".join(TEMPS), "|".join(SKIES), "|".join(MOMENTS)
    ev = "|".join(re.escape(e) for e in event_ids) or "(?!)"
    h = r"(_(humid|dry|normal))?"   # only "humid" has an effect; any other tag, or none, means normal
    pats = [rf"({t}){h}_({s})_({m}){_SUFFIX}", rf"music_({t}){h}_({m}){_SUFFIX}", rf"({ev})_({m})(_\d+)?"]
    return any(re.fullmatch(p, name) for p in pats)


def _row_widths(alpha: Image.Image) -> list[float]:
    """Width in px of the opaque part of every row."""
    a = alpha.point(lambda v: 255 if v > 128 else 0)
    w, h = a.size
    col = a.resize((1, h), Image.BOX)
    return [col.getpixel((0, y)) * w / 255.0 for y in range(h)]


def analyse(im: Image.Image) -> tuple[int, int, bool]:
    """Find the line of the soles and the standing point (x) of a cut-out figure, automatically.

    Generators put the figure on a low flat ellipse (the base). The soles rest on its upper surface:
    measured on 280 hand-measured pictures, soles = widest row of the base + 20% of the way down to its
    lowest edge (median error 13 px on a 900 px body). Without a base the soles are the bottom of the figure.
    Returns (feet_y, stand_x, has_base)."""
    alpha = im.getchannel("A")
    rw = _row_widths(alpha)
    ys = [y for y, v in enumerate(rw) if v > 0.5]
    if not ys:
        return im.height - 1, im.width // 2, False
    top, bot = ys[0], ys[-1]
    h = bot - top + 1
    cy = max(range(max(top, bot - int(0.22 * h)), bot + 1), key=lambda y: rw[y])
    seg = sorted(rw[max(top, bot - int(0.55 * h)): max(top + 1, bot - int(0.35 * h))])
    ref = seg[len(seg) // 2] if seg else rw[cy]
    has_base = rw[cy] > 1.5 * ref and rw[cy] > 0.45 * max(rw) and (bot - cy) > 0.012 * h
    if has_base:
        feet = int(round(cy + 0.2 * (bot - cy)))
        row = alpha.crop((0, cy, im.width, cy + 1)).point(lambda v: 255 if v > 128 else 0).getbbox()
        cx = (row[0] + row[2]) // 2 if row else im.width // 2
    else:
        feet = bot - 1
        bb = alpha.point(lambda v: 255 if v > 128 else 0).getbbox()
        cx = (bb[0] + bb[2]) // 2 if bb else im.width // 2
    return feet, cx, has_base


class ImageLibrary:
    def __init__(self, root: Path) -> None:
        self.dir = root / "characters"
        self.manifest_path = self.dir / "manifest.json"

    def _read(self) -> dict:
        try:
            return json.loads(self.manifest_path.read_text())
        except (OSError, ValueError):
            return {"body": 900, "slots": {}}

    def _write(self, m: dict) -> None:
        tmp = self.manifest_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(m, indent=1, sort_keys=True))
        tmp.replace(self.manifest_path)

    # --- all methods below are blocking: call through hass.async_add_executor_job
    def setup(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        if not self.manifest_path.exists():
            self._write({"body": 900, "slots": {}})
        self._reanalyse()

    def _reanalyse(self) -> None:
        """Pictures stored before automatic detection used the bottom of the image as the soles: fix their feetY (files untouched)."""
        m = self._read()
        changed = False
        for name, slot in m.get("slots", {}).items():
            if slot.get("auto") or slot.get("seated"):
                continue
            try:
                with Image.open(self.dir / f"{name}.webp") as im:
                    feet, _, has_base = analyse(im.convert("RGBA"))
            except Exception:  # noqa: BLE001
                continue
            if has_base:
                slot["feetY"] = feet
            slot["auto"] = 1
            changed = True
        if changed:
            self._write(m)

    def listing(self) -> dict:
        return self._read()

    def add(self, name: str, data: bytes, feet: int | None = None) -> dict:
        if len(data) > MAX_BYTES:
            raise ValueError("image too large (max 12 MB)")
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
        except Exception as err:  # noqa: BLE001
            raise ValueError("not a valid image") from err
        im = im.convert("RGBA")
        if im.width > 3000 or im.height > 3000:
            raise ValueError("image too large (max 3000 px per side)")
        alpha = im.getchannel("A")
        bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
        if bbox is None:
            raise ValueError("image is fully transparent: remove the background first")
        if alpha.getextrema()[0] > 250:
            raise ValueError("image has no transparency: remove the background first")
        # normalise automatically: crop the empty margin, find the soles and put the standing point in the middle
        pad = 3
        im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad)))
        auto_feet, cx, _ = analyse(im)
        shift = im.width // 2 - cx
        if abs(shift) > 2:
            canvas = Image.new("RGBA", (im.width + 2 * abs(shift), im.height), (0, 0, 0, 0))
            canvas.paste(im, (2 * shift if shift > 0 else 0, 0))
            im = canvas
        gray = im.convert("L")
        alpha = im.getchannel("A")
        px = [g for g, a in zip(gray.getdata(), alpha.getdata()) if a > 128]
        lum = round(sum(px) / max(1, len(px)), 1)
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self.dir / f"{name}.tmp"
        im.save(tmp, "WEBP", quality=88, alpha_quality=100, method=6)
        tmp.replace(self.dir / f"{name}.webp")
        m = self._read()
        m["slots"][name] = {"feetY": int(feet) if feet else auto_feet, "h": im.height, "w": im.width,
                            "lum": lum, "v": int(time.time()), "auto": 1}
        self._write(m)
        return m["slots"][name]

    def delete(self, name: str) -> bool:
        m = self._read()
        had = m["slots"].pop(name, None) is not None
        self._write(m)
        (self.dir / f"{name}.webp").unlink(missing_ok=True)
        return had


class ReferenceLibrary:
    """The user's reference picture of the avatar (one per installation), kept as uploaded."""

    FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}

    def __init__(self, root: Path) -> None:
        self.dir = root / "reference"

    def setup(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)

    def _find(self) -> Path | None:
        for ext in self.FORMATS.values():
            p = self.dir / f"reference.{ext}"
            if p.exists():
                return p
        return None

    def info(self) -> dict | None:
        p = self._find()
        if not p:
            return None
        try:
            with Image.open(p) as im:
                w, h = im.size
        except Exception:  # noqa: BLE001
            return None
        return {"file": p.name, "w": w, "h": h, "v": int(p.stat().st_mtime), "bytes": p.stat().st_size}

    def save(self, data: bytes) -> dict:
        if len(data) > MAX_BYTES:
            raise ValueError("image too large (max 12 MB)")
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
        except Exception as err:  # noqa: BLE001
            raise ValueError("not a valid image") from err
        ext = self.FORMATS.get(im.format or "")
        if not ext:
            raise ValueError("use a PNG, JPEG or WebP image")
        if im.width > 4000 or im.height > 4000:
            raise ValueError("image too large (max 4000 px per side)")
        self.dir.mkdir(parents=True, exist_ok=True)
        self.delete()
        tmp = self.dir / "reference.tmp"
        tmp.write_bytes(data)          # the original bytes: nothing is re-encoded
        tmp.replace(self.dir / f"reference.{ext}")
        return self.info()

    def delete(self) -> bool:
        had = False
        for ext in self.FORMATS.values():
            p = self.dir / f"reference.{ext}"
            if p.exists():
                p.unlink()
                had = True
        return had


# --------------------------------------------------------------------------------------------------------------
# Picture series: a set of pictures (a zip with a series.json) installed next to the user's own pictures.
# The user's pictures always win over a series picture of the same name.

SERIES_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
MAX_SERIES_BYTES = 150 * 1024 * 1024      # the zip
MAX_SERIES_UNPACKED = 400 * 1024 * 1024   # all pictures together, after unpacking
MAX_SERIES_FILES = 700
_META_TEXT = {"name": 80, "description": 500, "author": 80, "license": 80, "version": 40, "source": 200, "attribution": 300, "character": 600, "models": 300}


def _lum(im: Image.Image) -> float:
    gray, alpha = im.convert("L"), im.getchannel("A")
    px = [g for g, a in zip(gray.getdata(), alpha.getdata()) if a > 128]
    return round(sum(px) / max(1, len(px)), 1)


class SeriesLibrary:
    """Installed series live in <root>/series/<id>/ (the pictures and a series.json with their measures)."""

    def __init__(self, root: Path) -> None:
        self.dir = root / "series"
        self.incoming = root / "incoming"   # zips dropped here by hand can be installed from the panel

    def setup(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        self.incoming.mkdir(parents=True, exist_ok=True)

    def _meta(self, sid: str) -> dict | None:
        try:
            return json.loads((self.dir / sid / "series.json").read_text())
        except (OSError, ValueError):
            return None

    @staticmethod
    def id_of(data: bytes) -> str:
        """The id written in the series.json of a zip."""
        try:
            return str(json.loads(zipfile.ZipFile(io.BytesIO(data)).read("series.json")).get("id", ""))
        except (KeyError, ValueError, zipfile.BadZipFile) as err:
            raise ValueError("not a valid series zip (series.json missing)") from err

    def installed(self) -> dict:
        out = {}
        if not self.dir.is_dir():
            return out
        for d in sorted(self.dir.iterdir()):
            if not d.is_dir() or not SERIES_ID.match(d.name):
                continue
            m = self._meta(d.name)
            if m:
                out[d.name] = {k: m.get(k, "") for k in ("name", "version", "description", "author", "license", "attribution", "installed_at")}
                out[d.name]["count"] = len(m.get("slots", {}))
        return out

    def slots(self, sid: str) -> dict:
        m = self._meta(sid)
        return (m or {}).get("slots", {})

    def incoming_files(self) -> list[dict]:
        if not self.incoming.is_dir():
            return []
        return [{"file": p.name, "bytes": p.stat().st_size} for p in sorted(self.incoming.glob("*.zip"))]

    def install(self, sid: str, data: bytes, event_ids: list[str]) -> dict:
        """Validate a series zip and install it as <sid>. Raises ValueError with a message for the user."""
        if not SERIES_ID.match(sid or ""):
            raise ValueError("invalid series id")
        if len(data) > MAX_SERIES_BYTES:
            raise ValueError("series too large")
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile as err:
            raise ValueError("not a valid zip file") from err
        infos = zf.infolist()
        if len(infos) > MAX_SERIES_FILES:
            raise ValueError("too many files in the series")
        if sum(i.file_size for i in infos) > MAX_SERIES_UNPACKED:
            raise ValueError("series too large once unpacked")
        try:
            meta_in = json.loads(zf.read("series.json"))
        except (KeyError, ValueError) as err:
            raise ValueError("series.json is missing or not valid") from err
        if not isinstance(meta_in, dict):
            raise ValueError("series.json must be an object")
        if meta_in.get("id") != sid:
            raise ValueError(f"series.json id ({meta_in.get('id')!r}) does not match {sid!r}")
        given = meta_in.get("slots") if isinstance(meta_in.get("slots"), dict) else {}
        tmp = self.dir / f"{sid}.tmp-{int(time.time())}"
        slots, skipped = {}, 0
        try:
            tmp.mkdir(parents=True)
            for info in infos:
                name = info.filename
                if "/" in name or "\\" in name or name.startswith(".") or not name.endswith(".webp"):
                    if name != "series.json":
                        skipped += 1
                    continue
                slot = name[:-5]
                if not valid_name(slot, event_ids):
                    skipped += 1
                    continue
                if info.file_size > MAX_BYTES:
                    raise ValueError(f"{name}: picture too large")
                raw = zf.read(info)
                try:
                    im = Image.open(io.BytesIO(raw))
                    im.load()
                except Exception as err:  # noqa: BLE001
                    raise ValueError(f"{name}: not a valid picture") from err
                im = im.convert("RGBA")
                if im.width > 3000 or im.height > 3000:
                    raise ValueError(f"{name}: picture too large (max 3000 px per side)")
                if im.getchannel("A").getextrema()[0] > 250:
                    raise ValueError(f"{name}: no transparency")
                feet = (given.get(slot) or {}).get("feetY")
                if not (isinstance(feet, int) and 0 < feet <= im.height):
                    feet = analyse(im)[0]
                (tmp / name).write_bytes(raw)
                slots[slot] = {"feetY": int(feet), "h": im.height, "w": im.width, "lum": _lum(im), "v": int(time.time())}
            if not slots:
                raise ValueError("the series has no usable pictures")
            meta = {"id": sid, "installed_at": int(time.time()), "slots": slots}
            for k, mx in _META_TEXT.items():
                v = meta_in.get(k, "")
                meta[k] = str(v)[:mx] if isinstance(v, (str, int, float)) else ""
            (tmp / "series.json").write_text(json.dumps(meta, indent=1, sort_keys=True))
            target = self.dir / sid
            if target.exists():
                shutil.rmtree(target)
            tmp.rename(target)
        finally:
            if tmp.exists():
                shutil.rmtree(tmp, ignore_errors=True)
        return {"id": sid, "name": meta["name"], "version": meta["version"], "count": len(slots), "skipped": skipped}

    def remove(self, sid: str) -> bool:
        if not SERIES_ID.match(sid or ""):
            return False
        target = self.dir / sid
        if target.is_dir():
            shutil.rmtree(target)
            return True
        return False


def merged_listing(user: dict, series: SeriesLibrary, active: list[str], images_url: str, series_url: str) -> dict:
    """The pictures the card and the panel see: the active series first, then the user's own on top. Every slot carries
    `u` (where the picture is served from) and, for series pictures, `series` (the id)."""
    slots: dict = {}
    for sid in active:
        for name, s in series.slots(sid).items():
            slots.setdefault(name, {**s, "u": f"{series_url}/{sid}/{name}.webp", "series": sid})
    for name, s in user.get("slots", {}).items():
        slots[name] = {**s, "u": f"{images_url}/{name}.webp"}
    return {"body": user.get("body", 900), "slots": slots}
