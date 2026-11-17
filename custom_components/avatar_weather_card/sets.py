"""Picture sets.

A *set* is a folder of pictures of one character: /config/avatar_weather_card/sets/<id>/ with the <slot>.webp files, a manifest.json
(soles line, size) and a set.json (name, description, author, licence...). Its prompt file (see prompts.py) is kept apart, in
/config/avatar_weather_card/prompts/<id>.txt, because the set folders are served to the browser without login. Several sets live side by side: one is the *active* one
(the one edited in the Images tab and uploaded to), the others can be used by single cards.

Sets can be installed from the catalog or from a zip (a "series zip": series.json + pictures), exported as the same zip to share,
and backed up (zips in /config/avatar_weather_card/backups/, one set per backup). Installing never touches any other set.
"""
from __future__ import annotations

import io
import json
import re
import shutil
import time
import zipfile
from pathlib import Path

from PIL import Image

from . import prompts as prompt_file
from .images import MAX_BYTES, ImageLibrary, analyse, normalise, remove_background, valid_name

SET_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
SERIES_ID = SET_ID                         # a catalog series id is the id of the set it is installed as
BACKUP_ID = re.compile(r"^\d{8}-\d{6}(-\d{1,3})?$")
SLOT_FILE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
MAX_SERIES_BYTES = 150 * 1024 * 1024      # the zip
MAX_SERIES_UNPACKED = 400 * 1024 * 1024   # all pictures together, after unpacking
MAX_SERIES_FILES = 700
MAX_BACKUPS = 20
MAX_SETS = 30
META_TEXT = {"name": 80, "description": 500, "author": 80, "license": 80, "version": 40, "source": 200,
             "attribution": 300, "character": 600, "models": 300}


class SetExists(ValueError):
    """Installing a set whose id is already taken, without permission to replace it."""

    def __init__(self, sid: str) -> None:
        super().__init__(f"you already have a set “{sid}”")
        self.sid = sid


def _lum(im: Image.Image) -> float:
    gray, alpha = im.convert("L"), im.getchannel("A")
    px = [g for g, a in zip(gray.getdata(), alpha.getdata()) if a > 128]
    return round(sum(px) / max(1, len(px)), 1)


def _clean_meta(src: dict) -> dict:
    out = {}
    for k, mx in META_TEXT.items():
        v = src.get(k, "")
        out[k] = " ".join(str(v).split())[:mx] if isinstance(v, (str, int, float)) and not isinstance(v, bool) else ""
    return out


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")[:36].strip("-")
    return s or "set"


