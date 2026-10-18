"""Calibration and the referral threshold (issue #33, decisions D6 and D7).

A model is calibrated when its confidence matches how often it is right: of the
photos it labels "90% sure", about 90% should be correct. Sproutly refers the
farmer to support contacts whenever the top class's probability is below a
threshold, so that probability has to mean what it says.

Calibration methods compared (each is fitted on one set of photos):

- ``temperature``: divide every score by one learned number T (Guo et al., 2017).
  One parameter, so it cannot overfit a small or nearly error-free set; it never
  changes which class is predicted; the backend applies it with one division.
- ``vector``: one scale and one offset per class (Guo et al., 2017). More
  flexible, but its 22 parameters can overfit when the fitting set has few
  errors, and the per-class offsets can change which class is predicted, so it
  alters the diagnosis as well as the confidence.
- ``dirichlet``: a full matrix over the log-probabilities, so every class can
  shift every other (Kull et al., 2019), with the off-diagonal weights pulled
  towards zero to limit overfitting. The most flexible scaling method; like
  vector scaling it can change the predicted class.
- ``histogram``: groups photos by top probability into equal-sized bins and
  replaces the probability with each bin's observed accuracy (Zadrozny and Elkan,
  2001). Simple and assumption-free, but coarse.
- ``isotonic``: a stepwise, increasing mapping from the top probability to the
  observed accuracy (Zadrozny and Elkan, 2002). Keeps the predicted class and
  makes no shape assumption, but needs many errors to learn from, and ships as a
  lookup table.

``compare`` scores every method out of sample: each is fitted on four fifths of
the photos and scored on the remaining fifth, rotating through all five, and the
whole split is repeated with several seeds. Scoring a method on the photos it
was fitted on would favour the most flexible ones.

How well "refer when unsure" works is measured with the risk-coverage curve:
coverage is the share of photos answered (not referred), risk the share of those
answered wrongly. AURC, the area under that curve, summarises it over every
possible threshold; lower is better (Geifman and El-Yaniv, 2017).
"""

from dataclasses import dataclass

import numpy as np

from src import metrics

METHODS = ("none", "temperature", "vector", "dirichlet", "histogram", "isotonic")
# Methods that only change the confidence, never the predicted class.
KEEPS_PREDICTION = ("none", "temperature", "histogram", "isotonic")


def _log_softmax(logits: np.ndarray) -> np.ndarray:
    return logits - np.logaddexp.reduce(logits, axis=1, keepdims=True)


# --------------------------------------------------------------------- calibrators

@dataclass
class Calibrator:
    method: str
    params: dict

    def probabilities(self, logits: np.ndarray) -> np.ndarray:
        logits = np.asarray(logits, dtype=np.float64)
        if self.method == "none":
            return metrics.softmax(logits)
        if self.method == "temperature":
            return metrics.softmax(logits / self.params["temperature"])
        if self.method == "vector":
            return metrics.softmax(logits * self.params["scale"] + self.params["bias"])
        if self.method == "dirichlet":
            return metrics.softmax(_log_softmax(logits) @ self.params["weights"].T + self.params["bias"])
        if self.method in ("histogram", "isotonic"):
            probs = metrics.softmax(logits)
            top = probs.max(axis=1)
            second = np.sort(probs, axis=1)[:, -2]
            rest = np.clip(1 - top, 1e-12, None)
            if self.method == "histogram":
                bin_of = np.clip(np.searchsorted(self.params["edges"], top, side="right") - 1,
                                 0, len(self.params["accuracy"]) - 1)
                new_top = self.params["accuracy"][bin_of]
            else:
                new_top = np.interp(top, self.params["x"], self.params["y"])
            # Never so low that a rescaled runner-up would overtake it: calibration must
            # change the confidence, not the diagnosis.
            new_top = np.minimum(np.maximum(new_top, second / (rest + second) + 1e-9), 1.0)
            # Keep the other classes in proportion, so the probabilities still sum to 1.
            scaled = probs * ((1 - new_top) / rest)[:, None]
            scaled[np.arange(len(probs)), probs.argmax(axis=1)] = new_top
            return scaled
        raise ValueError(f"Unknown method {self.method!r}")


def _fit_temperature(logits: np.ndarray, labels: np.ndarray) -> dict:
    """The T that minimises log-loss; searched on a log scale, which is exact enough for one number."""
    log_ts = np.linspace(np.log(0.05), np.log(20.0), 801)
    losses = [_nll(logits / np.exp(t), labels) for t in log_ts]
    best = log_ts[int(np.argmin(losses))]
    fine = np.linspace(best - 0.02, best + 0.02, 81)  # refine around the best grid point
    best = fine[int(np.argmin([_nll(logits / np.exp(t), labels) for t in fine]))]
    return {"temperature": float(np.exp(best))}


