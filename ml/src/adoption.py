"""D17 adoption rule: is the model trained with extra field photos really better than v1?

Fixed on 20 Oct 2026, before notebook 15 trained anything.

Training has luck in it: the same model trained with another seed scores a little
differently. So the new model is trained with 3 seeds, and the comparison uses

- the **seed spread** (best minus worst seed), the luck from training, and
- a **paired bootstrap** over the selection-set photos (the same photos resampled for both
  models), the luck from which photos happen to be in the set.

The measure is accuracy on the selection set with the crop given, as the app works.

Stage 1 (v1 has only its one original seed): the result is **clear** if the difference
between the new models' mean and v1 is more than twice the new models' seed spread AND the
bootstrap 95% range excludes zero. Clear: decide now. Otherwise **close**: train 2 more v1
seeds and go to stage 2.

Stage 2 (3 seeds each): the new model is better if the mean difference is larger than the
bigger of the two seed spreads AND the bootstrap range is entirely above zero.

Either way the new model is adopted only if it is better AND validation macro-F1 is not
worse: a drop no larger than the seed spread of validation macro-F1. PlantDoc is reported
only and never decides.
"""

import numpy as np

from src.calibration import bootstrap


def _spread(values: np.ndarray) -> float:
    return float(values.max() - values.min()) if len(values) > 1 else float("nan")


def decide(new_correct, v1_correct, new_val_f1, v1_val_f1, n: int = 1000, seed: int = 42) -> dict:
    """Apply the rule.

    new_correct, v1_correct: one row per seed, one column per selection photo (same photos,
    same order), True where the model is right with the crop given.
    new_val_f1, v1_val_f1: validation macro-F1 per seed.
    """
    new = np.atleast_2d(np.asarray(new_correct, dtype=float))
    old = np.atleast_2d(np.asarray(v1_correct, dtype=float))
    assert new.shape[1] == old.shape[1], "both models must be scored on the same photos"
    assert len(new) >= 2, "the new model needs at least 2 seeds to measure its spread"
    new_val, old_val = np.asarray(new_val_f1, dtype=float), np.asarray(v1_val_f1, dtype=float)

    acc_new, acc_old = new.mean(axis=1), old.mean(axis=1)
    difference = float(acc_new.mean() - acc_old.mean())
    spread_new, spread_old = _spread(acc_new), _spread(acc_old)
    per_photo = new.mean(axis=0) - old.mean(axis=0)
    low, high = bootstrap(np.mean, per_photo, n=n, seed=seed)
    excludes_zero = low > 0 or high < 0

    val_drop = float(old_val.mean() - new_val.mean())
    val_allowed = float(np.nanmax([_spread(new_val), _spread(old_val)]))
    val_ok = val_drop <= val_allowed

    result = {
        "stage": 1 if len(old) == 1 else 2,
        "seeds_new": len(new), "seeds_v1": len(old),
        "selection_accuracy_new_per_seed": acc_new.round(4).tolist(),
        "selection_accuracy_v1_per_seed": acc_old.round(4).tolist(),
        "difference_new_minus_v1": difference,
        "seed_spread_new": spread_new, "seed_spread_v1": spread_old,
        "bootstrap_95_low": low, "bootstrap_95_high": high,
        "validation_macro_f1_new_mean": float(new_val.mean()), "validation_macro_f1_v1_mean": float(old_val.mean()),
        "validation_drop": val_drop, "validation_drop_allowed": val_allowed, "validation_ok": bool(val_ok),
    }

    if len(old) == 1:
        clear = abs(difference) > 2 * spread_new and excludes_zero
        result["clear"] = bool(clear)
        if not clear:
            result.update(outcome="close", adopt=None,
                          reason="Difference within twice the seed spread or bootstrap range includes zero: "
                                 "train 2 more v1 seeds and run stage 2.")
            return result
        better = difference > 0
    else:
        margin = float(np.nanmax([spread_new, spread_old]))
        result["margin"] = margin
        better = difference > margin and low > 0

    adopt = bool(better and val_ok)
    if adopt:
        reason = "New model better on the selection set beyond luck, validation not worse: adopt v2."
    elif better:
        reason = "New model better on the selection set but validation got worse beyond the seed spread: keep v1."
    else:
        reason = "New model not better beyond luck: keep v1."
    result.update(outcome="adopt" if adopt else "keep_v1", adopt=adopt, reason=reason)
    return result
