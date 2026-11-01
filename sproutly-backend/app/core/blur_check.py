"""Blur check (notebook 21b, B2): is the photo sharp enough to judge, before anything else runs?

Sharpness is the variance of the Laplacian: how strongly the brightness changes from one pixel
to its neighbours. A blurred photo has soft edges and a low value. The photo is turned grey and
shrunk so its longer side is 512 pixels first, so the value does not depend on the camera.
This is exactly ml/src/blur_check.py, which set the cut-off: 99% of real validation field
photos (the phone's version) pass it, and every photo blurred enough to hurt accuracy fails.

The threshold already referred heavily blurred photos, so this check adds guidance rather than
safety: "retake it" is more useful to a farmer than "not sure". The app lets a farmer send a
photo anyway after two failed retakes (``allow_blurry``); the threshold still applies to it.
"""

import numpy as np
from PIL import Image

from app.core.config import settings

TOO_BLURRED = ("This photo is too blurred to check. Retake it: hold the phone still, tap the leaf "
               "on the screen to focus, and use good light.")
SIDE = 512


def sharpness(image: Image.Image) -> float:
    """Variance of the 4-neighbour Laplacian of the grey photo, longer side shrunk to SIDE."""
    grey = image.convert("L")
    grey.thumbnail((SIDE, SIDE), Image.BILINEAR)
    g = np.asarray(grey, dtype=np.float32)
    laplacian = g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4 * g[1:-1, 1:-1]
    return float(laplacian.var())


def is_sharp(image_path: str) -> bool:
    """True when the check is off (BLUR_CUT_OFF = 0) or the photo reaches the cut-off."""
    if settings.blur_cut_off <= 0:
        return True
    with Image.open(image_path) as image:
        return sharpness(image) >= settings.blur_cut_off
