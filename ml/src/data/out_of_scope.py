"""Out-of-scope leaves (notebook 21d): photos Sproutly was never meant to diagnose.

Report only. The deployed system is scored on leaves of other crops and on tomato diseases
outside the 11 classes, to measure how often it would still give a farmer a diagnosis. Nothing
deployed is changed because of the result.

Sources:

- iBean (Makerere University AI Lab, Uganda): smartphone photos of bean leaves taken in
  farmers' fields (angular leaf spot, bean rust, healthy). MIT licence
  (github.com/AI-Lab-Makerere/ibean). The dataset's own storage refuses downloads (403, 3 Nov
  2026), so the same three zips are taken from its Hugging Face copy (AI-Lab-Makerere/beans,
  data/*.zip, licence: mit in its card).
- PlantVillage, other crops: the same repository as the training photos (notebook 01), only
  the folders of crops other than maize, tomato and potato (pepper, apple, grape and others).
  Lab photos in the training photos' style: the hardest case.
- PlantDoc, other crops: the same repository and licence (CC BY 4.0) as the out-of-domain test
  (notebook 04), only the folders of other crops. Web photos.
- PlantDoc, other tomato diseases: the five tomato diseases outside the 11 classes, already on
  Drive as the ``unseen_test`` split (notebook 07). Notebook 09 reported only their mean
  confidence for single models; no choice used them.

Each source is sampled evenly across its folders with the project seed, and only the sampled
files are downloaded (Git repositories are listed without their files, then each sampled file is
fetched from raw.githubusercontent.com at the listed commit).
"""

import subprocess
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import quote

import pandas as pd

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}
OUR_CROPS = ("corn", "maize", "tomato", "potato")

IBEAN_REPO = "AI-Lab-Makerere/beans"
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


def _fetch(split: str, dest: Path, tries: int = 3) -> Path:
    from huggingface_hub import hf_hub_download

    for attempt in range(1, tries + 1):
        try:
            return Path(hf_hub_download(IBEAN_REPO, f"data/{split}.zip", repo_type="dataset", local_dir=dest))
        except Exception:
            if attempt == tries:
                raise
            time.sleep(5 * attempt)


def ibean(dest: Path, count: int, seed: int) -> pd.DataFrame:
    """Download the three iBean zips, then sample ``count`` photos evenly over its 3 classes."""
    rows = []
    for split in IBEAN_SPLITS:
        dest.mkdir(parents=True, exist_ok=True)
        archive = _fetch(split, dest)
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


def _download(url: str, target: Path, tries: int = 3) -> None:
    for attempt in range(1, tries + 1):
        try:
            urllib.request.urlretrieve(url, target)
            return
        except urllib.error.URLError:
            if attempt == tries:
                raise
            time.sleep(5 * attempt)


def _from_git(url: str, dest: Path, folder_of, count: int, seed: int) -> pd.DataFrame:
    """List a GitHub repository without its files, sample other-crop photos, then download only
    those from raw.githubusercontent.com at the listed commit (so the sample cannot drift)."""
    repo = dest / "repo"
    if not (repo / ".git").exists():
        dest.mkdir(parents=True, exist_ok=True)
        _git(["clone", "--filter=blob:none", "--no-checkout", url, str(repo)])
    commit = _git(["rev-parse", "HEAD"], cwd=repo).strip()
    listing = _git(["ls-tree", "-r", "-z", "--name-only", "HEAD"], cwd=repo).split("\0")
    rows = []
    for tracked in listing:
        folder = folder_of(tracked)
        if folder and Path(tracked).suffix.lower() in IMAGE_EXTENSIONS and is_other_crop(folder):
            rows.append({"class": folder, "tracked": tracked})
    picked = even_sample(pd.DataFrame(rows), count, seed).reset_index(drop=True)
    owner_repo = url.removeprefix("https://github.com/").removesuffix(".git")
    files = dest / "files"
    files.mkdir(exist_ok=True)
    paths = []
    for i, tracked in enumerate(picked["tracked"]):
        # Numbered names: PlantDoc file names are scraped URLs containing "?", "&" and "=".
        target = files / f"{i:04d}{Path(tracked).suffix.lower()}"
        if not target.exists():
            _download(f"https://raw.githubusercontent.com/{owner_repo}/{commit}/{quote(tracked)}", target)
        paths.append(str(target))
    picked["path"] = paths
    picked["commit"] = commit
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
