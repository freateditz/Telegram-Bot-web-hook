const isCloudflareWorker =
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") ||
    typeof WebSocketPair !== "undefined";

if (!isCloudflareWorker && typeof process !== "undefined" && process.versions?.node) {
    try {
        require("dotenv").config();
    } catch (_) {}
}

const registerStartCommand = require("./commands/start");
const handleCallbackQuery = require("./handlers/callbackHandler");
const handleMessage = require("./handlers/messageHandler");
const TelegramBotClient = require("./services/telegramBotClient");
const prisma = require("../backend/src/database/prisma");

let webhookBotInstance = null;
let currentBotToken = null;
let pollingBotInstance = null;

/**
 * Create and wire up a webhook-compatible Telegram bot instance.
 */
function getWebhookBot(token) {
    const resolvedToken = token || process.env.BOT_TOKEN;
    if (!resolvedToken || !resolvedToken.trim()) {
        throw new Error("BOT_TOKEN is missing or empty in environment variables");
    }

    if (webhookBotInstance && currentBotToken === resolvedToken) {
        return webhookBotInstance;
    }

    const bot = new TelegramBotClient(resolvedToken);

    // Register all bot commands and event handlers
    registerStartCommand(bot);

    bot.on("callback_query", async (query) => {
        try {
            return await handleCallbackQuery(bot, query);
        } catch (error) {
            console.error("[Bot] Callback handler error:", error.message || error);
            try {
                await bot.answerCallbackQuery(query.id);
            } catch (_) {}
            throw error;
        }
    });

    bot.on("message", async (msg) => {
        try {
            return await handleMessage(bot, msg);
        } catch (error) {
            console.error("[Bot] Message handler error:", error.message || error);
            throw error;
        }
    });

    webhookBotInstance = bot;
    currentBotToken = resolvedToken;
    return webhookBotInstance;
}

/**
 * Check if update has already been processed to prevent duplicate side effects on retries.
 */
async function isDuplicateUpdate(updateId) {
    if (!updateId) return false;
    const key = String(updateId);

    try {
        const existing = await prisma.telegramUpdate.findUnique({
            where: { updateId: key },
        });

        if (existing) {
            return true;
        }

        await prisma.telegramUpdate.create({
            data: { updateId: key },
        });

        return false;
    } catch (err) {
        // P2002 is Prisma's unique constraint violation (concurrent insert)
        if (err.code === "P2002") {
            return true;
        }
        console.warn(`[Webhook] Duplicate check warning: ${err.message}`);
        return false;
    }
}

/**
 * Entry point for incoming Cloudflare Worker webhook HTTP requests.
 */
async function handleTelegramWebhook(update, env = {}) {
    if (!update || typeof update !== "object") {
        return { ok: false, error: "Invalid update payload" };
    }

    const token = env.BOT_TOKEN || process.env.BOT_TOKEN;
    if (!token) {
        return { ok: false, error: "BOT_TOKEN not configured" };
    }

    // Deduplication check
    if (update.update_id) {
        const duplicate = await isDuplicateUpdate(update.update_id);
        if (duplicate) {
            console.log(`[Webhook] Skipping duplicate update_id=${update.update_id}`);
            return { ok: true, duplicate: true };
        }
    }

    const bot = getWebhookBot(token);
    try {
        return await bot.processUpdate(update);
    } catch (err) {
        // If processing failed unexpectedly, remove deduplication record so Telegram retry can re-attempt
        if (update.update_id) {
            await prisma.telegramUpdate.delete({
                where: { updateId: String(update.update_id) },
            }).catch(() => {});
        }
        throw err;
    }
}

/**
 * Local Node.js polling mode (preserved for optional local development).
 */
async function startBot() {
    if (pollingBotInstance) {
        return pollingBotInstance;
    }

    const TelegramBot = require("node-telegram-bot-api");
    const botToken = process.env.BOT_TOKEN;

    if (!botToken || !botToken.trim()) {
        throw new Error("BOT_TOKEN is missing or empty in environment variables");
    }

    const bot = new TelegramBot(botToken, { polling: true });

    registerStartCommand(bot);

    bot.on("callback_query", async (query) => {
        try {
            return await handleCallbackQuery(bot, query);
        } catch (error) {
            console.error("[Bot] Callback handler error:", error.message || error);
            try {
                await bot.answerCallbackQuery(query.id);
            } catch (_) {}
            throw error;
        }
    });

    bot.on("message", async (msg) => {
        try {
            return await handleMessage(bot, msg);
        } catch (error) {
            console.error("[Bot] Message handler error:", error.message || error);
            throw error;
        }
    });

    bot.on("polling_error", (error) => {
        console.error("Polling error:", error);
    });

    pollingBotInstance = bot;
    console.log("✅ Telegram Bot Started (Polling mode)");
    return pollingBotInstance;
}

async function stopBot() {
    if (pollingBotInstance) {
        try {
            console.log("🛑 Stopping Telegram Bot polling...");
            await pollingBotInstance.stopPolling();
            console.log("✅ Telegram Bot polling stopped");
        } catch (error) {
            console.error("Error stopping Telegram Bot polling:", error.message || error);
        }
        pollingBotInstance = null;
    }
}

if (typeof process !== "undefined" && process.on) {
    process.on("unhandledRejection", (reason) => {
        const msg = reason?.message || reason;
        console.warn("⚠️ Telegram Bot unhandled error caught:", typeof msg === "string" ? msg : "Telegram request rejected");
    });
}

if (require.main === module) {
    const shutdown = async () => {
        await stopBot();
        process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    startBot().catch((error) => {
        console.error("Bot failed to start:", error);
        process.exit(1);
    });
}

module.exports = {
    getWebhookBot,
    handleTelegramWebhook,
    isDuplicateUpdate,
    startBot,
    stopBot,
};
