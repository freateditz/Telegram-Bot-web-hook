/**
 * Supabase PostgreSQL to Cloudflare D1 Migration Utility
 *
 * Safely migrates legacy Supabase content (Channels, Projects, Resources,
 * Settings, Users, AnalyticsEvents) into Cloudflare D1.
 *
 * Usage:
 *   node scripts/migrate-supabase-to-d1.js               # Dry-run mode (default)
 *   node scripts/migrate-supabase-to-d1.js --dry-run     # Explicit dry-run
 *   node scripts/migrate-supabase-to-d1.js --apply       # Live migration to D1
 *   node scripts/migrate-supabase-to-d1.js --apply --local # Migrate to local D1
 *   node scripts/migrate-supabase-to-d1.js --tables=Channel,Project,Resource
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { Client } = require("pg");
require("dotenv").config();

// Configuration
const D1_DATABASE_NAME = "telegram-bot-db";
const BACKUP_DIR = path.resolve(__dirname, "../backups");

// Parse command line arguments
const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const isDryRun = !isApply || args.includes("--dry-run");
const isLocal = args.includes("--local");
const skipBackup = args.includes("--skip-backup");
const tablesArg = args.find((a) => a.startsWith("--tables="));
const selectedTables = tablesArg
    ? tablesArg.split("=")[1].split(",").map((t) => t.trim().toLowerCase())
    : null;

// Tables in dependency order (respecting foreign keys)
const ALL_TABLES = [
    "Platform",
    "Category",
    "Channel",
    "Project",
    "Resource",
    "Setting",
    "User",
    "AnalyticsEvent",
];

function sanitizeSqlString(val) {
    if (val === null || val === undefined) return "NULL";
    return `'${String(val).replace(/'/g, "''")}'`;
}

function sanitizeSqlBool(val) {
    if (val === null || val === undefined) return "0";
    return val ? "1" : "0";
}

function sanitizeSqlInt(val) {
    if (val === null || val === undefined || val === "") return "NULL";
    const num = Number(val);
    return isNaN(num) ? "NULL" : String(Math.floor(num));
}

function sanitizeSqlDate(val) {
    if (!val) return "NULL";
    if (val instanceof Date) return `'${val.toISOString()}'`;
    return `'${new Date(val).toISOString()}'`;
}

function sanitizeSqlJson(val) {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "object") {
        return sanitizeSqlString(JSON.stringify(val));
    }
    return sanitizeSqlString(String(val));
}

/**
 * Execute a query against D1 using wrangler CLI and return JSON results
 */
function queryD1(sql, { local = isLocal } = {}) {
    const flag = local ? "--local" : "--remote";
    const cmd = `npx wrangler d1 execute ${D1_DATABASE_NAME} ${flag} --json --command "${sql.replace(/"/g, '\\"')}"`;
    try {
        const stdout = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        const parsed = JSON.parse(stdout);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].results) {
            return parsed[0].results;
        }
        return [];
    } catch (err) {
        const errorMsg = (err.stderr || err.message || "").replace(/bot\d+:[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]");
        throw new Error(`D1 query failed: ${errorMsg}`);
    }
}

/**
 * Execute a SQL file against D1
 */
function executeSqlFileInD1(filePath, { local = isLocal } = {}) {
    const flag = local ? "--local" : "--remote";
    const cmd = `npx wrangler d1 execute ${D1_DATABASE_NAME} ${flag} --file="${filePath}"`;
    try {
        const stdout = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        return stdout;
    } catch (err) {
        const errorMsg = (err.stderr || err.message || "").replace(/bot\d+:[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]");
        throw new Error(`D1 execute SQL file failed: ${errorMsg}`);
    }
}

/**
 * Connect to Supabase PostgreSQL database
 */
async function getSupabaseClient() {
    const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error(
            "SUPABASE_DATABASE_URL or DATABASE_URL environment variable is not defined in .env"
        );
    }
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    return client;
}

/**
 * Create a full SQL backup of existing D1 database before making changes
 */
