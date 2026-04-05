import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from gpuctl.collector import Collector, load_config
from gpuctl.models import FleetStatus

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

collector: Collector | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global collector
    config = load_config()
    collector = Collector(config)
    collector.start()
    logger.info("Collector started")
    yield
    collector.stop()
    logger.info("Collector stopped")


app = FastAPI(
    title="gpuctl",
    description="GPU fleet monitoring dashboard backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status", response_model=FleetStatus)
async def get_status() -> FleetStatus:
    assert collector is not None
    return collector.get_fleet_status()


@app.get("/api/history/{host_name}")
async def get_host_history(host_name: str) -> list[dict[str, Any]]:
    assert collector is not None
    history = collector.get_host_history(host_name)
    if not history and host_name not in {
        h["name"] for h in collector._hosts_config
    }:
        raise HTTPException(status_code=404, detail=f"Host '{host_name}' not found")
    return history


@app.get("/api/history")
async def get_all_history() -> dict[str, list[dict[str, Any]]]:
    assert collector is not None
    return collector.get_all_history()


# Mount the Next.js static export as a fallback for the frontend.
# This must be the last route so API routes take precedence.
frontend_path = Path(__file__).resolve().parent.parent / "frontend" / "out"
if frontend_path.is_dir():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
else:
    logger.info(
        "Frontend static files not found at %s — skipping static mount", frontend_path
    )
