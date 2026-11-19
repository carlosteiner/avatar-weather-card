"""Offline tests for the picture sets (no Home Assistant needed):  python3 tests/test_series.py"""
import importlib.util, io, json, sys, tempfile, types, zipfile
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent.parent / "custom_components" / "avatar_weather_card"
pkg = types.ModuleType("awc"); pkg.__path__ = [str(here)]; sys.modules["awc"] = pkg      # so the relative imports work
def load(name):
    spec = importlib.util.spec_from_file_location(f"awc.{name}", here / f"{name}.py")
    m = importlib.util.module_from_spec(spec); sys.modules[f"awc.{name}"] = m; spec.loader.exec_module(m); return m
images = load("images"); sets_mod = load("sets")


def png(w=300, h=600, opaque=False):
    im = Image.new("RGBA", (w, h), (200, 0, 0, 255) if opaque else (0, 0, 0, 0))
    if not opaque:
        for y in range(80, h - 40):
            for x in range(w // 2 - 40, w // 2 + 40): im.putpixel((x, y), (40, 90, 160, 255))
    b = io.BytesIO(); im.save(b, "WEBP"); return b.getvalue()


def make_zip(files, meta=None, sid="demo"):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        if meta is not False:
            z.writestr("series.json", json.dumps(meta if meta is not None else {"id": sid, "name": "Demo", "version": "1.0.0", "license": "CC BY 4.0", "author": "Me"}))
        for n, d in files.items(): z.writestr(n, d)
    return b.getvalue()


def expect_error(label, fn, text, cls=ValueError):
    try: fn()
    except cls as e:
        assert text in str(e), (label, str(e)); print("  ok  ", label, "->", e); return
    raise AssertionError(label + ": no error")


root = Path(tempfile.mkdtemp())
# a library from before the sets: it becomes the set "default"
(root / "characters").mkdir(); old = images.ImageLibrary(root / "characters"); old.setup(); old.add("cold_rain_morning", png())
S = sets_mod.SetLibrary(root); S.setup()
assert S.ids() == ["default"] and S.info("default")["count"] == 1 and S.info("default")["name"] == "My pictures" and not (root / "characters").exists()
print("  ok   legacy library migrated to the set 'default'")

# create / rename / duplicate / delete
s = S.create("Pencil woman"); assert s["id"] == "pencil-woman" and s["count"] == 0, s
S.lib("pencil-woman").add("mild_clear_afternoon", png()); S.lib("pencil-woman").add("music_cold_evening", png())
assert S.create("Pencil woman")["id"] == "pencil-woman-2"
S.update("pencil-woman", {"name": "Pencil (B)", "author": "Me", "license": "CC BY 4.0", "bogus": "x"}); assert S.info("pencil-woman")["name"] == "Pencil (B)" and "bogus" not in S.meta("pencil-woman")
expect_error("empty name", lambda: S.update("pencil-woman", {"name": "  "}), "name")
expect_error("unknown set", lambda: S.lib("nope"), "not found"); expect_error("bad id", lambda: S.lib("../x"), "not found")
d = S.duplicate("pencil-woman", "Copy of it"); assert d["id"] == "copy-of-it" and d["count"] == 2
assert S.delete("copy-of-it") and not S.delete("copy-of-it") and S.exists("pencil-woman")
print("  ok   create, update, duplicate, delete; ids are unique")

# export -> install round trip on a fresh set library (sharing between two users)
z = S.export("pencil-woman"); sj = json.loads(zipfile.ZipFile(io.BytesIO(z)).read("series.json"))
assert sj["id"] == "pencil-woman" and sj["name"] == "Pencil (B)" and sj["author"] == "Me" and sj["version"] == "1.0.0" and len(sj["slots"]) == 2, sj
other = sets_mod.SetLibrary(Path(tempfile.mkdtemp())); other.setup()
r = other.install(z, [], replace=False, backup=False); assert r["id"] == "pencil-woman" and r["count"] == 2 and not r["replaced"], r
assert other.info("pencil-woman")["author"] == "Me"
expect_error("exists", lambda: other.install(z, [], replace=False, backup=False), "already have", sets_mod.SetExists)
print("  ok   export -> install round trip; an existing id is never overwritten by surprise")

good = {"mild_clear_afternoon.webp": png(), "music_cold_evening.webp": png(), "halloween_evening.webp": png(), "readme.txt": b"x", "bogus_name.webp": png()}
r = S.install(make_zip(good), ["halloween"], replace=False, backup=False, expect_id="demo")
assert r["count"] == 3 and r["skipped"] == 2 and r["id"] == "demo", r
assert r["unknown"] == ["bogus_name"] and r["unknown_count"] == 1, r      # the wrong picture name is reported, readme.txt is not a picture
assert S.info("demo")["name"] == "Demo" and S.info("default")["count"] == 1, "installing must not touch the other sets"
print("  ok   install adds a new set, the others are untouched:", r)

# replace with backup, then restore
S.lib("demo").add("cold_snow_night", png())
from PIL import Image as _I, ImageDraw as _D
def webp_grey():
    b = io.BytesIO(); _I.open(io.BytesIO(grey_bg())).save(b, "WEBP"); return b.getvalue()
def noisy_webp():
    b = io.BytesIO(); _I.effect_noise((200, 200), 90).convert("RGB").save(b, "WEBP"); return b.getvalue()
def grey_bg():                                       # an opaque figure on a plain grey background
    from PIL import Image as _I, ImageDraw as _D
    im = _I.new("RGB", (300, 600), (140, 140, 140)); _D.Draw(im).rectangle((100, 100, 200, 560), fill=(180, 40, 40)); b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
GB = images.ImageLibrary(Path(tempfile.mkdtemp()) / "sets" / "gb"); GB.setup()
def legs_gap():                                      # two legs with a grey gap between them, and an arm gap: all grey must go
    im = _I.new("RGB", (300, 600), (128, 128, 128)); dd = _D.Draw(im)
    dd.rectangle((100, 100, 200, 350), fill=(180, 40, 40)); dd.rectangle((100, 350, 130, 560), fill=(40, 40, 180)); dd.rectangle((170, 350, 200, 560), fill=(40, 40, 180))
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()
GB.add("cold_rain_night", legs_gap()); g = _I.open(GB.dir / "cold_rain_night.webp").convert("RGBA")
assert g.getchannel("A").getpixel((g.width // 2, g.height - 20)) == 0, "grey between the legs must be transparent"
sl = GB.add("cold_rain_night", grey_bg()); assert sl["w"] < 150 and sl["h"] < 480, sl      # grey background removed and the margin cropped
from PIL import Image as _I
_n = io.BytesIO(); _I.effect_noise((200, 200), 90).convert("RGB").save(_n, "PNG")
expect_error("noisy bg", lambda: GB.add("cold_rain_night", _n.getvalue()), "plain colour")
r = S.install(make_zip({"mild_rain_afternoon.webp": png()}), [], replace=True, backup=True)
assert r["replaced"] and r["backup"] and r["count"] == 1 and sorted(p.stem for p in S.lib("demo").dir.glob("*.webp")) == ["mild_rain_afternoon"], r
bl = S.backups(); assert len(bl) == 1 and bl[0]["count"] == 4 and bl[0]["set"] == "demo" and "before updating" in bl[0]["reason"], bl
b2 = S.backup_create("pencil-woman", "manual backup", "My name", "my description"); assert S.backups()[0]["name"] == "My name" and S.backups()[0]["set_name"] == "Pencil (B)"
r = S.backup_restore(bl[0]["id"], backup_first=False); assert r["set"] == "demo" and r["count"] == 4 and S.info("demo")["count"] == 4, r
S.delete("demo"); r = S.backup_restore(bl[0]["id"], backup_first=True); assert S.exists("demo") and S.info("demo")["count"] == 4 and r["backup"] == "", r   # the set was gone: recreated
assert S.backup_file(bl[0]["id"]) and S.backup_delete(b2["id"]) and not S.backup_delete(b2["id"])
# a backup from before sets (no "set" in backup.json) and "as new": a new set, nothing replaced
import zipfile as _z, shutil as _sh
src = S.backup_file(bl[0]["id"]); legacy = S.backups_dir / "20200101-000000.zip"
with _z.ZipFile(src) as zi, _z.ZipFile(legacy, "w") as zo:
    for n in zi.namelist():
        if n == "set.json": continue
        d = zi.read(n)
        if n == "backup.json": j = json.loads(d); j.pop("set"); j.pop("set_name"); j["name"] = "Old pencil set"; d = json.dumps(j)
        zo.writestr(n, d)
before_demo = S.info("demo")["count"]
r = S.backup_restore("20200101-000000", backup_first=True); assert r["new"] and r["set"] == "old-pencil-set" and r["count"] == 4 and S.info("old-pencil-set")["name"] == "Old pencil set", r
S.update("demo", {"name": "Renamed demo"})          # names differ: as new adds a separate set, nothing is replaced
r2 = S.backup_restore(bl[0]["id"], False, as_new=True); assert r2["new"] and r2["set"] != "demo" and S.info("demo")["count"] == before_demo
r3 = S.backup_restore(bl[0]["id"], False, as_new=True); assert r3["overwritten"] and r3["set"] == r2["set"]   # same name now: overwritten
assert any(b["id"] == "20200101-000000" and b["set"] == "" for b in S.backups())
S.backup_delete("20200101-000000"); S.delete("old-pencil-set"); S.delete(r2["set"])
print("  ok   legacy backups (no set) and 'as new' restore into a new set")
print("  ok   backups per set: create, restore over the set, recreate a deleted set, delete")

# bad zips change nothing
before = S.ids()
expect_error("no series.json", lambda: S.install(make_zip({"mild_clear_afternoon.webp": png()}, meta=False), [], replace=True, backup=False), "series.json")
expect_error("bad id", lambda: S.install(make_zip({"mild_clear_afternoon.webp": png()}, meta={"id": "../x"}), [], replace=True, backup=False), "valid id")
r = S.install(make_zip({"mild_clear_afternoon.webp": webp_grey()}, sid="x1"), [], replace=False, backup=False); assert r["count"] == 1, r   # opaque grey picture: background removed
_im = _I.open(S.dir / "x1" / "mild_clear_afternoon.webp"); assert _im.mode == "RGBA" and _im.getchannel("A").getpixel((0, 0)) == 0; _im.close(); S.delete("x1")
expect_error("opaque noisy", lambda: S.install(make_zip({"mild_clear_afternoon.webp": noisy_webp()}, sid="x2"), [], replace=False, backup=False), "plain colour")
expect_error("empty", lambda: S.install(make_zip({"readme.txt": b"x"}, sid="x2"), [], replace=False, backup=False), "no usable pictures")
expect_error("wrong id", lambda: S.install(make_zip({"mild_clear_afternoon.webp": png()}), [], replace=False, backup=False, expect_id="other"), "does not match")
expect_error("not a zip", lambda: S.install(b"hello", [], replace=False, backup=False), "not a valid zip")
assert S.ids() == before and not list(root.glob("series-*")), (S.ids(), before)
print("  ok   invalid zips are refused and leave nothing behind")

# the prompt file of a set: kept outside the served set folder, travels with duplicate / export / install / backups, removed with the set
pf = load("prompts")
TXT = "notes, ignored\n## STYLE\nInk drawing.\n## Character\nA tall man.\n## POSE  weather\nWalking.\n## POSE MUSIC\nSeated.\n## mild_rain_afternoon\nUmbrella in the right hand.\n"
pp = pf.parse(TXT); assert sorted(pp["shared"]) == sorted(pf.SHARED) and pp["scenes"] == {"mild_rain_afternoon": "Umbrella in the right hand."} and not pp["bad"], pp
expect_error("no sections", lambda: pf.check("just text"), "no sections")
expect_error("bad heading", lambda: pf.check("## STYLE\nx\n## Mild Rain!\ny"), "not understood")
expect_error("too big", lambda: pf.check("## STYLE\n" + "x" * (pf.MAX_BYTES + 1)), "too large")
P = sets_mod.SetLibrary(Path(tempfile.mkdtemp())); P.setup(); P.create("Ink"); P.lib("ink").add("mild_rain_afternoon", png())
assert P.prompts_get("ink") == "" and not P.info("ink")["prompts"]
assert P.prompts_set("ink", TXT) == {"custom": True, "shared": sorted(pf.SHARED), "scenes": 1}
assert P.prompts_get("ink") == TXT and P.info("ink")["prompts"] and not (P.dir / "ink" / "prompts.txt").exists()
assert P.duplicate("ink", "Ink copy")["id"] == "ink-copy" and P.prompts_get("ink-copy") == TXT
assert P.delete("ink-copy") and not (P.prompts_dir / "ink-copy.txt").exists()
z = P.export("ink"); assert zipfile.ZipFile(io.BytesIO(z)).read("prompts.txt").decode() == TXT
Q = sets_mod.SetLibrary(Path(tempfile.mkdtemp())); Q.setup(); r = Q.install(z, [], replace=False, backup=False)
assert Q.prompts_get("ink") == TXT and r["skipped"] == 0, r
b = P.backup_create("ink", "test"); P.prompts_set("ink", "## STYLE\nChanged.\n"); P.backup_restore(b["id"], backup_first=False)
assert P.prompts_get("ink") == TXT
P.prompts_set("ink", ""); assert P.prompts_get("ink") == "" and not P.info("ink")["prompts"]
P.backup_restore(b["id"], backup_first=False); assert P.prompts_get("ink") == TXT     # restore brings the file back
# a backup taken without prompts: restoring drops the prompts the set has now (everything comes from the backup)
P.prompts_set("ink", ""); b2 = P.backup_create("ink", "no prompts"); P.prompts_set("ink", TXT)
P.backup_restore(b2["id"], backup_first=False); assert P.prompts_get("ink") == "" and not P.info("ink")["prompts"]
# restore as new with a name that already exists: that set is overwritten, no second set
n_before = len(P.ids()); r = P.backup_restore(b["id"], False, as_new=True)
assert r["set"] == "ink" and r["overwritten"] and not r["new"] and len(P.ids()) == n_before and P.prompts_get("ink") == TXT, r
P.prompts_set("ink", ""); P.install(make_zip({"mild_rain_afternoon.webp": png()}, sid="ink"), [], replace=True, backup=False)
assert P.prompts_get("ink") == ""                                                       # a zip without prompts keeps what was there
expect_error("bad set id", lambda: P.prompts_set("../x", TXT), "not found")
print("  ok   prompt file: parse, check, keep, duplicate, export/install, backup/restore, reset")

# store: the active set is kept when a panel saves its settings
spec = importlib.util.spec_from_file_location("awc_store_probe", here / "store.py")
src = (here / "store.py").read_text()
if "homeassistant" not in sys.modules:
    for n in ("homeassistant", "homeassistant.core", "homeassistant.helpers", "homeassistant.helpers.storage"):
        m = types.ModuleType(n); sys.modules[n] = m
    sys.modules["homeassistant.core"].HomeAssistant = object; sys.modules["homeassistant.helpers.storage"].Store = object
    c = types.ModuleType("awc.const"); c.DOMAIN = "avatar_weather_card"; sys.modules["awc.const"] = c
store = load("store")
cfg = store.validate({}); assert cfg["sets"] == {"active": "default"}
assert store.validate({"sets": {"active": "my-set"}})["sets"]["active"] == "my-set"
expect_error("bad active", lambda: store.validate({"sets": {"active": "../x"}}), "set id")
assert "avatar" not in store.validate({"avatar": {"wardrobe": ["x"]}})
print("  ok   store validates sets.active; the old avatar settings are dropped")
# background removal: connected to the edge + big closed gaps; small grey-ish details of the figure stay
im = Image.new("RGBA", (400, 600), (128, 128, 128, 255))
for y in range(100, 560):
    for x in range(150, 250): im.putpixel((x, y), (120, 60, 30, 255))            # body
for y in range(300, 420):
    for x in range(180, 220): im.putpixel((x, y), (128, 128, 128, 255))           # closed gap (leg gap): goes
for y in range(150, 156):
    for x in range(160, 166): im.putpixel((x, y), (134, 134, 134, 255))           # small grey-ish detail: stays
out = images.remove_background(im)
a = out.getchannel("A")
assert a.getpixel((10, 10)) == 0 and a.getpixel((200, 360)) == 0 and a.getpixel((200, 200)) == 255 and a.getpixel((162, 152)) == 255
assert images.remove_background(im, 0).getchannel("A").getpixel((10, 10)) == 0
wide = im.copy()
for y in range(540, 600):
    for x in range(400): wide.putpixel((x, y), (230, 230, 230, 255))              # ground reaching both sides
expect_error("ground on both sides", lambda: images.remove_background(wide), "ground reaches")
print("  ok   background removal: edge-connected + closed gaps, small details kept, tolerance, ground refused")
# originals: an opaque upload keeps the picture as uploaded (outside the served folder) and the settings; delete / replace remove it
import shutil as _sh
_root = Path(tempfile.mkdtemp()); _lib = images.ImageLibrary(_root / "sets" / "t"); _lib.setup()
_op = Image.new("RGBA", (300, 500), (128, 128, 128, 255))
for _y in range(60, 460):
    for _x in range(120, 180): _op.putpixel((_x, _y), (150, 40, 40, 255))
_b = io.BytesIO(); _op.save(_b, "PNG"); _raw = _b.getvalue()
_slot = _lib.add("mild_clear_afternoon", _raw)
assert _slot["orig"] == 1 and _slot["bg"] == {"color": "", "tol": 50, "hole": 15}
assert _lib.original("mild_clear_afternoon") == (_raw, "image/png") and _lib.original("../x") is None
assert not any(p.suffix == ".orig" for p in (_root / "sets" / "t").iterdir())            # not in the served folder
_cut = Image.new("RGBA", (300, 500), (0, 0, 0, 0))
for _y in range(60, 460):
    for _x in range(120, 180): _cut.putpixel((_x, _y), (150, 40, 40, 255))
_b2 = io.BytesIO(); _cut.save(_b2, "PNG")
_slot = _lib.add("mild_clear_afternoon", _b2.getvalue(), original=_raw, params={"color": "#808080", "tol": 30, "hole": 5})
assert _slot["bg"] == {"color": "#808080", "tol": 30, "hole": 5}
_lib.add("hot_clear_evening", _b2.getvalue())                                          # a transparent upload keeps no original
assert "orig" not in _lib.listing()["slots"]["hot_clear_evening"] and _lib.original("hot_clear_evening") is None
_lib.delete("mild_clear_afternoon"); assert _lib.original("mild_clear_afternoon") is None
_sh.rmtree(_root, ignore_errors=True)
print("  ok   originals kept outside the served folder, settings stored, removed on delete")
print("ALL OK")
