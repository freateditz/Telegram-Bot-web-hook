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
    if (typeof globalThis.__INTERNAL_FETCH === "function") {
        const url = `https://worker-internal${path}`;
        const req = new Request(url, {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            body: options.body,
        });

        const response = await globalThis.__INTERNAL_FETCH(req);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || `Request failed: ${response.status}`);
        }

        return payload;
    }

    const response = await fetch(`${getBaseUrl()}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || `Request failed: ${response.status}`);
    }

    return payload;
}

async function getProject(slug) {
    const payload = await request(apiRoutes.projects.detail(slug));
    return payload.item || null;
}

async function getProjectById(id) {
    const payload = await request(apiRoutes.projects.byId(id));
    return payload.item || null;
}

async function getProjectDelivery(slug) {
    return request(apiRoutes.projects.delivery(slug));
}

module.exports = {
    getProject,
    getProjectById,
    getProjectDelivery,
    getBaseUrl,
};
