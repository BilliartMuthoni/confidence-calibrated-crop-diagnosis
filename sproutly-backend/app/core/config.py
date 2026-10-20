from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # Trained image model (not in Git): ResNet-50, chosen in the architecture comparison (#41),
    # exported by ml/notebooks/09_architecture_comparison.ipynb.
    ml_model_path: str = "models/compare_resnet50/model.pt"
    # Temperature scaling (D6): the model's scores are divided by this before softmax, so its
    # confidence matches how often it is right on unseen field photos. Fitted in notebook 13
    # (ml/results/calibration); 1.0 switches calibration off.
    temperature: float = 3.04
    # Below this calibrated confidence the farmer is referred instead of getting a diagnosis.
    # Chosen in notebook 13b (D7, ml/results/calibration_followup); the classifier never uses a
    # value below 0.5 (see app/core/classifier.py).
    confidence_threshold: float = 0.877

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
        return v.strip() or "models/compare_resnet50/model.pt"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
