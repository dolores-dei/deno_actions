# QA Instance Retention

A simple tool to automatically clean up inactive QA instances in your GitHub repository.

## What it does

1. Finds QA instances (issues with "QA-Instance ready" in the title)
2. Warns about instances that haven't had activity for a while
3. Closes instances that remain inactive after the warning

## Quick Start

The easiest way to use this is through GitHub Actions. Just add this to your workflow:

```yaml
- name: Run Retention Check
  run: |
    docker run --rm \
      -e GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }} \
      -e GITHUB_OWNER=${{ github.repository_owner }} \
      -e GITHUB_REPO=${{ github.event.repository.name }} \
      doloresdei/qa-retention:latest
```

## Configuration

Simple environment variables to control the behavior:

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub token for API access | Required |
| `GITHUB_OWNER` | Repository owner | Required |
| `GITHUB_REPO` | Repository name | Required |
| `RETENTION_HOURS` | Hours before warning | 48 |
| `INACTIVITY_THRESHOLD_HOURS` | Hours before closing | 24 |
| `DEBUG` | Enable debug logs | false |

## How it works

1. **Warning**: Adds a comment and label when an instance is inactive for `RETENTION_HOURS`
2. **Closing**: Closes the issue if it stays inactive for `INACTIVITY_THRESHOLD_HOURS` after the warning
3. **Reset**: Any new comment removes the warning and resets the timer

## Development

Requirements:
- Deno 2.x

Local testing:
```bash
# Set required env vars
export GITHUB_TOKEN="your-token"
export GITHUB_OWNER="your-username"
export GITHUB_REPO="your-repo"

# Run it
deno task start
```

## GitHub Actions Integration

The tool comes with a ready-to-use workflow that:
- Runs every hour automatically
- Can be triggered manually with custom settings
- Uses your repository's GITHUB_TOKEN

You can customize:
- When to warn (`retention_hours`)
- When to close (`inactivity_hours`)
- Debug logging 