"""D17: extra field photos added to the TRAINING data only.

The model is right on only 57% of unseen field photos (the selection set), and tomato is
worst (13%: nearly every field tomato is called late blight). D17 adds field photos from
new places to training and keeps everything else fixed: validation, test, the selection
set and PlantDoc are unchanged, ``train.csv`` is untouched, and the result is a new
``train_d17.csv`` (old training rows + the new photos). Whether the retrained model is
adopted is decided later by a rule fixed before training (selection-set accuracy must
improve beyond the spread between seeds, validation must not get worse).

Every source was checked before use (20 Oct 2026, file lists read from Mendeley):

- Pakistan tomato (3mbnb82mxd v2): described as 7,200 smartphone field photos, but 7,200
  are augmented copies of ~830 photos, and many of those are web images (Flickr, Wikimedia,
  blog thumbnails, other Roboflow sets) that the authors cannot license. Only the authors'
  own phone photos (camera file names dated 2025) are used: 116 in our classes.
- Taiwan tomato (ngdgg79rzb v1): 622 original photos plus rotated, mirrored and
  brightness-changed copies (4,976 files); only ``taiwan.7z`` is fetched (the dataset's
  other folder is a PlantVillage copy). Copies are reduced to one per photo by the same
  near-duplicate check (turned and mirrored versions included) used for the selection set.
- India potato PLDD-UP (3j4nfkvp2n v1): 15,519 original photos (EB, LB, healthy); capped
  per class so potato does not swamp the other crops. Fills the potato early blight gap.
- Bangladesh maize (sb4wwjs8bz v1): Mendeley's API serves no files, so the archive is
  downloaded by hand to Drive. Same country as the selection set's maize: reported as a
  limitation (a gain there may partly be "Bangladesh-looking photos", not the disease).

Checked and not used: Kandahar maize (folders are districts, no disease labels),
Pota-Toma-To (Google Search images), more of the Tanzania potato set (same farms as the
current validation and test photos).

Duplicate checks are the selection set's (``selection_set.deduplicate``), against every
existing photo: training sources, PlantDoc and the selection set.
"""

import re
import shutil
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from src.data import cleaning, selection_set

API = selection_set.API
USER_AGENT = selection_set.USER_AGENT

EB, LB = "Early_blight", "Late_blight"

# Photos per class kept from a capped source, chosen at random with the project seed.
# Fixed before seeing any result; about the size of the other field sources' classes.
CAP_PER_CLASS = 1500


@dataclass
class Source:
    dataset_id: str
    version: int
    crop: str
    citation: str
    # Folder-name keyword (lower case, "_" and "-" read as spaces) -> project class.
    # With exact=True the keyword must equal the photo's own folder name.
    classes: dict[str, str]
    # Folder keywords (regular expressions) left out, with the reason; checked before ``classes``.
    excluded: dict[str, str] = field(default_factory=dict)
    exact: bool = False
    # Only photos whose file name matches this pattern are used (None: all).
    file_pattern: str | None = None
    file_reason: str = ""
    # Only these archives are fetched from the API (None: all of them).
    files: list[str] | None = None
    # True: the API serves no files; archives are put on Drive by hand.
    manual: bool = False
    capped: bool = False
    licence: str = "CC BY 4.0"


