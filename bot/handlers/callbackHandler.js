const { callbackTypes } = require("../../shared/menuState");
const backendClient = require("../services/backendClient");
const telegramService = require("../services/telegramService");
const handleVerification = require("./verificationHandler");

module.exports = async function handleCallback(bot, query) {
    if (!query) {
        return;
    }

    // Always answer callback query immediately so the Telegram button loading spinner stops
    if (query.id) {
        try {
            await bot.answerCallbackQuery(query.id);
        } catch (err) {
            console.warn(`[Callback] answerCallbackQuery notice: ${err.message}`);
        }
    }

    if (!query.data || !query.message) {
        return;
    }

    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const [action, firstArg, secondArg, thirdArg] = query.data.split(":");

    if (action !== callbackTypes.verify) {
        const state = await backendClient.getVerificationStatus(userId);

        if (!state.verified) {
            const prompt = await backendClient.getVerificationPrompt();
            return telegramService.sendVerificationPrompt(bot, chatId, prompt);
        }
    }

    switch (action) {
    case callbackTypes.verify:
        return handleVerification(bot, query);

    case callbackTypes.home:
        return telegramService.showHome(bot, chatId, backendClient, query);

    case callbackTypes.platform:
        return telegramService.showCategoryMenu(bot, chatId, firstArg, backendClient, query);

    case callbackTypes.category:
        return telegramService.showResourceMenu(bot, chatId, firstArg, secondArg, backendClient, query);

    case callbackTypes.resource:
        return telegramService.sendResourceDetails(bot, chatId, firstArg, secondArg, backendClient, query);

    case callbackTypes.tutorial:
        // format: tutorial:channelId:messageId -> firstArg is channelId, secondArg is messageId
        try {
            return await telegramService.sendTutorial(bot, chatId, firstArg, secondArg);
        } catch (err) {
            console.error(`[Callback] Tutorial send failed:`, err.message);
            return bot.sendMessage(chatId, "⚠️ Tutorial message is currently unavailable.");
        }

    case callbackTypes.back:
        if (firstArg === "home") {
            return telegramService.showHome(bot, chatId, backendClient, query);
        }

        if (firstArg === "platform") {
            return telegramService.showCategoryMenu(bot, chatId, secondArg, backendClient, query);
        }

        if (firstArg === "category") {
            return telegramService.showResourceMenu(bot, chatId, secondArg, thirdArg, backendClient, query);
        }

        return telegramService.showHome(bot, chatId, backendClient, query);

    default:
        console.warn(`[Callback] Unhandled callback action "${action}" with data "${query.data}"`);
        return null;
    }
};
