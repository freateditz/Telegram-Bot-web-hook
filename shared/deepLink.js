/**
 * Universal Telegram Deep Link Generator
 *
 * Centralizes the bot deep-link generation logic across backend, bot,
 * and dashboard tooling using the verified working domain: `https://telegram.me`.
 *
 * Example URLs generated:
 *   Resource: https://telegram.me/FreatEditzResources_Bot?start=resource_topaz-windows
 *   Project:  https://telegram.me/FreatEditzResources_Bot?start=project_text-effect-in-60sec
 */

const TELEGRAM_BOT_BASE_URL = "https://telegram.me";
const DEFAULT_BOT_USERNAME = "FreatEditzResources_Bot";

/**
 * Clean a bot username by trimming whitespace and removing leading '@'.
 */
function cleanBotUsername(botUsername) {
    const raw = String(botUsername || DEFAULT_BOT_USERNAME).trim();
    return raw.replace(/^@+/, "");
}

/**
 * Generate a Telegram bot deep link for a downloadable resource.
 *
 * @param {string} slug - The resource slug (e.g., "topaz-windows")
 * @param {string} [botUsername] - Optional bot username (defaults to FreatEditzResources_Bot)
 * @returns {string} The full deep link URL
 */
function buildResourceDeepLink(slug, botUsername = DEFAULT_BOT_USERNAME) {
    const cleanSlug = String(slug || "").trim();
    const bot = cleanBotUsername(botUsername);
    return `${TELEGRAM_BOT_BASE_URL}/${bot}?start=resource_${cleanSlug}`;
}

/**
 * Generate a Telegram bot deep link for a deliverable project.
 *
 * @param {string} slug - The project slug (e.g., "text-effect-in-60sec")
 * @param {string} [botUsername] - Optional bot username (defaults to FreatEditzResources_Bot)
 * @returns {string} The full deep link URL
 */
function buildProjectDeepLink(slug, botUsername = DEFAULT_BOT_USERNAME) {
    const cleanSlug = String(slug || "").trim();
    const bot = cleanBotUsername(botUsername);
    return `${TELEGRAM_BOT_BASE_URL}/${bot}?start=project_${cleanSlug}`;
}

/**
 * Helper to check if a URL is a Telegram bot deep link.
 */
function isTelegramBotDeepLink(url) {
    if (!url || typeof url !== "string") return false;
    return /^(https?:\/\/)?(t\.me|telegram\.me)\/[A-Za-z0-9_]+\?start=(resource_|project_)[A-Za-z0-9_-]+$/i.test(url.trim());
}

/**
 * Safely migrate any legacy t.me bot deep link to telegram.me without modifying
 * channel links, YouTube links, or external download links.
 */
function migrateBotDeepLinkDomain(url) {
    if (!isTelegramBotDeepLink(url)) {
        return url;
    }
    return url.replace(/^https?:\/\/t\.me\//i, `${TELEGRAM_BOT_BASE_URL}/`);
}

module.exports = {
    TELEGRAM_BOT_BASE_URL,
    DEFAULT_BOT_USERNAME,
    cleanBotUsername,
    buildResourceDeepLink,
    buildProjectDeepLink,
    isTelegramBotDeepLink,
    migrateBotDeepLinkDomain,
};
