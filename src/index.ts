import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const port = Number(process.env.PORT) || 3000;

// No viewer authentication in v1 (ADR-0004): bind to loopback so private-repo
// data is reachable only from this machine. Wider exposure is a deployment
// decision that trips the viewer-auth trigger in the production register.
serve({ fetch: createApp(config).fetch, port, hostname: "127.0.0.1" });
console.log(`shipcheck: serving ${config.owner}/${config.name} on http://127.0.0.1:${port}`);
