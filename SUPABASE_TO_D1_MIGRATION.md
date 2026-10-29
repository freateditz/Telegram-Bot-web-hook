# Supabase PostgreSQL to Cloudflare D1 Migration Guide

This guide documents the complete process for migrating legacy application data from the previous Supabase PostgreSQL database to Cloudflare D1 (`telegram-bot-db`), restoring missing content, and ensuring Telegram deep links and file delivery work seamlessly.

---

## 1. High-Level Overview

### Why Migrate from Supabase to Cloudflare D1?
1. **Edge-Native Architecture**: With the Telegram bot running as a Cloudflare Worker, Cloudflare D1 is co-located with the compute runtime, providing single-digit millisecond query latency.
2. **Cost & Sustainability**: Cloudflare D1 offers generous free-tier storage and read/write quotas without sleep timers or inactivity pausing that PostgreSQL database instances on free tiers typically experience.
3. **Simpler Stack**: Eliminates external pooler dependencies (`pgbouncer`, Supabase poolers, cold starts, connection limit exhaustion) by using D1's serverless SQLite engine directly.

---

## 2. Schema Comparison & Data Type Mapping

The D1 database schema in `migrations/0001_initial_schema.sql` matches the relational structure of the Supabase PostgreSQL database while adapting to SQLite's storage types:

| Table | Supabase PostgreSQL Type | Cloudflare D1 (SQLite) Type | Migration Handling Strategy |
| :--- | :--- | :--- | :--- |
| **`Platform`** | `INTEGER`, `TEXT`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `DATETIME` | Deduplicate on unique `slug`. Windows (`windows`) and macOS (`mac`) already match D1 seed. |
| **`Category`** | `INTEGER`, `TEXT`, `INTEGER`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `INTEGER`, `DATETIME` | Deduplicate on unique `slug`. All 5 categories match D1 seed. |
| **`Channel`** | `INTEGER`, `TEXT`, `BOOLEAN`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `BOOLEAN (0/1)`, `DATETIME` | Insert missing channel `Freat Editz Bot Database` (channelId `-1003943904498`) with `id: 1` so foreign keys in `Project` resolve directly. |
| **`Project`** | `INTEGER`, `TEXT`, `BOOLEAN`, `INTEGER`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `BOOLEAN (0/1)`, `INTEGER`, `DATETIME` | Insert all 4 projects (`text-effect-in-60sec`, `one-piece-cc`, `element-3d`, `adobe-internet-blocker`). Foreign key `channelId: 1` links to the migrated Channel. |
| **`Resource`** | `INTEGER`, `TEXT`, `INTEGER`, `BOOLEAN`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `INTEGER`, `BOOLEAN (0/1)`, `DATETIME` | Insert 7 missing resources (`after-effects`, `davinci-resolve`, `all-plugins`, `adobe-premiere-pro`, `topaz-photo-ai`, `sfx-pack`, `sfx-pack-mac`). Preserve existing D1 rows for `topaz-windows` and `topaz-mac`. |
| **`Setting`** | `INTEGER`, `TEXT` | `INTEGER PRIMARY KEY`, `TEXT` | Preserve existing D1 settings (`youtubeLink`, `channelLink`, `botName`, `supportLink`). Only insert new keys if any are missing. |
| **`User`** | `INTEGER`, `TEXT`, `BOOLEAN`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `BOOLEAN (0/1)`, `DATETIME`, `pendingResourceSlug TEXT` | Insert legacy users with `ON CONFLICT("telegramId") DO NOTHING` to avoid overwriting live user sessions or duplicate key violations. |
| **`AnalyticsEvent`** | `INTEGER`, `TEXT`, `JSONB`, `TIMESTAMP` | `INTEGER PRIMARY KEY`, `TEXT`, `TEXT (JSON string)`, `DATETIME` | Insert legacy events without explicit `id` to allow D1's autoincrement primary key to continue without collision. |

---

## 3. Storage & Delivery Strategy Audit

- **Resource Downloads**: All 9 resources store external download URLs (e.g. `mega.nz`, `drive.google.com`, `mediafire.com`). No binary assets were stored in Supabase Storage buckets.
- **Project Files**: Deliveries use Telegram's `copyMessage` API to copy messages from the source channel (`-1003943904498`) to the user chat.
- **Fail-safe Fallback**: If a tutorial `copyMessage` call fails (for example, if the message was deleted or the channel is temporarily inaccessible), the bot catches the error and still delivers the download and fix links.

