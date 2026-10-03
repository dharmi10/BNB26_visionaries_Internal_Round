# ---- build ------------------------------------------------------------------
FROM golang:1.25-alpine AS build

WORKDIR /src

# Cache the module layer separately from the sources.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO off so the binary runs on a scratch-like base. web/index.html is embedded
# into the executable, so the runtime image needs no extra files.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/server ./cmd/server

# ---- run --------------------------------------------------------------------
FROM alpine:3.20

RUN adduser -D -u 10001 app
COPY --from=build /out/server /usr/local/bin/server

USER app
EXPOSE 8080

ENV ADDR=:8080 \
    REDIS_ADDR=redis:6379

ENTRYPOINT ["/usr/local/bin/server"]