def _fit_vector(logits: np.ndarray, labels: np.ndarray, steps: int = 500, lr: float = 0.05,
                l2: float = 1e-3) -> dict:
    """Per-class scale and bias by gradient descent on log-loss, starting from no change."""
    import torch

    x = torch.as_tensor(logits, dtype=torch.float64)
    y = torch.as_tensor(labels, dtype=torch.long)
    scale = torch.ones(x.shape[1], dtype=torch.float64, requires_grad=True)
    bias = torch.zeros(x.shape[1], dtype=torch.float64, requires_grad=True)
    optimizer = torch.optim.Adam([scale, bias], lr=lr)
    for _ in range(steps):
        loss = torch.nn.functional.cross_entropy(x * scale + bias, y)
        # A little pull towards "no change" so classes with no errors are not pushed to extremes.
        loss = loss + l2 * (((scale - 1) ** 2).sum() + (bias ** 2).sum())
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    return {"scale": scale.detach().numpy(), "bias": bias.detach().numpy()}


def _fit_dirichlet(logits: np.ndarray, labels: np.ndarray, steps: int = 500, lr: float = 0.05,
                   off_diagonal: float = 1e-2, l2: float = 1e-3) -> dict:
    """Matrix on the log-probabilities plus a bias; off-diagonal weights pulled to zero (ODIR)."""
    import torch

    x = torch.as_tensor(_log_softmax(logits), dtype=torch.float64)
    y = torch.as_tensor(labels, dtype=torch.long)
    k = x.shape[1]
    weights = torch.eye(k, dtype=torch.float64, requires_grad=True)
    bias = torch.zeros(k, dtype=torch.float64, requires_grad=True)
    mask = 1 - torch.eye(k, dtype=torch.float64)
    optimizer = torch.optim.Adam([weights, bias], lr=lr)
    for _ in range(steps):
        loss = torch.nn.functional.cross_entropy(x @ weights.T + bias, y)
        loss = loss + off_diagonal * ((weights * mask) ** 2).sum() + l2 * (bias ** 2).sum()
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    return {"weights": weights.detach().numpy(), "bias": bias.detach().numpy()}


def _fit_histogram(logits: np.ndarray, labels: np.ndarray, bins: int = 10) -> dict:
    """Equal-count bins of top probability; each bin's value is its observed accuracy."""
    probs = metrics.softmax(logits)
    top = probs.max(axis=1)
    correct = (probs.argmax(axis=1) == labels).astype(float)
    edges = np.unique(np.quantile(top, np.linspace(0, 1, bins + 1)))
    edges[0], edges[-1] = 0.0, 1.0 + 1e-9
    which = np.clip(np.searchsorted(edges, top, side="right") - 1, 0, len(edges) - 2)
    accuracy = np.array([correct[which == b].mean() if (which == b).any() else np.nan
                         for b in range(len(edges) - 1)])
    # An empty bin borrows from its neighbour so every confidence maps somewhere.
    for b in range(len(accuracy)):
        if np.isnan(accuracy[b]):
            accuracy[b] = accuracy[b - 1] if b else np.nanmean(accuracy)
    return {"edges": edges, "accuracy": accuracy}


def _fit_isotonic(logits: np.ndarray, labels: np.ndarray) -> dict:
    from sklearn.isotonic import IsotonicRegression

    probs = metrics.softmax(logits)
    top = probs.max(axis=1)
    correct = (probs.argmax(axis=1) == labels).astype(float)
    model = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(top, correct)
    return {"x": model.X_thresholds_, "y": model.y_thresholds_}


def fit(method: str, logits: np.ndarray, labels: np.ndarray) -> Calibrator:
    logits = np.asarray(logits, dtype=np.float64)
    labels = np.asarray(labels)
    fitters = {"none": lambda *_: {}, "temperature": _fit_temperature, "vector": _fit_vector,
               "dirichlet": _fit_dirichlet, "histogram": _fit_histogram, "isotonic": _fit_isotonic}
    if method not in fitters:
        raise ValueError(f"Unknown method {method!r}; choose from {METHODS}")
    return Calibrator(method, fitters[method](logits, labels))


# ------------------------------------------------------------------------- metrics

