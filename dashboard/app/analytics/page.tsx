'use client';
import React, { useMemo, useState } from 'react';
import { useWebSocket } from '@/lib/ws';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, AreaChart, Area,
} from 'recharts';

const THREAT_COLORS: Record<string, string> = {
    none: '#2a2a3a',
    low: '#00d68f',
    medium: '#ffaa00',
    high: '#ff6432',
    critical: '#ff3b5c',
};

export default function AnalyticsPage() {
    const { traffic, stats, connected } = useWebSocket();
    const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('24h');

    // ── Hourly volume data ──
    const hourlyData = useMemo(() => {
        const hoursBack = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : 24;
        const now = new Date();
        const buckets: { hour: string; requests: number; blocked: number }[] = [];

        for (let i = hoursBack - 1; i >= 0; i--) {
            const start = new Date(now);
            start.setHours(now.getHours() - i, 0, 0, 0);
            const end = new Date(start);
            end.setHours(start.getHours() + 1);

            const inBucket = traffic.filter((e) => {
                const ts = new Date(e.timestamp);
                return ts >= start && ts < end;
            });

            buckets.push({
                hour: start.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
                requests: inBucket.length,
                blocked: inBucket.filter((e) => e.blocked).length,
            });
        }
        return buckets;
    }, [traffic, timeRange]);

    // ── Threat breakdown (pie) ──
    const threatBreakdown = useMemo(() => {
        const counts: Record<string, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
        traffic.forEach((e) => {
            counts[e.threat_level] = (counts[e.threat_level] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([level, count]) => ({ name: level, value: count, fill: THREAT_COLORS[level] }));
    }, [traffic]);

    // ── Model distribution ──
    const modelData = useMemo(() => {
        const counts: Record<string, { requests: number; tokens: number; cost: number }> = {};
        traffic.forEach((e) => {
            if (!counts[e.model]) counts[e.model] = { requests: 0, tokens: 0, cost: 0 };
            counts[e.model].requests++;
            counts[e.model].tokens += e.tokens_used;
            counts[e.model].cost += e.cost;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1].requests - a[1].requests)
            .slice(0, 8)
            .map(([model, data]) => ({ model, ...data }));
    }, [traffic]);

    // ── PII type breakdown ──
    const piiBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        traffic.forEach((e) =>
            e.pii_detected.forEach((p) => {
                counts[p.pii_type] = (counts[p.pii_type] || 0) + 1;
            })
        );
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => ({ type, count }));
    }, [traffic]);

    // ── Latency trend ──
    const latencyData = useMemo(() => {
        return traffic
            .slice(-50)
            .map((e, i) => ({
                idx: i,
                latency: Math.round(e.latency_ms),
                model: e.model,
            }));
    }, [traffic]);

    // ── Export handler ──
    const handleExport = (format: 'csv' | 'json') => {
        window.open(`http://localhost:8081/api/traffic/export?format=${format}`, '_blank');
    };

    const blockRate = stats.total_requests > 0
        ? ((stats.blocked_requests / stats.total_requests) * 100).toFixed(1)
        : '0.0';

    return (
        <div className="page-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 className="page-title">📈 Analytics</h1>
                    <p className="page-description">Traffic insights, threat breakdowns, and cost analysis</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Time range selector */}
                    <div className="inspector-tabs" style={{ marginBottom: 0 }}>
                        {(['1h', '6h', '24h'] as const).map((range) => (
                            <button
                                key={range}
                                className={`inspector-tab ${timeRange === range ? 'active' : ''}`}
                                onClick={() => setTimeRange(range)}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                    {/* Export buttons */}
                    <button className="btn btn-outline" onClick={() => handleExport('csv')}>
                        📄 CSV
                    </button>
                    <button className="btn btn-outline" onClick={() => handleExport('json')}>
                        { } JSON
                    </button>
                </div>
            </div>

            {/* ── Top-level Stats ── */}
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
                <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-label">Total Requests</div>
                    <div className="stat-value">{stats.total_requests.toLocaleString()}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🚫</div>
                    <div className="stat-label">Blocked</div>
                    <div className="stat-value">{stats.blocked_requests}</div>
                    <div className="stat-delta" style={{ color: 'var(--danger)' }}>{blockRate}% block rate</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🔍</div>
                    <div className="stat-label">PII Detected</div>
                    <div className="stat-value">{stats.pii_detections}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-label">Today&apos;s Spend</div>
                    <div className="stat-value">${stats.total_spend_today.toFixed(4)}</div>
                </div>
            </div>

            {/* ── Chart Row 1: Volume + Threats ── */}
            <div className="analytics-chart-row">
                <div className="card analytics-chart-wide">
                    <div className="card-header">
                        <span className="card-title">Request Volume</span>
                    </div>
                    <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                            <BarChart data={hourlyData} barCategoryGap="15%">
                                <XAxis dataKey="hour" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={Math.max(0, Math.floor(hourlyData.length / 8) - 1)} />
                                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                                <Tooltip content={<ChartTooltip />} cursor={false} />
                                <Bar dataKey="requests" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={20} name="Requests" />
                                <Bar dataKey="blocked" fill="var(--danger)" radius={[4, 4, 0, 0]} maxBarSize={20} name="Blocked" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card analytics-chart-narrow">
                    <div className="card-header">
                        <span className="card-title">Threat Breakdown</span>
                    </div>
                    <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={threatBreakdown}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={70}
                                    innerRadius={40}
                                    strokeWidth={0}
                                >
                                    {threatBreakdown.map((entry, i) => (
                                        <Cell key={i} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip content={<PieTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="chart-legend" style={{ flexWrap: 'wrap' }}>
                        {threatBreakdown.map((d) => (
                            <div key={d.name} className="chart-legend-item">
                                <span className="chart-legend-dot" style={{ background: d.fill }} />
                                <span className="chart-legend-label">{d.name}: {d.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Chart Row 2: Latency + Models ── */}
            <div className="analytics-chart-row">
                <div className="card analytics-chart-wide">
                    <div className="card-header">
                        <span className="card-title">Latency Trend (last 50)</span>
                    </div>
                    <div style={{ width: '100%', height: 200 }}>
                        <ResponsiveContainer>
                            <AreaChart data={latencyData}>
                                <XAxis dataKey="idx" tick={false} axisLine={{ stroke: 'var(--border)' }} />
                                <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} axisLine={false} tickLine={false} width={40} unit="ms" />
                                <Tooltip content={<LatencyTooltip />} cursor={false} />
                                <Area type="monotone" dataKey="latency" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="card analytics-chart-narrow">
                    <div className="card-header">
                        <span className="card-title">Model Usage</span>
                    </div>
                    <div className="analytics-model-list">
                        {modelData.length === 0 ? (
                            <div className="empty-state-text">No data yet</div>
                        ) : (
                            modelData.map((d) => (
                                <div key={d.model} className="analytics-model-item">
                                    <div className="analytics-model-name">{d.model}</div>
                                    <div className="analytics-model-stats">
                                        <span>{d.requests} req</span>
                                        <span>{(d.tokens / 1000).toFixed(1)}K tok</span>
                                        <span>${d.cost.toFixed(4)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── PII Breakdown ── */}
            {piiBreakdown.length > 0 && (
                <div className="card" style={{ marginTop: '16px' }}>
                    <div className="card-header">
                        <span className="card-title">PII Detection Breakdown</span>
                    </div>
                    <div className="analytics-pii-grid">
                        {piiBreakdown.map((d) => (
                            <div key={d.type} className="analytics-pii-item">
                                <span className="pii-tag">{d.type}</span>
                                <span className="analytics-pii-count">{d.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!connected && (
                <div className="card" style={{ marginTop: '16px', textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                    ⚠️ Proxy server not connected — analytics show cached data only
                </div>
            )}
        </div>
    );
}

// ── Custom Tooltips ──
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            <div className="chart-tooltip-label">{label}</div>
            {payload.map((p, i) => (
                <div key={i} className="chart-tooltip-value" style={{ color: p.color, fontSize: 12 }}>
                    {p.name}: {p.value}
                </div>
            ))}
        </div>
    );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            <div className="chart-tooltip-label">{payload[0].name}</div>
            <div className="chart-tooltip-value">{payload[0].value} requests</div>
        </div>
    );
}

function LatencyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { model: string } }> }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="chart-tooltip">
            <div className="chart-tooltip-value">{payload[0].value}ms</div>
            <div className="chart-tooltip-label">{payload[0].payload.model}</div>
        </div>
    );
}
