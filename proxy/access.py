"""Allowlist/Blocklist system for The Prompt Firewall.

Provides endpoint-level and keyword-level filtering:
- Allowlisted endpoints bypass security checks
- Blocklisted endpoints are rejected immediately
- Keyword blocklist catches specific terms in prompts

Rules are persisted to data/access_rules.json.
"""
from __future__ import annotations
import json
import os
import threading
from dataclasses import dataclass, field

RULES_PATH = os.path.join(os.path.dirname(__file__), "data", "access_rules.json")


@dataclass
class AccessRules:
    # Endpoints that bypass all checks (e.g., "/v1/models")
    allowed_endpoints: list[str] = field(default_factory=list)
    # Endpoints always blocked (e.g., specific API paths)
    blocked_endpoints: list[str] = field(default_factory=list)
    # Keywords that trigger immediate block
    blocked_keywords: list[str] = field(default_factory=list)
    # Model names that are allowed (empty = all allowed)
    allowed_models: list[str] = field(default_factory=list)
    # Model names that are blocked
    blocked_models: list[str] = field(default_factory=list)


class AccessManager:
    """Manages allowlist/blocklist rules with file persistence."""

    def __init__(self):
        self._lock = threading.Lock()
        self.rules = self._load()

    def _load(self) -> AccessRules:
        """Load rules from disk."""
        if not os.path.exists(RULES_PATH):
            return AccessRules()
        try:
            with open(RULES_PATH, "r") as f:
                data = json.load(f)
            return AccessRules(**data)
        except Exception:
            return AccessRules()

    def _save(self):
        """Persist rules to disk."""
        os.makedirs(os.path.dirname(RULES_PATH), exist_ok=True)
        with open(RULES_PATH, "w") as f:
            json.dump({
                "allowed_endpoints": self.rules.allowed_endpoints,
                "blocked_endpoints": self.rules.blocked_endpoints,
                "blocked_keywords": self.rules.blocked_keywords,
                "allowed_models": self.rules.allowed_models,
                "blocked_models": self.rules.blocked_models,
            }, f, indent=2)

    def check_endpoint(self, endpoint: str) -> tuple[str, str | None]:
        """Check if an endpoint is allowed, blocked, or needs inspection.

        Returns:
            ("allow", None) — bypass security checks
            ("block", reason) — reject immediately
            ("inspect", None) — proceed with normal pipeline
        """
        with self._lock:
            # Check allowlist first
            for pattern in self.rules.allowed_endpoints:
                if pattern in endpoint:
                    return "allow", None

            # Check blocklist
            for pattern in self.rules.blocked_endpoints:
                if pattern in endpoint:
                    return "block", f"Endpoint matches blocklist pattern: {pattern}"

        return "inspect", None

    def check_model(self, model: str) -> tuple[str, str | None]:
        """Check if a model is allowed or blocked."""
        with self._lock:
            if self.rules.blocked_models:
                for blocked in self.rules.blocked_models:
                    if blocked.lower() in model.lower():
                        return "block", f"Model '{model}' is blocklisted"

            if self.rules.allowed_models:
                for allowed in self.rules.allowed_models:
                    if allowed.lower() in model.lower():
                        return "allow", None
                return "block", f"Model '{model}' is not in the allowlist"

        return "allow", None

    def check_keywords(self, text: str) -> tuple[bool, str | None]:
        """Check if text contains any blocked keywords."""
        lower_text = text.lower()
        with self._lock:
            for keyword in self.rules.blocked_keywords:
                if keyword.lower() in lower_text:
                    return True, f"Blocked keyword detected: '{keyword}'"
        return False, None

    def update_rules(self, data: dict) -> dict:
        """Update access rules."""
        with self._lock:
            if "allowed_endpoints" in data:
                self.rules.allowed_endpoints = data["allowed_endpoints"]
            if "blocked_endpoints" in data:
                self.rules.blocked_endpoints = data["blocked_endpoints"]
            if "blocked_keywords" in data:
                self.rules.blocked_keywords = data["blocked_keywords"]
            if "allowed_models" in data:
                self.rules.allowed_models = data["allowed_models"]
            if "blocked_models" in data:
                self.rules.blocked_models = data["blocked_models"]
            self._save()
        return self.to_dict()

    def to_dict(self) -> dict:
        """Serialize current rules."""
        return {
            "allowed_endpoints": self.rules.allowed_endpoints,
            "blocked_endpoints": self.rules.blocked_endpoints,
            "blocked_keywords": self.rules.blocked_keywords,
            "allowed_models": self.rules.allowed_models,
            "blocked_models": self.rules.blocked_models,
        }
