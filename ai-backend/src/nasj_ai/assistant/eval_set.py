"""Evaluation questions: one YAML file per role owner in evaluation/assistant/."""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import Field, ValidationError

from nasj_ai.assistant.schemas import Role
from nasj_ai.schemas.common import StrictModel

Kind = Literal["app", "general", "planned", "missing", "injection", "cross_role", "tool"]


class EvalQuestion(StrictModel):
    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=80)
    role: Role
    locale: Literal["ar", "fr", "en"]
    kind: Kind
    question: str = Field(min_length=2, max_length=2000)
    must_include: list[str] = Field(default_factory=list, max_length=10)
    must_avoid: list[str] = Field(default_factory=list, max_length=10)
    notes: str = ""


def load_questions(root: Path) -> tuple[list[EvalQuestion], list[str]]:
    """Return valid questions and readable problems ("file: message") for the rest."""
    questions: list[EvalQuestion] = []
    problems: list[str] = []
    seen: set[str] = set()
    for path in sorted(root.glob("*.yaml")):
        try:
            items = yaml.safe_load(path.read_text(encoding="utf-8")) or []
        except yaml.YAMLError as error:
            problems.append(f"{path.name}: invalid YAML: {error}")
            continue
        if not isinstance(items, list):
            problems.append(f"{path.name}: must be a list of questions")
            continue
        for index, item in enumerate(items, start=1):
            try:
                question = EvalQuestion.model_validate(item)
            except ValidationError as error:
                problems.append(f"{path.name} #{index}: {error}")
                continue
            if question.id in seen:
                problems.append(f"{path.name} #{index}: duplicate id '{question.id}'")
                continue
            if not question.must_include and not question.must_avoid:
                problems.append(f"{path.name} #{index}: add must_include or must_avoid")
                continue
            seen.add(question.id)
            questions.append(question)
    return questions, problems
