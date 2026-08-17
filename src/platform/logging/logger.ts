import { isIP } from "node:net";

import { readServerEnvironment } from "@/platform/config/environment";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Readonly<Record<string, unknown>>;
type SanitizedValue =
  | boolean
  | number
  | string
  | null
  | SanitizedValue[]
  | { [key: string]: SanitizedValue };

const REDACTED = "[REDACTED]";
const MAX_SANITIZATION_DEPTH = 20;
const EMAIL_VALUE_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,63}\b/i;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveTokens = new Set([
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "cvc",
  "cvv",
  "email",
  "nonce",
  "passcode",
  "passphrase",
  "password",
  "phone",
  "pin",
  "secret",
  "signature",
  "ssn",
  "telephone",
  "token",
]);

const sensitiveFragments = [
  "authorization",
  "bankaccount",
  "birthdate",
  "bodytext",
  "cardholder",
  "cardnumber",
  "connectionstring",
  "contentbody",
  "credential",
  "databaseurl",
  "dateofbirth",
  "displayname",
  "email",
  "filename",
  "firstname",
  "fullname",
  "geolocation",
  "homeaddress",
  "honeypot",
  "invitationlink",
  "invitationurl",
  "invitelink",
  "inviteurl",
  "ipaddress",
  "lastname",
  "legalname",
  "mailingaddress",
  "mobilenumber",
  "oauthcode",
  "password",
  "passphrase",
  "phonenumber",
  "postalcode",
  "presignedurl",
  "privateurl",
  "rawbody",
  "requestbody",
  "requestcontext",
  "rawrequest",
  "responsebody",
  "routingnumber",
  "shippingaddress",
  "signedurl",
  "socialsecurity",
  "streetaddress",
  "telephone",
  "internalreviewnote",
  "storytext",
  "formdata",
  "relationshiptohabitat",
  "suggestedtitle",
  "useragent",
  "webhookurl",
  "zipcode",
] as const;

const keyMaterialQualifiers = new Set([
  "access",
  "api",
  "auth",
  "client",
  "credential",
  "crypto",
  "cryptographic",
  "decryption",
  "encryption",
  "hmac",
  "material",
  "pair",
  "private",
  "public",
  "secret",
  "service",
  "signing",
  "ssh",
  "storage",
  "webhook",
]);

