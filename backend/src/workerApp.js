const { Hono } = require("hono");
const envConfig = require("./config/env");
const HttpError = require("./utils/httpError");
const { setPrismaClient, getPrismaClient } = require("./database/prisma");
const { handleTelegramWebhook } = require("../../bot/bot");

// Controllers
const healthController = require("./controllers/healthController");
const platformController = require("./controllers/platformController");
const categoryController = require("./controllers/categoryController");
const resourceController = require("./controllers/resourceController");
const settingController = require("./controllers/settingController");
const userController = require("./controllers/userController");
const projectController = require("./controllers/projectController");
const channelController = require("./controllers/channelController");
const analyticsController = require("./controllers/analyticsController");
const verificationController = require("./controllers/verificationController");

/**
 * Adapter that lets existing Express controller functions execute seamlessly
 * in Cloudflare Workers with standard Request/Response.
 */
function adapt(controllerFn) {
  return async (c) => {
    return new Promise(async (resolve, reject) => {
      let statusCode = 200;
      const headers = {};

      const req = {
        params: c.req.param(),
        query: c.req.query(),
        body: {},
        headers: c.req.header(),
        url: c.req.url,
        path: c.req.path,
      };

      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          req.body = await c.req.json();
        } catch (_) {
          req.body = {};
        }
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        try {
          req.body = await c.req.parseBody();
        } catch (_) {
          req.body = {};
        }
      }

      let settled = false;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        setHeader(name, value) {
          headers[name.toLowerCase()] = value;
          return this;
        },
        json(data) {
          if (!settled) {
            settled = true;
            headers["content-type"] = "application/json";
            resolve(new Response(JSON.stringify(data), { status: statusCode, headers }));
          }
          return this;
        },
        send(data) {
          if (!settled) {
            settled = true;
            const body = data !== undefined && data !== null ? String(data) : null;
            resolve(new Response(body, { status: statusCode, headers }));
          }
          return this;
        },
        end() {
          if (!settled) {
            settled = true;
            resolve(new Response(null, { status: statusCode, headers }));
          }
          return this;
        },
      };

      const next = (err) => {
        if (!settled) {
          settled = true;
          if (err) reject(err);
          else resolve(new Response(null, { status: statusCode, headers }));
        }
      };

      try {
        const ret = controllerFn(req, res, next);
        if (ret && typeof ret.then === "function") {
          await ret;
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });
  };
}

