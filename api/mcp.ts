import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { GarminConnect } from "garmin-connect";
import {
  listActivities,
  getActivity,
  getHRTimeSeries,
  getAthleteProfile,
  createClientFromToken,
} from "../lib/garmin";
import { analyzeHR, summarizeActivity } from "../lib/analysis";

const DEFAULT_MAX_HR = 190;
const DEFAULT_REST_HR = 55;

// ── tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "list_activities",
    description:
      "List recent Garmin activities with summary metrics (HR, pace, distance, effort).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", default: 20, description: "Number of activities to return (max 100)" },
        offset: { type: "number", default: 0, description: "Pagination offset" },
        type: { type: "string", description: "Filter by type: running, cycling, swimming, etc." },
      },
    },
  },
  {
    name: "get_activity_detail",
    description: "Get full metrics for a single activity by its numeric ID.",
    inputSchema: {
      type: "object",
      required: ["activity_id"],
      properties: {
        activity_id: { type: "number", description: "Garmin activity ID (from list_activities)" },
      },
    },
  },
  {
    name: "get_hr_analysis",
    description:
      "Fetch HR time-series for an activity and compute zone distribution, TRIMP, and HR drift.",
    inputSchema: {
      type: "object",
      required: ["activity_id"],
      properties: {
        activity_id: { type: "number", description: "Garmin activity ID" },
        max_hr: { type: "number", description: "Max HR override (default: 190)" },
        rest_hr: { type: "number", description: "Resting HR override (default: 55)" },
      },
    },
  },
  {
    name: "compare_activities",
    description:
      "Side-by-side comparison of 2–5 activities (HR, pace, effort, zones).",
    inputSchema: {
      type: "object",
      required: ["activity_ids"],
      properties: {
        activity_ids: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 5,
          description: "Array of Garmin activity IDs to compare",
        },
        max_hr: { type: "number", description: "Max HR override (default: 190)" },
        rest_hr: { type: "number", description: "Resting HR override (default: 55)" },
      },
    },
  },
  {
    name: "get_athlete_profile",
    description: "Fetch athlete profile: VO2max, resting HR, and max HR settings.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_training_load_history",
    description:
      "Fetch recent activities and summarise rolling TRIMP training load over 7, 28, and 90 days.",
    inputSchema: {
      type: "object",
      properties: {
        max_hr: { type: "number", description: "Max HR override (default: 190)" },
        rest_hr: { type: "number", description: "Resting HR override (default: 55)" },
      },
    },
  },
] as const;

// ── server factory ──────────────────────────────────────────────────────────

function buildServer(gc?: GarminConnect): Server {
  const server = new Server(
    { name: "garmin-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args ?? {}) as Record<string, any>;

    try {
      switch (name) {
        case "list_activities": {
          const activities = await listActivities(a.limit ?? 20, a.offset ?? 0, a.type, gc);
          return { content: [{ type: "text", text: JSON.stringify(activities.map(summarizeActivity), null, 2) }] };
        }

        case "get_activity_detail": {
          const activity = await getActivity(Number(a.activity_id), gc);
          return { content: [{ type: "text", text: JSON.stringify(summarizeActivity(activity), null, 2) }] };
        }

        case "get_hr_analysis": {
          const [samples, profile] = await Promise.all([
            getHRTimeSeries(Number(a.activity_id), gc),
            getAthleteProfile(gc).catch(() => null),
          ]);
          const maxHR = a.max_hr ?? profile?.maxHROverride ?? DEFAULT_MAX_HR;
          const restHR = a.rest_hr ?? profile?.restingHeartRate ?? DEFAULT_REST_HR;
          const analysis = analyzeHR(samples, restHR, maxHR);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                activity_id: a.activity_id,
                sample_count: samples.length,
                max_hr_used: maxHR,
                rest_hr_used: restHR,
                avg_hr: analysis.avgHR,
                peak_hr: analysis.maxHR,
                trimp: analysis.trimp,
                hr_drift_pct: analysis.drift,
                zone_seconds: analysis.zones,
                zone_percent: analysis.zonePct,
              }, null, 2),
            }],
          };
        }

        case "compare_activities": {
          const ids: number[] = a.activity_ids;
          const [profile, ...results] = await Promise.all([
            getAthleteProfile(gc).catch(() => null),
            ...ids.map((id) =>
              Promise.all([getActivity(id, gc), getHRTimeSeries(id, gc)]).then(([act, hr]) => ({ act, hr }))
            ),
          ]);
          const maxHR = a.max_hr ?? (profile as any)?.maxHROverride ?? DEFAULT_MAX_HR;
          const restHR = a.rest_hr ?? (profile as any)?.restingHeartRate ?? DEFAULT_REST_HR;
          const comparison = (results as any[]).map(({ act, hr }: any) => ({
            ...summarizeActivity(act),
            hr_analysis: (() => {
              const x = analyzeHR(hr, restHR, maxHR);
              return { trimp: x.trimp, hr_drift_pct: x.drift, zone_percent: x.zonePct };
            })(),
          }));
          return { content: [{ type: "text", text: JSON.stringify(comparison, null, 2) }] };
        }

        case "get_athlete_profile": {
          const profile = await getAthleteProfile(gc);
          return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
        }

        case "get_training_load_history": {
          const [activities, profile] = await Promise.all([
            listActivities(90, 0, undefined, gc),
            getAthleteProfile(gc).catch(() => null),
          ]);
          const maxHR = a.max_hr ?? (profile as any)?.maxHROverride ?? DEFAULT_MAX_HR;
          const restHR = a.rest_hr ?? (profile as any)?.restingHeartRate ?? DEFAULT_REST_HR;
          const now = Date.now();
          const msPerDay = 86400000;
          const withLoad = await Promise.all(
            activities.slice(0, 30).map(async (act) => {
              const samples = await getHRTimeSeries(act.activityId, gc).catch(() => []);
              const { trimp } = analyzeHR(samples, restHR, maxHR);
              const ageMs = now - new Date(act.startTimeLocal).getTime();
              return { date: act.startTimeLocal, type: act.activityType?.typeKey, trimp, ageMs };
            })
          );
          const sum = (days: number) =>
            withLoad.filter((w) => w.ageMs <= days * msPerDay).reduce((acc, w) => acc + w.trimp, 0);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                rolling_trimp: { last_7d: sum(7), last_28d: sum(28), last_90d: sum(90) },
                sessions: withLoad.map(({ date, type, trimp }) => ({ date, type, trimp })),
              }, null, 2),
            }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });

  return server;
}

// ── Vercel handler ──────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET" && req.url?.includes("ping")) {
    return res.status(200).json({ ok: true });
  }

  const tokenHeader = req.headers["x-garmin-token"] as string | undefined;

  let gc: GarminConnect | undefined;
  if (tokenHeader) {
    try {
      gc = await createClientFromToken(tokenHeader);
    } catch {
      return res.status(401).json({ error: "Invalid x-garmin-token header." });
    }
  } else if (!process.env.GARMIN_EMAIL || !process.env.GARMIN_PASSWORD) {
    return res.status(401).json({
      error: "Set x-garmin-token in your MCP config headers. See README for setup instructions.",
    });
  }
  // gc=undefined → tools fall back to env-var singleton via getEnvClient()

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — new session per request
  });

  const server = buildServer(gc);
  await server.connect(transport);
  await transport.handleRequest(req as any, res as any, req.body);
}
