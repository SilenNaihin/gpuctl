#!/bin/bash
cd "$(dirname "$0")"
pip install -r requirements.txt -q
uvicorn gpuctl.server:app --host 0.0.0.0 --port 8080 --reload
