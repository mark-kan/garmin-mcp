import { GarminConnect } from "garmin-connect";
import type { IActivity } from "garmin-connect/dist/garmin/types/activity";

export type { IActivity };

export type HRSample = { time: number; heartRate: number }; // time = elapsed seconds

let envClient: GarminConnect | null = null;

async function getEnvClient(): Promise<GarminConnect> {
  if (envClient) return envClient;
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) throw new Error("GARMIN_EMAIL and GARMIN_PASSWORD must be set");
  envClient = new GarminConnect({ username: email, password });
  await envClient.login(email, password);
  return envClient;
}

export async function createClientFromToken(tokenB64: string): Promise<GarminConnect> {
  const { oauth1, oauth2 } = JSON.parse(Buffer.from(tokenB64, "base64").toString("utf8"));
  const gc = new GarminConnect({ username: "", password: "" });
  gc.loadToken(oauth1, oauth2);
  return gc;
}

async function resolve(gc?: GarminConnect): Promise<GarminConnect> {
  return gc ?? getEnvClient();
}

export async function listActivities(
  limit = 20,
  start = 0,
  activityType?: string,
  gc?: GarminConnect
): Promise<IActivity[]> {
  const client = await resolve(gc);
  return client.getActivities(start, limit, activityType as any);
}

export async function getActivity(activityId: number, gc?: GarminConnect): Promise<IActivity> {
  const client = await resolve(gc);
  return client.getActivity({ activityId });
}

export async function getHRTimeSeries(activityId: number, gc?: GarminConnect): Promise<HRSample[]> {
  const client = await resolve(gc);

  // gc.get() passes to axios without a base URL — must use the full URL.
  // (client as any).url.ACTIVITY = https://connectapi.garmin.com/activity-service/activity/
  const baseUrl: string = (client as any).url.ACTIVITY;
  const details = await client.get<{
    metricDescriptors?: Array<{ key: string; metricsIndex: number; unit: { factor: number } }>;
    activityDetailMetrics?: Array<{ metrics: (number | null)[] }>;
  }>(`${baseUrl}${activityId}/details`, { params: { maxChartSize: 2000 } });

  if (!details.metricDescriptors || !details.activityDetailMetrics) return [];

  const hrDesc = details.metricDescriptors.find((d) => d.key === "directHeartRate");
  const timeDesc = details.metricDescriptors.find((d) => d.key === "sumElapsedDuration");
  if (!hrDesc) return [];

  const hrIdx = hrDesc.metricsIndex;
  const timeIdx = timeDesc?.metricsIndex ?? -1;

  // Raw sumElapsedDuration values are already in seconds despite factor=1000 in unit metadata.
  return details.activityDetailMetrics
    .filter((p) => p.metrics[hrIdx] != null && (p.metrics[hrIdx] as number) > 0)
    .map((p, i) => ({
      time: timeIdx >= 0 ? Math.round(p.metrics[timeIdx] as number) : i,
      heartRate: p.metrics[hrIdx] as number,
    }));
}

export async function getAthleteProfile(gc?: GarminConnect): Promise<{
  displayName: string;
  vo2MaxValue: number | null;
  restingHeartRate: number | null;
  maxHROverride: number | null;
}> {
  const client = await resolve(gc);
  const user = await client.getUserProfile();
  const settings = await client.getUserSettings().catch(() => null);

  return {
    displayName: (user as any).displayName ?? "",
    vo2MaxValue: (user as any).vo2MaxValue ?? null,
    restingHeartRate: (settings as any)?.userData?.restingHeartRate ?? null,
    maxHROverride: (settings as any)?.userData?.maxHeartRate ?? null,
  };
}
