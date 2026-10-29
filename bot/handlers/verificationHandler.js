const backendClient = require("../services/backendClient");
const telegramService = require("../services/telegramService");
const projectService = require("../services/projectService");
const cacheService = require("../services/cacheService");
const commonKeyboard = require("../keyboards/commonKeyboard");
const { deliverProject } = require("./projectHandler");
const { deliverResource } = require("./resourceHandler");

/**
 * Post-verification decision point.
 */
async function routeAfterVerification(bot, chatId, userId) {
    const user = await backendClient.getUserByTelegramId(userId);

    if (user && user.pendingProjectId) {
        console.log(`[verify] Pending project found user=${userId} project=${user.pendingProjectId} — delivering`);
        return deliverPendingProject(bot, chatId, userId, user.pendingProjectId);
    }

    const pendingResourceSlug = (user && user.pendingResourceSlug) || cacheService.getPendingResource(userId);
    if (pendingResourceSlug) {
        console.log(`[verify] Pending resource found user=${userId} slug=${pendingResourceSlug} — delivering`);
        return deliverPendingResource(bot, chatId, userId, pendingResourceSlug);
    }

    console.log(`[verify] No pending project/resource for user=${userId} — showing main menu`);
    return telegramService.showHome(bot, chatId, backendClient);
}

async function deliverPendingResource(bot, chatId, userId, slug) {
    console.log(`[Resource Deep Link] Loading resource slug=${slug}`);
    let resource;
    try {
        resource = await backendClient.getResourceBySlug(slug);
        console.log(`[Resource Deep Link] Resource lookup result:`, resource ? `found id=${resource.id}` : "not found");
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes("not found")) {
            console.log(`[Resource Deep Link] Resource not found for slug=${slug}`);
            cacheService.clearPendingResource(userId);
            backendClient.clearPendingResource(userId).catch(() => {});
            return bot.sendMessage(chatId, "❌ Resource not found.");
        }
        console.error(`[Resource Deep Link] Resource lookup failed for slug=${slug}:`, error.message);
        cacheService.clearPendingResource(userId);
        backendClient.clearPendingResource(userId).catch(() => {});
        return bot.sendMessage(chatId, `❌ An error occurred while preparing your download: ${error.message}`);
    }
    
    if (!resource) {
        console.log(`[Resource Deep Link] Resource not found for slug=${slug}`);
        cacheService.clearPendingResource(userId);
        backendClient.clearPendingResource(userId).catch(() => {});
        return bot.sendMessage(chatId, "❌ Resource not found.");
    }

    // Call the delivery logic in resourceHandler.js
    console.log(`[Resource Deep Link] Preparing delivery for resource id=${resource.id}`);
    return deliverResource(bot, chatId, userId, resource);
}

module.exports = async function handleVerification(bot, query) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    // Track VERIFY_CLICK (best-effort)
    try {
        await backendClient.trackAnalyticsEvent({
            userId,
            eventType: 'VERIFY_CLICK',
            metadata: { callbackQueryId: query.id }
        });
    } catch (err) {
        console.error(`[verify] Analytics tracking failed:`, err.message);
    }

    // Ensure query is answered (in case callbackHandler's call was delayed or threw)
    try {
        await bot.answerCallbackQuery(query.id);
    } catch (_) {}

    const state = await backendClient.getVerificationStatus(userId);

    // Already verified (e.g. user tapped Verify again on the prompt):
    // skip the channel-join check and route straight to post-verification decision.
    if (state.verified) {
        return routeAfterVerification(bot, chatId, userId);
    }

    let joined = false;
    try {
        joined = await backendClient.checkChannelMember(userId);
    } catch (checkErr) {
        console.error(`[verify] Channel membership check failed user=${userId}:`, checkErr.message);
        return bot.sendMessage(
            chatId,
            "⚠️ Unable to verify channel membership right now. Please ensure you joined the channel, then tap Check Access again."
        );
    }

    if (!joined) {
        const user = await backendClient.getUserByTelegramId(userId);
        const projectId = user?.pendingProjectId;

        // Track VERIFY_FAILED
        try {
            await backendClient.trackAnalyticsEvent({
                userId,
                projectId,
                eventType: 'VERIFY_FAILED',
            });
        } catch (err) {
            console.error(`[verify] Analytics tracking failed:`, err.message);
        }

        const prompt = await backendClient.getVerificationPrompt();
        const failedMessage = await telegramService.buildVerificationFailedMessage();
        const replyMarkup = commonKeyboard.buildVerificationKeyboard({
            youtubeLink: prompt?.youtubeLink,
            channelLink: prompt?.channelLink,
        });

        if (projectId) {
            // Track Failed Verification (best-effort, fire-and-forget).
            backendClient
                .request(`/api/projects/${projectId}/failed-verification`, { method: "POST" })
                .catch((err) => console.error(`[verify] Failed-verification tracking failed for project=${projectId}:`, err.message));
        }

        return bot.sendMessage(chatId, failedMessage, {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
        });
    }

    // Track VERIFY_SUCCESS
    try {
        await backendClient.trackAnalyticsEvent({
            userId,
            eventType: 'VERIFY_SUCCESS',
        });
    } catch (err) {
        console.error(`[verify] Analytics tracking failed:`, err.message);
    }

    await backendClient.markVerified(userId);

    return routeAfterVerification(bot, chatId, userId);
};

async function deliverPendingProject(bot, chatId, userId, projectId) {
    let project;
    try {
        project = await projectService.getProjectById(projectId);
    } catch (error) {
        console.error(`[verify] Project lookup failed for id=${projectId}:`, error.message);
        await backendClient.clearPendingProject(userId);
        return bot.sendMessage(chatId, "❌ This project is no longer available.");
    }

    if (!project) {
        await backendClient.clearPendingProject(userId);
        return bot.sendMessage(chatId, "❌ This project is no longer available.");
    }

    if (!project.isActive) {
        await backendClient.clearPendingProject(userId);
        return bot.sendMessage(chatId, "🚫 This project is currently unavailable.");
    }

    if (project.channelId && project.channel && !project.channel.isActive) {
        await backendClient.clearPendingProject(userId);
        return bot.sendMessage(chatId, "🚫 This project's source channel is currently unavailable.");
    }

    let result;
    try {
        result = await projectService.getProjectDelivery(project.slug);
    } catch (error) {
        console.error(`[verify] Delivery lookup failed for project=${project.id}:`, error.message);
        await backendClient.clearPendingProject(userId);
        return bot.sendMessage(chatId, "❌ An error occurred while preparing your download.");
    }

    if (!result || !result.delivery || result.delivery.strategy === "unavailable") {
        await backendClient.clearPendingProject(userId);
        return bot.sendMessage(chatId, "⚠️ The download file is currently unavailable. Please contact the administrator.");
    }

    return deliverProject(bot, chatId, userId, result.item, result.delivery);
}
