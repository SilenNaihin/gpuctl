import asyncio
import logging
import re
from datetime import datetime
from typing import Any

from gpuctl.models import SlurmJob, SlurmNode, SlurmStatus, SlurmUser

logger = logging.getLogger(__name__)

# Slurm polling interval (seconds)
SLURM_POLL_INTERVAL = 10


async def _run_local(cmd: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "bash", "-c", cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {stderr.decode().strip()}")
    return stdout.decode()


def _parse_squeue(output: str) -> list[SlurmJob]:
    """Parse squeue output with '|' delimiter."""
    jobs: list[SlurmJob] = []
    for line in output.strip().splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 10:
            continue
        try:
            # Parse GRES to get GPU count
            gres = parts[6]
            gpu_count = 0
            if gres and gres != "(null)":
                m = re.search(r"gpu[^:]*:(\d+)", gres)
                if m:
                    gpu_count = int(m.group(1))

            jobs.append(SlurmJob(
                job_id=parts[0],
                name=parts[1],
                user=parts[2],
                account=parts[3],
                state=parts[4],
                node=parts[5] if parts[5] else "(pending)",
                gpus=gpu_count,
                cpus=int(parts[7]) if parts[7].isdigit() else 0,
                time_elapsed=parts[8],
                time_limit=parts[9],
                submit_time=parts[10] if len(parts) > 10 else "",
            ))
        except (ValueError, IndexError) as e:
            logger.warning("Failed to parse squeue line '%s': %s", line, e)
    return jobs


def _parse_sinfo(output: str) -> list[SlurmNode]:
    """Parse sinfo output: %N|%T|%c|%C|%m|%G|%E

    %C is A/I/O/T (alloc/idle/other/total) for CPUs.
    %G is GRES config like gpu:h100:8.
    """
    nodes: list[SlurmNode] = []
    for line in output.strip().splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 7:
            continue
        try:
            # Parse %C (A/I/O/T)
            cpus_parts = parts[3].split("/")
            cpus_alloc = int(cpus_parts[0]) if len(cpus_parts) >= 1 else 0
            cpus_total = int(parts[2]) if parts[2].isdigit() else 0

            # Parse GRES for total GPUs (e.g., gpu:h100:8)
            gres = parts[5]
            gpus_total = 0
            if gres and gres != "(null)":
                m = re.search(r":(\d+)$", gres)
                if m:
                    gpus_total = int(m.group(1))

            reason = parts[6] if len(parts) > 6 else ""

            nodes.append(SlurmNode(
                name=parts[0],
                state=parts[1],
                cpus_total=cpus_total,
                cpus_alloc=cpus_alloc,
                memory_total_mb=int(parts[4]) if parts[4].isdigit() else 0,
                memory_alloc_mb=0,
                gpus_total=gpus_total,
                gpus_alloc=0,  # computed from job queue below
                reason=reason,
            ))
        except (ValueError, IndexError) as e:
            logger.warning("Failed to parse sinfo line '%s': %s", line, e)
    return nodes


def _parse_sacctmgr(output: str) -> list[dict[str, Any]]:
    """Parse sacctmgr output with '|' delimiter."""
    users: list[dict[str, Any]] = []
    for line in output.strip().splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3:
            continue
        try:
            users.append({
                "user": parts[0],
                "account": parts[1],
                "shares": int(parts[2]) if parts[2].isdigit() else 1,
            })
        except (ValueError, IndexError):
            continue
    return users


class SlurmCollector:
    """Collects Slurm cluster state by running commands locally on the controller."""

    def __init__(self) -> None:
        self._current = SlurmStatus()
        self._task: asyncio.Task[None] | None = None

    async def _poll(self) -> SlurmStatus:
        try:
            squeue_out, sinfo_out, sacctmgr_out = await asyncio.gather(
                _run_local(
                    "squeue --noheader "
                    "--format='%i|%j|%u|%a|%T|%N|%b|%C|%M|%l|%V'"
                ),
                _run_local(
                    "sinfo --noheader --Node "
                    "--format='%N|%T|%c|%C|%m|%G|%E'"
                ),
                _run_local(
                    "sacctmgr --noheader --parsable2 show assoc "
                    "format=User,Account,Share where user=kion,silen,barak"
                ),
            )

            jobs = _parse_squeue(squeue_out)
            nodes = _parse_sinfo(sinfo_out)
            user_data = _parse_sacctmgr(sacctmgr_out)

            # Build user stats from jobs
            user_stats: dict[str, SlurmUser] = {}
            for ud in user_data:
                user_stats[ud["user"]] = SlurmUser(
                    user=ud["user"],
                    account=ud["account"],
                    shares=ud["shares"],
                    gpus_running=0,
                    jobs_running=0,
                    jobs_pending=0,
                )
            for job in jobs:
                u = user_stats.get(job.user)
                if not u:
                    u = SlurmUser(
                        user=job.user, account=job.account, shares=0,
                        gpus_running=0, jobs_running=0, jobs_pending=0,
                    )
                    user_stats[job.user] = u
                if job.state == "RUNNING":
                    u.gpus_running += job.gpus
                    u.jobs_running += 1
                elif job.state == "PENDING":
                    u.jobs_pending += 1

            # Compute per-node GPU allocation from running jobs
            node_gpu_alloc: dict[str, int] = {}
            for job in jobs:
                if job.state == "RUNNING" and job.node != "(pending)":
                    node_gpu_alloc[job.node] = node_gpu_alloc.get(job.node, 0) + job.gpus
            for node in nodes:
                node.gpus_alloc = node_gpu_alloc.get(node.name, 0)

            total_gpus = sum(n.gpus_total for n in nodes)
            alloc_gpus = sum(n.gpus_alloc for n in nodes)

            return SlurmStatus(
                jobs=jobs,
                nodes=nodes,
                users=list(user_stats.values()),
                total_gpus=total_gpus,
                allocated_gpus=alloc_gpus,
                available=True,
                last_updated=datetime.utcnow(),
            )

        except Exception as e:
            logger.warning("Slurm poll failed: %s", e)
            return SlurmStatus(
                available=False,
                error=str(e),
                last_updated=datetime.utcnow(),
            )

    async def _polling_loop(self) -> None:
        logger.info("Starting Slurm collector (interval=%ds)", SLURM_POLL_INTERVAL)
        while True:
            try:
                self._current = await self._poll()
            except Exception:
                logger.exception("Error in Slurm polling loop")
            await asyncio.sleep(SLURM_POLL_INTERVAL)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._polling_loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def get_status(self) -> SlurmStatus:
        return self._current
