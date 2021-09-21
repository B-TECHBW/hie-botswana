#!/bin/bash
COMPOSE_PROFILES=mediators,support,test,config docker-compose -f docker-compose.ci.yml pull

docker-compose -f docker-compose.ci.yml --profile support up -d

sleep 120

docker-compose -f docker-compose.ci.yml logs openhim-config
docker-compose -f docker-compose.ci.yml --profile mediators up -d

sleep 20

COMPOSE_PROFILES=mediators,support,test,config docker-compose -f docker-compose.ci.yml ps

declare -a tests=("https://www.getpostman.com/collections/c58de2e03b071c45dcaa" 
                "https://www.getpostman.com/collections/a410a87102b64366c072" 
                "https://www.getpostman.com/collections/ff5183adca5b5e720338"
                "https://www.getpostman.com/collections/f5a58cf2d476785aed5f"
                "https://www.getpostman.com/collections/2ee8ebff39c078bac256"
                )

for url in "${tests[@]}"
do
   echo "Testing url: $url"
   export POSTMAN_COLLECTION=$url

   docker-compose -f ci.docker-compose.yml up --exit-code-from newman newman 
done
