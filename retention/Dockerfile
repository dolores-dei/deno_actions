FROM denoland/deno:alpine-2.1.9

WORKDIR /app

# Copy source files
COPY . .

# Cache dependencies
RUN deno cache --lock=deno.lock main.ts

# Default environment variables
ENV RETENTION_HOURS=48 \
    INACTIVITY_THRESHOLD_HOURS=24 \
    WARNING_LABEL=retention-warning \
    DEBUG=false

# Run the application
CMD ["deno", "run", "-A", "main.ts"] 