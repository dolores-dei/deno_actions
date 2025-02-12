FROM denoland/deno:alpine-2.1.9

WORKDIR /app

# Create non-root user early
RUN addgroup -S app && \
    adduser -S app -G app

# Set up Deno cache directory with correct permissions
RUN mkdir -p /deno-dir && \
    chown -R app:app /deno-dir

# Copy only necessary files for dependency caching
COPY deno.json deno.lock ./

# Cache dependencies as root
RUN deno cache --lock=deno.lock https://esm.sh/octokit@4.1.0 && \
    chown -R app:app /deno-dir

# Copy application files
COPY *.ts ./
RUN chown -R app:app /app

# Set default environment variables
ENV RETENTION_HOURS=168
ENV INACTIVITY_THRESHOLD_HOURS=72
ENV WARNING_LABEL="stale"
ENV DEBUG=false
ENV DENO_DIR=/deno-dir

# Switch to non-root user
USER app

# Run the application
CMD ["deno", "run", "-A", "main.ts"] 