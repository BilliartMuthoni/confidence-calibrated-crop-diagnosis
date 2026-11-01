"""Symptom text (objective iii, notebooks 20 and 20b): the farmer's description reorders the
diseases of their crop on photos the app refers, so the officer sees a better first guess.

Notebook 20b compared 96 ways of combining text and photo on unseen field photos, with a rule
fixed before the run, and chose: TF-IDF (word and word-pair counts weighted by rarity), one
linear layer over the 8 diseases, trained on 82 factsheet sentences; the text's probabilities
raised to the power 0.25 multiply the photo's within the farmer's crop, and the diseases keep
the photo's total, so healthy is never changed. Safety condition: the photo alone decides
whether the farmer gets an answer, and the text acts only on photos that are referred.
Result: +0.43 points on the officer's first guess with a matching description, 0.71% harm with
a wrong one; language models helped more but changed 12-17% of correct diagnoses.

Everything comes from text_model.json (ml/results/fusion_d20b). The classifier is rebuilt here
with NumPy alone, and it must reproduce the notebook's log-probabilities for the 16 locked test
sentences saved in the file, or it refuses to load.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

from app.core.config import settings

CHECK_TOLERANCE = 1e-4


class _TextModel:
    def __init__(self, path: Path):
        if not path.exists():
            raise FileNotFoundError(
                f"Symptom text model not found at {path.resolve()}. Copy ml/results/fusion_d20b/text_model.json "
                "there, or set TEXT_MODEL_PATH in .env (blank switches the text off)."
            )
        saved = json.loads(path.read_text())
        if saved["encoder"] != "tfidf" or saved["ngram_range"] != [1, 2] or not saved["sublinear_tf"]:
            raise ValueError("text_model.json is not the TF-IDF setup this code reproduces")
        self.token = re.compile(saved["token_pattern"])
        self.vocabulary: dict[str, int] = saved["vocabulary"]
        self.idf = np.array(saved["idf"])
        self.weight = np.array(saved["weight"])
        self.bias = np.array(saved["bias"])
        self.diseases: list[str] = saved["diseases"]
        self.text_weight = float(saved["fusion"]["weight"])
        self.sentences = int(saved["sentences"])
        for check in saved["checks"]:
            got = self.log_probs(check["text"])
            if got is None or np.abs(got - np.array(check["log_probs"])).max() > CHECK_TOLERANCE:
                raise ValueError(f"The text model does not reproduce notebook 20b for: {check['text']!r}")

    def log_probs(self, text: str) -> Optional[np.ndarray]:
        """Log-probabilities over self.diseases, or None when no word of the text is known
        (the classifier would then answer from its bias alone, which says nothing about the leaf)."""
        words = self.token.findall(text.lower())
        counts: dict[int, int] = {}
        for term in words + [" ".join(pair) for pair in zip(words, words[1:])]:
            index = self.vocabulary.get(term)
            if index is not None:
                counts[index] = counts.get(index, 0) + 1
        if not counts:
            return None
        vector = np.zeros(len(self.idf))
        for index, count in counts.items():
            vector[index] = (1 + np.log(count)) * self.idf[index]
        vector /= np.linalg.norm(vector)
        z = self.weight @ vector + self.bias
        return z - np.logaddexp.reduce(z)


@lru_cache(maxsize=1)
def load_text_model() -> Optional[_TextModel]:
    """Load once per process; None when TEXT_MODEL_PATH is blank (text switched off)."""
    path = settings.text_model_path.strip()
    return _TextModel(Path(path)) if path else None


def reorder(classes: list[str], probs: list[float], text: Optional[str]) -> Optional[list[float]]:
    """The crop's probabilities with its diseases reordered by the text, or None if the text is
    off, empty or has no known word. ``classes`` and ``probs`` are the farmer's crop's classes and
    the photo's probabilities among them; healthy keeps its probability and the diseases their total."""
    model = load_text_model()
    if model is None or not text or not text.strip():
        return None
    text_lp = model.log_probs(text)
    if text_lp is None:
        return None
    disease = [i for i, name in enumerate(classes) if name in model.diseases]
    if not disease:
        return None
    log_p = np.log(np.array(probs, dtype=np.float64) + 1e-12)
    d = log_p[disease]
    combined = d + model.text_weight * np.array([text_lp[model.diseases.index(classes[i])] for i in disease])
    combined += np.logaddexp.reduce(d) - np.logaddexp.reduce(combined)
    out = log_p.copy()
    out[disease] = combined
    return list(np.exp(out))


def label() -> str:
    """For the model version and the admin Model page."""
    model = load_text_model()
    if model is None:
        return "off"
    return f"TF-IDF, weight {model.text_weight:g}, {model.sentences} sentences, referred photos only"
