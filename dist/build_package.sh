#!/bin/bash

# Pull latest images
docker-compose -f docker-compose.local.yml pull

# Save images to .tar files
docker save --output ./dist/package/docker/nginx.tar nginx:latest

docker save --output ./dist/package/docker/openhim-core.tar jembi/openhim-core:latest
docker save --output ./dist/package/docker/openhim-console.tar jembi/openhim-console:latest

docker save --output ./dist/package/docker/es.tar intrahealth/elasticsearch:latest
docker save --output ./dist/package/docker/mongo.tar mongo:3.4
docker save --output ./dist/package/docker/hapi.tar hapiproject/hapi:latest

docker save --output ./dist/package/docker/shared-health-record.tar ghcr.io/i-tech-uw/shared-health-record:v0.4.4
docker save --output ./dist/package/docker/openhim-mediator-fhir-converter.tar ghcr.io/b-techbw/openhim-mediator-fhir-converter:v3.1.4
docker save --output ./dist/package/docker/opencr.tar intrahealth/opencr:latest

docker save --output ./dist/package/docker/newman.tar postman/newman:latest

docker save --output ./dist/package/docker/mllp-tester.tar ghcr.io/b-techbw/mllp-tester:latest

docker save --output ./dist/package/docker/zookeeper.tar bitnami/zookeeper:latest

docker save --output ./dist/package/docker/kafka.tar bitnami/kafka:latest