import { GarminConnect } from "garmin-connect";
import { config } from "dotenv";
import path from "path";

async function main() {
  config({ path: path.resolve(process.cwd(), ".env.local") });

  const email = process.env.GARMIN_EMAIL!;
  const password = process.env.GARMIN_PASSWORD!;

  const gc = new GarminConnect({ username: email, password });
  await gc.login(email, password);

  const activityId = Number(process.argv[2] ?? 23063541544);
  const baseUrl: string = (gc as any).url.ACTIVITY;
  console.log("ACTIVITY base URL:", baseUrl);
  console.log("Testing activity:", activityId);

  const details = await (gc as any).get(`${baseUrl}${activityId}/details`, { params: { maxChartSize: 2000 } }) as any;
  console.log("Top-level keys:", Object.keys(details));

  if (!details.metricDescriptors || !details.activityDetailMetrics) {
    console.log("No data returned.");
    return;
  }

  const hrDesc = details.metricDescriptors.find((d: any) => d.key === "directHeartRate");
  const timeDesc = details.metricDescriptors.find((d: any) => d.key === "sumElapsedDuration");
  if (!hrDesc || !timeDesc) { console.log("Missing descriptors"); return; }

  const all = details.activityDetailMetrics.filter((p: any) => p.metrics[hrDesc.metricsIndex] > 0);
  const ti = timeDesc.metricsIndex, hi = hrDesc.metricsIndex;
  const mid = Math.floor(all.length / 2);
  console.log(`Total samples: ${all.length}, activity: 63 min = 3780s`);
  console.log(`First: time_raw=${all[0]?.metrics[ti]}, hr=${all[0]?.metrics[hi]}`);
  console.log(`Mid:   time_raw=${all[mid]?.metrics[ti]}, hr=${all[mid]?.metrics[hi]}`);
  console.log(`Last:  time_raw=${all.at(-1)?.metrics[ti]}, hr=${all.at(-1)?.metrics[hi]}`);
}

main().catch(console.error);
