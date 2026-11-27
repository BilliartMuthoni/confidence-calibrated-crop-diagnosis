"""Downloadable reports for administrators: counts only, never anything that identifies a farmer.

Disease frequency: how often each disease was found, by county and month, for county disease
surveillance. A disease an officer named while answering a referral counts ahead of the
automatic diagnosis, and a check counts only when one of them named a disease. Counting
automatic diagnoses alone would mostly show healthy leaves, because the model answers few
field photos and withholds the rest. Counts below SMALL_COUNT show as "<5", so a single farm
in a quiet county cannot be singled out.

Referral performance: cases received, answered and expired per county and month, and how long
replies took, for county managers. These count officers' work, not farmers, so nothing is hidden.

No names, phone numbers, photos, symptom descriptions or exact dates leave the system here.
"""

import csv
import io
from collections import defaultdict
from datetime import datetime
from statistics import median
from typing import Iterable, NamedTuple, Optional

from app.core.knowledge_base import KNOWLEDGE_BASE, display_name

SMALL_COUNT = 5
NO_COUNTY = "Not set"


class CheckRow(NamedTuple):
    county: Optional[str]
    created_at: datetime
    crop: str
    is_referred: bool
    predicted_disease: Optional[str]
    judgement: Optional[str]  # the officer's judgement on an answered referral, if any


class ReferralRow(NamedTuple):
    county: Optional[str]
    created_at: datetime
    status: str  # new, in_review, answered or expired
    expires_at: datetime
    replied_at: Optional[datetime]


def _month(value: datetime) -> str:
    return value.strftime("%Y-%m")


def shown_count(n: int) -> str:
    """A count as the disease report shows it: small non-zero counts are hidden."""
    return str(n) if n == 0 or n >= SMALL_COUNT else f"<{SMALL_COUNT}"


def _safe(cell) -> str:
    """Stop a spreadsheet reading a text cell as a formula (CSV injection)."""
    text = str(cell)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def _csv(header: list, rows: Iterable[list]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    for row in rows:
        writer.writerow([_safe(c) for c in row])
    # The byte-order mark lets Excel open the file as UTF-8.
    return "﻿" + out.getvalue()


def disease_source(row: CheckRow) -> Optional[tuple]:
    """(disease, "officer" or "automatic") for one check, or None if no disease was named.
    Once an officer has judged a case, their judgement decides: "another disease", "can't
    tell" or "needs a farm visit" name no disease, so the check is left out."""
    if row.judgement:
        return (row.judgement, "officer") if row.judgement in KNOWLEDGE_BASE else None
    if not row.is_referred and row.predicted_disease:
        return row.predicted_disease, "automatic"
    return None


def disease_frequency_csv(rows: Iterable[CheckRow]) -> str:
    counts = defaultdict(lambda: {"automatic": 0, "officer": 0})
    for row in rows:
        found = disease_source(row)
        if found:
            disease, source = found
            counts[(_month(row.created_at), row.county or NO_COUNTY, row.crop, disease)][source] += 1
    header = ["month", "county", "crop", "disease", "automatic_diagnoses", "confirmed_by_officer", "total"]
    lines = []
    for (month, county, crop, disease), c in sorted(counts.items()):
        lines.append([month, county, crop, display_name(disease), shown_count(c["automatic"]),
                      shown_count(c["officer"]), shown_count(c["automatic"] + c["officer"])])
    return _csv(header, lines)


def referral_performance_csv(rows: Iterable[ReferralRow]) -> str:
    groups = defaultdict(list)
    for row in rows:
        groups[(_month(row.created_at), row.county or NO_COUNTY)].append(row)
    header = ["month", "county", "received", "answered", "answered_before_deadline", "expired",
              "still_open", "median_days_to_reply"]
    lines = []
    for (month, county), group in sorted(groups.items()):
        answered = [r for r in group if r.status == "answered" and r.replied_at]
        days = [(r.replied_at - r.created_at).total_seconds() / 86400 for r in answered]
        lines.append([
            month, county, len(group), len(answered),
            sum(1 for r in answered if r.replied_at <= r.expires_at),
            sum(1 for r in group if r.status == "expired"),
            sum(1 for r in group if r.status in ("new", "in_review")),
            f"{median(days):.1f}" if days else "",
        ])
    return _csv(header, lines)
