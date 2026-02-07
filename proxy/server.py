"""The Prompt Firewall — Local Proxy Server (v2.0)

Main entry point. Runs:
- HTTP Proxy on port 8080 (intercepts AI API calls)
- REST API on port 8081 (dashboard config/stats)
- WebSocket on port 8765 (real-time traffic streaming)

Security: CORS restricted, API key auth, rate-limited.
"""
from __future__ import annotations
import asyncio
import csv
import io
import json
import os
import secrets
import sys
import time
from collections import deque
from datetime import datetime
from aiohttp import web, ClientSession
import websockets
from websockets.asyncio.server import serve as ws_serve

# Add parent to path
sys.path.insert(0, os.path.dirname(__file__))

from models import SecurityRules, TrafficEntry, DashboardStats, ThreatLevel
from config import Config
from interceptor import Interceptor
from budget import BudgetTracker
from alerts import AlertManager, AlertEvent
from providers import detect_provider
from access import AccessManager


# ─── Application State ────────────────────────────────────────
class AppState:
    """Encapsulates all mutable application state."""

    def __init__(self):
        self.config = Config()
        self.budget_tracker = BudgetTracker()
        self.interceptor = Interceptor(self.config.rules, self.budget_tracker)
        self.alert_manager = AlertManager()
        self.access_manager = AccessManager()
        self.traffic_log: deque[dict] = deque(maxlen=10_000)
        self.ws_clients: set = set()
        self.start_time = time.time()
        self.http_session: ClientSession | None = None

        # API key — generated at startup, printed in banner
        self.api_key = os.environ.get("PF_API_KEY", secrets.token_urlsafe(32))

        # CORS — configurable, default localhost:3000
        allowed = os.environ.get("PF_CORS_ORIGINS", "http://localhost:3000")
        self.cors_origins: set[str] = {o.strip() for o in allowed.split(",")}

    async def get_session(self) -> ClientSession:
        """Get or create a reusable HTTP client session."""
        if self.http_session is None or self.http_session.closed:
            self.http_session = ClientSession()
        return self.http_session

    async def close(self):
        """Clean up resources."""
        if self.http_session and not self.http_session.closed:
            await self.http_session.close()
        await self.alert_manager.close()


# ─── Global State ──────────────────────────────────────────────
state = AppState()


# ─── WebSocket Broadcasting ───────────────────────────────────
async def broadcast(data: dict):
    """Send traffic data to all connected WebSocket clients."""
    if state.ws_clients:
        message = json.dumps(data, default=str)
        dead = set()
        for ws in state.ws_clients:
            try:
                await ws.send(message)
            except Exception:
                dead.add(ws)
        state.ws_clients -= dead


async def ws_handler(websocket):
    """Handle WebSocket connections from the dashboard."""
    state.ws_clients.add(websocket)
    print(f"[WS] Dashboard connected ({len(state.ws_clients)} clients)")
    try:
        await websocket.send(json.dumps({
            "type": "init",
            "traffic": list(state.traffic_log)[-100:],
            "stats": get_stats(),
        }, default=str))

        async for message in websocket:
            data = json.loads(message)
            if data.get("type") == "ping":
                await websocket.send(json.dumps({"type": "pong"}))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        state.ws_clients.discard(websocket)
        print(f"[WS] Dashboard disconnected ({len(state.ws_clients)} clients)")


# ─── Stats ─────────────────────────────────────────────────────
def get_stats() -> dict:
    """Compute current dashboard statistics."""
    now = datetime.now()
    recent = [t for t in state.traffic_log
              if (now - datetime.fromisoformat(t["timestamp"])).total_seconds() < 86400]

    minute_ago = [t for t in state.traffic_log
                  if (now - datetime.fromisoformat(t["timestamp"])).total_seconds() < 60]

    stats = DashboardStats(
        total_requests=len(recent),
        blocked_requests=sum(1 for t in recent if t.get("blocked")),
        pii_detections=sum(len(t.get("pii_detected", [])) for t in recent),
        injection_attempts=sum(len(t.get("injection_detected", [])) for t in recent),
        total_spend_today=state.budget_tracker.get_spend("daily"),
        total_tokens_today=state.budget_tracker.get_tokens("daily"),
        requests_per_minute=len(minute_ago),
    )
    return stats.model_dump()


