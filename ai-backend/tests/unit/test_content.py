from pathlib import Path

from nasj_ai.assistant.eval_set import load_questions
from nasj_ai.assistant.knowledge import load_articles
from nasj_ai.assistant.profiles import load_profiles

ROOT = Path(__file__).parents[2]
ARTICLE = """---
id: {id}
status: live
routes: [/buyer]
last_verified: 2026-10-29
source: test fixture
---
# A title

{body}
"""
BODY = "This sentence explains one platform task in enough plain words for the checker. " * 3


def write(root: Path, relative: str, text: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_repository_content_is_valid() -> None:
    articles, article_problems = load_articles(ROOT / "knowledge")
    questions, question_problems = load_questions(ROOT / "evaluation" / "assistant")
    assert article_problems == []
    assert question_problems == []
    assert articles and questions


def test_every_profile_folder_exists() -> None:
    for profile in load_profiles().values():
        for folder in profile.config.knowledge:
            assert (ROOT / "knowledge" / folder).is_dir(), folder


def test_valid_article_is_loaded_with_its_folder(tmp_path: Path) -> None:
    write(tmp_path, "buyer/buyer-create-rfq.md", ARTICLE.format(id="buyer-create-rfq", body=BODY))
    articles, problems = load_articles(tmp_path)
    assert problems == []
    assert articles[0].folder == "buyer"
    assert articles[0].title == "A title"


def test_article_mistakes_are_reported(tmp_path: Path) -> None:
    write(tmp_path, "buyer/wrong-name.md", ARTICLE.format(id="other-id", body=BODY))
    write(tmp_path, "secret/admin-notes.md", ARTICLE.format(id="admin-notes", body=BODY))
    write(tmp_path, "admin/too-short.md", ARTICLE.format(id="too-short", body="Short."))
    write(tmp_path, "shared/no-frontmatter.md", "# Title\n\n" + BODY)
    articles, problems = load_articles(tmp_path)
    assert articles == []
    assert len(problems) == 4


def test_duplicate_article_ids_are_reported(tmp_path: Path) -> None:
    text = ARTICLE.format(id="same-id", body=BODY)
    write(tmp_path, "buyer/same-id.md", text)
    write(tmp_path, "admin/same-id.md", text)
    articles, problems = load_articles(tmp_path)
    assert len(articles) == 1
    assert "already used" in problems[0]


def test_question_mistakes_are_reported(tmp_path: Path) -> None:
    write(
        tmp_path,
        "buyer.yaml",
        """
- id: ok-question
  role: BUYER_REPRESENTATIVE
  locale: fr
  kind: app
  question: Bonjour ?
  must_include: [greets the user]
- id: no-points
  role: BUYER_REPRESENTATIVE
  locale: fr
  kind: app
  question: Bonjour ?
- id: bad-role
  role: ARTISAN
  locale: fr
  kind: app
  question: Bonjour ?
  must_avoid: [anything]
""",
    )
    questions, problems = load_questions(tmp_path)
    assert [question.id for question in questions] == ["ok-question"]
    assert len(problems) == 2
