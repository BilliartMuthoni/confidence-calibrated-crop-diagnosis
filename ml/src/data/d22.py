"""D22: maize field photos for training, and the class balance of the training data.

D17 added 3,877 field photos, but only 108 were maize (and none northern leaf blight), so
training became potato-heavy and maize did not improve (gray leaf spot fell at one
selection-set site, northern leaf blight on PlantDoc). D22 adds maize field photos from
South Africa to the TRAINING data only, as ``train_d22.csv`` (``train_d17.csv`` unchanged
plus the new photos), and reports how many photos each class, crop and source has, so the
class balance can be decided from the counts before any training.

Source (checked 22 Oct 2026 through Figshare's API): Craze, H. (2022), "Diseases of maize
in the field", University of Pretoria (FABI), CC BY 4.0, 2,355 field photos taken at
different times and places in South Africa, labelled in ``Database.csv`` with one 0/1
column per label; a photo can carry several labels.

Which photos are used (fixed before seeing any photo):

- exactly one of our maize classes: gray leaf spot (GLS), northern leaf blight (NCLB),
  common rust (CR) or healthy (NoFoliarSymptoms);
- and no disease that is not ours (phaeosphaeria leaf spot, southern rust, or an
  unidentified disease), since the photo's label would then be only partly true;
- "Other" (insect damage or leaf tearing, not a disease) is allowed on a diseased leaf,
  which is what field photos look like, but not on a healthy one, where insect damage
  could look like symptoms.

Checked and not used: CD&S (Purdue) and the Cornell northern leaf blight images, whose
repositories state no licence; "Maize Crop Disease (Leaf)" (Mendeley), built "from
multiple sources" that may include PlantVillage or PlantDoc photos.
"""

import hashlib
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from src.data import cleaning, d17, selection_set

ARTICLE = 20237613
FIGSHARE_API = "https://api.figshare.com/v2/articles"
LICENCE = "CC BY 4.0"
LABELS_FILE = "Database.csv"
IMAGES_FILE = "leaf_images.zip"
SOURCE = "maize_pretoria"
CROP = "maize"
CITATION = ("Craze, H. (2022). Diseases of maize in the field [Data set]. University of Pretoria. "
            "https://doi.org/10.25403/UPresearchdata.20237613.v1")

GLS = "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot"
NLB = "Corn_(maize)___Northern_Leaf_Blight"
RUST = "Corn_(maize)___Common_rust_"
HEALTHY = "Corn_(maize)___healthy"
OURS = {"GLS": GLS, "NCLB": NLB, "CR": RUST, "NoFoliarSymptoms": HEALTHY}
NOT_OURS = ("PLS", "SR", "UnidentifiedDisease")
DAMAGE = "Other"


# ------------------------------------------------------------------- licence, download

