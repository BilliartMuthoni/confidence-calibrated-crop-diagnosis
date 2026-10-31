"""Kenya's 47 counties (Constitution of Kenya 2010, First Schedule), spelled as the admin portal spells them."""

COUNTIES = [
    "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo",
    "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale",
    "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a",
    "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta",
    "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
]


# A support contact for every county (e.g. the Ministry's toll-free line): shown to every farmer.
NATIONWIDE = "Nationwide"


def check_county(value: str) -> str:
    """For pydantic validators: the value unchanged if it is a county, else an error."""
    if value not in COUNTIES:
        raise ValueError("Not one of Kenya's 47 counties")
    return value


def check_contact_county(value: str) -> str:
    """A support contact belongs to one county, or to every county (NATIONWIDE)."""
    return value if value == NATIONWIDE else check_county(value)
