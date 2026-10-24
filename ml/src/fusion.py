"""Combine the frozen image model with symptom text (notebook 11).

The image side is the chosen ResNet-50, frozen: each photo's 2048-number summary
(the layer before its output layer) and its 11 output scores are computed once.
The text side is a frozen sentence encoder (``text_encoders``). Only the small
fusion head trains, so a run takes seconds to minutes.

Pairing: during training each diseased photo gets a random *training* sentence of
its own class, except that with probability ``missing_rate`` it gets no text, as a
farmer who leaves the box empty. Healthy photos never have text, because no
trusted source describes healthy leaves; the bias tests below measure what that
does. A fresh pairing is drawn every epoch.

Fusion methods (Stage 2):

- ``late``: the image's own scores and a text-only classifier vote separately and
  are multiplied (a product of experts). Nothing is trained jointly. Text can only
  re-rank the 8 disease classes: the total probability of "diseased" and each
  healthy class stay exactly as the image says, so text cannot push a photo
  towards or away from healthy.
- ``concat``: the two summaries are joined and a small network decides (the
  Chapter 3 default).
- ``gated``: the network learns, per photo, how much of the text to let through.

Attention fusion was not included: with one image vector and one text vector,
attention reduces to weighting the two, which is what the gated head does.

ResNet-50 was trained on the same training photos, so on them it is almost always
right; a head trained on clean features would learn to ignore the text. Feature
dropout and noise on the image summary during training (the same for every head)
simulate uncertain photos so the text gets used.
"""

from dataclasses import dataclass

import numpy as np
import torch
from torch import nn

FUSIONS = ("late", "concat", "gated")
MISSING_RATES = (0.1, 0.2, 0.3, 0.5)


def crop_of(class_name: str) -> str:
    return class_name.split("___")[0]


def healthy_mask(classes: list[str]) -> np.ndarray:
    return np.array(["healthy" in c.lower() for c in classes])


# ------------------------------------------------------------------ text pairing

@dataclass
class TextBank:
    """Sentence vectors per class for one split; classes without sentences are absent."""
    vectors: dict[int, np.ndarray]
    dim: int

    @classmethod
    def build(cls, descriptions, vectors: np.ndarray, classes: list[str], split: str) -> "TextBank":
        """``descriptions``: the reviewed rows (keep == 'y'), aligned with ``vectors``."""
        index = {c: i for i, c in enumerate(classes)}
        rows = descriptions.reset_index(drop=True)
        bank = {}
        for name, group in rows[rows["split"] == split].groupby("class_name"):
            bank[index[name]] = vectors[group.index.to_numpy()]
        return cls(bank, vectors.shape[1])

    def sample(self, labels: np.ndarray, missing_rate: float, rng: np.random.Generator):
        """Random pairing for training: (text vectors, has_text) for each photo."""
        text = np.zeros((len(labels), self.dim), dtype=np.float32)
        has = np.zeros(len(labels), dtype=np.float32)
        for i, label in enumerate(labels):
            pool = self.vectors.get(int(label))
            if pool is not None and rng.random() >= missing_rate:
                text[i] = pool[rng.integers(len(pool))]
                has[i] = 1
        return text, has

    def fixed(self, labels: np.ndarray, seed: int = 0):
        """Deterministic pairing for evaluation: every photo of a class with sentences gets one."""
        return self.sample(labels, 0.0, np.random.default_rng(seed))


def foreign_text(labels: np.ndarray, classes: list[str], bank: TextBank, same_crop: bool, seed: int = 0):
    """Disease sentences attached to (healthy) photos, for the bias tests.

    ``same_crop``: a sentence from a disease of the photo's own crop (a worried
    farmer describing something on a healthy plant); otherwise from any disease.
    """
    rng = np.random.default_rng(seed)
    text = np.zeros((len(labels), bank.dim), dtype=np.float32)
    has = np.zeros(len(labels), dtype=np.float32)
    for i, label in enumerate(labels):
        crop = crop_of(classes[label])
        options = [c for c in bank.vectors if not same_crop or crop_of(classes[c]) == crop]
        if options:
            pool = bank.vectors[options[rng.integers(len(options))]]
            text[i] = pool[rng.integers(len(pool))]
            has[i] = 1
    return text, has


# ------------------------------------------------------------------- fusion heads

class ConcatHead(nn.Module):
    def __init__(self, image_dim: int, text_dim: int, classes: int, hidden: int = 256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(image_dim + text_dim + 1, hidden), nn.ReLU(), nn.Dropout(0.2),
                                 nn.Linear(hidden, classes))

    def forward(self, image, text, has):
        return self.net(torch.cat([image, text * has[:, None], has[:, None]], dim=1))


