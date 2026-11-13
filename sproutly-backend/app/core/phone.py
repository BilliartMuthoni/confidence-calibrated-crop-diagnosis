"""Phone numbers in one form. A farmer may type 0712345678, 0712 345 678, 712345678, 254712345678
or +254 712 345 678: all are the same number and must find the same account, so every number is
stored and compared as +2547XXXXXXXX (or +2541XXXXXXXX for the newer 01 numbers).

Only Kenyan mobile numbers are accepted. Sproutly is built around Kenyan counties and its SMS
codes are sent through a Kenyan provider; anyone else can sign up with an email.
"""

import re

KENYAN_ONLY = "Sproutly works with Kenyan mobile numbers. Enter one like 0712345678, or use Email."

_SEPARATORS = re.compile(r"[\s\-().]")


def normalise_phone(value: str) -> str:
    """The number as +254 followed by 9 digits starting with 7 or 1; ValueError otherwise."""
    v = _SEPARATORS.sub("", value or "")
    if v.startswith("00"):  # 00254... is the international way to dial +254...
        v = "+" + v[2:]
    if v.startswith("+"):
        if not v[1:].startswith("254"):
            raise ValueError(KENYAN_ONLY)
        v = v[1:]
    if not v.isdigit():
        raise ValueError(KENYAN_ONLY)
    if v.startswith("254") and len(v) == 12:
        national = v[3:]
    elif v.startswith("0") and len(v) == 10:
        national = v[1:]
    elif len(v) == 9:
        national = v
    else:
        raise ValueError(KENYAN_ONLY)
    if national[0] not in "71":
        raise ValueError(KENYAN_ONLY)
    return "+254" + national


def local_form(phone: str) -> str:
    """+254712345678 as farmers write it, 0712345678 (for showing; never for comparing)."""
    return "0" + phone[4:] if phone and phone.startswith("+254") else (phone or "")
