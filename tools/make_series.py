#!/usr/bin/env python3
"""Build a picture series zip (and its catalog entry) from a folder of pictures + manifest.json.

  python3 tools/make_series.py --src /config/avatar_weather_card/characters --out ./dist \\
      --id pencil-woman --name "Pencil sketch woman" --version 1.0.0 --author "Name" --license "CC BY 4.0" \\
      --description "..." --attribution "..." --character "..." --models "..." --release-base https://github.com/OWNER/REPO/releases/download

The zip holds series.json (id, name, version, ..., slots with the soles line of every picture) and the .webp files, flat.
The catalog entry (index-entry.json) has the size, the sha256 and the zip url to paste into the images repository's index.json.
"""
import argparse, hashlib, json, os, re, sys, zipfile

SERIES_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", required=True, help="folder with the .webp pictures and manifest.json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--id", required=True); ap.add_argument("--name", required=True); ap.add_argument("--version", required=True)
    for k in ("description", "author", "license", "attribution", "character", "models", "source"):
        ap.add_argument("--" + k, default="")
    ap.add_argument("--release-base", default="", help="e.g. https://github.com/OWNER/REPO/releases/download")
    ap.add_argument("--exclude", default="", help="comma separated slot names to leave out")
    a = ap.parse_args()
    if not SERIES_ID.match(a.id):
        print("invalid id (lowercase letters, digits, - and _)"); return 2
    manifest = json.load(open(os.path.join(a.src, "manifest.json")))
    slots = manifest.get("slots", manifest)
    skip = {x for x in a.exclude.split(",") if x}
    names = sorted(n for n in slots if n not in skip and os.path.isfile(os.path.join(a.src, n + ".webp")))
    meta = {"id": a.id, "name": a.name, "version": a.version, "description": a.description, "author": a.author, "license": a.license,
            "attribution": a.attribution, "character": a.character, "models": a.models, "source": a.source,
            "slots": {n: {"feetY": slots[n]["feetY"], "h": slots[n]["h"], "w": slots[n]["w"]} for n in names}}
    os.makedirs(a.out, exist_ok=True)
    zpath = os.path.join(a.out, f"{a.id}-{a.version}.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_STORED) as z:     # webp is already compressed
        z.writestr("series.json", json.dumps(meta, indent=1, sort_keys=True))
        for n in names:
            z.write(os.path.join(a.src, n + ".webp"), n + ".webp")
    data = open(zpath, "rb").read()
    tag = f"{a.id}-v{a.version}"
    entry = {"id": a.id, "name": a.name, "version": a.version, "description": a.description, "author": a.author, "license": a.license,
             "count": len(names), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
             "zip_url": f"{a.release_base.rstrip('/')}/{tag}/{os.path.basename(zpath)}" if a.release_base else ""}
    json.dump(entry, open(os.path.join(a.out, "index-entry.json"), "w"), indent=2)
    print(f"{zpath}: {len(names)} pictures, {len(data) / 1048576:.1f} MB, sha256 {entry['sha256'][:16]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
