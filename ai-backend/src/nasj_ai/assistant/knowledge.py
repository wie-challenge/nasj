"""Knowledge articles: Markdown files with YAML frontmatter, one folder per audience.

The folder decides who may see an article; profiles list the folders they can use.
"""

from datetime import date
from pathlib import Path
from typing import Literal

import yaml
from pydantic import Field, ValidationError

from nasj_ai.schemas.common import StrictModel

FOLDERS = ("shared", "general", "buyer", "association", "admin")


class Frontmatter(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)
    status: Literal["live", "simulated", "planned"]
    routes: list[str] = Field(default_factory=list, max_length=10)
    last_verified: date
    source: str = Field(min_length=3, max_length=300)


class Article(StrictModel):
    folder: str
    frontmatter: Frontmatter
    title: str
    body: str


class ArticleError(ValueError):
    pass


def parse_article(path: Path, folder: str) -> Article:
    text = path.read_text(encoding="utf-8")
    head, separator, body = text.removeprefix("---\n").partition("\n---\n")
    if not text.startswith("---\n") or not separator:
        raise ArticleError("must start with a --- frontmatter block closed by ---")
    try:
        frontmatter = Frontmatter.model_validate(yaml.safe_load(head))
    except (yaml.YAMLError, ValidationError) as error:
        raise ArticleError(f"invalid frontmatter: {error}") from error
    if frontmatter.id != path.stem:
        raise ArticleError(f"id '{frontmatter.id}' must match the file name '{path.stem}'")
    for route in frontmatter.routes:
        if not route.startswith("/"):
            raise ArticleError(f"route '{route}' must start with /")
    body = body.strip()
    if not body.startswith("# "):
        raise ArticleError("body must start with a '# Title' heading")
    title = body.splitlines()[0].removeprefix("# ").strip()
    words = len(body.split())
    if not 30 <= words <= 800:
        raise ArticleError(f"body has {words} words; keep articles between 30 and 800")
    return Article(folder=folder, frontmatter=frontmatter, title=title, body=body)


def load_articles(root: Path) -> tuple[list[Article], list[str]]:
    """Return valid articles and readable problems ("path: message") for the rest."""
    articles: list[Article] = []
    problems: list[str] = []
    seen: dict[str, Path] = {}
    for path in sorted(root.rglob("*.md")):
        relative = path.relative_to(root)
        if relative.name == "README.md":
            continue
        folder = relative.parts[0]
        if len(relative.parts) != 2 or folder not in FOLDERS:
            problems.append(f"{relative}: put articles directly in one of {', '.join(FOLDERS)}")
            continue
        try:
            article = parse_article(path, folder)
        except ArticleError as error:
            problems.append(f"{relative}: {error}")
            continue
        if article.frontmatter.id in seen:
            problems.append(f"{relative}: id already used by {seen[article.frontmatter.id]}")
            continue
        seen[article.frontmatter.id] = relative
        articles.append(article)
    return articles, problems
