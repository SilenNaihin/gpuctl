export interface GPUInfo {
  index: number;
  name: string;
  utilization_gpu: number;
  utilization_memory: number;
  memory_used_mb: number;
  memory_total_mb: number;
  temperature: number;
  power_draw: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  gpu_memory_mb: number;
}

export interface HostStatus {
  name: string;
  ip: string;
  region: string;
  gpu_type: string;
  online: boolean;
  gpus: GPUInfo[];
  processes: ProcessInfo[];
  last_updated: string;
}

export interface FleetStatus {
  hosts: HostStatus[];
  total_gpus: number;
  active_gpus: number;
  total_vram_gb: number;
  used_vram_gb: number;
}

export interface HistoryPoint {
  timestamp: string;
  gpus: GPUInfo[];
}

export type HostHistory = Record<string, HistoryPoint[]>;
