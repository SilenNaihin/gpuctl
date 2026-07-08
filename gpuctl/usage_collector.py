"""Account usage collectors for model-provider accounts.

Polls Anthropic, Codex (ChatGPT), Azure, and AWS Bedrock for spend /
quota information and caches the results for the dashboard.

Notes on data sources:
- Anthropic: the Admin API (sk-ant-admin... key) is required for the
  org cost report. A regular API key can only prove it is valid.
- Codex: uses the ChatGPT OAuth tokens from ~/.codex/auth.json and the
  same usage endpoint the Codex CLI's /status command uses. Refreshed
  tokens are persisted back so the CLI login keeps working.
- Azure: Cost Management query API via `az rest`. This API throttles
  aggressively (429s with multi-minute windows), so results are cached
  and failures fall back to the last good snapshot.
- Bedrock: Cost Explorer via the `aws` CLI. AWS charges $0.01 per
  GetCostAndUsage request, hence the long default poll interval.
"""

import asyncio
import base64
import json
import logging
import os
import re
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from gpuctl.models import ProviderUsage, UsageItem, UsageStatus

logger = logging.getLogger(__name__)

CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token"
CODEX_USAGE_URL = "https://chatgpt.com/backend-api/codex/usage"
ANTHROPIC_API = "https://api.anthropic.com"
AZURE_MGMT = "https://management.azure.com"


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _fmt_usd(amount: float) -> str:
    if abs(amount) < 0.005:
        amount = 0.0
    return f"${amount:,.2f}"


def _fmt_reset(seconds: float | None) -> str:
    if seconds is None:
        return ""
    seconds = max(0, int(seconds))
    if seconds < 3600:
        return f"resets in {seconds // 60}m"
    if seconds < 86400:
        return f"resets in {seconds // 3600}h {(seconds % 3600) // 60}m"
    return f"resets in {seconds // 86400}d {(seconds % 86400) // 3600}h"


async def _urllib_json(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    """GET/POST JSON via urllib in a thread.

    chatgpt.com's Cloudflare config 403s httpx regardless of headers but
    accepts urllib, so the Codex endpoints go through here.
    """
    def _do() -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    return await asyncio.to_thread(_do)


async def _run_cli(*args: str, timeout: float = 60) -> str:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"{args[0]} timed out after {timeout}s")
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode().strip()[:300] or f"{args[0]} failed")
    return stdout.decode()


class UsageProvider:
    id: str = ""
    name: str = ""
    poll_interval: float = 1800

    async def fetch(self) -> ProviderUsage:
        raise NotImplementedError


# --- Anthropic ---

