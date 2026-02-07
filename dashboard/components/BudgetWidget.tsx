'use client';
import React from 'react';
import type { DashboardStats } from '@/lib/ws';

interface Props {
    stats: DashboardStats;
    dailyLimit: number;
}

export default function BudgetWidget({ stats, dailyLimit }: Props) {
    const percentage = dailyLimit > 0 ? Math.min(100, (stats.total_spend_today / dailyLimit) * 100) : 0;

    const getColor = () => {
        if (percentage >= 90) return 'var(--danger)';
        if (percentage >= 70) return 'var(--warning)';
        return 'var(--success)';
    };

    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">Budget Tracker</span>
                <span className="card-icon">💰</span>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div className="budget-amount" style={{ color: getColor() }}>
                    ${stats.total_spend_today.toFixed(4)}
                </div>
                <div className="budget-limit">
                    of ${dailyLimit.toFixed(2)} daily limit
                </div>
            </div>

            <div className="budget-gauge">
                <div
                    className="budget-gauge-fill"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            <div className="budget-labels">
                <span>$0.00</span>
                <span>{percentage.toFixed(0)}% used</span>
                <span>${dailyLimit.toFixed(2)}</span>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="rule-detail-row">
                    <span className="rule-detail-label">Tokens Today</span>
                    <span className="rule-detail-value">{stats.total_tokens_today.toLocaleString()}</span>
                </div>
                <div className="rule-detail-row">
                    <span className="rule-detail-label">Requests Today</span>
                    <span className="rule-detail-value">{stats.total_requests}</span>
                </div>
                <div className="rule-detail-row">
                    <span className="rule-detail-label">Avg Cost/Request</span>
                    <span className="rule-detail-value">
                        ${stats.total_requests > 0
                            ? (stats.total_spend_today / stats.total_requests).toFixed(4)
                            : '0.0000'}
                    </span>
                </div>
            </div>
        </div>
    );
}
