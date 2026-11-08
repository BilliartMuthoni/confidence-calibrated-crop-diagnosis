from typing import List, Optional

from pydantic import BaseModel


class LibraryDisease(BaseModel):
    """One result in the farmers' disease library (g08), with today's advice for it."""
    class_name: str
    name: str
    crop: str  # maize, tomato or potato
    healthy: bool
    about: List[str] = []       # cause, spread, weather
    treatment: List[str] = []   # what to do now
    prevention: List[str] = []  # stopping it coming back
    harvest: List[str] = []     # harvest and storage
    sources: List[str] = []     # "Title (licence): link"
    warning: Optional[str] = None  # late blight: can spread fast
