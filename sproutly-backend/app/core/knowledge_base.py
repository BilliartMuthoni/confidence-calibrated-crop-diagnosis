"""Treatment guidance for the 11 classes the model predicts.

Grounded content only -- the system retrieves and presents text as written rather
than generating advice. Treatment and prevention come from the advice library (D16):
excerpts copied word for word from Plantwise factsheets for farmers (CABI, CC BY-SA 4.0)
and PlantVillage (CC BY-SA 3.0), with no pesticide product or rate, built and checked by
ml/data/advice/build_advice.py and loaded with app/scripts/import_advice.py. The
treatment and prevention lists below are only a fallback for a class with no library
entries; the summaries are the project's own short descriptions.

Keys are the model's class names (PlantVillage folder names).
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.advice import AdviceEntry, AdviceKind, AdviceStatus

KNOWLEDGE_BASE = {
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": {
        "name": "Maize Gray Leaf Spot",
        "summary": "Long, narrow grey to tan rectangular lesions running between the leaf veins.",
        "treatment": [
            "Apply a registered fungicide if lesions reach the upper leaves before tasselling, following the label rate.",
            "Remove heavily affected lower leaves where practical.",
        ],
        "prevention": [
            "Rotate away from maize for at least one season.",
            "Bury or clear infected crop residue after harvest.",
            "Plant tolerant varieties where available.",
        ],
    },
    "Corn_(maize)___Common_rust_": {
        "name": "Maize Common Rust",
        "summary": "Small reddish-brown pustules scattered across both leaf surfaces.",
        "treatment": [
            "Apply a registered fungicide at first sign if the crop is still early.",
            "Do not spray within the pre-harvest interval on the label.",
        ],
        "prevention": [
            "Plant early to avoid peak rust pressure.",
            "Use resistant varieties where available.",
        ],
    },
    "Corn_(maize)___Northern_Leaf_Blight": {
        "name": "Maize Northern Leaf Blight",
        "summary": "A fungal disease causing long grey-green, cigar-shaped lesions on the leaves.",
        "treatment": [
            "Remove and destroy badly affected lower leaves.",
            "Apply a registered fungicide containing mancozeb, following the label rate.",
            "Avoid overhead irrigation late in the day.",
        ],
        "prevention": [
            "Rotate away from maize for at least one season.",
            "Plant tolerant varieties where available.",
            "Clear crop residue after harvest.",
        ],
    },
    "Corn_(maize)___healthy": {
        "name": "Healthy maize",
        "summary": "No disease was detected on this leaf.",
        "treatment": [],
        "prevention": [
            "Keep checking the crop weekly, especially the lower leaves.",
            "Rotate crops between seasons and clear residue after harvest.",
        ],
    },
    "Tomato___Bacterial_spot": {
        "name": "Tomato Bacterial Spot",
        "summary": "Small, dark, water-soaked spots on leaves that may turn brown with a yellow edge.",
        "treatment": [
            "Remove and destroy badly affected leaves.",
            "Apply a registered copper-based bactericide, following the label rate.",
            "Avoid working in the crop while foliage is wet.",
        ],
        "prevention": [
            "Use certified disease-free seed or seedlings.",
            "Water at the base of the plant rather than over the leaves.",
            "Rotate away from tomatoes and peppers.",
        ],
    },
    "Tomato___Early_blight": {
        "name": "Tomato Early Blight",
        "summary": "Brown spots with concentric rings, usually starting on older leaves.",
        "treatment": [
            "Remove affected lower leaves and destroy them.",
            "Apply a registered fungicide following label instructions.",
        ],
        "prevention": [
            "Mulch to stop soil splashing onto lower leaves.",
            "Rotate with a non-solanaceous crop.",
        ],
    },
    "Tomato___Late_blight": {
        "name": "Tomato Late Blight",
        "summary": "Dark water-soaked patches that spread quickly in cool, wet weather.",
        "treatment": [
            "Remove and bury affected plants away from the field.",
            "Apply a registered fungicide, repeating as directed on the label.",
            "Avoid working in the crop while foliage is wet.",
        ],
        "prevention": [
            "Improve spacing and drainage to reduce leaf wetness.",
            "Use certified disease-free seed or seedlings.",
            "Do not plant tomatoes after potatoes on the same plot.",
        ],
    },
    "Tomato___healthy": {
        "name": "Healthy tomato",
        "summary": "No disease was detected on this leaf.",
        "treatment": [],
        "prevention": [
            "Keep checking the crop weekly, especially after cool, wet weather.",
            "Water at the base of the plant and keep good spacing for air flow.",
        ],
    },
    "Potato___Early_blight": {
        "name": "Potato Early Blight",
        "summary": "Dark spots with concentric rings on older leaves, worse on stressed plants.",
        "treatment": [
            "Remove badly affected foliage.",
            "Apply a registered fungicide as directed.",
        ],
        "prevention": [
            "Keep plants well watered and fed to reduce stress.",
            "Rotate crops between seasons.",
        ],
    },
    "Potato___Late_blight": {
        "name": "Potato Late Blight",
        "summary": "Rapidly spreading dark lesions on leaves and stems in wet conditions.",
        "treatment": [
            "Remove and destroy affected haulms.",
            "Apply a registered protectant fungicide before rain where possible.",
            "Harvest only in dry conditions to limit tuber infection.",
        ],
        "prevention": [
            "Plant certified seed potatoes.",
            "Earth up well to protect developing tubers.",
            "Rotate away from potatoes and tomatoes.",
        ],
    },
    "Potato___healthy": {
        "name": "Healthy potato",
        "summary": "No disease was detected on this leaf.",
        "treatment": [],
        "prevention": [
            "Keep checking the crop weekly, especially after rain.",
            "Plant certified seed potatoes and rotate away from potatoes and tomatoes.",
        ],
    },
}


def display_name(class_name: str) -> str:
    return KNOWLEDGE_BASE.get(class_name, {}).get("name", class_name)


def get_guidance(class_name: str, db: Optional[Session] = None):
    """Advice for one class. Once the advice library (managed in the admin portal, D16) has
    active entries for the class, those are shown word for word with their sources; until
    then the placeholder text above."""
    entry = KNOWLEDGE_BASE.get(class_name)
    if entry is None:
        return None
    guidance = {key: entry[key] for key in ("summary", "treatment", "prevention")}
    guidance["sources"] = []
    if db is not None:
        library = (
            db.query(AdviceEntry)
            .filter(AdviceEntry.disease == class_name, AdviceEntry.status == AdviceStatus.active)
            .order_by(AdviceEntry.advice_id)
            .all()
        )
        if library:
            for kind in AdviceKind:
                guidance[kind.value] = [a.text for a in library if a.kind == kind]
            guidance["sources"] = sorted({f"{a.source_title} ({a.licence}): {a.source_url}" for a in library})
    return guidance
