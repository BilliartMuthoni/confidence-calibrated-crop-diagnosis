from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, false

from app.db.session import Base


class OAuthFlow(Base):
    """One "Continue with Google" attempt, from the button tap until the app has its tokens.

    Times are naive UTC. The row is created when the browser is sent to the provider,
    filled in when the provider sends it back, and marked used when the app swaps the
    one-time login code for its tokens.
    """

    __tablename__ = "oauth_flows"

    # Random value sent to the provider and checked when it comes back (stops forged callbacks).
    state = Column(String, primary_key=True)
    provider = Column(String, nullable=False)
    # The app link the login code goes to, and the PKCE challenge only the app can answer.
    app_redirect_uri = Column(String, nullable=False)
    app_code_challenge = Column(String, nullable=False)
    # PKCE between the backend and the provider.
    provider_code_verifier = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)

    # Set once the provider has confirmed who the user is.
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True)
    login_code_hash = Column(String, unique=True, index=True, nullable=True)
    login_code_expires_at = Column(DateTime, nullable=True)
    # Set when the provider's email belongs to an existing password account: the provider's id
    # for this person, waiting to be joined once they prove the account is theirs (password + code).
    link_subject = Column(String, nullable=True)
    used = Column(Boolean, nullable=False, default=False, server_default=false())
