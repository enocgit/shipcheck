import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

/**
 * Serves the one-page UI from src/web (ADR-0002: static assets, no build step).
 * ponytail: root is cwd-relative, so run the server from the repo root
 * (`pnpm dev` or `node dist/index.js`); relocate assets if that changes.
 */
export function registerPageRoutes(app: Hono) {
  app.use("*", serveStatic({ root: "./src/web" }));
}
