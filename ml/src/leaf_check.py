"""Leaf check (D15): is the photo a leaf at all, before the disease model sees it?

The disease model only knows 11 disease classes, so a photo of anything else still gets
the "least wrong" disease. The leaf check is a separate model that never changes: an
ImageNet network, frozen, turns each photo into a summary (the layer before its output),
and one logistic-regression layer on top answers "leaf or not". Retraining the disease
model cannot change it.

Rule (fixed 23 Oct 2026, before any photo was scored): the cut-off on the leaf
probability is set so that at least 99% of validation leaf photos pass, because blocking
a real farmer costs more than letting an odd photo through (the disease model's low
confidence already refers odd photos). MobileNetV3 is tried first, as the cheapest; if it
rejects less than 95% of the validation non-leaf photos at that cut-off, EfficientNet-B0
is tried the same way. If neither does, the check is reported and stays off.

Non-leaf photos: COCO 2017 validation (Lin et al., 2014). COCO's annotations are CC BY
4.0; the photos are Flickr's, each under its own licence, recorded per photo. Only the
small learned layer ships with the app, never a photo.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset

from src import training
from src.data import image_dataset

ARCHITECTURES = ("mobilenet_v3_large", "efficientnet_b0")   # in the order they are tried
PASS_RATE = 0.99       # share of validation leaf photos that must pass
REJECT_TARGET = 0.95   # share of validation non-leaf photos the check must catch
IMAGE_SIZE = 224

# COCO categories kept out of training: plants (not close-up leaves) and fruit or food,
# reported separately as hard cases.
PLANT_LIKE = {"potted plant", "broccoli"}
FRUIT = {"apple", "orange", "banana"}
FOOD = {"pizza", "sandwich", "cake", "hot dog", "donut", "carrot"}


# --------------------------------------------------------------------------- backbone

def backbone(architecture: str) -> nn.Module:
    """The ImageNet network with its output layer removed: it returns the summary vector."""
    constructor, weights = training.ARCHITECTURES[architecture]
    model = constructor(weights=weights)
    model.classifier = nn.Identity()   # both architectures keep their output layers in .classifier
    return model.eval()


class _Photos(Dataset):
    def __init__(self, paths: list[Path]):
        self.paths = paths
        self.transform = image_dataset.eval_transform(IMAGE_SIZE)   # what the backend does

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        try:
            with Image.open(self.paths[i]) as image:
                return self.transform(image.convert("RGB")), True
        except Exception:   # an unreadable file is reported, not fatal
            return torch.zeros(3, IMAGE_SIZE, IMAGE_SIZE), False


@torch.no_grad()
def features(model: nn.Module, paths: list[Path], device: str = "cpu", batch_size: int = 64,
             workers: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """One summary vector per photo, and whether the photo could be read."""
    model = model.to(device).eval()
    out, readable = [], []
    for images, ok in DataLoader(_Photos(paths), batch_size=batch_size, num_workers=workers):
        out.append(model(images.to(device)).float().cpu().numpy())
        readable.append(ok.numpy())
    return np.concatenate(out), np.concatenate(readable)


# ------------------------------------------------------------------------ the leaf layer

def fit(leaf: np.ndarray, other: np.ndarray, seed: int = 42) -> dict:
    """Logistic regression on standardised summaries; classes weighted to count equally."""
    from sklearn.linear_model import LogisticRegression

    x = np.concatenate([leaf, other]).astype(np.float64)
    y = np.r_[np.ones(len(leaf)), np.zeros(len(other))]
    mean, scale = x.mean(axis=0), x.std(axis=0) + 1e-6
    model = LogisticRegression(max_iter=5000, class_weight="balanced", random_state=seed).fit((x - mean) / scale, y)
    return {"mean": mean, "scale": scale, "coef": model.coef_[0], "intercept": float(model.intercept_[0])}


def leaf_probability(head: dict, x: np.ndarray) -> np.ndarray:
    z = ((np.asarray(x, dtype=np.float64) - head["mean"]) / head["scale"]) @ head["coef"] + head["intercept"]
    return 1 / (1 + np.exp(-z))


def threshold_for_pass_rate(leaf_scores: np.ndarray, rate: float = PASS_RATE) -> float:
    """The highest cut-off at which at least ``rate`` of these leaf photos still pass."""
    return float(np.quantile(np.asarray(leaf_scores), 1 - rate, method="lower"))


def evaluate(head: dict, threshold: float, sets: dict) -> pd.DataFrame:
    """Share passed as a leaf, for each named set of (summaries, is_leaf)."""
    rows = []
    for name, (x, is_leaf) in sets.items():
        passed = leaf_probability(head, x) >= threshold
        rows.append({"set": name, "photos": len(x), "really leaves": bool(is_leaf),
                     "passed as leaf": float(passed.mean()) if len(x) else float("nan"),
                     "correct": float((passed == is_leaf).mean()) if len(x) else float("nan")})
    return pd.DataFrame(rows).set_index("set")


# ----------------------------------------------------------------------------- COCO

def coco_images(annotations_json: Path) -> pd.DataFrame:
    """One row per COCO photo: file name, its Flickr licence and the object categories in it."""
    data = json.loads(Path(annotations_json).read_text())
    licences = {entry["id"]: entry["name"] for entry in data["licenses"]}
    names = {entry["id"]: entry["name"] for entry in data["categories"]}
    categories: dict[int, set] = {}
    for annotation in data["annotations"]:
        categories.setdefault(annotation["image_id"], set()).add(names[annotation["category_id"]])
    rows = [{"file": image["file_name"], "licence": licences.get(image["license"], "unknown"),
             "categories": sorted(categories.get(image["id"], set()))} for image in data["images"]]
    df = pd.DataFrame(rows)
    df["group"] = [("plant-like" if PLANT_LIKE & set(c) else "fruit" if FRUIT & set(c) else
                    "food" if FOOD & set(c) else "everyday") for c in df["categories"]]
    return df


def split_everyday(coco: pd.DataFrame, seed: int = 42, parts=(0.6, 0.2, 0.2)) -> pd.Series:
    """train / val / test for the everyday photos; plant-like, fruit and food photos are report only."""
    split = pd.Series("report only", index=coco.index)
    everyday = coco.index[coco["group"] == "everyday"].to_numpy()
    order = np.random.default_rng(seed).permutation(everyday)
    n_train, n_val = int(parts[0] * len(order)), int(parts[1] * len(order))
    split[order[:n_train]] = "train"
    split[order[n_train:n_train + n_val]] = "val"
    split[order[n_train + n_val:]] = "test"
    return split


# ----------------------------------------------------------------------------- export

def export(head: dict, architecture: str, threshold: float, path: Path, extra: dict | None = None) -> dict:
    """Everything the backend needs: which frozen network, the layer's numbers and the cut-off."""
    data = {"architecture": architecture, "weights": training.ARCHITECTURES[architecture][1].name,
            "image_size": IMAGE_SIZE, "normalise_mean": list(image_dataset.MEAN), "normalise_std": list(image_dataset.STD),
            "feature_mean": np.asarray(head["mean"]).tolist(), "feature_scale": np.asarray(head["scale"]).tolist(),
            "coef": np.asarray(head["coef"]).tolist(), "intercept": head["intercept"], "threshold": threshold,
            "rule": f"cut-off where {PASS_RATE:.0%} of validation leaf photos pass", **(extra or {})}
    Path(path).write_text(json.dumps(data, indent=1))
    return data
