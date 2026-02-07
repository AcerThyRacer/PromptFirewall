'use client';
import React, { useState, useEffect } from 'react';
import { fetchRules, updateRules } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

interface PIIRule {
    pii_type: string;
    enabled: boolean;
    action: string;
}

interface InjectionRule {
    enabled: boolean;
    threshold: number;
    action: string;
}

interface BudgetRule {
    enabled: boolean;
    daily_limit: number;
    weekly_limit: number;
    monthly_limit: number;
    action: string;
}

interface Rules {
    pii_rules: PIIRule[];
    injection_rule: InjectionRule;
    budget_rule: BudgetRule;
}

const PII_LABELS: Record<string, { icon: string; name: string; desc: string }> = {
    email: { icon: '📧', name: 'Email Addresses', desc: 'Detect and redact email addresses from prompts' },
    phone: { icon: '📱', name: 'Phone Numbers', desc: 'Detect US and international phone numbers' },
    ssn: { icon: '🔐', name: 'Social Security Numbers', desc: 'Detect SSN patterns (XXX-XX-XXXX)' },
    credit_card: { icon: '💳', name: 'Credit Card Numbers', desc: 'Detect 16-digit card numbers' },
    ip_address: { icon: '🌐', name: 'IP Addresses', desc: 'Detect IPv4 addresses' },
};

