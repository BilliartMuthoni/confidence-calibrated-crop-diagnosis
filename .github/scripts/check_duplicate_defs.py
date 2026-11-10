"""Fail when a module defines the same top-level function or class twice.

Python keeps only the last definition, so every call silently goes to it. Ruff's F811 misses this
when the first definition is already used inside a function body (10 Nov 2026: a second
_check_code in app/routers/auth.py replaced the authenticator check and broke every sign-in).

Usage: python check_duplicate_defs.py <folder or file> [...]
"""

import ast
import sys
from pathlib import Path


def duplicates(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    seen: dict[str, int] = {}
    found = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if node.name in seen:
                found.append(f"{path}:{node.lineno}: {node.name} is already defined on line {seen[node.name]}")
            else:
                seen[node.name] = node.lineno
    return found


def main(folders: list[str]) -> int:
    problems = []
    for folder in folders:
        root = Path(folder)
        for path in [root] if root.is_file() else sorted(root.rglob("*.py")):
            problems += duplicates(path)
    for line in problems:
        print(line)
    print(f"{len(problems)} duplicate definition(s)" if problems else "No duplicate definitions")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or ["."]))