def _nll(logits: np.ndarray, labels: np.ndarray) -> float:
    return float(-_log_softmax(logits)[np.arange(len(labels)), labels].mean())


def brier(probs: np.ndarray, labels: np.ndarray) -> float:
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(labels)), labels] = 1
    return float(((probs - onehot) ** 2).sum(axis=1).mean())


def risk_coverage(confidence: np.ndarray, correct: np.ndarray):
    """Coverage and risk when answering only the k most confident photos, for every k."""
    order = np.argsort(-confidence, kind="stable")
    errors = np.cumsum(~correct[order])
    answered = np.arange(1, len(order) + 1)
    return answered / len(order), errors / answered


def aurc(confidence: np.ndarray, correct: np.ndarray) -> float:
    """Area under the risk-coverage curve (mean risk over all coverages); lower is better."""
    _, risk = risk_coverage(confidence, np.asarray(correct, dtype=bool))
    return float(risk.mean())


def summarise(probs: np.ndarray, labels: np.ndarray) -> dict:
    confidence = probs.max(axis=1)
    correct = probs.argmax(axis=1) == labels
    return {
        "images": int(len(labels)),
        "accuracy": float(correct.mean()),
        "ece": metrics.expected_calibration_error(confidence, correct),
        "nll": float(-np.log(probs[np.arange(len(labels)), labels] + 1e-12).mean()),
        "brier": brier(probs, labels),
        "aurc": aurc(confidence, correct),
        "mean_confidence": float(confidence.mean()),
    }


# ----------------------------------------------------------------------- threshold

def at_threshold(confidence: np.ndarray, correct: np.ndarray, threshold: float) -> dict:
    """What happens in the app at one threshold: who is answered, and how often correctly."""
    answered = confidence >= threshold
    return {
        "threshold": float(threshold),
        "coverage": float(answered.mean()),
        "referred": float(1 - answered.mean()),
        "selective_accuracy": float(correct[answered].mean()) if answered.any() else float("nan"),
        "wrong_and_answered": float((answered & ~correct).mean()),
    }


def threshold_for_accuracy(confidence: np.ndarray, correct: np.ndarray, target: float,
                           floor: float = 0.5) -> float:
    """Lowest threshold whose answered photos are at least ``target`` accurate (Chapter 3's rule).

    The lowest such threshold answers the most farmers while keeping the promise.
    If no threshold reaches the target, everything is referred (threshold 1.0).
    """
    order = np.argsort(-confidence, kind="stable")
    conf, ok = confidence[order], np.asarray(correct, dtype=bool)[order]
    accuracy = np.cumsum(ok) / np.arange(1, len(ok) + 1)
    # Only cut where the confidence changes, so ties are answered or referred together.
    cut_points = np.flatnonzero(np.r_[conf[1:] < conf[:-1], True])
    meets = cut_points[accuracy[cut_points] >= target]
    if len(meets) == 0:
        return 1.0
    return float(max(conf[meets.max()], floor))


def threshold_for_cost(confidence: np.ndarray, correct: np.ndarray, cost_wrong: float,
                       cost_referral: float = 1.0, floor: float = 0.5) -> float:
    """Threshold with the lowest expected cost, when a wrong answer costs ``cost_wrong`` referrals."""
    candidates = np.unique(np.r_[confidence, 1.0])
    candidates = candidates[candidates >= floor]
    if len(candidates) == 0:
        return floor
    ok = np.asarray(correct, dtype=bool)
    costs = [((confidence >= t) & ~ok).mean() * cost_wrong + (confidence < t).mean() * cost_referral
             for t in candidates]
    return float(candidates[int(np.argmin(costs))])


# ------------------------------------------------------------------ app confidence

def crop_confidence(probs: np.ndarray, class_crops, photo_crops) -> tuple[np.ndarray, np.ndarray]:
    """The confidence the app shows: the farmer names the crop, the answer is the best class
    of that crop, and its confidence is that class's 11-class probability, NOT rescaled over
    the crop (sproutly-backend/app/core/classifier.py). Returns (confidence, predicted index)."""
    class_crops = np.asarray(class_crops)
    photo_crops = np.asarray(photo_crops)
    in_crop = class_crops[None, :] == photo_crops[:, None]
    masked = np.where(in_crop, probs, -1.0)
    predicted = masked.argmax(axis=1)
    return probs[np.arange(len(probs)), predicted], predicted


# ----------------------------------------------------------------------- comparison