# ─── Proxy Handler ─────────────────────────────────────────────
async def proxy_handler(request: web.Request) -> web.Response:
    """Intercept and forward AI API requests."""
    start = time.time()
    body = await request.read()
    target_url = request.headers.get("X-Target-URL", str(request.url))

    # === Access Control ===
    action, reason = state.access_manager.check_endpoint(target_url)
    if action == "block":
        return web.json_response({"error": "blocked", "reason": reason}, status=403)
    if action == "allow":
        # Bypass security pipeline — forward directly
        headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in ("host", "x-target-url", "content-length")}
        session = await state.get_session()
        try:
            async with session.request(request.method, target_url, headers=headers, data=body) as resp:
                resp_body = await resp.read()
                return web.Response(body=resp_body, status=resp.status,
                                    headers={k: v for k, v in resp.headers.items()
                                             if k.lower() not in ("content-encoding", "transfer-encoding")})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=502)

    # === Provider Detection ===
    provider_info = detect_provider(target_url)

    # Process through security pipeline
    processed_body, entry = state.interceptor.process_request(body, str(request.url))
    entry.method = request.method
    if provider_info.model != "unknown":
        entry.model = provider_info.model

    if entry.blocked:
        entry.status = 403
        entry.latency_ms = (time.time() - start) * 1000
        entry_dict = entry.model_dump()
        entry_dict["timestamp"] = entry_dict["timestamp"].isoformat()
        # Scrub any sensitive headers from log
        state.traffic_log.append(entry_dict)
        await broadcast({"type": "traffic", "entry": entry_dict, "stats": get_stats()})

        # Fire alert for blocked request
        asyncio.create_task(state.alert_manager.fire(
            AlertEvent.REQUEST_BLOCKED, f"Request blocked: {entry.block_reason}",
            {"endpoint": entry.endpoint, "model": entry.model, "reason": entry.block_reason}
        ))

        print(f"[BLOCKED] {entry.block_reason}")
        return web.json_response(
            {"error": "blocked", "reason": entry.block_reason},
            status=403
        )

    # Forward to actual API — reuse session
    headers = {k: v for k, v in request.headers.items()
               if k.lower() not in ("host", "x-target-url", "content-length")}

    try:
        session = await state.get_session()
        async with session.request(
            request.method, target_url,
            headers=headers, data=processed_body
        ) as resp:
            resp_body = await resp.read()
            entry.status = resp.status
            entry = state.interceptor.process_response(resp_body, entry)
            entry.latency_ms = (time.time() - start) * 1000

            entry_dict = entry.model_dump()
            entry_dict["timestamp"] = entry_dict["timestamp"].isoformat()
            state.traffic_log.append(entry_dict)
            await broadcast({"type": "traffic", "entry": entry_dict, "stats": get_stats()})

            print(f"[PROXY] {entry.model} | {entry.tokens_used} tokens | ${entry.cost:.4f} | {entry.threat_level.value}")

            # Fire alert for high/critical threats
            if entry.threat_level in (ThreatLevel.HIGH, ThreatLevel.CRITICAL):
                evt = AlertEvent.THREAT_CRITICAL if entry.threat_level == ThreatLevel.CRITICAL else AlertEvent.THREAT_HIGH
                asyncio.create_task(state.alert_manager.fire(
                    evt, f"Threat {entry.threat_level.value}: {entry.model}",
                    {"endpoint": entry.endpoint, "model": entry.model, "tokens": entry.tokens_used}
                ))
            # Fire alert for response PII leaks
            resp_leaks = [p for p in entry.pii_detected if p.redacted.startswith("[RESP]")]
            if resp_leaks:
                asyncio.create_task(state.alert_manager.fire(
                    AlertEvent.PII_RESPONSE_LEAK,
                    f"PII leaked in response from {entry.model}",
                    {"pii_types": [p.pii_type.value for p in resp_leaks], "model": entry.model}
                ))

            return web.Response(
                body=resp_body,
                status=resp.status,
                headers={k: v for k, v in resp.headers.items()
                         if k.lower() not in ("content-encoding", "transfer-encoding")}
            )
    except Exception as e:
        entry.status = 502
        entry.latency_ms = (time.time() - start) * 1000
        entry_dict = entry.model_dump()
        entry_dict["timestamp"] = entry_dict["timestamp"].isoformat()
        state.traffic_log.append(entry_dict)
        await broadcast({"type": "traffic", "entry": entry_dict, "stats": get_stats()})

        print(f"[ERROR] Proxy error: {e}")
        return web.json_response({"error": str(e)}, status=502)


