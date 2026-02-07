'use client';
import React from 'react';
import StatsBar from '@/components/StatsBar';
import TrafficFeed from '@/components/TrafficFeed';
import ThreatChart from '@/components/ThreatChart';
import BudgetWidget from '@/components/BudgetWidget';
import { useWebSocket } from '@/lib/ws';

export default function DashboardPage() {
  const { connected, traffic, stats } = useWebSocket();

  return (
    <>
      <StatsBar stats={stats} connected={connected} />
      <div className="dashboard-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <TrafficFeed traffic={traffic} />
          <ThreatChart traffic={traffic} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <BudgetWidget stats={stats} dailyLimit={1.0} />
          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Actions</span>
              <span className="card-icon">⚡</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="rule-detail-row">
                <span className="rule-detail-label">Proxy Endpoint</span>
                <span className="rule-detail-value">localhost:8080</span>
              </div>
              <div className="rule-detail-row">
                <span className="rule-detail-label">API Server</span>
                <span className="rule-detail-value">localhost:8081</span>
              </div>
              <div className="rule-detail-row">
                <span className="rule-detail-label">WebSocket</span>
                <span className="rule-detail-value">ws://localhost:8765</span>
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <div className="inspector-code" style={{ fontSize: '11px' }}>
                {`# Route your AI calls through the firewall:\ncurl -X POST http://localhost:8080/v1/chat/completions \\\n  -H "X-Target-URL: https://api.openai.com/v1/chat/completions" \\\n  -H "Authorization: Bearer sk-..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o","messages":[...]}'`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
