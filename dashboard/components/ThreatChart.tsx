'use client';
import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import type { TrafficEntry } from '@/lib/ws';

interface Props {
    traffic: TrafficEntry[];
}

const THREAT_COLORS: Record<string, string> = {
    none: '#2a2a3a',
    low: '#00d68f',
    medium: '#ffaa00',
    high: '#ff6432',
    critical: '#ff3b5c',
};

export default function ThreatChart({ traffic }: Props) {
    const data = useMemo(() => {
        const now = new Date();
        const hours: { hour: string; count: number; level: string }[] = [];

        for (let i = 23; i >= 0; i--) {
            const hourStart = new Date(now);
            hourStart.setHours(now.getHours() - i, 0, 0, 0);
            const hourEnd = new Date(hourStart);
            hourEnd.setHours(hourStart.getHours() + 1);

            const entriesInHour = traffic.filter((e) => {
                const ts = new Date(e.timestamp);
                return ts >= hourStart && ts < hourEnd;
            });

            let maxLevel = 'none';
            const levelPriority: Record<string, number> = {
                none: 0, low: 1, medium: 2, high: 3, critical: 4,
            };

            entriesInHour.forEach((e) => {
                if ((levelPriority[e.threat_level] || 0) > (levelPriority[maxLevel] || 0)) {
                    maxLevel = e.threat_level;
                }
            });

            hours.push({
                hour: hourStart.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    hour12: true,
                }),
                count: entriesInHour.length,
                level: maxLevel,
            });
        }

        return hours;
    }, [traffic]);

    const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { level: string } }>; label?: string }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="chart-tooltip">
                <div className="chart-tooltip-label">{label}</div>
                <div className="chart-tooltip-value">{payload[0].value} requests</div>
                <div className="chart-tooltip-level">
                    Peak: <span className={`threat-badge ${payload[0].payload.level}`}>
                        {payload[0].payload.level}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title">Threat Activity (24h)</span>
                <span className="card-icon">📈</span>
            </div>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                    <BarChart data={data} barCategoryGap="20%">
                        <XAxis
                            dataKey="hour"
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                            axisLine={{ stroke: 'var(--border)' }}
                            tickLine={false}
                            interval={3}
                        />
                        <YAxis
                            tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={30}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={false} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={18}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={index}
                                    fill={THREAT_COLORS[entry.level] || THREAT_COLORS.none}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="chart-legend">
                {Object.entries(THREAT_COLORS).map(([level, color]) => (
                    <div key={level} className="chart-legend-item">
                        <span
                            className="chart-legend-dot"
                            style={{ background: color }}
                        />
                        <span className="chart-legend-label">{level}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
