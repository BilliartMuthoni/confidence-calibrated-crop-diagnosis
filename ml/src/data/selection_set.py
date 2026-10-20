"""Acquire the selection set: field photos from sources the model has never seen.

Calibration and the referral threshold (decisions D6, D7) are chosen on these
photos, because the validation photos come from the training sources and are 99.5%
right, too few mistakes to learn from. PlantDoc stays untouched for the final test.
The same set decides D2 (ensemble or ResNet-50).

Every source is CC BY 4.0 on Mendeley Data. Files are downloaded through the public
API and checked against Mendeley's own SHA-256 checksums. Where the API offers no
files (the tomato set), the archive downloaded from the dataset page is placed on
Drive by hand; its checksum is recorded here on first use and verified afterwards,
and the notebook reports that this source was not downloaded by script.

Labels are mapped only where the folder name matches one of our 11 classes without
ambiguity; every other folder is listed and left out (e.g. a maize "Blight" folder,
which could be northern or southern leaf blight).

Duplicate checks, using the fingerprints already computed for every existing photo
(``clean_manifest.csv``, notebook 06):

1. unreadable or too small: dropped.
2. Same bytes (MD5) as any training-source or PlantDoc photo: dropped.
3. Near-duplicate (perceptual hash within ``NEAR_DUPLICATE_MAX_DISTANCE`` bits) of any
   existing photo, as it is or turned (90, 180, 270 degrees) or mirrored: dropped.
4. Within the selection set, near-duplicates (including turned and mirrored copies,
   which some datasets add as augmentation) are not independent photos: one per group
   is kept.
"""

import hashlib
import io
import shutil
import subprocess
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import imagehash
import numpy as np
import pandas as pd
from PIL import Image, ImageOps

from src.data import cleaning

API = "https://data.mendeley.com/public-api/datasets"
USER_AGENT = "Sproutly student research project (Strathmore University)"


@dataclass
class Source:
    dataset_id: str
    version: int
    crop: str
    citation: str
    # Folder-name keywords (lower case, "_" and "-" read as spaces) -> project class.
    classes: dict[str, str]
    # Folders deliberately left out, with the reason.
    excluded: dict[str, str] = field(default_factory=dict)
    # Recorded SHA-256 of a hand-downloaded archive, for sources the API does not serve.
    manual_sha256: str | None = None
    licence: str = "CC BY 4.0"


SOURCES = {
    "maize_natore": Source(
        "vy629dngm8", 1, "maize",
        "Seasonal Corn Leaf Disease Dataset (Natore, Bangladesh), Mendeley Data, V1, doi:10.17632/vy629dngm8.1",
        {"common rust": "Corn_(maize)___Common_rust_",
         "gray leaf spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
         "healthy": "Corn_(maize)___healthy"},
        {"augment": "augmented copies, not independent photos",
         "bacterial leaf streak": "not one of our classes",
         "chlorotic mottle": "not one of our classes"},
    ),
    "maize_jhenaidah": Source(
        "3myfctrgk3", 1, "maize",
        "MLD: A Multi-Class Maize Leaf Disease Image Dataset from Bangladesh, Mendeley Data, V1, doi:10.17632/3myfctrgk3.1",
        {"gray spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
         "healthy": "Corn_(maize)___healthy"},
        {"blight": "ambiguous: northern or southern leaf blight",
         "armyworm": "a pest, not one of our classes"},
    ),
    "tomato_bd": Source(
        "jttrv2w27r", 1, "tomato",
        "Rachin, N. A. S., Likhon, N. M., & Baki, M. A. H. (2025). Tomato Leaf Disease Classification Dataset "
        "(Version 1). Mendeley Data. doi:10.17632/jttrv2w27r.1",
        {"bacterial spot": "Tomato___Bacterial_spot",
         "bacteiral spot": "Tomato___Bacterial_spot",  # the dataset's own spelling of the folder
         "early blight": "Tomato___Early_blight",
         "late blight": "Tomato___Late_blight",
         "healthy": "Tomato___healthy"},
        {"yellow leaf curl": "not one of our classes",
         "leaf miner": "a pest, not one of our classes",
         "magnesium": "a deficiency, not one of our classes"},
        manual_sha256="7e24afdb81e0b6b0c189c5588fb57571ebe518b873dc5cb9cd8b52bba4a67069",
    ),
    "potato_holeta": Source(
        "v4w72bsts5", 2, "potato",
        "Potato Leaf (Healthy and Late Blight), Holeta, Ethiopia, Mendeley Data, V2, doi:10.17632/v4w72bsts5.2",
        {"late blight": "Potato___Late_blight",
         "healthy": "Potato___healthy"},
    ),
}


