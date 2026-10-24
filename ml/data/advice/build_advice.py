"""Builds advice.csv (this folder) for sproutly-backend/app/scripts/import_advice.py (t07, D16).

Run from the repository root: python ml/data/advice/build_advice.py

Every entry is checked to appear word for word in the factsheet text saved in
ml/data/symptoms/management/ (PlantVillage clauses: split at semicolons, first letter
capitalised, otherwise unchanged). Lines naming a pesticide product or a rate were left out.
"""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANAGEMENT = ROOT / "symptoms" / "management"
OUT = ROOT / "advice" / "advice.csv"

PW = "https://factsheetadmin.plantwise.org/Uploads/PDFs/{}.pdf"
SHEETS = {  # file -> (title, licence, url)
    "20117800552": ("Plantwise factsheet for farmers: Potato late blight (Kenya, 2011), CABI", "CC BY-SA 4.0"),
    "20103326450": ("Plantwise factsheet for farmers: Potato blight (Kenya, 2006), CABI", "CC BY-SA 4.0"),
    "20157800231": ("Plantwise factsheet for farmers: Late blight of potato (Bangladesh, 2013, revised July 2020), CABI", "CC BY-SA 4.0"),
    "20147801445": ("Plantwise factsheet for farmers: Cultural management of late blight of potato (Nepal, 2012), CABI", "CC BY-SA 4.0"),
    "20137804183": ("Plantwise factsheet for farmers: Late blight or barafu in tomatoes (Kenya, 2012), CABI", "CC BY-SA 4.0"),
    "20137803397": ("Plantwise factsheet for farmers: Early blight management in tomatoes (Tanzania, 2012), CABI", "CC BY-SA 4.0"),
    "20127802686": ("Plantwise factsheet for farmers: Bacterial leaf spot (Trinidad and Tobago, 2011), CABI", "CC BY-SA 4.0"),
    "20147801404": ("Plantwise factsheet for farmers: Grey leaf spot disease management in maize (Zambia, 2013), CABI", "CC BY-SA 4.0"),
}
OTHER = {  # file -> (title, licence, url): recent research with an open licence
    "njeru-2023-peerj": ("Njeru et al. (2023), Major biotic stresses affecting maize production in Kenya, PeerJ",
                         "CC BY 4.0", "https://doi.org/10.7717/peerj.15685"),
}
PV = {  # file -> (title, url)
    "plantvillage-corn-maize-cercospora-leaf-spot-gray-leaf-spot": ("PlantVillage: Corn (maize), Cercospora leaf spot (Gray leaf spot)", "https://plantvillage.psu.edu/topics/corn-maize/infos"),
    "plantvillage-corn-maize-common-rust": ("PlantVillage: Corn (maize), Common rust", "https://plantvillage.psu.edu/topics/corn-maize/infos"),
    "plantvillage-corn-maize-northern-leaf-blight": ("PlantVillage: Corn (maize), Northern Leaf Blight", "https://plantvillage.psu.edu/topics/corn-maize/infos"),
    "plantvillage-potato-potato-early-blight": ("PlantVillage: Potato, Early Blight", "https://plantvillage.psu.edu/topics/potato/infos"),
    "plantvillage-tomato-bacterial-spot": ("PlantVillage: Tomato, Bacterial spot", "https://plantvillage.psu.edu/topics/tomato/infos"),
    "plantvillage-tomato-late-blight": ("PlantVillage: Tomato, Late blight", "https://plantvillage.psu.edu/topics/tomato/infos"),
}

GLS = "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot"
RUST = "Corn_(maize)___Common_rust_"
NLB = "Corn_(maize)___Northern_Leaf_Blight"
M_OK = "Corn_(maize)___healthy"
T_BS, T_EB, T_LB, T_OK = "Tomato___Bacterial_spot", "Tomato___Early_blight", "Tomato___Late_blight", "Tomato___healthy"
P_EB, P_LB, P_OK = "Potato___Early_blight", "Potato___Late_blight", "Potato___healthy"
T, P = "treatment", "prevention"