export default function RulesPage() {
    const [rules, setRules] = useState<Rules | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        fetchRules()
            .then(setRules)
            .catch(() => {
                // Use defaults if proxy not running
                setRules({
                    pii_rules: Object.keys(PII_LABELS).map((k) => ({
                        pii_type: k,
                        enabled: true,
                        action: 'redact',
                    })),
                    injection_rule: { enabled: true, threshold: 0.6, action: 'block' },
                    budget_rule: {
                        enabled: true,
                        daily_limit: 1.0,
                        weekly_limit: 10.0,
                        monthly_limit: 50.0,
                        action: 'block',
                    },
                });
                addToast('Proxy not running — using default rules', 'warning');
            });
    }, [addToast]);

    const save = async () => {
        if (!rules) return;
        setSaving(true);
        try {
            const result = await updateRules(rules);
            setRules(result);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            addToast('Security rules saved successfully', 'success');
        } catch (e) {
            console.error('Failed to save rules', e);
            addToast('Failed to save rules — is the proxy running?', 'error');
        }
        setSaving(false);
    };

    if (!rules) return <div className="empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-text">Loading rules...</div></div>;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 className="page-title">Security Rules</h1>
                    <p className="page-description">Configure PII detection, injection protection, and budget limits</p>
                </div>
                <button className={`btn ${saved ? 'btn-primary' : ''}`} onClick={save} disabled={saving}>
                    {saved ? '✓ Saved!' : saving ? 'Saving...' : '💾 Save Changes'}
                </button>
            </div>

            <div className="rules-grid">
                {/* PII Rules */}
                <div className="rule-card">
                    <div className="rule-header">
                        <div className="rule-title-area">
                            <span className="rule-icon">🔍</span>
                            <div>
                                <div className="rule-title">PII Redaction</div>
                                <div className="rule-description">Auto-detect and redact personal data before it leaves your machine</div>
                            </div>
                        </div>
                    </div>
                    <div className="rule-details">
                        {rules.pii_rules.map((rule, idx) => {
                            const info = PII_LABELS[rule.pii_type] || { icon: '❓', name: rule.pii_type, desc: '' };
                            return (
                                <div key={rule.pii_type} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0', borderBottom: idx < rules.pii_rules.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>{info.icon}</span>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{info.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{info.desc}</div>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="toggle"
                                            checked={rule.enabled}
                                            onChange={(e) => {
                                                const updated = [...rules.pii_rules];
                                                updated[idx] = { ...rule, enabled: e.target.checked };
                                                setRules({ ...rules, pii_rules: updated });
                                            }}
                                        />
                                    </div>
                                    {rule.enabled && (
                                        <div className="rule-detail-row">
                                            <span className="rule-detail-label">Action</span>
                                            <select
                                                className="select-input"
                                                value={rule.action}
                                                onChange={(e) => {
                                                    const updated = [...rules.pii_rules];
                                                    updated[idx] = { ...rule, action: e.target.value };
                                                    setRules({ ...rules, pii_rules: updated });
                                                }}
                                            >
                                                <option value="redact">Redact</option>
                                                <option value="block">Block</option>
                                                <option value="warn">Warn</option>
                                                <option value="log">Log Only</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Injection Detection */}
                <div className="rule-card">
                    <div className="rule-header">
                        <div className="rule-title-area">
                            <span className="rule-icon">⚠️</span>
                            <div>
                                <div className="rule-title">Injection Detection</div>
                                <div className="rule-description">Detect and block prompt injection / jailbreak attempts</div>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            className="toggle"
                            checked={rules.injection_rule.enabled}
                            onChange={(e) => setRules({
                                ...rules,
                                injection_rule: { ...rules.injection_rule, enabled: e.target.checked },
                            })}
                        />
                    </div>
                    {rules.injection_rule.enabled && (
                        <div className="rule-details">
                            <div className="rule-detail-row">
                                <span className="rule-detail-label">Threshold</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={rules.injection_rule.threshold}
                                        onChange={(e) => setRules({
                                            ...rules,
                                            injection_rule: { ...rules.injection_rule, threshold: parseFloat(e.target.value) },
                                        })}
                                        style={{ width: '100px', accentColor: 'var(--accent)' }}
                                    />
                                    <span className="rule-detail-value">{rules.injection_rule.threshold.toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="rule-detail-row">
                                <span className="rule-detail-label">Action</span>
                                <select
                                    className="select-input"
                                    value={rules.injection_rule.action}
                                    onChange={(e) => setRules({
                                        ...rules,
                                        injection_rule: { ...rules.injection_rule, action: e.target.value },
                                    })}
                                >
                                    <option value="block">Block</option>
                                    <option value="warn">Warn</option>
                                    <option value="log">Log Only</option>
                                </select>
                            </div>
                            <div style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                <strong>Detects:</strong> Direct overrides, system prompt extraction, DAN jailbreaks, token boundary injection, role manipulation, encoding tricks, Unicode obfuscation, and more.
                            </div>
                        </div>
                    )}
                </div>

                {/* Budget Caps */}
                <div className="rule-card">
                    <div className="rule-header">
                        <div className="rule-title-area">
                            <span className="rule-icon">💰</span>
                            <div>
                                <div className="rule-title">Budget Caps</div>
                                <div className="rule-description">Stop requests when spending exceeds your configured limits</div>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            className="toggle"
                            checked={rules.budget_rule.enabled}
                            onChange={(e) => setRules({
                                ...rules,
                                budget_rule: { ...rules.budget_rule, enabled: e.target.checked },
                            })}
                        />
                    </div>
                    {rules.budget_rule.enabled && (
                        <div className="rule-details">
                            <div className="rule-detail-row">
                                <span className="rule-detail-label">Daily Limit</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>$</span>
                                    <input
                                        type="number"
                                        className="number-input"
                                        value={rules.budget_rule.daily_limit}
                                        min={0}
                                        step={0.5}
                                        onChange={(e) => setRules({
                                            ...rules,
                                            budget_rule: { ...rules.budget_rule, daily_limit: parseFloat(e.target.value) || 0 },
                                        })}
                                    />
                                </div>
                            </div>
                            <div className="rule-detail-row">
                                <span className="rule-detail-label">Weekly Limit</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>$</span>
                                    <input
                                        type="number"
                                        className="number-input"
                                        value={rules.budget_rule.weekly_limit}
                                        min={0}
                                        step={1}
                                        onChange={(e) => setRules({
                                            ...rules,
                                            budget_rule: { ...rules.budget_rule, weekly_limit: parseFloat(e.target.value) || 0 },
                                        })}
                                    />
                                </div>
                            </div>
                            <div className="rule-detail-row">
                                <span className="rule-detail-label">Monthly Limit</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>$</span>
                                    <input
                                        type="number"
                                        className="number-input"
                                        value={rules.budget_rule.monthly_limit}
                                        min={0}
                                        step={5}
                                        onChange={(e) => setRules({
                                            ...rules,
                                            budget_rule: { ...rules.budget_rule, monthly_limit: parseFloat(e.target.value) || 0 },
                                        })}
                                    />
                                </div>
                            </div>
                            <div className="rule-detail-row">
                                <span className="rule-detail-label">Exceed Action</span>
                                <select
                                    className="select-input"
                                    value={rules.budget_rule.action}
                                    onChange={(e) => setRules({
                                        ...rules,
                                        budget_rule: { ...rules.budget_rule, action: e.target.value },
                                    })}
                                >
                                    <option value="block">Block</option>
                                    <option value="warn">Warn</option>
                                    <option value="log">Log Only</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
