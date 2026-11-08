"""Disease library for farmers (tracker g08): every result the model can give, with its advice.

Read only, for any signed-in user. It shows the advice library as it is now (active entries,
word for word with their sources), grouped by kind: about (cause, spread, weather), treatment,
prevention, and harvest and storage. It is general information, not a diagnosis: to know what
is on a crop, the farmer checks a leaf or asks an extension officer.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.knowledge_base import KNOWLEDGE_BASE, display_name, warning_for
from app.db.session import get_db
from app.models.advice import AdviceEntry, AdviceKind, AdviceStatus
from app.models.user import User
from app.schemas.library import LibraryDisease

router = APIRouter(prefix="/library", tags=["library"])

CROPS = (("Corn_(maize)", "maize"), ("Tomato", "tomato"), ("Potato", "potato"))


def _crop_of(class_name: str) -> str:
    return next(crop for prefix, crop in CROPS if class_name.startswith(prefix))


@router.get("", response_model=list[LibraryDisease])
def library(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The 11 results by crop, diseases first and the healthy result last, each with its advice."""
    entries = (db.query(AdviceEntry).filter(AdviceEntry.status == AdviceStatus.active)
               .order_by(AdviceEntry.advice_id).all())
    out = []
    for class_name in KNOWLEDGE_BASE:
        mine = [e for e in entries if e.disease == class_name]
        texts = {kind.value: [e.text for e in mine if e.kind == kind] for kind in AdviceKind}
        out.append(LibraryDisease(
            class_name=class_name,
            name=display_name(class_name),
            crop=_crop_of(class_name),
            healthy=class_name.endswith("healthy"),
            about=texts["about"],
            treatment=texts["treatment"],
            prevention=texts["prevention"],
            harvest=texts["harvest"],
            sources=sorted({f"{e.source_title} ({e.licence}): {e.source_url}" for e in mine}),
            warning=warning_for(class_name),
        ))
    order = {crop: i for i, (_, crop) in enumerate(CROPS)}
    return sorted(out, key=lambda d: (order[d.crop], d.healthy, d.name))
