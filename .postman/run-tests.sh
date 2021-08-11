#!/bin/bash

collections=(
  'https://www.getpostman.com/collections/c58de2e03b071c45dcaa'
  'https://www.getpostman.com/collections/1daa8e91a9eb6599c323'
  'https://www.getpostman.com/collections/a410a87102b64366c072'
  'https://www.getpostman.com/collections/ff5183adca5b5e720338'
  'https://www.getpostman.com/collections/f5a58cf2d476785aed5f'
)

for collection in ${collections[@]}; do
  echo $collection
  export POSTMAN_COLLECTION=$collection
  sudo -E docker-compose -f docker-compose.ci.yml up newman
done