class SetLibrary:
    """All the picture sets, their backups and the zips waiting in the incoming folder. Every method is blocking: call it through
    hass.async_add_executor_job."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.dir = root / "sets"
        self.backups_dir = root / "backups"
        self.incoming = root / "incoming"     # zips dropped here by hand can be installed from the panel
        self.prompts_dir = root / "prompts"   # <set id>.txt: the prompt file of each set (missing = the built-in one)

    # ---------------------------------------------------------------- setup
    def setup(self) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        self.incoming.mkdir(parents=True, exist_ok=True)
        self.prompts_dir.mkdir(parents=True, exist_ok=True)
        legacy = self.root / "characters"        # before sets there was one library: it becomes the set "default"
        if legacy.is_dir() and not (self.dir / "default").exists():
            legacy.rename(self.dir / "default")
            lib = ImageLibrary(self.dir / "default")
            old = lib.listing().get("series") or {}
            meta = _clean_meta(old if isinstance(old, dict) else {})
            meta["name"] = meta["name"] or "My pictures"
            m = lib.listing()
            if "series" in m:
                m.pop("series")
                lib._write(m)
            self._write_meta("default", meta)
        for sid in self.ids():
            ImageLibrary(self.dir / sid).setup()

    # ---------------------------------------------------------------- sets
    def ids(self) -> list[str]:
        return sorted(p.name for p in self.dir.iterdir() if p.is_dir() and SET_ID.match(p.name)) if self.dir.is_dir() else []

    def exists(self, sid: str) -> bool:
        return bool(SET_ID.match(sid or "")) and (self.dir / sid).is_dir()

    def lib(self, sid: str) -> ImageLibrary:
        if not self.exists(sid):
            raise ValueError("set not found")
        return ImageLibrary(self.dir / sid)

    def _meta_path(self, sid: str) -> Path:
        return self.dir / sid / "set.json"

    def meta(self, sid: str) -> dict:
        try:
            m = json.loads(self._meta_path(sid).read_text())
        except (OSError, ValueError):
            m = {}
        out = _clean_meta(m if isinstance(m, dict) else {})
        out["created"] = int(m.get("created", 0)) if isinstance(m, dict) and isinstance(m.get("created"), int) else 0
        if not out["name"]:
            out["name"] = sid
        return out

    def _write_meta(self, sid: str, meta: dict) -> None:
        data = {**_clean_meta(meta), "created": int(meta.get("created") or time.time())}
        tmp = self._meta_path(sid).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1, sort_keys=True))
        tmp.replace(self._meta_path(sid))

    # ---------------------------------------------------------------- the prompt file of a set
    def _prompts_path(self, sid: str) -> Path:
        if not SET_ID.match(sid or ""):
            raise ValueError("invalid set id")
        return self.prompts_dir / f"{sid}.txt"

    def prompts_get(self, sid: str) -> str:
        """The set's own prompt file, or "" when it has none (the panel then uses the built-in one)."""
        self.lib(sid)
        try:
            return self._prompts_path(sid).read_text(encoding="utf-8")
        except OSError:
            return ""

    def prompts_set(self, sid: str, text: str) -> dict:
        """Keep `text` as the set's prompt file; empty text removes it (back to the built-in one)."""
        self.lib(sid)
        path = self._prompts_path(sid)
        if not str(text).strip():
            path.unlink(missing_ok=True)
            return {"custom": False}
        summary = prompt_file.check(text)
        self.prompts_dir.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
        return {"custom": True, **summary}

    def _prompts_from_zip(self, z: zipfile.ZipFile) -> str | None:
        """The prompts.txt of a zip, checked; None when there is none or it is not usable."""
        try:
            info = z.getinfo("prompts.txt")
            if info.file_size > prompt_file.MAX_BYTES:
                return None
            text = z.read(info).decode("utf-8")
            prompt_file.check(text)
            return text
        except (KeyError, UnicodeDecodeError, ValueError):
            return None

    def info(self, sid: str) -> dict:
        lib = self.lib(sid)
        slots = lib.listing().get("slots", {})
        size = sum(p.stat().st_size for p in lib.dir.glob("*.webp"))
        return {"id": sid, **self.meta(sid), "count": len(slots), "bytes": size, "prompts": self._prompts_path(sid).is_file()}

    def listing(self) -> list[dict]:
        return [self.info(s) for s in self.ids()]

    def _new_id(self, wanted: str) -> str:
        base = slugify(wanted)
        sid, k = base, 1
        while (self.dir / sid).exists():
            k += 1
            sid = f"{base[:36]}-{k}"
        return sid

    def _check_room(self) -> None:
        if len(self.ids()) >= MAX_SETS:
            raise ValueError(f"too many sets ({MAX_SETS}): delete some first")

    def create(self, name: str, description: str = "", sid: str | None = None) -> dict:
        self._check_room()
        name = " ".join(str(name).split())[:80]
        if not name:
            raise ValueError("give the set a name")
        sid = sid or self._new_id(name)
        (self.dir / sid).mkdir(parents=True)
        ImageLibrary(self.dir / sid).setup()
        self._write_meta(sid, {"name": name, "description": description})
        return self.info(sid)

    def update(self, sid: str, fields: dict) -> dict:
        self.lib(sid)
        meta = {**self.meta(sid), **{k: v for k, v in fields.items() if k in META_TEXT}}
        if not " ".join(str(meta.get("name", "")).split()):
            raise ValueError("give the set a name")
        self._write_meta(sid, meta)
        return self.info(sid)

    def duplicate(self, sid: str, name: str) -> dict:
        self.lib(sid)
        self._check_room()
        name = " ".join(str(name).split())[:80] or f"{self.meta(sid)['name']} (copy)"
        new = self._new_id(name)
        shutil.copytree(self.dir / sid, self.dir / new)
        if self._prompts_path(sid).is_file():
            shutil.copyfile(self._prompts_path(sid), self._prompts_path(new))
        self._write_meta(new, {**self.meta(sid), "name": name, "created": int(time.time())})
        return self.info(new)

    def delete(self, sid: str) -> bool:
        if not self.exists(sid):
            return False
        shutil.rmtree(self.dir / sid)
        self._prompts_path(sid).unlink(missing_ok=True)
        return True

    # ---------------------------------------------------------------- sharing: export / import / install
    def export(self, sid: str) -> bytes:
        """The set as a series zip (series.json + pictures): what the catalog distributes and what Install accepts."""
        lib = self.lib(sid)
        m = lib.listing()
        slots = {n: s for n, s in m.get("slots", {}).items() if (lib.dir / f"{n}.webp").is_file()}
        if not slots:
            raise ValueError("this set has no pictures")
        meta = self.meta(sid)
        sj = {"id": sid, **{k: v for k, v in meta.items() if k in META_TEXT},
              "slots": {n: {"feetY": s.get("feetY"), "h": s.get("h"), "w": s.get("w")} for n, s in slots.items()}}
        sj["version"] = sj["version"] or "1.0.0"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:       # webp is already compressed
            z.writestr("series.json", json.dumps(sj, indent=1))
            if self._prompts_path(sid).is_file():
                z.write(self._prompts_path(sid), "prompts.txt")
            for n in slots:
                z.write(lib.dir / f"{n}.webp", f"{n}.webp")
        return buf.getvalue()

    @staticmethod
    def id_of(data: bytes) -> str:
        """The id written in the series.json of a zip."""
        try:
            return str(json.loads(zipfile.ZipFile(io.BytesIO(data)).read("series.json")).get("id", ""))
        except (KeyError, ValueError, zipfile.BadZipFile) as err:
            raise ValueError("not a valid series zip (series.json missing)") from err

    def incoming_files(self) -> list[dict]:
        if not self.incoming.is_dir():
            return []
        return [{"file": p.name, "bytes": p.stat().st_size} for p in sorted(self.incoming.glob("*.zip"))]

    def install(self, data: bytes, event_ids: list[str], *, replace: bool, backup: bool, expect_id: str | None = None) -> dict:
        """Validate a series zip, then install it as the set named by its series.json id.
        A set with that id is only touched when `replace` (backed up first when `backup`); otherwise SetExists is raised.
        Nothing is changed when the zip is not valid. Raises ValueError with a message for the user."""
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
        sid = str(meta_in.get("id", ""))
        if not SET_ID.match(sid):
            raise ValueError("series.json has no valid id (lowercase letters, digits, - and _)")
        if expect_id is not None and sid != expect_id:
            raise ValueError(f"series.json id ({sid!r}) does not match {expect_id!r}")
        exists = self.exists(sid)
        if exists and not replace:
            raise SetExists(sid)
        if not exists:
            self._check_room()
        given = meta_in.get("slots") if isinstance(meta_in.get("slots"), dict) else {}
        tmp = self.root / f"series-{sid}.tmp-{int(time.time())}"
        slots, skipped, made = {}, 0, None
        try:
            tmp.mkdir(parents=True)
            for info in infos:
                name = info.filename
                if "/" in name or "\\" in name or name.startswith(".") or not name.endswith(".webp"):
                    if name not in ("series.json", "prompts.txt"):
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
                feet = (given.get(slot) or {}).get("feetY")
                if im.getchannel("A").getextrema()[0] > 250:      # no transparency: the plain background colour is removed, the figure normalised
                    try:
                        im = normalise(remove_background(im))
                    except ValueError as err:
                        raise ValueError(f"{name}: {err}") from err
                    out = io.BytesIO()
                    im.save(out, "WEBP", quality=88, alpha_quality=100, method=6)
                    raw, feet = out.getvalue(), None
                if not (isinstance(feet, int) and 0 < feet <= im.height):
                    feet = analyse(im)[0]
                (tmp / name).write_bytes(raw)
                slots[slot] = {"feetY": int(feet), "h": im.height, "w": im.width, "lum": _lum(im), "v": int(time.time()), "auto": 1}
            if not slots:
                raise ValueError("the series has no usable pictures")
            prompts_in = self._prompts_from_zip(zf)
            meta = _clean_meta(meta_in)
            meta["name"] = meta["name"] or sid
            if exists:
                if backup:
                    made = self.backup_create(sid, f"before updating the set “{self.meta(sid)['name']}”")   # a failure stops here: nothing deleted
                meta["created"] = self.meta(sid).get("created") or int(time.time())
                self.lib(sid).replace_all(tmp, slots)
            else:
                (self.dir / sid).mkdir(parents=True)
                ImageLibrary(self.dir / sid).replace_all(tmp, slots)
            self._write_meta(sid, meta)
            if prompts_in is not None:             # a series without prompts keeps the prompts the set already had
                self.prompts_set(sid, prompts_in)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return {"id": sid, "name": meta["name"], "version": meta["version"], "count": len(slots), "skipped": skipped,
                "replaced": exists, "backup": made["id"] if made else ""}

    # ---------------------------------------------------------------- backups (one set per zip)
    def _backup_path(self, bid: str) -> Path:
        if not BACKUP_ID.match(bid or ""):
            raise ValueError("invalid backup id")
        return self.backups_dir / f"{bid}.zip"

    def backup_create(self, sid: str, reason: str, name: str = "", description: str = "") -> dict:
        lib = self.lib(sid)
        m = lib.listing()
        slots = {n: s for n, s in m.get("slots", {}).items() if (lib.dir / f"{n}.webp").is_file()}
        if not slots:
            raise ValueError("there are no pictures to back up")
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        if len(list(self.backups_dir.glob("*.zip"))) >= MAX_BACKUPS:
            raise ValueError(f"too many backups ({MAX_BACKUPS}): delete some first")
        stamp = time.strftime("%Y%m%d-%H%M%S")
        bid, k = stamp, 1
        while (self.backups_dir / f"{bid}.zip").exists():
            k += 1
            bid = f"{stamp}-{k}"
        meta = self.meta(sid)
        info = {"id": bid, "created": int(time.time()), "reason": str(reason)[:120], "count": len(slots),
                "name": " ".join(str(name).split())[:60], "description": str(description).strip()[:300],
                "set": sid, "set_name": meta["name"][:80]}
        tmp = self.backups_dir / f"{bid}.tmp"
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as z:
            for n in slots:
                z.write(lib.dir / f"{n}.webp", f"{n}.webp")
            z.writestr("manifest.json", json.dumps({**m, "slots": slots}, indent=1, sort_keys=True))
            z.writestr("set.json", json.dumps(meta))
            z.writestr("backup.json", json.dumps(info))
            if self._prompts_path(sid).is_file():
                z.write(self._prompts_path(sid), "prompts.txt")
        tmp.replace(self.backups_dir / f"{bid}.zip")
        return {**info, "bytes": (self.backups_dir / f"{bid}.zip").stat().st_size}

    def backups(self) -> list[dict]:
        out = []
        for p in sorted(self.backups_dir.glob("*.zip"), key=lambda q: (q.stem[:15], len(q.stem), q.stem), reverse=True) if self.backups_dir.is_dir() else []:
            if not BACKUP_ID.match(p.stem):
                continue
            try:
                with zipfile.ZipFile(p) as z:
                    info = json.loads(z.read("backup.json"))
                sid = str(info.get("set", ""))
                out.append({"id": p.stem, "created": int(info.get("created", 0)), "reason": str(info.get("reason", ""))[:120],
                            "name": str(info.get("name", ""))[:60], "description": str(info.get("description", ""))[:300],
                            "count": int(info.get("count", 0)), "set": sid if SET_ID.match(sid) else "",
                            "set_name": str(info.get("set_name", ""))[:80], "bytes": p.stat().st_size})
            except (OSError, KeyError, ValueError, zipfile.BadZipFile):
                out.append({"id": p.stem, "created": int(p.stat().st_mtime), "reason": "damaged backup", "count": 0, "set": "", "set_name": "",
                            "name": "", "description": "", "bytes": p.stat().st_size, "damaged": True})
        return out

    def backup_file(self, bid: str) -> Path | None:
        p = self._backup_path(bid)
        return p if p.is_file() else None

    def backup_delete(self, bid: str) -> bool:
        p = self._backup_path(bid)
        had = p.is_file()
        p.unlink(missing_ok=True)
        return had

    def _prompts_restore(self, sid: str, text: str | None) -> None:
        """A restore brings back everything: the backup's prompt file, or (a backup without one) the built-in prompts."""
        if text is not None:
            self.prompts_set(sid, text)
        else:
            self._prompts_path(sid).unlink(missing_ok=True)

    def backup_restore(self, bid: str, backup_first: bool, as_new: bool = False) -> dict:
        """Put a backup back as the set it was taken from (replacing that set's pictures if it still exists, recreating it if not).
        `as_new`, or a backup that does not say which set it came from (made before sets existed): a NEW set, nothing is replaced."""
        path = self._backup_path(bid)
        if not path.is_file():
            raise ValueError("backup not found")
        tmp = self.backups_dir / f"restore-{int(time.time())}.tmp"
        try:
            try:
                z = zipfile.ZipFile(path)
                m = json.loads(z.read("manifest.json"))
                info = json.loads(z.read("backup.json"))
                try:
                    meta = json.loads(z.read("set.json"))
                except KeyError:
                    meta = {}
            except (OSError, KeyError, ValueError, zipfile.BadZipFile) as err:
                raise ValueError("the backup is damaged") from err
            sid = str(info.get("set", ""))
            new_name = ""
            if as_new or not SET_ID.match(sid):
                new_name = " ".join(str(info.get("name") or info.get("set_name") or "Restored backup").split())[:80]
                same = next((i for i in self.ids() if str(self.meta(i).get("name", "")).strip().casefold() == new_name.casefold()), None)
                sid = same or self._new_id(new_name)    # a set with the same name is overwritten (the panel asked first)
            with z:
                tmp.mkdir(parents=True)
                prompts_in = self._prompts_from_zip(z)
                slots = {}
                for n, s in (m.get("slots") or {}).items():
                    if not SLOT_FILE.match(n) or not isinstance(s, dict):
                        continue
                    try:
                        (tmp / f"{n}.webp").write_bytes(z.read(f"{n}.webp"))
                    except KeyError:
                        continue
                    slots[n] = s
            if not slots:
                raise ValueError("the backup has no pictures")
            made = None
            if new_name:
                over = self.exists(sid)
                if not over:
                    self._check_room()
                    (self.dir / sid).mkdir(parents=True)
                ImageLibrary(self.dir / sid).replace_all(tmp, slots, m.get("body") if isinstance(m.get("body"), int) else None)
                self._write_meta(sid, {**(meta if isinstance(meta, dict) else {}), "name": new_name, "created": int(time.time())})
                self._prompts_restore(sid, prompts_in)
                return {"restored": bid, "set": sid, "count": len(slots), "backup": "", "new": not over, "overwritten": over}
            if self.exists(sid):
                if backup_first and self.lib(sid).listing().get("slots"):
                    made = self.backup_create(sid, f"before restoring backup {bid}")
                self.lib(sid).replace_all(tmp, slots, m.get("body") if isinstance(m.get("body"), int) else None)
            else:
                self._check_room()
                (self.dir / sid).mkdir(parents=True)
                ImageLibrary(self.dir / sid).replace_all(tmp, slots, m.get("body") if isinstance(m.get("body"), int) else None)
            self._write_meta(sid, meta if isinstance(meta, dict) and meta else {"name": info.get("set_name") or sid})
            self._prompts_restore(sid, prompts_in)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        return {"restored": bid, "set": sid, "count": len(slots), "backup": made["id"] if made else ""}
