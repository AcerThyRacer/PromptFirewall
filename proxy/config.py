"""Persistent configuration for The Prompt Firewall."""
from __future__ import annotations
import json
import os
from models import SecurityRules

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "data", "config.json")


class Config:
    def __init__(self):
        self.rules = SecurityRules()
        self._load()

    def _load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    data = json.load(f)
                    self.rules = SecurityRules(**data)
            except (json.JSONDecodeError, IOError, Exception):
                self.rules = SecurityRules()

    def save(self):
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, "w") as f:
            json.dump(self.rules.model_dump(), f, indent=2)

    def update_rules(self, data: dict) -> SecurityRules:
        self.rules = SecurityRules(**data)
        self.save()
        return self.rules

    def to_dict(self) -> dict:
        return self.rules.model_dump()