# ─── REST API Routes ───────────────────────────────────────────
async def api_get_stats(request: web.Request) -> web.Response:
    return web.json_response(get_stats())


async def api_get_rules(request: web.Request) -> web.Response:
    return web.json_response(state.config.to_dict())


async def api_update_rules(request: web.Request) -> web.Response:
    data = await request.json()
    # Validate via Pydantic before applying
    try:
        validated = SecurityRules(**data)
    except Exception as e:
        return web.json_response(
            {"error": "validation_failed", "detail": str(e)},
            status=400
        )
    rules = state.config.update_rules(validated.model_dump())
    state.interceptor.update_rules(rules)
    return web.json_response(state.config.to_dict())


async def api_get_traffic(request: web.Request) -> web.Response:
    limit = int(request.query.get("limit", 100))
    return web.json_response(list(state.traffic_log)[-limit:])


async def api_get_budget(request: web.Request) -> web.Response:
    return web.json_response(state.budget_tracker.get_stats())


async def api_test_pii(request: web.Request) -> web.Response:
    """Test endpoint: send text and see PII detection results."""
    data = await request.json()
    text = data.get("text", "")
    if not text or not isinstance(text, str):
        return web.json_response(
            {"error": "Missing or invalid 'text' field"}, status=400
        )
    from detectors.pii import detect_pii
    matches = detect_pii(text, state.config.rules.pii_rules)
    return web.json_response([m.model_dump() for m in matches])


async def api_test_injection(request: web.Request) -> web.Response:
    """Test endpoint: send text and see injection detection results."""
    data = await request.json()
    text = data.get("text", "")
    if not text or not isinstance(text, str):
        return web.json_response(
            {"error": "Missing or invalid 'text' field"}, status=400
        )
    from detectors.injection import detect_injection, compute_threat_score, get_threat_level
    matches = detect_injection(text, state.config.rules.injection_rule)
    score = compute_threat_score(matches)
    return web.json_response({
        "matches": [m.model_dump() for m in matches],
        "score": score,
        "level": get_threat_level(score).value,
    })


async def api_export_traffic(request: web.Request) -> web.Response:
    """Export traffic log as CSV or JSON."""
    fmt = request.query.get("format", "json").lower()
    entries = list(state.traffic_log)

    if fmt == "csv":
        output = io.StringIO()
        if entries:
            writer = csv.DictWriter(output, fieldnames=entries[0].keys())
            writer.writeheader()
            for entry in entries:
                flat = {}
                for k, v in entry.items():
                    flat[k] = json.dumps(v) if isinstance(v, (list, dict)) else v
                writer.writerow(flat)
        return web.Response(
            text=output.getvalue(),
            content_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=traffic_export.csv"}
        )
    else:
        return web.Response(
            text=json.dumps(entries, indent=2, default=str),
            content_type="application/json",
            headers={"Content-Disposition": "attachment; filename=traffic_export.json"}
        )


