"""Check knowledge articles and evaluation questions; exit 1 if anything is invalid.

python scripts/check_content.py
"""

import sys
from collections import Counter
from pathlib import Path

from nasj_ai.assistant.eval_set import load_questions
from nasj_ai.assistant.knowledge import load_articles

root = Path(__file__).resolve().parents[1]
articles, article_problems = load_articles(root / "knowledge")
questions, question_problems = load_questions(root / "evaluation" / "assistant")

by_folder = Counter(f"{article.folder}/{article.frontmatter.status}" for article in articles)
by_role = Counter(question.role for question in questions)
print(f"Articles: {len(articles)}  " + "  ".join(f"{k}={v}" for k, v in sorted(by_folder.items())))
print(f"Questions: {len(questions)}  " + "  ".join(f"{k}={v}" for k, v in sorted(by_role.items())))

problems = article_problems + question_problems
for problem in problems:
    print(f"ERROR {problem}")
sys.exit(1 if problems else 0)
