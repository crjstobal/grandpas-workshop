// Local server. Phones reach it through the web dev server on the LAN, so the join link
// uses this machine's LAN address unless GW_PUBLIC_URL is set.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 8788);
const webPort = Number(process.env.GW_WEB_PORT ?? 5178);
const webProto = process.env.GW_WEB_HTTPS === "1" ? "https" : "http";

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254")) return a.address;
  }
  return "localhost";
}

const phoneBaseUrl = () => process.env.GW_PUBLIC_URL ?? `${webProto}://${lanAddress()}:${webPort}`;

const app = createApp({ phoneBaseUrl });

// The built web app (npm run build), so the Fire TV and the phones can use this one server.
const dist = fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(dist)) {
  const index = readFileSync(`${dist}/index.html`, "utf8");
  app.use("/*", serveStatic({ root: dist }));
  app.get("*", (c) => c.html(index));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`Grandpa's Workshop API and MCP server on http://localhost:${port}`);
  console.log(`Phones join at ${phoneBaseUrl()}/play/<CODE>`);
});
