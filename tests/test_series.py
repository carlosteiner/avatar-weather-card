"""Offline tests for the picture series (no Home Assistant needed):  python3 tests/test_series.py"""
import importlib.util, io, json, os, sys, tempfile, zipfile
from pathlib import Path
from PIL import Image

here = Path(__file__).resolve().parent.parent / "custom_components" / "avatar_weather_card"
spec = importlib.util.spec_from_file_location("awc_images", here / "images.py")
im_mod = importlib.util.module_from_spec(spec); sys.modules["awc_images"] = im_mod; spec.loader.exec_module(im_mod)


def png(w=300, h=600, opaque=False):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if opaque:
        im = Image.new("RGBA", (w, h), (200, 0, 0, 255))
    else:
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


def expect_error(label, fn, text):
    try: fn()
    except ValueError as e:
        assert text in str(e), (label, str(e)); print("  ok  ", label, "->", e); return
    raise AssertionError(label + ": no error")


root = Path(tempfile.mkdtemp())
imgs = im_mod.ImageLibrary(root); imgs.setup()
bk = im_mod.BackupLibrary(root, imgs); bk.setup()
lib = im_mod.SeriesLibrary(root, imgs, bk); lib.setup()
files = lambda: sorted(p.stem for p in imgs.dir.glob("*.webp"))

# the user's own pictures
imgs.add("cold_rain_morning", png()); imgs.add("mild_clear_afternoon", png())
assert lib.library_state()["count"] == 2 and files() == ["cold_rain_morning", "mild_clear_afternoon"]

good = {"mild_clear_afternoon.webp": png(), "music_cold_evening.webp": png(), "halloween_evening.webp": png(), "readme.txt": b"x", "bogus_name.webp": png()}
# install WITHOUT backup: the library is replaced, the old picture that is not in the series is gone
r = lib.install("demo", make_zip(good), ["halloween"], backup=False)
assert r["count"] == 3 and r["skipped"] == 2 and r["backup"] == "", r; print("  ok   install:", r)
assert files() == ["halloween_evening", "mild_clear_afternoon", "music_cold_evening"], files()
st = lib.library_state(); assert st["count"] == 3 and st["series"]["id"] == "demo" and st["series"]["name"] == "Demo"
m = imgs.listing(); assert m["slots"]["mild_clear_afternoon"]["feetY"] > 0 and m["slots"]["mild_clear_afternoon"]["w"] == 300
assert bk.listing() == []; print("  ok   no backup made when not asked, old pictures replaced")

# install WITH backup, then restore it
imgs.add("cold_snow_night", png())                        # a picture of the user on top of the series
r = lib.install("demo", make_zip({"mild_rain_afternoon.webp": png()}), [], backup=True)
assert r["backup"] and r["count"] == 1 and files() == ["mild_rain_afternoon"], (r, files())
bl = bk.listing(); assert len(bl) == 1 and bl[0]["count"] == 4 and "before installing" in bl[0]["reason"] and bl[0]["series"] == "Demo", bl
print("  ok   backup made before the install:", bl[0]["id"], bl[0]["count"], "pictures")
res = bk.restore(bl[0]["id"], backup_first=True)
assert res["count"] == 4 and res["backup"] and "cold_snow_night" in files() and "mild_rain_afternoon" not in files(), (res, files())
assert lib.library_state()["series"]["id"] == "demo"
assert len(bk.listing()) == 2; print("  ok   restore (with a safety backup of the state before):", res)
res = bk.restore(bl[0]["id"], backup_first=False); assert res["backup"] == "" and len(bk.listing()) == 2; print("  ok   restore without backup")

# nothing to back up when the library is empty: install with backup=True just installs
e_root = Path(tempfile.mkdtemp()); e_i = im_mod.ImageLibrary(e_root); e_i.setup(); e_b = im_mod.BackupLibrary(e_root, e_i); e_b.setup()
e_l = im_mod.SeriesLibrary(e_root, e_i, e_b); e_l.setup()
assert e_l.install("demo", make_zip(good), ["halloween"], backup=True)["backup"] == "" and e_b.listing() == []
print("  ok   empty library: no backup needed")

