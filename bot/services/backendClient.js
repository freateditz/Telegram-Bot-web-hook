const apiRoutes = require("../../shared/apiRoutes");

function getBaseUrl() {
    const raw = process.env.BACKEND_BASE_URL || globalThis.__WORKER_BASE_URL;
    if (raw) {
        return raw.replace(/\/+$/, "");
    }
    if (process.env.NODE_ENV === "production") {
        throw new Error("Configuration error: BACKEND_BASE_URL is not set in production environment.");
    }
    return `http://127.0.0.1:${process.env.PORT || process.env.BACKEND_PORT || 3000}`;
}

async function request(path, options = {}) {
    // If running inside combined Cloudflare Worker, dispatch in-process
    if (typeof globalThis.__INTERNAL_FETCH === "function") {
        const url = `https://worker-internal${path}`;
        const reqInit = {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
        };
        if (options.body && reqInit.method !== "GET" && reqInit.method !== "HEAD") {
            reqInit.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
        }

        const req = new Request(url, reqInit);

        const response = await globalThis.__INTERNAL_FETCH(req);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }

        return payload;
    }

    const url = `${getBaseUrl()}${path}`;
    try {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(`[backendClient] Request failed: ${options.method || 'GET'} ${url}`);
            console.error(`[backendClient] Status: ${response.status}`);
            console.error(`[backendClient] Payload:`, payload);
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }

        return payload;
    } catch (err) {
        console.error("--- Backend Request Error ---");
        console.error("Backend URL:", getBaseUrl());
        console.error("HTTP Method:", options.method || "GET");
        console.error("Endpoint:", path);
        console.error("Error:", err.message);
        console.error("Cause:", err.cause);
        console.error("Stack:", err.stack);
        if (options.body) {
            console.error("Request Body:", options.body);
        }
        console.error("-----------------------------");
        throw err;
    }
}

async function getVerificationPrompt() {
    return request(apiRoutes.verification.prompt);
}

async function getVerificationStatus(userId) {
    return request(apiRoutes.verification.status(userId));
}

async function listPlatforms() {
    const payload = await request(apiRoutes.platforms.list);
    return payload.items || [];
}

async function listCategories() {
    const payload = await request(apiRoutes.categories.list);
    return payload.items || [];
}

async function checkChannelMember(userId) {
    const payload = await request(apiRoutes.verification.checkMember, {
        method: "POST",
        body: JSON.stringify({ userId }),
    });

    return payload.joined;
}

async function markVerified(userId) {
    return request(apiRoutes.verification.markVerified, {
        method: "POST",
        body: JSON.stringify({ userId }),
    });
}

async function markUnverified(userId) {
    return request(apiRoutes.verification.unverify, {
        method: "POST",
        body: JSON.stringify({ userId }),
    });
}

async function listMenuResources(platform, category) {
    const payload = await request(apiRoutes.resources.menu(platform, category));
    return payload.items || [];
}

async function getResource(platform, slug) {
    const payload = await request(apiRoutes.resources.detail(platform, slug));
    return payload.item || null;
}

async function getResourceBySlug(slug) {
    const payload = await request(`/api/resources/slug/${slug}`);
    return payload.item || null;
}

async function getUserByTelegramId(telegramId) {
    try {
        const payload = await request(`/api/users/telegram/${telegramId}`);
        return payload?.item ?? null;
    } catch (err) {
        if (/User not found|404/i.test(err.message)) {
            return null;
        }
        throw err;
    }
}

async function upsertPendingProject(telegramId, projectId) {
    return request("/api/users/upsert-pending-project", {
        method: "POST",
        body: JSON.stringify({ telegramId, projectId }),
    });
}

async function clearPendingProject(telegramId) {
    return request("/api/users/clear-pending-project", {
        method: "POST",
        body: JSON.stringify({ telegramId }),
    });
}

async function upsertPendingResource(telegramId, slug) {
    return request("/api/users/upsert-pending-resource", {
        method: "POST",
        body: JSON.stringify({ telegramId, slug }),
    });
}

async function clearPendingResource(telegramId) {
    return request("/api/users/clear-pending-resource", {
        method: "POST",
        body: JSON.stringify({ telegramId }),
    });
}

async function trackAnalyticsEvent(eventData) {
    return request("/api/analytics/track", {
        method: "POST",
        body: JSON.stringify(eventData),
    });
}

module.exports = {
    request,
    getVerificationPrompt,
    getVerificationStatus,
    listPlatforms,
    listCategories,
    checkChannelMember,
    markVerified,
    markUnverified,
    listMenuResources,
    getResource,
    getResourceBySlug,
    getUserByTelegramId,
    upsertPendingProject,
    clearPendingProject,
    upsertPendingResource,
    clearPendingResource,
    trackAnalyticsEvent,
    getBaseUrl,
};
