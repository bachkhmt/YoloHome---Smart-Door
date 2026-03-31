#!/bin/bash
# Wrapper script to run YOLOHOME 

# Change to the directory of this script
cd "$(dirname "$0")"

echo "Starting YOLOHOME via uv run..."
uv run python scripts/run.py "$@"
