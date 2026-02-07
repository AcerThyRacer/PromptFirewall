/**
 * Shared TypeScript types for The Prompt Firewall dashboard.
 *
 * Canonical type definitions — import from here instead of
 * redefining interfaces in individual components/pages.
 */

// ─── Enums ────────────────────────────────────────────────────
export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type RuleAction = 'block' | 'redact' | 'warn' | 'log';
export type PIITypeName = 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address';

// ─── PII ──────────────────────────────────────────────────────
export interface PIIMatch {
    pii_type: PIITypeName;
    value: string;
    redacted: string;
    position: [number, number];
}

export interface PIIRule {
    pii_type: PIITypeName;
    enabled: boolean;
    action: RuleAction;
}

// ─── Injection ────────────────────────────────────────────────
export interface InjectionMatch {
    pattern: string;
    score: number;
    severity: ThreatLevel;
}

export interface InjectionRule {
    enabled: boolean;
    threshold: number;
    action: RuleAction;
}

// ─── Budget ───────────────────────────────────────────────────
export interface BudgetRule {
    enabled: boolean;
    daily_limit: number;
    weekly_limit: number;
    monthly_limit: number;
    action: RuleAction;
}

// ─── Rules (aggregate) ───────────────────────────────────────
export interface SecurityRules {
    pii_rules: PIIRule[];
    injection_rule: InjectionRule;
    budget_rule: BudgetRule;
}

// ─── Traffic ──────────────────────────────────────────────────
export interface TrafficEntry {
    id: string;
    timestamp: string;
    method: string;
    endpoint: string;
    model: string;
    prompt_preview: string;
    status: number;
    tokens_used: number;
    cost: number;
    threat_level: ThreatLevel;
    pii_detected: PIIMatch[];
    injection_detected: InjectionMatch[];
    blocked: boolean;
    block_reason: string;
    latency_ms: number;
}

// ─── Dashboard Stats ──────────────────────────────────────────
export interface DashboardStats {
    total_requests: number;
    blocked_requests: number;
    pii_detections: number;
    injection_attempts: number;
    total_spend_today: number;
    total_tokens_today: number;
    requests_per_minute: number;
}

// ─── Budget Stats ─────────────────────────────────────────────
export interface BudgetStats {
    daily_spend: number;
    weekly_spend: number;
    monthly_spend: number;
    daily_tokens: number;
    weekly_tokens: number;
}

// ─── WebSocket Messages ───────────────────────────────────────
export interface WSTrafficMessage {
    type: 'traffic';
    entry: TrafficEntry;
    stats: DashboardStats;
}

export interface WSInitMessage {
    type: 'init';
    traffic: TrafficEntry[];
    stats: DashboardStats;
}

export interface WSPongMessage {
    type: 'pong';
}

export type WSMessage = WSTrafficMessage | WSInitMessage | WSPongMessage;
