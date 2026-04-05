import asyncio
import logging
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import asyncssh
import yaml

from gpuctl.models import FleetStatus, GPUInfo, HostStatus, ProcessInfo

logger = logging.getLogger(__name__)

GPU_QUERY = (
    "nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,"
    "memory.used,memory.total,temperature.gpu,power.draw "
    "--format=csv,noheader,nounits"
)
PROCESS_QUERY = (
    "nvidia-smi --query-compute-apps=pid,name,used_memory "
    "--format=csv,noheader,nounits"
)

# Rolling history: 1 hour at 5s intervals = 720 data points
MAX_HISTORY = 720


def load_config(config_path: str = "config.yaml") -> dict[str, Any]:
    path = Path(__file__).resolve().parent.parent / config_path
    with open(path) as f:
        return yaml.safe_load(f)


def _parse_gpu_info(csv_output: str) -> list[GPUInfo]:
    gpus: list[GPUInfo] = []
    for line in csv_output.strip().splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 8:
            logger.warning("Skipping malformed GPU line: %s", line)
            continue
        try:
            gpus.append(GPUInfo(
                index=int(parts[0]),
                name=parts[1],
                utilization_gpu=float(parts[2]),
                utilization_memory=float(parts[3]),
                memory_used_mb=float(parts[4]),
                memory_total_mb=float(parts[5]),
                temperature=float(parts[6]),
                power_draw=float(parts[7]),
            ))
        except (ValueError, IndexError) as e:
            logger.warning("Failed to parse GPU line '%s': %s", line, e)
    return gpus


def _parse_process_info(csv_output: str) -> list[ProcessInfo]:
    processes: list[ProcessInfo] = []
    for line in csv_output.strip().splitlines():
        if not line.strip():
            continue
        # nvidia-smi prints a header message when no processes are found
        if "no running" in line.lower():
            break
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 3:
            continue
        try:
            processes.append(ProcessInfo(
                pid=int(parts[0]),
                name=parts[1],
                gpu_memory_mb=float(parts[2]),
            ))
        except (ValueError, IndexError) as e:
            logger.warning("Failed to parse process line '%s': %s", line, e)
    return processes


async def _run_local(cmd: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "bash", "-c", cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Local command failed: {stderr.decode().strip()}")
    return stdout.decode()


async def _run_ssh(
    ip: str,
    cmd: str,
    ssh_user: str,
    ssh_key: str,
) -> str:
    key_path = Path(ssh_key).expanduser()
    async with asyncssh.connect(
        ip,
        username=ssh_user,
        client_keys=[str(key_path)],
        known_hosts=None,
        connect_timeout=10,
    ) as conn:
        result = await conn.run(cmd, check=True, timeout=15)
        return result.stdout or ""


class Collector:
    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config
        self._poll_interval: int = config.get("poll_interval", 5)
        self._ssh_user: str = config["ssh_user"]
        self._ssh_key: str = config["ssh_key"]
        self._hosts_config: list[dict[str, Any]] = config["hosts"]

        # Current status per host
        self._current: dict[str, HostStatus] = {}
        # Rolling history per host: deque of (datetime, list[GPUInfo])
        self._history: dict[str, deque[dict[str, Any]]] = {}

        for host in self._hosts_config:
            name = host["name"]
            self._history[name] = deque(maxlen=MAX_HISTORY)
            self._current[name] = HostStatus(
                name=name,
                ip=host["ip"],
                region=host["region"],
                gpu_type=host["gpu_type"],
                online=False,
            )

        self._task: asyncio.Task[None] | None = None

    async def _poll_host(self, host: dict[str, Any]) -> HostStatus:
        name = host["name"]
        ip = host["ip"]
        is_local = ip in ("localhost", "127.0.0.1")

        try:
            if is_local:
                gpu_csv = await _run_local(GPU_QUERY)
                proc_csv = await _run_local(PROCESS_QUERY)
            else:
                gpu_csv = await _run_ssh(ip, GPU_QUERY, self._ssh_user, self._ssh_key)
                proc_csv = await _run_ssh(ip, PROCESS_QUERY, self._ssh_user, self._ssh_key)

            gpus = _parse_gpu_info(gpu_csv)
            processes = _parse_process_info(proc_csv)
            now = datetime.utcnow()

            status = HostStatus(
                name=name,
                ip=ip,
                region=host["region"],
                gpu_type=host["gpu_type"],
                online=True,
                gpus=gpus,
                processes=processes,
                last_updated=now,
            )

            self._history[name].append({
                "timestamp": now.isoformat(),
                "gpus": [g.model_dump() for g in gpus],
            })

            return status

        except Exception as e:
            logger.warning("Host %s (%s) unreachable: %s", name, ip, e)
            return HostStatus(
                name=name,
                ip=ip,
                region=host["region"],
                gpu_type=host["gpu_type"],
                online=False,
                last_updated=datetime.utcnow(),
            )

    async def _poll_all(self) -> None:
        results = await asyncio.gather(
            *[self._poll_host(h) for h in self._hosts_config],
            return_exceptions=True,
        )
        for host_cfg, result in zip(self._hosts_config, results):
            name = host_cfg["name"]
            if isinstance(result, Exception):
                logger.error("Unexpected error polling %s: %s", name, result)
                self._current[name].online = False
                self._current[name].last_updated = datetime.utcnow()
            else:
                self._current[name] = result

    async def _polling_loop(self) -> None:
        logger.info(
            "Starting collector polling loop (interval=%ds, hosts=%d)",
            self._poll_interval,
            len(self._hosts_config),
        )
        while True:
            try:
                await self._poll_all()
            except Exception:
                logger.exception("Error in polling loop")
            await asyncio.sleep(self._poll_interval)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._polling_loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def get_fleet_status(self) -> FleetStatus:
        hosts = list(self._current.values())
        total_gpus = sum(h["gpus"] for h in self._hosts_config)
        active_gpus = sum(len(h.gpus) for h in hosts if h.online)
        total_vram_gb = sum(
            h["gpus"] * h["vram_gb"] for h in self._hosts_config
        )
        used_vram_gb = sum(
            gpu.memory_used_mb / 1024.0
            for h in hosts if h.online
            for gpu in h.gpus
        )
        return FleetStatus(
            hosts=hosts,
            total_gpus=total_gpus,
            active_gpus=active_gpus,
            total_vram_gb=total_vram_gb,
            used_vram_gb=round(used_vram_gb, 2),
        )

    def get_host_history(self, host_name: str) -> list[dict[str, Any]]:
        if host_name not in self._history:
            return []
        return list(self._history[host_name])

    def get_all_history(self) -> dict[str, list[dict[str, Any]]]:
        return {name: list(dq) for name, dq in self._history.items()}
