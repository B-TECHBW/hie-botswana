#!/bin/bash
ls -1 ./dist/package/docker/*.tar | xargs --no-run-if-empty -L 1 docker load -i 