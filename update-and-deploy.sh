#!/usr/bin/env bash
set -euo pipefail

# optional: adjust to your compose file dir
# cd /path/to/project

echo "Fetching latest from Git..."
git fetch origin

echo "Pulling changes..."
pull_output=$(git pull --ff-only 2>&1)

echo "$pull_output"

if [[ "$pull_output" == *"Already up to date."* ]]; then
  echo "No updates found. Skipping docker compose."
  exit 0
fi

echo "Changes detected. Rebuilding/running docker compose..."
docker compose up --build -d

echo "Done."
