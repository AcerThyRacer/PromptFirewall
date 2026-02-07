"""Prompt Injection Detection Engine for The Prompt Firewall.

Scores incoming prompts for potential jailbreak / injection attempts
using pattern matching and heuristic analysis.
"""
from __future__ import annotations
import re
from models import InjectionMatch, InjectionRule, ThreatLevel, RuleAction

# Each pattern has: (compiled regex, base score, severity label)
INJECTION_PATTERNS: list[tuple[re.Pattern, float, str, ThreatLevel]] = [
    # Direct instruction override
    (re.compile(r'ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?|directives?)',
                re.IGNORECASE),
     0.9, "Direct instruction override", ThreatLevel.CRITICAL),

    # System prompt extraction
    (re.compile(r'(show|reveal|display|print|output|repeat|tell\s+me)\s+(your\s+)?(system\s+prompt|initial\s+prompt|instructions?|hidden\s+prompt)',
                re.IGNORECASE),
     0.85, "System prompt extraction", ThreatLevel.HIGH),

    # Role manipulation
    (re.compile(r'you\s+are\s+now\s+(a|an|the)\s+', re.IGNORECASE),
     0.6, "Role manipulation attempt", ThreatLevel.MEDIUM),

    # DAN-style jailbreak
    (re.compile(r'(DAN|Do\s+Anything\s+Now|JAILBREAK|jailbroken?\s+mode)', re.IGNORECASE),
     0.95, "DAN/Jailbreak keyword", ThreatLevel.CRITICAL),

    # Prompt leaking via formatting
    (re.compile(r'(```|---)\s*(system|assistant|user)\s*(```|---)', re.IGNORECASE),
     0.7, "Prompt format manipulation", ThreatLevel.HIGH),

    # Encoding tricks
    (re.compile(r'(base64|rot13|hex|encode|decode|eval)\s*(:|this|the|following)', re.IGNORECASE),
     0.65, "Encoding-based evasion", ThreatLevel.MEDIUM),

    # Boundary injection
    (re.compile(r'<\|?(system|endoftext|im_start|im_end)\|?>', re.IGNORECASE),
     0.9, "Token boundary injection", ThreatLevel.CRITICAL),

    # Instruction smuggling
    (re.compile(r'(pretend|act\s+as\s+if|assume|imagine)\s+(you\s+)?(have\s+no|don.?t\s+have|without)\s+(restrictions?|limitations?|filters?|rules?|guardrails?)',
                re.IGNORECASE),
     0.8, "Restriction bypass attempt", ThreatLevel.HIGH),

    # Multi-turn manipulation
    (re.compile(r'(in\s+the\s+previous|earlier\s+in\s+this|as\s+we\s+discussed)\s+(conversation|chat|message)',
                re.IGNORECASE),
     0.4, "Context manipulation", ThreatLevel.LOW),

    # Markdown/HTML injection
    (re.compile(r'!\[.*?\]\(https?://.*?\)', re.IGNORECASE),
     0.5, "Markdown image injection", ThreatLevel.MEDIUM),

    # Obfuscation via Unicode
    (re.compile(r'[\u200b\u200c\u200d\u2060\ufeff]', re.IGNORECASE),
     0.7, "Unicode obfuscation detected", ThreatLevel.HIGH),
]


def detect_injection(text: str, rule: InjectionRule) -> list[InjectionMatch]:
    """Scan text for injection patterns. Returns all pattern matches."""
    if not rule.enabled:
        return []

    matches: list[InjectionMatch] = []
    for pattern, score, description, severity in INJECTION_PATTERNS:
        if pattern.search(text):
            matches.append(InjectionMatch(
                pattern=description,
                score=score,
                severity=severity,
            ))
    return matches


def compute_threat_score(matches: list[InjectionMatch]) -> float:
    """Compute aggregate threat score from all matches. Range: 0.0 - 1.0"""
    if not matches:
        return 0.0
    # Use the max score, boosted slightly by number of distinct patterns
    max_score = max(m.score for m in matches)
    diversity_bonus = min(0.1, len(matches) * 0.02)
    return min(1.0, max_score + diversity_bonus)


def get_threat_level(score: float) -> ThreatLevel:
    """Map a numeric score to a ThreatLevel enum."""
    if score >= 0.8:
        return ThreatLevel.CRITICAL
    elif score >= 0.6:
        return ThreatLevel.HIGH
    elif score >= 0.4:
        return ThreatLevel.MEDIUM
    elif score > 0.0:
        return ThreatLevel.LOW
    return ThreatLevel.NONE


def should_block_injection(matches: list[InjectionMatch], rule: InjectionRule) -> bool:
    """Determine if the prompt should be blocked based on rule settings."""
    if not rule.enabled or rule.action != RuleAction.BLOCK:
        return False
    score = compute_threat_score(matches)
    return score >= rule.threshold
