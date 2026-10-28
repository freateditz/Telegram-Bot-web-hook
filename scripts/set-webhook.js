#!/usr/bin/env node
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const TelegramBotClient = require("../bot/services/telegramBotClient");

async function main() {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || !botToken.trim()) {
        console.error("❌ Error: BOT_TOKEN is not set in environment or .env file.");
        console.error("Usage: BOT_TOKEN=xxx WEBHOOK_SECRET=yyy node scripts/set-webhook.js <WEBHOOK_URL>");
        process.exit(1);
    }

    const args = process.argv.slice(2);
    let webhookUrl = args[0] || process.env.WEBHOOK_URL;

    if (!webhookUrl) {
        console.error("❌ Error: Webhook URL is required.");
        console.error("Usage: node scripts/set-webhook.js https://<worker-domain>/api/webhook");
        process.exit(1);
    }

    // Ensure URL uses HTTPS
    if (!webhookUrl.startsWith("https://")) {
        console.error("❌ Error: Telegram requires an HTTPS webhook URL. Provided:", webhookUrl);
        process.exit(1);
    }

    const secretToken = process.env.WEBHOOK_SECRET || null;
    const client = new TelegramBotClient(botToken);

    console.log(`Setting Telegram webhook for URL: ${webhookUrl}`);
    if (secretToken) {
        console.log("Configuring X-Telegram-Bot-Api-Secret-Token verification.");
    } else {
        console.warn("⚠️ Warning: WEBHOOK_SECRET is not set. Webhook requests will not have secret token verification.");
    }

    try {
        const result = await client.setWebhook(webhookUrl, secretToken, ["message", "callback_query"]);
        console.log("✅ Webhook successfully registered with Telegram:", result);

        const info = await client.getWebhookInfo();
        console.log("\n--- Current Webhook Status ---");
        console.log("URL:", info.url);
        console.log("Has custom certificate:", info.has_custom_certificate);
        console.log("Pending update count:", info.pending_update_count);
        console.log("Last error date:", info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : "None");
        console.log("Last error message:", info.last_error_message || "None");
        console.log("------------------------------");
    } catch (error) {
        console.error("❌ Failed to set webhook:", error.message);
        process.exit(1);
    }
}

main();
