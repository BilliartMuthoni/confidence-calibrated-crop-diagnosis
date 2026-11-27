"""The admin reports (app/core/reports.py): counts only, small counts hidden, officers' judgements first."""

import csv
import io
from datetime import datetime, timedelta

from app.core.knowledge_base import KNOWLEDGE_BASE, display_name
from app.core.reports import (
    CheckRow,
    ReferralRow,
    disease_frequency_csv,
    disease_source,
    referral_performance_csv,
    shown_count,
)

NOV = datetime(2026, 11, 10, 9, 0)
DISEASE = next(name for name in KNOWLEDGE_BASE if "healthy" not in name.lower())
OTHER = next(name for name in KNOWLEDGE_BASE if name != DISEASE)


def read(text: str) -> list[dict]:
    assert text.startswith("﻿")
    return list(csv.DictReader(io.StringIO(text[1:])))


def check(**kw) -> CheckRow:
    base = dict(county="Nakuru", created_at=NOV, crop="maize", is_referred=False, predicted_disease=DISEASE,
                judgement=None)
    return CheckRow(**{**base, **kw})


def test_small_counts_are_hidden_but_zero_and_five_are_shown():
    assert [shown_count(n) for n in (0, 1, 4, 5, 12)] == ["0", "<5", "<5", "5", "12"]


def test_officer_judgement_decides_over_the_model():
    assert disease_source(check(judgement=OTHER)) == (OTHER, "officer")
    assert disease_source(check(is_referred=True, predicted_disease=None, judgement=DISEASE)) == (DISEASE, "officer")


def test_checks_without_a_named_disease_are_left_out():
    # Withheld and not judged, or judged as something that names no disease.
    assert disease_source(check(is_referred=True, predicted_disease=None)) is None
    for judgement in ("other_disease", "cannot_tell", "farm_visit"):
        assert disease_source(check(judgement=judgement)) is None


def test_disease_report_has_counts_only_and_hides_small_ones():
    rows = [check() for _ in range(6)] + [check(is_referred=True, predicted_disease=None, judgement=DISEASE)]
    rows += [check(county="Kisumu")]
    report = read(disease_frequency_csv(rows))
    assert list(report[0]) == ["month", "county", "crop", "disease", "automatic_diagnoses",
                               "confirmed_by_officer", "total"]
    by_county = {r["county"]: r for r in report}
    assert by_county["Nakuru"]["automatic_diagnoses"] == "6"
    assert by_county["Nakuru"]["confirmed_by_officer"] == "<5"
    assert by_county["Nakuru"]["total"] == "7"
    assert by_county["Nakuru"]["disease"] == display_name(DISEASE)
    assert by_county["Kisumu"]["total"] == "<5"
    assert by_county["Nakuru"]["month"] == "2026-11"


def test_missing_county_is_labelled():
    assert read(disease_frequency_csv([check(county=None)]))[0]["county"] == "Not set"


def test_referral_performance_counts_and_median():
    deadline = NOV + timedelta(days=7)
    rows = [
        ReferralRow("Nakuru", NOV, "answered", deadline, NOV + timedelta(days=1)),
        ReferralRow("Nakuru", NOV, "answered", deadline, NOV + timedelta(days=3)),
        ReferralRow("Nakuru", NOV, "expired", deadline, None),
        ReferralRow("Nakuru", NOV, "new", deadline, None),
    ]
    (row,) = read(referral_performance_csv(rows))
    assert row == {"month": "2026-11", "county": "Nakuru", "received": "4", "answered": "2",
                   "answered_before_deadline": "2", "expired": "1", "still_open": "1",
                   "median_days_to_reply": "2.0"}


def test_cells_cannot_become_spreadsheet_formulas():
    report = read(referral_performance_csv([ReferralRow("=cmd()", NOV, "new", NOV, None)]))
    assert report[0]["county"] == "'=cmd()"
