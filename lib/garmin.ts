import { GarminConnect } from "garmin-connect";
import type { IActivity } from "garmin-connect/dist/garmin/types/activity";

export type { IActivity };

export type HRSample = { time: number; heartRate: number }; // time = elapsed seconds

let client: GarminConnect | null = null;

async function getClient(): Promise<GarminConnect> {
  if (client) return client;
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) throw new Error("GARMIN_EMAIL and GARMIN_PASSWORD must be set");
  client = new GarminConnect({ username: email, password });
  await client.login(email, password);
  return client;
}

export async function listActivities(
  limit = 20,
  start = 0,
  activityType?: string
): Promise<IActivity[]> {
  const gc = await getClient();
  return gc.getActivities(start, limit, activityType as any);
}

export async function getActivity(activityId: number): Promise<IActivity> {
  const gc = await getClient();
  return gc.getActivity({ activityId });
}

export async function getHRTimeSeries(activityId: number): Promise<HRSample[]> {
  const gc = await getClient();

  // Use the raw Garmin activity details endpoint — the typed SDK doesn't wrap this
  const details = await gc.get<{
    metricDescriptors?: Array<{ metricsType: string; metricsIndex: number }>;
    activityDetailMetrics?: Array<{ startTimeGMT: string; metrics: number[] }>;
  }>(`/activity-service/activity/${activityId}/details`, { maxChartSize: 2000 });

  if (!details.metricDescriptors || !details.activityDetailMetrics) return [];

  const hrDesc = details.metricDescriptors.find((d) => d.metricsType === "HEART_RATE");
  if (!hrDesc) return [];

  const idx = hrDesc.metricsIndex;
  const origin = details.activityDetailMetrics[0]?.startTimeGMT;
  const originMs = origin ? new Date(origin).getTime() : 0;

  return details.activityDetailMetrics
    .filter((p) => p.metrics[idx] != null && p.metrics[idx] > 0)
    .map((p) => ({
      time: Math.round((new Date(p.startTimeGMT).getTime() - originMs) / 1000),
      heartRate: p.metrics[idx],
    }));
}

export async function getAthleteProfile(): Promise<{
  displayName: string;
  vo2MaxValue: number | null;
  restingHeartRate: number | null;
  maxHROverride: number | null;
}> {
  const gc = await getClient();
  const user = await gc.getUserProfile();

  // User settings contains HR data
  const settings = await gc.getUserSettings().catch(() => null);

  return {
    displayName: (user as any).displayName ?? "",
    vo2MaxValue: (user as any).vo2MaxValue ?? null,
    restingHeartRate: (settings as any)?.userData?.restingHeartRate ?? null,
    maxHROverride: (settings as any)?.userData?.maxHeartRate ?? null,
  };
}
