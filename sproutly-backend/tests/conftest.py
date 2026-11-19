"""Test settings: the three required values get harmless placeholders, so the tests never need a
real environment file or a database."""

import os

os.environ.setdefault("SECRET_KEY", "test-only-secret")
os.environ.setdefault("TOTP_ENCRYPTION_KEY", "test-only-totp-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test-only.db")
