const telegramService = require("../services/telegramService");
const backendClient = require("../services/backendClient");
const cacheService = require("../services/cacheService");
const handleProjectDeepLink = require("../handlers/projectHandler");
const { handleResourceDeepLink } = require("../handlers/resourceHandler");

/**
 * Register the /start command.
 *
 * Every /start must begin a completely fresh interaction:
 *   - clear any previously verified flag
 *   - clear any pending project pointer (DB)
 *   - clear any pending resource slug (in-memory cache)
 *   - clear any in-flight verification state held by handlers
 *
 * Only after that purge do we honor a deep-link payload (`project_*`
 * or `resource_*`) by re-stashing the appropriate pointer. A plain
 * /start therefore shows the verification prompt with no
 * carry-over — the bot never re-delivers a previous session's file.
 */
module.exports = function registerStartCommand(bot) {
    bot.onText(/^\/start(?:@[\w_]+)?(?:\s+(.+))?$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const payload = match[1] ? match[1].trim() : "";

        try {
            // Track BOT_START
            try {
                await backendClient.trackAnalyticsEvent({
                    userId,
                    eventType: 'BOT_START',
                    metadata: { payload }
                });
            } catch (err) {
                console.error(`[start] Analytics tracking failed:`, err.message);
            }

            // --- Purge every per-session pointer BEFORE doing anything else. ---
            // 1. Verified flag — re-run subscription check this session.
            try {
                await backendClient.markUnverified(userId);
            } catch (err) {
                console.error(`[start] markUnverified failed for user=${userId}:`, err.message);
                try {
                    return await bot.sendMessage(chatId, "⚠️ Service temporarily unavailable. Please try again later.");
                } catch (sendErr) {
                    console.error(`[start] Failed to send error message to chat=${chatId}:`, sendErr.message);
                    return;
                }
            }

            // 2. Pending project pointer (DB).
            try {
                await backendClient.clearPendingProject(userId);
            } catch (err) {
                console.error(`[start] clearPendingProject failed for user=${userId}:`, err.message);
            }

            // 3. Pending resource slug (in-memory + database).
            try {
                cacheService.clearPendingResource(userId);
                await backendClient.clearPendingResource(userId);
            } catch (err) {
                console.error(`[start] clearPendingResource failed for user=${userId}:`, err.message);
            }

            if (payload.startsWith("project_")) {
                return await handleProjectDeepLink(bot, chatId, msg);
            }

            if (payload.startsWith("resource_")) {
                return await handleResourceDeepLink(bot, chatId, msg);
            }

            // Plain /start — verification is required every session.
            try {
                const prompt = await backendClient.getVerificationPrompt();
                return await telegramService.sendVerificationPrompt(bot, chatId, prompt);
            } catch (err) {
                console.error(`[start] getVerificationPrompt failed for user=${userId}:`, err.message);
                try {
                    return await bot.sendMessage(chatId, "⚠️ Service temporarily unavailable. Please try again later.");
                } catch (sendErr) {
                    console.error(`[start] Failed to send error message to chat=${chatId}:`, sendErr.message);
                    return;
                }
            }
        } catch (fatalErr) {
            console.error(`[start] Error in /start command for user=${userId}:`, fatalErr.message || fatalErr);
        }
    });
};
