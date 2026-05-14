const crypto = require("node:crypto");

const SUPABASE_REST_PATH = "/rest/v1";
const SUPABASE_AUTH_USER_PATH = "/auth/v1/user";
const SUPABASE_TIMEOUT_MS = 15000;
const DEFAULT_SHARE_DAYS = 7;
const MAX_SHARE_DAYS = 30;

class HttpError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name];
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "");
}

function extractBearerToken(req) {
  const authorization = getHeader(req, "authorization");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new HttpError(500, "missing_server_env", `Missing required server environment variables: ${missing.join(", ")}.`);
  }

  return { supabaseUrl, serviceRoleKey, publicAppUrl };
}

function parseJsonMaybe(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function getPayloadMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload || fallback;
  return String(
    payload.message ||
    payload.msg ||
    payload.error_description ||
    payload.error?.message ||
    payload.error ||
    fallback
  ).trim() || fallback;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SUPABASE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString("utf8").trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (_) {
      throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_) {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function supabaseRequest(config, path, options = {}) {
  const url = new URL(`${config.supabaseUrl}${SUPABASE_REST_PATH}/${path}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: "application/json"
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  const response = await fetchWithTimeout(url, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const payload = parseJsonMaybe(await response.text());
  if (!response.ok) {
    throw new HttpError(
      response.status,
      "supabase_request_failed",
      getPayloadMessage(payload, "Supabase request failed."),
      payload
    );
  }

  return payload;
}

async function verifyUser(config, accessToken) {
  const response = await fetchWithTimeout(`${config.supabaseUrl}${SUPABASE_AUTH_USER_PATH}`, {
    method: "GET",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  const payload = parseJsonMaybe(await response.text());
  if (!response.ok) {
    throw new HttpError(401, "invalid_auth_token", getPayloadMessage(payload, "Invalid or expired Supabase session."));
  }

  const userId = String(payload?.id || "").trim();
  if (!userId) {
    throw new HttpError(401, "invalid_auth_token", "Invalid or expired Supabase session.");
  }

  return {
    id: userId,
    email: String(payload?.email || "").trim().toLowerCase()
  };
}

async function loadOne(config, table, query) {
  const rows = await supabaseRequest(config, table, {
    query: {
      ...query,
      limit: 1
    }
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function normalizeProjectRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "editor") return "editor";
  return "viewer";
}

function normalizeGlobalRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "owner") return "owner";
  if (normalized === "admin") return "admin";
  if (normalized === "editor") return "editor";
  return "viewer";
}

async function verifySharePermission(config, user, projectId) {
  const [profile, membership, project] = await Promise.all([
    loadOne(config, "profiles", {
      select: "user_id,email,role",
      user_id: `eq.${user.id}`
    }),
    loadOne(config, "project_memberships", {
      select: "project_id,user_id,role",
      project_id: `eq.${projectId}`,
      user_id: `eq.${user.id}`
    }),
    loadOne(config, "projects", {
      select: "project_id,name",
      project_id: `eq.${projectId}`
    })
  ]);

  if (!project) {
    throw new HttpError(404, "project_not_found", "Project not found.");
  }

  const globalRole = normalizeGlobalRole(profile?.role);
  const projectRole = normalizeProjectRole(membership?.role);
  const canCreateShareLink = globalRole === "owner" || globalRole === "admin" || projectRole === "admin";

  if (!canCreateShareLink) {
    throw new HttpError(403, "share_link_forbidden", "Project admin access is required to create a public overview link.");
  }

  return { profile, membership, project };
}

function normalizeDurationDays(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_SHARE_DAYS;
  return Math.min(MAX_SHARE_DAYS, Math.max(1, Math.round(numeric)));
}

function createRawToken() {
  return crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""), "utf8")
    .digest("hex");
}

function getRequestOrigin(req, config) {
  if (config.publicAppUrl) return config.publicAppUrl;

  const proto = getHeader(req, "x-forwarded-proto") || "https";
  const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host");
  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function publicErrorPayload(error) {
  return {
    code: error?.code || "request_failed",
    message: error?.message || "Request failed."
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Only POST is supported."
      }
    });
  }

  try {
    const config = getConfig();
    const accessToken = extractBearerToken(req);
    if (!accessToken) {
      throw new HttpError(401, "missing_auth_token", "Authorization bearer token is required.");
    }

    const body = await readBody(req);
    const projectId = String(body?.projectId || body?.project_id || "").trim();
    if (!projectId) {
      throw new HttpError(400, "missing_project_id", "projectId is required.");
    }

    const user = await verifyUser(config, accessToken);
    const { project } = await verifySharePermission(config, user, projectId);
    const durationDays = normalizeDurationDays(body?.durationDays || body?.duration_days);
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    const token = createRawToken();
    const tokenHash = hashToken(token);
    const label = String(body?.label || "7-day public overview").trim().slice(0, 120) || null;

    const rows = await supabaseRequest(config, "project_share_links", {
      method: "POST",
      prefer: "return=representation",
      body: {
        project_id: projectId,
        token_hash: tokenHash,
        created_by: user.id,
        expires_at: expiresAt,
        revoked_at: null,
        scope: "overview",
        label
      }
    });

    const linkRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const origin = getRequestOrigin(req, config);
    const shareUrl = `${origin}/share.html?t=${encodeURIComponent(token)}`;

    return json(res, 200, {
      ok: true,
      share: {
        id: linkRow?.id || null,
        project_id: projectId,
        project_name: project?.name || projectId,
        scope: "overview",
        expires_at: expiresAt,
        url: shareUrl
      }
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return json(res, statusCode, {
      ok: false,
      share: null,
      error: publicErrorPayload(error)
    });
  }
};
