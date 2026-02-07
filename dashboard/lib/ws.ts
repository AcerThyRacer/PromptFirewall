'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TrafficEntry, DashboardStats } from '@/types';

interface WSMessage {
    type: string;
    entry?: TrafficEntry;
    traffic?: TrafficEntry[];
    stats?: DashboardStats;
}

const DEFAULT_STATS: DashboardStats = {
    total_requests: 0,
    blocked_requests: 0,
    pii_detections: 0,
    injection_attempts: 0,
    total_spend_today: 0,
    total_tokens_today: 0,
    requests_per_minute: 0,
};

// Exponential backoff config
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_JITTER = 0.3;          // ±30% random jitter

export function useWebSocket() {
    const [connected, setConnected] = useState(false);
    const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
    const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
    const backoffRef = useRef(BACKOFF_INITIAL_MS);

    const connect = useCallback(() => {
        try {
            const ws = new WebSocket('ws://localhost:8765');
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                backoffRef.current = BACKOFF_INITIAL_MS;  // Reset on success
                console.log('[WS] Connected to proxy server');
            };

            ws.onmessage = (event) => {
                try {
                    const data: WSMessage = JSON.parse(event.data);

                    if (data.type === 'init') {
                        if (data.traffic) setTraffic(data.traffic);
                        if (data.stats) setStats(data.stats);
                    } else if (data.type === 'traffic') {
                        if (data.entry) {
                            setTraffic(prev => [...prev.slice(-499), data.entry!]);
                        }
                        if (data.stats) setStats(data.stats);
                    }
                } catch (e) {
                    console.error('[WS] Parse error:', e);
                }
            };

            ws.onclose = () => {
                setConnected(false);
                scheduleReconnect();
            };

            ws.onerror = () => {
                ws.close();
            };
        } catch {
            scheduleReconnect();
        }
    }, []);

    const scheduleReconnect = () => {
        const delay = backoffRef.current;
        // Add jitter: ±BACKOFF_JITTER
        const jitter = delay * BACKOFF_JITTER * (Math.random() * 2 - 1);
        const actual = Math.round(delay + jitter);

        console.log(`[WS] Reconnecting in ${actual}ms (backoff: ${delay}ms)`);
        reconnectTimeout.current = setTimeout(connect, actual);

        // Increase backoff for next time, clamped to max
        backoffRef.current = Math.min(
            backoffRef.current * BACKOFF_MULTIPLIER,
            BACKOFF_MAX_MS
        );
    };

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [connect]);

    return { connected, traffic, stats };
}

export type { TrafficEntry, DashboardStats };
