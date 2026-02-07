'use client';
import React, { useState } from 'react';
import { useWebSocket } from '@/lib/ws';
import type { TrafficEntry } from '@/lib/ws';

export default function TrafficPage() {
    const { connected, traffic } = useWebSocket();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState<TrafficEntry | null>(null);

    const filtered = [...traffic].reverse().filter((entry) => {
        if (search) {
            const q = search.toLowerCase();
            if (
                !entry.model.toLowerCase().includes(q) &&
                !entry.endpoint.toLowerCase().includes(q) &&
                !entry.prompt_preview.toLowerCase().includes(q) &&
                !(entry.block_reason || '').toLowerCase().includes(q)
            ) {
                return false;
            }
        }
        if (filter === 'blocked') return entry.blocked;
        if (filter === 'threats') return entry.threat_level !== 'none';
        if (filter === 'pii') return entry.pii_detected.length > 0;
        return true;
    });

    const formatTime = (ts: string) => {
        try {
            return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
        } catch {
            return ts;
        }
    };

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h1 className="page-title">Traffic Log</h1>
                    <p className="page-description">Full history of all intercepted AI API requests</p>
                </div>
                <div className={`connection-bar ${connected ? 'connected' : 'disconnected'}`}>
                    <span style={{ fontSize: '8px' }}>●</span>
                    <span>{connected ? 'Live' : 'Offline'}</span>
                </div>
            </div>

            <div className="traffic-controls">
                <input
                    className="search-input"
                    placeholder="Search by model, endpoint, or content..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All Traffic</option>
                    <option value="blocked">Blocked Only</option>
                    <option value="threats">Threats Only</option>
                    <option value="pii">PII Detected</option>
                </select>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title">
                        {filtered.length} {filter === 'all' ? 'requests' : `matching "${filter}"`}
                    </span>
                </div>
                <div className="traffic-feed" style={{ maxHeight: '70vh' }}>
                    {filtered.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📡</div>
                            <div className="empty-state-text">
                                {search || filter !== 'all' ? 'No matching traffic found' : 'No traffic yet'}
                            </div>
                            <div className="empty-state-hint">
                                {search || filter !== 'all'
                                    ? 'Try adjusting your search or filter'
                                    : 'Send requests through localhost:8080 to start monitoring'}
                            </div>
                        </div>
                    ) : (
                        filtered.map((entry) => (
                            <div
                                key={entry.id}
                                className="traffic-entry"
                                onClick={() => setSelected(entry)}
                            >
                                <span className="traffic-time">{formatTime(entry.timestamp)}</span>
                                <span className="traffic-endpoint">{entry.endpoint || 'N/A'}</span>
                                <span className="traffic-model">{entry.model}</span>
                                <span className={`traffic-status ${entry.blocked ? 'blocked' : entry.status >= 400 ? 'warn' : 'ok'}`}>
                                    {entry.blocked ? 'BLOCKED' : entry.status}
                                </span>
                                <span className={`threat-badge ${entry.threat_level}`}>
                                    {entry.threat_level}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {selected && (
                <div className="inspector-overlay" onClick={() => setSelected(null)}>
                    <div className="inspector-panel" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Request Details</h3>
                            <button className="inspector-close" onClick={() => setSelected(null)}>✕</button>
                        </div>

                        <div className="inspector-section">
                            <div className="inspector-section-title">Metadata</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                {[
                                    { label: 'Model', value: selected.model },
                                    { label: 'Status', value: selected.blocked ? 'BLOCKED' : String(selected.status) },
                                    { label: 'Tokens', value: String(selected.tokens_used) },
                                    { label: 'Cost', value: `$${selected.cost.toFixed(4)}` },
                                    { label: 'Latency', value: `${selected.latency_ms.toFixed(0)}ms` },
                                    { label: 'Threat', value: selected.threat_level },
                                ].map((item) => (
                                    <div key={item.label}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px' }}>{item.label}</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', marginTop: '2px' }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {selected.endpoint && (
                            <div className="inspector-section">
                                <div className="inspector-section-title">Endpoint</div>
                                <div className="inspector-code">{selected.endpoint}</div>
                            </div>
                        )}

                        {selected.prompt_preview && (
                            <div className="inspector-section">
                                <div className="inspector-section-title">Prompt Preview</div>
                                <div className="inspector-code">{selected.prompt_preview}</div>
                            </div>
                        )}

                        {selected.block_reason && (
                            <div className="inspector-section">
                                <div className="inspector-section-title">Block Reason</div>
                                <div className="inspector-code" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                                    ⛔ {selected.block_reason}
                                </div>
                            </div>
                        )}

                        {selected.pii_detected.length > 0 && (
                            <div className="inspector-section">
                                <div className="inspector-section-title">PII Detected ({selected.pii_detected.length})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {selected.pii_detected.map((pii, i) => (
                                        <span key={i} className="pii-tag">{pii.pii_type}: {pii.value} → {pii.redacted}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selected.injection_detected.length > 0 && (
                            <div className="inspector-section">
                                <div className="inspector-section-title">Injection Patterns ({selected.injection_detected.length})</div>
                                {selected.injection_detected.map((inj, i) => (
                                    <div key={i} style={{ padding: '8px 12px', background: 'var(--danger-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: '4px', fontSize: '12px' }}>
                                        <strong style={{ color: 'var(--danger)' }}>{inj.pattern}</strong>
                                        <span style={{ marginLeft: '8px', color: 'var(--text-tertiary)' }}>
                                            Score: {inj.score.toFixed(2)} | {inj.severity}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
