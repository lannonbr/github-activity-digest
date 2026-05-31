# GitHub Activity Digest

A self-hosted personal app that tracks configured GitHub users and generates archived weekly HTML digests of their public contribution-shaped activity.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the `.env.example` file and fill in secrets:

```bash
cp .env.example .env
```

`GITHUB_TOKEN` is required for report generation. `DISCORD_WEBHOOK_URL` is required for scheduled runs and for `npm run generate -- --notify`.

3. Start the app once to generate `config.yaml`, then edit it with your tracked users, local server URL, schedule, and data directory.

Reports are written to `data/reports/`, with `latest.html` and `manifest.json` maintained automatically. The server exposes:

- `/` for the archive
- `/reports/latest` for the latest report
- `/reports/:reportId` for a specific archived report
