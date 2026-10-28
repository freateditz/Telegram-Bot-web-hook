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

    const args = process.argv.slice(2);
    const dropPendingUpdates = args.includes("--drop-pending-updates");
    const force = args.includes("--force");

    if (!force) {
        console.warn("⚠️ Warning: This will delete the active Telegram webhook for this bot.");
        console.warn("To confirm, re-run with: node scripts/delete-webhook.js --force [--drop-pending-updates]");
        process.exit(1);
    }

    const client = new TelegramBotClient(botToken);

    try {
        const result = await client.deleteWebhook(dropPendingUpdates);
        console.log("✅ Telegram webhook successfully deleted:", result);
    } catch (error) {
        console.error("❌ Failed to delete webhook:", error.message);
        process.exit(1);
    }
}

main();
