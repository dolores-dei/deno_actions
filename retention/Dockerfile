# Build stage
FROM denoland/deno:alpine-2.1.9 AS builder

WORKDIR /build

# Cache dependencies
COPY deno.json deno.lock ./
RUN deno cache --lock=deno.lock main.ts

# Copy source and compile
COPY . .
RUN deno compile -A --output qa-retention main.ts

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install SSL certificates for HTTPS requests
RUN apk add --no-cache ca-certificates

# Copy the compiled binary
COPY --from=builder /build/qa-retention .

# The script will respect these environment variables
ENV RETENTION_HOURS=48 \
    INACTIVITY_THRESHOLD_HOURS=24 \
    WARNING_LABEL=retention-warning \
    DEBUG=false

# Run the binary
ENTRYPOINT ["./qa-retention"] 