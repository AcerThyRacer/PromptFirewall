"""Budget tracking for The Prompt Firewall (v3.0).

Uses SQLite for persistent, indexed storage.
Supports daily/weekly/monthly spend queries with efficient indexed lookups.
"""
from __future__ import annotations
import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta
from models import BudgetRule, RuleAction

# Approximate pricing per 1K tokens (input/output averaged)
MODEL_PRICING: dict[str, float] = {
    "gpt-4o": 0.005,
    "gpt-4o-mini": 0.00015,
    "gpt-4-turbo": 0.01,
    "gpt-4": 0.03,
    "gpt-3.5-turbo": 0.0005,
    "claude-3-opus": 0.015,
    "claude-3-sonnet": 0.003,
    "claude-3-haiku": 0.00025,
    "claude-3.5-sonnet": 0.003,
    "claude-3.5-haiku": 0.001,
    "gemini-1.5-pro": 0.00125,
    "gemini-1.5-flash": 0.000075,
    "gemini-2.0-flash": 0.0001,
    "llama3": 0.0,
    "mistral": 0.0,
    "codellama": 0.0,
    "deepseek-r1": 0.0,
    "default": 0.002,
}

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "budget.db")
LEGACY_JSON = os.path.join(os.path.dirname(__file__), "data", "budget.json")


class BudgetTracker:
    def __init__(self):
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self._conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self._create_tables()
        self._migrate_from_json()

    def _create_tables(self):
        """Create the usage table with indexed timestamp."""
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                model TEXT NOT NULL,
                tokens INTEGER NOT NULL,
                cost REAL NOT NULL
            )
        """)
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_usage_timestamp
            ON usage(timestamp)
        """)
        self._conn.commit()

    def _migrate_from_json(self):
        """One-time migration from legacy budget.json to SQLite."""
        if not os.path.exists(LEGACY_JSON):
            return

        try:
            with open(LEGACY_JSON, "r") as f:
                entries = json.load(f)

            if not entries:
                return

            # Check if we already migrated
            cursor = self._conn.execute("SELECT COUNT(*) FROM usage")
            if cursor.fetchone()[0] > 0:
                return

            # Bulk insert
            self._conn.executemany(
                "INSERT INTO usage (timestamp, model, tokens, cost) VALUES (?, ?, ?, ?)",
                [(e["timestamp"], e["model"], e["tokens"], e["cost"]) for e in entries]
            )
            self._conn.commit()

            # Rename legacy file so we don't re-migrate
            os.rename(LEGACY_JSON, LEGACY_JSON + ".migrated")
            print(f"[Budget] Migrated {len(entries)} entries from JSON to SQLite")
        except Exception as e:
            print(f"[Budget] JSON migration skipped: {e}")

    def record_usage(self, model: str, tokens: int, cost: float | None = None):
        """Record a completed request's token usage."""
        if cost is None:
            rate = MODEL_PRICING.get(model, MODEL_PRICING["default"])
            cost = (tokens / 1000) * rate

        with self._lock:
            self._conn.execute(
                "INSERT INTO usage (timestamp, model, tokens, cost) VALUES (?, ?, ?, ?)",
                (datetime.now().isoformat(), model, tokens, cost)
            )
            self._conn.commit()

    def estimate_cost(self, model: str, tokens: int) -> float:
        """Estimate cost for a pending request."""
        rate = MODEL_PRICING.get(model, MODEL_PRICING["default"])
        return (tokens / 1000) * rate

    def get_spend(self, period: str = "daily") -> float:
        """Get total spend for a given period using indexed query."""
        cutoff = self._get_cutoff(period).isoformat()
        with self._lock:
            cursor = self._conn.execute(
                "SELECT COALESCE(SUM(cost), 0) FROM usage WHERE timestamp >= ?",
                (cutoff,)
            )
            return round(cursor.fetchone()[0], 6)

    def get_tokens(self, period: str = "daily") -> int:
        """Get total tokens for a given period."""
        cutoff = self._get_cutoff(period).isoformat()
        with self._lock:
            cursor = self._conn.execute(
                "SELECT COALESCE(SUM(tokens), 0) FROM usage WHERE timestamp >= ?",
                (cutoff,)
            )
            return cursor.fetchone()[0]

    def _get_cutoff(self, period: str) -> datetime:
        """Get the cutoff datetime for a given period."""
        now = datetime.now()
        if period == "daily":
            return now - timedelta(days=1)
        elif period == "weekly":
            return now - timedelta(weeks=1)
        elif period == "monthly":
            return now - timedelta(days=30)
        return now - timedelta(days=1)

    def would_exceed_budget(self, rule: BudgetRule, additional_cost: float) -> tuple[bool, str | None]:
        """Check if adding this cost would exceed any budget cap."""
        if not rule.enabled:
            return False, None

        daily = self.get_spend("daily")
        if daily + additional_cost > rule.daily_limit:
            return True, f"Daily limit ${rule.daily_limit:.2f} would be exceeded (current: ${daily:.2f})"

        weekly = self.get_spend("weekly")
        if weekly + additional_cost > rule.weekly_limit:
            return True, f"Weekly limit ${rule.weekly_limit:.2f} would be exceeded (current: ${weekly:.2f})"

        monthly = self.get_spend("monthly")
        if monthly + additional_cost > rule.monthly_limit:
            return True, f"Monthly limit ${rule.monthly_limit:.2f} would be exceeded (current: ${monthly:.2f})"

        return False, None

    def should_block(self, rule: BudgetRule, model: str, estimated_tokens: int) -> tuple[bool, str | None]:
        """Check if a request should be blocked due to budget rules."""
        if not rule.enabled or rule.action != RuleAction.BLOCK:
            return False, None

        cost = self.estimate_cost(model, estimated_tokens)
        return self.would_exceed_budget(rule, cost)

    def get_stats(self) -> dict:
        """Get budget statistics for dashboard."""
        return {
            "daily_spend": self.get_spend("daily"),
            "weekly_spend": self.get_spend("weekly"),
            "monthly_spend": self.get_spend("monthly"),
            "daily_tokens": self.get_tokens("daily"),
            "weekly_tokens": self.get_tokens("weekly"),
        }

    def close(self):
        """Close the database connection."""
        self._conn.close()