# -------------------------------------------------------------------------- download

def _get_json(url: str):
    import json

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_licence(source: Source) -> str:
    """The licence Mendeley states for this version; stops if it is not the expected one."""
    record = _get_json(f"{API}/{source.dataset_id}?version={source.version}")
    stated = (record.get("data_licence") or {}).get("short_name", "")
    if stated != source.licence:
        raise ValueError(f"{source.dataset_id} v{source.version}: licence {stated!r}, expected {source.licence!r}")
    return stated


def download(name: str, dest: Path) -> list[dict]:
    """Archives for one source in ``dest``, each verified; returns one record per file.

    Files the API offers are downloaded and checked against Mendeley's SHA-256. If the
    API offers none, a hand-downloaded archive already in ``dest`` is used and checked
    against the recorded checksum (or its checksum is printed for recording).
    """
    source = SOURCES[name]
    dest.mkdir(parents=True, exist_ok=True)
    try:
        files = _get_json(f"{API}/{source.dataset_id}/files?folder_id=root&version={source.version}")
    except urllib.error.HTTPError:
        files = []  # the API serves no files for this version: use the hand-downloaded archive
    records = []
    for entry in files:
        details = entry["content_details"]
        path = dest / entry["filename"]
        if not (path.exists() and _sha256(path) == details["sha256_hash"]):
            request = urllib.request.Request(details["download_url"], headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=600) as response, path.open("wb") as out:
                shutil.copyfileobj(response, out, 1 << 20)
            if _sha256(path) != details["sha256_hash"]:
                raise ValueError(f"{path.name}: checksum does not match Mendeley's")
        records.append({"source": name, "file": path.name, "sha256": details["sha256_hash"],
                        "bytes": path.stat().st_size, "how": "Mendeley API, checksum verified"})
    if records:
        return records

    archives = [p for p in dest.iterdir() if p.suffix.lower() in {".zip", ".rar"}]
    if len(archives) != 1:
        raise FileNotFoundError(
            f"The API offers no files for {source.dataset_id} v{source.version}. Download the archive from "
            f"https://data.mendeley.com/datasets/{source.dataset_id}/{source.version} and put it alone in {dest}.")
    actual = _sha256(archives[0])
    if source.manual_sha256 and actual != source.manual_sha256:
        raise ValueError(f"{archives[0].name}: checksum {actual} differs from the recorded {source.manual_sha256}")
    how = ("hand-downloaded (API offers no files), checksum verified" if source.manual_sha256
           else "hand-downloaded (API offers no files); RECORD this sha256 in SOURCES")
    return [{"source": name, "file": archives[0].name, "sha256": actual,
             "bytes": archives[0].stat().st_size, "how": how}]


def extract(archive: Path, out: Path) -> None:
    """Unpack a .zip or .rar into ``out`` (skipped if already unpacked)."""
    marker = out / f".extracted_{archive.name}"
    if marker.exists():
        return
    out.mkdir(parents=True, exist_ok=True)
    if archive.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive) as z:
            z.extractall(out)
    elif archive.suffix.lower() == ".rar":
        if shutil.which("unrar") is None:
            subprocess.run(["apt-get", "install", "-y", "-qq", "unrar"], check=True)
        subprocess.run(["unrar", "x", "-o+", "-idq", str(archive), str(out) + "/"], check=True)
    else:
        raise ValueError(f"Unsupported archive {archive.name}")
    # Archives inside the archive (some uploads nest one per class). The markers are named
    # after their archive (".extracted_EB.zip"), so they are not archives themselves: without
    # this check a second archive unpacked into the same folder tried to open the first's marker.
    for inner in nested_archives(out):
        extract(inner, inner.with_suffix(""))
    marker.touch()


