from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

NLP_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=NLP_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    flask_port: int = Field(default=5500, alias="FLASK_PORT", ge=1, le=65535)
    neo4j_uri: str = Field(alias="NEO4J_URI", min_length=1)
    neo4j_user: str = Field(alias="NEO4J_USER", min_length=1)
    neo4j_password: str = Field(alias="NEO4J_PASSWORD", min_length=1)
    ner_model_path: Path = Field(alias="NER_MODEL_PATH")
    spacy_model: str = Field(alias="SPACY_MODEL", min_length=1)
    tesseract_cmd: str = Field(alias="TESSERACT_CMD", min_length=1)
    ipfs_api_url: str = Field(alias="IPFS_API_URL", min_length=1)
    conflict_model_path: Path = Field(alias="CONFLICT_MODEL_PATH")
    aes_key: str | None = Field(default=None, alias="AES_KEY")

    @field_validator("ner_model_path", "conflict_model_path", mode="after")
    @classmethod
    def resolve_project_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else (NLP_ROOT / value).resolve()

    @field_validator("tesseract_cmd", mode="after")
    @classmethod
    def trim_tesseract_cmd(cls, value: str) -> str:
        return value.strip()

    @field_validator("aes_key", mode="after")
    @classmethod
    def validate_aes_key(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        if len(normalized) != 64:
            raise ValueError("AES_KEY must be exactly 64 hex characters (256-bit key).")
        if any(character not in "0123456789abcdefABCDEF" for character in normalized):
            raise ValueError("AES_KEY must contain only hexadecimal characters.")
        return normalized


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