class AnthropicProvider(UsageProvider):
    id = "claude"
    name = "Claude"

    def __init__(self, config: dict[str, Any]) -> None:
        self.poll_interval = config.get("poll_interval_minutes", 30) * 60

    @staticmethod
    def _api_key() -> str | None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if key:
            return key
        zshrc = Path.home() / ".zshrc"
        if zshrc.exists():
            m = re.search(
                r'^\s*export ANTHROPIC_API_KEY="?([^"\s]+)"?',
                zshrc.read_text(),
                re.MULTILINE,
            )
            if m:
                return m.group(1)
        return None

    @staticmethod
    def _admin_key() -> str | None:
        key = os.environ.get("ANTHROPIC_ADMIN_KEY")
        if key:
            return key
        zshrc = Path.home() / ".zshrc"
        if zshrc.exists():
            m = re.search(
                r'^\s*export ANTHROPIC_ADMIN_KEY="?([^"\s]+)"?',
                zshrc.read_text(),
                re.MULTILINE,
            )
            if m:
                return m.group(1)
        return None

    async def fetch(self) -> ProviderUsage:
        admin_key = self._admin_key()
        if admin_key:
            return await self._fetch_admin(admin_key)

        api_key = self._api_key()
        if not api_key:
            return ProviderUsage(
                id=self.id, name=self.name, status="error",
                headline_label="no API key found",
                error="ANTHROPIC_API_KEY not set in env or ~/.zshrc",
                last_updated=datetime.now(timezone.utc),
            )

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{ANTHROPIC_API}/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            )
        valid = resp.status_code == 200
        return ProviderUsage(
            id=self.id, name=self.name,
            status="auth_needed" if valid else "error",
            headline="✓" if valid else "✗",
            headline_label="API key valid" if valid else "API key invalid",
            sub="admin key needed for spend",
            error="" if valid else f"HTTP {resp.status_code} from /v1/models",
            items=[
                UsageItem(
                    label="Spend & usage reporting",
                    value="unavailable",
                    sub="Create an Admin API key (sk-ant-admin…) in the Anthropic "
                        "Console → Settings → API keys, then export "
                        "ANTHROPIC_ADMIN_KEY in ~/.zshrc and restart gpuctl.",
                ),
                UsageItem(
                    label="Credit balance",
                    value="console only",
                    sub="Anthropic does not expose remaining credit via API; "
                        "see console.anthropic.com → Billing.",
                ),
            ],
            last_updated=datetime.now(timezone.utc),
        )

    async def _fetch_admin(self, admin_key: str) -> ProviderUsage:
        headers = {"x-api-key": admin_key, "anthropic-version": "2023-06-01"}
        starting_at = _month_start().strftime("%Y-%m-%dT%H:%M:%SZ")
        total = 0.0
        items: list[UsageItem] = []

        async with httpx.AsyncClient(timeout=30) as client:
            # Month-to-date cost, paginated daily buckets.
            # `amount` is a decimal string in CENTS ("123.45" == $1.23).
            page: str | None = None
            while True:
                params: dict[str, Any] = {"starting_at": starting_at, "limit": 31}
                if page:
                    params["page"] = page
                resp = await client.get(
                    f"{ANTHROPIC_API}/v1/organizations/cost_report",
                    headers=headers, params=params,
                )
                resp.raise_for_status()
                body = resp.json()
                for bucket in body.get("data", []):
                    for result in bucket.get("results", []):
                        try:
                            total += float(result.get("amount", 0)) / 100.0
                        except (TypeError, ValueError):
                            pass
                if body.get("has_more") and body.get("next_page"):
                    page = body["next_page"]
                else:
                    break

            # Token usage by model for the expansion view
            resp = await client.get(
                f"{ANTHROPIC_API}/v1/organizations/usage_report/messages",
                headers=headers,
                params={
                    "starting_at": starting_at,
                    "bucket_width": "1d",
                    "group_by[]": "model",
                    "limit": 31,
                },
            )
            if resp.status_code == 200:
                by_model: dict[str, dict[str, float]] = {}
                for bucket in resp.json().get("data", []):
                    for r in bucket.get("results", []):
                        model = r.get("model") or "unknown"
                        agg = by_model.setdefault(model, {"in": 0, "out": 0})
                        agg["in"] += (
                            r.get("uncached_input_tokens", 0)
                            + r.get("cache_creation_input_tokens", 0)
                            + r.get("cache_read_input_tokens", 0)
                        )
                        agg["out"] += r.get("output_tokens", 0)
                for model, agg in sorted(
                    by_model.items(), key=lambda kv: -(kv[1]["in"] + kv[1]["out"])
                )[:6]:
                    items.append(UsageItem(
                        label=model,
                        value=f"{agg['in'] / 1e6:.1f}M in / {agg['out'] / 1e6:.1f}M out",
                        sub="tokens this month",
                    ))

        items.append(UsageItem(
            label="Credit balance", value="console only",
            sub="not exposed via API — console.anthropic.com → Billing",
        ))
        return ProviderUsage(
            id=self.id, name=self.name, status="ok",
            headline=_fmt_usd(total),
            headline_label="API spend this month",
            items=items,
            last_updated=datetime.now(timezone.utc),
        )


# --- OpenAI (Codex rate limits + platform API spend) ---

