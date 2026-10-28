-- =============================================================================
-- Migration: 0001_initial_schema.sql
-- Cloudflare D1 (SQLite) Schema for Telegram Download Bot
-- =============================================================================

PRAGMA foreign_keys = ON;

-- 1. Platform table
CREATE TABLE IF NOT EXISTS "Platform" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Platform_slug_key" ON "Platform"("slug");

-- 2. Category table
CREATE TABLE IF NOT EXISTS "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Category_slug_key" ON "Category"("slug");

-- 3. Channel table (source Telegram channels holding media/file messages)
CREATE TABLE IF NOT EXISTS "Channel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "username" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_name_key" ON "Channel"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_channelId_key" ON "Channel"("channelId");

-- 4. Project table (deep-link deliverable assets)
CREATE TABLE IF NOT EXISTS "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "telegramFileId" TEXT,
    "thumbnail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" DATETIME,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" DATETIME,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "telegramMessageLink" TEXT,
    "channelId" INTEGER,
    "messageId" INTEGER,
    CONSTRAINT "Project_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Project_slug_key" ON "Project"("slug");
CREATE INDEX IF NOT EXISTS "Project_channelId_messageId_idx" ON "Project"("channelId", "messageId");

-- 5. Resource table (platform and category downloadable items)
CREATE TABLE IF NOT EXISTS "Resource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "version" TEXT,
    "platformId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "downloadLink" TEXT,
    "fixLink" TEXT,
    "tutorialChannelId" TEXT,
    "tutorialMessageId" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Resource_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Resource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Resource_slug_key" ON "Resource"("slug");
CREATE INDEX IF NOT EXISTS "Resource_platformId_idx" ON "Resource"("platformId");
CREATE INDEX IF NOT EXISTS "Resource_categoryId_idx" ON "Resource"("categoryId");
CREATE INDEX IF NOT EXISTS "Resource_displayOrder_idx" ON "Resource"("displayOrder");

-- 6. Setting table (key-value configuration)
CREATE TABLE IF NOT EXISTS "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Setting_key_key" ON "Setting"("key");

-- 7. User table (Telegram users and verification status)
CREATE TABLE IF NOT EXISTS "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingProjectId" INTEGER,
    "pendingResourceSlug" TEXT,
    CONSTRAINT "User_pendingProjectId_fkey" FOREIGN KEY ("pendingProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");

-- 8. AnalyticsEvent table
CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "resourceId" INTEGER,
    "eventType" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_eventType_idx" ON "AnalyticsEvent"("eventType");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_projectId_eventType_createdAt_idx" ON "AnalyticsEvent"("projectId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_resourceId_eventType_createdAt_idx" ON "AnalyticsEvent"("resourceId", "eventType", "createdAt");

-- 9. TelegramUpdate table (idempotency & duplicate update prevention)
CREATE TABLE IF NOT EXISTS "TelegramUpdate" (
    "updateId" TEXT NOT NULL PRIMARY KEY,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