class GatedHead(nn.Module):
    def __init__(self, image_dim: int, text_dim: int, classes: int, hidden: int = 256):
        super().__init__()
        self.image = nn.Linear(image_dim, hidden)
        self.text = nn.Linear(text_dim, hidden)
        self.gate = nn.Linear(image_dim + text_dim, hidden)
        self.out = nn.Sequential(nn.ReLU(), nn.Dropout(0.2), nn.Linear(hidden, classes))

    def forward(self, image, text, has):
        text = text * has[:, None]
        gate = torch.sigmoid(self.gate(torch.cat([image, text], dim=1))) * has[:, None]
        return self.out(self.image(image) + gate * self.text(text))


class TextClassifier(nn.Module):
    """Text-only classifier over the disease classes, for late fusion."""

    def __init__(self, text_dim: int, diseases: int):
        super().__init__()
        self.net = nn.Sequential(nn.Dropout(0.2), nn.Linear(text_dim, diseases))

    def forward(self, text):
        return self.net(text)


def late_fusion_logits(image_logits: np.ndarray, text_log_probs: np.ndarray, has: np.ndarray,
                       disease: np.ndarray) -> np.ndarray:
    """Image scores, with the disease classes re-ranked by the text where text is given.

    ``text_log_probs`` covers the disease classes only (columns in ``disease`` order).
    Without text the image scores are returned unchanged. With text, the image's
    probabilities of the diseases are multiplied by the text's and rescaled to the
    same total, so healthy classes keep exactly the image's probability.
    """
    log_p = image_logits - np.logaddexp.reduce(image_logits, axis=1, keepdims=True)
    out = log_p.copy()
    rows = has > 0
    if rows.any():
        d = log_p[rows][:, disease]
        combined = d + text_log_probs[rows]
        mass = np.logaddexp.reduce(d, axis=1, keepdims=True)
        combined += mass - np.logaddexp.reduce(combined, axis=1, keepdims=True)
        block = out[rows]
        block[:, disease] = combined
        out[rows] = block
    return out  # log-probabilities, which work as logits


def crop_fusion_probabilities(probs: np.ndarray, text_log_probs: np.ndarray, has: np.ndarray, disease: np.ndarray,
                              class_crops, photo_crops, weight: float = 1.0, within_crop: bool = True,
                              gate: float | None = None) -> np.ndarray:
    """Late fusion as the app would use it (notebook 20): calibrated image probabilities in,
    probabilities out.

    ``weight`` scales the text's vote (the text's probabilities are raised to that power;
    1.0 is the plain product of ``late_fusion_logits``, 0 ignores the text). With
    ``within_crop`` only the diseases of the farmer's crop are re-ranked and their total
    stays as the image says; otherwise all diseases are (the notebook 11 setup). Healthy
    classes are never changed. With ``gate``, text acts only on photos whose image
    confidence for the farmer's crop is below it, so confident answers are left alone.
    """
    class_crops = np.asarray(class_crops)
    log_p = np.log(np.asarray(probs, dtype=np.float64) + 1e-12)
    active = np.asarray(has) > 0
    if gate is not None:
        from .calibration import crop_confidence

        active &= crop_confidence(probs, class_crops, photo_crops)[0] < gate
    if within_crop:
        allowed = class_crops[disease][None, :] == np.asarray(photo_crops)[:, None]
    else:
        allowed = np.ones((len(log_p), len(disease)), dtype=bool)
    d = log_p[:, disease]
    combined = np.where(allowed, d + weight * text_log_probs, -np.inf)
    mass = np.logaddexp.reduce(np.where(allowed, d, -np.inf), axis=1, keepdims=True)
    combined += mass - np.logaddexp.reduce(combined, axis=1, keepdims=True)
    out = log_p.copy()
    out[:, disease] = np.where(active[:, None] & allowed, combined, d)
    return np.exp(out)


# ----------------------------------------------------------------------- training

@dataclass
class Features:
    """Frozen image outputs for one split."""
    image: np.ndarray    # (N, 2048) summaries
    logits: np.ndarray   # (N, classes) ResNet-50's own scores
    labels: np.ndarray   # (N,)


def _tensor(x, device):
    return torch.as_tensor(x, dtype=torch.float32, device=device)


