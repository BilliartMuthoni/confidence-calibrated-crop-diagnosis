"""Out-of-scope leaves (notebook 21d): photos Sproutly was never meant to diagnose.

Report only. The deployed system is scored on leaves of other crops and on tomato diseases
outside the 11 classes, to measure how often it would still give a farmer a diagnosis. Nothing
deployed is changed because of the result.

Sources:

- iBean (Makerere University AI Lab, Uganda): smartphone photos of bean leaves taken in
  farmers' fields (angular leaf spot, bean rust, healthy). MIT licence
  (github.com/AI-Lab-Makerere/ibean). Downloaded from the dataset's own storage, the files
  TensorFlow Datasets uses.
- PlantVillage, other crops: the same repository as the training photos (notebook 01), only
  the folders of crops other than maize, tomato and potato (pepper, apple, grape and others).
  Lab photos in the training photos' style: the hardest case.
- PlantDoc, other crops: the same repository and licence (CC BY 4.0) as the out-of-domain test
  (notebook 04), only the folders of other crops. Web photos.
- PlantDoc, other tomato diseases: the five tomato diseases outside the 11 classes, already on
  Drive as the ``unseen_test`` split (notebook 07). Notebook 09 reported only their mean
  confidence for single models; no choice used them.

Each source is sampled evenly across its folders with the project seed, and only the sampled
files are downloaded.
"""

import subprocess
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}
OUR_CROPS = ("corn", "maize", "tomato", "potato")

IBEAN_URL = "https://storage.googleapis.com/ibeans/{split}.zip"
IBEAN_SPLITS = ("train", "validation", "test")
IBEAN_CITATION = ("Makerere AI Lab (2020). iBean: bean disease dataset. "
                  "https://github.com/AI-Lab-Makerere/ibean")
PLANTVILLAGE_URL = "https://github.com/spMohanty/PlantVillage-Dataset.git"
PLANTVILLAGE_CITATION = "Hughes, D. P., & Salathe, M. (2015). PlantVillage dataset (as in notebook 01)."
PLANTDOC_URL = "https://github.com/pratikkayal/PlantDoc-Dataset.git"
PLANTDOC_CITATION = "Singh, D. et al. (2020). PlantDoc: a dataset for visual plant disease detection."


def is_other_crop(folder: str) -> bool:
    """A folder of a crop Sproutly does not cover (PlantVillage or PlantDoc naming)."""
    name = folder.lower().replace("_", " ").strip()
    return not name.startswith(OUR_CROPS) and "background" not in name


def even_sample(rows: pd.DataFrame, count: int, seed: int) -> pd.DataFrame:
    """Up to ``count`` rows, taken in turn from each class so every folder is represented."""
    shuffled = rows.sample(frac=1, random_state=seed)
    turn = shuffled.groupby("class").cumcount()
    return shuffled.assign(_turn=turn).sort_values("_turn", kind="stable").head(count).drop(columns="_turn")


def _git(args: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True)
    return result.stdout


def _fetch(url: str, target: Path, tries: int = 3) -> None:
    for attempt in range(1, tries + 1):
        try:
            urllib.request.urlretrieve(url, target)
            return
        except urllib.error.URLError:
            if attempt == tries:
                raise
            time.sleep(5 * attempt)


def ibean(dest: Path, count: int, seed: int) -> pd.DataFrame:
    """Download the three iBean zips, then sample ``count`` photos evenly over its 3 classes."""
    rows = []
    for split in IBEAN_SPLITS:
        archive = dest / f"{split}.zip"
        if not archive.exists():
            dest.mkdir(parents=True, exist_ok=True)
            _fetch(IBEAN_URL.format(split=split), archive)
        unpacked = dest / "unpacked"
        with zipfile.ZipFile(archive) as zipped:
            zipped.extractall(unpacked)
        for path in sorted((unpacked / split).rglob("*")):
            if path.suffix.lower() in IMAGE_EXTENSIONS:
                name = path.parent.name.replace("_", " ")  # angular leaf spot, bean rust, healthy
                rows.append({"class": name if name.startswith("bean") else f"bean {name}", "path": str(path)})
    assert rows, "No iBean photos found: the download layout may have changed."
    picked = even_sample(pd.DataFrame(rows), count, seed)
    return picked.assign(source="ibean_bean_field", licence="MIT", citation=IBEAN_CITATION)


def _from_git(url: str, dest: Path, folder_of, count: int, seed: int) -> pd.DataFrame:
    """List a repository without its files, sample other-crop photos, then fetch only those."""
    if not (dest / ".git").exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        _git(["clone", "--filter=blob:none", "--no-checkout", url, str(dest)])
    listing = _git(["ls-tree", "-r", "-z", "--name-only", "HEAD"], cwd=dest).split("\0")
    rows = []
    for tracked in listing:
        folder = folder_of(tracked)
        if folder and Path(tracked).suffix.lower() in IMAGE_EXTENSIONS and is_other_crop(folder):
            rows.append({"class": folder, "tracked": tracked})
    picked = even_sample(pd.DataFrame(rows), count, seed)
    paths = list(picked["tracked"])
    # Literal pathspecs: PlantDoc file names are scraped URLs containing "?" and "*".
    for start in range(0, len(paths), 100):
        _git(["--literal-pathspecs", "checkout", "HEAD", "--", *paths[start:start + 100]], cwd=dest)
    picked["path"] = [str(dest / p) for p in paths]
    missing = [p for p in picked["path"] if not Path(p).exists()]
    assert not missing, f"{len(missing)} sampled files did not download, e.g. {missing[:3]}"
    return picked.drop(columns="tracked")


def plantvillage_other_crops(dest: Path, count: int, seed: int) -> pd.DataFrame:
    def folder_of(tracked: str):
        parts = tracked.split("/")
        return parts[2] if len(parts) == 4 and parts[:2] == ["raw", "color"] else None

    picked = _from_git(PLANTVILLAGE_URL, dest, folder_of, count, seed)
    return picked.assign(source="plantvillage_other_crops", licence="as notebook 01",
                         citation=PLANTVILLAGE_CITATION)


def plantdoc_other_crops(dest: Path, count: int, seed: int) -> pd.DataFrame:
    def folder_of(tracked: str):
        parts = tracked.split("/")
        return parts[1] if len(parts) == 3 and parts[0] in ("train", "test") else None

    picked = _from_git(PLANTDOC_URL, dest, folder_of, count, seed)
    return picked.assign(source="plantdoc_other_crops", licence="CC BY 4.0", citation=PLANTDOC_CITATION)


def plantdoc_other_tomato_diseases(split_csv: Path, raw_dir: Path, count: int, seed: int) -> pd.DataFrame:
    """The ``unseen_test`` split already on Drive: tomato diseases outside the 11 classes."""
    rows = pd.read_csv(split_csv)[["class", "path"]]
    rows["path"] = [str(raw_dir / p) for p in rows["path"]]
    picked = even_sample(rows, count, seed)
    return picked.assign(source="plantdoc_other_tomato_diseases", licence="CC BY 4.0",
                         citation=PLANTDOC_CITATION)
