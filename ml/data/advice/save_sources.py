"""Saves the full text of each advice source to ml/data/advice/sources/ (t49, issue #65).

Run from the repository root: python ml/data/advice/save_sources.py

build_advice.py checks every entry word for word against these files. The management text in
ml/data/symptoms/management/ holds only each sheet's Management section; the About and Harvest
and storage entries also come from the Background and Recognize the problem sections, so the
whole sheet is saved here. Plantwise PDFs come from the cache in ml/data/symptoms/cache/
(the sheets not in sources.csv are downloaded once into the same cache); PlantVillage text
is each disease's Cause, Comments and Management from the cached crop page.

The symptom text pipeline (ml/src/data/symptom_text.py, sources.csv) is not changed: a sheet
added here is not used for symptom sentences.
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "data"))
from symptom_text import _lines, download  # noqa: E402

CACHE = ROOT / "data" / "symptoms" / "cache"
OUT = ROOT / "data" / "advice" / "sources"
PW = "https://factsheetadmin.plantwise.org/Uploads/PDFs/{}.pdf"

# Every Plantwise sheet the advice uses (the first eight were already in the cache).
PLANTWISE = [
    "20103326450", "20117800552", "20127801047", "20127802686", "20137803397", "20137804183",
    "20137804212", "20147801161", "20147801362", "20147801404", "20147801445", "20157800166",
    "20157800171", "20157800231",
    "20197800158",  # Mechanical Control of Potato Early blight (Afghanistan, 2017): new for t49
    # Added 8 Nov 2026 after the wider source search (t49)
    "20127802679",  # Early blight (Trinidad and Tobago, 2011)
    "20137804207",  # Bacterial Spot on tomato (Kenya, KENGAP, 2012)
    "20137804214",  # Late blight on Tomato (Kenya, KENGAP, 2012)
    "20127801767",  # Potato late blight (Rwanda, 2012)
    "20157801442",  # Management of Potato late blight (Myanmar, 2014)
]# file name -> (crop page, disease heading on that page)
PLANTVILLAGE = {
    "plantvillage-corn-maize-cercospora-leaf-spot-gray-leaf-spot": ("corn-maize", "Cercospora leaf spot (Gray leaf spot)"),
    "plantvillage-corn-maize-common-rust": ("corn-maize", "Common rust"),
    "plantvillage-corn-maize-northern-leaf-blight": ("corn-maize", "Northern Leaf Blight"),
    "plantvillage-potato-potato-early-blight": ("potato", "Potato Early Blight"),
    "plantvillage-potato-potato-late-blight": ("potato", "Potato Late Blight"),
    "plantvillage-tomato-bacterial-spot": ("tomato", "Bacterial spot"),
    "plantvillage-tomato-early-blight": ("tomato", "Early blight"),
    "plantvillage-tomato-late-blight": ("tomato", "Late blight"),
}


def plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def plantwise(sheet_id: str) -> str:
    pdf = download(PW.format(sheet_id), CACHE)
    text = re.sub(r"\s+", " ", " ".join(_lines(pdf))).strip()
    licence = re.search(r"CC[- ]BY[- ]SA \d\.\d", text)
    if not licence:
        raise SystemExit(f"{sheet_id}: no CC BY-SA licence line, not saved")
    return f"Plantwise factsheet {sheet_id}\n{PW.format(sheet_id)}\n{licence.group(0)}\n\n{text}\n"


def plantvillage(crop: str, section: str) -> str:
    page = (CACHE / f"plantvillage-{crop}.html").read_text(encoding="utf-8")
    heading = re.search(rf"<h4>\s*{re.escape(section)}\s*<span", page)
    if heading is None:
        raise SystemExit(f"PlantVillage {crop}: {section!r} not found")
    end = page.find("<h4>", heading.end())
    text = plain(page[heading.end(): end if end != -1 else len(page)])
    start = text.find("Cause ")
    if start == -1:
        raise SystemExit(f"PlantVillage {crop}: {section!r} has no Cause line")
    text = text[start:].split(' $("#')[0].strip()  # the page's script follows the last block
    url = f"https://plantvillage.psu.edu/topics/{crop}/infos"
    return f"PlantVillage: {section}\n{url}\nCC BY-SA 3.0 (plantvillage.psu.edu/tos)\n\n{text}\n"


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet_id in PLANTWISE:
        (OUT / f"{sheet_id}.txt").write_text(plantwise(sheet_id), encoding="utf-8")
    for name, (crop, section) in PLANTVILLAGE.items():
        (OUT / f"{name}.txt").write_text(plantvillage(crop, section), encoding="utf-8")
    print(f"saved {len(PLANTWISE) + len(PLANTVILLAGE)} source texts to {OUT}")
