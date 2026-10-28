const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const testDbPath = path.resolve(__dirname, "test.db");

function setupTestDatabase() {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = `file:${testDbPath}`;
    process.env.BOT_TOKEN = "123456789:TEST_MOCK_TOKEN_XYZ";
    process.env.WEBHOOK_SECRET = "test_webhook_secret_123";
    process.env.CHANNEL = "@test_channel";
    process.env.YOUTUBE = "https://youtube.com/@test_channel";
    process.env.CHANNEL_LINK = "https://t.me/test_channel";

    // Clean any prior test db
    if (fs.existsSync(testDbPath)) {
        try { fs.unlinkSync(testDbPath); } catch (_) {}
    }

    // Execute SQLite schema migration to set up tables
    const schemaSql = fs.readFileSync(path.resolve(__dirname, "../migrations/0001_initial_schema.sql"), "utf8");
    const seedSql = fs.readFileSync(path.resolve(__dirname, "../migrations/0002_seed.sql"), "utf8");

    try {
        execSync(`sqlite3 "${testDbPath}" < "${path.resolve(__dirname, "../migrations/0001_initial_schema.sql")}"`);
        execSync(`sqlite3 "${testDbPath}" < "${path.resolve(__dirname, "../migrations/0002_seed.sql")}"`);
    } catch (err) {
        console.error("Error setting up test sqlite db:", err.message);
    }

    const { setPrismaClient, createPrismaClient } = require("../backend/src/database/prisma");
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: `file:${testDbPath}`,
            },
        },
    });

    setPrismaClient(prisma);
    return prisma;
}

function cleanupTestDatabase() {
    if (fs.existsSync(testDbPath)) {
        try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
}

module.exports = {
    setupTestDatabase,
    cleanupTestDatabase,
    testDbPath,
};
