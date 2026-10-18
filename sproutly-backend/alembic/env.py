from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

#env import
from app.db.session import SQLALCHEMY_DATABASE_URL

# db.session import
from app.db.session import Base

#model import
from app.models.user import User # type: ignore
from app.models.diagnosis import Diagnosis # type: ignore
from app.models.oauth_flow import OAuthFlow # type: ignore
from app.models.referral import Referral # type: ignore
from app.models.contact import SupportContact # type: ignore
from app.models.advice import AdviceEntry, AdviceVersion # type: ignore
from app.models.audit import AuditEntry # type: ignore
from app.models.staff_auth import BackupCode, StaffLink # type: ignore

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    
    if SQLALCHEMY_DATABASE_URL is None:
        raise ValueError("DATABASE_URL is missing from .env!")
    
    url = SQLALCHEMY_DATABASE_URL

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    # Create a configuration dictionary that uses your .env URL
    section = config.get_section(config.config_ini_section)

    if section is None:
        raise ValueError("Alembic section not found in config!")
    
    configuration = dict(section)

# Ensure URL is a string and not None
    if SQLALCHEMY_DATABASE_URL is None:
        raise ValueError("DATABASE_URL is missing from .env!")
        
    configuration["sqlalchemy.url"] = SQLALCHEMY_DATABASE_URL

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
