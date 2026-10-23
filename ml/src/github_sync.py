"""Commit and push the repository clone on Drive from a Colab session.

main is protected, so changes are committed to a new branch and pushed there,
and the returned link opens a pull request. The Drive copy is then switched
back to main so the next session's pull keeps working. The token is passed
only on the push command line and never written to the Git config.
"""

import re
import subprocess
from pathlib import Path


def _git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def status(repo: Path) -> str:
    return _git(repo, "status", "--short", "--branch")


def push(repo: Path, branch: str, message: str, token: str, name: str, email: str,
         paths: list[str] | None = None) -> str:
    """Commit everything, or only `paths` (relative to the repo) when given, to a new branch."""
    if not _git(repo, "status", "--porcelain", "--", *(paths or [])):
        return "Nothing to commit."

    _git(repo, "switch", "-c", branch)
    committed = pushed = False
    try:
        _git(repo, "add", "-A", "--", *(paths or ["."]))
        _git(repo, "-c", f"user.name={name}", "-c", f"user.email={email}", "commit", "-m", message)
        committed = True

        origin = _git(repo, "remote", "get-url", "origin")
        authed = origin.replace("https://", f"https://x-access-token:{token}@", 1)
        try:
            _git(repo, "push", authed, f"{branch}:{branch}")
        except RuntimeError as err:
            raise RuntimeError(str(err).replace(token, "***")) from None
        pushed = True
        commit = _git(repo, "log", "-1", "--oneline")
    finally:
        if committed:
            # Colab autosaves the running notebook after the commit; that copy only
            # differs in this cell's output, so it is safe to drop.
            _git(repo, "switch", "--discard-changes", "main")
            if pushed:
                # The branch is on GitHub now; forgetting the local copy lets a later
                # run push again without "a branch named ... already exists".
                _git(repo, "branch", "-D", branch)
        else:
            # Nothing was committed, so carry the changes back to main rather than lose them.
            _git(repo, "switch", "main")

    slug = re.sub(r"^https://github\.com/|\.git$", "", origin)
    return (
        f"Pushed {commit} to branch {branch}.\n"
        f"Open the pull request: https://github.com/{slug}/compare/main...{branch}?expand=1"
    )