class OpenAIProvider(UsageProvider):
    id = "openai"
    name = "OpenAI"

    def __init__(self, config: dict[str, Any]) -> None:
        self.poll_interval = config.get("poll_interval_minutes", 30) * 60
        self.auth_path = Path(
            config.get("codex_auth_path", "~/.codex/auth.json")
        ).expanduser()

    @staticmethod
    def _jwt_exp(token: str) -> float:
        try:
            payload = token.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            return float(json.loads(base64.urlsafe_b64decode(payload)).get("exp", 0))
        except Exception:
            return 0

    def _persist(self, auth: dict[str, Any]) -> None:
        fd, tmp = tempfile.mkstemp(dir=str(self.auth_path.parent))
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(auth, f, indent=2)
            os.replace(tmp, self.auth_path)
        except BaseException:
            os.unlink(tmp)
            raise

    async def _access_token(self) -> tuple[str, str]:
        auth = json.loads(self.auth_path.read_text())
        tokens = auth["tokens"]
        access = tokens["access_token"]
        account_id = tokens.get("account_id", "")

        # Refresh when within 10 minutes of expiry
        if self._jwt_exp(access) - time.time() < 600:
            fresh = await _urllib_json(
                CODEX_TOKEN_URL,
                headers={"Content-Type": "application/json"},
                body={
                    "client_id": CODEX_OAUTH_CLIENT_ID,
                    "grant_type": "refresh_token",
                    "refresh_token": tokens["refresh_token"],
                    "scope": "openid profile email",
                },
            )
            tokens["access_token"] = access = fresh["access_token"]
            if fresh.get("id_token"):
                tokens["id_token"] = fresh["id_token"]
            # Refresh tokens rotate — persist or the CLI login breaks
            if fresh.get("refresh_token"):
                tokens["refresh_token"] = fresh["refresh_token"]
            auth["last_refresh"] = (
                datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            )
            self._persist(auth)
            logger.info("Refreshed Codex OAuth tokens")
        return access, account_id

    @staticmethod
    def _window_item(window: dict[str, Any] | None, label: str) -> UsageItem | None:
        if not window:
            return None
        secs = window.get("limit_window_seconds") or 0
        if secs >= 6 * 86400:
            name = "Weekly limit"
        elif secs >= 3600:
            name = f"{secs // 3600}h limit"
        else:
            name = label
        pct = float(window.get("used_percent") or 0)
        return UsageItem(
            label=name,
            value=f"{pct:.0f}% used",
            percent=pct,
            sub=_fmt_reset(window.get("reset_after_seconds")),
        )

    async def _api_spend_item(self) -> UsageItem:
        """Platform API spend (separate from the Codex/ChatGPT plan).

        Stubbed while the OpenAI platform account is deactivated. When it's
        reactivated, export OPENAI_ADMIN_KEY (a key with the api.usage.read
        scope) and this fills in automatically on the next poll.
        """
        admin_key = os.environ.get("OPENAI_ADMIN_KEY")
        if not admin_key:
            return UsageItem(
                label="Platform API spend",
                value="—",
                sub="account deactivated — set OPENAI_ADMIN_KEY once reactivated",
            )
        start = int(_month_start().timestamp())
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                total = 0.0
                page: str | None = None
                while True:
                    params: dict[str, Any] = {"start_time": start, "limit": 31}
                    if page:
                        params["page"] = page
                    resp = await client.get(
                        "https://api.openai.com/v1/organization/costs",
                        headers={"Authorization": f"Bearer {admin_key}"},
                        params=params,
                    )
                    resp.raise_for_status()
                    body = resp.json()
                    for bucket in body.get("data", []):
                        for r in bucket.get("results", []):
                            total += float((r.get("amount") or {}).get("value", 0))
                    if body.get("has_more") and body.get("next_page"):
                        page = body["next_page"]
                    else:
                        break
            return UsageItem(
                label="Platform API spend", value=_fmt_usd(total), sub="this month",
            )
        except Exception as e:
            return UsageItem(
                label="Platform API spend", value="unavailable", sub=str(e)[:120],
            )

    async def fetch(self) -> ProviderUsage:
        if not self.auth_path.exists():
            return ProviderUsage(
                id=self.id, name=self.name, status="auth_needed",
                headline_label="not logged in",
                error=f"{self.auth_path} not found — run `codex login`",
                items=[await self._api_spend_item()],
                last_updated=datetime.now(timezone.utc),
            )
        access, account_id = await self._access_token()
        headers = {
            "Authorization": f"Bearer {access}",
            "chatgpt-account-id": account_id,
            "User-Agent": "codex-cli",
            # Cloudflare 403s requests without Accept headers from some
            # (e.g. Azure datacenter) egress IPs
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        }
        # chatgpt.com rate-limits this endpoint to roughly one request
        # per minute per account and answers bursts with 403
        for attempt in range(3):
            try:
                data = await _urllib_json(CODEX_USAGE_URL, headers=headers)
                break
            except urllib.error.HTTPError as e:
                if e.code not in (403, 429) or attempt == 2:
                    raise
                await asyncio.sleep(45)

        rate = data.get("rate_limit", {})
        items = [
            i for i in (
                self._window_item(rate.get("primary_window"), "session"),
                self._window_item(rate.get("secondary_window"), "long window"),
            ) if i
        ]
        primary_pct = float(
            (rate.get("primary_window") or {}).get("used_percent") or 0
        )
        plan = data.get("plan_type", "?")
        credits = data.get("credits") or {}
        if credits.get("balance") is not None:
            items.append(UsageItem(
                label="Flex credits", value=str(credits["balance"]), sub="remaining",
            ))
        items.append(await self._api_spend_item())
        return ProviderUsage(
            id=self.id, name=self.name,
            status="error" if rate.get("limit_reached") else "ok",
            headline=f"{primary_pct:.0f}%",
            headline_label="of Codex 5h limit used",
            sub=f"Codex · ChatGPT {plan}",
            items=items,
            last_updated=datetime.now(timezone.utc),
        )


