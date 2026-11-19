"""Time multi-photo checks (POST /diagnose/batch) on the deployed Azure backend.

Usage (from sproutly-backend, with its .venv active):
    python time_azure_batch.py FOLDER [--photos 5] [--runs 3] [--crop maize]

Without --crop every photo's crop is detected, as when the farmer picks "mixed or not sure".
"""

import argparse
import pathlib
import statistics
import sys
import time

import httpx

from time_azure import API, sign_in


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--photos", type=int, default=5, help="photos per batch, 1 to 10")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--crop", choices=["maize", "tomato", "potato"])
    args = parser.parse_args()
    if not 1 <= args.photos <= 10:
        sys.exit("--photos must be between 1 and 10 (the server's limit)")

    paths = sorted(p for p in pathlib.Path(args.folder).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    paths = paths[:args.photos]
    if len(paths) < args.photos:
        sys.exit(f"Only {len(paths)} photos found in {args.folder}")
    photos = [(p.name, p.read_bytes()) for p in paths]
    total_kb = sum(len(b) for _, b in photos) / 1024
    print(f"{len(photos)} photos per batch ({total_kb:.0f} KB in total), crop: {args.crop or 'detected'}")

    with httpx.Client(timeout=300) as client:
        token = sign_in(client)
        headers = {"Authorization": f"Bearer {token}"}
        data = {"crop": args.crop} if args.crop else {}

        times = []
        for i in range(1, args.runs + 1):
            files = [("images", (name, body, "image/jpeg")) for name, body in photos]
            start = time.perf_counter()
            r = client.post(f"{API}/diagnose/batch", headers=headers, data=data, files=files)
            seconds = time.perf_counter() - start
            if r.status_code != 201:
                sys.exit(f"Batch failed ({r.status_code}): {r.text}")
            results = r.json()["results"]
            skipped = [x for x in results if x.get("error")]
            times.append(seconds)
            print(f"Run {i}: {seconds:.2f} s for {len(photos)} photos "
                  f"({seconds / len(photos):.2f} s a photo), skipped: {len(skipped)}")
            for x in skipped:
                print(f"    photo {x['index'] + 1} skipped: {x['error']}")
            if i < args.runs:
                time.sleep(15)  # the batch route allows 5 a minute

    print()
    print(f"Runs: {len(times)}, {len(photos)} photos each")
    print(f"Median: {statistics.median(times):.2f} s a batch ({statistics.median(times) / len(photos):.2f} s a photo)")
    print(f"Min:    {min(times):.2f} s")
    print(f"Max:    {max(times):.2f} s")


if __name__ == "__main__":
    main()