async function backupD1Database() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupSqlPath = path.join(BACKUP_DIR, `d1-backup-${timestamp}.sql`);
    const backupMetaPath = path.join(BACKUP_DIR, `d1-backup-${timestamp}.meta.json`);

    console.log(`\n📦 Creating D1 database backup at ${backupSqlPath}...`);

    const dumpStatements = [];
    const metaCounts = {};

    for (const table of ALL_TABLES) {
        try {
            const rows = queryD1(`SELECT * FROM "${table}";`);
            metaCounts[table] = rows.length;

            if (rows.length > 0) {
                dumpStatements.push(`-- Table: ${table} (${rows.length} rows)`);
                for (const row of rows) {
                    const cols = Object.keys(row);
                    const colNames = cols.map((c) => `"${c}"`).join(", ");
                    const colValues = cols.map((c) => {
                        const val = row[c];
                        if (val === null || val === undefined) return "NULL";
                        if (typeof val === "number") return String(val);
                        if (typeof val === "boolean") return val ? "1" : "0";
                        return sanitizeSqlString(String(val));
                    }).join(", ");
                    dumpStatements.push(`INSERT OR IGNORE INTO "${table}" (${colNames}) VALUES (${colValues});`);
                }
                dumpStatements.push("");
            }
        } catch (err) {
            console.warn(`[Backup] Notice for table ${table}:`, err.message);
        }
    }

    fs.writeFileSync(backupSqlPath, dumpStatements.join("\n"), "utf8");
    fs.writeFileSync(backupMetaPath, JSON.stringify({ timestamp, metaCounts }, null, 2), "utf8");

    // Verification of backup
    if (!fs.existsSync(backupSqlPath) || fs.statSync(backupSqlPath).size === 0) {
        throw new Error(`Backup verification failed: File ${backupSqlPath} is empty or was not created.`);
    }

    const totalBackedUpRows = Object.values(metaCounts).reduce((a, b) => a + b, 0);
    console.log(`✅ D1 backup created and verified successfully (${totalBackedUpRows} total rows, ${fs.statSync(backupSqlPath).size} bytes at ${backupSqlPath}).`);
    return backupSqlPath;
}

