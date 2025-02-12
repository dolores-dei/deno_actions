# QA Instance Retention

Automated cleanup of QA instances based on activity and retention rules.

## Overview

This tool automatically manages QA instances by:
1. Warning about instances that exceed the retention period
2. Closing instances that remain inactive after warning

## Configuration

Configuration is done through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `RETENTION_HOURS` | Hours before warning is issued | 48 |
| `INACTIVITY_THRESHOLD_HOURS` | Hours of inactivity before closing | 24 |
| `WARNING_LABEL` | Label used to mark warned issues | retention-warning |
| `DEBUG` | Enable detailed logging | false |
| `GITHUB_TOKEN` | GitHub token for API access | Required |

## Usage

### Using Docker

Build the container:
```bash
docker build -t qa-retention .
```

Run with environment variables:
```bash
docker run --rm \
  -e GITHUB_TOKEN="your-token" \
  -e RETENTION_HOURS=48 \
  -e INACTIVITY_THRESHOLD_HOURS=24 \
  qa-retention
```

### Local Development

Requirements:
- Deno 2.x

Setup:
1. Clone the repository
2. Create a GitHub token with `repo` scope
3. Set environment variables:
   ```bash
   export GITHUB_TOKEN="your-token"
   export RETENTION_HOURS=48
   export INACTIVITY_THRESHOLD_HOURS=24
   ```

Development Commands:
```bash
# Run the tool
deno task start

# Development tasks
deno task check  # Type checking
deno task fmt    # Format code
deno task lint   # Lint code
deno task test   # Run tests
```

## GitHub Actions Integration

The tool runs automatically via GitHub Actions:
- Scheduled to run every hour using container
- Can be triggered manually with custom parameters
- Uses repository's GITHUB_TOKEN by default

### Manual Trigger Options

When running manually, you can customize:
- Debug logging
- Retention period
- Inactivity threshold

## How It Works

1. **Warning Phase**
   - Identifies QA instances older than RETENTION_HOURS
   - Adds warning comment and label
   - Resets if there's new activity

2. **Closing Phase**
   - Checks warned instances for inactivity
   - Closes if inactive for INACTIVITY_THRESHOLD_HOURS
   - Adds closing comment explaining why

## Logging

- Normal mode: Basic operation logging
- Debug mode: Detailed timing and state information
- All errors are logged with context

## Error Handling

- Graceful handling of API failures
- Automatic retry on rate limits
- Clear error messages in logs
- Failed operations don't affect others

## Container Details

The container is based on the official Deno image and:
- Includes all dependencies
- Has sensible defaults
- Is configurable via environment variables
- Automatically caches dependencies
- Minimal size with multi-stage build 