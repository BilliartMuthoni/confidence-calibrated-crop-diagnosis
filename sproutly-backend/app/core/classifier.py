"""Image-only crop disease classifier: the ensemble chosen in notebook 18 (D2) and
deployed in notebook 18b (v2 ResNet-50 seed 44, ConvNeXt-Tiny 1e-4, EfficientNet-B0).

Loads model.pt files exported by ml/src/training.export: the architecture name, weights,
class list, image size and normalisation, so preprocessing here matches the
evaluation transform used in training exactly. Any architecture from the comparison
can be loaded, so switching models is a matter of changing ML_MODEL_PATH; several paths
separated by commas run as an ensemble whose probabilities are averaged.

Crop rule: the farmer says which crop the photo shows. The model still scores all
11 classes; the answer is the best class *of that crop*, and its confidence is the
original 11-class probability -- deliberately NOT rescaled over the crop's classes.
Rescaling would let a tomato photo submitted as maize come out as a confident maize
diagnosis. Without it, if the model's top class belongs to another crop, the best
class of the chosen crop is below 0.5; since the threshold is never below
MIN_THRESHOLD = 0.5, any disagreement about the crop always ends in a referral.
The rule can only turn diagnoses into referrals, never create one.

Crop left out (several photos of mixed crops): the crop is detected as the one whose
classes hold the most probability, then the same rule applies. With the ensemble,
detection is right on 100% of familiar photos but only 76.5% of unseen field photos
(measured 24 Oct), so the app shows the detected crop and lets the farmer correct it
(POST /diagnose/{id}/crop).

Confidence is calibrated by temperature scaling (D6): the log of the averaged
probabilities is divided by settings.temperature (2.4381, fitted on unseen field photos
in notebook 18b) before softmax. This changes how sure the model says it is, never which
class it picks. The referral threshold (0.8) was chosen on these calibrated values.
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import torch
from PIL import Image
from torch import nn
from torchvision import models, transforms

from app.core.config import settings
from app.models.diagnosis import CropType

MIN_THRESHOLD = 0.5

# The architectures trained in ml/src/training.py (same names), built without weights;
# the trained weights come from model.pt.
_ARCHITECTURES = {
    "efficientnet_b0": models.efficientnet_b0,
    "mobilenet_v3_large": models.mobilenet_v3_large,
    "resnet50": models.resnet50,
    "densenet121": models.densenet121,
    "convnext_tiny": models.convnext_tiny,
    "swin_t": models.swin_t,
}

# Class-name prefix -> crop, for the PlantVillage class names the model was trained on.
_CROP_PREFIXES = {
    "Corn_(maize)___": CropType.maize,
    "Tomato___": CropType.tomato,
    "Potato___": CropType.potato,
}


def crop_of(class_name: str) -> CropType:
    for prefix, crop in _CROP_PREFIXES.items():
        if class_name.startswith(prefix):
            return crop
    raise ValueError(f"Model class {class_name!r} does not belong to a supported crop")


@dataclass
class Prediction:
    class_name: str  # best class of the crop, e.g. "Tomato___Late_blight"
    confidence: float  # its 11-class probability (not rescaled)
    crop: CropType  # the farmer's crop, or the detected one
    crop_detected: bool  # True when the model chose the crop
    crop_probability: float  # total probability of all that crop's classes
    is_referred: bool

    @property
    def crop_mismatch(self) -> bool:
        """Chosen crop: most of the probability belongs to another crop.
        Detected crop: no crop holds most of the probability (crop unclear)."""
        return self.crop_probability < 0.5


def _build(architecture: str, num_classes: int) -> nn.Module:
    """The network with its last Linear layer (the ImageNet output) sized for our classes,
    exactly as ml/src/training.build_model does, so the saved weights fit."""
    if architecture not in _ARCHITECTURES:
        raise ValueError(f"Unsupported model architecture: {architecture!r}")
    network = _ARCHITECTURES[architecture](weights=None)
    name, layer = [(n, m) for n, m in network.named_modules() if isinstance(m, nn.Linear)][-1]
    parent, _, attribute = name.rpartition(".")
    setattr(network.get_submodule(parent), attribute, nn.Linear(layer.in_features, num_classes))
    return network


class _Member:
    """One trained network and the preprocessing it was evaluated with."""

    def __init__(self, path: Path):
        if not path.exists():
            raise FileNotFoundError(
                f"Model file not found at {path.resolve()}. Download model.pt from Google Drive "
                "(CropDiseaseDiagnosis/models/<run>/model.pt) and put it there, "
                "or set ML_MODEL_PATH in .env."
            )
        saved = torch.load(path, map_location="cpu", weights_only=False)

        self.architecture: str = saved.get("architecture")
        self.classes: list[str] = saved["classes"]

        network = _build(self.architecture, len(self.classes))
        network.load_state_dict(saved["state_dict"])
        self.network = network.eval()

        size = saved["image_size"]
        self.transform = transforms.Compose([
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize(saved["mean"], saved["std"]),
        ])

    def softmax(self, image: Image.Image) -> torch.Tensor:
        batch = self.transform(image).unsqueeze(0)
        return torch.softmax(self.network(batch), dim=1)[0]


class _Model:
    """One model, or an ensemble (D2, notebook 18b): the members' probabilities are averaged,
    then calibrated. With one member this is exactly softmax(scores / temperature)."""

    def __init__(self, paths: list[Path]):
        self.members = [_Member(path) for path in paths]
        self.classes: list[str] = self.members[0].classes
        for member in self.members[1:]:
            if member.classes != self.classes:
                raise ValueError("All models in ML_MODEL_PATH must have the same classes in the same order")
        self.crops = [crop_of(name) for name in self.classes]
        self.architectures = [member.architecture for member in self.members]

    @torch.inference_mode()
    def probabilities(self, image: Image.Image) -> torch.Tensor:
        image = image.convert("RGB")
        mean = torch.stack([member.softmax(image) for member in self.members]).mean(dim=0)
        return torch.softmax(torch.log(mean + 1e-12) / settings.temperature, dim=0)


def model_paths() -> list[Path]:
    """ML_MODEL_PATH holds one model.pt, or several separated by commas for the ensemble."""
    return [Path(p.strip()) for p in settings.ml_model_path.split(",") if p.strip()]


@lru_cache(maxsize=1)
def load_model() -> _Model:
    """Load once per process; called at startup so a missing file fails immediately."""
    return _Model(model_paths())


def threshold() -> float:
    return max(settings.confidence_threshold, MIN_THRESHOLD)


def model_version() -> str:
    """What made a result, built from the settings in use so it cannot drift from them:
    the model run folders, the temperature and the threshold."""
    runs = "+".join(p.parent.name or str(p) for p in model_paths())
    return f"{runs}; T={settings.temperature:g}; threshold={threshold():g}"


def predict(crop: Optional[CropType], image_path: str) -> Prediction:
    """Diagnose one photo. Without a crop, the crop is detected first (see module docstring)."""
    model = load_model()
    with Image.open(image_path) as image:
        probs = model.probabilities(image)

    def crop_total(c: CropType) -> float:
        return sum(probs[i].item() for i, k in enumerate(model.crops) if k == c)

    detected = crop is None
    if detected:
        crop = max(set(model.crops), key=crop_total)

    in_crop = [i for i, c in enumerate(model.crops) if c == crop]
    best = max(in_crop, key=lambda i: probs[i].item())
    confidence = probs[best].item()
    return Prediction(
        class_name=model.classes[best],
        confidence=confidence,
        crop=crop,
        crop_detected=detected,
        crop_probability=crop_total(crop),
        is_referred=confidence < threshold(),
    )
