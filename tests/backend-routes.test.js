const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupTestDatabase, cleanupTestDatabase } = require("./setup");
const { createWorkerApp } = require("../backend/src/workerApp");

describe("Worker Backend REST API Routes", () => {
    let prisma;
    let app;
    const mockEnv = {
        BOT_TOKEN: "123456789:MOCK_TOKEN",
        WEBHOOK_SECRET: "test_secret_abc",
        CHANNEL: "@test_channel",
        YOUTUBE: "https://youtube.com/@test_channel",
        CHANNEL_LINK: "https://t.me/test_channel",
        CORS_ORIGINS: "https://telegram-bot-22xi.vercel.app",
    };

    before(() => {
        prisma = setupTestDatabase();
        app = createWorkerApp();
    });

    after(async () => {
        if (prisma) await prisma.$disconnect();
        cleanupTestDatabase();
    });

    async function makeRequest(path, options = {}) {
        const url = `https://test.workers.dev${path}`;
        const req = new Request(url, {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        return app.fetch(req, mockEnv);
    }

    it("GET /health should return 200 healthy", async () => {
        const res = await makeRequest("/health");
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "healthy");
    });

    it("GET /api/health should return 200 healthy", async () => {
        const res = await makeRequest("/api/health");
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "healthy");
    });

    it("OPTIONS /api/platforms should handle CORS preflight", async () => {
        const req = new Request("https://test.workers.dev/api/platforms", {
            method: "OPTIONS",
            headers: {
                Origin: "https://telegram-bot-22xi.vercel.app",
                "Access-Control-Request-Method": "POST",
            },
        });
        const res = await app.fetch(req, mockEnv);
        assert.equal(res.status, 204);
        assert.equal(res.headers.get("access-control-allow-origin"), "https://telegram-bot-22xi.vercel.app");
    });

    it("CRUD /api/platforms should list, create, get, update, and delete platforms", async () => {
        // List
        const listRes = await makeRequest("/api/platforms");
        assert.equal(listRes.status, 200);
        const list = await listRes.json();
        assert.ok(Array.isArray(list.items));

        // Create
        const createRes = await makeRequest("/api/platforms", {
            method: "POST",
            body: { name: "Linux OS", slug: "linux" },
        });
        assert.equal(createRes.status, 201);
        const created = await createRes.json();
        assert.equal(created.item.slug, "linux");
        const platformId = created.item.id;

        // Get by ID
        const getRes = await makeRequest(`/api/platforms/${platformId}`);
        assert.equal(getRes.status, 200);
        const fetched = await getRes.json();
        assert.equal(fetched.item.name, "Linux OS");

        // Update
        const updateRes = await makeRequest(`/api/platforms/${platformId}`, {
            method: "PATCH",
            body: { name: "GNU/Linux" },
        });
        assert.equal(updateRes.status, 200);
        const updated = await updateRes.json();
        assert.equal(updated.item.name, "GNU/Linux");

        // Delete
        const deleteRes = await makeRequest(`/api/platforms/${platformId}`, {
            method: "DELETE",
        });
        assert.equal(deleteRes.status, 204);
    });

    it("CRUD /api/categories should list, create, get, update, and delete categories", async () => {
        // Create
        const createRes = await makeRequest("/api/categories", {
            method: "POST",
            body: { name: "3D Models", slug: "3d-models", displayOrder: 10 },
        });
        assert.equal(createRes.status, 201);
        const created = await createRes.json();
        const catId = created.item.id;

        // Get
        const getRes = await makeRequest(`/api/categories/${catId}`);
        assert.equal(getRes.status, 200);

        // Update
        const updateRes = await makeRequest(`/api/categories/${catId}`, {
            method: "PATCH",
            body: { displayOrder: 12 },
        });
        assert.equal(updateRes.status, 200);

        // Delete
        const deleteRes = await makeRequest(`/api/categories/${catId}`, {
            method: "DELETE",
        });
        assert.equal(deleteRes.status, 204);
    });

    it("CRUD /api/channels should manage Telegram source channels", async () => {
        const createRes = await makeRequest("/api/channels", {
            method: "POST",
            body: {
                name: "Files Channel",
                channelId: "-1001122334455",
                username: "@files_channel",
                isActive: true,
            },
        });
        assert.equal(createRes.status, 201);
        const channel = (await createRes.json()).item;

        const listRes = await makeRequest("/api/channels");
        assert.equal(listRes.status, 200);
        const channels = (await listRes.json()).items;
        assert.ok(channels.some(c => c.channelId === "-1001122334455"));

        // Delete
        const deleteRes = await makeRequest(`/api/channels/${channel.id}`, {
            method: "DELETE",
        });
        assert.equal(deleteRes.status, 204);
    });

    it("CRUD /api/projects should manage projects and resolve delivery strategies", async () => {
        // Create source channel first
        const chanRes = await makeRequest("/api/channels", {
            method: "POST",
            body: {
                name: "Project Source Channel",
                channelId: "-10099887766",
                isActive: true,
            },
        });
        const chan = (await chanRes.json()).item;

        // Create Project
        const createRes = await makeRequest("/api/projects", {
            method: "POST",
            body: {
                title: "Premiere Pro Preset",
                slug: "premiere-preset",
                description: "Transitions preset pack",
                channelId: chan.id,
                messageId: 88,
                isActive: true,
            },
        });
        assert.equal(createRes.status, 201);
        const project = (await createRes.json()).item;

        // Get by slug
        const slugRes = await makeRequest("/api/projects/slug/premiere-preset");
        assert.equal(slugRes.status, 200);
        assert.equal((await slugRes.json()).item.title, "Premiere Pro Preset");

        // Delivery strategy lookup (channel-based)
        const deliveryRes = await makeRequest("/api/projects/slug/premiere-preset/delivery");
        assert.equal(deliveryRes.status, 200);
        const deliveryData = await deliveryRes.json();
        assert.equal(deliveryData.delivery.strategy, "channel");
        assert.equal(deliveryData.delivery.chatId, "-10099887766");
        assert.equal(deliveryData.delivery.messageId, 88);

        // View and Download tracking
        const viewRes = await makeRequest(`/api/projects/${project.id}/view`, { method: "POST" });
        assert.equal(viewRes.status, 200);

        const dlRes = await makeRequest(`/api/projects/${project.id}/download`, { method: "POST" });
        assert.equal(dlRes.status, 200);

        // Delete
        const delRes = await makeRequest(`/api/projects/${project.id}`, { method: "DELETE" });
        assert.equal(delRes.status, 204);
    });

    it("CRUD /api/resources and bot menu routes", async () => {
        const plat = (await (await makeRequest("/api/platforms")).json()).items[0];
        const cat = (await (await makeRequest("/api/categories")).json()).items[0];

        // Create Resource
        const createRes = await makeRequest("/api/resources", {
            method: "POST",
            body: {
                name: "DaVinci Resolve",
                slug: "davinci-resolve",
                platformId: plat.id,
                categoryId: cat.id,
                downloadLink: "https://example.com/davinci",
                fixLink: "https://example.com/fix",
                tutorialChannelId: "-100111",
                tutorialMessageId: 5,
            },
        });
        assert.equal(createRes.status, 201);
        const resource = (await createRes.json()).item;

        // Bot menu route: /api/menu/:platform/:category
        const menuRes = await makeRequest(`/api/menu/${plat.slug}/${cat.slug}`);
        assert.equal(menuRes.status, 200);
        const menuItems = (await menuRes.json()).items;
        assert.ok(menuItems.some(i => i.slug === "davinci-resolve"));

        // Public resource route: /api/resource/:platform/:slug
        const pubRes = await makeRequest(`/api/resource/${plat.slug}/davinci-resolve`);
        assert.equal(pubRes.status, 200);
        const pubItem = (await pubRes.json()).item;
        assert.equal(pubItem.name, "DaVinci Resolve");

        // Download tracking
        const dlRes = await makeRequest(`/api/resources/${resource.id}/download`, { method: "POST" });
        assert.equal(dlRes.status, 200);
    });

    it("CRUD /api/settings should list, create, update, and get settings", async () => {
        const createRes = await makeRequest("/api/settings", {
            method: "POST",
            body: { key: "siteNotice", value: "Welcome to the new bot!" },
        });
        assert.equal(createRes.status, 201);

        const listRes = await makeRequest("/api/settings");
        assert.equal(listRes.status, 200);
        const items = (await listRes.json()).items;
        assert.ok(items.some(s => s.key === "siteNotice"));
    });

    it("CRUD /api/users and pending pointers", async () => {
        const createRes = await makeRequest("/api/users", {
            method: "POST",
            body: { telegramId: "5544332211" },
        });
        assert.equal(createRes.status, 201);

        // Get by telegramId
        const getRes = await makeRequest("/api/users/telegram/5544332211");
        assert.equal(getRes.status, 200);
        assert.equal((await getRes.json()).item.telegramId, "5544332211");

        // Upsert pending resource
        const pendRes = await makeRequest("/api/users/upsert-pending-resource", {
            method: "POST",
            body: { telegramId: "5544332211", slug: "davinci-resolve" },
        });
        assert.equal(pendRes.status, 200);
        assert.equal((await pendRes.json()).item.pendingResourceSlug, "davinci-resolve");

        // Clear pending resource
        const clearRes = await makeRequest("/api/users/clear-pending-resource", {
            method: "POST",
            body: { telegramId: "5544332211" },
        });
        assert.equal(clearRes.status, 200);

        const checkRes = await makeRequest("/api/users/telegram/5544332211");
        assert.equal((await checkRes.json()).item.pendingResourceSlug, null);
    });

    it("Verification routes: /api/verification/*", async () => {
        // Prompt
        const promptRes = await makeRequest("/api/verification/prompt");
        assert.equal(promptRes.status, 200);
        const prompt = await promptRes.json();
        assert.ok(prompt.youtubeLink);
        assert.ok(prompt.channelLink);

        // Mark verified
        const markRes = await makeRequest("/api/verification/mark", {
            method: "POST",
            body: { userId: "77889900" },
        });
        assert.equal(markRes.status, 200);

        // Check status
        const statusRes = await makeRequest("/api/verification/status/77889900");
        assert.equal(statusRes.status, 200);
        assert.equal((await statusRes.json()).verified, true);

        // Unverify
        const unverifyRes = await makeRequest("/api/verification/unverify", {
            method: "POST",
            body: { userId: "77889900" },
        });
        assert.equal(unverifyRes.status, 200);

        const statusRes2 = await makeRequest("/api/verification/status/77889900");
        assert.equal((await statusRes2.json()).verified, false);
    });

    it("Analytics routes: /api/analytics/*", async () => {
        const trackRes = await makeRequest("/api/analytics/track", {
            method: "POST",
            body: {
                userId: "77889900",
                eventType: "VERIFY_CLICK",
            },
        });
        assert.equal(trackRes.status, 200);

        const overviewRes = await makeRequest("/api/analytics/overview");
        assert.equal(overviewRes.status, 200);
        const overview = await overviewRes.json();
        assert.ok(overview.totalUsers !== undefined || overview.verifyClicks !== undefined);
    });
});
