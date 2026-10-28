# Cloudflare Workers Deployment Guide

This guide provides step-by-step instructions for deploying your Telegram Bot, Express REST API backend, and React Dashboard to **Cloudflare Workers** with **Cloudflare D1** and **Workers Assets** on Cloudflare's **100% Free Plan**.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │            Cloudflare Edge              │
                      └────────────────────┬────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │                                     │
           Path: `/assets/*` or Web UI            Path: `/api/*` or `/webhook`
                        │                                     │
                        ▼                                     ▼
             ┌─────────────────────┐               ┌─────────────────────┐
             │   Workers Assets    │               │  Cloudflare Worker  │
             │  (Dashboard SPA)    │               │ (Backend + Webhook) │
             └─────────────────────┘               └──────────┬──────────┘
                                                              │
                                       ┌──────────────────────┼──────────────────────┐
                                       │                      │                      │
                                       ▼                      ▼                      ▼
                            ┌─────────────────────┐┌─────────────────────┐┌─────────────────────┐
                            │ Cloudflare D1 (SQL) ││ Telegram Bot API    ││   Cron Triggers     │
                            │ (Persistent Storage)││   (HTTPS Fetch)     ││ (Daily 24h Cleanup) │
                            └─────────────────────┘└─────────────────────┘└─────────────────────┘
```

- **Runtime**: Cloudflare Workers (V8 isolate with `nodejs_compat`).
- **Database**: Cloudflare D1 (Serverless SQLite managed by Cloudflare, persistent across deployments).
- **ORM / Client**: Prisma 6 with `@prisma/adapter-d1`.
- **Bot Delivery**: Telegram HTTPS Webhooks (`POST /api/webhook`) authenticated via `X-Telegram-Bot-Api-Secret-Token`.
- **Frontend**: Vite + React 19 Admin Dashboard served via Cloudflare Workers Assets.
- **Cost**: **$0 / month (Free Plan)**. Fits well within the 100,000 requests/day, 10ms CPU time, and 5M D1 read rows/day free quotas.

---

## ⚠️ Security Notice: Credentials to Rotate

During the project audit, an exposed database connection string was discovered in `.env.example`:
`postgresql://postgres:jagbeC-0ciqsy-takfan@db.jtguqwjtqybbtjxurdhx.supabase.co:5432/postgres`

