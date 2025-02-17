FROM denoland/deno:alpine-2.1.9

# Set up application-specific environment variables
ENV RETENTION_HOURS=48 \
    INACTIVITY_THRESHOLD_HOURS=24 \
    WARNING_LABEL="retention-warning" \
    DEBUG=false

WORKDIR /app

# Copy and prepare application files
COPY --chown=deno:deno *.ts deno.json ./

# Cache dependencies as deno user (already set in base image)
RUN deno cache main.ts

# Run the application
CMD ["deno", "run", "-A", "main.ts"] 