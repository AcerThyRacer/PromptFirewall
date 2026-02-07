"""Alerting & Webhook system for The Prompt Firewall.

Fires webhook notifications when security events occur:
- High/critical threat detected
- Request blocked
- Budget threshold exceeded
- PII leak in response

Supports multiple webhook URLs with configurable event filters.
"""
from __future__ import annotations
import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

import aiohttp

logger = logging.getLogger("pf.alerts")


class AlertEvent(str, Enum):
    THREAT_HIGH = "threat_high"
    THREAT_CRITICAL = "threat_critical"
    REQUEST_BLOCKED = "request_blocked"
    BUDGET_WARNING = "budget_warning"
    PII_RESPONSE_LEAK = "pii_response_leak"


@dataclass
class WebhookConfig:
    url: str
    events: list[AlertEvent] = field(default_factory=lambda: list(AlertEvent))
    enabled: bool = True
    name: str = "default"
    secret: Optional[str] = None  # Optional HMAC signing key


@dataclass
class AlertPayload:
    event: AlertEvent
    timestamp: str
    summary: str
    details: dict
    severity: str = "high"


class AlertManager:
    """Manages webhook registrations and alert dispatching."""

    def __init__(self):
        self._webhooks: list[WebhookConfig] = []
        self._history: list[dict] = []  # Last 100 alerts
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            )
        return self._session

    def add_webhook(self, url: str, name: str = "default",
                    events: list[str] | None = None,
                    secret: str | None = None) -> WebhookConfig:
        """Register a new webhook endpoint."""
        event_list = [AlertEvent(e) for e in events] if events else list(AlertEvent)
        wh = WebhookConfig(url=url, name=name, events=event_list, secret=secret)
        self._webhooks.append(wh)
        logger.info(f"[Alerts] Webhook registered: {name} → {url}")
        return wh

    def remove_webhook(self, name: str) -> bool:
        """Remove a webhook by name."""
        before = len(self._webhooks)
        self._webhooks = [w for w in self._webhooks if w.name != name]
        return len(self._webhooks) < before

    def list_webhooks(self) -> list[dict]:
        """Return serializable list of webhooks."""
        return [
            {
                "name": w.name,
                "url": w.url,
                "events": [e.value for e in w.events],
                "enabled": w.enabled,
            }
            for w in self._webhooks
        ]

    def get_history(self, limit: int = 50) -> list[dict]:
        """Return recent alert history."""
        return self._history[-limit:]

    async def fire(self, event: AlertEvent, summary: str,
                   details: dict, severity: str = "high"):
        """Fire an alert to all matching webhooks."""
        payload = AlertPayload(
            event=event,
            timestamp=datetime.now().isoformat(),
            summary=summary,
            details=details,
            severity=severity,
        )

        # Record in history
        record = {
            "event": payload.event.value,
            "timestamp": payload.timestamp,
            "summary": payload.summary,
            "severity": payload.severity,
        }
        self._history.append(record)
        if len(self._history) > 100:
            self._history = self._history[-100:]

        # Dispatch to webhooks
        matching = [
            w for w in self._webhooks
            if w.enabled and event in w.events
        ]

        if not matching:
            return

        body = json.dumps({
            "event": payload.event.value,
            "timestamp": payload.timestamp,
            "summary": payload.summary,
            "details": payload.details,
            "severity": payload.severity,
            "source": "prompt-firewall",
        })

        session = await self._get_session()
        tasks = [self._send(session, w, body) for w in matching]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send(self, session: aiohttp.ClientSession,
                    webhook: WebhookConfig, body: str):
        """Send payload to a single webhook."""
        headers = {"Content-Type": "application/json"}
        if webhook.secret:
            import hashlib
            import hmac
            sig = hmac.new(
                webhook.secret.encode(), body.encode(), hashlib.sha256
            ).hexdigest()
            headers["X-PF-Signature"] = sig

        try:
            async with session.post(webhook.url, data=body, headers=headers) as resp:
                if resp.status >= 400:
                    logger.warning(
                        f"[Alerts] Webhook {webhook.name} returned {resp.status}"
                    )
        except Exception as e:
            logger.warning(f"[Alerts] Webhook {webhook.name} failed: {e}")

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
