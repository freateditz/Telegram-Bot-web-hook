const { createWorkerApp } = require("../backend/src/workerApp");
const { getPrismaClient, setPrismaClient } = require("../backend/src/database/prisma");

let appInstance = null;

function getApp() {
  if (!appInstance) {
    appInstance = createWorkerApp();
  }
  return appInstance;
}

export default {
  /**
   * Main HTTP request handler for Cloudflare Workers.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check if the request is destined for the backend API or Telegram webhook
    const isApiRequest = pathname.startsWith("/api/") ||
                         pathname === "/health" ||
                         pathname === "/webhook" ||
                         pathname === "/telegram/webhook";

    if (isApiRequest) {
      const app = getApp();
      return app.fetch(request, env, ctx);
    }

    // Serve static dashboard frontend assets if the ASSETS binding is available
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      // If asset was found, return it directly
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
      // For SPA routing, serve index.html for non-API client routes
      const spaRequest = new Request(new URL("/", request.url), request);
      return env.ASSETS.fetch(spaRequest);
    }

    // Fallback to app router
    const app = getApp();
    return app.fetch(request, env, ctx);
  },

  /**
   * Cloudflare Cron Trigger / scheduled handler.
   * Cleans up processed Telegram updates older than 24 hours to prevent unbounded table growth.
   */
  async scheduled(controller, env, ctx) {
    console.log("[Cron] Running scheduled maintenance tasks at", new Date().toISOString());

    if (env.DB) {
      try {
        const prisma = getPrismaClient(env.DB);
        setPrismaClient(prisma);

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const deleted = await prisma.telegramUpdate.deleteMany({
          where: {
            processedAt: {
              lt: oneDayAgo,
            },
          },
        });

        console.log(`[Cron] Purged ${deleted.count} expired Telegram updates older than 24h`);
      } catch (cronError) {
        console.error("[Cron] Error during scheduled maintenance:", cronError.message);
      }
    }
  },
};
