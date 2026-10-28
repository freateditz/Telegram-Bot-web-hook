const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupTestDatabase, cleanupTestDatabase } = require("./setup");
const { createWorkerApp } = require("../backend/src/workerApp");

describe("Telegram Webhook Security & Idempotency", () => {
    let prisma;
    let app;
    const testSecret = "super_secure_webhook_token_987";
    const mockEnv = {
        BOT_TOKEN: "123456789:MOCK_TOKEN",
        WEBHOOK_SECRET: testSecret,
    };

    before(() => {
        prisma = setupTestDatabase();
        app = createWorkerApp();
    });

    after(async () => {
        if (prisma) await prisma.$disconnect();
        cleanupTestDatabase();
    });

    async function sendWebhook(body, headers = {}) {
        const req = new Request("https://test.workers.dev/api/webhook", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
            body: typeof body === "string" ? body : JSON.stringify(body),
        });

        return app.fetch(req, mockEnv);
    }

    it("should reject webhook with 401 when secret token is missing", async () => {
        const res = await sendWebhook({ update_id: 1001, message: { text: "hello" } });
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.match(data.error, /Unauthorized/);
    });

    it("should reject webhook with 401 when secret token is invalid", async () => {
        const res = await sendWebhook(
            { update_id: 1002, message: { text: "hello" } },
            { "X-Telegram-Bot-Api-Secret-Token": "wrong_secret_token" }
        );
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.match(data.error, /Unauthorized/);
    });

    it("should reject malformed JSON payloads with 400", async () => {
        const res = await sendWebhook(
            "not-valid-json{{{",
            { "X-Telegram-Bot-Api-Secret-Token": testSecret }
        );
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.ok, false);
        assert.match(data.error, /Malformed/);
    });

    it("should accept valid webhook with secret token and process message update", async () => {
        const update = {
            update_id: 5001,
            message: {
                message_id: 1,
                chat: { id: 12345 },
                from: { id: 12345 },
                text: "test message",
            },
        };

        const res = await sendWebhook(update, {
            "X-Telegram-Bot-Api-Secret-Token": testSecret,
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ok, true);
    });

    it("should prevent duplicate updates from reprocessing (idempotency)", async () => {
        const updateId = 88776655;
        const update = {
            update_id: updateId,
            message: {
                message_id: 2,
                chat: { id: 99999 },
                from: { id: 99999 },
                text: "hello idempotency",
            },
        };

        // First delivery: should be processed normally
        const res1 = await sendWebhook(update, {
            "X-Telegram-Bot-Api-Secret-Token": testSecret,
        });
        assert.equal(res1.status, 200);
        const data1 = await res1.json();
        assert.equal(data1.ok, true);
        assert.equal(data1.duplicate, undefined);

        // Second delivery (simulating Telegram retry): should detect duplicate
        const res2 = await sendWebhook(update, {
            "X-Telegram-Bot-Api-Secret-Token": testSecret,
        });
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.ok, true);
        assert.equal(data2.duplicate, true);
    });

    it("should support alternate webhook paths: /telegram/webhook and /webhook", async () => {
        const req1 = new Request("https://test.workers.dev/telegram/webhook", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Telegram-Bot-Api-Secret-Token": testSecret,
            },
            body: JSON.stringify({ update_id: 6001, message: { text: "alt 1" } }),
        });
        const res1 = await app.fetch(req1, mockEnv);
        assert.equal(res1.status, 200);

        const req2 = new Request("https://test.workers.dev/webhook", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Telegram-Bot-Api-Secret-Token": testSecret,
            },
            body: JSON.stringify({ update_id: 6002, message: { text: "alt 2" } }),
        });
        const res2 = await app.fetch(req2, mockEnv);
        assert.equal(res2.status, 200);
    });
});