SOURCES = {
    "tomato_pakistan": Source(
        "3mbnb82mxd", 2, "tomato",
        "Malik, M. N., Ali, S. H., & Ali, H. (2026). Tomato Leaf Disease Classification Dataset in Pakistan "
        "(Version 2). Mendeley Data. doi:10.17632/3mbnb82mxd.2",
        {"early blight": f"Tomato___{EB}", "healthy": "Tomato___healthy", "late blight": f"Tomato___{LB}"},
        {"augmented": "augmented copies, not independent photos",
         "septoria": "not one of our classes", "curl": "not one of our classes", "mold": "not one of our classes"},
        file_pattern=r"(DCIM_Camera_IMG_2025\d{4}_\d{6}|^IMG_2025\d{4}_\d{6})",
        file_reason="not the authors' own phone photo (web image or unclear origin)",
    ),
    "tomato_taiwan": Source(
        "ngdgg79rzb", 1, "tomato",
        "Huang, M.-L., & Chang, Y.-H. (2020). Dataset of Tomato Leaves (Version 1). Mendeley Data. "
        "doi:10.17632/ngdgg79rzb.1",
        # The healthy folder is named "health" in the archive.
        {"bacterial spot": "Tomato___Bacterial_spot", "health": "Tomato___healthy", "late blight": f"Tomato___{LB}"},
        {"augmentation": "augmented copies, not independent photos (\"Preprocessed data\" holds the originals)",
         "mold": "not one of our classes", "mould": "not one of our classes",
         "gray leaf spot": "not one of our classes", "grey leaf spot": "not one of our classes",
         "powdery": "not one of our classes", "plantvillage": "PlantVillage copy, already in training"},
        files=["taiwan.7z"],
    ),
    "potato_india": Source(
        "3j4nfkvp2n", 1, "potato",
        "PLDD-UP: Potato Leaf Disease Dataset from Uttar Pradesh, India (Version 1). Mendeley Data. "
        "doi:10.17632/3j4nfkvp2n.1",
        {"eb": f"Potato___{EB}", "lb": f"Potato___{LB}", "healthy": "Potato___healthy"},
        exact=True,
        capped=True,
    ),
    "maize_bd10": Source(
        "sb4wwjs8bz", 1, "maize",
        "Rabbany, G., Hashi, U. H., Rahman, M. N., & Adnan, M. R.-E.-R. (2026). An Open-Source Multi-Format "
        "Maize Leaf Image Dataset for Disease Detection and Classification (Version 1). Mendeley Data. "
        "doi:10.17632/sb4wwjs8bz.1",
        {"northern": "Corn_(maize)___Northern_Leaf_Blight",
         "common rust": "Corn_(maize)___Common_rust_",
         "gray leaf spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
         "grey leaf spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
         "healthy": "Corn_(maize)___healthy"},
        # The archive holds the same photos three times (Annotation, Converted raw Images,
        # RAW_Image); only RAW_Image, the originals, is used. Its "Corn Leaf Blight" folder does
        # not say northern or southern, so it is left out, as the selection set's "Blight" was.
        {"augment": "augmented copies, not independent photos",
         "annotation": "same photos as RAW_Image (annotation copy)",
         "converted": "same photos as RAW_Image (converted copy)",
         r"(?<!northern )(?<!southern )corn leaf blight": "ambiguous: northern or southern leaf blight",
         "southern": "not one of our classes", "eyespot": "not one of our classes",
         "curvularia": "not one of our classes", "streak": "not one of our classes"},
        manual=True,
    ),
}


# -------------------------------------------------------------------------- download

def check_licence(source: Source) -> str:
    """The licence Mendeley states for this version; stops if it is not the expected one."""
    record = selection_set._get_json(f"{API}/{source.dataset_id}?version={source.version}")
    stated = (record.get("data_licence") or {}).get("short_name", "")
    if stated != source.licence:
        raise ValueError(f"{source.dataset_id} v{source.version}: licence {stated!r}, expected {source.licence!r}")
    return stated


def download(name: str, dest: Path) -> list[dict]:
    """Fetch a source's archives into ``dest``, each checked against Mendeley's SHA-256.

    For a manual source the archives already in ``dest`` (put there by hand) are used and
    their checksums are reported for the record.
    """
    source = SOURCES[name]
    dest.mkdir(parents=True, exist_ok=True)
    if source.manual:
        archives = sorted(p for p in dest.iterdir() if p.suffix.lower() in {".zip", ".rar", ".7z"})
        if not archives:
            raise FileNotFoundError(
                f"No archive for {name}. Download it from https://data.mendeley.com/datasets/"
                f"{source.dataset_id}/{source.version} and put it in {dest}.")
        return [{"source": name, "file": p.name, "sha256": selection_set._sha256(p), "bytes": p.stat().st_size,
                 "how": "hand-downloaded (API offers no files); checksum recorded"} for p in archives]

    entries = selection_set._get_json(f"{API}/{source.dataset_id}/files?folder_id=root&version={source.version}")
    if source.files is not None:
        entries = [e for e in entries if e["filename"] in source.files]
        missing = set(source.files) - {e["filename"] for e in entries}
        if missing:
            raise FileNotFoundError(f"{name}: Mendeley no longer lists {sorted(missing)}")
    records = []
    for entry in entries:
        if Path(entry["filename"]).suffix.lower() not in {".zip", ".rar", ".7z"}:
            continue  # loose sample photos next to the archive
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
    if not records:
        raise FileNotFoundError(f"{name}: the API offered no archive")
    return records


