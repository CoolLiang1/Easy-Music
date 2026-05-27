import argparse
import getpass
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.password import hash_password
from app.db.session import SessionLocal
from app.models.user import User


PASSWORD_ENV_VAR = "EASY_MUSIC_INITIAL_PASSWORD"


def create_initial_user(db: Session, username: str, password: str) -> User:
    if db.scalar(select(User.id).limit(1)) is not None:
        raise RuntimeError("A user already exists; initial user creation is single-use.")

    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def read_password(args: argparse.Namespace) -> str:
    if args.password_env:
        password = os.environ.get(args.password_env)
        if not password:
            raise RuntimeError(f"{args.password_env} is not set.")
        return password

    password = getpass.getpass("Initial user password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise RuntimeError("Passwords do not match.")
    return password


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the initial Easy Music user.")
    parser.add_argument("--username", required=True)
    parser.add_argument(
        "--password-env",
        default=PASSWORD_ENV_VAR,
        help=f"Environment variable containing the password. Defaults to {PASSWORD_ENV_VAR}.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    password = read_password(args)
    if len(password) < 12:
        raise RuntimeError("Initial user password must be at least 12 characters.")

    with SessionLocal() as db:
        user = create_initial_user(db, args.username, password)

    print(f"Created initial user '{user.username}' with id {user.id}.")


if __name__ == "__main__":
    main()
