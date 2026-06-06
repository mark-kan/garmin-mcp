import type { IActivity, HRSample } from "./garmin";

export type ZoneDistribution = {
  z1: number; z2: number; z3: number; z4: number; z5: number; // seconds
};

export type HRAnalysis = {
  zones: ZoneDistribution;
  zonePct: ZoneDistribution;
  trimp: number;
  drift: number | null;   // HR drift % (first half avg vs second half avg)
  decoupling: number | null; // aerobic decoupling % (pace:HR efficiency change)
  avgHR: number;
  maxHR: number;
};

export function computeZones(
  samples: HRSample[],
  maxHR: number
): ZoneDistribution {
  const thresholds = [0.6, 0.7, 0.8, 0.9, 1.0].map((f) => f * maxHR);
  const zones: ZoneDistribution = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  const keys = ["z1", "z2", "z3", "z4", "z5"] as const;

  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].time - samples[i - 1].time);
    const hr = samples[i].heartRate;
    const zone = thresholds.findIndex((t) => hr < t);
    const key = keys[zone === -1 ? 4 : zone];
    zones[key] += dt;
  }
  return zones;
}

export function computeTRIMP(
  samples: HRSample[],
  restHR: number,
  maxHR: number,
  isFemale = false
): number {
  // Banister TRIMP
  const b = isFemale ? 1.67 : 1.92;
  let trimp = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].time - samples[i - 1].time) / 60; // minutes
    const hr = samples[i].heartRate;
    const hrr = (hr - restHR) / (maxHR - restHR); // HR reserve ratio
    trimp += dt * hrr * 0.64 * Math.exp(b * hrr);
  }
  return Math.round(trimp);
}

export function computeHRDrift(samples: HRSample[]): number | null {
  if (samples.length < 10) return null;
  const mid = Math.floor(samples.length / 2);
  const first = samples.slice(0, mid);
  const second = samples.slice(mid);
  const avg = (arr: HRSample[]) =>
    arr.reduce((s, p) => s + p.heartRate, 0) / arr.length;
  const a1 = avg(first);
  const a2 = avg(second);
  return Math.round(((a2 - a1) / a1) * 100 * 10) / 10; // percent, 1dp
}

export function analyzeHR(
  samples: HRSample[],
  restHR: number,
  maxHR: number
): HRAnalysis {
  if (samples.length === 0) {
    return {
      zones: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
      zonePct: { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 },
      trimp: 0,
      drift: null,
      decoupling: null,
      avgHR: 0,
      maxHR: 0,
    };
  }

  const zones = computeZones(samples, maxHR);
  const totalSecs = Object.values(zones).reduce((a, b) => a + b, 0) || 1;
  const zonePct = Object.fromEntries(
    Object.entries(zones).map(([k, v]) => [k, Math.round((v / totalSecs) * 100)])
  ) as ZoneDistribution;

  const trimp = computeTRIMP(samples, restHR, maxHR);
  const drift = computeHRDrift(samples);
  const hrs = samples.map((s) => s.heartRate);
  const avgHR = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
  const peakHR = Math.max(...hrs);

  return { zones, zonePct, trimp, drift, decoupling: null, avgHR, maxHR: peakHR };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;
}

export function mpsToMinPerKm(mps: number): string {
  if (!mps || mps <= 0) return "–";
  const secsPerKm = 1000 / mps;
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")} /km`;
}

export function summarizeActivity(a: IActivity): Record<string, unknown> {
  return {
    id: a.activityId,
    name: a.activityName,
    type: a.activityType?.typeKey,
    date: a.startTimeLocal,
    duration: formatDuration(a.duration),
    distance_km: a.distance ? Math.round(a.distance / 10) / 100 : null,
    avg_pace: mpsToMinPerKm(a.averageSpeed),
    hr: { avg: a.averageHR, max: a.maxHR },
    elevation: { gain: a.elevationGain, loss: a.elevationLoss },
    calories: a.calories,
    training_effect: {
      aerobic: a.aerobicTrainingEffect,
      anaerobic: a.anaerobicTrainingEffect,
    },
    tss: a.trainingStressScore ?? null,
    avg_power_w: (a as any).avgPower ?? null,
  };
}