# (class, kind, source file, text)
ROWS = [
    # Maize gray leaf spot
    (GLS, P, "20147801404", "Rotate maize with legumes such as beans, cowpeas and groundnuts, or cereals other than maize"),
    (GLS, P, "20147801404", "Use grey leaf spot resistant maize varieties available from various seed companies. Read brochures of seed suppliers to know if the variety is resistant or not."),
    (GLS, P, "20147801404", "Plant on time, preferably at the onset of rains, because the disease will attack later. Planting on time will mean the disease will have little effect on yield."),
    (GLS, T, "plantvillage-corn-maize-cercospora-leaf-spot-gray-leaf-spot", "Crop rotation and plowing debris into soil may reduce levels of inoculum in the soil but may not provide control in areas where the disease is prevalent"),
    (GLS, T, "plantvillage-corn-maize-cercospora-leaf-spot-gray-leaf-spot", "Foliar fungicides may be economically viable for some high yeilding susceptible hybrids."),
    (GLS, P, "njeru-2023-peerj", "In the cultural approach, crop rotation and effective burying of the infected plants debris, have reduced the severity of infection in the subsequent round of planting."),
    (GLS, P, "njeru-2023-peerj", "Host plant resistance therefore, remains the most viable and reliable method for the management of TLB and GLS."),
    # Maize common rust
    (RUST, P, "plantvillage-corn-maize-common-rust", "The most effective method of controlling the disease is to plant resistant hybrids"),
    (RUST, T, "plantvillage-corn-maize-common-rust", "Application of appropriate fungicides may provide some degree on control and reduce disease severity"),
    (RUST, T, "plantvillage-corn-maize-common-rust", "Fungicides are most effective when the amount of secondary inoculum is still low, generally when plants only have a few rust pustules per leaf."),
    # Maize northern leaf blight
    (NLB, P, "plantvillage-corn-maize-northern-leaf-blight", "Follow proper tillage to reduce fungus inoculum from crop debris."),
    (NLB, P, "plantvillage-corn-maize-northern-leaf-blight", "Follow crop rotation with non host crop."),
    (NLB, P, "plantvillage-corn-maize-northern-leaf-blight", "Grow available resistant varieties."),
    (NLB, T, "plantvillage-corn-maize-northern-leaf-blight", "In severe case of disease incidence apply suitable fungicide."),
    (NLB, P, "njeru-2023-peerj", "In the cultural approach, crop rotation and effective burying of the infected plants debris, have reduced the severity of infection in the subsequent round of planting."),
    (NLB, P, "njeru-2023-peerj", "Host plant resistance therefore, remains the most viable and reliable method for the management of TLB and GLS."),
    # Healthy maize
    (M_OK, P, "20147801404", "Rotate maize with legumes such as beans, cowpeas and groundnuts, or cereals other than maize"),
    (M_OK, P, "20147801404", "Plant on time, preferably at the onset of rains, because the disease will attack later. Planting on time will mean the disease will have little effect on yield."),
    # Tomato bacterial spot
    (T_BS, T, "20127802686", "Avoid overhead sprinklers. Use drip irrigation to avoid splashing soil on the plants."),
    (T_BS, T, "plantvillage-tomato-bacterial-spot", "Remove all crop debris from planting area"),
    (T_BS, P, "20127802686", "Use disease-free seedlings."),
    (T_BS, P, "20127802686", "Do not overcrowd the plants in the field. Leave some space between them."),
    (T_BS, P, "20127802686", "Mulch can reduce the spread of the disease by reducing soil splash. Plastic mulch works well."),
    (T_BS, P, "20127802686", "After harvest, do not plant sweet peppers, tomato or hot peppers in the same soil."),
    # Tomato early blight
    (T_EB, T, "20137803397", "Remove and destroy diseased plants or plant parts. But do not openly carry materials through your field, because this will carry the disease."),
    (T_EB, T, "20137803397", "Do not work in the field during wet conditions because of disease spread via water, humans, or machinery."),
    (T_EB, T, "20137803397", "Disinfect pruning knifes, gloves or hands with bleach before working on next plant. Immediately wash hands with water, because bleach is toxic."),
    (T_EB, P, "20137803397", "Use non-infected seeds from healthy tomatoes, or certified seeds."),
    (T_EB, P, "20137803397", "Transplant only disease free seedlings."),
    (T_EB, P, "20137803397", "Remove and destroy plant residues and debris."),
    (T_EB, P, "20137803397", "Ensure aeration (keep > 10 cm seedling space, > 60 cm plant space)."),
    (T_EB, P, "20137803397", "Avoid unnecessary irrigation. If needed, only irrigate early in the day to allow rapid drying of the leaves."),
    # Tomato late blight
    (T_LB, T, "20137804183", "Weed regularly and remove crops like potatoes and black nightshade. Remove diseased leaves and plant parts from the field."),
    (T_LB, T, "20137804183", "Wash tools with clean water after use to avoid spread of the disease."),
    (T_LB, P, "20137804183", "Plant tomatoes 90cm by 30cm or 75cm by 45cm or 60cm by 60cm."),
    (T_LB, P, "20137804183", "Do not grow tomatoes every year in the same place: alternate with onion then beans and cabbage."),
    (T_LB, P, "20137804183", "If you plant short varieties such as Riogrande and Kilele F1 cover the soil with dry grass or wheat straws. Do not use weeds since they could spread pests and diseases."),
    (T_LB, P, "plantvillage-tomato-late-blight", "Plant resistant varieties"),
    # Healthy tomato
    (T_OK, P, "20127802686", "Use disease-free seedlings."),
    (T_OK, P, "20137804183", "Do not grow tomatoes every year in the same place: alternate with onion then beans and cabbage."),
    (T_OK, P, "20137803397", "Avoid unnecessary irrigation. If needed, only irrigate early in the day to allow rapid drying of the leaves."),
    # Potato early blight
    (P_EB, T, "plantvillage-potato-potato-early-blight", "Application of appropriate protective fungicide can reduce severity of foliar symptoms"),
    (P_EB, T, "plantvillage-potato-potato-early-blight", "Reduce stress to plants by fertilizing and watering adequately"),
    (P_EB, P, "plantvillage-potato-potato-early-blight", "Plant late varieties which are less susceptible to disease"),
    (P_EB, P, "plantvillage-potato-potato-early-blight", "Store tubers in cool environment"),
    # Potato late blight
    (P_LB, T, "20117800552", "Inspect your crops often and act as soon as you see late blight in your potatoes."),
    (P_LB, T, "20103326450", "Do not let many people enter your field, because they may bring in the fungus on their feet, or their clothing or their tools."),
    (P_LB, T, "20103326450", "Use clean jembes to avoid spreading the fungus."),
    (P_LB, T, "20147801445", "Irrigate the field early in the morning so that the leaves do not remain wet for too long"),
    (P_LB, T, "20117800552", "Remove and destroy all stems and leaves at least two weeks before harvesting, so the disease does not spread from the leaves to the potatoes when harvesting."),
    (P_LB, T, "20157800231", "Inspect the field regularly for signs of blight"),
    (P_LB, T, "20157800231", "Irrigation must be stopped as soon as late blight infection is noticed"),
    (P_LB, P, "20157800231", "Use disease-free/clean seed for planting"),
    (P_LB, P, "20117800552", "Use clean seed potatoes, from a source you trust."),
    (P_LB, P, "20117800552", "After harvesting potatoes, plant a different crop the following year."),
    (P_LB, P, "20117800552", "Moulding soil along the potatoes to protect the tubers from the disease."),
    (P_LB, P, "20117800552", "Some potato varieties are somewhat resistance to late blight such as Tigoni (Kenya) and Rutuku (Uganda)."),
    (P_LB, P, "20103326450", "Plant potatoes far apart so that the air and sun can dry the ground a bit. Plant at 60 by 30 centimetres for small varieties and 90 by 45 centimetres for tall varieties. This way the fungus does not spread from plant to plant."),
    (P_LB, P, "20103326450", "Keep the crop free of weeds to reduce moisture around the plants."),
    (P_LB, P, "20147801445", "Don't wash the tubers before storage as this will spread the disease"),
    # Healthy potato
    (P_OK, P, "20117800552", "Use clean seed potatoes, from a source you trust."),
    (P_OK, P, "20117800552", "After harvesting potatoes, plant a different crop the following year."),
    (P_OK, P, "20103326450", "Keep the crop free of weeds to reduce moisture around the plants."),
]

