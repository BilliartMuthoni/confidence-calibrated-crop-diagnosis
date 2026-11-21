"""System tests T42-T44 against the deployed backend.

Usage (from sproutly-backend, with its .venv active):
    python scripts/test_t42_t44_azure.py

Asks for two test farmer accounts (A must have at least one check); nothing is saved.
T42: farmer B asks for farmer A's check -> not found.
T43: a text file named leaf.jpg -> refused as not an image; nothing stored.
T44: a file larger than 8 MB -> refused as too large.
"""

import sys

import httpx

from time_azure import API, sign_in

ok = []


def check(name, cond, detail=""):
    ok.append(bool(cond))
    print("PASS" if cond else "FAIL", name, detail)


with httpx.Client(timeout=120) as client:
    print("Farmer A (the account whose check B will ask for)")
    token_a = sign_in(client)
    history = client.get(f"{API}/diagnose/history", headers={"Authorization": f"Bearer {token_a}"})
    if history.status_code != 200 or not history.json():
        sys.exit(f"Farmer A has no checks to use ({history.status_code})")
    check_id = history.json()[0]["diagnosis_id"]
    print(f"Farmer A's check: {check_id}\n")

    print("Farmer B")
    token_b = sign_in(client)
    hb = {"Authorization": f"Bearer {token_b}"}

    r = client.get(f"{API}/diagnose/{check_id}", headers=hb)
    check("T42: B cannot see A's check", r.status_code == 404, f"({r.status_code} {r.text[:80]})")

    before = len(client.get(f"{API}/diagnose/history", headers=hb).json())
    r = client.post(f"{API}/diagnose", headers=hb, data={"crop": "maize"},
                    files={"image": ("leaf.jpg", b"This is a text file, not a photograph.\n", "image/jpeg")})
    after = len(client.get(f"{API}/diagnose/history", headers=hb).json())
    check("T43: text file named leaf.jpg is refused", r.status_code == 400, f"({r.status_code} {r.text[:90]})")
    check("T43: nothing stored", after == before, f"(checks before {before}, after {after})")

    big = b"\xff\xd8\xff\xe0" + b"\0" * (9 * 1024 * 1024)  # starts like a JPEG, 9 MB
    r = client.post(f"{API}/diagnose", headers=hb, data={"crop": "maize"},
                    files={"image": ("big.jpg", big, "image/jpeg")})
    check("T44: a 9 MB file is refused as too large", r.status_code in (400, 413), f"({r.status_code} {r.text[:90]})")

print(f"\n{sum(ok)}/{len(ok)} passed")