def train_head(kind: str, train: Features, val: Features, train_bank: TextBank, val_bank: TextBank,
               classes: list[str], missing_rate: float, seed: int, device: str = "cpu",
               epochs: int = 40, patience: int = 6, batch_size: int = 256, lr: float = 1e-3,
               feature_dropout: float = 0.5, noise: float = 0.1):
    """Train one fusion head; returns the head at its best epoch (lowest val log-loss with text)."""
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    disease = ~healthy_mask(classes)

    if kind == "late":
        # Text-only classifier over the 8 diseases, trained on the training sentences themselves.
        disease_index = {c: i for i, c in enumerate(np.flatnonzero(disease))}
        xs = np.concatenate([v for v in train_bank.vectors.values()])
        ys = np.concatenate([[disease_index[c]] * len(v) for c, v in train_bank.vectors.items()])
        head = TextClassifier(train_bank.dim, int(disease.sum())).to(device)
        optimizer = torch.optim.AdamW(head.parameters(), lr=lr, weight_decay=1e-2)
        for _ in range(200):
            head.train()
            loss = nn.functional.cross_entropy(head(_tensor(xs, device)), torch.as_tensor(ys, device=device))
            optimizer.zero_grad(); loss.backward(); optimizer.step()
        return head.eval()

    head_class = {"concat": ConcatHead, "gated": GatedHead}[kind]
    head = head_class(train.image.shape[1], train_bank.dim, len(classes)).to(device)
    optimizer = torch.optim.AdamW(head.parameters(), lr=lr, weight_decay=1e-2)
    best, best_loss, waited = None, float("inf"), 0
    labels = torch.as_tensor(train.labels, device=device)
    for _ in range(epochs):
        head.train()
        text, has = train_bank.sample(train.labels, missing_rate, rng)
        text, has = _tensor(text, device), _tensor(has, device)
        order = torch.randperm(len(labels), device=device)
        for start in range(0, len(order), batch_size):
            idx = order[start:start + batch_size]
            image = _tensor(train.image[idx.cpu().numpy()], device)
            image = nn.functional.dropout(image, feature_dropout) + noise * torch.randn_like(image)
            loss = nn.functional.cross_entropy(head(image, text[idx], has[idx]), labels[idx])
            optimizer.zero_grad(); loss.backward(); optimizer.step()
        val_loss = _nll(predict(kind, head, val, *val_bank.fixed(val.labels), classes, device), val.labels)
        if val_loss < best_loss - 1e-4:
            best, best_loss, waited = {k: v.clone() for k, v in head.state_dict().items()}, val_loss, 0
        else:
            waited += 1
            if waited >= patience:
                break
    head.load_state_dict(best)
    return head.eval()


def _nll(logits: np.ndarray, labels: np.ndarray) -> float:
    log_p = logits - np.logaddexp.reduce(logits, axis=1, keepdims=True)
    return float(-log_p[np.arange(len(labels)), labels].mean())


@torch.no_grad()
def predict(kind: str, head, features: Features, text: np.ndarray, has: np.ndarray,
            classes: list[str], device: str = "cpu") -> np.ndarray:
    """Logits for every photo, with the given text pairing (has == 0 means no text)."""
    head.eval()
    if kind == "late":
        disease = ~healthy_mask(classes)
        text_log_probs = torch.log_softmax(head(_tensor(text, device)), dim=1).cpu().numpy()
        return late_fusion_logits(features.logits, text_log_probs, has, np.flatnonzero(disease))
    out = []
    for start in range(0, len(features.labels), 1024):
        end = start + 1024
        out.append(head(_tensor(features.image[start:end], device), _tensor(text[start:end], device),
                        _tensor(has[start:end], device)).cpu().numpy())
    return np.concatenate(out)


# --------------------------------------------------------------------- evaluation

def bias_tests(kind: str, head, features: Features, bank: TextBank, classes: list[str],
               device: str = "cpu") -> dict:
    """The healthy shortcut, measured three ways (as rates; lower is better).

    1. Healthy photos with a disease sentence attached: share pushed to a disease.
    2. Diseased photos with no text: share predicted healthy.
    3. Healthy photos with a sentence from a disease of the same crop: share pushed to a disease.
    Each is compared with the same photos without text (1, 3) or ResNet-50 alone (2).
    """
    healthy = healthy_mask(classes)
    is_healthy = healthy[features.labels]
    none = np.zeros((len(features.labels), bank.dim), np.float32), np.zeros(len(features.labels), np.float32)
    no_text = predict(kind, head, features, *none, classes, device).argmax(1)
    result = {}
    if is_healthy.any():
        subset = Features(features.image[is_healthy], features.logits[is_healthy], features.labels[is_healthy])
        baseline = (~healthy[no_text[is_healthy]]).mean()
        for name, same in [("healthy_with_disease_text", False), ("healthy_with_same_crop_text", True)]:
            text, has = foreign_text(subset.labels, classes, bank, same_crop=same)
            predicted = predict(kind, head, subset, text, has, classes, device).argmax(1)
            result[name] = float((~healthy[predicted]).mean())
        result["healthy_without_text"] = float(baseline)
    if (~is_healthy).any():
        result["diseased_without_text_called_healthy"] = float(healthy[no_text[~is_healthy]].mean())
        result["diseased_called_healthy_by_resnet_alone"] = float(
            healthy[features.logits[~is_healthy].argmax(1)].mean())
    return result