def nested_archives(folder: Path) -> list[Path]:
    """Real .zip and .rar files under ``folder``, leaving out the "already unpacked" markers."""
    found = list(folder.rglob("*.zip")) + list(folder.rglob("*.rar"))
    return [p for p in found if not p.name.startswith(".extracted_")]


# ---------------------------------------------------------------------------- labels

def _words(text: str) -> str:
    return " ".join(text.lower().replace("_", " ").replace("-", " ").split())


def label_of(name: str, relative: Path) -> tuple[str | None, str]:
    """(project class, reason) for an image from its folder names; class None if left out."""
    source = SOURCES[name]
    folders = " / ".join(_words(part) for part in relative.parent.parts)
    for keyword, reason in source.excluded.items():
        if keyword in folders:
            return None, f"excluded: {reason}"
    matches = {cls for keyword, cls in source.classes.items() if keyword in folders}
    if len(matches) == 1:
        return matches.pop(), "mapped"
    if len(matches) > 1:
        return None, f"ambiguous folder: {relative.parent}"
    return None, f"unmapped folder: {relative.parent}"


def inventory(name: str, root: Path) -> pd.DataFrame:
    """One row per image under ``root`` with its folder, mapped class and reason."""
    rows = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in cleaning.IMAGE_EXTENSIONS:
            relative = path.relative_to(root)
            cls, reason = label_of(name, relative)
            rows.append({"source": name, "crop": SOURCES[name].crop, "folder": str(relative.parent),
                         "class": cls, "label_reason": reason, "path": path})
    return pd.DataFrame(rows)


def folder_summary(table: pd.DataFrame) -> pd.DataFrame:
    """Images per folder and what each folder became: check this before trusting the mapping."""
    return (table.groupby(["source", "folder", "label_reason"], dropna=False)
            .agg(images=("path", "size"), mapped_to=("class", "first")).reset_index())


# ------------------------------------------------------------------------- saving

# Same as image_dataset.CACHE_SHORT_SIDE: every photo is shrunk to this before the model
# sees it, so saving the selection photos at this size changes nothing for the model and
# keeps them small on Drive (full-size field photos filled the 15 GB Drive on 17 Oct).
SAVED_SHORT_SIDE = 256


