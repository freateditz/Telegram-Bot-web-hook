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

    it("should verify wrangler.jsonc preserves correct D1 database ID and has no secrets", () => {
        const fs = require("fs");
        const path = require("path");

        const content = fs.readFileSync(path.resolve(__dirname, "../wrangler.jsonc"), "utf8");
        const parsed = JSON.parse(content);

        // Bindings
        assert.equal(parsed.assets?.binding, "ASSETS");
        assert.equal(parsed.assets?.directory, "./dashboard/dist");
        assert.equal(parsed.d1_databases?.[0]?.binding, "DB");
        assert.equal(parsed.d1_databases?.[0]?.database_name, "telegram-bot-db");
        assert.equal(parsed.d1_databases?.[0]?.database_id, "937296a8-e3f1-49b7-859f-32b42573f2e4");

        // Public vars
        assert.equal(parsed.vars?.NODE_ENV, "production");
        assert.equal(parsed.vars?.CHANNEL, "@freat_editz");
        assert.ok(parsed.vars?.CHANNEL_LINK);
        assert.ok(parsed.vars?.YOUTUBE);

        // Security check: No secrets in wrangler.jsonc
        assert.equal(parsed.vars?.BOT_TOKEN, undefined, "BOT_TOKEN must not be in wrangler.jsonc vars!");
        assert.equal(parsed.vars?.WEBHOOK_SECRET, undefined, "WEBHOOK_SECRET must not be in wrangler.jsonc vars!");
    });

    it("should verify .gitignore properly excludes credential files and logs", () => {
        const fs = require("fs");
        const path = require("path");

        const gitignore = fs.readFileSync(path.resolve(__dirname, "../.gitignore"), "utf8");
        assert.ok(gitignore.includes(".env"));
        assert.ok(gitignore.includes(".dev.vars"));
        assert.ok(gitignore.includes("*.log"));
    });

    it("should verify .dev.vars.example exists and contains placeholders only", () => {
        const fs = require("fs");
        const path = require("path");

        const devVars = fs.readFileSync(path.resolve(__dirname, "../.dev.vars.example"), "utf8");
        assert.ok(devVars.includes("BOT_TOKEN="));
        assert.ok(devVars.includes("WEBHOOK_SECRET="));
        assert.ok(!devVars.includes("FREATEDITZ.cloud"));
        assert.ok(!devVars.includes("jagbeC-0ciqsy-takfan"));
    });

    it("should verify Worker source files do not contain __dirname or __filename", () => {
        const fs = require("fs");
        const path = require("path");

        const workerFiles = [
            "../backend/src/config/env.js",
            "../bot/bot.js",
            "../src/worker.js",
            "../backend/src/workerApp.js",
        ];

        for (const file of workerFiles) {
            const content = fs.readFileSync(path.resolve(__dirname, file), "utf8");
            assert.equal(
                content.includes("__dirname"),
                false,
                `${file} must not contain __dirname as it causes ReferenceError in Cloudflare Workers`
            );
            assert.equal(
                content.includes("__filename"),
                false,
                `${file} must not contain __filename in Cloudflare Workers`
            );
        }
    });

    it("should verify createWorkerApp fetch handler responds without __dirname error", async () => {
        const { createWorkerApp } = require("../backend/src/workerApp");
        const app = createWorkerApp();

        const request = new Request("https://worker.test/health");
        const mockEnv = {
            NODE_ENV: "production",
            CHANNEL: "@freat_editz",
            CHANNEL_LINK: "https://t.me/freat_editz",
            YOUTUBE: "https://youtube.com/@freat_editz",
        };

        const res = await app.fetch(request, mockEnv);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ok, true);
        assert.equal(data.service, "backend");
    });
});