def extract(archive: Path, out: Path) -> None:
    """Unpack a .zip, .rar or .7z into ``out`` (skipped if already unpacked)."""
    if archive.suffix.lower() != ".7z":
        selection_set.extract(archive, out)
        return
    marker = out / f".extracted_{archive.name}"
    if marker.exists():
        return
    out.mkdir(parents=True, exist_ok=True)
    if shutil.which("7z") is None:
        subprocess.run(["apt-get", "install", "-y", "-qq", "p7zip-full"], check=True)
    subprocess.run(["7z", "x", "-y", "-bd", f"-o{out}", str(archive)], check=True, stdout=subprocess.DEVNULL)
    for inner in selection_set.nested_archives(out):
        selection_set.extract(inner, inner.with_suffix(""))
    marker.touch()


# ---------------------------------------------------------------------------- labels

def _words(text: str) -> str:
    return " ".join(text.lower().replace("_", " ").replace("-", " ").split())


def label_of(name: str, relative: Path) -> tuple[str | None, str]:
    """(project class, reason) for a photo from its folders and file name; None if left out."""
    source = SOURCES[name]
    folders = " / ".join(_words(part) for part in relative.parent.parts)
    for keyword, reason in source.excluded.items():
        if re.search(keyword, folders):
            return None, f"excluded: {reason}"
    if source.exact:
        own = _words(relative.parent.name)
        matches = {cls for keyword, cls in source.classes.items() if keyword == own}
    else:
        matches = {cls for keyword, cls in source.classes.items() if keyword in folders}
    if len(matches) > 1:
        return None, f"ambiguous folder: {relative.parent}"
    if not matches:
        return None, f"unmapped folder: {relative.parent}"
    if source.file_pattern and not re.search(source.file_pattern, relative.name):
        return None, f"excluded: {source.file_reason}"
    return matches.pop(), "mapped"


def inventory(name: str, root: Path) -> pd.DataFrame:
    """One row per image under ``root`` with its folder, mapped class and reason."""
    rows = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in cleaning.IMAGE_EXTENSIONS:
            relative = path.relative_to(root)
            cls, reason = label_of(name, relative)
            rows.append({"source": name, "crop": SOURCES[name].crop, "folder": str(relative.parent),
                         "class": cls, "label_reason": reason, "path": path})
    columns = ["source", "crop", "folder", "class", "label_reason", "path"]
    return pd.DataFrame(rows, columns=columns)


def folder_summary(table: pd.DataFrame) -> pd.DataFrame:
    """Images per folder and what each became: check this before trusting the mapping."""
    return (table.groupby(["source", "folder", "label_reason"], dropna=False)
            .agg(images=("path", "size"), mapped_to=("class", "first")).reset_index())


# ----------------------------------------------------------- copies of matched photos

MATCHED = {"same_file_as_existing_photo", "near_duplicate_of_existing_photo"}