def save_small(src: Path, dst: Path) -> None:
    """Save a copy of src at dst with the shorter side at most SAVED_SHORT_SIDE pixels,
    exactly as image_dataset caches every other split."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as image:
        image = image.convert("RGB")
        scale = SAVED_SHORT_SIDE / min(image.size)
        if scale < 1:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.BICUBIC)
        image.save(dst, quality=95)


def save_all_small(jobs: list[tuple[Path, Path]], workers: int = 16) -> None:
    from concurrent.futures import ThreadPoolExecutor

    from tqdm.auto import tqdm

    with ThreadPoolExecutor(workers) as pool:
        list(tqdm(pool.map(lambda job: save_small(*job), jobs), total=len(jobs), desc="Saving photos"))


# ------------------------------------------------------------------------ duplicates

# The seven other ways a photo can be turned or flipped; a turned copy is still a copy.
_TURNS = [None, Image.Transpose.ROTATE_90, Image.Transpose.ROTATE_180, Image.Transpose.ROTATE_270]
_VARIANTS = [(mirror, turn) for mirror in (False, True) for turn in _TURNS if mirror or turn is not None]


def fingerprint(path: Path) -> dict:
    """The same checks as ``cleaning.check_image``, decoding the photo once, plus the
    perceptual hashes of its turned and mirrored versions (``phash_variants``).

    pHash shrinks the photo to 32 x 32 grey pixels before hashing, so the variants are
    made from that small copy: turning it gives the same pixels as turning the full photo.
    """
    row = {"width": None, "height": None, "md5": None, "phash": None, "phash_variants": None, "error": None}
    try:
        data = path.read_bytes()
        row["md5"] = hashlib.md5(data).hexdigest()
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        # verify() does not decode the pixels; convert() does, so truncated files fail here.
        with Image.open(io.BytesIO(data)) as image:
            rgb = image.convert("RGB")
        row["width"], row["height"] = rgb.size
        small = rgb.convert("L").resize((32, 32), Image.Resampling.LANCZOS)
        row["phash"] = str(imagehash.phash(small))
        variants = []
        for mirror, turn in _VARIANTS:
            copy = ImageOps.mirror(small) if mirror else small
            variants.append(str(imagehash.phash(copy.transpose(turn) if turn is not None else copy)))
        row["phash_variants"] = " ".join(variants)
    except Exception as err:
        row["error"] = f"{type(err).__name__}: {err}"
    return row


def fingerprint_all(paths: list[Path], workers: int = 16) -> pd.DataFrame:
    from concurrent.futures import ThreadPoolExecutor

    from tqdm.auto import tqdm

    with ThreadPoolExecutor(workers) as pool:
        return pd.DataFrame(list(tqdm(pool.map(fingerprint, paths), total=len(paths), desc="Fingerprinting")))


def _variant_arrays(hashes: pd.Series) -> list[np.ndarray]:
    """One array per turned or mirrored version, from the space-separated ``phash_variants``."""
    rows = [h.split() for h in hashes]
    return [cleaning._hash_array(pd.Series(column)) for column in zip(*rows)]


def deduplicate(selection: pd.DataFrame, existing: pd.DataFrame, min_size: tuple[int, int],
                max_distance: int) -> pd.DataFrame:
    """Apply the checks in the module docstring; ``existing`` is clean_manifest.csv."""
    df = selection.sort_values(["source", "path"]).reset_index(drop=True)
    df["keep"] = df["class"].notna()
    df["reason"] = np.where(df["keep"], "", df["label_reason"])

    def drop(index, reason):
        index = df.index[index] if isinstance(index, (np.ndarray, pd.Series)) and index.dtype == bool else index
        index = [i for i in index if df.at[i, "keep"]]
        df.loc[index, "keep"] = False
        df.loc[index, "reason"] = reason

    drop(df["error"].notna().to_numpy(), "unreadable")
    # Left-out folders were never opened, so their sizes are empty: compare numbers only.
    width, height = pd.to_numeric(df["width"], errors="coerce"), pd.to_numeric(df["height"], errors="coerce")
    drop(((width < min_size[0]) | (height < min_size[1])).to_numpy(), "too_small")

    existing = existing[existing["md5"].notna() & existing["phash"].notna()]
    drop(df["md5"].isin(set(existing["md5"])).to_numpy(), "same_file_as_existing_photo")

    alive = df.index[df["keep"]]
    reference = cleaning._hash_array(existing["phash"])
    direct = cleaning._hash_array(df.loc[alive, "phash"])
    for hashes in [direct] + _variant_arrays(df.loc[alive, "phash_variants"]):
        near = cleaning._close_pairs(hashes, reference, max_distance, same=False)
        drop(alive[np.unique(near[:, 0])], "near_duplicate_of_existing_photo")

    alive = df.index[df["keep"]]
    direct = cleaning._hash_array(df.loc[alive, "phash"])
    variants = _variant_arrays(df.loc[alive, "phash_variants"])
    pairs = np.concatenate([cleaning._close_pairs(direct, direct, max_distance, same=True)]
                           + [cleaning._close_pairs(direct, v, max_distance, same=False) for v in variants])
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    groups = cleaning._groups(len(alive), pairs)
    df["dup_group"] = pd.NA
    df.loc[alive, "dup_group"] = groups
    # Copies with different labels can't both be right: drop the whole group.
    labels_per_group = df.loc[alive].groupby("dup_group")["class"].nunique()
    conflicting = labels_per_group.index[labels_per_group > 1]
    drop(alive[np.isin(groups, conflicting)], "near_duplicates_with_conflicting_labels")
    # Otherwise keep the first photo of each group.
    alive = df.index[df["keep"]]
    repeats = df.loc[alive].duplicated("dup_group", keep="first")
    drop(alive[repeats.to_numpy()], "near_duplicate_within_selection")
    return df
