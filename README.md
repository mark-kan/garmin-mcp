# Garmin MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your Garmin Connect training data to AI assistants. Ask Claude about your recent runs, HR zones, TRIMP load, and more — without leaving the chat.

Deployed as a Vercel serverless function. Fetches live data from Garmin Connect on each tool call.

Connect your own Garmin account with a one-time token exchange — no deployment needed.

## Tools

| Tool | Description |
|------|-------------|
| `list_activities` | Recent activities with HR, pace, distance, and training effect |
| `get_activity_detail` | Full metrics for a single session by ID |
| `get_hr_analysis` | HR zone breakdown, TRIMP, and HR drift for an activity |
| `compare_activities` | Side-by-side comparison of 2–5 sessions |
| `get_athlete_profile` | VO2max, resting HR, and max HR settings |
| `get_training_load_history` | Rolling 7/28/90-day TRIMP training load |

## Setup

### 1. Get your token (one-time)

Clone the repo and run the token helper with your Garmin credentials:

```bash
git clone https://github.com/mark-kan/garmin-mcp
cd garmin-mcp
npm install
GARMIN_EMAIL=you@example.com GARMIN_PASSWORD=yourpass npx tsx scripts/get-token.ts
```

This logs in locally, exports your OAuth token, and prints a base64 string. Your credentials stay on your machine.

### 2. Add to your MCP config

`~/.claude/claude_desktop_config.json` (Claude Desktop) or Claude Code MCP settings:

```json
{
  "mcpServers": {
    "garmin": {
      "type": "http",
      "url": "https://garmin-mcp-kappa.vercel.app/api/mcp",
      "headers": {
        "x-garmin-token": "<paste token here>"
      }
    }
  }
}
```

Then ask Claude things like:
- *"Show me my last 10 training sessions"*
- *"Analyse the HR zones from my run on May 30"*
- *"How has my training load trended over the last 28 days?"*
- *"Compare my last three runs"*

## Self-hosting

To deploy your own instance:

```bash
git clone https://github.com/mark-kan/garmin-mcp
cd garmin-mcp
npm install
vercel --prod
```

Set `GARMIN_EMAIL` and `GARMIN_PASSWORD` as Vercel env vars if you want the server to work without a token header (personal use).

## Stack

- TypeScript + Vercel serverless functions (`@vercel/node`)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — StreamableHTTP transport
- [`garmin-connect`](https://www.npmjs.com/package/garmin-connect) — unofficial Garmin Connect API client

## Notes

- **Auth:** Garmin credentials are stored as Vercel environment variables. There is no official Garmin public OAuth API.
- **Latency:** Each tool call logs in to Garmin Connect fresh (~1–3s). There is no caching layer.
- **HR time-series** is fetched via the raw `/activity-service/activity/{id}/details` endpoint since the typed SDK does not wrap it.
