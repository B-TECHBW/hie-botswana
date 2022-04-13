#!/bin/bash
mllpPort=3001


# Postman Collections
for collection in .postman/collections/*
do
  file=`basename $collection`
  echo "Running $file"
  docker run -v ~/code/hie-botswana/.postman:/etc/newman -t postman/newman run "collections/$file" --environment="postman_env.moh.json"
done

# MLLP Messages

for hl7File in messages/*
do
  echo "Testing $hl7File"

  echo $hostname

  echo -ne $msg | socat - TCP:$hostname:$port
done
