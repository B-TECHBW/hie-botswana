#!/bin/bash

# Save codebase as tarball
git archive --output=./dist/package/hie-botswana.tar --format=tar HEAD

# Pull latest images
docker-compose --profile core --profile mediator --profile test pull

# Save images to .tar files
docker save --output ./dist/package/docker/nginx.tar nginx:latest

docker save --output ./dist/package/docker/openhim-core.tar jembi/openhim-core:latest
docker save --output ./dist/package/docker/openhim-console.tar jembi/openhim-console:latest

docker save --output ./dist/package/docker/es.tar intrahealth/elasticsearch:latest
docker save --output ./dist/package/docker/mongo.tar mongo:3.4
docker save --output ./dist/package/docker/hapi.tar hapiproject/hapi:latest

docker save --output ./dist/package/docker/shared-health-record.tar ghcr.io/i-tech-uw/shared-health-record:latest
docker save --output ./dist/package/docker/openhim-mediator-fhir-converter.tar ghcr.io/b-techbw/openhim-mediator-fhir-converter:latest
docker save --output ./dist/package/docker/opencr.tar intrahealth/opencr:latest

docker save --output ./dist/package/docker/httpbin.tar kennethreitz/httpbin:latest
docker save --output ./dist/package/docker/mllp-http.tar rivethealth/mllp-http:latest
docker save --output ./dist/package/docker/newman.tar postman/newman:latest
