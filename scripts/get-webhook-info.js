#!/usr/bin/env node
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const TelegramBotClient = require("../bot/services/telegramBotClient");

async function main() {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || !botToken.trim()) {
        console.error("❌ Error: BOT_TOKEN is not set in environment or .env file.");
        process.exit(1);
    }

    const client = new TelegramBotClient(botToken);

    try {
        const info = await client.getWebhookInfo();
        console.log("=== Telegram Webhook Info ===");
        console.log("Webhook URL:           ", info.url || "(None - Polling or not registered)");
        console.log("Custom Certificate:    ", info.has_custom_certificate);
        console.log("Pending Updates:       ", info.pending_update_count);
        console.log("Max Connections:       ", info.max_connections || 40);
        console.log("Allowed Updates:       ", info.allowed_updates ? info.allowed_updates.join(", ") : "All");
        console.log("Last Error Date:       ", info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : "None");
        console.log("Last Error Message:    ", info.last_error_message || "None");
        console.log("Last Sync Date:        ", info.last_synchronization_error_date ? new Date(info.last_synchronization_error_date * 1000).toISOString() : "None");
        console.log("=============================");
    } catch (error) {
        console.error("❌ Failed to fetch webhook info:", error.message);
        process.exit(1);
    }
}

main();
