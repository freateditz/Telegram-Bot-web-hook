/**
 * Lightweight, webhook-compatible Telegram Bot API client for Cloudflare Workers.
 *
 * Implements the exact same method signatures used by the bot handlers
 * (`sendMessage`, `copyMessage`, `sendDocument`, `answerCallbackQuery`,
 * `editMessageReplyMarkup`, `getChatMember`, `onText`, `on`), using native Web standard `fetch`.
 *
 * Avoids any Node.js streams, child processes, or long-polling dependencies.
 */
class TelegramBotClient {
    constructor(token, options = {}) {
        if (!token || typeof token !== "string" || !token.trim()) {
            throw new Error("Telegram bot token is required.");
        }
        this.token = token.trim();
        this.apiBase = options.apiBase || "https://api.telegram.org";
        this.textHandlers = [];
        this.eventHandlers = new Map();
    }

    /**
     * Redact bot token from strings and errors.
     */
    _sanitize(str) {
        if (!str || typeof str !== "string") return str;
        if (this.token) {
            return str.replaceAll(this.token, "[REDACTED_BOT_TOKEN]");
        }
        return str;
    }

    /**
     * Register a regex-based message listener (matches node-telegram-bot-api onText).
     */
    onText(regexp, handler) {
        this.textHandlers.push({ regexp, handler });
    }

    /**
     * Register an event listener (matches node-telegram-bot-api on).
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Call Telegram Bot API endpoint via standard HTTPS POST.
     */
    async apiCall(method, body = {}) {
        const url = `${this.apiBase}/bot${this.token}/${method}`;
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.ok) {
                const rawDesc = data.description || response.statusText || `HTTP ${response.status}`;
                const desc = this._sanitize(rawDesc);
                console.error(`[TelegramBot API] ${method} error: ${desc}`);
                const err = new Error(`Telegram API error (${method}): ${desc}`);
                err.code = data.error_code || response.status;
                err.description = desc;
                throw err;
            }

            return data.result;
        } catch (error) {
            error.message = this._sanitize(error.message);
            throw error;
        }
    }

    /**
     * Process an incoming Telegram update object from a webhook POST.
     */
    async processUpdate(update) {
        if (!update || typeof update !== "object") {
            return { ok: false, error: "Empty or invalid update payload" };
        }

        if (update.message) {
            const msg = update.message;
            const text = msg.text || "";

            // 1. Check regex text handlers (/start, etc.)
            let matched = false;
            for (const { regexp, handler } of this.textHandlers) {
                const match = text.match(regexp);
                if (match) {
                    matched = true;
                    await handler(msg, match);
                }
            }

            // 2. Dispatch to general message handlers
            const messageHandlers = this.eventHandlers.get("message") || [];
            for (const handler of messageHandlers) {
                await handler(msg);
            }

            return { ok: true, handled: "message", matched };
        }

        if (update.callback_query) {
            const query = update.callback_query;
            const callbackHandlers = this.eventHandlers.get("callback_query") || [];

            try {
                for (const handler of callbackHandlers) {
                    await handler(query);
                }
            } catch (handlerErr) {
                console.error(`[TelegramBot] Callback query handler error for query=${query.id}:`, this._sanitize(handlerErr.message));
                // Safety: ensure Telegram's spinner does not remain stuck
                try {
                    await this.answerCallbackQuery(query.id);
                } catch (_) {}
                throw handlerErr;
            }

            return { ok: true, handled: "callback_query" };
        }

        return { ok: true, handled: "ignored" };
    }

    /**
     * Send a text message.
     */
    async sendMessage(chatId, text, form = {}) {
        return this.apiCall("sendMessage", {
            chat_id: chatId,
            text,
            ...form,
        });
    }

    /**
     * Copy a message from one chat/channel to another.
     */
    async copyMessage(chatId, fromChatId, messageId, form = {}) {
        return this.apiCall("copyMessage", {
            chat_id: chatId,
            from_chat_id: fromChatId,
            message_id: Number(messageId),
            ...form,
        });
    }

    /**
     * Send a document by file_id or URL.
     */
    async sendDocument(chatId, document, form = {}) {
        return this.apiCall("sendDocument", {
            chat_id: chatId,
            document,
            ...form,
        });
    }

    /**
     * Answer an incoming callback query.
     */
    async answerCallbackQuery(callbackQueryId, form = {}) {
        try {
            return await this.apiCall("answerCallbackQuery", {
                callback_query_id: callbackQueryId,
                ...form,
            });
        } catch (err) {
            // If already answered or expired, don't crash caller flow
            if (/query is too old|query ID is invalid/i.test(err.message)) {
                return null;
            }
            throw err;
        }
    }

    /**
     * Edit an inline keyboard on an existing message.
     */
    async editMessageReplyMarkup(replyMarkup, form = {}) {
        return this.apiCall("editMessageReplyMarkup", {
            reply_markup: replyMarkup,
            ...form,
        });
    }

    /**
     * Get chat member information (for subscription verification).
     */
    async getChatMember(chatId, userId) {
        return this.apiCall("getChatMember", {
            chat_id: chatId,
            user_id: Number(userId),
        });
    }

    /**
     * Webhook management methods
     */
    async setWebhook(url, secretToken = null, allowedUpdates = null) {
        const body = { url };
        if (secretToken) body.secret_token = secretToken;
        if (allowedUpdates) body.allowed_updates = allowedUpdates;
        return this.apiCall("setWebhook", body);
    }

    async getWebhookInfo() {
        return this.apiCall("getWebhookInfo");
    }

    async deleteWebhook(dropPendingUpdates = false) {
        return this.apiCall("deleteWebhook", {
            drop_pending_updates: dropPendingUpdates,
        });
    }
}

module.exports = TelegramBotClient;