def record() -> dict:
    request = urllib.request.Request(f"{FIGSHARE_API}/{ARTICLE}", headers={"User-Agent": selection_set.USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def check_licence(rec: dict) -> str:
    """The licence Figshare states; stops if it is not the expected one."""
    stated = (rec.get("license") or {}).get("name", "")
    if stated != LICENCE:
        raise ValueError(f"Figshare {ARTICLE}: licence {stated!r}, expected {LICENCE!r}")
    return stated


def _md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(rec: dict, dest: Path) -> list[dict]:
    """The label file and the photo archive in ``dest``, each checked against Figshare's MD5."""
    dest.mkdir(parents=True, exist_ok=True)
    by_name = {f["name"]: f for f in rec["files"]}
    records = []
    for name in (LABELS_FILE, IMAGES_FILE):
        if name not in by_name:
            raise FileNotFoundError(f"Figshare {ARTICLE} no longer lists {name}")
        entry, path = by_name[name], dest / name
        if not (path.exists() and _md5(path) == entry["computed_md5"]):
            request = urllib.request.Request(entry["download_url"], headers={"User-Agent": selection_set.USER_AGENT})
            with urllib.request.urlopen(request, timeout=1800) as response, path.open("wb") as out:
                shutil.copyfileobj(response, out, 1 << 20)
            if _md5(path) != entry["computed_md5"]:
                raise ValueError(f"{name}: checksum does not match Figshare's")
        records.append({"source": SOURCE, "file": name, "md5": entry["computed_md5"], "bytes": path.stat().st_size,
                        "how": "Figshare API, MD5 verified"})
    return records


# --------------------------------------------------------------------------- labels

def label_rows(labels: pd.DataFrame) -> pd.DataFrame:
    """One row per photo in ``Database.csv``: file name, project class (None if left out),
    the reason, and whether the leaf also shows insect damage or tearing."""
    rows = []
    for _, row in labels.iterrows():
        ours = [cls for column, cls in OURS.items() if row[column] == 1]
        others = [column for column in NOT_OURS if row[column] == 1]
        damaged = row[DAMAGE] == 1
        if not ours:
            cls, reason = None, "excluded: none of our classes"
        elif len(ours) > 1:
            cls, reason = None, "excluded: more than one of our classes"
        elif others:
            cls, reason = None, "excluded: also shows a disease that is not ours"
        elif ours[0] == HEALTHY and damaged:
            cls, reason = None, "excluded: healthy but with insect damage or tearing"
        else:
            cls, reason = ours[0], "mapped" + (" (with insect damage or tearing)" if damaged else "")
        rows.append({"file": str(row["filePath"]), "class": cls, "label_reason": reason, "damaged": bool(damaged)})
    return pd.DataFrame(rows, columns=["file", "class", "label_reason", "damaged"])


def label_summary(labelled: pd.DataFrame) -> pd.DataFrame:
    """Photos per reason and class: check this before trusting the mapping."""
    return (labelled.assign(**{"class": labelled["class"].fillna("-")})
            .groupby(["label_reason", "class"]).size().rename("photos").reset_index())


# ------------------------------------------------------------- unpack only what is used

def extract_mapped(archive: Path, labelled: pd.DataFrame, out: Path) -> pd.DataFrame:
    """Unpack only the mapped photos (found by file name anywhere in the archive).

    Returns ``labelled`` with the unpacked ``path`` (None if the photo is not in the
    archive, or if its file name appears more than once there and cannot be matched).
    """
    with zipfile.ZipFile(archive) as z:
        members = [m for m in z.namelist()
                   if not m.endswith("/") and Path(m).suffix.lower() in cleaning.IMAGE_EXTENSIONS]
        by_file: dict[str, list[str]] = {}
        for member in members:
            by_file.setdefault(Path(member).name, []).append(member)
        df = labelled.copy()
        df["path"] = None
        for i, row in df[df["class"].notna()].iterrows():
            found = by_file.get(row["file"], [])
            if len(found) != 1:
                df.at[i, "class"] = None
                df.at[i, "label_reason"] = ("excluded: file not in the archive" if not found
                                            else "excluded: file name appears more than once in the archive")
                continue
            target = out / found[0]
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(found[0]) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst, 1 << 20)
            df.at[i, "path"] = target
    df.attrs["archive_photos"] = len(members)
    df.attrs["archive_photos_not_in_labels"] = len(set(by_file) - set(labelled["file"]))
    return df


def inventory(extracted: pd.DataFrame) -> pd.DataFrame:
    """Rows in the shape the duplicate checks expect (as ``d17.inventory``)."""
    df = extracted.copy()
    df["source"], df["crop"] = SOURCE, CROP
    df["folder"] = df["path"].map(lambda p: str(p.parent) if isinstance(p, Path) else "")
    return df[["source", "crop", "folder", "class", "label_reason", "path", "damaged"]]


# ----------------------------------------------------------------- the new training list

def build_train_d22(train_d17: pd.DataFrame, added: pd.DataFrame) -> pd.DataFrame:
    """``train_d17.csv`` rows unchanged, followed by the new photos (same columns and
    near-duplicate grouping as ``d17.build_train_d17``)."""
    return d17.build_train_d17(train_d17, added)


# ------------------------------------------------------------------------ the balance

def class_balance(lists: dict[str, pd.DataFrame], cap: float = 5.0) -> pd.DataFrame:
    """Photos per class in each training list, with each class's share of the last list.

    Also shows, for information only, the "balanced" class weight each class WOULD get
    (total / (classes x class photos), as scikit-learn computes it) and that weight capped
    at ``cap``. Whether to weight at all is decided from these counts before training.
    """
    table = pd.concat({name: df["class"].value_counts() for name, df in lists.items()}, axis=1).fillna(0).astype(int)
    last = table[list(lists)[-1]]
    table["crop"] = [c.split("___")[0].replace("Corn_(maize)", "maize").lower() for c in table.index]
    table["share of last (%)"] = (100 * last / last.sum()).round(1)
    table["times the smallest"] = (last / last.min()).round(1)
    weight = last.sum() / (len(last) * last)
    table["balanced weight (preview)"] = weight.round(2)
    table[f"capped at {cap:g} (preview)"] = np.minimum(weight, cap).round(2)
    return table.sort_values(list(lists)[-1], ascending=False)


def crop_balance(df: pd.DataFrame) -> pd.DataFrame:
    """Photos per crop in one training list, with each crop's share."""
    crop = df["class"].str.split("___").str[0].str.replace("Corn_(maize)", "maize", regex=False).str.lower()
    table = crop.value_counts().rename("photos").to_frame()
    table["share (%)"] = (100 * table["photos"] / table["photos"].sum()).round(1)
    return table


def source_balance(df: pd.DataFrame) -> pd.DataFrame:
    """Photos per class and source in one training list (where each class's photos come from)."""
    return df.pivot_table(index="class", columns="source", values="path", aggfunc="count", fill_value=0)
