"""Accurate token counting via tiktoken.

Uses OpenAI's tiktoken for precise token estimation per model.
Falls back to word-count heuristic for unknown models.
"""
from __future__ import annotations
import tiktoken

# Map model names to their tiktoken encoding
_MODEL_ENCODINGS: dict[str, str] = {
    "gpt-4o": "o200k_base",
    "gpt-4o-mini": "o200k_base",
    "gpt-4-turbo": "cl100k_base",
    "gpt-4": "cl100k_base",
    "gpt-3.5-turbo": "cl100k_base",
    # Claude, Gemini, etc. don't have tiktoken encodings —
    # use cl100k_base as a reasonable approximation
}

# Cache loaded encodings
_cache: dict[str, tiktoken.Encoding] = {}


def _get_encoding(model: str) -> tiktoken.Encoding:
    """Get or create the tiktoken encoding for a model."""
    enc_name = _MODEL_ENCODINGS.get(model, "cl100k_base")
    if enc_name not in _cache:
        _cache[enc_name] = tiktoken.get_encoding(enc_name)
    return _cache[enc_name]


def count_tokens(text: str, model: str = "gpt-4o") -> int:
    """Count the exact number of tokens in text for a given model.

    Uses tiktoken for accurate counting. Falls back to
    word-count × 1.3 if tiktoken fails for any reason.
    """
    try:
        enc = _get_encoding(model)
        return len(enc.encode(text))
    except Exception:
        # Fallback: rough estimate (more accurate than words × 2)
        return int(len(text.split()) * 1.3)


def count_messages_tokens(messages: list[dict], model: str = "gpt-4o") -> int:
    """Count tokens for a list of chat messages (OpenAI format).

    Accounts for the per-message overhead tokens used by the API.
    """
    # Per OpenAI docs: every message has ~4 overhead tokens
    TOKENS_PER_MESSAGE = 4
    TOKENS_REPLY_OVERHEAD = 3  # every reply is primed with <|im_start|>assistant

    total = TOKENS_REPLY_OVERHEAD
    for msg in messages:
        total += TOKENS_PER_MESSAGE
        for key, value in msg.items():
            if isinstance(value, str):
                total += count_tokens(value, model)
            elif key == "name":
                total += -1  # name token offset
    return total
