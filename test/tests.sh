#!/bin/bash
for hl7File in messages/*
do
  echo "Testing $hl7File"
  msg="\x0b"

  while IFS='' read -r LINE || [ -n "${LINE}" ]; do
      echo "processing line: ${LINE}"
      LINE=`printf "%q" $LINE`
      msg="${msg}${LINE}\x0d"
  done < $hl7File

  msg="${msg}\x1c\x0d"

  echo $msg
  printf $msg | socat - TCP:mllp:2575
done