# --- Azure ---

SPONSORSHIP_HISTORY = Path.home() / ".gpuctl" / "sponsorship_history.json"
SPONSORSHIP_PORTAL = "https://www.microsoftazuresponsorships.com"


class AzureProvider(UsageProvider):
    id = "azure"
    name = "Azure"

    def __init__(self, config: dict[str, Any]) -> None:
        self.poll_interval = config.get("azure_poll_interval_minutes", 60) * 60
        self.subscriptions: list[dict[str, str]] = config.get("azure_subscriptions", [])
        # Legacy Azure Sponsorship balances are invisible to every ARM API
        # (Cost Management and usageDetails return nothing for the sub) —
        # the balance only exists on microsoftazuresponsorships.com. It is
        # entered manually in config; each distinct (as_of, remaining) pair is
        # recorded to SPONSORSHIP_HISTORY so a drain rate can be derived, and
        # an optional portal cookie enables automatic balance refresh.
        self.sponsorship: dict[str, Any] = config.get("azure_sponsorship") or {}

    # -- sponsorship balance tracking --

    @staticmethod
    def _load_history() -> list[dict[str, Any]]:
        try:
            return json.loads(SPONSORSHIP_HISTORY.read_text())
        except (OSError, ValueError):
            return []

    @staticmethod
    def _record_balance(as_of: str, remaining: float) -> None:
        history = AzureProvider._load_history()
        if any(h["as_of"] == as_of for h in history):
            return
        history.append({"as_of": as_of, "remaining": remaining})
        history.sort(key=lambda h: h["as_of"])
        SPONSORSHIP_HISTORY.parent.mkdir(parents=True, exist_ok=True)
        SPONSORSHIP_HISTORY.write_text(json.dumps(history, indent=1))

    async def _fetch_portal_balance(self) -> float | None:
        """Best-effort scrape of the sponsorship portal balance.

        Works only while a pasted browser session cookie is valid; the portal
        has no API and no headless auth. Returns None on any failure.
        """
        cookie = (
            os.environ.get("AZURE_SPONSORSHIP_COOKIE")
            or self.sponsorship.get("portal_cookie")
        )
        if not cookie:
            return None

        def _do() -> float | None:
            req = urllib.request.Request(
                f"{SPONSORSHIP_PORTAL}/Usage",
                headers={"Cookie": cookie, "User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                if "login" in resp.url.lower():
                    return None  # cookie expired, bounced to sign-in
                html = resp.read().decode(errors="replace")
            m = re.search(
                r"REMAINING[^0-9]{0,200}?([\d][\d,]*(?:\.\d+)?)",
                html, re.IGNORECASE | re.DOTALL,
            )
            return float(m.group(1).replace(",", "")) if m else None

        try:
            return await asyncio.to_thread(_do)
        except Exception as e:
            logger.warning("Sponsorship portal fetch failed: %s", e)
            return None

    def _sponsorship_estimate(
        self, remaining: float, as_of: str
    ) -> tuple[float | None, float | None]:
        """Returns (drain_per_day, projected_remaining_today)."""
        drain: float | None = None
        history = self._load_history()
        if len(history) >= 2:
            first, last = history[0], history[-1]
            days = (
                datetime.fromisoformat(last["as_of"])
                - datetime.fromisoformat(first["as_of"])
            ).days
            if days > 0:
                drain = (first["remaining"] - last["remaining"]) / days
        if drain is None and self.sponsorship.get("used") and \
                self.sponsorship.get("offer_start"):
            days = (
                datetime.fromisoformat(as_of)
                - datetime.fromisoformat(str(self.sponsorship["offer_start"]))
            ).days
            if days > 0:
                drain = float(self.sponsorship["used"]) / days
        if drain is None or drain <= 0:
            return drain, None
        days_stale = (
            datetime.now(timezone.utc)
            - datetime.fromisoformat(as_of).replace(tzinfo=timezone.utc)
        ).days
        return drain, remaining - drain * days_stale

    async def _query_sub(
        self, sub: dict[str, str]
    ) -> tuple[float, float, list[UsageItem]]:
        """Returns (mtd_total, avg_daily_burn, top_service_items)."""
        url = (
            f"{AZURE_MGMT}/subscriptions/{sub['id']}"
            f"/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
        )
        body = json.dumps({
            "type": "ActualCost",
            "timeframe": "MonthToDate",
            "dataset": {
                "granularity": "Daily",
                "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
                "grouping": [{"type": "Dimension", "name": "ServiceName"}],
            },
        })
        out = await _run_cli(
            "az", "rest", "--method", "post", "--url", url, "--body", body,
            timeout=90,
        )
        result = json.loads(out)
        cols = [c["name"] for c in result["properties"]["columns"]]
        cost_i, svc_i = cols.index("Cost"), cols.index("ServiceName")
        rows = result["properties"]["rows"]
        total = sum(r[cost_i] for r in rows)
        by_service: dict[str, float] = {}
        for r in rows:
            by_service[r[svc_i]] = by_service.get(r[svc_i], 0) + r[cost_i]
        days_elapsed = max(1, datetime.now(timezone.utc).day)
        items = [
            UsageItem(
                label=f"{sub['name']} · {svc}",
                value=_fmt_usd(cost),
                sub="this month",
            )
            for svc, cost in sorted(by_service.items(), key=lambda x: -x[1])[:4]
            if cost >= 0.01
        ]
        return total, total / days_elapsed, items

    async def fetch(self) -> ProviderUsage:
        total = 0.0
        burn = 0.0
        items: list[UsageItem] = []
        errors: list[str] = []

        # Resolve the sponsorship balance: live portal scrape if a cookie is
        # configured, otherwise the manually entered config value.
        remaining: float | None = None
        as_of = str(self.sponsorship.get("as_of", ""))
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        portal_balance = await self._fetch_portal_balance()
        if portal_balance is not None:
            remaining, as_of = portal_balance, today
        elif self.sponsorship.get("remaining") is not None:
            remaining = float(self.sponsorship["remaining"])
        if remaining is not None and as_of:
            self._record_balance(as_of, remaining)

        drain: float | None = None
        projected: float | None = None
        if remaining is not None:
            drain, projected = self._sponsorship_estimate(remaining, as_of)
            items.append(UsageItem(
                label="Sponsorship credits left",
                value=_fmt_usd(remaining),
                percent=(
                    100 * (1 - remaining / float(self.sponsorship["total"]))
                    if self.sponsorship.get("total") else None
                ),
                sub=(
                    f"live from portal ({today})" if portal_balance is not None
                    else f"as of {as_of} — update config from "
                         "microsoftazuresponsorships.com (no API)"
                ),
            ))
            if drain:
                depleted = (
                    datetime.now(timezone.utc)
                    + timedelta(days=(projected or remaining) / drain)
                ).strftime("%b %Y")
                items.append(UsageItem(
                    label="Sponsorship drain",
                    value=f"{_fmt_usd(drain)}/day",
                    sub=f"≈ {_fmt_usd(drain * 30)}/month — depleted around "
                        f"{depleted} at this rate",
                ))

        for i, sub in enumerate(self.subscriptions):
            if i:
                # Cost Management throttles hard; space out the calls
                await asyncio.sleep(20)
            try:
                sub_total, sub_burn, sub_items = await self._query_sub(sub)
                total += sub_total
                burn += sub_burn
                note = "subscription total this month"
                if sub_total < 0.005 and sub.get("sponsorship"):
                    note = ("sponsorship usage is not reported through the "
                            "Azure cost APIs — see the sponsorship portal")
                items.append(UsageItem(
                    label=sub["name"], value=_fmt_usd(sub_total), sub=note,
                ))
                items.extend(sub_items)
            except Exception as e:
                errors.append(f"{sub['name']}: {e}")

        if burn >= 0.01:
            items.append(UsageItem(
                label="Burn rate", value=f"{_fmt_usd(burn)}/day",
                sub="average this month (API-visible spend only)",
            ))

        if errors and not items:
            throttled = any("429" in e for e in errors)
            return ProviderUsage(
                id=self.id, name=self.name, status="error",
                headline_label="throttled by Azure" if throttled else "query failed",
                error="; ".join(errors)[:300],
                last_updated=datetime.now(timezone.utc),
            )

        if remaining is not None:
            # Show the drain-projected balance when the manual entry is stale
            if projected is not None and projected < remaining:
                headline = _fmt_usd(projected)
                headline_label = "credits left (est.)"
                sub_text = f"est. from {as_of}"
            else:
                headline = _fmt_usd(remaining)
                headline_label = "credits left"
                sub_text = f"as of {as_of}"
        else:
            headline = _fmt_usd(total)
            headline_label = "spend this month"
            sub_text = f"{len(self.subscriptions)} subscriptions"
        return ProviderUsage(
            id=self.id, name=self.name, status="ok",
            headline=headline,
            headline_label=headline_label,
            sub=sub_text,
            error="; ".join(errors)[:300],
            items=items,
            last_updated=datetime.now(timezone.utc),
        )


# --- AWS Bedrock ---

class BedrockProvider(UsageProvider):
    id = "bedrock"
    name = "Bedrock"

    def __init__(self, config: dict[str, Any]) -> None:
        # Cost Explorer charges $0.01/request — keep this interval long
        self.poll_interval = config.get("bedrock_poll_interval_minutes", 180) * 60
        self.profiles: list[dict[str, str]] = config.get("bedrock_profiles", [])

    @staticmethod
    def _is_bedrock(service: str) -> bool:
        s = service.lower()
        return "bedrock" in s or "claude" in s

    async def _query_account(
        self, account: dict[str, str]
    ) -> tuple[float, float, float, list[UsageItem]]:
        """Returns (bedrock_usage, account_usage, credits_applied, items).

        Both accounts run on AWS credits, so unfiltered UnblendedCost nets to
        ~$0 (usage offset by negative Credit records). Gross usage requires
        excluding Credit/Refund record types.
        """
        start = _month_start().strftime("%Y-%m-%d")
        end = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        period = f"Start={start},End={end}"

        usage_out, record_out = await asyncio.gather(
            _run_cli(
                "aws", "ce", "get-cost-and-usage",
                "--profile", account["profile"],
                "--time-period", period,
                "--granularity", "MONTHLY",
                "--metrics", "UnblendedCost",
                "--group-by", "Type=DIMENSION,Key=SERVICE",
                "--filter",
                '{"Not":{"Dimensions":{"Key":"RECORD_TYPE",'
                '"Values":["Credit","Refund"]}}}',
                "--output", "json",
                timeout=90,
            ),
            _run_cli(
                "aws", "ce", "get-cost-and-usage",
                "--profile", account["profile"],
                "--time-period", period,
                "--granularity", "MONTHLY",
                "--metrics", "UnblendedCost",
                "--group-by", "Type=DIMENSION,Key=RECORD_TYPE",
                "--output", "json",
                timeout=90,
            ),
        )

        groups = json.loads(usage_out)["ResultsByTime"][0].get("Groups", [])
        costs = [
            (g["Keys"][0], float(g["Metrics"]["UnblendedCost"]["Amount"]))
            for g in groups
        ]
        account_total = sum(c for _, c in costs)
        bedrock_total = sum(c for svc, c in costs if self._is_bedrock(svc))

        credits_applied = 0.0
        for g in json.loads(record_out)["ResultsByTime"][0].get("Groups", []):
            if g["Keys"][0] == "Credit":
                credits_applied = -float(g["Metrics"]["UnblendedCost"]["Amount"])

        items = [
            UsageItem(
                label=f"{account['name']} · {svc}",
                value=_fmt_usd(cost),
                sub="this month",
            )
            for svc, cost in sorted(costs, key=lambda x: -x[1])
            if self._is_bedrock(svc) and cost >= 0.01
        ][:4]
        return bedrock_total, account_total, credits_applied, items

    async def fetch(self) -> ProviderUsage:
        bedrock_total = 0.0
        items: list[UsageItem] = []
        errors: list[str] = []
        results = await asyncio.gather(
            *[self._query_account(a) for a in self.profiles],
            return_exceptions=True,
        )
        for account, result in zip(self.profiles, results):
            if isinstance(result, BaseException):
                errors.append(f"{account['name']}: {result}")
                continue
            b_total, a_total, credits, a_items = result
            bedrock_total += b_total
            items.append(UsageItem(
                label=account["name"],
                value=f"{_fmt_usd(b_total)} Bedrock",
                sub=f"account usage {_fmt_usd(a_total)} this month",
            ))
            items.extend(a_items)
            if credits >= 0.01:
                items.append(UsageItem(
                    label=f"{account['name']} · AWS credits applied",
                    value=_fmt_usd(credits),
                    sub="credits consumed this month (balance is console-only)",
                ))

        if errors and not items:
            return ProviderUsage(
                id=self.id, name=self.name, status="error",
                headline_label="Cost Explorer query failed",
                error="; ".join(errors)[:300],
                last_updated=datetime.now(timezone.utc),
            )
        return ProviderUsage(
            id=self.id, name=self.name, status="ok",
            headline=_fmt_usd(bedrock_total),
            headline_label="Bedrock usage this month",
            sub=" + ".join(a["name"] for a in self.profiles),
            error="; ".join(errors)[:300],
            items=items,
            last_updated=datetime.now(timezone.utc),
        )


# --- Collector ---

class UsageCollector:
    def __init__(self, config: dict[str, Any]) -> None:
        usage_cfg = config.get("usage", {})
        self._providers: list[UsageProvider] = [
            AnthropicProvider(usage_cfg),
            OpenAIProvider(usage_cfg),
            AzureProvider(usage_cfg),
            BedrockProvider(usage_cfg),
        ]
        self._cache: dict[str, ProviderUsage] = {}
        self._next_poll: dict[str, float] = {p.id: 0 for p in self._providers}
        self._task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()

    async def _poll_provider(self, provider: UsageProvider) -> None:
        try:
            result = await provider.fetch()
        except Exception as e:
            logger.warning("Usage poll failed for %s: %s", provider.id, e)
            previous = self._cache.get(provider.id)
            if previous is not None:
                return  # keep last good snapshot
            result = ProviderUsage(
                id=provider.id, name=provider.name, status="error",
                headline_label="fetch failed", error=str(e)[:300],
                last_updated=datetime.now(timezone.utc),
            )
        self._cache[provider.id] = result

    async def _loop(self) -> None:
        while True:
            now = time.monotonic()
            due = [p for p in self._providers if self._next_poll[p.id] <= now]
            if due:
                await asyncio.gather(*[self._poll_provider(p) for p in due])
                for p in due:
                    self._next_poll[p.id] = time.monotonic() + p.poll_interval
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=60)
                self._wake.clear()
            except asyncio.TimeoutError:
                pass

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def refresh_now(self) -> None:
        for pid in self._next_poll:
            self._next_poll[pid] = 0
        self._wake.set()

    def get_status(self) -> UsageStatus:
        order = [p.id for p in self._providers]
        return UsageStatus(providers=[
            self._cache[pid] for pid in order if pid in self._cache
        ])