def drop_copies_of_matches(checked: pd.DataFrame, max_distance: int) -> pd.DataFrame:
    """After ``selection_set.deduplicate``: if one copy of a photo matches an existing photo,
    drop all its copies.

    ``deduplicate`` drops the matching copies first and groups the survivors afterwards, so a
    copy that was changed a little more (e.g. brightened as well as resized) can survive on its
    own. That would put a copy of a validation, test or selection photo into training. Here the
    groups are formed over every readable new photo, and a group with any match goes entirely.
    """
    df = checked.copy()
    readable = df.index[df["phash"].notna() & df["error"].isna()]
    if len(readable) == 0:
        return df
    direct = cleaning._hash_array(df.loc[readable, "phash"])
    variants = selection_set._variant_arrays(df.loc[readable, "phash_variants"])
    pairs = np.concatenate([cleaning._close_pairs(direct, direct, max_distance, same=True)]
                           + [cleaning._close_pairs(direct, v, max_distance, same=False) for v in variants])
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    groups = cleaning._groups(len(readable), pairs)
    matched = df.loc[readable, "reason"].isin(MATCHED).to_numpy()
    hit = readable[np.isin(groups, np.unique(groups[matched])) & df.loc[readable, "keep"].to_numpy()]
    df.loc[hit, "keep"] = False
    df.loc[hit, "reason"] = "copy_of_a_photo_matching_existing"
    return df


# ------------------------------------------------------------------------- the cap

def apply_cap(checked: pd.DataFrame, cap: int, seed: int) -> pd.DataFrame:
    """For capped sources, keep at most ``cap`` photos per class (random, fixed seed);
    the rest are marked "over_cap". Applied after the duplicate checks, so the cap
    counts independent photos."""
    df = checked.copy()
    capped = {name for name, source in SOURCES.items() if source.capped}
    rng = np.random.default_rng(seed)
    for (name, cls), part in df[df["keep"] & df["source"].isin(capped)].groupby(["source", "class"]):
        if len(part) > cap:
            dropped = rng.permutation(part.index.to_numpy())[cap:]
            df.loc[dropped, "keep"] = False
            df.loc[dropped, "reason"] = "over_cap"
    return df


# ------------------------------------------------------------------- review sheet

def contact_sheet(paths: list[Path], title: str, columns: int = 6, thumb: int = 160) -> Image.Image:
    """A grid of thumbnails, for checking by eye that a class really is what it says."""
    from PIL import ImageDraw

    rows = max(1, -(-len(paths) // columns))
    sheet = Image.new("RGB", (columns * thumb, rows * thumb + 28), "white")
    ImageDraw.Draw(sheet).text((8, 8), title, fill="black")
    for i, path in enumerate(paths):
        with Image.open(path) as image:
            image = image.convert("RGB")
            image.thumbnail((thumb - 4, thumb - 4))
            x, y = (i % columns) * thumb + 2, (i // columns) * thumb + 30
            sheet.paste(image, (x, y))
    return sheet


def review_sample(kept: pd.DataFrame, per_class: int, seed: int) -> dict[tuple[str, str], list[Path]]:
    """Up to ``per_class`` random kept photos for each (source, class)."""
    sample = {}
    for (name, cls), part in kept.groupby(["source", "class"]):
        take = part.sample(min(per_class, len(part)), random_state=seed)
        sample[(name, cls)] = [Path(p) for p in take["path"]]
    return sample


# ---------------------------------------------------------------- the new training list

def build_train_d17(train: pd.DataFrame, added: pd.DataFrame) -> pd.DataFrame:
    """``train.csv`` rows unchanged, followed by the new photos.

    ``added`` has path (relative to the raw data folder), class, source and dup_group. Each
    new near-duplicate group gets a group number after the existing ones, so copies of one
    photo stay together if the list is ever split again.
    """
    columns = ["path", "class", "source", "group"]
    start = int(pd.to_numeric(train["group"], errors="coerce").max()) + 1
    codes = pd.factorize(added["source"] + "|" + added["dup_group"].astype(str))[0]
    new = added.assign(group=start + codes)[columns]
    combined = pd.concat([train[columns], new], ignore_index=True)
    assert combined["path"].is_unique, "a photo appears twice in train_d17"
    assert not set(new["path"]) & set(train["path"]), "a new photo has the same path as an existing one"
    return combined


def class_counts(train: pd.DataFrame, combined: pd.DataFrame) -> pd.DataFrame:
    """Training photos per class before and after, for the report."""
    before = train["class"].value_counts().rename("train.csv")
    after = combined["class"].value_counts().rename("train_d17.csv")
    table = pd.concat([before, after], axis=1).fillna(0).astype(int)
    table["added"] = table["train_d17.csv"] - table["train.csv"]
    return table.sort_index()