def out_of_fold(method: str, logits: np.ndarray, labels: np.ndarray, folds: int = 5, seed: int = 42) -> np.ndarray:
    """Calibrated probabilities where every photo is scored by a calibrator fitted without it."""
    logits = np.asarray(logits, dtype=np.float64)
    labels = np.asarray(labels)
    parts = np.array_split(np.random.default_rng(seed).permutation(len(labels)), folds)
    probs = np.zeros_like(logits)
    for k, held_out in enumerate(parts):
        fitted_on = np.concatenate([p for j, p in enumerate(parts) if j != k])
        probs[held_out] = fit(method, logits[fitted_on], labels[fitted_on]).probabilities(logits[held_out])
    return probs


def compare(logits: np.ndarray, labels: np.ndarray, methods=METHODS, folds: int = 5,
            repeats: int = 3, seed: int = 42):
    """Out-of-sample scores for every method: one row per method and repeat.

    In each repeat the photos are shuffled into ``folds`` parts; every method is fitted
    on all parts but one and predicts the held-out part, so every photo is scored by a
    calibrator that never saw it. Scores are computed on the pooled held-out predictions.
    """
    import pandas as pd

    logits = np.asarray(logits, dtype=np.float64)
    labels = np.asarray(labels)
    original = logits.argmax(axis=1)
    rows = []
    for repeat in range(repeats):
        for method in methods:
            probs = out_of_fold(method, logits, labels, folds, seed + repeat)
            rows.append({"method": method, "repeat": repeat, **summarise(probs, labels),
                         "changed_predictions": float((probs.argmax(axis=1) != original).mean())})
    return pd.DataFrame(rows)


def choose_method(table, eligible=KEEPS_PREDICTION, default: str = "temperature") -> tuple[str, str]:
    """D6: lowest out-of-sample log-loss among methods that keep the predicted class.

    A tie (the best's mean plus one standard deviation over repeats reaches another's mean
    minus one) keeps ``default``, the simplest method, if it is among the tied.
    """
    summary = table.groupby("method").agg(nll=("nll", "mean"), nll_sd=("nll", "std")).fillna(0.0)
    candidates = summary.loc[[m for m in summary.index if m in eligible]]
    best = candidates["nll"].idxmin()
    tied = candidates[candidates["nll"] - candidates["nll_sd"]
                      <= candidates.loc[best, "nll"] + candidates.loc[best, "nll_sd"]].index.tolist()
    if len(tied) > 1 and default in tied:
        return default, f"tie between {sorted(tied)}: {default} kept as the simplest"
    return best, "lowest out-of-sample log-loss" + (f" (tie {sorted(tied)}, {default} not among them)" if len(tied) > 1 else "")


# ------------------------------------------------------------------------- decisions

def compare_models(conf_a, correct_a, conf_b, correct_b, n: int = 1000, seed: int = 42) -> dict:
    """D2: does model b refer better than model a? AURC of each and a paired bootstrap of
    (b - a), resampling the same photos for both. b wins only if the whole interval is
    below zero, i.e. lower beyond the bootstrap range; otherwise a (the simpler) stays."""
    arrays = [np.asarray(x) for x in (conf_a, correct_a, conf_b, correct_b)]
    low, high = bootstrap(lambda ca, ka, cb, kb: aurc(cb, kb) - aurc(ca, ka), *arrays, n=n, seed=seed)
    return {"aurc_a": aurc(arrays[0], arrays[1]), "aurc_b": aurc(arrays[2], arrays[3]),
            "difference_b_minus_a": aurc(arrays[2], arrays[3]) - aurc(arrays[0], arrays[1]),
            "difference_low": low, "difference_high": high, "b_wins": bool(high < 0)}


def choose_threshold(confidence, correct, target: float = 0.90, cost_wrong: float = 5.0, floor: float = 0.5,
                     n: int = 1000, seed: int = 42) -> dict:
    """D7: the lowest threshold whose answered photos are at least ``target`` accurate, with a
    bootstrap range; if no threshold reaches the target, the cost-based threshold (a wrong
    answer costs ``cost_wrong`` referrals) is used instead and that is reported. The
    cost-based threshold is always computed as a cross-check."""
    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    by_accuracy = threshold_for_accuracy(confidence, correct, target, floor)
    by_cost = threshold_for_cost(confidence, correct, cost_wrong, floor=floor)
    reachable = by_accuracy < 1.0
    chosen = by_accuracy if reachable else by_cost
    low, high = bootstrap(lambda c, k: threshold_for_accuracy(c, k, target, floor), confidence, correct, n=n, seed=seed)
    return {"threshold": chosen, "rule": f"lowest threshold with >= {target:.0%} accuracy on answered photos"
            if reachable else f"{target:.0%} unreachable; cost-based (wrong answer = {cost_wrong:g} referrals)",
            "target_reachable": bool(reachable), "accuracy_rule_low": low, "accuracy_rule_high": high,
            "cost_based_threshold": by_cost, **{k: v for k, v in at_threshold(confidence, correct, chosen).items()
                                                if k != "threshold"}}


