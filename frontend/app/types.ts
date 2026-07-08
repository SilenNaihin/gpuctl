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

// --- Account usage types ---

export interface UsageItem {
  label: string;
  value: string;
  percent: number | null;
  sub: string;
}

export interface ProviderUsage {
  id: string;
  name: string;
  status: "ok" | "auth_needed" | "error";
  headline: string;
  headline_label: string;
  sub: string;
  percent: number | null;
  error: string;
  items: UsageItem[];
  last_updated: string | null;
}

export interface UsageStatus {
  providers: ProviderUsage[];
}

// --- Slurm types ---

export interface SlurmJob {
  job_id: string;
  name: string;
  user: string;
  account: string;
  state: string;
  node: string;
  gpus: number;
  cpus: number;
  time_elapsed: string;
  time_limit: string;
  submit_time: string;
}

export interface SlurmNode {
  name: string;
  state: string;
  cpus_total: number;
  cpus_alloc: number;
  memory_total_mb: number;
  memory_alloc_mb: number;
  gpus_total: number;
  gpus_alloc: number;
  reason: string;
}

export interface SlurmUser {
  user: string;
  account: string;
  shares: number;
  gpus_running: number;
  jobs_running: number;
  jobs_pending: number;
}

export interface SlurmStatus {
  jobs: SlurmJob[];
  nodes: SlurmNode[];
  users: SlurmUser[];
  total_gpus: number;
  allocated_gpus: number;
  available: boolean;
  error: string;
  last_updated: string;
}
