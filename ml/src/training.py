"""Fine-tune an ImageNet-pretrained network on the split images.

EfficientNet-B0 is the baseline; the other ARCHITECTURES are trained the same
way for the comparison in notebook 09.

One epoch = one pass over the training images. After each epoch the model is
scored on validation; the best epoch (by macro-F1) is kept in best.pt and the
latest state in last.pt, so a Colab disconnect only loses the current epoch and
fit() resumes from last.pt. Training stops early once validation has not
improved for `patience` epochs.
"""

import json
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import models
from tqdm.auto import tqdm

from src import metrics

# Every architecture in the comparison: its torchvision constructor and the ImageNet
# weights it starts from (the best set torchvision publishes for each).
ARCHITECTURES = {
    "efficientnet_b0": (models.efficientnet_b0, models.EfficientNet_B0_Weights.IMAGENET1K_V1),
    "mobilenet_v3_large": (models.mobilenet_v3_large, models.MobileNet_V3_Large_Weights.IMAGENET1K_V2),
    "resnet50": (models.resnet50, models.ResNet50_Weights.IMAGENET1K_V2),
    "densenet121": (models.densenet121, models.DenseNet121_Weights.IMAGENET1K_V1),
    "convnext_tiny": (models.convnext_tiny, models.ConvNeXt_Tiny_Weights.IMAGENET1K_V1),
    "swin_t": (models.swin_t, models.Swin_T_Weights.IMAGENET1K_V1),
}


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _head(model: nn.Module) -> tuple[str, nn.Linear]:
    """The output layer: the last Linear layer in every architecture above."""
    return [(name, layer) for name, layer in model.named_modules() if isinstance(layer, nn.Linear)][-1]


def build_model(num_classes: int, architecture: str = "efficientnet_b0", pretrained: bool = True) -> nn.Module:
    """The network with its 1000-class ImageNet output layer replaced by one for our classes."""
    constructor, weights = ARCHITECTURES[architecture]
    model = constructor(weights=weights if pretrained else None)
    name, layer = _head(model)
    parent, _, attribute = name.rpartition(".")
    setattr(model.get_submodule(parent), attribute, nn.Linear(layer.in_features, num_classes))
    return model


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


@torch.no_grad()
def cpu_milliseconds_per_image(model: nn.Module, image_size: int, threads: int = 2, runs: int = 30) -> float:
    """Median time to classify one image on the CPU, as the backend does (no GPU)."""
    previous = torch.get_num_threads()
    torch.set_num_threads(threads)
    model = model.cpu().eval()
    image = torch.randn(1, 3, image_size, image_size)
    try:
        for _ in range(5):  # warm-up runs are not timed
            model(image)
        times = []
        for _ in range(runs):
            began = time.perf_counter()
            model(image)
            times.append((time.perf_counter() - began) * 1000)
    finally:
        torch.set_num_threads(previous)
    return float(np.median(times))


@torch.no_grad()
def predict(model: nn.Module, loader: DataLoader, device: str) -> tuple[np.ndarray, np.ndarray]:
    """Raw scores (logits) and labels for every image in the loader, in order."""
    model.eval()
    all_logits, all_labels = [], []
    for images, labels in tqdm(loader, desc="Predicting", leave=False):
        with torch.autocast(device_type="cuda", enabled=device == "cuda"):
            logits = model(images.to(device, non_blocking=True))
        all_logits.append(logits.float().cpu().numpy())
        all_labels.append(labels.numpy())
    return np.concatenate(all_logits), np.concatenate(all_labels)


def balanced_class_weights(labels, num_classes: int, cap: float = 5.0) -> list[float]:
    """One loss weight per class index: total / (classes x class photos), as scikit-learn's
    "balanced", capped at ``cap`` so a very small class cannot dominate the loss."""
    counts = np.bincount(np.asarray(labels, dtype=int), minlength=num_classes)
    if (counts == 0).any():
        raise ValueError(f"No training photos for class index {np.flatnonzero(counts == 0).tolist()}")
    return np.minimum(counts.sum() / (num_classes * counts), cap).round(4).tolist()


