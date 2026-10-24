from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The deployed ensemble (notebook 18b): v2 ResNet-50 seed 44, ConvNeXt-Tiny (1e-4), EfficientNet-B0.
DEFAULT_MODEL_PATH = ",".join(f"models/{run}/model.pt" for run in (
    "d17_resnet50_seed44", "d22_convnext_tiny_lr1e-04", "d22_efficientnet_b0"))


class Settings(BaseSettings):
    app_name: str = "Sproutly"
    app_env: str = "development"
    debug: bool = True

    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Authenticator-app MFA (TOTP, RFC 6238). The key encrypts each user's secret
    # at rest; a Fernet key from cryptography.fernet.Fernet.generate_key().
    totp_encryption_key: str
    totp_issuer: str = "Sproutly"
    # Lifetime of the token that links the password step to the code step.
    mfa_token_expire_minutes: int = 5
    mfa_setup_token_expire_minutes: int = 10

    # Continue with Google (OAuth 2.0). A blank client ID switches it off.
    # Callback addresses are built from the address the phone used to reach the backend, so a
    # new Wi-Fi network needs no change here; set public_base_url only to force one address
    # (e.g. a fixed https tunnel). Either way it must be registered with Google.
    public_base_url: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    # Where the backend may send the one-time login code: the app's own links only
    # (exp:// is Expo Go during development, sproutly:// the installed app).
    oauth_app_redirect_prefixes: list[str] = ["exp://", "sproutly://"]
    oauth_flow_expire_minutes: int = 10

    database_url: str

    # Browser origins allowed to call the API (the admin web app). The mobile app
    # is not a browser client and is unaffected.
    cors_origins: list[str] = ["http://localhost:5173"]

    # Diagnosis
    upload_dir: str = "uploads"
    # Trained image models (not in Git): the ensemble that won D2 in notebook 18, deployed in
    # notebook 18b. Several model.pt paths separated by commas run as an ensemble: their
    # probabilities are averaged. One path runs a single model.
    ml_model_path: str = DEFAULT_MODEL_PATH
    # Temperature scaling (D6): the combined scores are divided by this before softmax, so the
    # confidence matches how often it is right on unseen field photos. Fitted in notebook 18b
    # (ml/results/ensemble_deployment); 1.0 switches calibration off.
    temperature: float = 2.4381
    # Below this calibrated confidence the farmer is referred instead of getting a diagnosis.
    # The pre-set rule (D7) gave 0.5 for the ensemble; 0.8 was chosen afterwards as a policy,
    # judging a wrong diagnosis worse than about 12 referrals (threshold table, notebook 18b
    # results). The classifier never uses a value below 0.5 (see app/core/classifier.py).
    confidence_threshold: float = 0.8
    # Leaf check (D15, notebook 19): photos that are not leaves get no diagnosis. Copy
    # ml/results/leaf_check/leaf_check.json here; blank switches the check off.
    leaf_check_path: str = "models/leaf_check.json"

    # Admin portal and staff accounts.
    # Where the portal runs: one-time links for new officers and password resets point here.
    admin_portal_url: str = "http://localhost:5173"
    # How long an invite or reset link works.
    staff_link_expire_hours: int = 48
    # Staff sign-ins last a working day at most; the portal also signs out after 30 idle minutes.
    staff_session_minutes: int = 480
    # Wrong passwords or codes in a row before the account is locked, and for how long.
    lockout_attempts: int = 5
    lockout_minutes: int = 15
    # Days an officer has to answer a referral before the farmer is shown the county contacts.
    referral_days: int = 7
    # Farmers' photos are deleted this many days after the check (app/core/retention.py); the
    # result, confidence and any officer's reply stay. Must be longer than referral_days, so an
    # officer never loses the photo of a case they can still answer.
    photo_days: int = 30

    @model_validator(mode="after")
    def photos_outlive_referrals(self):
        if self.photo_days <= self.referral_days:
            raise ValueError("PHOTO_DAYS must be longer than REFERRAL_DAYS")
        return self

    @field_validator("temperature")
    @classmethod
    def temperature_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("TEMPERATURE must be above 0 (1.0 means no calibration)")
        return v

    @field_validator("upload_dir")
    @classmethod
    def upload_dir_not_blank(cls, v: str) -> str:
        # A blank value in .env would otherwise override the default and break saving.
        return v.strip() or "uploads"

    @field_validator("ml_model_path")
    @classmethod
    def ml_model_path_not_blank(cls, v: str) -> str:
        return v.strip() or DEFAULT_MODEL_PATH

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
