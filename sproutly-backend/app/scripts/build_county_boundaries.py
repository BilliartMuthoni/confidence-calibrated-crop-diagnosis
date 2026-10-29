"""Build app/data/kenya_counties.json, the county outlines used to find a farmer's county from
their phone's position (app/core/county_locator.py).

Source: geoBoundaries KEN ADM1, simplified (wmgeolab/geoBoundaries, release 9469f09), from the
RCMRD GeoPortal, 2020; public domain. Download it, then run:

    python -m app.scripts.build_county_boundaries path/to/geoBoundaries-KEN-ADM1_simplified.geojson

Coordinates are rounded to 4 decimals (about 11 m), plenty for county lines. Two names differ
from the spelling the rest of Sproutly uses and are mapped below.
"""
import json
import pathlib
import sys

from app.core.counties import COUNTIES

RENAME = {"Taita Taveta": "Taita-Taveta", "Tharaka": "Tharaka-Nithi"}
OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "kenya_counties.json"


def _round(rings):
    return [[[round(x, 4), round(y, 4)] for x, y in ring] for ring in rings]


def main(source: str) -> None:
    features = json.loads(pathlib.Path(source).read_text(encoding="utf-8"))["features"]
    counties = {}
    for feature in features:
        name = RENAME.get(feature["properties"]["shapeName"], feature["properties"]["shapeName"])
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        counties[name] = [_round(polygon) for polygon in polygons]
    missing = sorted(set(COUNTIES) - set(counties))
    extra = sorted(set(counties) - set(COUNTIES))
    if missing or extra:
        raise SystemExit(f"Names do not match the 47 counties. Missing: {missing}. Unknown: {extra}.")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "geoBoundaries KEN ADM1 simplified (release 9469f09), RCMRD GeoPortal 2020, public domain",
        "counties": counties,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(counties)} counties to {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main(sys.argv[1])
