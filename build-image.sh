#!/bin/bash


TAG_NAME=${1:-latest}
ENV_FILE=${2:-./.env.hie}

set -o allexport; source "$ENV_FILE"; set +o allexport

TAG_VERSION=${VERSION:-latest}
PUSH=${2:-false}

docker build -t itechuw/hie-botswana:"$TAG_NAME" -t itechuw/hie-botswana:"$TAG_VERSION" .

if [ "$PUSH" = true ]; then
  docker push itechuw/hie-botswana:"$TAG_NAME"
  docker push itechuw/hie-botswana:"$TAG_VERSION"
fi