def _train_epoch(model, loader, optimizer, scheduler, scaler, device, class_weights=None) -> float:
    model.train()
    weight = None if class_weights is None else torch.tensor(class_weights, dtype=torch.float32, device=device)
    loss_fn = nn.CrossEntropyLoss(weight=weight)
    total, count = 0.0, 0
    for images, labels in tqdm(loader, desc="Training", leave=False):
        images, labels = images.to(device, non_blocking=True), labels.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        with torch.autocast(device_type="cuda", enabled=device == "cuda"):
            loss = loss_fn(model(images), labels)
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        scheduler.step()
        total += loss.item() * len(labels)
        count += len(labels)
    return total / count


def fit(model, train_loader, val_loader, run_dir: Path, settings: dict, device: str) -> pd.DataFrame:
    """Train with AdamW and a cosine learning-rate schedule; returns the per-epoch history.

    ``settings["class_weights"]`` (optional, one per class index) weights the training loss;
    without it every photo counts the same, as in every run before D22.
    """
    run_dir.mkdir(parents=True, exist_ok=True)
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=settings["learning_rate"], weight_decay=settings["weight_decay"])
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=settings["learning_rate"], total_steps=settings["epochs"] * len(train_loader), pct_start=0.1
    )
    scaler = torch.amp.GradScaler(enabled=device == "cuda")
    history, start, best, stale = [], 0, -1.0, 0

    last = run_dir / "last.pt"
    if last.exists():
        state = torch.load(last, map_location=device, weights_only=False)
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        scheduler.load_state_dict(state["scheduler"])
        scaler.load_state_dict(state["scaler"])
        history, best, stale = state["history"], state["best"], state["stale"]
        start = len(history)
        print(f"Resuming after epoch {start} (best validation macro-F1 so far {best:.4f})")

    num_classes = _head(model)[1].out_features
    for epoch in range(start, settings["epochs"]):
        began = time.time()
        train_loss = _train_epoch(model, train_loader, optimizer, scheduler, scaler, device,
                                  settings.get("class_weights"))
        logits, labels = predict(model, val_loader, device)
        val = metrics.summarise(logits, labels, num_classes)
        improved = val["macro_f1"] > best
        if improved:
            best, stale = val["macro_f1"], 0
            torch.save(model.state_dict(), run_dir / "best.pt")
        else:
            stale += 1
        history.append({
            "epoch": epoch + 1, "train_loss": train_loss, "val_loss": val["nll"], "val_accuracy": val["accuracy"],
            "val_macro_f1": val["macro_f1"], "val_ece": val["ece"], "minutes": (time.time() - began) / 60,
        })
        print(f"Epoch {epoch + 1}/{settings['epochs']}: train loss {train_loss:.4f} | val loss {val['nll']:.4f} "
              f"| val acc {val['accuracy']:.4f} | val macro-F1 {val['macro_f1']:.4f}{'  (best)' if improved else ''} "
              f"| {history[-1]['minutes']:.1f} min")
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(), "scheduler": scheduler.state_dict(),
                    "scaler": scaler.state_dict(), "history": history, "best": best, "stale": stale}, last)
        pd.DataFrame(history).to_csv(run_dir / "history.csv", index=False)
        if stale >= settings["patience"]:
            print(f"Stopping early: no improvement for {settings['patience']} epochs.")
            break
    return pd.DataFrame(history)


def export(model: nn.Module, classes: list[str], image_size: int, mean, std, path: Path, settings: dict,
           architecture: str = "efficientnet_b0") -> None:
    """Save the weights plus everything the backend needs to use them (one self-contained file)."""
    torch.save({
        "architecture": architecture,
        "state_dict": model.state_dict(),
        "classes": classes,
        "image_size": image_size,
        "mean": list(mean),
        "std": list(std),
        "settings": settings,
    }, path)


def save_predictions(rows: pd.DataFrame, logits: np.ndarray, classes: list[str], path_csv: Path) -> pd.DataFrame:
    """One row per image: true class, predicted class, confidence; logits are saved alongside for calibration."""
    probs = metrics.softmax(logits)
    out = rows[["path", "class", "source"]].reset_index(drop=True).copy()
    out["predicted"] = [classes[i] for i in probs.argmax(axis=1)]
    out["confidence"] = probs.max(axis=1)
    out["correct"] = out["predicted"] == out["class"]
    out.to_csv(path_csv, index=False)
    np.save(path_csv.with_suffix(".logits.npy"), logits)
    return out


def save_json(data: dict, path: Path) -> None:
    path.write_text(json.dumps(data, indent=2, default=float))