# name and description
nb = bk.create("manual backup", "  My   named\nbackup ", "  because I wanted one  ")
l = [x for x in bk.listing() if x["id"] == nb["id"]][0]
assert l["name"] == "My named backup" and l["description"] == "because I wanted one", l
assert bk.info(nb["id"])["name"] == "My named backup" and bk.file(nb["id"]).is_file() and bk.file("20200101-000009") is None
long = bk.create("manual backup", "x" * 200, "y" * 900); assert len(long["name"]) == 60 and len(long["description"]) == 300
bk.delete(nb["id"]); bk.delete(long["id"]); print("  ok   name + description (trimmed, limited), file lookup")
# manual backup, delete, bad ids
b = bk.create("manual backup"); assert b["count"] == len(files()) and any(x["id"] == b["id"] for x in bk.listing())
assert bk.delete(b["id"]) and not any(x["id"] == b["id"] for x in bk.listing()) and not bk.delete(b["id"]); print("  ok   manual backup + delete")
for bad in ("../x", "2026", "20261109-120000/../../x", ""):
    expect_error("bad backup id " + repr(bad), lambda bad=bad: bk.restore(bad, False), "invalid backup id")
expect_error("unknown backup", lambda: bk.restore("20200101-000000", False), "not found")
(bk.dir / "20200101-000001.zip").write_bytes(b"garbage")
assert [x for x in bk.listing() if x["id"] == "20200101-000001"][0].get("damaged")
expect_error("damaged backup", lambda: bk.restore("20200101-000001", False), "damaged"); bk.delete("20200101-000001"); print("  ok   damaged backup is listed and refused, can be deleted")
# a backup whose zip carries a hostile file name does not escape
import zipfile as zf_
evil = bk.dir / "20200102-000000.zip"
with zf_.ZipFile(evil, "w") as z:
    z.writestr("manifest.json", json.dumps({"body": 900, "slots": {"../evil": {"feetY": 1, "h": 2, "w": 3}, "ok_one": {"feetY": 1, "h": 2, "w": 3}}}))
    z.writestr("ok_one.webp", png()); z.writestr("../evil.webp", png()); z.writestr("backup.json", "{}")
bk.restore("20200102-000000", False); assert files() == ["ok_one"] and not (root / "evil.webp").exists(); bk.delete("20200102-000000"); print("  ok   hostile names in a backup are ignored")

# the 20-backup cap
n0 = len(bk.listing())
for i in range(im_mod.MAX_BACKUPS - n0): (bk.dir / f"20190101-0000{i:02d}.zip").write_bytes(b"x")
expect_error("too many backups", lambda: bk.create("x"), "too many backups")
for p in bk.dir.glob("2019*.zip"): p.unlink()

# rejections: nothing is touched when the zip is bad
before = files()
expect_error("bad id", lambda: lib.install("../x", make_zip(good), [], True), "invalid series id")
expect_error("not a zip", lambda: lib.install("demo", b"nope", [], True), "not a valid zip")
expect_error("no series.json", lambda: lib.install("demo", make_zip(good, meta=False), [], True), "series.json")
expect_error("id mismatch", lambda: lib.install("other", make_zip(good), [], True), "does not match")
expect_error("no pictures", lambda: lib.install("demo", make_zip({"readme.txt": b"x"}), [], True), "no usable pictures")
expect_error("no alpha", lambda: lib.install("demo", make_zip({"mild_clear_afternoon.webp": png(opaque=True)}), [], True), "no transparency")
expect_error("broken picture", lambda: lib.install("demo", make_zip({"mild_clear_afternoon.webp": b"not an image"}), [], True), "not a valid picture")
assert files() == before
n_b = len(bk.listing())
print("  ok   rejections leave the library untouched")
for evil in ("../mild_clear_afternoon.webp", "sub/mild_clear_afternoon.webp", "/etc/mild_clear_afternoon.webp", ".hidden.webp"):
    r = lib.install("demo", make_zip({evil: png(), "mild_rain_afternoon.webp": png()}), [], False)
    assert r["count"] == 1 and r["skipped"] == 1, (evil, r)
print("  ok   path tricks are skipped (", 4, "cases )")
assert not [p for p in root.iterdir() if ".tmp" in p.name], "temp dir left behind"
assert len(bk.listing()) == n_b, "a rejected install must not leave a backup behind"
print("ALL SERIES TESTS PASSED")