---

## 4. How to Back Up and Restore Cloudflare D1

### Automatic Backup During Migration
The migration utility automatically creates a timestamped SQL dump and metadata JSON file in `./backups/` before applying any changes:
- `./backups/d1-backup-<timestamp>.sql`
- `./backups/d1-backup-<timestamp>.meta.json`

### Manual D1 Backup Commands
You can also generate a backup manually at any time using:

```bash
# 1. Native Wrangler D1 export (creates a full SQL dump)
npx wrangler d1 export telegram-bot-db --remote -y --output=./backups/manual-d1-backup.sql

# 2. Or query D1 directly for a specific table
npx wrangler d1 execute telegram-bot-db --remote --json --command "SELECT * FROM Resource;" > ./backups/resources.json
```

### Rollback / Restore Procedure
To restore the D1 database from a backup file:

```bash
# Execute the backup SQL file against the remote D1 database
npx wrangler d1 execute telegram-bot-db --remote --file=./backups/d1-backup-<timestamp>.sql
```

---

## 5. Running the Migration

The migration utility is located at `scripts/migrate-supabase-to-d1.js`.

### Step 1: Run the Dry Run (No writes)
Always execute dry-run mode first to inspect exact changes without modifying D1:

```bash
node scripts/migrate-supabase-to-d1.js --dry-run
```

**Expected Dry-Run Audit Summary:**
```
┌─────────┬──────────────────┬───────────────────┬──────────────────┬───────────┬───────────┬────────────────────┬─────────────────────────┐
│ (index) │ Table            │ Source (Supabase) │ Destination (D1) │ Conflicts │ To Insert │ To Skip (Preserve) │ Expected Post-Migration │
├─────────┼──────────────────┼───────────────────┼──────────────────┼───────────┼───────────┼────────────────────┼─────────────────────────┤
│ 0       │ 'Platform'       │ 2                 │ 2                │ 2         │ 0         │ 2                  │ 2                       │
│ 1       │ 'Category'       │ 5                 │ 5                │ 5         │ 0         │ 5                  │ 5                       │
│ 2       │ 'Channel'        │ 1                 │ 0                │ 0         │ 1         │ 0                  │ 1                       │
│ 3       │ 'Project'        │ 4                 │ 0                │ 0         │ 4         │ 0                  │ 4                       │
│ 4       │ 'Resource'       │ 9                 │ 2                │ 2         │ 7         │ 2                  │ 9                       │
│ 5       │ 'Setting'        │ 2                 │ 4                │ 2         │ 0         │ 2                  │ 4                       │
│ 6       │ 'User'           │ 367               │ 7                │ 2         │ 365       │ 2                  │ 372                     │
│ 7       │ 'AnalyticsEvent' │ 462               │ 33               │ 0         │ 462       │ 0                  │ 495                     │
│ 8       │ 'TOTAL'          │ 852               │ 53               │ 13        │ 839       │ 13                 │ 892                     │
└─────────┴──────────────────┴───────────────────┴──────────────────┴───────────┴───────────┴────────────────────┴─────────────────────────┘
```

### Table Count & Deduplication Clarifications
- **Current D1 Total**: Exactly **53 rows** (`2 + 5 + 0 + 0 + 2 + 4 + 7 + 33 = 53`).
- **AnalyticsEvent Append Behavior**: The 462 Supabase events are historical analytics from July–October 16, 2026. The 33 D1 events are new sessions recorded on October 29, 2026. There is zero timestamp or event overlap between the two sets. All 462 are appended to preserve analytics history. Re-running the migration uses epoch timestamp deduplication (`${userId}:${eventType}:${timestamp_ms}`) so that running `--apply` multiple times is 100% idempotent and will never insert duplicates.
- **User Record Handling**: 2 users (`telegramId: 5091399592` and `telegramId: 7358627079`) exist in both databases. Their current live D1 verification and pending states are preserved. The 365 legacy users are inserted with `ON CONFLICT("telegramId") DO NOTHING`.
- **Pre-Migration Backup Verification**: The backup export is verified on disk for non-zero file size and matching row count before any writes are executed.

### Step 2: Apply the Migration (Live Writes)
When ready, execute with `--apply`:

