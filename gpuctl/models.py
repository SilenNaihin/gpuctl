from datetime import datetime

from pydantic import BaseModel, Field


class GPUInfo(BaseModel):
    index: int
    name: str
    utilization_gpu: float = Field(description="GPU utilization percentage")
    utilization_memory: float = Field(description="Memory utilization percentage")
    memory_used_mb: float
    memory_total_mb: float
    temperature: float
    power_draw: float


class ProcessInfo(BaseModel):
    pid: int
    name: str
    gpu_memory_mb: float


class HostStatus(BaseModel):
    name: str
    ip: str
    region: str
    gpu_type: str
    online: bool
    gpus: list[GPUInfo] = Field(default_factory=list)
    processes: list[ProcessInfo] = Field(default_factory=list)
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class FleetStatus(BaseModel):
    hosts: list[HostStatus]
    total_gpus: int
    active_gpus: int
    total_vram_gb: float
    used_vram_gb: float


# --- Slurm models ---

class SlurmJob(BaseModel):
    job_id: str
    name: str
    user: str
    account: str
    state: str
    node: str
    gpus: int
    cpus: int
    time_elapsed: str
    time_limit: str
    submit_time: str


class SlurmNode(BaseModel):
    name: str
    state: str
    cpus_total: int
    cpus_alloc: int
    memory_total_mb: int
    memory_alloc_mb: int
    gpus_total: int
    gpus_alloc: int
    reason: str


class SlurmUser(BaseModel):
    user: str
    account: str
    shares: int
    gpus_running: int
    jobs_running: int
    jobs_pending: int


class SlurmStatus(BaseModel):
    jobs: list[SlurmJob] = Field(default_factory=list)
    nodes: list[SlurmNode] = Field(default_factory=list)
    users: list[SlurmUser] = Field(default_factory=list)
    total_gpus: int = 0
    allocated_gpus: int = 0
    available: bool = True
    error: str = ""
    last_updated: datetime = Field(default_factory=datetime.utcnow)