def accuracy_lower_bounds(confidence, correct, thresholds, n: int = 1000, seed: int = 42, level: float = 0.95):
    """For each threshold, the lower end of the bootstrap range of accuracy on answered photos.
    A resample in which no photo is answered counts as 0: nothing could be verified."""
    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    thresholds = np.asarray(thresholds, dtype=float)
    rng = np.random.default_rng(seed)
    values = np.empty((n, len(thresholds)))
    for b in range(n):
        idx = rng.integers(0, len(confidence), len(confidence))
        order = np.argsort(-confidence[idx], kind="stable")
        conf, ok = confidence[idx][order], correct[idx][order]
        right = np.r_[0, np.cumsum(ok)]
        answered = np.searchsorted(-conf, -thresholds, side="right")  # photos with confidence >= threshold
        values[b] = np.where(answered > 0, right[answered] / np.maximum(answered, 1), 0.0)
    return np.percentile(values, (1 - level) / 2 * 100, axis=0)


def choose_threshold_verified(confidence, correct, target: float = 0.90, cost_wrong: float = 5.0, floor: float = 0.5,
                              step: float = 0.001, n: int = 1000, seed: int = 42) -> dict:
    """D7 as clarified on 18 Oct, after the original rule was met by only 2 photos: the lowest
    threshold whose bootstrap lower bound of accuracy on answered photos is at least ``target``.
    If no threshold reaches that, the pre-set cost-based fallback is used."""
    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    grid = np.round(np.arange(floor, 1.0, step), 6)
    bounds = accuracy_lower_bounds(confidence, correct, grid, n, seed)
    meets = grid[bounds >= target]
    reachable = len(meets) > 0
    chosen = float(meets.min()) if reachable else threshold_for_cost(confidence, correct, cost_wrong, floor=floor)
    return {"threshold": chosen, "target_reachable": bool(reachable),
            "rule": f"lowest threshold whose bootstrap lower bound of accuracy on answered photos is >= {target:.0%}"
            if reachable else f"{target:.0%} not reachable with confidence; pre-set cost-based fallback (wrong answer = {cost_wrong:g} referrals)",
            "original_rule_threshold": threshold_for_accuracy(confidence, correct, target, floor),
            "best_lower_bound": float(bounds.max()), "threshold_at_best_lower_bound": float(grid[int(bounds.argmax())])}


def sensitivity(confidence, correct, targets=(0.70, 0.75, 0.80, 0.85, 0.90, 0.95), floor: float = 0.5):
    """What each accuracy target would mean in the app: threshold, share answered, accuracy."""
    import pandas as pd

    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    rows = []
    for target in targets:
        t = threshold_for_accuracy(confidence, correct, target, floor)
        rows.append({"target": target, "reachable": t < 1.0, **at_threshold(confidence, correct, t)})
    return pd.DataFrame(rows)


def reliability(confidence, correct, bins: int = 10):
    """Equal-width confidence bins: mean confidence, accuracy and photo count in each."""
    import pandas as pd

    confidence = np.asarray(confidence, dtype=float)
    correct = np.asarray(correct, dtype=bool)
    which = np.clip((confidence * bins).astype(int), 0, bins - 1)
    rows = [{"bin": b, "confidence": confidence[which == b].mean(), "accuracy": correct[which == b].mean(),
             "photos": int((which == b).sum())} for b in range(bins) if (which == b).any()]
    return pd.DataFrame(rows)


# ------------------------------------------------------------------------ bootstrap

def bootstrap(statistic, *arrays, n: int = 1000, seed: int = 42, level: float = 0.95):
    """Percentile interval for ``statistic(*arrays)``, resampling photos with replacement."""
    rng = np.random.default_rng(seed)
    size = len(arrays[0])
    values = np.array([statistic(*(a[idx] for a in arrays))
                       for idx in (rng.integers(0, size, size) for _ in range(n))])
    tail = (1 - level) / 2 * 100
    return float(np.nanpercentile(values, tail)), float(np.nanpercentile(values, 100 - tail))