> [!CAUTION]
> If this Supabase database is active, **you must rotate its database password immediately** in the [Supabase Dashboard](https://supabase.com/dashboard) under **Project Settings > Database > Database Password**. Removing the credential from the file does not revoke access to an already exposed password.

---

## Prerequisites

1. **Node.js**: Version 18 or higher (Node 24 recommended).
2. **Cloudflare Account**: Sign up for free at [cloudflare.com](https://dash.cloudflare.com/sign-up).
3. **Telegram Bot Token**: Created via [@BotFather](https://t.me/BotFather) on Telegram.
4. **Telegram Channel**: The public or private channel where your download files/tutorials live (e.g. `@freat_editz`). Make sure your bot is added as an **Administrator** of this channel so it can check membership and forward messages.

---

## Step 1: Install Dependencies and Verify Locally

Clone or open this repository, then install dependencies:

```bash
# 1. Install root dependencies
npm install

# 2. Install dashboard frontend dependencies
cd dashboard && npm install && cd ..

# 3. Run the automated test suite (verifies bot, API, and database operations)
npm test
```

You should see all 35 tests passing cleanly.

---

## Step 2: Log in to Cloudflare CLI

Authenticate Wrangler with your Cloudflare account:

```bash
npx wrangler login
```

A browser window will open asking you to authorize Wrangler. Click **Allow**.

---

## Step 3: Create and Initialize Cloudflare D1 Database

### 1. Create the D1 Database

Run this command in the project root:

```bash
npx wrangler d1 create telegram-bot-db
```

Output will look similar to this:

```
✅ Successfully created DB 'telegram-bot-db'!

Add the following to your configuration file:
[[d1_databases]]
binding = "DB"
database_name = "telegram-bot-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. Update `wrangler.jsonc`

Open `wrangler.jsonc` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the `database_id` output from the previous command:

```jsonc
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "telegram-bot-db",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "migrations_dir": "migrations"
    }
  ],
```

### 3. Run Migrations on Remote D1 Database

Execute the schema migration against your live Cloudflare D1 database:

```bash
npm run d1:migrate:remote
```

When prompted `Are you sure you want to apply these migrations to telegram-bot-db?`, type `y` and press Enter.

### 4. Seed Initial Data (Platforms, Categories, Settings)

Seed the initial OS platforms (Windows, macOS), categories (Software, Plugins, Presets, Fonts, Sound Effects), resources, and default settings:

```bash
npm run d1:seed:remote
```

---

## Step 4: Configure Secrets and Environment Variables

Cloudflare Workers uses **Secrets** for sensitive values (encrypted at rest, never visible in logs or client bundles) and **Vars** for general settings.

### 1. Set Sensitive Secrets via Wrangler

Run these two commands and paste your values when prompted:

```bash
# Your Telegram Bot Token from @BotFather
npx wrangler secret put BOT_TOKEN

# A random secret string (alphanumeric, e.g. 32-64 characters)
# Telegram sends this in header X-Telegram-Bot-Api-Secret-Token on every webhook call
npx wrangler secret put WEBHOOK_SECRET
```

> [!TIP]
> You can generate a strong webhook secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 2. Configure Channel & Social Links (in `wrangler.jsonc`)

Open `wrangler.jsonc` and add or edit the `vars` object to match your channels:

```jsonc
  "vars": {
    "NODE_ENV": "production",
    "CHANNEL": "@freat_editz",
    "YOUTUBE": "https://youtube.com/@freat_editz",
    "CHANNEL_LINK": "https://t.me/freat_editz",
    "CORS_ORIGINS": "https://telegram-bot-22xi.vercel.app"
  }
```

---

## Step 5: Build and Deploy the Worker

Build the dashboard frontend and deploy everything in a single command:

```bash
npm run deploy
```

This script:
1. Compiles the React + Vite dashboard into `dashboard/dist`.
2. Bundles the Worker entry point with Prisma D1 adapter into a minified bundle.
3. Uploads the static assets to Cloudflare Assets.
4. Deploys the Worker to Cloudflare's global edge network.

At the end of the deployment, Wrangler will output your live URL:
```
Deployed telegram-download-bot to https://telegram-download-bot.<your-subdomain>.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Copy your Worker domain (e.g., `https://telegram-download-bot.john-doe.workers.dev`).

---

## Step 6: Register the Telegram Webhook

Now connect your Telegram bot to your newly deployed Cloudflare Worker endpoint:

```bash
# Set BOT_TOKEN and WEBHOOK_SECRET in environment or .env, then run:
BOT_TOKEN="your_token_here" WEBHOOK_SECRET="your_secret_here" npm run webhook:set https://<your-worker-domain>.workers.dev/api/webhook
```

You should see output confirming:
```
Setting Telegram webhook for URL: https://<your-worker-domain>.workers.dev/api/webhook
Configuring X-Telegram-Bot-Api-Secret-Token verification.
✅ Webhook successfully registered with Telegram: true

--- Current Webhook Status ---
URL: https://<your-worker-domain>.workers.dev/api/webhook
Has custom certificate: false
Pending update count: 0
Last error date: None
Last error message: None
------------------------------
```

---

## Step 7: Verify Everything Works

### 1. Check Webhook Status
At any time, you can verify your bot's live webhook status:
```bash
BOT_TOKEN="your_token_here" npm run webhook:info
```

### 2. Test the Live Telegram Bot
Open your Telegram app:
1. Search for your bot and click **Start** (or send `/start`).
2. You should immediately receive the verification prompt with buttons for YouTube, Telegram, and `Check Access`.
3. Try deep links:
   - `/start resource_topaz-windows`
4. Test back navigation buttons and category selections.

### 3. Open the Dashboard in your Browser
Navigate to your Worker URL in your browser:
`https://<your-worker-domain>.workers.dev/`

The Admin Dashboard will load. You can manage platforms, categories, resources, channels, projects, and view analytics directly.

---

## Local Development & Testing

You can run the entire Cloudflare Worker environment locally (using a local SQLite D1 replica):

```bash
# 1. Run migrations on local D1 instance
npm run d1:migrate:local

# 2. Seed local D1 instance
npm run d1:seed:local

# 3. Start local Cloudflare Workers dev server
npm run dev:worker
```

The dev server will run at `http://localhost:8787`. You can test API endpoints like `http://localhost:8787/api/health` and `http://localhost:8787/api/platforms`.

---

## Troubleshooting Guide

### 1. `Error: BOT_TOKEN is missing or empty`
- Ensure you set the secret using `npx wrangler secret put BOT_TOKEN`.
- If testing locally, ensure `BOT_TOKEN` is present in your `.env` file.

### 2. `Unauthorized: Invalid secret token` (HTTP 401)
- The webhook secret sent by Telegram in `X-Telegram-Bot-Api-Secret-Token` does not match `WEBHOOK_SECRET`.
- Re-run `npx wrangler secret put WEBHOOK_SECRET` and re-register the webhook with `npm run webhook:set`.

### 3. Telegram says `Wrong response from the webhook: 500 Internal Server Error`
- Check real-time Worker logs:
  ```bash
  npx wrangler tail
  ```
- Trigger a command in Telegram to see the live stack trace in your terminal.

### 4. `D1_ERROR: no such table: Platform`
- You forgot to run migrations on remote D1.
- Run `npm run d1:migrate:remote`.

### 5. Bot not copying tutorial messages or project files
- Ensure the Bot is an **Administrator** in the source channel with permission to access and forward messages.
- Check that the `tutorialChannelId` matches the numeric channel id (e.g. `-1003943904498`).

---

## Rolling Back to a Previous Version

### Option A: Instant Cloudflare Rollback (via CLI)
Cloudflare Workers maintains version history. To roll back to a previous deployment without rebuilding:

```bash
# List previous versions
npx wrangler versions list

# Roll back to a specific version ID
npx wrangler rollback <VERSION_ID>
```

### Option B: Rollback via Cloudflare Dashboard
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Go to **Workers & Pages > telegram-download-bot > Deployments**.
3. Locate the previous deployment and click **Rollback to this version**.

### Option C: Reverting to Local Node.js Polling Mode
If you ever want to temporarily run the bot locally via long-polling:
1. Delete the webhook: `BOT_TOKEN=xxx npm run webhook:delete -- --force`
2. Start the local server and bot: `npm start`
