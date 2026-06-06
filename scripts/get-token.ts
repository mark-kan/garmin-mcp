import { GarminConnect } from "garmin-connect";

const email = process.env.GARMIN_EMAIL;
const password = process.env.GARMIN_PASSWORD;

if (!email || !password) {
  console.error("Usage: GARMIN_EMAIL=you@example.com GARMIN_PASSWORD=pass npx tsx scripts/get-token.ts");
  process.exit(1);
}

const gc = new GarminConnect({ username: email, password });
await gc.login(email, password);
const token = gc.exportToken();
const encoded = Buffer.from(JSON.stringify(token)).toString("base64");

console.log("\nYour Garmin token (paste this into your MCP config as x-garmin-token):\n");
console.log(encoded);
console.log(`
Example MCP config:

{
  "mcpServers": {
    "garmin": {
      "type": "http",
      "url": "https://garmin-mcp-kappa.vercel.app/api/mcp",
      "headers": {
        "x-garmin-token": "${encoded}"
      }
    }
  }
}
`);
