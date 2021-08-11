#!/bin/bash

for collection in .postman/collections/*
do
  echo $collection
  # export POSTMAN_COLLECTION=$collection
  POSTMAN_COLLECTION=/$collection docker-compose -f docker-compose.ci.yml up newman
done