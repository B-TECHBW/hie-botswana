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
4. Test and set up OpenHIM at http://localhost:80. Change the default password.

5. Start up mediators:
    ```sh
    docker-compose --profile mediator up -d
    ```

6. Run Postman Tests on Setup:
    (https://www.postman.com/openme/workspace/botswana-hie/overview)
    ```
    cd hie-botswana
    ./.postman/run-tests-offline.sh  
    ```

## Components
- NGINX Reverse Proxy
- Open Client Registry (https://github.com/intrahealth/client-registry)
- OpenHIM (http://openhim.org/)
- Shared Health Record (https://github.com/i-tech-uw/shared-health-record)
- FHIR <-> HL7v2 Converter (https://github.com/B-TECHBW/openhim-mediator-fhir-converter)
- Hapi JPA Servers (https://github.com/hapifhir/hapi-fhir-jpaserver-starter)


