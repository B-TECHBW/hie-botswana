# Botswana Health Information Exchange - Reference Implementation
[![CI](https://github.com/B-TECHBW/hie-botswana/actions/workflows/main.yml/badge.svg)](https://github.com/B-TECHBW/hie-botswana/actions/workflows/main.yml)

## Install Instructions
1. Install `docker` and `docker-compose` commands:
  - https://docs.docker.com/engine/install/ubuntu/
  - https://docs.docker.com/compose/install/

2. Check out repository:
    ```sh
    git clone https://github.com/B-TECHBW/hie-botswana.git
    ```
3. Start up core containers:
    ```sh
    cd hie-botswana
    docker-compose --profile core up -d 
    ```
4. Test and set up OpenHIM at http://localhost. Change the default password.

5. Start up mediators:
    ```sh
    docker-compose --profile mediator up -d
    ```
6. Set up channels, clients, and auth in OpenHIM at http://localhost

7. Run Postman Tests on Setup:
    (https://www.postman.com/openme/workspace/botswana-hie/overview)
    ```
    cd hie-botswana
    ./.postman/run-tests-offline.sh  
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


