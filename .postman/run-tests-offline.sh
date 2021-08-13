#!/bin/bash

for collection in .postman/collections/*
do
  file=`basename $collection`
  echo "Running $file"
  docker run -v ~/code/hie-botswana/.postman:/etc/newman -t postman/newman run "collections/$file" --environment="postman_env.moh.json"
done