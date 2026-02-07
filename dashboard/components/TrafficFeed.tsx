'use client';
import React, { useState } from 'react';
import type { TrafficEntry } from '@/lib/ws';

interface Props {
    traffic: TrafficEntry[];
}

type InspectorTab = 'overview' | 'raw' | 'timeline';

export default function TrafficFeed({ traffic }: Props) {
    const [selected, setSelected] = useState<TrafficEntry | null>(null);
    const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
    const reversed = [...traffic].reverse();

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            return d.toLocaleTimeString('en-US', { hour12: false });
        } catch {
            return ts;
        }
    };

    const getStatusClass = (entry: TrafficEntry) => {
        if (entry.blocked) return 'blocked';
        if (entry.status >= 400) return 'warn';
        return 'ok';
    };

    const openInspector = (entry: TrafficEntry) => {
        setSelected(entry);
        setInspectorTab('overview');
    };

    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">Live Traffic</span>
                <span className="card-icon">🔄</span>
            </div>
            <div className="traffic-feed">
                {reversed.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📡</div>
                        <div className="empty-state-text">Waiting for traffic...</div>
                        <div className="empty-state-hint">
                            Send requests through localhost:8080 to see them here
                        </div>
                    </div>
                ) : (
                    reversed.map((entry, i) => (
                        <div
                            key={entry.id}
                            className="traffic-entry"
                            onClick={() => openInspector(entry)}
                            style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                        >
                            <span className="traffic-time">{formatTime(entry.timestamp)}</span>
                            <span className="traffic-endpoint">{entry.endpoint || 'N/A'}</span>
                            <span className="traffic-model">{entry.model}</span>
                            <span className={`traffic-status ${getStatusClass(entry)}`}>
                                {entry.blocked ? 'BLOCKED' : entry.status}
                            </span>
                            <span className={`threat-badge ${entry.threat_level}`}>
                                {entry.threat_level}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Tabbed Inspector Modal */}
            {selected && (
                <div className="inspector-overlay" onClick={() => setSelected(null)}>
                    <div className="inspector-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="inspector-header">
                            <h3 className="inspector-title">Request Inspector</h3>
                            <button
                                className="inspector-close"
                                onClick={() => setSelected(null)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Tab bar */}
                        <div className="inspector-tabs">
                            {(['overview', 'raw', 'timeline'] as InspectorTab[]).map((tab) => (
                                <button
                                    key={tab}
                                    className={`inspector-tab ${inspectorTab === tab ? 'active' : ''}`}
                                    onClick={() => setInspectorTab(tab)}
                                >
                                    {tab === 'overview' && '📋 '}
                                    {tab === 'raw' && '{ } '}
                                    {tab === 'timeline' && '⏱️ '}
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="inspector-tab-content">
                            {inspectorTab === 'overview' && (
                                <>
                                    <div className="inspector-section">
                                        <div className="inspector-section-title">Overview</div>
                                        <div className="inspector-grid">
                                            <div className="inspector-field">
                                                <span className="inspector-field-label">Model</span>
                                                <span className="inspector-field-value">{selected.model}</span>
                                            </div>
                                            <div className="inspector-field">
                                                <span className="inspector-field-label">Status</span>
                                                <span className={`inspector-field-value traffic-status ${getStatusClass(selected)}`}>
                                                    {selected.blocked ? 'BLOCKED' : selected.status}
                                                </span>
                                            </div>
                                            <div className="inspector-field">
                                                <span className="inspector-field-label">Tokens</span>
                                                <span className="inspector-field-value">{selected.tokens_used}</span>
                                            </div>
                                            <div className="inspector-field">
                                                <span className="inspector-field-label">Cost</span>
                                                <span className="inspector-field-value">${selected.cost.toFixed(4)}</span>
                                            </div>
                                            <div className="inspector-field">
                                                <span className="inspector-field-label">Latency</span>
                                                <span className="inspector-field-value">{selected.latency_ms.toFixed(0)}ms</span>
                                            </div>
                                            <div className="inspector-field">
                                                <span className="inspector-field-label">Threat</span>
                                                <span className={`threat-badge ${selected.threat_level}`}>
                                                    {selected.threat_level}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {selected.prompt_preview && (
                                        <div className="inspector-section">
                                            <div className="inspector-section-title">Prompt Preview</div>
                                            <div className="inspector-code">{selected.prompt_preview}</div>
                                        </div>
                                    )}

                                    {selected.blocked && selected.block_reason && (
                                        <div className="inspector-section">
                                            <div className="inspector-section-title">Block Reason</div>
                                            <div className="inspector-code inspector-code-danger">
                                                {selected.block_reason}
                                            </div>
                                        </div>
                                    )}

                                    {selected.pii_detected.length > 0 && (
                                        <div className="inspector-section">
                                            <div className="inspector-section-title">PII Detected</div>
                                            <div className="inspector-tags">
                                                {selected.pii_detected.map((pii, i) => (
                                                    <span key={i} className="pii-tag">
                                                        {pii.pii_type}: {pii.redacted}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selected.injection_detected.length > 0 && (
                                        <div className="inspector-section">
                                            <div className="inspector-section-title">Injection Patterns</div>
                                            {selected.injection_detected.map((inj, i) => (
                                                <div key={i} className="inspector-injection-item">
                                                    <strong className="inspector-injection-name">{inj.pattern}</strong>
                                                    <span className="inspector-injection-meta">
                                                        Score: {inj.score.toFixed(2)} | {inj.severity}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {inspectorTab === 'raw' && (
                                <div className="inspector-section">
                                    <div className="inspector-section-title">Raw Entry Data</div>
                                    <pre className="inspector-raw-json">
                                        {JSON.stringify(selected, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {inspectorTab === 'timeline' && (
                                <div className="inspector-section">
                                    <div className="inspector-section-title">Request Timeline</div>
                                    <div className="inspector-timeline">
                                        <div className="timeline-item">
                                            <div className="timeline-dot timeline-dot-start" />
                                            <div className="timeline-content">
                                                <div className="timeline-label">Request Received</div>
                                                <div className="timeline-time">{formatTime(selected.timestamp)}</div>
                                            </div>
                                        </div>
                                        {selected.pii_detected.length > 0 && (
                                            <div className="timeline-item">
                                                <div className="timeline-dot timeline-dot-pii" />
                                                <div className="timeline-content">
                                                    <div className="timeline-label">PII Scan</div>
                                                    <div className="timeline-detail">
                                                        {selected.pii_detected.length} match(es) found
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {selected.injection_detected.length > 0 && (
                                            <div className="timeline-item">
                                                <div className="timeline-dot timeline-dot-injection" />
                                                <div className="timeline-content">
                                                    <div className="timeline-label">Injection Scan</div>
                                                    <div className="timeline-detail">
                                                        {selected.injection_detected.length} pattern(s) matched
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {selected.blocked ? (
                                            <div className="timeline-item">
                                                <div className="timeline-dot timeline-dot-blocked" />
                                                <div className="timeline-content">
                                                    <div className="timeline-label">Request Blocked</div>
                                                    <div className="timeline-detail">{selected.block_reason}</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="timeline-item">
                                                    <div className="timeline-dot timeline-dot-forward" />
                                                    <div className="timeline-content">
                                                        <div className="timeline-label">Forwarded to API</div>
                                                        <div className="timeline-detail">{selected.endpoint}</div>
                                                    </div>
                                                </div>
                                                <div className="timeline-item">
                                                    <div className="timeline-dot timeline-dot-end" />
                                                    <div className="timeline-content">
                                                        <div className="timeline-label">Response Received</div>
                                                        <div className="timeline-detail">
                                                            {selected.tokens_used} tokens · ${selected.cost.toFixed(4)} · {selected.latency_ms.toFixed(0)}ms
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
