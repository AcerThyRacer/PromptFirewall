"""PII Detection Engine for The Prompt Firewall.

Detects and redacts personally identifiable information from prompts
before they leave the user's machine.

Supports built-in patterns + user-defined custom regex patterns.
"""
from __future__ import annotations
import re
from models import PIIType, PIIMatch, PIIRule, RuleAction


# Compiled regex patterns for each PII type
PII_PATTERNS: dict[PIIType, re.Pattern] = {
    PIIType.EMAIL: re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    ),
    PIIType.PHONE: re.compile(
        r'(?<!\d)(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]?\d{4}(?!\d)'
    ),
    PIIType.SSN: re.compile(
        r'\b\d{3}-\d{2}-\d{4}\b'
    ),
    PIIType.CREDIT_CARD: re.compile(
        r'\b(?:\d{4}[-\s]?){3}\d{4}\b'
    ),
    PIIType.IP_ADDRESS: re.compile(
        r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    ),
}

REDACTION_LABELS: dict[PIIType, str] = {
    PIIType.EMAIL: "[EMAIL_REDACTED]",
    PIIType.PHONE: "[PHONE_REDACTED]",
    PIIType.SSN: "[SSN_REDACTED]",
    PIIType.CREDIT_CARD: "[CC_REDACTED]",
    PIIType.IP_ADDRESS: "[IP_REDACTED]",
}

# ─── Custom PII Patterns ──────────────────────────────────────
# User-defined patterns: list of {name, pattern, redaction_label}
_custom_patterns: list[dict] = []


def add_custom_pattern(name: str, pattern: str, label: str = None) -> bool:
    """Register a custom PII regex pattern.

    Args:
        name:    Unique identifier for the pattern (e.g., 'passport_number')
        pattern: Regex string to match
        label:   Redaction label (defaults to '[{NAME}_REDACTED]')

    Returns:
        True if added, False if regex is invalid.
    """
    try:
        compiled = re.compile(pattern)
    except re.error:
        return False

    if label is None:
        label = f"[{name.upper()}_REDACTED]"

    _custom_patterns.append({
        "name": name,
        "pattern": compiled,
        "label": label,
    })
    return True


def remove_custom_pattern(name: str) -> bool:
    """Remove a custom pattern by name."""
    global _custom_patterns
    before = len(_custom_patterns)
    _custom_patterns = [p for p in _custom_patterns if p["name"] != name]
    return len(_custom_patterns) < before


def get_custom_patterns() -> list[dict]:
    """Return currently registered custom patterns (serializable)."""
    return [
        {"name": p["name"], "pattern": p["pattern"].pattern, "label": p["label"]}
        for p in _custom_patterns
    ]


def detect_pii(text: str, rules: list[PIIRule]) -> list[PIIMatch]:
    """Scan text for PII based on active rules + custom patterns."""
    matches: list[PIIMatch] = []
    enabled_types = {r.pii_type for r in rules if r.enabled}

    # Built-in patterns
    for pii_type, pattern in PII_PATTERNS.items():
        if pii_type not in enabled_types:
            continue
        for m in pattern.finditer(text):
            matches.append(PIIMatch(
                pii_type=pii_type,
                value=m.group(),
                redacted=REDACTION_LABELS[pii_type],
                position=(m.start(), m.end()),
            ))

    # Custom patterns (always active if registered)
    for custom in _custom_patterns:
        for m in custom["pattern"].finditer(text):
            matches.append(PIIMatch(
                pii_type=PIIType.EMAIL,  # Use EMAIL as generic for custom
                value=m.group(),
                redacted=custom["label"],
                position=(m.start(), m.end()),
            ))

    return matches


def redact_pii(text: str, matches: list[PIIMatch]) -> str:
    """Replace all detected PII in text with redaction labels.
    Processes matches in reverse order to preserve positions.
    """
    sorted_matches = sorted(matches, key=lambda m: m.position[0], reverse=True)
    result = text
    for match in sorted_matches:
        start, end = match.position
        result = result[:start] + match.redacted + result[end:]
    return result


def should_block(matches: list[PIIMatch], rules: list[PIIRule]) -> bool:
    """Check if any match triggers a BLOCK action."""
    rule_map = {r.pii_type: r for r in rules}
    for match in matches:
        rule = rule_map.get(match.pii_type)
        if rule and rule.action == RuleAction.BLOCK:
            return True
    return False
