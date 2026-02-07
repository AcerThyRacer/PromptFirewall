'use client';
import React from 'react';
import type { DashboardStats } from '@/lib/ws';

interface Props {
    stats: DashboardStats;
    connected: boolean;
}

export default function StatsBar({ stats, connected }: Props) {
    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h1 className="page-title">Command Center</h1>
                    <p className="page-description">Real-time AI traffic monitoring and threat detection</p>
                </div>
                <div className={`connection-bar ${connected ? 'connected' : 'disconnected'}`}>
                    <span style={{ fontSize: '8px' }}>●</span>
                    <span>{connected ? 'Connected to Proxy' : 'Disconnected'}</span>
                </div>
            </div>
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Requests Today</div>
                    <div className="stat-value accent">{stats.total_requests.toLocaleString()}</div>
                    <div className="stat-trend">
                        <span>⚡</span>
                        <span>{stats.requests_per_minute.toFixed(0)} req/min</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Blocked</div>
                    <div className="stat-value danger">{stats.blocked_requests}</div>
                    <div className="stat-trend">
                        <span>🛡️</span>
                        <span>Threats neutralized</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">PII Detected</div>
                    <div className="stat-value warning">{stats.pii_detections}</div>
                    <div className="stat-trend">
                        <span>🔍</span>
                        <span>Sensitive data caught</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Injection Attempts</div>
                    <div className="stat-value danger">{stats.injection_attempts}</div>
                    <div className="stat-trend">
                        <span>⚠️</span>
                        <span>Prompt attacks blocked</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Spend Today</div>
                    <div className="stat-value success">${stats.total_spend_today.toFixed(4)}</div>
                    <div className="stat-trend">
                        <span>💰</span>
                        <span>{stats.total_tokens_today.toLocaleString()} tokens</span>
                    </div>
                </div>
            </div>
        </>
    );
}
