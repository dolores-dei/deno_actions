FROM denoland/deno:alpine-2.1.9

WORKDIR /app

# Create non-root user early
RUN addgroup -S app && \
    adduser -S app -G app

# Set up Deno cache directory with correct permissions
RUN mkdir -p /deno-dir && \
    chown -R app:app /deno-dir

# Copy application files
COPY *.ts deno.json ./

# Cache dependencies as root and set permissions
RUN deno cache main.ts && \
    chown -R app:app /deno-dir && \
    chown -R app:app /app

# Set default environment variables
ENV RETENTION_HOURS=48
ENV INACTIVITY_THRESHOLD_HOURS=24
ENV WARNING_LABEL="retention-warning"
ENV DEBUG=false
ENV DENO_DIR=/deno-dir

# Switch to non-root user
USER app

# Run the application
CMD ["deno", "run", "-A", "main.ts"] 