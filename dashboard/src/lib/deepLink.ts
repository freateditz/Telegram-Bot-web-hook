/**
 * Universal Telegram Deep Link Generator for Dashboard
 *
 * Centralizes deep-link generation using the verified working domain: `https://telegram.me`.
 *
 * Formats:
 *   Resource: https://telegram.me/FreatEditzResources_Bot?start=resource_<slug>
 *   Project:  https://telegram.me/FreatEditzResources_Bot?start=project_<slug>
 */

import { env } from "@/config/env";

export const TELEGRAM_BOT_BASE_URL = "https://telegram.me";
export const DEFAULT_BOT_USERNAME = "FreatEditzResources_Bot";

/**
 * Clean a bot username by trimming whitespace and removing leading '@'.
 */
export function cleanBotUsername(botUsername?: string): string {
  const raw = (botUsername || env.botUsername || DEFAULT_BOT_USERNAME).trim();
  return raw.replace(/^@+/, "");
}

/**
 * Generate a Telegram bot deep link for a downloadable resource.
 *
 * @param slug - The resource slug (e.g., "topaz-windows")
 * @param botUsername - Optional bot username (defaults to env.botUsername / FreatEditzResources_Bot)
 */
export function buildResourceDeepLink(
  slug: string | null | undefined,
  botUsername: string = env.botUsername
): string {
  const cleanSlug = (slug || "").trim();
  const bot = cleanBotUsername(botUsername);
  return `${TELEGRAM_BOT_BASE_URL}/${bot}?start=resource_${cleanSlug || "..."}`;
}

/**
 * Generate a Telegram bot deep link for a deliverable project.
 *
 * @param slug - The project slug (e.g., "text-effect-in-60sec")
 * @param botUsername - Optional bot username (defaults to env.botUsername / FreatEditzResources_Bot)
 */
export function buildProjectDeepLink(
  slug: string | null | undefined,
  botUsername: string = env.botUsername
): string {
  const cleanSlug = (slug || "").trim();
  const bot = cleanBotUsername(botUsername);
  return `${TELEGRAM_BOT_BASE_URL}/${bot}?start=project_${cleanSlug || "..."}`;
}

/**
 * Helper to test whether a URL is a bot deep link.
 */
export function isTelegramBotDeepLink(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /^(https?:\/\/)?(t\.me|telegram\.me)\/[A-Za-z0-9_]+\?start=(resource_|project_)[A-Za-z0-9_-]+$/i.test(
    url.trim()
  );
}

/**
 * Safely migrate any legacy t.me bot deep link to telegram.me without altering
 * channel links, YouTube links, or external download links.
 */
export function migrateBotDeepLinkDomain(url: string): string {
  if (!isTelegramBotDeepLink(url)) {
    return url;
  }
  return url.replace(/^https?:\/\/t\.me\//i, `${TELEGRAM_BOT_BASE_URL}/`);
}
