const { describe, it, before, after } = require("node:test");
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
            return { message_id: 998, doc };
        };

        mockBot.answerCallbackQuery = async (queryId, form = {}) => {
            answeredCallbacks.push({ queryId, form });
            return true;
        };

        mockBot.editMessageReplyMarkup = async (markup, form = {}) => {
            editedMarkups.push({ markup, form });
            return true;
        };

        // Wire up bot
        registerStartCommand(mockBot);
        mockBot.on("callback_query", (query) => handleCallbackQuery(mockBot, query));
        mockBot.on("message", (msg) => handleMessage(mockBot, msg));
    });

    after(async () => {
        if (prisma) await prisma.$disconnect();
        cleanupTestDatabase();
        delete globalThis.__INTERNAL_FETCH;
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
        sentMessages = [];
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
        sentMessages = [];
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
        // Create a test project first
        const project = await prisma.project.create({
            data: {
                title: "Lofi Beats Pack",
                slug: "lofi-pack",
                isActive: true,
                telegramFileId: "FILE_ID_LOFI_123",
            },
        });

        sentMessages = [];
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
        sentMessages = [];
        // User must be verified to get the unknown command message
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
        // Pre-verify user so navigation callbacks are permitted
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
        sentMessages = [];
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
});
