"""Blur check (notebook 21b, B2): is the photo sharp enough to judge, before the disease model sees it?

The supervisor's worked example separates a valid file from a suitable photo, with
"Retake: too blurred" as one outcome. Sharpness here is the variance of the Laplacian (how
strongly the brightness changes from one pixel to its neighbours): a blurred photo has soft
edges and a low value (Pech-Pacheco et al., 2000). It needs no model, is the same for the
same photo every time, and takes milliseconds.

The photo is first turned grey and shrunk so its longer side is SIDE pixels, so the value
does not depend on the camera's resolution. The backend must compute exactly this number;
it is written with Pillow and NumPy only, which the backend already uses.

Rule (fixed 31 Oct 2026, before any photo was scored): the cut-off is the value that
PASS_RATE of the phone versions of real validation field photos reach, as for the leaf
check, because refusing a good photo costs the farmer a retake.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

SIDE = 512
PASS_RATE = 0.99


def sharpness(image: Image.Image) -> float:
    """Variance of the 4-neighbour Laplacian of the grey photo, longer side shrunk to SIDE."""
    grey = image.convert("L")
    grey.thumbnail((SIDE, SIDE), Image.BILINEAR)
    g = np.asarray(grey, dtype=np.float32)
    laplacian = g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4 * g[1:-1, 1:-1]
    return float(laplacian.var())


def export(cut_off: float, path: Path, extra: dict | None = None) -> dict:
    """The few numbers the backend needs to run the same check."""
    data = {"method": "variance of the 4-neighbour Laplacian", "side": SIDE, "resample": "bilinear",
            "cut_off": float(cut_off), "pass_rate": PASS_RATE, **(extra or {})}
    Path(path).write_text(json.dumps(data, indent=1))
    return data
