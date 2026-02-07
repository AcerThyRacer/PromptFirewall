"""Multi-provider AI API detection for The Prompt Firewall.

Automatically detects which AI provider a request targets based on
URL patterns and request structure. This enables provider-specific
request/response parsing and accurate model identification.
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from urllib.parse import urlparse


class Provider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OLLAMA = "ollama"
    AZURE_OPENAI = "azure_openai"
    MISTRAL = "mistral"
    COHERE = "cohere"
    DEEPSEEK = "deepseek"
    UNKNOWN = "unknown"


@dataclass
class ProviderInfo:
    provider: Provider
    model: str
    base_url: str
    is_chat: bool = True
    is_streaming: bool = False


# URL → Provider mapping
_URL_PATTERNS: list[tuple[str, Provider]] = [
    ("api.openai.com", Provider.OPENAI),
    ("api.anthropic.com", Provider.ANTHROPIC),
    ("generativelanguage.googleapis.com", Provider.GOOGLE),
    ("aiplatform.googleapis.com", Provider.GOOGLE),
    ("openrouter.ai", Provider.OPENAI),  # OpenRouter uses OpenAI format
    ("api.mistral.ai", Provider.MISTRAL),
    ("api.cohere.ai", Provider.COHERE),
    ("api.deepseek.com", Provider.DEEPSEEK),
    ("localhost:11434", Provider.OLLAMA),
    ("127.0.0.1:11434", Provider.OLLAMA),
]


def detect_provider(target_url: str, body: dict | None = None) -> ProviderInfo:
    """Detect the AI provider from the target URL and request body.

    Args:
        target_url: The upstream API URL being proxied to
        body: Parsed request body (optional, for model extraction)

    Returns:
        ProviderInfo with detected provider, model, and metadata
    """
    parsed = urlparse(target_url)
    host = parsed.netloc.lower()

    # Azure OpenAI uses custom subdomains
    if ".openai.azure.com" in host:
        model = _extract_model(body, Provider.AZURE_OPENAI)
        return ProviderInfo(
            provider=Provider.AZURE_OPENAI,
            model=model,
            base_url=f"{parsed.scheme}://{parsed.netloc}",
            is_chat="/chat/" in parsed.path,
            is_streaming=body.get("stream", False) if body else False,
        )

    # Match known providers
    for pattern, provider in _URL_PATTERNS:
        if pattern in host:
            model = _extract_model(body, provider)
            return ProviderInfo(
                provider=provider,
                model=model,
                base_url=f"{parsed.scheme}://{parsed.netloc}",
                is_chat=_is_chat_endpoint(parsed.path, provider),
                is_streaming=body.get("stream", False) if body else False,
            )

    # Unknown provider
    return ProviderInfo(
        provider=Provider.UNKNOWN,
        model=_extract_model(body, Provider.UNKNOWN),
        base_url=target_url,
    )


def _extract_model(body: dict | None, provider: Provider) -> str:
    """Extract the model name from the request body."""
    if not body:
        return "unknown"

    # Most providers use "model" field
    model = body.get("model", "")
    if model:
        return model

    # Anthropic sometimes uses different fields
    if provider == Provider.ANTHROPIC:
        return body.get("model", "claude-3-sonnet")

    # Google uses the URL path for model
    return "unknown"


def _is_chat_endpoint(path: str, provider: Provider) -> bool:
    """Determine if the endpoint is a chat completion endpoint."""
    chat_patterns = [
        "/chat/completions",
        "/v1/messages",       # Anthropic
        "/generateContent",   # Google
        "/api/chat",          # Ollama
    ]
    return any(p in path for p in chat_patterns)


def get_provider_display_name(provider: Provider) -> str:
    """Get a human-readable display name for a provider."""
    names = {
        Provider.OPENAI: "OpenAI",
        Provider.ANTHROPIC: "Anthropic",
        Provider.GOOGLE: "Google AI",
        Provider.OLLAMA: "Ollama (Local)",
        Provider.AZURE_OPENAI: "Azure OpenAI",
        Provider.MISTRAL: "Mistral AI",
        Provider.COHERE: "Cohere",
        Provider.DEEPSEEK: "DeepSeek",
        Provider.UNKNOWN: "Unknown",
    }
    return names.get(provider, "Unknown")
