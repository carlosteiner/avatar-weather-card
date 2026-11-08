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
lib = im_mod.SeriesLibrary(root); lib.setup()
good = {"mild_clear_afternoon.webp": png(), "music_cold_evening.webp": png(), "halloween_evening.webp": png(), "readme.txt": b"x", "bogus_name.webp": png()}
r = lib.install("demo", make_zip(good), ["halloween"])
assert r["count"] == 3 and r["skipped"] == 2, r; print("  ok   install:", r)
assert "demo" in lib.installed() and lib.installed()["demo"]["count"] == 3
s = lib.slots("demo"); assert s["mild_clear_afternoon"]["feetY"] > 0 and s["mild_clear_afternoon"]["w"] == 300
# reinstall replaces
lib.install("demo", make_zip({"mild_clear_afternoon.webp": png()}), []); assert lib.installed()["demo"]["count"] == 1; print("  ok   reinstall replaces")
# merged listing: user wins, series fills the rest
user = {"body": 900, "slots": {"mild_clear_afternoon": {"feetY": 1, "h": 2, "w": 3, "lum": 4, "v": 5}, "cold_rain_morning": {"feetY": 1, "h": 2, "w": 3, "lum": 4, "v": 5}}}
lib.install("demo", make_zip(good), ["halloween"])
m = im_mod.merged_listing(user, lib, ["demo"], "/img", "/ser")
assert m["slots"]["mild_clear_afternoon"]["u"] == "/img/mild_clear_afternoon.webp" and "series" not in m["slots"]["mild_clear_afternoon"]
assert m["slots"]["music_cold_evening"]["u"] == "/ser/demo/music_cold_evening.webp" and m["slots"]["music_cold_evening"]["series"] == "demo"
assert "cold_rain_morning" in m["slots"]; print("  ok   merged: user wins, series fills in")
# rejections
expect_error("bad id", lambda: lib.install("../x", make_zip(good), []), "invalid series id")
expect_error("not a zip", lambda: lib.install("demo", b"nope", []), "not a valid zip")
expect_error("no series.json", lambda: lib.install("demo", make_zip(good, meta=False), []), "series.json")
expect_error("id mismatch", lambda: lib.install("other", make_zip(good), []), "does not match")
expect_error("no pictures", lambda: lib.install("demo", make_zip({"readme.txt": b"x"}), []), "no usable pictures")
expect_error("no alpha", lambda: lib.install("demo", make_zip({"mild_clear_afternoon.webp": png(opaque=True)}), []), "no transparency")
expect_error("broken picture", lambda: lib.install("demo", make_zip({"mild_clear_afternoon.webp": b"not an image"}), []), "not a valid picture")
for evil in ("../mild_clear_afternoon.webp", "sub/mild_clear_afternoon.webp", "/etc/mild_clear_afternoon.webp", ".hidden.webp"):
    r = lib.install("demo", make_zip({evil: png(), "mild_rain_afternoon.webp": png()}), [])
    assert r["count"] == 1 and r["skipped"] == 1, (evil, r)
print("  ok   path tricks are skipped (", 4, "cases )")
assert not [p for p in (root / "series").iterdir() if ".tmp-" in p.name], "temp dir left behind"
assert lib.remove("demo") and "demo" not in lib.installed() and not lib.remove("../etc"); print("  ok   remove")
print("ALL SERIES TESTS PASSED")
