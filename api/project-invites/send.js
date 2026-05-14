const SUPABASE_REST_PATH = "/rest/v1";
const SUPABASE_AUTH_USER_PATH = "/auth/v1/user";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const PROVIDER_TIMEOUT_MS = 15000;
const SUPABASE_TIMEOUT_MS = 15000;

class HttpError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class DeliveryError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
    this.details = details;
  }
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
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

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new HttpError(
      500,
      "missing_server_env",
      `Missing required server environment variables: ${missing.join(", ")}.`
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    resendApiKey: String(process.env.RESEND_API_KEY || "").trim(),
    inviteEmailFrom: String(process.env.INVITE_EMAIL_FROM || "").trim(),
    twilioAccountSid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
    twilioAuthToken: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
    twilioFromNumber: String(process.env.TWILIO_FROM_NUMBER || "").trim(),
    publicAppUrl: String(process.env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "")
  };
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
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

function normalizeProjectRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "editor") return "editor";
  return "viewer";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizePhoneForStorage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let hasPlusPrefix = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  let normalizedDigits = digits;
  if (!hasPlusPrefix) {
    if (digits.length === 10) {
      normalizedDigits = `1${digits}`;
      hasPlusPrefix = true;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      normalizedDigits = digits;
      hasPlusPrefix = true;
    }
  }

  if (!hasPlusPrefix && normalizedDigits.length >= 8 && normalizedDigits.length <= 15) {
    hasPlusPrefix = true;
  }

  return hasPlusPrefix ? `+${normalizedDigits}` : normalizedDigits;
}

function normalizeRequestPayload(body) {
  const projectId = String(body?.projectId || body?.project_id || "").trim();
  const targetType = String(body?.targetType || body?.target_type || "").trim().toLowerCase();
  const role = normalizeProjectRole(body?.role);
  const rawTargetValue = String(body?.targetValue || body?.target_value || "").trim();

  if (!projectId) {
    throw new HttpError(400, "missing_project_id", "projectId is required.");
  }

  if (targetType !== "email" && targetType !== "phone") {
    throw new HttpError(400, "invalid_target_type", "targetType must be email or phone.");
  }

  const targetEmail = targetType === "email" ? normalizeEmail(rawTargetValue) : null;
  const targetPhone = targetType === "phone" ? normalizePhoneForStorage(rawTargetValue) : null;

  if (targetType === "email" && !isLikelyEmail(targetEmail)) {
    throw new HttpError(400, "invalid_email", "Enter a valid invite email.");
  }

  if (targetType === "phone" && !/^\+\d{8,15}$/.test(targetPhone || "")) {
    throw new HttpError(400, "invalid_phone", "Enter a valid invite phone in E.164 format.");
  }

  return {
    projectId,
    targetType,
    targetValue: targetType === "phone" ? targetPhone : targetEmail,
    targetEmail,
    targetPhone,
    role,
    deliveryChannel: targetType === "phone" ? "sms" : "email",
    deliveryProvider: targetType === "phone" ? "twilio" : "resend"
  };
}

