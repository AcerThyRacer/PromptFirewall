'use client';
import React from 'react';

interface Props {
    width?: string;
    height?: string;
    borderRadius?: string;
    count?: number;
    gap?: string;
}

/** Shimmer skeleton loader — renders pulsing placeholder bars. */
export default function Skeleton({
    width = '100%',
    height = '16px',
    borderRadius = 'var(--radius-sm)',
    count = 1,
    gap = '8px',
}: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    className="skeleton"
                    style={{ width, height, borderRadius }}
                    aria-busy="true"
                />
            ))}
        </div>
    );
}

/** Special skeleton that mimics a stat card. */
export function StatCardSkeleton() {
    return (
        <div className="stat-card skeleton-card">
            <Skeleton width="60%" height="10px" />
            <Skeleton width="40%" height="28px" />
            <Skeleton width="80%" height="10px" />
        </div>
    );
}

/** Skeleton that mimics a traffic entry row. */
export function TrafficEntrySkeleton({ count = 5 }: { count?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    className="skeleton"
                    style={{
                        width: '100%',
                        height: '36px',
                        borderRadius: 'var(--radius-sm)',
                    }}
                />
            ))}
        </div>
    );
}
