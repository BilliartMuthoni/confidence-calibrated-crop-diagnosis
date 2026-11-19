"""Time diagnoses on the deployed Azure backend, end to end from this computer.

Usage (from sproutly-backend, with its .venv active):
    python time_azure.py PHOTO.jpg [--crop tomato] [--runs 10]

It asks for the test account's email, password and authenticator code; nothing is saved.
"""

import argparse
import getpass
import statistics
import sys
import time

import httpx

API = "https://sproutly-api-afawaxhjf5begzb7.italynorth-01.azurewebsites.net"


def sign_in(client: httpx.Client) -> str:
    email = input("Test account email: ").strip()
    password = getpass.getpass("Password (hidden): ")
    r = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        sys.exit(f"Login failed ({r.status_code}): {r.text}")
    challenge = r.json()
    if challenge["next_step"] != "verify":
        sys.exit(f"This account needs '{challenge['next_step']}' first; finish sign-in once in the app.")
    code = input("Authenticator code: ").strip()
    r = client.post(f"{API}/auth/mfa/verify", json={"mfa_token": challenge["mfa_token"], "code": code})
    if r.status_code != 200:
        sys.exit(f"Code rejected ({r.status_code}): {r.text}")
    return r.json()["access_token"]


def diagnose(client: httpx.Client, token: str, photo: bytes, name: str, crop: str) -> float:
    start = time.perf_counter()
    r = client.post(
        f"{API}/diagnose",
        headers={"Authorization": f"Bearer {token}"},
        data={"crop": crop},
        files={"image": (name, photo, "image/jpeg")},
    )
    seconds = time.perf_counter() - start
    if r.status_code != 201:
        sys.exit(f"Diagnosis failed ({r.status_code}): {r.text}")
    return seconds


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("photo")
    parser.add_argument("--crop", default="tomato", choices=["maize", "tomato", "potato"])
    parser.add_argument("--runs", type=int, default=10)
    args = parser.parse_args()

    with open(args.photo, "rb") as f:
        photo = f.read()
    print(f"Photo: {args.photo} ({len(photo) / 1024:.0f} KB), crop: {args.crop}")

    with httpx.Client(timeout=120) as client:
        start = time.perf_counter()
        health = client.get(f"{API}/health")
        print(f"Health check: {health.status_code} in {time.perf_counter() - start:.2f} s")

        token = sign_in(client)

        # The first diagnosis may include a cold start, so it is reported but left out of the summary.
        first = diagnose(client, token, photo, args.photo, args.crop)
        print(f"Warm-up diagnosis: {first:.2f} s (not counted)")

        times = []
        for i in range(1, args.runs + 1):
            seconds = diagnose(client, token, photo, args.photo, args.crop)
            times.append(seconds)
            print(f"Run {i:2d}: {seconds:.2f} s")
            time.sleep(4)  # stays well under the 20-a-minute limit

    times.sort()
    print()
    print(f"Runs: {len(times)}")
    print(f"Median: {statistics.median(times):.2f} s")
    print(f"Mean:   {statistics.mean(times):.2f} s")
    print(f"Min:    {times[0]:.2f} s")
    print(f"Max:    {times[-1]:.2f} s")


if __name__ == "__main__":
    main()
