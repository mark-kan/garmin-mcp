import { GarminConnect } from "garmin-connect";
import type { IActivity } from "garmin-connect/dist/garmin/types/activity";

export type { IActivity };

export type HRSample = { time: number; heartRate: number }; // time = elapsed seconds

export type TimeseriesRow = {
  t: number;          // elapsed seconds
  hr: number | null;  // bpm
  speed_mps: number | null;
  power_w: number | null;
  elevation_m: number | null;
  cadence_spm: number | null;
};

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

type ActivityDetails = {
  metricDescriptors: Array<{ key: string; metricsIndex: number; unit: { factor: number } }>;
  activityDetailMetrics: Array<{ metrics: (number | null)[] }>;
};

async function fetchDetails(activityId: number, gc: GarminConnect): Promise<ActivityDetails | null> {
  // gc.get() passes to axios without a base URL — must use the full URL.
  const baseUrl: string = (gc as any).url.ACTIVITY;
  const details = await gc.get<Partial<ActivityDetails>>(
    `${baseUrl}${activityId}/details`,
    { params: { maxChartSize: 2000 } }
  );
  if (!details.metricDescriptors || !details.activityDetailMetrics) return null;
  return details as ActivityDetails;
}

function idx(details: ActivityDetails, key: string): number {
  return details.metricDescriptors.find((d) => d.key === key)?.metricsIndex ?? -1;
}

function val(metrics: (number | null)[], i: number): number | null {
  return i >= 0 ? (metrics[i] ?? null) : null;
}

export async function getHRTimeSeries(activityId: number, gc?: GarminConnect): Promise<HRSample[]> {
  const client = await resolve(gc);
  const details = await fetchDetails(activityId, client);
  if (!details) return [];

  const hrIdx = idx(details, "directHeartRate");
  const timeIdx = idx(details, "sumElapsedDuration");
  if (hrIdx < 0) return [];

  // Raw sumElapsedDuration values are already in seconds despite factor=1000 in unit metadata.
  return details.activityDetailMetrics
    .filter((p) => (p.metrics[hrIdx] ?? 0) > 0)
    .map((p, i) => ({
      time: timeIdx >= 0 ? Math.round(p.metrics[timeIdx] as number) : i,
      heartRate: p.metrics[hrIdx] as number,
    }));
}

export async function getSessionTimeseries(
  activityId: number,
  everySecs = 10,
  gc?: GarminConnect
): Promise<TimeseriesRow[]> {
  const client = await resolve(gc);
  const details = await fetchDetails(activityId, client);
  if (!details) return [];

  const timeIdx  = idx(details, "sumElapsedDuration");
  const hrIdx    = idx(details, "directHeartRate");
  const speedIdx = idx(details, "directSpeed");
  const powerIdx = idx(details, "directPower");
  const elevIdx  = idx(details, "directElevation");
  const cadIdx   = idx(details, "directRunCadence");

  const rows: TimeseriesRow[] = [];
  let nextT = 0;

  for (const p of details.activityDetailMetrics) {
    const t = timeIdx >= 0 ? Math.round(p.metrics[timeIdx] as number) : 0;
    if (t < nextT) continue;
    nextT = t + everySecs;

    rows.push({
      t,
      hr:          val(p.metrics, hrIdx),
      speed_mps:   val(p.metrics, speedIdx),
      power_w:     val(p.metrics, powerIdx),
      elevation_m: val(p.metrics, elevIdx),
      cadence_spm: val(p.metrics, cadIdx),
    });
  }

  return rows;
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