async function supabaseRequest(config, path, options = {}) {
  const url = new URL(`${config.supabaseUrl}${SUPABASE_REST_PATH}/${path}`);
  const query = options.query || {};
  Object.entries(query).forEach(([key, value]) => {
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
  }, SUPABASE_TIMEOUT_MS);

  const text = await response.text();
  const payload = parseJsonMaybe(text);

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
  }, SUPABASE_TIMEOUT_MS);

  const text = await response.text();
  const payload = parseJsonMaybe(text);

  if (!response.ok) {
    throw new HttpError(
      401,
      "invalid_auth_token",
      getPayloadMessage(payload, "Invalid or expired Supabase session."),
      null
    );
  }

  const userId = String(payload?.id || "").trim();
  if (!userId) {
    throw new HttpError(401, "invalid_auth_token", "Invalid or expired Supabase session.");
  }

  return {
    id: userId,
    email: normalizeEmail(payload?.email || "")
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

async function verifyInvitePermission(config, user, projectId) {
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

  const globalRole = String(profile?.role || "").trim().toLowerCase();
  const projectRole = String(membership?.role || "").trim().toLowerCase();
  const isOrgAdmin = globalRole === "owner" || globalRole === "admin";
  const isProjectAdmin = projectRole === "admin";

  if (!isOrgAdmin && !isProjectAdmin) {
    throw new HttpError(403, "invite_forbidden", "You do not have permission to invite users to this project.");
  }

  return {
    profile,
    membership,
    project
  };
}

function isMissingColumnError(error, columnName) {
  const haystack = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
    error?.details
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const normalizedColumn = String(columnName || "").toLowerCase();
  return haystack.includes(normalizedColumn) && (
    haystack.includes("column") ||
    haystack.includes("schema cache") ||
    haystack.includes("could not find") ||
    haystack.includes("does not exist")
  );
}

function isMissingDeliveryColumnError(error) {
  return [
    "delivery_channel",
    "delivery_status",
    "delivery_error",
    "delivery_provider",
    "provider_message_id",
    "sent_at"
  ].some(columnName => isMissingColumnError(error, columnName));
}

function stripDeliveryFields(payload) {
  const copy = { ...payload };
  delete copy.delivery_channel;
  delete copy.delivery_status;
  delete copy.delivery_error;
  delete copy.delivery_provider;
  delete copy.provider_message_id;
  delete copy.sent_at;
  return copy;
}

async function findExistingInvite(config, invite) {
  const targetQuery = invite.targetType === "phone"
    ? { target_phone: `eq.${invite.targetPhone}` }
    : { or: `(target_email.eq.${invite.targetEmail},email.eq.${invite.targetEmail})` };

  const rows = await supabaseRequest(config, "project_invites", {
    query: {
      select: "*",
      project_id: `eq.${invite.projectId}`,
      invite_target_type: `eq.${invite.targetType}`,
      accepted_at: "is.null",
      revoked_at: "is.null",
      ...targetQuery,
      order: "created_at.desc",
      limit: 1
    }
  });

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function writeInvite(config, invite, user) {
  const payload = {
    project_id: invite.projectId,
    role: invite.role,
    invited_by: user.id,
    invite_target_type: invite.targetType,
    target_email: invite.targetEmail,
    target_phone: invite.targetPhone,
    email: invite.targetEmail,
    status: "pending",
    accepted_at: null,
    revoked_at: null,
    accepted_by_user_id: null,
    delivery_channel: invite.deliveryChannel,
    delivery_status: "not_sent",
    delivery_error: null,
    delivery_provider: invite.deliveryProvider,
    provider_message_id: null,
    sent_at: null
  };

  const existingInvite = await findExistingInvite(config, invite);
  const writeOptions = existingInvite?.id
    ? {
        method: "PATCH",
        query: {
          id: `eq.${existingInvite.id}`
        },
        prefer: "return=representation",
        body: payload
      }
    : {
        method: "POST",
        prefer: "return=representation",
        body: payload
      };

  try {
    const rows = await supabaseRequest(config, "project_invites", writeOptions);
    return {
      invite: Array.isArray(rows) && rows.length > 0 ? rows[0] : { ...existingInvite, ...payload },
      deliveryColumnsAvailable: true
    };
  } catch (error) {
    if (!isMissingDeliveryColumnError(error)) {
      throw error;
    }

    const retryOptions = {
      ...writeOptions,
      body: stripDeliveryFields(payload)
    };
    const rows = await supabaseRequest(config, "project_invites", retryOptions);
    return {
      invite: {
        ...(Array.isArray(rows) && rows.length > 0 ? rows[0] : { ...existingInvite, ...stripDeliveryFields(payload) }),
        delivery_channel: invite.deliveryChannel,
        delivery_status: "not_sent",
        delivery_error: null,
        delivery_provider: invite.deliveryProvider,
        provider_message_id: null,
        sent_at: null
      },
      deliveryColumnsAvailable: false
    };
  }
}

async function updateInviteDelivery(config, inviteId, deliveryFields, deliveryColumnsAvailable) {
  if (!inviteId || !deliveryColumnsAvailable) {
    return null;
  }

  const rows = await supabaseRequest(config, "project_invites", {
    method: "PATCH",
    query: {
      id: `eq.${inviteId}`
    },
    prefer: "return=representation",
    body: deliveryFields
  });

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function requireDeliveryEnv(config, channel) {
  const missing = [];

  if (!config.publicAppUrl) missing.push("PUBLIC_APP_URL");

  if (channel === "email") {
    if (!config.resendApiKey) missing.push("RESEND_API_KEY");
    if (!config.inviteEmailFrom) missing.push("INVITE_EMAIL_FROM");
  } else {
    if (!config.twilioAccountSid) missing.push("TWILIO_ACCOUNT_SID");
    if (!config.twilioAuthToken) missing.push("TWILIO_AUTH_TOKEN");
    if (!config.twilioFromNumber) missing.push("TWILIO_FROM_NUMBER");
  }

  if (missing.length > 0) {
    throw new DeliveryError(
      "missing_provider_env",
      `Missing required ${channel} delivery environment variables: ${missing.join(", ")}.`
    );
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

async function sendEmailInvite(config, invite, project) {
  requireDeliveryEnv(config, "email");

  const projectName = String(project?.name || invite.projectId).trim() || invite.projectId;
  const subject = `You've been invited to ${projectName}`;
  const text = [
    `You've been invited to ${projectName} as ${invite.role}.`,
    "",
    `Open the app: ${config.publicAppUrl}`,
    "",
    "Sign in with this email to accept the invite.",
    "Access is controlled by account email."
  ].join("\n");
  const html = [
    `<p>You've been invited to <strong>${escapeHtml(projectName)}</strong> as <strong>${escapeHtml(invite.role)}</strong>.</p>`,
    `<p><a href="${escapeHtml(config.publicAppUrl)}">Open the app</a></p>`,
    "<p>Sign in with this email to accept the invite.</p>",
    "<p>Access is controlled by account email.</p>"
  ].join("");

  const response = await fetchWithTimeout(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      from: config.inviteEmailFrom,
      to: invite.targetEmail,
      subject,
      text,
      html
    })
  }, PROVIDER_TIMEOUT_MS);

  const payload = parseJsonMaybe(await response.text());
  if (!response.ok) {
    throw new DeliveryError("resend_send_failed", getPayloadMessage(payload, "Resend email delivery failed."), payload);
  }

  return String(payload?.id || "").trim() || null;
}

async function sendSmsInvite(config, invite, project) {
  requireDeliveryEnv(config, "sms");

  const projectName = truncateText(String(project?.name || invite.projectId).trim() || invite.projectId, 60);
  const body = `${projectName}: project invite. ${config.publicAppUrl} Sign in and add this phone number to accept your project invite.`;
  const form = new URLSearchParams({
    To: invite.targetPhone,
    From: config.twilioFromNumber,
    Body: body
  });

  const response = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: form.toString()
    },
    PROVIDER_TIMEOUT_MS
  );

  const payload = parseJsonMaybe(await response.text());
  if (!response.ok) {
    throw new DeliveryError("twilio_send_failed", getPayloadMessage(payload, "Twilio SMS delivery failed."), payload);
  }

  return String(payload?.sid || "").trim() || null;
}

