export function formatCurrency(value = 0) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function parseIsoDateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function createUtcDateFromIsoDate(value) {
  const parts = parseIsoDateParts(value);
  if (!parts) return null;

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function isIsoDate(value) {
  return Boolean(parseIsoDateParts(value));
}

export function formatDate(value) {
  if (!value) return "-";

  if (isIsoDate(value)) {
    const date = createUtcDateFromIsoDate(value);
    if (!date) return String(value);

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "-";

  if (isIsoDate(value)) {
    return formatDate(value);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function createId(prefix = "ID") {
  const seed = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${seed}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

export function includesText(parts, query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  return parts.some((part) => normalizeText(part).includes(normalizedQuery));
}

export function getInitials(value = "") {
  const words = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "PK";

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function sha256Hex(value) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(String(value));
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
