"""Create an administrator account. The only way an admin account comes into existence:
there is no sign-up for staff and the portal cannot make admins, so a stolen admin session
cannot create more admins.

Run inside sproutly-backend (it uses the database in .env):

    python -m app.scripts.create_admin --email you@example.org --name "Your Name"

The password is typed at a hidden prompt (never on the command line, where it would stay in
the shell history). The authenticator app is set up at the first sign-in to the portal.
"""

import argparse
import getpass
import sys

from app.core import audit
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import advice, audit as audit_model, contact, diagnosis, oauth_flow, referral, staff_auth  # noqa: F401
from app.models.user import User, UserRole
from app.schemas.auth import STAFF_PASSWORD_MIN


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Sproutly administrator account.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    email = args.email.strip().lower()

    password = getpass.getpass(f"Password for {email} ({STAFF_PASSWORD_MIN}+ characters): ")
    if len(password) < STAFF_PASSWORD_MIN:
        print(f"Too short: use at least {STAFF_PASSWORD_MIN} characters.")
        return 1
    if getpass.getpass("Type it again: ") != password:
        print("The two passwords are different.")
        return 1

    db = SessionLocal()
    try:
        if db.query(User).filter(User.user_email == email).first():
            print(f"An account with {email} already exists. Nothing changed.")
            return 1
        admin = User(user_email=email, full_name=args.name.strip(), role=UserRole.admin,
                     hashed_password=hash_password(password), is_verified=True)
        db.add(admin)
        db.flush()
        audit.record(db, None, "user_create", email, "Administrator, created with the server command",
                     actor_label="(server command)")
        db.commit()
    finally:
        db.close()
    print(f"Administrator {email} created. Sign in to the portal to set up the authenticator app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
