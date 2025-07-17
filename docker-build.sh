#!/bin/bash

SCRIPT_PATH="$(dirname "$BASH_SOURCE[0]")"
IMAGE_NAME="$1"

if [ -z "$IMAGE_NAME" ]; then
  echo "Usage: $0 <image_name>"
  exit 1
fi

cd $SCRIPT_PATH

# Get last git commit hash
COMMIT_HASH=$(git rev-parse HEAD)

docker build -t $IMAGE_NAME:$COMMIT_HASH .