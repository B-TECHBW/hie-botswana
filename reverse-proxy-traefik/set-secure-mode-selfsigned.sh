#!/bin/bash

#The other variables are initiated in the swarm.sh script and used here
declare NEWER_TIMESTAMP=""
declare DOMAIN_ARGS=()

function init_vars() {
    if [[ -n "$SUBDOMAINS" ]]; then
        DOMAIN_ARGS=(-d "${DOMAIN_NAME},${SUBDOMAINS}")
    else
        DOMAIN_ARGS=(-d "${DOMAIN_NAME}")
    fi
}

# shellcheck disable=SC1091
function import_sources() {
    source "${UTILS_PATH}/docker-utils.sh"
    source "${UTILS_PATH}/config-utils.sh"
    source "${UTILS_PATH}/log.sh"
}

function create_secrets_from_certificates() {
    local -r NEW_TIMESTAMP=${1:?"FATAL: await_container_destroy NEW_TIMESTAMP not provided"}

    try \
        "docker secret create --label name=nginx ${NEW_TIMESTAMP}-fullchain.pem /instant/certificates/${DOMAIN_NAME}/cert.pem" \
        throw \
        "Failed to create fullchain nginx secret"
    try \
        "docker secret create --label name=nginx ${NEW_TIMESTAMP}-privkey.pem /instant/certificates/${DOMAIN_NAME}/key.pem" \
        throw \
        "Failed to create privkey1 nginx secret"
}

function generate_certificates() {
    log info "Generating certificates for ${DOMAIN_NAME}..."
    log info "docker run --rm \
        --network host \
        --name letsencrypt \
        -v dummy-data-certbot-conf:/output \
        ryantk/minica \
        --domains ${DOMAIN_NAME}"
    
    try "docker run --rm \
        --network host \
        --name letsencrypt \
        -v dummy-data-certbot-conf:/output \
        ryantk/minica \
        --domains ${DOMAIN_NAME}" \
        throw \
        "Failed to create certificate network"

    log info "docker run --rm --network host --name certbot-helper -w /temp \
        -v dummy-data-certbot-conf:/temp-certificates \
        -v instant:/temp busybox sh \
        -c \"rm -rf certificates; mkdir certificates; cp -r /temp-certificates/* /temp/certificates\""
    try "docker run --rm --network host --name certbot-helper -w /temp \
        -v dummy-data-certbot-conf:/temp-certificates \
        -v instant:/temp busybox sh \
        -c \"rm -rf certificates; mkdir certificates; cp -r /temp-certificates/* /temp/certificates\"" \
        throw \
        "Failed to transfer dummy certificates"

    # try "docker volume rm dummy-data-certbot-conf" catch "Failed to remove volume dummy-data-certbot-conf"

    create_secrets_from_certificates "${TIMESTAMP}"
}

function update_nginx_certificates() {
    try \
        "docker config create --label name=nginx ${TIMESTAMPED_NGINX} ${COMPOSE_FILE_PATH}/config/nginx.conf" \
        throw \
        "Failed to create nginx config"

    log info "Updating $SERVICE_NAMES service: adding config for dummy certificates..."
    
    
    log info "docker service update \
          --config-add source=${TIMESTAMPED_NGINX},target=/etc/nginx/nginx.conf \
          --secret-add source=${TIMESTAMP}-fullchain.pem,target=/run/secrets/fullchain.pem \
          --secret-add source=${TIMESTAMP}-privkey.pem,target=/run/secrets/privkey.pem \
          --network-add name=cert-renewal-network,alias=cert-renewal-network \
          --publish-add published=80,target=80 \
          --publish-add published=443,target=443 \
          ${STACK}_$SERVICE_NAMES"
    docker service update \
          --config-add source=$TIMESTAMPED_NGINX,target=/etc/nginx/nginx.conf \
          --secret-add source=$TIMESTAMP-fullchain.pem,target=/run/secrets/fullchain.pem \
          --secret-add source=$TIMESTAMP-privkey.pem,target=/run/secrets/privkey.pem \
          --publish-add published=80,target=80 \
          --publish-add published=443,target=443 \
          "${STACK}_${SERVICE_NAMES}"
    # try "docker service update \
    #       --config-add source=${TIMESTAMPED_NGINX},target=/etc/nginx/nginx.conf \
    #       --secret-add source=${TIMESTAMP}-fullchain.pem,target=/run/secrets/fullchain.pem \
    #       --secret-add source=${TIMESTAMP}-privkey.pem,target=/run/secrets/privkey.pem \
    #       --network-add name=cert-renewal-network,alias=cert-renewal-network \
    #       --publish-add published=80,target=80 \
    #       --publish-add published=443,target=443 \
    #       ${STACK}_$SERVICE_NAMES" \
    #     throw \
    #     "Error updating $SERVICE_NAMES service"

    overwrite "Updating $SERVICE_NAMES service: adding config for dummy certificates... Done"
}

function set_nginx_network() {
    local nginx_network_exists
    nginx_network_exists=$(docker network ls --filter name=cert-renewal-network --format '{{.Name}}')

    #Do not create docker network if it exists
    if [[ -z "${nginx_network_exists}" ]]; then
        try \
            "docker network create -d overlay --attachable cert-renewal-network" \
            throw \
            "Failed to create cert-renewal-network network"
    fi
}

set_secure_mode() {
    init_vars "$@"
    import_sources

    log info "Setting up Nginx Reverse Proxy with the following domain name: ${DOMAIN_NAME}"

    #Generate dummy certificates
    generate_certificates

    #Create copy of nginx-temp-secure.conf to ensure sed will always work correctly
    cp "${COMPOSE_FILE_PATH}"/config/nginx-temp-secure.conf "${COMPOSE_FILE_PATH}"/config/nginx.conf
    sed -i "s/domain_name/${DOMAIN_NAME}/g;" "${COMPOSE_FILE_PATH}"/config/nginx.conf

    #Set a docker network for nginx
    set_nginx_network

    #Update nginx to use the dummy certificates
    update_nginx_certificates
}

set_secure_mode "$@"
