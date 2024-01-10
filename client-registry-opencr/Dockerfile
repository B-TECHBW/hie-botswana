FROM intrahealth/opencr:latest

RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

COPY ./config/entrypoint.sh /entrypoint.sh

RUN ["chmod", "+x", "/entrypoint.sh"]

ENTRYPOINT ["/entrypoint.sh"]