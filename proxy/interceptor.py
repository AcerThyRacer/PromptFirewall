"""Request/Response Interceptor Pipeline for The Prompt Firewall.

Processes every request through the security pipeline:
1. PII Detection & Redaction
2. Prompt Injection Analysis
3. Budget Check (with tiktoken-accurate token counting)
"""
from __future__ import annotations
import json
from models import (
    TrafficEntry, ThreatLevel, SecurityRules
)
from detectors.pii import detect_pii, redact_pii, should_block as pii_should_block
from detectors.injection import (
    detect_injection, compute_threat_score,
    get_threat_level, should_block_injection
)
from budget import BudgetTracker
from tokenizer import count_tokens


class Interceptor:
    def __init__(self, rules: SecurityRules, budget_tracker: BudgetTracker):
        self.rules = rules
        self.budget = budget_tracker

    def update_rules(self, rules: SecurityRules):
        self.rules = rules

    def process_request(self, body: bytes, endpoint: str) -> tuple[bytes, TrafficEntry]:
        """Process an outgoing request through the security pipeline.
        
        Returns:
            tuple: (modified_body, traffic_entry)
            If traffic_entry.blocked is True, the request should not be forwarded.
        """
        entry = TrafficEntry(endpoint=endpoint)

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return body, entry

        # Extract prompt text
        prompt_text = self._extract_prompt(data)
        model = data.get("model", "unknown")
        entry.model = model
        entry.prompt_preview = prompt_text[:150] + ("..." if len(prompt_text) > 150 else "")

        # === Stage 1: PII Detection ===
        pii_matches = detect_pii(prompt_text, self.rules.pii_rules)
        entry.pii_detected = pii_matches

        if pii_matches:
            if pii_should_block(pii_matches, self.rules.pii_rules):
                entry.blocked = True
                entry.block_reason = f"PII detected: {', '.join(m.pii_type.value for m in pii_matches)}"
                entry.threat_level = ThreatLevel.HIGH
                return body, entry

            # Redact PII in the prompt
            redacted_text = redact_pii(prompt_text, pii_matches)
            data = self._replace_prompt(data, redacted_text)
            body = json.dumps(data).encode()

        # === Stage 2: Injection Detection ===
        injection_matches = detect_injection(prompt_text, self.rules.injection_rule)
        entry.injection_detected = injection_matches

        if injection_matches:
            score = compute_threat_score(injection_matches)
            entry.threat_level = get_threat_level(score)

            if should_block_injection(injection_matches, self.rules.injection_rule):
                entry.blocked = True
                entry.block_reason = f"Injection detected (score: {score:.2f}): {injection_matches[0].pattern}"
                return body, entry

        # === Stage 3: Budget Check ===
        estimated_tokens = count_tokens(prompt_text, model)
        exceeds, reason = self.budget.should_block(
            self.rules.budget_rule, model, estimated_tokens
        )
        if exceeds:
            entry.blocked = True
            entry.block_reason = reason
            entry.threat_level = ThreatLevel.MEDIUM
            return body, entry

        entry.tokens_used = estimated_tokens
        return body, entry

    def process_response(self, body: bytes, entry: TrafficEntry) -> TrafficEntry:
        """Process a response to extract token usage, cost, and scan for leaked PII."""
        try:
            data = json.loads(body)
            usage = data.get("usage", {})
            tokens = usage.get("total_tokens", entry.tokens_used)
            entry.tokens_used = tokens
            entry.cost = self.budget.estimate_cost(entry.model, tokens)
            self.budget.record_usage(entry.model, tokens, entry.cost)

            # === Response PII Scanning ===
            response_text = self._extract_response_text(data)
            if response_text:
                resp_pii = detect_pii(response_text, self.rules.pii_rules)
                if resp_pii:
                    # Append response PII to entry (marked distinctly)
                    for match in resp_pii:
                        match.redacted = f"[RESP]{match.redacted}"
                    entry.pii_detected.extend(resp_pii)
                    if entry.threat_level == ThreatLevel.NONE:
                        entry.threat_level = ThreatLevel.LOW

        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
        return entry

    def _extract_response_text(self, data: dict) -> str:
        """Extract text content from AI API response."""
        # OpenAI chat format
        choices = data.get("choices", [])
        if choices:
            texts = []
            for choice in choices:
                msg = choice.get("message", {})
                content = msg.get("content", "")
                if content:
                    texts.append(content)
            return " ".join(texts)

        # Ollama format
        if "response" in data:
            return data["response"]

        return ""

    def _extract_prompt(self, data: dict) -> str:
        """Extract the user's prompt from various API formats."""
        # OpenAI chat format
        messages = data.get("messages", [])
        if messages:
            user_msgs = [m.get("content", "") for m in messages if m.get("role") == "user"]
            return " ".join(user_msgs)

        # Simple prompt format
        if "prompt" in data:
            return data["prompt"]

        # Ollama format
        if "input" in data:
            return data["input"]

        return json.dumps(data)

    def _replace_prompt(self, data: dict, new_text: str) -> dict:
        """Replace the prompt text in the request body."""
        messages = data.get("messages", [])
        if messages:
            for msg in messages:
                if msg.get("role") == "user":
                    msg["content"] = new_text
            return data

        if "prompt" in data:
            data["prompt"] = new_text
        elif "input" in data:
            data["input"] = new_text

        return data
