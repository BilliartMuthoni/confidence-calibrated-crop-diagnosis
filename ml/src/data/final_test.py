"""The final field test (notebook 21c): photos that played no part in any choice.

Every field number so far comes from the selection set, which also fitted the calibration
and was used to pick the threshold, so those numbers may be optimistic. This set is scored
once with the deployed system and nothing is changed because of it.

Sources (checked 31 Oct 2026 on their Mendeley pages; the licence is read again from the
API on every run):

- Tomato leaf diseases (93h9p62kg4 v1): iPhone 11 photos taken in natural field conditions
  in Bangladesh (Daffodil International University). Bacterial spot, early and late blight
  and healthy leaves are ours; the other folders (leaf curl, spider mites, leaf mould, leaf
  miner, insect damage, Cercospora leaf mould, uncategorised) are left out. The page also
  mentions augmentation, so copies are reduced to one by the near-duplicate check.
- Dataset for Crop Pest and Disease Detection (bwh3zbpkpv v1): photos from farms in Ghana.
  Only the healthy tomato and healthy maize leaves are used: its "leaf blight" and "leaf
  spot" folders do not say early or late, northern or gray, so they cannot be mapped. The
  healthy leaves test false alarms on African farms. Augmented folders are left out.

Checked and not used: 9jxvtgh325 (Bangladesh tomato; originals not separable from 24,500
augmented copies on the page), zfv4jj7855 (no origin given, PlantVillage-style folders),
Zenodo 20004230 (augmented Roboflow export), the Tanzanian Irish potato set (the same
source as the training potato photos), and the Zambian maize set (no public download).

Duplicates: the selection set's checks (``selection_set.deduplicate``) against every photo
used so far: training sources and PlantDoc, the selection set, and the photos D17 and D22
added to training.
"""

import json
import shutil
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from src.data import cleaning, selection_set

API = selection_set.API
USER_AGENT = selection_set.USER_AGENT


@dataclass
class Source:
    dataset_id: str
    version: int
    citation: str
    # Words that must all appear in a photo's folder path (lower case, "_" and "-" read as
    # spaces) -> project class.
    rules: list[tuple[tuple[str, ...], str]]
    # Folder words left out, with the reason; checked before ``rules``.
    excluded: dict[str, str] = field(default_factory=dict)
    licence: str = "CC BY 4.0"


NOT_OURS = "not one of our classes"
SOURCES = {
    "tomato_bd_field": Source(
        "93h9p62kg4", 1,
        "Hossain, I., Haque, K. R., Rafi, A. A., & Talukder, M. Z. I. (2025). Tomato leaf diseases (Version 1). "
        "Mendeley Data. doi:10.17632/93h9p62kg4.1",
        [(("bacterial spot",), "Tomato___Bacterial_spot"), (("early blight",), "Tomato___Early_blight"),
         (("late blight",), "Tomato___Late_blight"), (("healthy",), "Tomato___healthy")],
        {"augment": "augmented copies, not independent photos", "curl": NOT_OURS, "mite": NOT_OURS,
         "mold": NOT_OURS, "mould": NOT_OURS, "miner": NOT_OURS, "insect": NOT_OURS, "cercospora": NOT_OURS,
         "uncategor": NOT_OURS, "other": NOT_OURS},
    ),
    "ghana_healthy": Source(
        "bwh3zbpkpv", 1,
        "Patrick Mensah Kwabena et al. (2023). Dataset for Crop Pest and Disease Detection (Version 1). "
        "Mendeley Data. doi:10.17632/bwh3zbpkpv.1",
        [(("tomato", "healthy"), "Tomato___healthy"), (("maize", "healthy"), "Corn_(maize)___healthy")],
        {"augment": "augmented copies, not independent photos"},
    ),
}
ARCHIVES = (".zip", ".rar")


# -------------------------------------------------------------------------- download

def check_licence(source: Source) -> str:
    return selection_set.check_licence(source)