# ─── Webhooks API ──────────────────────────────────────────────
async def api_get_webhooks(request: web.Request) -> web.Response:
    return web.json_response(state.alert_manager.list_webhooks())


async def api_add_webhook(request: web.Request) -> web.Response:
    data = await request.json()
    url = data.get("url")
    if not url:
        return web.json_response({"error": "Missing 'url' field"}, status=400)
    wh = state.alert_manager.add_webhook(
        url=url,
        name=data.get("name", "default"),
        events=data.get("events"),
        secret=data.get("secret"),
    )
    return web.json_response({"ok": True, "webhook": {"name": wh.name, "url": wh.url}})


async def api_delete_webhook(request: web.Request) -> web.Response:
    name = request.query.get("name", "default")
    removed = state.alert_manager.remove_webhook(name)
    return web.json_response({"ok": removed})


async def api_get_alerts(request: web.Request) -> web.Response:
    limit = int(request.query.get("limit", 50))
    return web.json_response(state.alert_manager.get_history(limit))


# ─── Access Rules API ──────────────────────────────────────────
async def api_get_access_rules(request: web.Request) -> web.Response:
    return web.json_response(state.access_manager.to_dict())


async def api_update_access_rules(request: web.Request) -> web.Response:
    data = await request.json()
    updated = state.access_manager.update_rules(data)
    return web.json_response(updated)


# ─── Request Replay ────────────────────────────────────────────
async def api_replay_request(request: web.Request) -> web.Response:
    """Replay a traffic entry through the security pipeline (dry-run).

    Accepts an entry ID or raw body+endpoint. Runs the full
    interceptor pipeline but does NOT forward to the API.
    """
    data = await request.json()

    # Option 1: replay by entry ID from traffic log
    entry_id = data.get("id")
    if entry_id:
        original = None
        for entry in state.traffic_log:
            if entry.get("id") == entry_id:
                original = entry
                break
        if not original:
            return web.json_response({"error": f"Entry {entry_id} not found"}, status=404)
        body_text = original.get("prompt_preview", "")
        endpoint = original.get("endpoint", "")
        model = original.get("model", "unknown")
    else:
        # Option 2: raw body + endpoint
        body_text = data.get("text", "")
        endpoint = data.get("endpoint", "test://replay")
        model = data.get("model", "unknown")

    if not body_text:
        return web.json_response({"error": "No text to replay"}, status=400)

    # Build a synthetic request body
    synthetic_body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": body_text}]
    }).encode()

    # Run through pipeline
    processed_body, entry = state.interceptor.process_request(synthetic_body, endpoint)

    return web.json_response({
        "replay": True,
        "blocked": entry.blocked,
        "block_reason": entry.block_reason,
        "threat_level": entry.threat_level.value,
        "pii_detected": [m.model_dump() for m in entry.pii_detected],
        "injection_detected": [m.model_dump() for m in entry.injection_detected],
        "tokens_estimated": entry.tokens_used,
        "model": entry.model,
    })


# ─── CORS Middleware (Restricted) ──────────────────────────────
@web.middleware
async def cors_middleware(request: web.Request, handler):
    origin = request.headers.get("Origin", "")

    if request.method == "OPTIONS":
        response = web.Response()
    else:
        try:
            response = await handler(request)
        except web.HTTPException as e:
            response = e

    if origin in state.cors_origins or "*" in state.cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
    else:
        # Still allow requests without Origin header (curl, etc.)
        if not origin:
            response.headers["Access-Control-Allow-Origin"] = "*"

    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Target-URL, X-API-Key"
    return response


