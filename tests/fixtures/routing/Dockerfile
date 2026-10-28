# Optional local fixture only. CI runs its installed Apache binary directly.
FROM lexgalleri-php-test
RUN --mount=type=secret,id=proxy_ca,required=true \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends apache2 \
    && rm -rf /var/lib/apt/lists/*
