# Botswana Health Information Exchange - Reference Implementation
[![CI](https://github.com/B-TECHBW/hie-botswana/actions/workflows/main.yml/badge.svg)](https://github.com/B-TECHBW/hie-botswana/actions/workflows/main.yml)

## Install Instructions
### 1. Install `docker` and `docker-compose` commands:
  - https://docs.docker.com/engine/install/ubuntu/
  - https://docs.docker.com/compose/install/

### 2. Domain vs. Port-based Setup

Decide whether you're running a domain-based or port-based setup. Based on this, either use the `docker-compose.yml` file for domain-based, or the `docker-compose.local.yml` file for port-based. 

This decision determines how services will be reached, and what environment needs to be used for testing. In each case, the traffic is routed through the `nginx` container, which distributes the traffic correctly based on domains or ports. See the `nginx` configuration in the corresponding `docker-compose.yml` file, and the configurations in `./configs/nginx`. 

We assume a port-based setup for these instructions.
### 3. Check out repository:
```sh
git clone https://github.com/B-TECHBW/hie-botswana.git
```

### 4. Start up core containers:
```sh
cd hie-botswana
docker-compose -f docker-compose.local.yml up -d openhim-core openhim-console mongo-db opencr-fhir shr-fhir opencr-es kafka zookeeper
```
### 5. OpenHIM Password Setup:
Open the OpenHIM console in the browser and use default login and password:
`root@openmrs.org`/`openhim-password`. 

Change the password when prompted to one that your mediators will use. 

### 6. Start up mediators:

```sh
docker-compose -f docker-compose.local.yml up -d shr opencr fhir-converter
```
## HIE Testing Guide

Determine whether you're running a domain-based or port-based setup. Based on this, either use the `docker-compose.yml` file for domain-based, or the `docker-compose.local.yml` file for port-based. 

This decision determines how services will be reached, and what environment needs to be used for testing. In each case, the traffic is routed through the `nginx` container, which distributes the traffic correctly based on domains or ports. See the `nginx` configuration in the corresponding `docker-compose.yml` file, and the configurations in `./configs/nginx`. 

These instructions will assume a port-based approach when giving examples, so you can swap in the corresponding domain-based urls from the `nginx.conf` files. 
### Step 1: Verify access to OpenHIM

Make sure console is up and running, and pointed to the correct, external (non-docker) url for the `openhim-core` api (port `8080`):
```sh
docker logs -n 100 openhim-console
```

Make sure `openhim-core` is running correctly:
```sh
docker logs -n 100 openhim-core
```

Open openhim console url in browser window:
`https://localhost`

Log in using default password and set a new admin password if not done already, using the following defaults:
`root@openmrs.org`/`openhim-password`

Make sure whatever password you choose is updated in the `opencr`, `shr`, and `fhir-converter` config files.

You should now be logged into the OpenHIM Dashboard. 
### Step 2: Activate and Verify the Mediators

Go to `Mediators` tab in OpenHIM console.

Verify that the following three mediators are registered and have active (green) heartbeats:
- OpenCR
- SHR
- FHIR-HL7 Converter

Add the channels associated with each mediator with the green `+` button.

Go to the `Clients and Roles` tab and create the following roles and channel assignments:
1. shr-client (all SHR mediator channels)
2. opencr-client (all OpenCR mediator channels)
3. converter-client (all Fhir Converter mediator channels)
4. mfl-client (placeholder)
5. omang-client (placeholder)
6. bd-client (placeholder)

In the clients section, create the following clients and assign roles:
1. pims-test(shr-client, opencr-client, mfl-client)
2. ipms-test(shr-client)
3. shr(opencr-client, converter-client, mfl-client, omang-client, bd-client)
4. opencr(converter-client, omang-client, bd-client)

For each client, add Basic Auth authentication in the Authentication tab. The client name will be the username for BasicAuth, and will need to be set correctly in configurations for the communication workflows to work. For production, certificate-based authentication will be used. 

To enable testing, the following temporary client should also be created and given access to all of the listed roles: `postman/postman`. If a password other than this default is required, the corresponding settings need to be updated in each `.json` file in `.postman/collections` for the tests to run correctly. 

### 4. Run Postman Tests

Verify that the `.postman/postman_env.moh.json` environment file has the correct urls for the setup to be tested. 

Run the tests:
```sh
./.postman/run-tests-offline.sh
```
### 5. Run MLLP Tests

For this test, the test will respond with success if it passes, and it will log a couple transactions in the OpenHIM console. 

Run the tests:
```sh
sudo docker-compose -f docker-compose.local.yml up mllp_tests
```

## Offline Install
### 1. Pull and save images on internet-connected machine
```sh
git clone https://github.com/B-TECHBW/hie-botswana.git
cd hie-botswana
./dist/build_package.sh
```
### 2. Transfer the `dist` folder with the `.tar` files to server

### 3. Unpack `.tar` files to docker images
`./load_package.sh`

### 4. Boot up Docker containers
See step #3 in [Install Instructions](https://github.com/B-TECHBW/hie-botswana#install-instructions) section

## Certificate Management
For AWS setups, we use Letsencrypt to provide SSL certificates for the domain. See https://nandovieira.com/using-lets-encrypt-in-development-with-nginx-and-aws-route53
for more guidance.

Certificates are grabbed/managed by the certbot service in the `docker-compose.yaml` file. This service requires the following variables: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. See https://certbot-dns-route53.readthedocs.io/en/stable/ for information on how to obtain these values in AWS. 

Certificate generation and renewal will eventually be automated, but currently can be run with the following command:
`sudo -E docker-compose up certbot`

The certificates are loaded into the `certs` volume, which can be mounted in any other docker container, and is primarily used by Nginx.
## Components
- NGINX Reverse Proxy
- Open Client Registry (https://github.com/intrahealth/client-registry)
- OpenHIM (http://openhim.org/)
- Shared Health Record (https://github.com/i-tech-uw/shared-health-record)
- FHIR <-> HL7v2 Converter (https://github.com/B-TECHBW/openhim-mediator-fhir-converter)
- Hapi JPA Servers (https://github.com/hapifhir/hapi-fhir-jpaserver-starter)