function createWorkerApp() {
  const app = new Hono();

  // Global Context Initialization Middleware
  app.use("*", async (c, next) => {
    // 1. Initialize environment config from worker env bindings & secrets
    if (c.env) {
      envConfig.initEnv(c.env);
      // 2. Initialize Prisma client with D1 binding
      if (c.env.DB) {
        const client = getPrismaClient(c.env.DB);
        setPrismaClient(client);
      }
    }

    // Set base URL for self-dispatching bot client
    try {
      const url = new URL(c.req.url);
      globalThis.__WORKER_BASE_URL = url.origin;
    } catch (_) {}

    // Register internal fetch for in-process bot calls
    let executionCtx = null;
    try {
      executionCtx = c.executionCtx;
    } catch (_) {}
    globalThis.__INTERNAL_FETCH = (req) => app.fetch(req, c.env, executionCtx);

    // 3. Handle CORS
    const origin = c.req.header("Origin");
    if (c.req.method === "OPTIONS") {
      if (envConfig.isOriginAllowed(origin, envConfig.corsOrigins)) {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": origin || "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token",
            "Access-Control-Max-Age": "86400",
          },
        });
      }
      return new Response("CORS origin not allowed", { status: 403 });
    }

    await next();

    // Append CORS headers to responses
    if (origin && envConfig.isOriginAllowed(origin, envConfig.corsOrigins)) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
      c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token");
    }
  });

  // Centralized Error Handling
  app.onError((error, c) => {
    console.error("Worker API error:", error);

    if (error instanceof HttpError) {
      return c.json({
        ok: false,
        error: error.message,
        details: error.details,
      }, error.statusCode);
    }

    if (error && /^CORS:/.test(error.message || "")) {
      return c.json({ ok: false, error: error.message }, 403);
    }

    if (error?.code === "P2002") {
      return c.json({
        ok: false,
        error: "Unique constraint violation",
        target: error.meta?.target || null,
      }, 409);
    }

    if (error?.code === "P2025") {
      return c.json({
        ok: false,
        error: "Record not found",
      }, 404);
    }

    return c.json({
      ok: false,
      error: error.message || "Internal server error",
    }, 500);
  });

  // --- Health Endpoints ---
  app.get("/health", (c) => c.json({ ok: true, service: "backend", status: "healthy" }));
  app.get("/api/health", adapt(healthController.healthCheck));

  // --- Telegram Webhook Endpoint ---
  async function handleWebhookRoute(c) {
    const configuredSecret = c.env?.WEBHOOK_SECRET || envConfig.webhookSecret;
    if (configuredSecret) {
      const headerSecret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
      if (headerSecret !== configuredSecret) {
        console.warn("[Webhook] Unauthorized webhook request: Invalid secret token");
        return c.json({ ok: false, error: "Unauthorized: Invalid secret token" }, 401);
      }
    }

    let update;
    try {
      update = await c.req.json();
    } catch (parseError) {
      console.error("[Webhook] Malformed JSON payload:", parseError.message);
      return c.json({ ok: false, error: "Malformed JSON payload" }, 400);
    }

    try {
      const result = await handleTelegramWebhook(update, c.env);
      return c.json(result);
    } catch (handlerError) {
      console.error("[Webhook] Error processing update:", handlerError.message);
      return c.json({ ok: false, error: handlerError.message });
    }
  }

  app.post("/api/webhook", handleWebhookRoute);
  app.post("/telegram/webhook", handleWebhookRoute);
  app.post("/webhook", handleWebhookRoute);

  // --- Platforms ---
  app.get("/api/platforms", adapt(platformController.listPlatforms));
  app.post("/api/platforms", adapt(platformController.createPlatform));
  app.get("/api/platforms/:id", adapt(platformController.getPlatform));
  app.patch("/api/platforms/:id", adapt(platformController.updatePlatform));
  app.delete("/api/platforms/:id", adapt(platformController.deletePlatform));

  // --- Categories ---
  app.get("/api/categories", adapt(categoryController.listCategories));
  app.post("/api/categories", adapt(categoryController.createCategory));
  app.get("/api/categories/:id", adapt(categoryController.getCategory));
  app.patch("/api/categories/:id", adapt(categoryController.updateCategory));
  app.delete("/api/categories/:id", adapt(categoryController.deleteCategory));

  // --- Channels ---
  app.get("/api/channels", adapt(channelController.listChannels));
  app.post("/api/channels", adapt(channelController.createChannel));
  app.get("/api/channels/:id", adapt(channelController.getChannel));
  app.patch("/api/channels/:id", adapt(channelController.updateChannel));
  app.put("/api/channels/:id", adapt(channelController.updateChannel));
  app.delete("/api/channels/:id", adapt(channelController.deleteChannel));

  // --- Projects ---
  app.get("/api/projects", adapt(projectController.listProjects));
  app.post("/api/projects", adapt(projectController.createProject));
  app.get("/api/projects/slug/:slug", adapt(projectController.getProjectBySlug));
  app.get("/api/projects/slug/:slug/delivery", adapt(projectController.getProjectDelivery));
  app.get("/api/projects/:id", adapt(projectController.getProject));
  app.put("/api/projects/:id", adapt(projectController.updateProject));
  app.patch("/api/projects/:id", adapt(projectController.updateProject));
  app.delete("/api/projects/:id", adapt(projectController.deleteProject));
  app.post("/api/projects/:id/view", adapt(projectController.trackView));
  app.post("/api/projects/:id/failed-verification", adapt(projectController.trackFailedVerification));
  app.post("/api/projects/:id/download", adapt(projectController.trackDownload));

  // --- Resources ---
  app.get("/api/resources", adapt(resourceController.listResources));
  app.post("/api/resources", adapt(resourceController.createResource));
  app.get("/api/resources/slug/:slug", adapt(resourceController.getResourceBySlug));
  app.get("/api/resources/:id", adapt(resourceController.getResource));
  app.patch("/api/resources/:id", adapt(resourceController.updateResource));
  app.delete("/api/resources/:id", adapt(resourceController.deleteResource));
  app.post("/api/resources/:id/download", adapt(resourceController.trackDownload));

  // --- Menus & Public Resources ---
  app.get("/api/menu/:platform/:category", adapt(resourceController.getMenuResources));
  app.get("/api/resource/:platform/:slug", adapt(resourceController.getPublicResource));

  // --- Settings ---
  app.get("/api/settings", adapt(settingController.listSettings));
  app.post("/api/settings", adapt(settingController.createSetting));
  app.get("/api/settings/:id", adapt(settingController.getSetting));
  app.patch("/api/settings/:id", adapt(settingController.updateSetting));
  app.delete("/api/settings/:id", adapt(settingController.deleteSetting));

  // --- Users ---
  app.get("/api/users", adapt(userController.listUsers));
  app.post("/api/users", adapt(userController.createUser));
  app.get("/api/users/telegram/:telegramId", adapt(userController.getUserByTelegramId));
  app.get("/api/users/:id", adapt(userController.getUser));
  app.patch("/api/users/:id", adapt(userController.updateUser));
  app.delete("/api/users/:id", adapt(userController.deleteUser));
  app.post("/api/users/pending-project", adapt(userController.setPendingProject));
  app.post("/api/users/upsert-pending-project", adapt(userController.upsertPendingProject));
  app.post("/api/users/clear-pending-project", adapt(userController.clearPendingProject));
  app.post("/api/users/upsert-pending-resource", adapt(userController.upsertPendingResource));
  app.post("/api/users/clear-pending-resource", adapt(userController.clearPendingResource));

  // --- Verification ---
  app.get("/api/verification/prompt", adapt(verificationController.getPrompt));
  app.get("/api/verification/status/:userId", adapt(verificationController.getStatus));
  app.post("/api/verification/check-member", adapt(verificationController.checkMember));
  app.post("/api/verification/mark", adapt(verificationController.markVerified));
  app.post("/api/verification/unverify", adapt(verificationController.unverify));

  // --- Analytics ---
  app.get("/api/analytics/health", adapt(analyticsController.health));
  app.post("/api/analytics/track", adapt(analyticsController.track));
  app.get("/api/analytics/overview", adapt(analyticsController.getOverview));
  app.get("/api/analytics/daily", adapt(analyticsController.getDaily));
  app.get("/api/analytics/projects", adapt(analyticsController.getProjects));
  app.get("/api/analytics/projects/:projectId", adapt(analyticsController.getProjectAnalytics));
  app.get("/api/analytics/resources/top-downloaded", adapt(analyticsController.getTopDownloadedResources));
  app.get("/api/analytics/resources/:resourceId", adapt(analyticsController.getResourceAnalytics));
  app.get("/api/analytics/users/activity", adapt(analyticsController.getUserActivity));
  app.get("/api/analytics/users/top-downloaders", adapt(analyticsController.getTopDownloaders));
  app.get("/api/analytics/users/search/:telegramId", adapt(analyticsController.searchUser));
  app.get("/api/analytics/top-projects", adapt(analyticsController.getTopProjects));
  app.get("/api/analytics/advanced", adapt(analyticsController.getAdvancedAnalytics));
  app.get("/api/analytics/recent-events", adapt(analyticsController.getRecentEvents));

  return app;
}

module.exports = {
  createWorkerApp,
};
