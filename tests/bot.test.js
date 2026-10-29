const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { setupTestDatabase, cleanupTestDatabase } = require("./setup");
const TelegramBotClient = require("../bot/services/telegramBotClient");
const registerStartCommand = require("../bot/commands/start");
const handleCallbackQuery = require("../bot/handlers/callbackHandler");
const handleMessage = require("../bot/handlers/messageHandler");
const backendClient = require("../bot/services/backendClient");
const { createWorkerApp } = require("../backend/src/workerApp");

describe("Telegram Bot Commands, Callbacks, and Handlers", () => {
    let prisma;
    let mockBot;
    let sentMessages = [];
    let copiedMessages = [];
    let answeredCallbacks = [];
    let editedMarkups = [];
    let mockChatMemberStatus = "member";
    let mockChatMemberOk = true;
    let origFetch = null;

    before(() => {
        prisma = setupTestDatabase();
        const app = createWorkerApp();
        globalThis.__INTERNAL_FETCH = (req) => app.fetch(req, {
            BOT_TOKEN: "123456789:MOCK_TOKEN",
            WEBHOOK_SECRET: "mock_secret",
            CHANNEL: "@test_channel",
            YOUTUBE: "https://youtube.com/@test_channel",
            CHANNEL_LINK: "https://t.me/test_channel",
        });

        origFetch = globalThis.fetch;
        globalThis.fetch = async (url, options) => {
            if (typeof url === "string" && url.includes("/getChatMember")) {
                if (!mockChatMemberOk) {
                    return new Response(JSON.stringify({
                        ok: false,
                        error_code: 400,
                        description: "Bad Request: chat not found",
                    }), { status: 400, headers: { "Content-Type": "application/json" } });
                }
                return new Response(JSON.stringify({
                    ok: true,
                    result: {
                        status: mockChatMemberStatus,
                        is_member: ["member", "creator", "administrator"].includes(mockChatMemberStatus),
                    },
                }), { status: 200, headers: { "Content-Type": "application/json" } });
            }
            return origFetch(url, options);
        };

        mockBot = new TelegramBotClient("123456789:MOCK_TOKEN");

        // Mock out external Telegram API calls with record keepers
        mockBot.sendMessage = async (chatId, text, form = {}) => {
            const msg = { chatId, text, form, message_id: sentMessages.length + 1 };
            sentMessages.push(msg);
            return msg;
        };

        mockBot.copyMessage = async (chatId, fromChatId, messageId, form = {}) => {
            const copied = { chatId, fromChatId, messageId, form };
            copiedMessages.push(copied);
            return { message_id: 999 };
        };

        mockBot.sendDocument = async (chatId, doc, form = {}) => {
            const docMsg = { chatId, doc, form, message_id: 998 };
            sentMessages.push({ chatId, text: `[Document: ${doc}]`, form });
            return docMsg;
        };

        mockBot.answerCallbackQuery = async (queryId, form = {}) => {
            answeredCallbacks.push({ queryId, form });
            return true;
        };

        mockBot.editMessageReplyMarkup = async (markup, form = {}) => {
            editedMarkups.push({ markup, form });
            return true;
        };

        // Wire up bot with promise-returning handlers matching Cloudflare Worker entry point
        registerStartCommand(mockBot);
        mockBot.on("callback_query", (query) => handleCallbackQuery(mockBot, query));
        mockBot.on("message", (msg) => handleMessage(mockBot, msg));
    });

    after(async () => {
        await new Promise((r) => setTimeout(r, 50));
        if (origFetch) globalThis.fetch = origFetch;
        if (prisma) await prisma.$disconnect();
        cleanupTestDatabase();
        delete globalThis.__INTERNAL_FETCH;
    });

    beforeEach(() => {
        sentMessages = [];
        copiedMessages = [];
        answeredCallbacks = [];
        editedMarkups = [];
        mockChatMemberStatus = "member";
        mockChatMemberOk = true;
    });

    it("should never expose bot token in error messages", async () => {
        const secretToken = "SECRET_BOT_TOKEN_12345";
        const client = new TelegramBotClient(secretToken, { apiBase: "http://127.0.0.1:99999" });

        await assert.rejects(async () => {
            await client.sendMessage(12345, "hello");
        }, (err) => {
            assert.equal(err.message.includes(secretToken), false, "Token leaked in error message!");
            return true;
        });
    });

    it("should handle plain /start command and send verification prompt", async () => {
        const msg = {
            chat: { id: 1001 },
            from: { id: 1001 },
            text: "/start",
        };

        await mockBot.processUpdate({ message: msg });

        assert.ok(sentMessages.length >= 1);
        const lastMsg = sentMessages[sentMessages.length - 1];
        assert.equal(lastMsg.chatId, 1001);
        assert.match(lastMsg.text, /Welcome to Freat Editz Resources/);
        assert.ok(lastMsg.form.reply_markup?.inline_keyboard);
    });

    it("should handle /start resource_<slug> deep link and save pending resource", async () => {
        const msg = {
            chat: { id: 2002 },
            from: { id: 2002 },
            text: "/start resource_topaz-windows",
        };

        await mockBot.processUpdate({ message: msg });

        // Verify pending resource was stored in database
        const user = await prisma.user.findUnique({ where: { telegramId: "2002" } });
        assert.ok(user);
        assert.equal(user.pendingResourceSlug, "topaz-windows");

        // Verify verification prompt was sent
        assert.ok(sentMessages.length >= 1);
        const lastMsg = sentMessages[sentMessages.length - 1];
        assert.match(lastMsg.text, /Welcome to Freat Editz Resources/);
    });

    it("should handle /start project_<slug> deep link and save pending project", async () => {
        const project = await prisma.project.create({
            data: {
                title: "Lofi Beats Pack",
                slug: "lofi-pack",
                isActive: true,
                telegramFileId: "FILE_ID_LOFI_123",
            },
        });

        const msg = {
            chat: { id: 3003 },
            from: { id: 3003 },
            text: `/start project_${project.slug}`,
        };

        await mockBot.processUpdate({ message: msg });

        const user = await prisma.user.findUnique({ where: { telegramId: "3003" } });
        assert.ok(user);
        assert.equal(user.pendingProjectId, project.id);

        assert.ok(sentMessages.length >= 1);
        const lastMsg = sentMessages[sentMessages.length - 1];
        assert.match(lastMsg.text, /Lofi Beats Pack/);
    });

    it("should respond with usage instructions when unknown command is received", async () => {
        await prisma.user.upsert({
            where: { telegramId: "4004" },
            create: { telegramId: "4004", verified: true },
            update: { verified: true },
        });

        const msg = {
            chat: { id: 4004 },
            from: { id: 4004 },
            text: "/help",
        };

        await mockBot.processUpdate({ message: msg });

        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[0].text, /Only \/start is available now/);
    });

    it("should handle callback queries for menu navigation (home, platform, category, resource)", async () => {
        await prisma.user.upsert({
            where: { telegramId: "5005" },
            create: { telegramId: "5005", verified: true },
            update: { verified: true },
        });

        // 1. Home callback
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_1",
                from: { id: 5005 },
                message: { chat: { id: 5005 }, message_id: 10 },
                data: "home",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Choose Operating System/);
        assert.ok(answeredCallbacks.some(c => c.queryId === "cb_1"));

        // 2. Platform callback: platform:windows
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_2",
                from: { id: 5005 },
                message: { chat: { id: 5005 }, message_id: 11 },
                data: "platform:windows",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Choose Category/);

        // 3. Category callback: category:windows:software
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_3",
                from: { id: 5005 },
                message: { chat: { id: 5005 }, message_id: 12 },
                data: "category:windows:software",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Choose Resource/);

        // 4. Resource details callback: resource:windows:topaz-windows
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_4",
                from: { id: 5005 },
                message: { chat: { id: 5005 }, message_id: 13 },
                data: "resource:windows:topaz-windows",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Topaz/);

        // 5. Tutorial callback: tutorial:-10012345:10
        copiedMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_5",
                from: { id: 5005 },
                message: { chat: { id: 5005 }, message_id: 14 },
                data: "tutorial:-10012345:10",
            },
        });
        assert.ok(copiedMessages.length >= 1);
        assert.equal(copiedMessages[0].channelId || copiedMessages[0].fromChatId, "-10012345");
        assert.equal(Number(copiedMessages[0].messageId), 10);
    });

    it("should handle back navigation callbacks (back:home, back:platform, back:category)", async () => {
        await prisma.user.upsert({
            where: { telegramId: "6006" },
            create: { telegramId: "6006", verified: true },
            update: { verified: true },
        });

        // back:home
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_back_home",
                from: { id: 6006 },
                message: { chat: { id: 6006 }, message_id: 20 },
                data: "back:home",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Choose Operating System/);

        // back:platform:windows
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_back_plat",
                from: { id: 6006 },
                message: { chat: { id: 6006 }, message_id: 21 },
                data: "back:platform:windows",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Choose Category/);

        // back:category:windows:software
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_back_cat",
                from: { id: 6006 },
                message: { chat: { id: 6006 }, message_id: 22 },
                data: "back:category:windows:software",
            },
        });
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Choose Resource/);
    });

    it("should handle Verify callback when user is NOT in the channel (unsuccessful verification)", async () => {
        mockChatMemberStatus = "left";

        const update = {
            callback_query: {
                id: "cb_verify_fail_1",
                from: { id: 7007 },
                message: { chat: { id: 7007 }, message_id: 30 },
                data: "verify",
            },
        };

        await mockBot.processUpdate(update);

        // Check that callback query was answered so spinner stops
        assert.ok(answeredCallbacks.some(c => c.queryId === "cb_verify_fail_1"));

        // Check that verification failed message was sent
        assert.ok(sentMessages.length >= 1);
        const lastMsg = sentMessages[sentMessages.length - 1];
        assert.match(lastMsg.text, /Access Not Unlocked Yet/);

        // Check user is not verified in DB
        const user = await prisma.user.findUnique({ where: { telegramId: "7007" } });
        assert.equal(user?.verified ?? false, false);
    });

    it("should handle Verify callback and deliver pending resource when user is a channel member", async () => {
        mockChatMemberStatus = "member";

        // Setup pending resource for user
        await prisma.user.upsert({
            where: { telegramId: "8008" },
            create: { telegramId: "8008", pendingResourceSlug: "topaz-windows", verified: false },
            update: { pendingResourceSlug: "topaz-windows", verified: false },
        });

        const update = {
            callback_query: {
                id: "cb_verify_success_res",
                from: { id: 8008 },
                message: { chat: { id: 8008 }, message_id: 40 },
                data: "verify",
            },
        };

        await mockBot.processUpdate(update);

        // Check callback answered
        assert.ok(answeredCallbacks.some(c => c.queryId === "cb_verify_success_res"));

        // Check user marked verified in DB and pending resource cleared
        const user = await prisma.user.findUnique({ where: { telegramId: "8008" } });
        assert.equal(user.verified, true);
        assert.equal(user.pendingResourceSlug, null);

        // Check resource delivery messages: Verified notification, download link, fix link
        assert.ok(sentMessages.some(m => m.text.includes("Access Verified!")));
        assert.ok(sentMessages.some(m => m.text.includes("Download Link:")));
        assert.ok(sentMessages.some(m => m.text.includes("Fix Link:")));
    });

    it("should handle Verify callback and deliver pending project when user is a channel member", async () => {
        mockChatMemberStatus = "member";

        const project = await prisma.project.create({
            data: {
                title: "Delivery Test Project",
                slug: "delivery-test-project",
                isActive: true,
                telegramFileId: "FILE_ID_PROJ_999",
            },
        });

        // Set pending project for user
        await prisma.user.upsert({
            where: { telegramId: "9009" },
            create: { telegramId: "9009", pendingProjectId: project.id, verified: false },
            update: { pendingProjectId: project.id, verified: false },
        });

        const update = {
            callback_query: {
                id: "cb_verify_success_proj",
                from: { id: 9009 },
                message: { chat: { id: 9009 }, message_id: 50 },
                data: "verify",
            },
        };

        await mockBot.processUpdate(update);

        // Callback answered
        assert.ok(answeredCallbacks.some(c => c.queryId === "cb_verify_success_proj"));

        // User marked verified and pendingProjectId cleared
        const user = await prisma.user.findUnique({ where: { telegramId: "9009" } });
        assert.equal(user.verified, true);
        assert.equal(user.pendingProjectId, null);

        // Check file was sent
        assert.ok(sentMessages.some(m => m.text.includes("Access Verified!")));
        assert.ok(sentMessages.some(m => m.text.includes("[Document: FILE_ID_PROJ_999]")));
    });

    it("should safely handle Telegram getChatMember API failure without crashing", async () => {
        mockChatMemberOk = false; // Telegram returns 400 chat not found

        const update = {
            callback_query: {
                id: "cb_verify_api_fail",
                from: { id: 9991 },
                message: { chat: { id: 9991 }, message_id: 60 },
                data: "verify",
            },
        };

        await mockBot.processUpdate(update);

        // Callback query still answered
        assert.ok(answeredCallbacks.some(c => c.queryId === "cb_verify_api_fail"));

        // User notified to check channel membership
        assert.ok(sentMessages.length >= 1);
        assert.match(sentMessages[sentMessages.length - 1].text, /Access Not Unlocked Yet|Unable to verify/);
    });

    it("should answer unknown callback queries so loading indicator does not hang", async () => {
        const update = {
            callback_query: {
                id: "cb_unknown_action",
                from: { id: 9992 },
                message: { chat: { id: 9992 }, message_id: 70 },
                data: "some_unknown_action_xyz",
            },
        };

        await mockBot.processUpdate(update);

        assert.ok(answeredCallbacks.some(c => c.queryId === "cb_unknown_action"));
    });

    it("should deliver migrated project via channel copyMessage when user verifies", async () => {
        mockChatMemberStatus = "member";

        // Seed channel
        const channel = await prisma.channel.upsert({
            where: { channelId: "-1003943904498" },
            create: {
                id: 1,
                name: "Freat Editz Bot Database",
                channelId: "-1003943904498",
                isActive: true,
            },
            update: { isActive: true },
        });

        // Seed project: Text effect in 60sec
        const project = await prisma.project.upsert({
            where: { slug: "text-effect-in-60sec" },
            create: {
                title: "Text effect in 60sec",
                slug: "text-effect-in-60sec",
                channelId: channel.id,
                messageId: 7,
                isActive: true,
            },
            update: { channelId: channel.id, messageId: 7, isActive: true },
        });

        // User opens deep link
        const startMsg = {
            chat: { id: 11001 },
            from: { id: 11001 },
            text: `/start project_${project.slug}`,
        };
        await mockBot.processUpdate({ message: startMsg });

        // User clicks verify
        copiedMessages = [];
        sentMessages = [];
        const verifyUpdate = {
            callback_query: {
                id: "cb_proj_verify",
                from: { id: 11001 },
                message: { chat: { id: 11001 }, message_id: 80 },
                data: "verify",
            },
        };
        await mockBot.processUpdate(verifyUpdate);

        // Verification notification sent
        assert.ok(sentMessages.some(m => m.text.includes("Access Verified!")));
        // Channel copyMessage was called with the channel and messageId
        assert.ok(copiedMessages.length >= 1);
        const copied = copiedMessages.find(c => c.fromChatId === "-1003943904498");
        assert.ok(copied);
        assert.equal(copied.messageId, 7);
        assert.equal(copied.chatId, 11001);

        // Pending project cleared
        const user = await prisma.user.findUnique({ where: { telegramId: "11001" } });
        assert.equal(user.pendingProjectId, null);
    });

    it("should deliver migrated resource downloadLink when user verifies", async () => {
        mockChatMemberStatus = "member";

        const platform = await prisma.platform.findUnique({ where: { slug: "windows" } });
        const category = await prisma.category.findUnique({ where: { slug: "software" } });

        // Seed migrated resource: After Effects
        const resource = await prisma.resource.upsert({
            where: { slug: "after-effects" },
            create: {
                id: 13,
                name: "After Effects",
                slug: "after-effects",
                platformId: platform.id,
                categoryId: category.id,
                downloadLink: "https://mega.nz/folder/tv8kwQAR#ZjcN0cONH9VSdVqYKJhxiA",
                isVisible: true,
            },
            update: {
                downloadLink: "https://mega.nz/folder/tv8kwQAR#ZjcN0cONH9VSdVqYKJhxiA",
                isVisible: true,
            },
        });

        // User opens deep link
        const startMsg = {
            chat: { id: 12002 },
            from: { id: 12002 },
            text: `/start resource_${resource.slug}`,
        };
        await mockBot.processUpdate({ message: startMsg });

        // User clicks verify
        sentMessages = [];
        const verifyUpdate = {
            callback_query: {
                id: "cb_res_verify",
                from: { id: 12002 },
                message: { chat: { id: 12002 }, message_id: 90 },
                data: "verify",
            },
        };
        await mockBot.processUpdate(verifyUpdate);

        // Access verified and download link delivered
        assert.ok(sentMessages.some(m => m.text.includes("Access Verified!")));
        assert.ok(sentMessages.some(m => m.text.includes("https://mega.nz/folder/tv8kwQAR#ZjcN0cONH9VSdVqYKJhxiA")));

        // Pending resource cleared
        const user = await prisma.user.findUnique({ where: { telegramId: "12002" } });
        assert.equal(user.pendingResourceSlug, null);
    });

    it("should gracefully fallback and deliver downloadLink if tutorial copyMessage fails", async () => {
        mockChatMemberStatus = "member";

        const platform = await prisma.platform.findUnique({ where: { slug: "windows" } });
        const category = await prisma.category.findUnique({ where: { slug: "software" } });

        // Seed resource with tutorial channel configured
        const resource = await prisma.resource.upsert({
            where: { slug: "test-resource-tutorial" },
            create: {
                name: "Test Tutorial Resource",
                slug: "test-resource-tutorial",
                platformId: platform.id,
                categoryId: category.id,
                tutorialChannelId: "-1009999999999",
                tutorialMessageId: 999,
                downloadLink: "https://download.example.com/item.zip",
                isVisible: true,
            },
            update: {
                tutorialChannelId: "-1009999999999",
                tutorialMessageId: 999,
                downloadLink: "https://download.example.com/item.zip",
            },
        });

        // Make mockBot.copyMessage throw an error (simulating chat not found / bot not admin)
        const origCopyMessage = mockBot.copyMessage;
        mockBot.copyMessage = async () => {
            throw new Error("Telegram API error (copyMessage): Bad Request: chat not found");
        };

        try {
            // User opens deep link
            await mockBot.processUpdate({
                message: {
                    chat: { id: 13003 },
                    from: { id: 13003 },
                    text: `/start resource_${resource.slug}`,
                },
            });

            sentMessages = [];
            await mockBot.processUpdate({
                callback_query: {
                    id: "cb_res_tut_fail",
                    from: { id: 13003 },
                    message: { chat: { id: 13003 }, message_id: 95 },
                    data: "verify",
                },
            });

            // Access verified message and download link are STILL delivered
            assert.ok(sentMessages.some(m => m.text.includes("Access Verified!")));
            assert.ok(sentMessages.some(m => m.text.includes("https://download.example.com/item.zip")));

            // Pending pointer was cleared
            const user = await prisma.user.findUnique({ where: { telegramId: "13003" } });
            assert.equal(user.pendingResourceSlug, null);
        } finally {
            mockBot.copyMessage = origCopyMessage;
        }
    });

    it("should return friendly error message for nonexistent resource or project deep link", async () => {
        // Nonexistent project
        sentMessages = [];
        await mockBot.processUpdate({
            message: {
                chat: { id: 14004 },
                from: { id: 14004 },
                text: "/start project_nonexistent-project-xyz",
            },
        });
        assert.ok(sentMessages.some(m => m.text.includes("Project not found")));

        // Nonexistent resource: starts, prompts verify, then reports resource not found upon verify
        mockChatMemberStatus = "member";
        await mockBot.processUpdate({
            message: {
                chat: { id: 15005 },
                from: { id: 15005 },
                text: "/start resource_nonexistent-resource-xyz",
            },
        });
        sentMessages = [];
        await mockBot.processUpdate({
            callback_query: {
                id: "cb_nonexistent_res",
                from: { id: 15005 },
                message: { chat: { id: 15005 }, message_id: 98 },
                data: "verify",
            },
        });
        assert.ok(sentMessages.some(m => m.text.includes("Resource not found")));
    });
});
