"""Pydantic data models for The Prompt Firewall."""
from __future__ import annotations
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from typing import Optional
import uuid


class ThreatLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RuleAction(str, Enum):
    BLOCK = "block"
    REDACT = "redact"
    WARN = "warn"
    LOG = "log"


class PIIType(str, Enum):
    EMAIL = "email"
    PHONE = "phone"
    SSN = "ssn"
    CREDIT_CARD = "credit_card"
    IP_ADDRESS = "ip_address"


class PIIRule(BaseModel):
    pii_type: PIIType
    enabled: bool = True
    action: RuleAction = RuleAction.REDACT


class InjectionRule(BaseModel):
    enabled: bool = True
    threshold: float = Field(default=0.6, ge=0.0, le=1.0)
    action: RuleAction = RuleAction.BLOCK


class BudgetRule(BaseModel):
    enabled: bool = True
    daily_limit: float = Field(default=1.0, ge=0.0)
    weekly_limit: float = Field(default=10.0, ge=0.0)
    monthly_limit: float = Field(default=50.0, ge=0.0)
    action: RuleAction = RuleAction.BLOCK


class SecurityRules(BaseModel):
    pii_rules: list[PIIRule] = Field(default_factory=lambda: [
        PIIRule(pii_type=PIIType.EMAIL),
        PIIRule(pii_type=PIIType.PHONE),
        PIIRule(pii_type=PIIType.SSN),
        PIIRule(pii_type=PIIType.CREDIT_CARD),
        PIIRule(pii_type=PIIType.IP_ADDRESS),
    ])
    injection_rule: InjectionRule = Field(default_factory=InjectionRule)
    budget_rule: BudgetRule = Field(default_factory=BudgetRule)


class PIIMatch(BaseModel):
    pii_type: PIIType
    value: str
    redacted: str
    position: tuple[int, int]


class InjectionMatch(BaseModel):
    pattern: str
    score: float
    severity: ThreatLevel


class TrafficEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    timestamp: datetime = Field(default_factory=datetime.now)
    method: str = "POST"
    endpoint: str = ""
    model: str = "unknown"
    prompt_preview: str = ""
    status: int = 200
    tokens_used: int = 0
    cost: float = 0.0
    threat_level: ThreatLevel = ThreatLevel.NONE
    pii_detected: list[PIIMatch] = Field(default_factory=list)
    injection_detected: list[InjectionMatch] = Field(default_factory=list)
    blocked: bool = False
    block_reason: Optional[str] = None
    latency_ms: float = 0.0


class DashboardStats(BaseModel):
    total_requests: int = 0
    blocked_requests: int = 0
    pii_detections: int = 0
    injection_attempts: int = 0
    total_spend_today: float = 0.0
    total_tokens_today: int = 0
    requests_per_minute: float = 0.0
