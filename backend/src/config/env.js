const isCloudflareWorker =
  (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") ||
  typeof WebSocketPair !== "undefined";

// In Node.js environments (local dev & test runs), load .env if present.
// In Cloudflare Workers, runtime bindings/secrets are passed via initEnv() or c.env.
if (!isCloudflareWorker && typeof process !== "undefined" && process.versions?.node) {
  try {
    const dotenv = require("dotenv");
    dotenv.config();
  } catch (_) {
    // Ignore if dotenv is not present or inaccessible
  }
}

const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const PRODUCTION_DEFAULTS = [
  "https://telegram-bot-22xi.vercel.app",
  "https://telegram-bot-production-0b25.up.railway.app",
];

const LOCAL_DEFAULTS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

let workerOverrides = {};

function parseList(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getVal(key, defaultVal = "") {
  return (
    workerOverrides[key] ??
    (typeof process !== "undefined" && process.env ? process.env[key] : undefined) ??
    defaultVal
  );
}

function buildCorsOrigins() {
  const explicit = parseList(getVal("CORS_ORIGINS"));
  const frontendUrl = (getVal("FRONTEND_URL") || "").trim();

  const fromEnv = [...explicit];
  if (frontendUrl) {
    fromEnv.push(frontendUrl);
  }

  const seen = new Set();
  const merged = [];
  for (const origin of [...fromEnv, ...PRODUCTION_DEFAULTS, ...LOCAL_DEFAULTS]) {
    if (!seen.has(origin)) {
      seen.add(origin);
      merged.push(origin);
    }
  }
  return merged;
}

function isOriginAllowed(origin, allowedList) {
  if (!origin) return true; // same-origin, curl, server-to-server
  const list = allowedList || buildCorsOrigins();
  if (list.includes(origin)) return true;
  if (VERCEL_PREVIEW_REGEX.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function initEnv(workerEnv = {}) {
  workerOverrides = { ...workerEnv };
  // Also populate process.env if available
  if (typeof process !== "undefined" && process.env) {
    for (const [k, v] of Object.entries(workerEnv)) {
      if (typeof v === "string") {
        process.env[k] = v;
      }
    }
  }
}

const envConfig = {
  get nodeEnv() { return getVal("NODE_ENV", "development"); },
  get port() { return Number(getVal("PORT", getVal("BACKEND_PORT", "3000"))); },
  get databaseUrl() { return getVal("DATABASE_URL", ""); },
  get botToken() { return getVal("BOT_TOKEN", ""); },
  get webhookSecret() { return getVal("WEBHOOK_SECRET", ""); },
  get telegramChannel() { return getVal("CHANNEL", ""); },
  get youtubeUrl() { return getVal("YOUTUBE", ""); },
  get channelLink() { return getVal("CHANNEL_LINK", ""); },
  get frontendUrl() { return getVal("FRONTEND_URL", ""); },
  get corsOrigins() { return buildCorsOrigins(); },

  isOriginAllowed,
  initEnv,
};

module.exports = envConfig;
