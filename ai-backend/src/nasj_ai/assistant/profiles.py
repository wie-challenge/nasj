"""Role profiles: which prompt, pipeline, knowledge and tools each user role gets."""

from functools import cache
from importlib.resources import files
from typing import Literal

import yaml
from pydantic import Field

from nasj_ai.assistant.schemas import Role
from nasj_ai.schemas.common import StrictModel

PROFILE_NAMES = ("buyer", "coordinator", "admin")


class ProfileConfig(StrictModel):
    roles: list[Role] = Field(min_length=1)
    version: int = Field(ge=1)
    pipeline: Literal["chat"]
    knowledge: list[str]
    tools: list[str]


class Profile(StrictModel):
    name: str
    config: ProfileConfig
    prompt: str

    @property
    def label(self) -> str:
        return f"{self.name}@{self.config.version}"


def _read(*parts: str) -> str:
    return files("nasj_ai.assistant").joinpath("profiles", *parts).read_text(encoding="utf-8")


@cache
def base_rules() -> str:
    return _read("base", "rules.md")


@cache
def load_profiles() -> dict[Role, Profile]:
    by_role: dict[Role, Profile] = {}
    for name in PROFILE_NAMES:
        config = ProfileConfig.model_validate(yaml.safe_load(_read(name, "profile.yaml")))
        profile = Profile(name=name, config=config, prompt=_read(name, "prompt.md"))
        for role in config.roles:
            if role in by_role:
                raise ValueError(f"Role {role} is assigned to more than one profile")
            by_role[role] = profile
    return by_role


def profile_for(role: Role) -> Profile:
    return load_profiles()[role]