```bash
node scripts/migrate-supabase-to-d1.js --apply
```

What `--apply` does:
1. Connects securely to Supabase PostgreSQL using `DATABASE_URL` from `.env`.
2. Automatically creates a backup snapshot of existing D1 tables in `./backups/`.
3. Batches SQL statements into chunks of 100 statements to respect D1 query limits.
4. Executes batches sequentially with progress logging.
5. Performs post-migration count verification and prints the final report.

### Optional Flags
- `--tables=Channel,Project,Resource`: Migrate only specified tables.
- `--local`: Run against local development D1 instead of remote.
- `--skip-backup`: Skip the pre-migration backup step.

---

## 6. Post-Migration Verification

Run these commands to verify the records in Cloudflare D1:

```bash
# Check table counts in D1
npx wrangler d1 execute telegram-bot-db --remote --command "SELECT count(*) FROM Channel; SELECT count(*) FROM Project; SELECT count(*) FROM Resource;"

# Verify migrated projects
npx wrangler d1 execute telegram-bot-db --remote --json --command "SELECT id, title, slug, channelId, messageId FROM Project;"

# Verify migrated resources
npx wrangler d1 execute telegram-bot-db --remote --json --command "SELECT id, name, slug, downloadLink FROM Resource WHERE slug NOT IN ('topaz-windows', 'topaz-mac');"
```

---

## 7. Deep Links & File Delivery Verification

Once migrated, all direct Telegram deep links will resolve and deliver correctly:

### Direct Resource Links
| URL / Command | Slug | Delivery Action |
| :--- | :--- | :--- |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_topaz-windows` | `topaz-windows` | Delivers tutorial message (if available), Mega download link, Google Drive fix link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_after-effects` | `after-effects` | Delivers After Effects Mega download link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_davinci-resolve` | `davinci-resolve` | Delivers DaVinci Resolve Mega download link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_all-plugins` | `all-plugins` | Delivers All Plugins Mega download link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_topaz-photo-ai` | `topaz-photo-ai` | Delivers MediaFire download link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_adobe-premiere-pro` | `adobe-premiere-pro` | Delivers Adobe Premiere Pro Mega download link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_sfx-pack` | `sfx-pack` | Delivers Sound Effects Pack download link |
| `https://telegram.me/FreatEditzResources_Bot?start=resource_sfx-pack-mac` | `sfx-pack-mac` | Delivers Sound Effects Pack Mac download link |

### Direct Project Links
| URL / Command | Slug | Channel & Message ID | Delivery Action |
| :--- | :--- | :--- | :--- |
| `https://telegram.me/FreatEditzResources_Bot?start=project_text-effect-in-60sec` | `text-effect-in-60sec` | Channel ID 1, Message 7 | `copyMessage` from source channel `-1003943904498` |
| `https://telegram.me/FreatEditzResources_Bot?start=project_one-piece-cc` | `one-piece-cc` | Channel ID 1, Message 8 | `copyMessage` from source channel `-1003943904498` |
| `https://telegram.me/FreatEditzResources_Bot?start=project_element-3d` | `element-3d` | Channel ID 1, Message 9 | `copyMessage` from source channel `-1003943904498` |
| `https://telegram.me/FreatEditzResources_Bot?start=project_adobe-internet-blocker` | `adobe-internet-blocker` | Channel ID 1, Message 11 | `copyMessage` from source channel `-1003943904498` |

---

## 8. Troubleshooting

### Issue 1: `Telegram API error (copyMessage): Bad Request: chat not found`
- **Cause**: The bot has not been added to the private storage channel (`-1003943904498`).
- **Solution**: Open Telegram, navigate to the storage channel ("Freat Editz Bot Database"), click Channel Settings > Administrators > Add Administrator, and add `@FreatEditzResources_Bot`.

### Issue 2: `Telegram getChatMember error: CHAT_ADMIN_REQUIRED`
- **Cause**: The bot needs admin privileges in the public channel (`@freat_editz`) to verify whether users have joined.
- **Solution**: Ensure `@FreatEditzResources_Bot` is added as an administrator to `@freat_editz`.

### Issue 3: `Unique constraint failed on the fields: (slug)`
- **Cause**: Attempting to insert a resource or project with a slug that already exists.
- **Solution**: The migration script uses `ON CONFLICT("slug") DO NOTHING` so running the migration multiple times is completely idempotent.