async function sendInviteNotification(config, invite, project) {
  if (invite.targetType === "phone") {
    return await sendSmsInvite(config, invite, project);
  }

  return await sendEmailInvite(config, invite, project);
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
    const token = extractBearerToken(req);
    if (!token) {
      throw new HttpError(401, "missing_auth_token", "Authorization bearer token is required.");
    }

    const body = await readBody(req);
    const invite = normalizeRequestPayload(body);
    const user = await verifyUser(config, token);
    const { project } = await verifyInvitePermission(config, user, invite.projectId);
    const written = await writeInvite(config, invite, user);

    let deliveryStatus = "sent";
    let providerMessageId = null;
    let deliveryError = null;
    let deliveryUpdateError = written.deliveryColumnsAvailable
      ? null
      : "Delivery tracking columns are missing; delivery status was not persisted.";

    try {
      providerMessageId = await sendInviteNotification(config, invite, project);
    } catch (error) {
      deliveryStatus = "failed";
      deliveryError = error?.message || "Invite delivery failed.";
    }

    const deliveryFields = {
      delivery_channel: invite.deliveryChannel,
      delivery_status: deliveryStatus,
      delivery_error: deliveryError,
      delivery_provider: invite.deliveryProvider,
      provider_message_id: providerMessageId,
      sent_at: deliveryStatus === "sent" ? new Date().toISOString() : null
    };

    let deliveryInvite = null;
    try {
      deliveryInvite = await updateInviteDelivery(
        config,
        written.invite?.id,
        deliveryFields,
        written.deliveryColumnsAvailable
      );
    } catch (error) {
      deliveryUpdateError = error?.message || "Delivery status update failed.";
    }

    const responseInvite = {
      ...written.invite,
      ...deliveryFields,
      ...(deliveryInvite || {})
    };

    return json(res, 200, {
      ok: true,
      invite: responseInvite,
      delivery_status: deliveryStatus,
      delivery_channel: invite.deliveryChannel,
      delivery_provider: invite.deliveryProvider,
      provider_message_id: providerMessageId,
      error: deliveryError,
      warning: deliveryUpdateError
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return json(res, statusCode, {
      ok: false,
      invite: null,
      delivery_status: "failed",
      delivery_channel: null,
      provider_message_id: null,
      error: publicErrorPayload(error)
    });
  }
};
