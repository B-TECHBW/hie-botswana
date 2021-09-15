FROM debian:buster-slim

WORKDIR /test

RUN apt-get update && apt-get -y install socat

ENTRYPOINT [ "/test/tests.sh" ]