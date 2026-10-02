FROM scratch

LABEL org.opencontainers.image.title="Tristian Link theme"
LABEL org.opencontainers.image.description="Read-only Kutt customization artifact for link.tristian.id"
LABEL org.opencontainers.image.source="https://github.com/nonkronk/tristian-link"
LABEL org.opencontainers.image.licenses="MIT"

COPY custom /custom
COPY compatibility /compatibility
