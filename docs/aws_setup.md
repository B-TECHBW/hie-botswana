# Useful Links for Nginx/Certbot/AWS setup

## Docker-compose configuration:

```yaml
  nginx:
    image: nginx:latest
    container_name: nginx
    hostname: nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /home/ubuntu/local/letsencrypt/archive/sedish-haiti.org:/etc/letsencrypt
      - ./nginx/data/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/data/www:/var/www
    networks:
      - sedish
```
**TODO: Cleanup links and write up setup steps**

## Main Resources

- https://nandovieira.com/using-lets-encrypt-in-development-with-nginx-and-aws-route53

- https://certbot-dns-route53.readthedocs.io/en/stable/

- https://serverfault.com/questions/920534/nginx-proxy-subdomains-to-other-addresses-and-ports

--- 

## Other Resources

- https://mikesbytes.org/web/2020/02/29/docker-nginx-letsencrypt.html

- https://www.freecodecamp.org/news/docker-nginx-letsencrypt-easy-secure-reverse-proxy-40165ba3aee2/

- https://engineering.bitnami.com/articles/why-non-root-containers-are-important-for-security.html

- https://www.domysee.com/blogposts/reverse-proxy-nginx-docker-compose

## Utility for booting up placeholder page:

```console
docker run \
    --hostname openhim-placeholder \
    --network shared-health-record_sedish \
    --name openhim-placeholder \
    -e MESSAGE=OPENHIM-PLACEHOLDER \
    -e PORT=3000 \
    -d docker.io/sroze/landing-page:latest
```

Make sure to set up AWS certification

```
sudo - E certbot certonly \
-n \
--agree-tos \
--email pmanko@uw.edu \
-d moh.org.bw \
-d '*.moh.org.bw' \
--dns-route53 \
--preferred-challenges=dns \
--logs-dir /tmp/letsencrypt \
--config-dir ~/local/letsencrypt \
--work-dir /tmp/letsencrypt
--dry-run

```


## Add access for ports 80 and 443 in AWS security policy settings