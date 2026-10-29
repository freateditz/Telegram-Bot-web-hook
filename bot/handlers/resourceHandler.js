const backendClient = require("../services/backendClient");
const telegramService = require("../services/telegramService");
const cacheService = require("../services/cacheService");

async function handleResourceDeepLink(bot, chatId, msg) {
    const userId = msg.from.id;
    const text = (msg.text || "").trim();
    const parts = text.split(/\s+/);
    const payload = parts[1] || "";

    if (!payload.startsWith("resource_")) {
        console.warn(`[Resource Deep Link] Unexpected payload: "${payload}"`);
        return bot.sendMessage(chatId, "❌ Invalid resource link.");
    }

    const slug = payload.slice("resource_".length);
    if (!slug) {
        return bot.sendMessage(chatId, "❌ Invalid resource link — no slug provided.");
    }

    console.log(`[Bot] Detected payload: ${payload}`);
    console.log(`[Bot] Payload type: Resource`);
    console.log(`[Bot] Resource slug: ${slug}`);

    // Store pending resource in local cache and database
    cacheService.setPendingResource(userId, slug);
    try {
        await backendClient.upsertPendingResource(userId, slug);
    } catch (err) {
        console.error(`[Resource Deep Link] Failed to persist pending resource for user=${userId}:`, err.message);
    }
    
    const prompt = await backendClient.getVerificationPrompt();
    return telegramService.sendVerificationPrompt(bot, chatId, prompt);
}

async function deliverResource(bot, chatId, userId, resource) {
    console.log(`[Resource Deep Link] Preparing download for resource id=${resource.id}, slug=${resource.slug}`);

    let deliveredSomething = false;
    let errorMessage = null;

    try {
        await bot.sendMessage(chatId, "✅ Access Verified!\n\nYour resource is ready.");

        // 1. Tutorial Message
        if (resource.tutorialChannelId && resource.tutorialMessageId) {
            try {
                console.log(`[Resource Deep Link] Sending via tutorial channel ${resource.tutorialChannelId} message ${resource.tutorialMessageId}`);
                await bot.copyMessage(chatId, resource.tutorialChannelId, resource.tutorialMessageId);
                deliveredSomething = true;
            } catch (err) {
                console.error(`[Resource Deep Link] Tutorial send failed:`, err.message);
            }
        }

        // 2. Download Link
        if (resource.downloadLink) {
            try {
                console.log(`[Resource Deep Link] Sending download link`);
                await bot.sendMessage(chatId, `Download Link: ${resource.downloadLink}`);
                deliveredSomething = true;
            } catch (err) {
                console.error(`[Resource Deep Link] Download link send failed:`, err.message);
            }
        }

        // 3. Fix Link
        if (resource.fixLink) {
            try {
                console.log(`[Resource Deep Link] Sending fix link`);
                await bot.sendMessage(chatId, `Fix Link: ${resource.fixLink}`);
                deliveredSomething = true;
            } catch (err) {
                console.error(`[Resource Deep Link] Fix link send failed:`, err.message);
            }
        }

        if (!deliveredSomething) {
            throw new Error("No delivery method succeeded");
        }

        // Track RESOURCE_DOWNLOAD
        try {
            await backendClient.trackAnalyticsEvent({
                userId,
                resourceId: resource.id,
                eventType: 'RESOURCE_DOWNLOAD',
            });
        } catch (err) {
            console.error(`[Resource Deep Link] Analytics tracking failed:`, err.message);
        }

        // Track download
        console.log(`[Resource Deep Link] Tracking download for resource id=${resource.id}`);
        await backendClient.request(`/api/resources/${resource.id}/download`, { method: "POST" });
        console.log(`[Resource Deep Link] Delivery complete`);

    } catch (error) {
        errorMessage = error.message;
        console.error(`[Resource Deep Link] Delivery failed user=${userId} resource=${resource.id}:`, error.message);
    } finally {
        // ALWAYS clear the pending pointer — success or failure. This
        // prevents a partial-failure path from leaving a stale slug
        // in cacheService or DB that would re-deliver on the next /start.
        cacheService.clearPendingResource(userId);
        try {
            await backendClient.clearPendingResource(userId);
        } catch (clearErr) {
            console.error(`[Resource Deep Link] Failed to clear pending resource for user=${userId}:`, clearErr.message);
        }
    }

    // Only report the error if nothing was successfully delivered
    if (errorMessage && !deliveredSomething) {
        return bot.sendMessage(chatId, `❌ Delivery failed: ${errorMessage}`);
    } else if (errorMessage) {
        console.log(`[Resource Deep Link] Logged partial delivery failure internally, skipping user alert.`);
    }
}

module.exports = {
    handleResourceDeepLink,
    deliverResource
};