def download(name: str, dest: Path) -> list[dict]:
    """Every file the API lists for the source, except ones named as augmented, each checked
    against Mendeley's SHA-256. Without API files, one hand-downloaded archive in ``dest`` is used."""
    source = SOURCES[name]
    dest.mkdir(parents=True, exist_ok=True)
    try:
        files = selection_set._get_json(f"{API}/{source.dataset_id}/files?folder_id=root&version={source.version}")
    except urllib.error.HTTPError:
        files = []
    records = []
    for entry in files:
        if "augment" in entry["filename"].lower():
            records.append({"source": name, "file": entry["filename"], "how": "not downloaded: augmented copies"})
            continue
        details = entry["content_details"]
        path = dest / entry["filename"]
        if not (path.exists() and selection_set._sha256(path) == details["sha256_hash"]):
            request = urllib.request.Request(details["download_url"], headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=1800) as response, path.open("wb") as out:
                shutil.copyfileobj(response, out, 1 << 20)
            if selection_set._sha256(path) != details["sha256_hash"]:
                raise ValueError(f"{path.name}: checksum does not match Mendeley's")
        records.append({"source": name, "file": path.name, "sha256": details["sha256_hash"],
                        "bytes": path.stat().st_size, "how": "Mendeley API, checksum verified"})
    if any("sha256" in r for r in records):
        return records
    archives = [p for p in dest.iterdir() if p.suffix.lower() in ARCHIVES]
    if len(archives) != 1:
        raise FileNotFoundError(
            f"The API offers no files for {source.dataset_id} v{source.version}. Download the archive from "
            f"https://data.mendeley.com/datasets/{source.dataset_id}/{source.version} and put it alone in {dest}.")
    return [{"source": name, "file": archives[0].name, "sha256": selection_set._sha256(archives[0]),
             "bytes": archives[0].stat().st_size, "how": "hand-downloaded (API offers no files); sha256 recorded"}]


# ---------------------------------------------------------------------------- labels

def label_of(name: str, relative: Path) -> tuple[str | None, str]:
    """(project class, reason) for a photo from its folder names; class None if left out."""
    source = SOURCES[name]
    folders = " / ".join(selection_set._words(part) for part in relative.parent.parts)
    for keyword, reason in source.excluded.items():
        if keyword in folders:
            return None, f"excluded: {reason}"
    matches = {cls for words, cls in source.rules if all(w in folders for w in words)}
    if len(matches) == 1:
        return matches.pop(), "mapped"
    if len(matches) > 1:
        return None, f"ambiguous folder: {relative.parent}"
    return None, f"unmapped folder: {relative.parent}"


def extract(name: str, archive: Path, out: Path) -> None:
    """Unpack only the photos ``label_of`` maps (and any archives inside), so a large
    multi-crop archive does not fill the disk; .rar archives are unpacked whole."""
    marker = out / f".extracted_{archive.name}"
    if marker.exists():
        return
    out.mkdir(parents=True, exist_ok=True)
    if archive.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive) as z:
            for member in z.namelist():
                path = Path(member)
                wanted = (path.suffix.lower() in cleaning.IMAGE_EXTENSIONS and label_of(name, path)[0]) \
                    or path.suffix.lower() in ARCHIVES
                if wanted and not member.endswith("/"):
                    z.extract(member, out)
    else:
        selection_set.extract(archive, out)
    for inner in selection_set.nested_archives(out):
        extract(name, inner, inner.with_suffix(""))
    marker.touch()


def inventory(name: str, root: Path) -> pd.DataFrame:
    """One row per photo under ``root`` with its folder, mapped class and reason."""
    rows = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in cleaning.IMAGE_EXTENSIONS:
            relative = path.relative_to(root)
            cls, reason = label_of(name, relative)
            rows.append({"source": name, "folder": str(relative.parent), "class": cls, "label_reason": reason,
                         "path": path})
    return pd.DataFrame(rows, columns=["source", "folder", "class", "label_reason", "path"])


def folder_summary(table: pd.DataFrame) -> pd.DataFrame:
    """Photos per folder and what each folder became: check this before trusting the mapping."""
    return (table.groupby(["source", "folder", "label_reason"], dropna=False)
            .agg(photos=("path", "size"), mapped_to=("class", "first")).reset_index())


def sources_json() -> str:
    return json.dumps({k: {"dataset": f"Mendeley {s.dataset_id} v{s.version}", "citation": s.citation,
                           "licence": s.licence} for k, s in SOURCES.items()}, indent=1)
