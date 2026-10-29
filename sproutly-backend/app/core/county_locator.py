"""Which of the 47 counties a position is in, from the official county outlines.

The outlines (app/data/kenya_counties.json, built by app/scripts/build_county_boundaries.py) are
geoBoundaries KEN ADM1 from the RCMRD GeoPortal, public domain. No map service is called, so the
farmer's position goes nowhere else, and it is never stored: only the county name is kept.
"""
import json
import pathlib
from functools import lru_cache
from typing import Optional

_FILE = pathlib.Path(__file__).resolve().parents[1] / "data" / "kenya_counties.json"


@lru_cache(maxsize=1)
def _outlines():
    """Each county's polygons (outer ring first, then holes) with a bounding box for a quick skip."""
    counties = json.loads(_FILE.read_text(encoding="utf-8"))["counties"]
    out = []
    for name, polygons in counties.items():
        xs = [x for polygon in polygons for x, _ in polygon[0]]
        ys = [y for polygon in polygons for _, y in polygon[0]]
        out.append((name, polygons, (min(xs), min(ys), max(xs), max(ys))))
    return out


def _inside_ring(x: float, y: float, ring) -> bool:
    """Ray casting: count how often a line from the point eastwards crosses the ring's edges."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _inside_polygon(x: float, y: float, polygon) -> bool:
    return _inside_ring(x, y, polygon[0]) and not any(_inside_ring(x, y, hole) for hole in polygon[1:])


def county_at(latitude: float, longitude: float) -> Optional[str]:
    """The county containing the point, or None outside Kenya (or in a lake or the sea)."""
    x, y = longitude, latitude
    for name, polygons, (min_x, min_y, max_x, max_y) in _outlines():
        if min_x <= x <= max_x and min_y <= y <= max_y and any(_inside_polygon(x, y, p) for p in polygons):
            return name
    return None
