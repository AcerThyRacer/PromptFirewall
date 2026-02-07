const API_BASE = 'http://localhost:8081';

export async function fetchStats() {
    const res = await fetch(`${API_BASE}/api/stats`);
    return res.json();
}

export async function fetchRules() {
    const res = await fetch(`${API_BASE}/api/rules`);
    return res.json();
}

export async function updateRules(rules: object) {
    const res = await fetch(`${API_BASE}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
    });
    return res.json();
}

export async function fetchTraffic(limit = 100) {
    const res = await fetch(`${API_BASE}/api/traffic?limit=${limit}`);
    return res.json();
}

export async function fetchBudget() {
    const res = await fetch(`${API_BASE}/api/budget`);
    return res.json();
}

export async function testPII(text: string) {
    const res = await fetch(`${API_BASE}/api/test/pii`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    return res.json();
}

export async function testInjection(text: string) {
    const res = await fetch(`${API_BASE}/api/test/injection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    });
    return res.json();
}
