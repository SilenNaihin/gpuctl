# gpuctl

Real-time GPU fleet monitoring dashboard. Polls `nvidia-smi` across multiple VMs via SSH and serves a live web UI.

## Architecture

- **Backend**: FastAPI + asyncssh. Connects to each GPU VM every 5s, collects GPU utilization, memory, temperature, power, and running processes.
- **Frontend**: Next.js + Tailwind CSS. Fleet overview stats, per-host GPU bars, process lists, and utilization sparklines.
- **Head node**: Runs on a central VM with SSH access to all GPU nodes. Zero agent install required on worker nodes.

## Fleet

| Host | GPUs | VRAM | Region |
|------|------|------|--------|
| h100-dev-box | 2x H100 NVL | 96 GB each | westus2 |
| h100-dev-box-3 | 2x H100 | 80 GB each | westus3 |
| h100-dev-box-4 | 2x H100 | 80 GB each | westus3 |
| h100-dev-box-5 | 2x H100 | 80 GB each | westus3 |
| h100-dev-box-6 | 2x H100 NVL | 96 GB each | centralindia |
| a100-backup-1 | 1x A100 | 80 GB | westus2 |

## Setup

```bash
git clone https://github.com/SilenNaihin/gpuctl.git
cd gpuctl

# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install && npm run build && cd ..

# Run
./run.sh
```

Dashboard available at `http://localhost:8080`.

## Configuration

Edit `config.yaml` to add/remove hosts:

```yaml
poll_interval: 5
ssh_key: ~/.ssh/gpuctl_key
ssh_user: azureuser
hosts:
  - name: my-gpu-box
    ip: 1.2.3.4
    region: us-east
    gpus: 2
    gpu_type: H100
    vram_gb: 80
```

## API

- `GET /api/status` — Current fleet status (all hosts, GPUs, processes)
- `GET /api/history` — Rolling 1-hour utilization history for all hosts
- `GET /api/history/{host_name}` — History for a single host

## Development

```bash
# Backend (auto-reload)
uvicorn gpuctl.server:app --host 0.0.0.0 --port 8080 --reload

# Frontend (dev server)
cd frontend && npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8080` when running the frontend dev server separately.
