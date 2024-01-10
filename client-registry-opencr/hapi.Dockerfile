FROM hapiproject/hapi:latest

# Copy the static shell into base image
COPY --from=busybox:1.36.0-uclibc /bin/sh /bin/sh
# Copy all necessary executables into distroless image
COPY --from=busybox:1.36.0-uclibc /bin/wget /bin/wget