async function runMigration() {
    console.log("==================================================================");
    console.log("  SUPABASE POSTGRESQL TO CLOUDFLARE D1 MIGRATION UTILITY");
    console.log("==================================================================");
    console.log(`Target D1 Database: ${D1_DATABASE_NAME} (${isLocal ? "LOCAL" : "REMOTE"})`);
    console.log(`Execution Mode:     ${isDryRun ? "🔍 DRY-RUN (No writes)" : "🚀 APPLY (Live Migration)"}`);

    // Step 1: Connect to Supabase
    let pgClient;
    try {
        pgClient = await getSupabaseClient();
        console.log("✅ Connected to Supabase PostgreSQL successfully.");
    } catch (err) {
        console.error("❌ Failed to connect to Supabase PostgreSQL:", err.message);
        process.exit(1);
    }

    // Filter tables if --tables was provided
    const tablesToProcess = ALL_TABLES.filter((t) => {
        if (!selectedTables) return true;
        return selectedTables.includes(t.toLowerCase());
    });

    const report = {};
    const generatedSqlStatements = [];

    try {
        // Step 2: Fetch data from Supabase and D1 for each table and build migration SQL
        for (const table of tablesToProcess) {
            console.log(`\nAnalyzing table [${table}]...`);

            // Fetch from Supabase
            const sbRes = await pgClient.query(`SELECT * FROM "${table}" ORDER BY "id" ASC;`);
            const sbRows = sbRes.rows;

            // Fetch from D1
            const d1Rows = queryD1(`SELECT * FROM "${table}";`);

            report[table] = {
                supabaseCount: sbRows.length,
                d1Count: d1Rows.length,
                conflicts: 0,
                toInsert: 0,
                toSkip: 0,
                details: [],
            };

            switch (table) {
                case "Platform": {
                    const existingSlugs = new Set(d1Rows.map((r) => r.slug));
                    for (const row of sbRows) {
                        if (existingSlugs.has(row.slug)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            report[table].details.push(`+ Insert Platform '${row.name}' (slug: ${row.slug})`);
                            generatedSqlStatements.push(
                                `INSERT INTO "Platform" ("id", "name", "slug", "createdAt") VALUES (${sanitizeSqlInt(row.id)}, ${sanitizeSqlString(row.name)}, ${sanitizeSqlString(row.slug)}, ${sanitizeSqlDate(row.createdAt)}) ON CONFLICT("slug") DO NOTHING;`
                            );
                        }
                    }
                    break;
                }

                case "Category": {
                    const existingSlugs = new Set(d1Rows.map((r) => r.slug));
                    for (const row of sbRows) {
                        if (existingSlugs.has(row.slug)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            report[table].details.push(`+ Insert Category '${row.name}' (slug: ${row.slug})`);
                            generatedSqlStatements.push(
                                `INSERT INTO "Category" ("id", "name", "slug", "displayOrder", "createdAt") VALUES (${sanitizeSqlInt(row.id)}, ${sanitizeSqlString(row.name)}, ${sanitizeSqlString(row.slug)}, ${sanitizeSqlInt(row.displayOrder)}, ${sanitizeSqlDate(row.createdAt)}) ON CONFLICT("slug") DO NOTHING;`
                            );
                        }
                    }
                    break;
                }

                case "Channel": {
                    const existingChannelIds = new Set(d1Rows.map((r) => r.channelId));
                    for (const row of sbRows) {
                        if (existingChannelIds.has(row.channelId)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            report[table].details.push(`+ Insert Channel id=${row.id} name='${row.name}' channelId='${row.channelId}'`);
                            generatedSqlStatements.push(
                                `INSERT INTO "Channel" ("id", "name", "channelId", "username", "isActive", "createdAt", "updatedAt") VALUES (${sanitizeSqlInt(row.id)}, ${sanitizeSqlString(row.name)}, ${sanitizeSqlString(row.channelId)}, ${sanitizeSqlString(row.username)}, ${sanitizeSqlBool(row.isActive)}, ${sanitizeSqlDate(row.createdAt)}, ${sanitizeSqlDate(row.updatedAt)}) ON CONFLICT("channelId") DO NOTHING;`
                            );
                        }
                    }
                    break;
                }

                case "Project": {
                    const existingSlugs = new Set(d1Rows.map((r) => r.slug));
                    for (const row of sbRows) {
                        if (existingSlugs.has(row.slug)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            report[table].details.push(`+ Insert Project id=${row.id} title='${row.title}' slug='${row.slug}' (channelId: ${row.channelId}, messageId: ${row.messageId})`);
                            generatedSqlStatements.push(
                                `INSERT INTO "Project" ("id", "title", "slug", "description", "telegramFileId", "thumbnail", "isActive", "createdAt", "updatedAt", "downloadCount", "lastDownloadedAt", "failedVerificationCount", "lastViewedAt", "viewCount", "telegramMessageLink", "channelId", "messageId") VALUES (` +
                                `${sanitizeSqlInt(row.id)}, ` +
                                `${sanitizeSqlString(row.title)}, ` +
                                `${sanitizeSqlString(row.slug)}, ` +
                                `${sanitizeSqlString(row.description)}, ` +
                                `${sanitizeSqlString(row.telegramFileId)}, ` +
                                `${sanitizeSqlString(row.thumbnail)}, ` +
                                `${sanitizeSqlBool(row.isActive)}, ` +
                                `${sanitizeSqlDate(row.createdAt)}, ` +
                                `${sanitizeSqlDate(row.updatedAt)}, ` +
                                `${sanitizeSqlInt(row.downloadCount || 0)}, ` +
                                `${sanitizeSqlDate(row.lastDownloadedAt)}, ` +
                                `${sanitizeSqlInt(row.failedVerificationCount || 0)}, ` +
                                `${sanitizeSqlDate(row.lastViewedAt)}, ` +
                                `${sanitizeSqlInt(row.viewCount || 0)}, ` +
                                `${sanitizeSqlString(row.telegramMessageLink)}, ` +
                                `${sanitizeSqlInt(row.channelId)}, ` +
                                `${sanitizeSqlInt(row.messageId)}` +
                                `) ON CONFLICT("slug") DO NOTHING;`
                            );
                        }
                    }
                    break;
                }

                case "Resource": {
                    const existingSlugs = new Set(d1Rows.map((r) => r.slug));
                    for (const row of sbRows) {
                        if (existingSlugs.has(row.slug)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            report[table].details.push(`+ Insert Resource id=${row.id} name='${row.name}' slug='${row.slug}' (platform: ${row.platformId}, category: ${row.categoryId})`);
                            generatedSqlStatements.push(
                                `INSERT INTO "Resource" ("id", "name", "slug", "description", "version", "platformId", "categoryId", "downloadLink", "fixLink", "tutorialChannelId", "tutorialMessageId", "displayOrder", "isVisible", "createdAt", "updatedAt") VALUES (` +
                                `${sanitizeSqlInt(row.id)}, ` +
                                `${sanitizeSqlString(row.name)}, ` +
                                `${sanitizeSqlString(row.slug)}, ` +
                                `${sanitizeSqlString(row.description)}, ` +
                                `${sanitizeSqlString(row.version)}, ` +
                                `${sanitizeSqlInt(row.platformId)}, ` +
                                `${sanitizeSqlInt(row.categoryId)}, ` +
                                `${sanitizeSqlString(row.downloadLink)}, ` +
                                `${sanitizeSqlString(row.fixLink)}, ` +
                                `${sanitizeSqlString(row.tutorialChannelId)}, ` +
                                `${sanitizeSqlInt(row.tutorialMessageId)}, ` +
                                `${sanitizeSqlInt(row.displayOrder || 0)}, ` +
                                `${sanitizeSqlBool(row.isVisible)}, ` +
                                `${sanitizeSqlDate(row.createdAt)}, ` +
                                `${sanitizeSqlDate(row.updatedAt)}` +
                                `) ON CONFLICT("slug") DO NOTHING;`
                            );
                        }
                    }
                    break;
                }

                case "Setting": {
                    const existingKeys = new Set(d1Rows.map((r) => r.key));
                    for (const row of sbRows) {
                        if (existingKeys.has(row.key)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            report[table].details.push(`+ Insert Setting key='${row.key}'`);
                            generatedSqlStatements.push(
                                `INSERT INTO "Setting" ("key", "value") VALUES (${sanitizeSqlString(row.key)}, ${sanitizeSqlString(row.value)}) ON CONFLICT("key") DO NOTHING;`
                            );
                        }
                    }
                    break;
                }

                case "User": {
                    const existingTelegramIds = new Set(d1Rows.map((r) => r.telegramId));
                    for (const row of sbRows) {
                        if (existingTelegramIds.has(row.telegramId)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            generatedSqlStatements.push(
                                `INSERT INTO "User" ("telegramId", "verified", "createdAt", "pendingProjectId") VALUES (${sanitizeSqlString(row.telegramId)}, ${sanitizeSqlBool(row.verified)}, ${sanitizeSqlDate(row.createdAt)}, ${sanitizeSqlInt(row.pendingProjectId)}) ON CONFLICT("telegramId") DO NOTHING;`
                            );
                        }
                    }
                    report[table].details.push(`+ Insert ${report[table].toInsert} legacy users (preserved ${report[table].toSkip} existing D1 users)`);
                    break;
                }

                case "AnalyticsEvent": {
                    // Collect signature set of existing D1 events using epoch timestamp for exact match: userId:eventType:createdAtMs
                    const existingSignatures = new Set(
                        d1Rows.map((r) => `${r.userId}:${r.eventType}:${r.createdAt ? new Date(r.createdAt).getTime() : 0}`)
                    );
                    for (const row of sbRows) {
                        const sig = `${row.userId}:${row.eventType}:${row.createdAt ? new Date(row.createdAt).getTime() : 0}`;
                        if (existingSignatures.has(sig)) {
                            report[table].conflicts++;
                            report[table].toSkip++;
                        } else {
                            report[table].toInsert++;
                            generatedSqlStatements.push(
                                `INSERT INTO "AnalyticsEvent" ("userId", "projectId", "resourceId", "eventType", "metadata", "createdAt") VALUES (` +
                                `${sanitizeSqlInt(row.userId)}, ` +
                                `${sanitizeSqlInt(row.projectId)}, ` +
                                `${sanitizeSqlInt(row.resourceId)}, ` +
                                `${sanitizeSqlString(row.eventType)}, ` +
                                `${sanitizeSqlJson(row.metadata)}, ` +
                                `${sanitizeSqlDate(row.createdAt)}` +
                                `);`
                            );
                        }
                    }
                    report[table].details.push(`+ Insert ${report[table].toInsert} legacy analytics events (skipped ${report[table].toSkip} duplicates)`);
                    break;
                }
            }
        }
    } finally {
        await pgClient.end();
    }

    // Step 3: Print Dry-run / Pre-migration Report
    console.log("\n==================================================================");
    console.log("                  MIGRATION AUDIT & PLAN");
    console.log("==================================================================");

    const auditRows = tablesToProcess.map((t) => ({
        Table: t,
        "Source (Supabase)": report[t].supabaseCount,
        "Destination (D1)": report[t].d1Count,
        "Conflicts": report[t].conflicts,
        "To Insert": report[t].toInsert,
        "To Skip (Preserve)": report[t].toSkip,
        "Expected Post-Migration": report[t].d1Count + report[t].toInsert,
    }));

    const totals = {
        Table: "TOTAL",
        "Source (Supabase)": auditRows.reduce((sum, r) => sum + r["Source (Supabase)"], 0),
        "Destination (D1)": auditRows.reduce((sum, r) => sum + r["Destination (D1)"], 0),
        "Conflicts": auditRows.reduce((sum, r) => sum + r["Conflicts"], 0),
        "To Insert": auditRows.reduce((sum, r) => sum + r["To Insert"], 0),
        "To Skip (Preserve)": auditRows.reduce((sum, r) => sum + r["To Skip (Preserve)"], 0),
        "Expected Post-Migration": auditRows.reduce((sum, r) => sum + r["Expected Post-Migration"], 0),
    };

    console.table([...auditRows, totals]);

    console.log("\nKey Actions Summary:");
    for (const t of Object.keys(report)) {
        if (report[t].details.length > 0) {
            console.log(`\n[${t}]:`);
            report[t].details.forEach((d) => console.log(`  ${d}`));
        }
    }

    const totalToInsert = Object.values(report).reduce((sum, r) => sum + r.toInsert, 0);
    console.log(`\nTotal records planned for insertion: ${totalToInsert}`);
    console.log(`Total generated SQL statements:     ${generatedSqlStatements.length}`);

    // If dry-run, stop here
    if (isDryRun) {
        console.log("\n------------------------------------------------------------------");
        console.log("🔍 DRY RUN COMPLETE: No changes were written to Cloudflare D1.");
        console.log("To apply these changes to the live database, run:");
        console.log("  node scripts/migrate-supabase-to-d1.js --apply");
        console.log("------------------------------------------------------------------\n");
        return;
    }

    // Step 4: Live Apply
    console.log("\n🚀 APPLYING MIGRATION TO CLOUDFLARE D1...");

    // Create D1 backup first unless explicitly skipped
    if (!skipBackup) {
        await backupD1Database();
    }

    if (generatedSqlStatements.length === 0) {
        console.log("✅ D1 database is already up to date. No migration SQL to execute.");
        return;
    }

    // Execute statements in batches of 100 to respect D1 statement limits
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < generatedSqlStatements.length; i += BATCH_SIZE) {
        batches.push(generatedSqlStatements.slice(i, i + BATCH_SIZE));
    }

    console.log(`\nExecuting ${generatedSqlStatements.length} statements in ${batches.length} batches...`);

    for (let idx = 0; idx < batches.length; idx++) {
        const batch = batches[idx];
        const tempSqlPath = path.join(BACKUP_DIR, `migration-batch-${idx + 1}-${Date.now()}.sql`);
        const sqlContent = [
            "PRAGMA foreign_keys = ON;",
            ...batch,
        ].join("\n");

        fs.writeFileSync(tempSqlPath, sqlContent, "utf8");

        try {
            console.log(`[Batch ${idx + 1}/${batches.length}] Executing ${batch.length} statements...`);
            executeSqlFileInD1(tempSqlPath);
            console.log(`✅ [Batch ${idx + 1}/${batches.length}] Done.`);
        } finally {
            if (fs.existsSync(tempSqlPath)) {
                try { fs.unlinkSync(tempSqlPath); } catch (_) {}
            }
        }
    }

    console.log("\n🎉 ALL MIGRATION BATCHES EXECUTED SUCCESSFULLY!");

    // Post-migration verification
    console.log("\nVerifying post-migration row counts in D1...");
    const verification = {};
    for (const table of tablesToProcess) {
        const rows = queryD1(`SELECT count(*) as count FROM "${table}";`);
        verification[table] = rows[0] ? rows[0].count : 0;
    }
    console.table(
        Object.keys(verification).map((t) => ({
            Table: t,
            "Previous D1": report[t].d1Count,
            "New D1 Count": verification[t],
            "Expected Count": report[t].d1Count + report[t].toInsert,
        }))
    );
}

runMigration().catch((err) => {
    console.error("Migration error:", err.message);
    process.exit(1);
});
