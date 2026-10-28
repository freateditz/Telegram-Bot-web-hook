-- =============================================================================
-- Migration: 0002_seed.sql
-- Default seed data for Cloudflare D1
-- =============================================================================

-- Platforms
INSERT OR IGNORE INTO "Platform" ("name", "slug") VALUES
  ('Windows', 'windows'),
  ('macOS', 'mac');

-- Categories
INSERT OR IGNORE INTO "Category" ("name", "slug", "displayOrder") VALUES
  ('Software', 'software', 1),
  ('Plugins', 'plugins', 2),
  ('Presets', 'presets', 3),
  ('Fonts', 'fonts', 4),
  ('Sound Effects', 'sound-effects', 5);

-- Settings
INSERT OR IGNORE INTO "Setting" ("key", "value") VALUES
  ('youtubeLink', 'https://youtube.com/@freat_editz'),
  ('channelLink', 'https://t.me/freat_editz'),
  ('botName', 'Freat Editz Resources'),
  ('supportLink', 'https://t.me/support');

-- Initial Resources (Topaz)
INSERT OR IGNORE INTO "Resource" (
  "name", "slug", "description", "version",
  "platformId", "categoryId",
  "downloadLink", "fixLink",
  "tutorialChannelId", "tutorialMessageId",
  "displayOrder", "isVisible"
) VALUES
  (
    'Topaz', 'topaz-windows', 'Topaz Photo & Video AI suite for Windows', '1.0',
    (SELECT "id" FROM "Platform" WHERE "slug" = 'windows'),
    (SELECT "id" FROM "Category" WHERE "slug" = 'software'),
    'https://mega.nz/folder/RFNyBBqb#njLs0aEMbASRwcsWka9n7w',
    'https://drive.google.com/file/d/1gbBavelChT9BWbpyngP7md4vVnIVVUOr/view?usp=sharing',
    '-1003943904498', 3, 1, 1
  ),
  (
    'Topaz', 'topaz-mac', 'Topaz Photo & Video AI suite for macOS', '1.0',
    (SELECT "id" FROM "Platform" WHERE "slug" = 'mac'),
    (SELECT "id" FROM "Category" WHERE "slug" = 'software'),
    'https://mega.nz/folder/RFNyBBqb#njLs0aEMbASRwcsWka9n7w',
    'https://drive.google.com/file/d/1gbBavelChT9BWbpyngP7md4vVnIVVUOr/view?usp=sharing',
    '-1003943904498', 3, 1, 1
  );