function keyTokens(key: string) {
  return key
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Classifies fields that must never cross a log or bounded-audit boundary.
 * Identifier tokenization covers camelCase, snake_case, kebab-case, and
 * concatenated variants without treating benign plural metadata such as
 * `roleKeys` as cryptographic key material.
 */
export function isSensitiveFieldName(key: string) {
  const tokens = keyTokens(key);
  const compact = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();

  if (
    tokens.some((token) => sensitiveTokens.has(token)) ||
    sensitiveFragments.some((fragment) => compact.includes(fragment))
  ) {
    return true;
  }

  if (
    compact.includes("token") ||
    compact.includes("secret") ||
    compact.includes("cookie") ||
    /(?:auth|authentication).*(?:credential|data|header|material|payload|session|value)/.test(
      compact,
    ) ||
    /(?:pre)?signed.*(?:link|url)/.test(compact)
  ) {
    return true;
  }

  if (
    compact === "auth" ||
    compact === "authentication" ||
    compact === "dsn" ||
    compact === "document" ||
    compact === "iban" ||
    compact === "ip" ||
    compact === "ips" ||
    compact === "ipv4" ||
    compact === "ipv6" ||
    compact === "mobile" ||
    compact === "mobiles" ||
    compact === "name" ||
    compact === "rawbody" ||
    compact === "swift"
  ) {
    return true;
  }

  if (
    tokens.includes("address") ||
    tokens.includes("addresses") ||
    tokens.includes("document") ||
    tokens.includes("mobile") ||
    tokens.includes("mobiles") ||
    tokens.includes("ssn") ||
    tokens.includes("useragent")
  ) {
    return true;
  }

  if (
    tokens.includes("ip") ||
    /^(?:client|remote|source|forwarded|xforwarded)ip(?:address|v[46])?$/.test(
      compact,
    ) ||
    compact === "forwardedfor" ||
    compact === "xforwardedfor"
  ) {
    return true;
  }

  const keyIndex = tokens.indexOf("key");
  if (
    compact === "key" ||
    (keyIndex >= 0 &&
      tokens.some((token) => keyMaterialQualifiers.has(token))) ||
    /(?:access|api|auth|client|credential|crypto|cryptographic|decryption|encryption|hmac|private|public|secret|service|signing|ssh|storage|webhook)key(?:data|material|value)?/.test(
      compact,
    ) ||
    compact.includes("keymaterial")
  ) {
    return true;
  }

  return false;
}

function isSensitiveUrl(value: string) {
  const trimmed = value.trim();
  const looksLikeUrl =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("/");
  if (!looksLikeUrl) return false;

  try {
    const url = new URL(trimmed, "https://redaction.invalid");
    if (url.username || url.password) return true;

    const normalizedPath = url.pathname.toLowerCase();
    if (
      /\/(?:admin\/)?invitations?(?:\/|$)/.test(normalizedPath) ||
      /\/(?:invite|invitation)(?:\/|$)/.test(normalizedPath)
    ) {
      return true;
    }

    for (const key of url.searchParams.keys()) {
      const compactKey = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
      if (
        isSensitiveFieldName(key) ||
        [
          "code",
          "keypairid",
          "policy",
          "sig",
          "state",
          "xamzcredential",
          "xamzsignature",
          "xgoogcredential",
          "xgoogsignature",
        ].includes(compactKey)
      ) {
        return true;
      }
    }

    const normalizedHash = url.hash.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
    return ["authorization", "credential", "secret", "signature", "token"].some(
      (fragment) => normalizedHash.includes(fragment),
    );
  } catch {
    return false;
  }
}

function containsSensitiveUrl(value: string) {
  if (isSensitiveUrl(value)) return true;

  const embeddedUrls = value.match(/[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi);
  return embeddedUrls?.some((candidate) => isSensitiveUrl(candidate)) ?? false;
}

function sanitizeString(value: string) {
  const trimmed = value.trim();
  if (
    containsSensitiveUrl(value) ||
    EMAIL_VALUE_PATTERN.test(value) ||
    isIP(trimmed) !== 0 ||
    /^\s*(?:basic|bearer|digest)\s+\S+/i.test(value)
  ) {
    return REDACTED;
  }
  return value;
}

export function isSensitiveStringValue(value: string) {
  return sanitizeString(value) === REDACTED;
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): SanitizedValue {
  if (depth > MAX_SANITIZATION_DEPTH) return "[TRUNCATED]";
  if (value === null) return null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return "[UNSERIALIZABLE]";
  if (value instanceof Error) return "[REDACTED_ERROR]";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof URL) return sanitizeString(value.toString());
  if (seen.has(value)) return "[CIRCULAR]";

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeValue(entry, seen, depth + 1));
    }

    const sanitized: Record<string, SanitizedValue> = Object.create(null);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (isSensitiveFieldName(key)) {
        sanitized[key] = REDACTED;
      } else if ("value" in descriptor) {
        sanitized[key] = sanitizeValue(descriptor.value, seen, depth + 1);
      } else {
        sanitized[key] = "[ACCESSOR]";
      }
    }
    return sanitized;
  } catch {
    return "[UNSERIALIZABLE]";
  } finally {
    seen.delete(value);
  }
}

function sanitize(context: LogContext) {
  const sanitized = sanitizeValue(context, new WeakSet(), 0);
  return typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized
    : {};
}

function write(level: LogLevel, event: string, context: LogContext = {}) {
  const configuredLevel = readServerEnvironment().logLevel;
  if (levelOrder[level] < levelOrder[configuredLevel]) return;

  const payload = JSON.stringify({
    ...sanitize(context),
    timestamp: new Date().toISOString(),
    level,
    event: sanitizeString(event),
  });

  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export const logger = {
  debug: (event: string, context?: LogContext) =>
    write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
};
