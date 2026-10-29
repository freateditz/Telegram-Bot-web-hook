# Cloudflare Workers & Project Environment Setup Guide

This guide details every environment variable, secret, and service binding used across the entire Telegram Bot, Cloudflare Worker backend, and Admin Dashboard.

---

## 1. Master Environment Variable Reference Table

| Variable Name | Required? | Secret? | Where to Obtain Value | Where to Configure | Example Format (Dummy Values) | Used By |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`BOT_TOKEN`** | **Yes** | **Yes** | Telegram [@BotFather](https://t.me/BotFather) (`/newbot` or `/token`) | **Production**: Wrangler Secret (`wrangler secret put BOT_TOKEN`) or CF Dashboard.<br>**Local Worker**: `.dev.vars`<br>**Local Node/Scripts**: `.env` | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` | Telegram Bot client (`telegramBotClient.js`), Webhook dispatch (`bot.js`), Verification (`verificationService.js`), CLI scripts (`set-webhook.js`, `get-webhook-info.js`) |
| **`WEBHOOK_SECRET`** | **Yes** | **Yes** | Generate a random 32-64 char hexadecimal string (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | **Production**: Wrangler Secret (`wrangler secret put WEBHOOK_SECRET`) or CF Dashboard.<br>**Local Worker**: `.dev.vars`<br>**Local Node/Scripts**: `.env` | `d7a8e9f1c2b3a4e5f60718293a4b5c6d7e8f9012` | Webhook route (`/api/webhook`) for validating `X-Telegram-Bot-Api-Secret-Token`, Registration script (`set-webhook.js`) |
| **`CHANNEL`** | **Yes** | No | Telegram channel public handle (`@channelname`) or private ID (`-100...`) | `wrangler.jsonc` (`vars.CHANNEL`), or CF Dashboard Settings > Variables | `@freat_editz` | Verification check (`isChannelMember` via Telegram Bot API), Database seeder |
| **`CHANNEL_LINK`** | **Yes** | No | Your Telegram channel invite link or public URL | `wrangler.jsonc` (`vars.CHANNEL_LINK`), or CF Dashboard Settings > Variables | `https://t.me/freat_editz` | Verification prompt keyboard ("📢 Join Telegram" button) |
| **`YOUTUBE`** | **Yes** | No | Your YouTube channel link | `wrangler.jsonc` (`vars.YOUTUBE`), or CF Dashboard Settings > Variables | `https://youtube.com/@freat_editz` | Verification prompt keyboard ("📺 Subscribe" button) |
| **`CORS_ORIGINS`** | Optional | No | URL of any external dashboard domain calling the API | `wrangler.jsonc` (`vars.CORS_ORIGINS`), or CF Dashboard Settings > Variables | `https://telegram-bot-22xi.vercel.app` | Backend CORS middleware (`isOriginAllowed`) |
| **`NODE_ENV`** | **Yes** | No | Environment mode: `"production"`, `"development"`, or `"test"` | `wrangler.jsonc` (`vars.NODE_ENV = "production"`) | `production` | Cache layers, error logging, URL safety checks |
| **`BACKEND_BASE_URL`** | Optional | No | Full URL of backend API (only needed if Bot is deployed separately from Backend) | `wrangler.jsonc` (`vars.BACKEND_BASE_URL`), or CF Dashboard Settings > Variables | `https://my-worker.workers.dev` | Bot HTTP client (`backendClient.js`, `projectService.js`). In unified Cloudflare Workers, automatically resolves in-process if omitted. |
| **`FRONTEND_URL`** | Optional | No | Single frontend origin to allow via CORS | `wrangler.jsonc` (`vars.FRONTEND_URL`) | `https://admin.example.com` | Backend CORS allowlist |
| **`DATABASE_URL`** | Local Only | No | Local SQLite file path for Prisma CLI (Not used in Cloudflare Workers) | `.env` (local development only) | `file:./backend/prisma/dev.db` | Local Prisma migrations (`prisma migrate dev`) and unit tests |
| **`BACKEND_PORT`** / **`PORT`** | Local Only | No | Local HTTP port for standalone Express server | `.env` (local development only) | `3000` | Local server (`backend/src/server.js`) |
| **`VITE_API_BASE_URL`** | Optional | No | Dashboard API endpoint URL (relative `/api` recommended for Cloudflare) | `dashboard/.env.production` or `dashboard/.env` | `/api` | React dashboard Axios API client (`dashboard/src/lib/api.ts`) |
| **`VITE_APP_NAME`** | Optional | No | Title displayed in the dashboard navbar and sidebar | `dashboard/.env.production` or `dashboard/.env` | `Admin Dashboard` | Dashboard Navbar & Sidebar branding |
| **`VITE_BOT_USERNAME`** | Optional | No | Telegram Bot username (without `@`) for deep-link generation | `dashboard/.env.production` or `dashboard/.env` | `FreatEditzResources_Bot` | Dashboard project link generator (`telegram.me/<bot>?start=project_<slug>`) |

---

## 2. Cloudflare Service Bindings (Configured in `wrangler.jsonc`)

These bindings are managed by Cloudflare and injected directly into the Worker runtime:

| Binding Name | Binding Type | Resource Name | Purpose | Configuration Location |
| :--- | :--- | :--- | :--- | :--- |
| **`DB`** | Cloudflare D1 Database | `telegram-bot-db` | Serverless persistent SQLite database used by Prisma via `@prisma/adapter-d1` | `d1_databases` array in `wrangler.jsonc` |
| **`ASSETS`** | Workers Assets | `./dashboard/dist` | Serves compiled React dashboard assets (HTML, CSS, JS, SVGs) with SPA fallback | `assets` object in `wrangler.jsonc` |

> [!IMPORTANT]
> **Preserve the D1 Database ID**: The database ID in `wrangler.jsonc` (`937296a8-e3f1-49b7-859f-32b42573f2e4`) corresponds to your existing Cloudflare D1 database. Do not delete or change this ID unless you explicitly create a brand new database.

---

## 3. How to Configure Secrets

Secrets are encrypted values that are never committed to Git and never visible in client-side bundles.

### Method A: Using Wrangler CLI (Recommended)

Run these commands from your local project root:

```bash
# 1. Set your Telegram Bot Token
npx wrangler secret put BOT_TOKEN
# When prompted, paste your bot token (e.g., 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ) and press Enter.

# 2. Set your Telegram Webhook Secret Token
npx wrangler secret put WEBHOOK_SECRET
# When prompted, paste your random secret string and press Enter.
```

### Method B: Using Cloudflare Dashboard

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages > Overview**.
3. Click on your worker: `telegram-download-bot`.
4. Go to **Settings > Variables and Secrets**.
5. Under **Secrets**, click **Add**:
   - Variable name: `BOT_TOKEN` | Value: `<your-bot-token>` -> Click **Encrypt & Save**.
   - Variable name: `WEBHOOK_SECRET` | Value: `<your-random-secret>` -> Click **Encrypt & Save**.

---

## 4. How to Configure Public Variables

Public variables (non-sensitive configuration) can be placed directly in `wrangler.jsonc` under `"vars"`:

```jsonc
  "vars": {
    "NODE_ENV": "production",
    "CHANNEL": "@freat_editz",
    "CHANNEL_LINK": "https://t.me/freat_editz",
    "YOUTUBE": "https://youtube.com/@freat_editz",
    "CORS_ORIGINS": "https://telegram-bot-22xi.vercel.app"
  }
```

If you prefer to configure them in the Cloudflare Dashboard:
1. Go to **Workers & Pages > telegram-download-bot > Settings > Variables and Secrets**.
2. Under **Variables**, click **Add** for each key-value pair and click **Save**.

---

## 5. Local Development Configuration (Without Leaking Credentials)

For local development, two template files are provided:

### 1. Cloudflare Workers Local Development (`.dev.vars`)
Wrangler automatically loads `.dev.vars` when you run `npm run dev:worker` (or `npx wrangler dev`).

Create your local `.dev.vars` file:
```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your test values:
```ini
BOT_TOKEN=123456789:YOUR_LOCAL_TEST_BOT_TOKEN_HERE
WEBHOOK_SECRET=your_local_webhook_secret_token_here
```

> [!NOTE]
> `.dev.vars` is included in `.gitignore` and will never be committed to Git.

### 2. Standalone Node.js & CLI Scripts (`.env`)
The migration and webhook scripts (`scripts/set-webhook.js`, etc.) read from `.env` when run locally.

Create your local `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your values:
```ini
BOT_TOKEN=123456789:YOUR_BOT_TOKEN_HERE
WEBHOOK_SECRET=your_webhook_secret_here
CHANNEL=@freat_editz
YOUTUBE=https://youtube.com/@freat_editz
CHANNEL_LINK=https://t.me/freat_editz
DATABASE_URL="file:./backend/prisma/dev.db"
```

---

## 6. Where to Enter Specific Values

### 1. Telegram Bot Token
- **Production**: `npx wrangler secret put BOT_TOKEN`
- **Local Worker Dev**: In `.dev.vars`: `BOT_TOKEN=123456789:ABC...`
- **Webhook Registration CLI**: In `.env`: `BOT_TOKEN=123456789:ABC...`

### 2. Telegram Channel Username / ID
- **Production**: In `wrangler.jsonc` under `"vars"`: `"CHANNEL": "@your_channel"` (or `-100...` for private channels).
- **Admin Dashboard**: Once deployed, you can also manage channels dynamically through the dashboard UI.

### 3. Telegram Channel Invitation Link
- **Production**: In `wrangler.jsonc` under `"vars"`: `"CHANNEL_LINK": "https://t.me/your_channel"`

### 4. YouTube URL
- **Production**: In `wrangler.jsonc` under `"vars"`: `"YOUTUBE": "https://youtube.com/@your_channel"`

### 5. Webhook Secret Token
- **Production**: `npx wrangler secret put WEBHOOK_SECRET`
- **Registration**: Used automatically by `npm run webhook:set`.

---

## 7. Security Best Practices & Audit Checklist

- [x] **No Secrets in Source Code**: Neither `BOT_TOKEN` nor `WEBHOOK_SECRET` are hardcoded in any JS, TS, or JSON files.
- [x] **Git Ignored**: `.env`, `.env.*` (except examples), `.dev.vars`, and `*.log` files are strictly excluded in `.gitignore`.
- [x] **Token Redaction**: `telegramBotClient.js` sanitizes all outgoing error messages so `BOT_TOKEN` is never printed in logs or error traces.
- [x] **No Localhost Fallbacks in Production**: The backend and frontend never fall back to localhost in production mode.
- [x] **Same-Origin Dashboard**: The dashboard uses relative `/api` URLs, preventing cross-origin data exposure.
