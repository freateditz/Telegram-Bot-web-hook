const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Environment & Production Configuration Safety", () => {
    it("should allow dynamic env initialization with initEnv()", () => {
        const env = require("../backend/src/config/env");
        env.initEnv({
            BOT_TOKEN: "custom_worker_bot_token",
            CHANNEL: "@worker_channel",
            YOUTUBE: "https://youtube.com/@worker",
            CHANNEL_LINK: "https://t.me/worker_channel",
            CORS_ORIGINS: "https://custom-admin.example.com,https://preview.example.com",
            WEBHOOK_SECRET: "my_worker_webhook_secret",
        });

        assert.equal(env.botToken, "custom_worker_bot_token");
        assert.equal(env.telegramChannel, "@worker_channel");
        assert.equal(env.youtubeUrl, "https://youtube.com/@worker");
        assert.equal(env.channelLink, "https://t.me/worker_channel");
        assert.equal(env.webhookSecret, "my_worker_webhook_secret");
        assert.ok(env.corsOrigins.includes("https://custom-admin.example.com"));
        assert.ok(env.corsOrigins.includes("https://preview.example.com"));
    });

    it("should correctly validate CORS origins (production, previews, localhost)", () => {
        const env = require("../backend/src/config/env");
        const allowed = env.corsOrigins;

        // Same-origin (no Origin header) should be permitted
        assert.equal(env.isOriginAllowed(undefined, allowed), true);
        assert.equal(env.isOriginAllowed("", allowed), true);

        // Vercel deployment and previews
        assert.equal(env.isOriginAllowed("https://telegram-bot-22xi.vercel.app", allowed), true);
        assert.equal(env.isOriginAllowed("https://any-subdomain.vercel.app", allowed), true);

        // Localhost development
        assert.equal(env.isOriginAllowed("http://localhost:5173", allowed), true);
        assert.equal(env.isOriginAllowed("http://127.0.0.1:3000", allowed), true);

        // Disallowed external origins
        assert.equal(env.isOriginAllowed("https://malicious-site.com", allowed), false);
    });

    it("should throw an explicit error in production when BACKEND_BASE_URL is missing", () => {
        const backendClient = require("../bot/services/backendClient");
        const projectService = require("../bot/services/projectService");

        const origNodeEnv = process.env.NODE_ENV;
        const origBaseUrl = process.env.BACKEND_BASE_URL;
        const origWorkerUrl = globalThis.__WORKER_BASE_URL;

        try {
            process.env.NODE_ENV = "production";
            delete process.env.BACKEND_BASE_URL;
            delete globalThis.__WORKER_BASE_URL;

            assert.throws(() => {
                backendClient.getBaseUrl();
            }, /Configuration error: BACKEND_BASE_URL is not set in production/);

            assert.throws(() => {
                projectService.getBaseUrl();
            }, /Configuration error: BACKEND_BASE_URL is not set in production/);
        } finally {
            process.env.NODE_ENV = origNodeEnv;
            if (origBaseUrl) process.env.BACKEND_BASE_URL = origBaseUrl;
            if (origWorkerUrl) globalThis.__WORKER_BASE_URL = origWorkerUrl;
        }
    });
});
