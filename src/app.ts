import { Hono } from "hono";
import type { Config } from "./config.js";
import { createStatusService, type StatusServiceOptions } from "./status.js";
import { registerPageRoutes } from "./routes/page.js";

export function createApp(config: Config, options: StatusServiceOptions = {}) {
  const status = createStatusService(config, options);
  const app = new Hono();
  app.get("/api/status", async (c) => c.json(await status.getStatus()));
  registerPageRoutes(app);
  return app;
}
