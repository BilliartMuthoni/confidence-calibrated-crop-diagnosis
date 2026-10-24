"""Leaf check (D15): stop photos that are not leaves before the disease model sees them.

The disease model only knows 11 disease classes, so a photo of anything else still gets
the "least wrong" disease. This check is a separate model that never changes: a frozen
ImageNet network (MobileNetV3) turns the photo into a summary, and one logistic-regression
layer, trained in ml/notebooks/19_leaf_check.ipynb, gives the probability that it is a
leaf. Below the cut-off saved with the layer (0.9975: at least 99% of validation leaves
pass, every held-out non-leaf photo is stopped) the photo is not diagnosed or referred.

Everything comes from leaf_check.json (ml/results/leaf_check), so retraining the disease
model cannot change this check.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms

from app.core.config import settings

NOT_A_LEAF = "This doesn't look like a leaf. Please take a close-up photo of one leaf."

# The frozen networks notebook 19 may choose, with the ImageNet weights it used.
_NETWORKS = {
    "mobilenet_v3_large": (models.mobilenet_v3_large, models.MobileNet_V3_Large_Weights),
    "efficientnet_b0": (models.efficientnet_b0, models.EfficientNet_B0_Weights),
}


class _LeafCheck:
    def __init__(self, path: Path):
        if not path.exists():
            raise FileNotFoundError(
                f"Leaf check file not found at {path.resolve()}. Copy ml/results/leaf_check/leaf_check.json "
                "there, or set LEAF_CHECK_PATH in .env (blank switches the check off)."
            )
        saved = json.loads(path.read_text())
        constructor, weights = _NETWORKS[saved["architecture"]]
        network = constructor(weights=getattr(weights, saved["weights"]))
        network.classifier = nn.Identity()  # keep the summary, not ImageNet's 1,000 classes
        self.network = network.eval()
        self.transform = transforms.Compose([
            transforms.Resize((saved["image_size"], saved["image_size"])),
            transforms.ToTensor(),
            transforms.Normalize(saved["normalise_mean"], saved["normalise_std"]),
        ])
        self.mean = torch.tensor(saved["feature_mean"], dtype=torch.float64)
        self.scale = torch.tensor(saved["feature_scale"], dtype=torch.float64)
        self.coef = torch.tensor(saved["coef"], dtype=torch.float64)
        self.intercept = float(saved["intercept"])
        self.threshold = float(saved["threshold"])
        self.architecture = saved["architecture"]

    @torch.inference_mode()
    def leaf_probability(self, image: Image.Image) -> float:
        summary = self.network(self.transform(image.convert("RGB")).unsqueeze(0))[0].double()
        z = ((summary - self.mean) / self.scale) @ self.coef + self.intercept
        return float(torch.sigmoid(z))


@lru_cache(maxsize=1)
def load_leaf_check() -> Optional[_LeafCheck]:
    """Load once per process; None when LEAF_CHECK_PATH is blank (check switched off)."""
    path = settings.leaf_check_path.strip()
    return _LeafCheck(Path(path)) if path else None


def is_leaf(image_path: str) -> bool:
    check = load_leaf_check()
    if check is None:
        return True
    with Image.open(image_path) as image:
        return check.leaf_probability(image) >= check.threshold
