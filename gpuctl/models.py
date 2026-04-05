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
