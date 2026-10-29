/**
 * Strongly-typed access to Vite environment variables.
 *
 * `VITE_API_BASE_URL` must always end with `/api` because the
 * frontend composes paths like `${apiBaseUrl}/resources`. Both of
 * the following shapes are valid:
 *
 *   - Local (Vite proxy): "/api"
 *   - Production (absolute): "https://<backend-host>/api"
 *
 * Vite automatically loads:
 *   - `.env`             — every mode
 *   - `.env.development` — `vite dev`
 *   - `.env.production`  — `vite build`
 *
 * We resolve the URL in this priority:
 *   1. Vercel-injected `VITE_API_BASE_URL` (set in the project's
 *      Environment Variables panel) — wins over files when set.
 *   2. File-loaded value (`.env.production` for prod, `.env` for dev).
 *
 * Use this module everywhere instead of `import.meta.env` so missing
 * keys fail loud during development rather than silently at runtime.
 */

interface AppEnv {
  apiBaseUrl: string;
  appName: string;
  botUsername: string;
}

function normalizeBaseUrl(raw: string | undefined): string {
  // Default to relative "/api" so production same-origin requests work without configuration.
  const baseUrl = raw || "/api";

  // Strip any trailing slashes so `${apiBaseUrl}/resources` always
  // produces `/api/resources` — never `//resources`.
  return baseUrl.replace(/\/+$/, "");
}

function readEnv(): AppEnv {
  // Use VITE_API_BASE_URL (or legacy VITE_API_URL) as the source of truth for the API base URL.
  const apiBaseUrl = normalizeBaseUrl(
    import.meta.env.VITE_API_BASE_URL || (import.meta.env as unknown as { VITE_API_URL?: string }).VITE_API_URL
  );

  if (import.meta.env.DEV) {
    console.log("Resolved API URL:", apiBaseUrl);
  }

  const appName =
    import.meta.env.VITE_APP_NAME || "Admin Dashboard";

  // The Telegram bot username is used to build the deep-link URL
  // shown to operators. Optional — falls back to the production bot.
  const botUsername =
    import.meta.env.VITE_BOT_USERNAME ||
    "FreatEditzResources_Bot";

  return {
    apiBaseUrl,
    appName,
    botUsername,
  };
}

export const env: AppEnv = readEnv();
