#!/bin/bash
tar -xvf hie-botswana.tar -C ~/

ls -1 ./package/docker/*.tar | xargs --no-run-if-empty -L 1 docker load -i 