# ─── Auth Middleware ───────────────────────────────────────────
@web.middleware
async def auth_middleware(request: web.Request, handler):
    """Require API key for mutating endpoints."""
    # Allow OPTIONS (CORS preflight), GET stats/traffic/budget, and test endpoints
    # without auth for dashboard convenience
    exempt_paths = {"/api/stats", "/api/rules", "/api/traffic", "/api/budget",
                    "/api/test/pii", "/api/test/injection",
                    "/api/traffic/export", "/api/webhooks", "/api/alerts",
                    "/api/access", "/api/replay"}
    exempt_methods = {"OPTIONS", "GET"}

    if request.method in exempt_methods or request.path in exempt_paths:
        return await handler(request)

    # Check API key for POST/PUT/DELETE
    api_key = request.headers.get("X-API-Key", "")
    if api_key != state.api_key:
        return web.json_response(
            {"error": "unauthorized", "detail": "Invalid or missing X-API-Key header"},
            status=401
        )

    return await handler(request)


# ─── Server Setup ──────────────────────────────────────────────
def create_api_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware, auth_middleware])
    app.router.add_get("/api/stats", api_get_stats)
    app.router.add_get("/api/rules", api_get_rules)
    app.router.add_post("/api/rules", api_update_rules)
    app.router.add_get("/api/traffic", api_get_traffic)
    app.router.add_get("/api/budget", api_get_budget)
    app.router.add_post("/api/test/pii", api_test_pii)
    app.router.add_post("/api/test/injection", api_test_injection)
    app.router.add_get("/api/traffic/export", api_export_traffic)
    # Sprint 5: Webhooks, Access, Replay
    app.router.add_get("/api/webhooks", api_get_webhooks)
    app.router.add_post("/api/webhooks", api_add_webhook)
    app.router.add_delete("/api/webhooks", api_delete_webhook)
    app.router.add_get("/api/alerts", api_get_alerts)
    app.router.add_get("/api/access", api_get_access_rules)
    app.router.add_post("/api/access", api_update_access_rules)
    app.router.add_post("/api/replay", api_replay_request)
    return app


def create_proxy_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_route("*", "/{path:.*}", proxy_handler)
    return app


async def main():
    print(r"""
  ╔═══════════════════════════════════════════════════════╗
  ║          🔥 THE PROMPT FIREWALL v2.0 🔥               ║
  ║          AI Security Proxy — Hardened                  ║
  ╠═══════════════════════════════════════════════════════╣
  ║  Proxy Server  →  http://localhost:8080               ║
  ║  REST API      →  http://localhost:8081               ║
  ║  WebSocket     →  ws://localhost:8765                 ║
  ║  Dashboard     →  http://localhost:3000               ║
  ╠═══════════════════════════════════════════════════════╣""")
    print(f"  ║  API Key       →  {state.api_key[:16]}...  ║")
    print(f"  ║  CORS Origins  →  {', '.join(state.cors_origins):<35s}  ║")
    print(r"""  ╚═══════════════════════════════════════════════════════╝
    """)

    # Start WebSocket server
    ws_server = await ws_serve(ws_handler, "localhost", 8765)
    print("[✓] WebSocket server running on ws://localhost:8765")

    # Start REST API server
    api_app = create_api_app()
    api_runner = web.AppRunner(api_app)
    await api_runner.setup()
    api_site = web.TCPSite(api_runner, "localhost", 8081)
    await api_site.start()
    print("[✓] REST API running on http://localhost:8081")

    # Start Proxy server
    proxy_app = create_proxy_app()
    proxy_runner = web.AppRunner(proxy_app)
    await proxy_runner.setup()
    proxy_site = web.TCPSite(proxy_runner, "localhost", 8080)
    await proxy_site.start()
    print("[✓] Proxy server running on http://localhost:8080")

    print("\n[Ready] All systems online. Open http://localhost:3000 for the dashboard.\n")

    # Keep running
    try:
        await asyncio.Future()
    except KeyboardInterrupt:
        pass
    finally:
        ws_server.close()
        await state.close()
        await api_runner.cleanup()
        await proxy_runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