# Never let a product name or a rate through.
FORBIDDEN = re.compile(r"mancozeb|metalaxyl|ridomil|dithane|propineb|copper|chlorothalonil|tebuconazole|carbendazim|"
                       r"flusilazole|\bml\b|gram|litre|ltr|\bkg\b|%|@", re.I)


def body(name):
    return MANAGEMENT.joinpath(f"{name}.txt").read_text(encoding="utf-8").split("\n\n", 1)[1]


def norm(text):
    return re.sub(r"\s+", " ", text).strip()


rows, problems = [], []
for cls, kind, src, text in ROWS:
    source = norm(body(src))
    if src in SHEETS:
        title, licence = SHEETS[src]
        url = PW.format(src)
        found = text in source
    elif src in OTHER:
        title, licence, url = OTHER[src]
        found = text in source
    else:
        title, url = PV[src]
        licence = "CC BY-SA 3.0"
        # PlantVillage clause: same words, only the first letter capitalised.
        found = text in source or (text[0].lower() + text[1:]) in source
    if not found:
        problems.append(f"not word for word: {src}: {text[:60]}")
    if FORBIDDEN.search(text):
        problems.append(f"product or rate: {text[:60]}")
    rows.append({"disease": cls, "kind": kind, "text": text, "source_title": title, "source_url": url, "licence": licence})
assert not problems, "\n".join(problems)

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["disease", "kind", "text", "source_title", "source_url", "licence"])
    writer.writeheader()
    writer.writerows(rows)

from collections import Counter  # noqa: E402
print(f"{len(rows)} entries, all word for word, no product or rate")
for (cls, kind), n in sorted(Counter((r["disease"], r["kind"]) for r in rows).items()):
    print(f"  {cls:55s} {kind:10s} {n}")
