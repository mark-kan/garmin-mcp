# Garmin MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your Garmin Connect training data to AI assistants. Ask Claude about your recent runs, HR zones, TRIMP load, and more — without leaving the chat.

Deployed as a Vercel serverless function. Fetches live data from Garmin Connect on each tool call.

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

### Prerequisites

- [Vercel account](https://vercel.com) and the Vercel CLI (`npm i -g vercel`)
- A Garmin Connect account with training data
- Node.js 20+

### Deploy

```bash
git clone https://github.com/mark-kan/garmin-mcp
cd garmin-mcp
npm install

# Link to Vercel and set credentials
vercel link
vercel env add GARMIN_EMAIL
vercel env add GARMIN_PASSWORD

# Deploy
vercel --prod
```

Your MCP endpoint will be at `https://<your-project>.vercel.app/api/mcp`.

### Local development

```bash
vercel env pull .env.local   # sync credentials locally
npm run dev                  # starts on http://localhost:3000
```

### Connect to Claude

Add to your Claude MCP config (`~/.claude/claude_desktop_config.json` or Claude Code settings):

```json
{
  "mcpServers": {
    "garmin": {
      "type": "http",
      "url": "https://<your-project>.vercel.app/api/mcp"
    }
  }
}
```

Then ask Claude things like:
- *"Show me my last 10 training sessions"*
- *"Analyse the HR zones from my run on May 30"*
- *"How has my training load trended over the last 28 days?"*
- *"Compare my last three runs"*

## Stack

- TypeScript + Vercel serverless functions (`@vercel/node`)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — StreamableHTTP transport
- [`garmin-connect`](https://www.npmjs.com/package/garmin-connect) — unofficial Garmin Connect API client

## Notes

- **Auth:** Garmin credentials are stored as Vercel environment variables. There is no official Garmin public OAuth API.
- **Latency:** Each tool call logs in to Garmin Connect fresh (~1–3s). There is no caching layer.
- **HR time-series** is fetched via the raw `/activity-service/activity/{id}/details` endpoint since the typed SDK does not wrap it.
