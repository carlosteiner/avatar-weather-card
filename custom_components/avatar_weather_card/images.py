"""Avatar image library: files + manifest in /config/avatar_weather_card/characters."""
from __future__ import annotations

import io
import json
import re
import shutil
import time
import zipfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

TEMPS = ["freezing", "cold", "chilly", "mild", "warm", "hot", "hotdry", "hothumid", "heatwave", "any"]
SKIES = ["clear", "cloudy", "wind", "fog", "rain", "storm", "hail", "sleet", "snow", "snowstorm", "fair", "any"]
MOMENTS = ["earlymorning", "morning", "midday", "afternoon", "goldenhour", "evening", "lateevening", "night", "day", "any"]
_SUFFIX = r"(_weekend)?(_\d+)?"
MAX_BYTES = 12 * 1024 * 1024


def _clean_bg(params: dict | None) -> dict:
    """The background-removal settings kept with an original: colour "#rrggbb" (empty = detect it), tolerance and gap size 0..100."""
    p = params if isinstance(params, dict) else {}
    col = str(p.get("color", ""))
    num = lambda k, d: max(0, min(100, int(p[k]))) if isinstance(p.get(k), (int, float)) and not isinstance(p.get(k), bool) else d
    return {"color": col if re.fullmatch(r"#[0-9a-fA-F]{6}", col) else "", "tol": num("tol", 50), "hole": num("hole", 15)}


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


DEFAULT_TOLERANCE = 50          # 0..100: how far from the background colour a pixel may be and still count as background


def remove_background(im: Image.Image, tolerance: int = DEFAULT_TOLERANCE) -> Image.Image:
    """Make a plain background (grey, white... any single colour) transparent. `im` is RGBA and opaque.
    The background colour is the one of the top edge and of the upper part of the sides. Only what is connected to the edge goes,
    plus the closed gaps of background between legs and arms when they are big enough: a grey-ish detail of the figure (coat, shadow,
    nail varnish) stays. The edge is softened and its colour cleaned of the background halo.
    `tolerance` 0..100 (50 = default): higher removes more of the colours near the background, lower keeps more.
    ValueError when the edge is not one plain colour, or when the ground reaches both sides of the picture."""
    w, h = im.size
    rgb = im.convert("RGB")
    px = rgb.load()
    up = int(h * 0.6)
    sx, sy = max(1, w // 200), max(1, h // 200)
    border = [px[x, 0] for x in range(0, w, sx)] + [px[x, y] for y in range(0, up, sy) for x in (0, w - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    near = sum(1 for c in border if max(abs(c[i] - bg[i]) for i in range(3)) <= 24)
    if near < 0.85 * len(border):
        raise ValueError("the background is not one plain colour: remove it first (or use a picture with a transparent background)")
    k = max(0.1, min(100, int(tolerance))) / 50.0
    lo = max(2.0, 14.0 * k)                                  # up to `lo` away from the background: fully gone
    hi = max(lo + 4.0, 36.0 * k)                             # over `hi` away: fully kept, in between a soft edge
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg))
    d = ImageChops.lighter(ImageChops.lighter(diff.getchannel("R"), diff.getchannel("G")), diff.getchannel("B"))
    # 1. the background region: pixels close to the colour AND connected to the edge
    reg = d.point(lambda v: 255 if v < hi else 0)
    seeds = [(x, 0) for x in range(0, w, 8)] + [(x, y) for y in range(0, up, 8) for x in (0, w - 1)]
    for sd in seeds:
        if reg.getpixel(sd) == 255:
            ImageDraw.floodfill(reg, sd, 128)
    gone = reg.point(lambda v: 255 if v == 128 else 0)
    # 2. closed gaps (between legs and arms): clearly background-coloured, big enough, not touching the edge.
    #    The thin fringes along the figure are shaved off first, so only the real gaps are left to look at.
    cand = ImageChops.multiply(d.point(lambda v: 255 if v < lo else 0), reg.point(lambda v: 255 if v == 255 else 0))
    core = cand.filter(ImageFilter.MinFilter(7))
    need = max(20, int(w * h * 0.0003) // 4)
    for _ in range(400):
        bb = core.getbbox()
        if bb is None:
            break
        row = core.crop((0, bb[1], w, bb[1] + 1)).getbbox()          # the first row of the mask has at least one pixel
        ImageDraw.floodfill(core, (row[0], bb[1]), 128)
        part = core.point(lambda v: 255 if v == 128 else 0)
        if part.histogram()[255] >= need:
            gone = ImageChops.lighter(gone, ImageChops.multiply(part.filter(ImageFilter.MaxFilter(7)), cand))
        core = core.point(lambda v: 255 if v == 255 else 0)
    # 3. alpha: inside the region a ramp by the distance from the colour, everywhere else fully opaque
    ramp = d.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * 255 / (hi - lo)))
    zone = gone.filter(ImageFilter.MaxFilter(5))
    alpha = Image.composite(ramp, Image.new("L", (w, h), 255), zone)
    # the ground (snow, sand, paving) reaching both sides of the picture: the figure cannot be centred, refuse it
    if alpha.crop((0, int(h * 0.6), 2, h)).getextrema()[1] > 128 and alpha.crop((w - 2, int(h * 0.6), w, h)).getextrema()[1] > 128:
        raise ValueError("the ground reaches both sides of the picture: crop it to a small patch under the feet, or remove the background first")
    # 4. the semi-transparent edge pixels still carry some background colour: take it out (c = (c - bg*(1-a)) / a)
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
        # the pictures as uploaded (grey background), kept out of the served folder: <root>/originals/<set>/<name>.orig
        self.originals = folder.parent.parent / "originals" / folder.name

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

    def add(self, name: str, data: bytes, feet: int | None = None, tolerance: int = DEFAULT_TOLERANCE,
            original: bytes | None = None, params: dict | None = None) -> dict:
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
        if original is not None and len(original) > MAX_BYTES:
            raise ValueError("original too large (max 12 MB)")
        if im.getchannel("A").getextrema()[0] > 250:     # no transparency: a plain background (grey #808080, white...) is removed here
            if original is None:
                original, params = data, {}                # the picture as uploaded is kept, so the cut can be redone in the panel
            im = remove_background(im, tolerance)
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
        if original is not None:
            self.originals.mkdir(parents=True, exist_ok=True)
            (self.originals / f"{name}.orig").write_bytes(original)
            m["slots"][name]["orig"] = 1
            m["slots"][name]["bg"] = _clean_bg(params)
        else:
            (self.originals / f"{name}.orig").unlink(missing_ok=True)
        self._write(m)
        return m["slots"][name]

    def original(self, name: str) -> tuple[bytes, str] | None:
        """The picture as it was uploaded (with its background) and its media type, or None."""
        if not re.fullmatch(r"[a-z0-9_]+", name or ""):
            return None
        p = self.originals / f"{name}.orig"
        if not p.is_file():
            return None
        data = p.read_bytes()
        kind = "image/png" if data[:4] == b"\x89PNG" else "image/webp" if data[8:12] == b"WEBP" else "image/jpeg"
        return data, kind

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
        shutil.rmtree(self.originals, ignore_errors=True)     # the pictures are new: the old originals no longer belong to them
        self._write({"body": body or m.get("body", 900), "slots": slots})

    def delete(self, name: str) -> bool:
        m = self._read()
        had = m["slots"].pop(name, None) is not None
        self._write(m)
        (self.dir / f"{name}.webp").unlink(missing_ok=True)
        (self.originals / f"{name}.orig").unlink(missing_ok=True)
        return had
