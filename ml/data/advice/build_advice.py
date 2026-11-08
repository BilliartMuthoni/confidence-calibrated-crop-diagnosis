"""Builds advice.csv (this folder) for sproutly-backend/app/scripts/import_advice.py (t07, D16).

Run from the repository root: python ml/data/advice/build_advice.py

Every entry is checked to appear word for word in the source text saved in
ml/data/advice/sources/ by save_sources.py (the whole sheet), or for the Njeru paper in
ml/data/symptoms/management/ (PlantVillage clauses: split at semicolons, first letter
capitalised, otherwise unchanged). Lines naming a pesticide product or a rate were left out.

Kinds (t49, issue #65): treatment and prevention are shown on the result screen; about (what
causes it, how it spreads, the weather it likes) and harvest (harvest and storage) are only
chosen by the assistant. No licensed source says whether a diseased crop is safe to eat, so
there are no eating entries. The NPCK Potato Production Handbook (2019) has no open licence
and is not quoted.
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
    # Added for the About and Harvest and storage entries (t49)
    "20137804212": ("Plantwise factsheet for farmers: Early blight on Tomato (Kenya, 2012), CABI", "CC BY-SA 4.0"),
    "20147801161": ("Plantwise factsheet for farmers: Late blight disease management in tomatoes (Tanzania, 2012), CABI", "CC BY-SA 4.0"),
    "20147801362": ("Plantwise factsheet for farmers: Late Blight of Potato (Pakistan, 2012), CABI", "CC BY-SA 4.0"),
    "20157800166": ("Plantwise factsheet for farmers: Late Blight of Tomatoes (Pakistan, 2013), CABI", "CC BY-SA 4.0"),
    "20157800171": ("Plantwise factsheet for farmers: Potato Late Blight (Pakistan, 2013), CABI", "CC BY-SA 4.0"),
    "20197800158": ("Plantwise factsheet for farmers: Mechanical Control of Potato Early blight (Afghanistan, 2017), CABI", "CC BY-SA 4.0"),
    "20127802679": ("Plantwise factsheet for farmers: Early blight (Trinidad and Tobago, 2011), CABI", "CC BY-SA 4.0"),
    "20137804207": ("Plantwise factsheet for farmers: Bacterial Spot on tomato (Kenya, 2012), KENGAP Horticulture and CABI", "CC BY-SA 4.0"),
    "20137804214": ("Plantwise factsheet for farmers: Late blight on Tomato (Kenya, 2012), KENGAP Horticulture and CABI", "CC BY-SA 4.0"),
    "20127801767": ("Plantwise factsheet for farmers: Potato late blight (Rwanda, 2012), Rwanda Agriculture Board and CABI", "CC BY-SA 4.0"),
    "20157801442": ("Plantwise factsheet for farmers: Management of Potato late blight (Myanmar, 2014), CABI", "CC BY-SA 4.0"),
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
    "plantvillage-potato-potato-late-blight": ("PlantVillage: Potato, Late Blight", "https://plantvillage.psu.edu/topics/potato/infos"),
    "plantvillage-tomato-early-blight": ("PlantVillage: Tomato, Early blight", "https://plantvillage.psu.edu/topics/tomato/infos"),
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
A, H = "about", "harvest"  # assistant only: cause, spread, weather; harvest and storage

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

    # ---- Added 8 Nov 2026 (t49, issue #65): more prevention for potato early blight, the
    # about entries (cause, spread, weather) and harvest and storage entries.
    # Maize gray leaf spot
    (GLS, A, "20147801404", "Grey leaf spot is a fungal disease that affects maize."),
    (GLS, A, "20147801404", "The disease survives on maize residues left on the soil surface from season to season."),
    (GLS, A, "20147801404", "When the weather is good, the fungus begins to develop on residues and produces a powdery substance."),
    (GLS, A, "20147801404", "This substance is blown by wind onto the lower leaves of the maize plants and infects them."),
    # Maize common rust
    (RUST, A, "plantvillage-corn-maize-common-rust", "Disease is spread by wind-borne spores"),
    # Maize northern leaf blight
    (NLB, A, "plantvillage-corn-maize-northern-leaf-blight", "The disease mainly spread through rain splash and wind."),
    # Tomato bacterial spot
    (T_BS, A, "20127802686", "This disease can be carried in the seeds of the crop."),
    (T_BS, A, "20127802686", "The disease is worse in wet conditions."),
    (T_BS, A, "20127802686", "The disease spreads from diseased plants, from the soil and from the splash of water."),
    (T_BS, A, "20127802686", "The bacteria can be spread by touching sick plants."),
    (T_BS, A, "20127802686", "The disease can survive in crop remains."),
    (T_BS, H, "20127802686", "Fruits develop raised spots and cannot be sold."),
    # Tomato early blight
    (T_EB, A, "20137804212", "Early blight is a seed-borne disease that results in poor germination of seedlings."),
    (T_EB, A, "20137804212", "Disease development is most serious during warm wet conditions."),
    (T_EB, A, "20137804212", "The disease is also spread by wind, rain, running water, farm tools and also farm workers."),
    (T_EB, A, "20137803397", "The fungus spreads quickly during warm weather."),
    (T_EB, A, "plantvillage-tomato-early-blight", "Disease can spread rapidly after plants have set fruit"),
    # Tomato late blight
    (T_LB, A, "20137804183", "The water mould produces spores which survive in soil and in plants (e.g. tomato seeds, crop carry over and weeds)."),
    (T_LB, A, "20137804183", "Rain helps to splash spores on to new plants."),
    (T_LB, A, "20137804183", "The disease is also spread by tools and on clothing."),
    (T_LB, A, "20137804183", "Barafu is common during wet and cold weather and spreads rapidly between tomato plants close to each other."),
    (T_LB, A, "20137804183", "Barafu also attacks potato and black nightshade."),
    (T_LB, A, "20147801161", "Blight can be blown by wind from far away, and can infect your field."),
    (T_LB, A, "20157800166", "Late blight can survive from one season to the next in infected tomato seeds."),
    # Potato early blight
    (P_EB, A, "20197800158", "Early blight is a fungal disease of potato, with the disease prevalent during periods of dry weather with intermittent rain."),
    (P_EB, A, "20197800158", "Under humid conditions, the disease spreads rapidly from the lower leaves to those at the top and may cause premature death of plants."),
    (P_EB, P, "20197800158", "Crop rotation with non-host crops like, cereals, pulses and clover."),
    (P_EB, P, "20197800158", "Seed or tuber must be certified and disease free."),
    (P_EB, P, "20197800158", "Weed control regularly."),
    (P_EB, P, "20197800158", "Regular irrigation and avoid over-watering."),
    (P_EB, H, "20197800158", "Crop debris should be destroyed by burning after the harvest."),
    # Potato late blight
    (P_LB, A, "20117800552", "Late blight is more common in wet weather."),
    (P_LB, A, "20117800552", "The disease infects leaves and will spread to the tubers."),
    (P_LB, A, "20117800552", "The disease can be carried in seed potatoes."),
    (P_LB, A, "20103326450", "Potatoes get blight when the weather is cold and wet and when the plants are too close together."),
    (P_LB, A, "20147801362", "The fungus can be spread from infected to healthy plants through wind, rain, dew, and high humidity."),
    (P_LB, A, "20157800171", "The disease can be spread from one field to another through contact with people or agricultural tools."),
    (P_LB, A, "20157800231", "In cold and wet weather, the disease can kill the whole field of plants within 2-3 days."),
    (P_LB, H, "20117800552", "This disease will significantly reduce yield and make potato rot in store."),
    (P_LB, H, "20147801362", "Seemingly healthy tubers of infected crops may rot later when in store."),
    (P_LB, H, "20147801362", "Remove blighted tubers before putting in store"),
    (P_LB, H, "20147801362", "Do not wash potatoes that are to be stored."),

    # ---- Added 8 Nov 2026 after the wider source search (four AIs' leads, each checked here
    # word for word and for its licence): five more Plantwise sheets. Mostly non-chemical
    # treatment ("what to do now") the library was short of. Wikipedia was considered and left
    # out: the symptom text already rejected it as not an institutional source, and its rows
    # mostly repeated the Plantwise sheets.
    # Maize gray leaf spot
    # Maize northern leaf blight
    # Tomato bacterial spot
    (T_BS, T, "20137804207", "Avoid working on wet fields since the disease spreads faster."),
    (T_BS, T, "20137804207", "Use flood or furrow irrigation where possible and in case of overhead irrigation, irrigate at a time when the leaves will dry quickly."),
    (T_BS, P, "20137804207", "Plant certified disease-free seeds."),
    (T_BS, P, "20137804207", "Practice crop rotation with crops not related to tomatoes (e.g. not pepper, brinjals or potatoes)"),
    (T_BS, A, "20137804207", "Disease is spread in the farm when working during wet weather conditions."),
    # Tomato early blight
    (T_EB, T, "20127802679", "Remove diseased plant parts from the field and dispose."),
    (T_EB, T, "20127802679", "Prune overgrown plants to keep humidity low and to let in the air."),
    (T_EB, P, "20127802679", "Keep the crop dry by planting crops wide apart to allow free flow of air between plants."),
    (T_EB, P, "20127802679", "Mulch around plants to reduce soil-water splash and help keep spores off healthy leaves."),
    (T_EB, P, "20127802679", "Do not replant these types of crops (peppers or tomatoes) in the same field for at least two to three years."),
    # Tomato late blight
    (T_LB, T, "20137804214", "Stake the plant to keep them off soil."),
    (T_LB, T, "20137804214", "Mulch the plant to reduce water splashes."),
    (T_LB, T, "20137804214", "Irrigating during the day can help reduce the severity of the infection because this disease needs to have free water around to spread."),
    (T_LB, P, "20137804214", "Practice crop rotation by avoiding tomato or related crops (e.g. Irish potatoes, capsicum, brinjals etc) for at least 3 to 4 seasons."),
    (T_LB, P, "20137804214", "Transplants should be free of disease."),
    (T_LB, A, "20137804214", "The disease survives in old crop residues and other plants related to the tomato."),
    (T_LB, A, "20137804214", "The disease can also be spread by overhead irrigation and in overcrowded farms."),
    # Potato early blight
    # Potato late blight
    (P_LB, T, "20127801767", "Wash field equipment and machinery after use"),
    (P_LB, T, "20127801767", "Destroy all culled and volunteer potatoes"),
    (P_LB, P, "20127801767", "Rotate with maize, wheat or beans after each season."),
    (P_LB, P, "20127801767", "Use resistant and/or tolerant varieties"),
    (P_LB, P, "20157801442", "Choose fields with good air ventilation and well-drained soil."),
    (P_LB, A, "20127801767", "The fungus survives in the tubers, volunteer plants and discarded piles of potatoes."),
    (P_LB, A, "20127801767", "The fungus is spread between plants by wind, rain, machinery and animals."),
    (P_LB, H, "20157801442", "Low temperatures and good ventilation are needed for storage tubers."),
]

# Never let a product name or a rate through.
FORBIDDEN = re.compile(r"mancozeb|metalaxyl|ridomil|dithane|propineb|copper|chlorothalonil|tebuconazole|carbendazim|"
                       r"flusilazole|\bml\b|gram|litre|ltr|\bkg\b|%|@", re.I)


SOURCES = ROOT / "advice" / "sources"


def body(name):
    # The whole sheet (save_sources.py) where saved; otherwise its Management section.
    path = SOURCES / f"{name}.txt"
    if not path.exists():
        path = MANAGEMENT / f"{name}.txt"
    return path.read_text(encoding="utf-8").split("\n\n", 1)[1]


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
