"""Avatar image library: files + manifest in /config/avatar_weather_card/characters."""
from __future__ import annotations

import io
import json
import re
import shutil
import time
import zipfile
from pathlib import Path

from PIL import Image, ImageChops

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


def normalise(im: Image.Image) -> Image.Image:
    """Crop the empty margin and put the standing point in the middle, so all pictures line up. RGBA in, RGBA out."""
    bbox = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    if bbox is None:
        raise ValueError("image is fully transparent")
    pad = 3
    im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad)))
    cx = analyse(im)[1]
    shift = im.width // 2 - cx
    if abs(shift) > 2:
        canvas = Image.new("RGBA", (im.width + 2 * abs(shift), im.height), (0, 0, 0, 0))
        canvas.paste(im, (2 * shift if shift > 0 else 0, 0))
        im = canvas
    return im


def remove_background(im: Image.Image) -> Image.Image:
    """Make a plain background (grey, white... any single colour) transparent. `im` is RGBA and opaque.
    The background colour is the one of the picture's border; only the area connected to the border goes (grey inside the figure stays),
    the edge is softened and its colour cleaned of the grey halo. ValueError when the border is not one plain colour."""
    w, h = im.size
    rgb = im.convert("RGB")
    px = rgb.load()
    step_x, step_y = max(1, w // 200), max(1, h // 200)
    border = [px[x, y] for x in range(0, w, step_x) for y in (0, h - 1)] + [px[x, y] for y in range(0, h, step_y) for x in (0, w - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    near = sum(1 for c in border if max(abs(c[i] - bg[i]) for i in range(3)) <= 24)
    if near < 0.85 * len(border):
        raise ValueError("the background is not one plain colour: remove it first (or use a picture with a transparent background)")
    T1, T2 = 12, 40                                         # difference from the background: up to T1 fully gone, over T2 fully kept
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg))
    d = ImageChops.lighter(ImageChops.lighter(diff.getchannel("R"), diff.getchannel("G")), diff.getchannel("B"))
    # every pixel of the background colour goes, wherever it is (also between the legs and the arms), with a small tolerance
    alpha = d.point(lambda v: 0 if v <= T1 else 255 if v >= T2 else int((v - T1) * 255 / (T2 - T1)))
    # the semi-transparent edge pixels still carry some background colour: take it out (c = (c - bg*(1-a)) / a)
    ab, data = alpha.tobytes(), bytearray(rgb.tobytes())
    for i in (j for j, v in enumerate(ab) if 0 < v < 255):
        a = ab[i] / 255.0
        for c in range(3):
            data[i * 3 + c] = max(0, min(255, int((data[i * 3 + c] - bg[c] * (1 - a)) / a)))
    out = Image.frombytes("RGB", (w, h), bytes(data)).convert("RGBA")
    out.putalpha(alpha)
    return out


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
    def __init__(self, folder: Path) -> None:
        """`folder` is the folder of one picture set: <name>.webp files and a manifest.json."""
        self.dir = folder
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
        if im.getchannel("A").getextrema()[0] > 250:     # no transparency: a plain background (grey #808080, white...) is removed here
            im = remove_background(im)
        try:
            im = normalise(im)                           # crop the empty margin, put the standing point in the middle
        except ValueError as err:
            raise ValueError("image is fully transparent: remove the background first") from err
        auto_feet = analyse(im)[0]
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

    def replace_all(self, src: Path, slots: dict, body: int | None = None) -> None:
        """Replace the whole set with the pictures in `src` (<name>.webp for every slot): the old ones are deleted. Blocking."""
        self.dir.mkdir(parents=True, exist_ok=True)
        m = self._read()
        for name in slots:                                   # the new pictures first, so a failure never leaves the library empty
            shutil.copyfile(src / f"{name}.webp", self.dir / f"{name}.tmp")
            (self.dir / f"{name}.tmp").replace(self.dir / f"{name}.webp")
        for f in self.dir.glob("*.webp"):
            if f.stem not in slots:
                f.unlink()
        self._write({"body": body or m.get("body", 900), "slots": slots})

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
